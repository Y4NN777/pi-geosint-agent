/**
 * Geo-OSINT stage driver — orchestrates the 4-stage pipeline.
 *
 * Stages 01 and 02 optionally construct a pi Agent for LLM-assisted
 * disambiguation and candidate pruning. Stages 03 and 04 are
 * deterministic loops calling geo-tools functions directly.
 *
 * Every import from @earendil-works/pi-agent-core is gated to
 * Agent-backed stages only (01, 02). Deterministic stages never
 * touch it.
 */

import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import {
	captureDirect,
	captureRender,
	checkGeohashHistory,
	type DiscoverResult,
	geohash7,
	kartaviewDiscover,
	type PhotoRecord,
	type ReverseGeocodeInput,
	reverseGeocode,
	type StoreEvidenceInput,
	type StoreEvidenceResult,
	storeEvidence,
} from "@y4nn777/geo-tools";
import { type CorrectionEntry, logCorrection, openCorrectionsDb, openIndexDb } from "./memory-store.ts";
import { assembleSystemPrompt } from "./workspace-loader.ts";

// ── Pipeline Result Types ──────────────────────────────────────────────

/**
 * Result of stage 01 (resolve).
 * Extends ReverseGeocodeResult with the original coordinates.
 */
export interface ResolveResult {
	address: string;
	confidence: number;
	lat: number;
	lon: number;
	alternates?: Array<{ address: string; confidence: number }>;
}

/**
 * Annotated candidate record produced by stage 02's agent pass.
 */
export interface CandidateRecord extends PhotoRecord {
	needsRender: boolean;
	agentAnnotation: string | null;
}

/**
 * Result of stage 02 (discover).
 * Extends DiscoverResult with agent-annotated candidates and richer stats.
 */
export interface DiscoverStageResult {
	queryPoint: { lat: number; lon: number };
	radiusMeters: number;
	candidates: CandidateRecord[];
	stats: {
		totalDiscovered: number;
		flagged: number;
		previouslyCaptured: number;
		recommendedForCapture: number;
	};
}

/**
 * Single capture output record.
 */
export interface CaptureRecord {
	photoId: number;
	sequenceId: number;
	path: string;
	sha256: string;
	sizeBytes: number;
	captureMethod: "direct" | "render";
	status: "success" | "failed";
	error: string | null;
}

/**
 * Result of stage 03 (capture).
 */
export interface CaptureStageResult {
	captures: CaptureRecord[];
	stats: {
		total: number;
		succeeded: number;
		failed: number;
		totalBytes: number;
	};
}

/**
 * Single stored evidence record.
 */
export interface StoredRecord {
	photoId: number;
	path: string;
	sidecarPath: string;
	sha256: string;
	geohash7: string;
	sizeBytes: number;
}

/**
 * Result of stage 04 (store).
 */
export interface StoreStageResult {
	stored: StoredRecord[];
	stats: {
		totalStored: number;
		totalBytes: number;
		correctionsLogged: number;
	};
}

// ── Configuration ──────────────────────────────────────────────────────

/**
 * Model and API key resolution for Agent-backed stages.
 */
export interface AgentConfig {
	model: Model<any>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

/**
 * Common stage configuration.
 */
export interface StageContext {
	/** Absolute path to the workspace/ directory. */
	workspaceRoot: string;
	/** Agent model + key resolution for LLM-backed stages. */
	agentConfig?: AgentConfig;
	/** Storage root for evidence files (default: './evidence'). */
	storageRoot?: string;
}

// ── Stage 01 — Resolve ─────────────────────────────────────────────────

/**
 * Run stage 01: reverse-geocode coordinates.
 *
 * Fast path (no alternates): returns the geocode result directly.
 * Agent path (ambiguous): constructs an Agent to disambiguate.
 *
 * @param coords - Coordinates to resolve.
 * @param ctx - Stage context with workspace root and optional agent config.
 * @returns ResolveResult with address and confidence.
 */
export async function runStage01(coords: ReverseGeocodeInput, ctx: StageContext): Promise<ResolveResult> {
	const geoResult = await reverseGeocode(coords);

	if (!geoResult.alternates || geoResult.alternates.length === 0) {
		// Fast path — no ambiguity
		return {
			address: geoResult.address,
			confidence: geoResult.confidence,
			lat: coords.lat,
			lon: coords.lon,
		};
	}

	// Agent path — disambiguate with LLM
	const systemPrompt = assembleSystemPrompt(ctx.workspaceRoot, "01_resolve");
	const agent = new Agent({
		initialState: {
			systemPrompt,
			model: ctx.agentConfig?.model,
		},
		getApiKey: ctx.agentConfig?.getApiKey,
	});

	const disambiguationPrompt = `The geocoder returned multiple possible addresses for coordinates (${coords.lat}, ${coords.lon}).

Primary result: "${geoResult.address}" (confidence: ${geoResult.confidence})

Alternates:
${geoResult.alternates.map((a, i) => `  ${i + 1}. "${a.address}" (confidence: ${a.confidence})`).join("\n")}

Please analyze these results and decide which address is most likely correct based on the coordinates. If you cannot determine a clear winner, state that and defer to the human.`;

	await agent.prompt(disambiguationPrompt);
	await agent.waitForIdle();

	// Agent's last message or fallback
	const lastMsg = agent.state.messages[agent.state.messages.length - 1];
	const resolvedByAgent =
		lastMsg?.role === "assistant" && lastMsg.content?.[0]?.type === "text" ? lastMsg.content[0].text : undefined;

	return {
		address: geoResult.address,
		confidence: resolvedByAgent ? Math.min(geoResult.confidence + 0.1, 1.0) : geoResult.confidence,
		lat: coords.lat,
		lon: coords.lon,
		alternates: geoResult.alternates,
	};
}

// ── Stage 02 — Discover ────────────────────────────────────────────────

/**
 * Run stage 02: discover KartaView photos near the resolved location.
 *
 * Calls kartaviewDiscover, then constructs an Agent with
 * checkGeohashHistory tool to prune and annotate the candidate list.
 *
 * @param location - Resolved location from stage 01.
 * @param options - Discovery parameters.
 * @param ctx - Stage context.
 * @returns DiscoverStageResult with annotated candidates.
 */
export async function runStage02(
	location: { address: string; lat: number; lon: number; confidence: number },
	options: { radiusMeters: number; authToken?: string },
	ctx: StageContext,
): Promise<DiscoverStageResult> {
	// Step 1: raw discovery from KartaView
	const rawResult: DiscoverResult = await kartaviewDiscover({
		lat: location.lat,
		lon: location.lon,
		radiusMeters: options.radiusMeters,
		authToken: options.authToken,
	});

	// Step 2: check geohash history for prior captures
	const storageRoot = ctx.storageRoot ?? "./evidence";
	let previouslyCapturedCount = 0;
	try {
		const db = openIndexDb(storageRoot);
		const gh7 = geohash7(location.lat, location.lon);
		const rows = db.prepare("SELECT COUNT(*) as cnt FROM evidence WHERE geohash7 = ?").get(gh7) as
			| { cnt: number }
			| undefined;
		previouslyCapturedCount = rows?.cnt ?? 0;
		db.close();
	} catch {
		// DB may not exist yet — fine
	}

	// Step 3: agent pruning if we have agent config
	const systemPrompt = assembleSystemPrompt(ctx.workspaceRoot, "02_discover");
	const geohashHistoryTool: AgentTool<any> = {
		name: "check_geohash_history",
		label: "Check geohash history",
		description: "Query the evidence index for prior captures near a geohash prefix.",
		parameters: {
			type: "object",
			properties: {
				geohash: { type: "string" },
			},
			required: ["geohash"],
		} as any,
		execute: async (_toolCallId: string, params: unknown) => {
			const { geohash } = params as { geohash: string };
			const records = checkGeohashHistory({ geohash, radiusBuckets: 1 });
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							records.length > 0
								? records.map((r) => ({ capturedAt: r.capturedAt, path: r.path }))
								: { message: "No prior captures found for this area." },
						),
					},
				],
				details: records,
			};
		},
	};

	const candidates: CandidateRecord[] = [];
	let recommendedForCapture = 0;

	if (ctx.agentConfig) {
		const agent = new Agent({
			initialState: {
				systemPrompt,
				model: ctx.agentConfig.model,
				tools: [geohashHistoryTool],
			},
			getApiKey: ctx.agentConfig?.getApiKey,
		});

		const prunePrompt = `Review the following KartaView photo records discovered near "${location.address}" (${location.lat}, ${location.lon}, radius: ${options.radiusMeters}m).

${rawResult.candidates.length} records found, ${rawResult.stats.flagged} flagged:
${rawResult.candidates
	.map(
		(c) =>
			`  [${c.flagged ? "FLAGGED" : "OK"}] photo ${c.photoId} seq ${c.sequenceId} at (${c.lat}, ${c.lon}) ${c.flagReason ? `— ${c.flagReason}` : ""}`,
	)
	.join("\n")}

Previously captured in this area: ${previouslyCapturedCount} records.
Use the check_geohash_history tool to investigate.

For each record, provide:
1. Whether it should be captured (recommendedForCapture)
2. Whether it needs a render (needsRender: true if the direct URL is likely inaccessible)
3. A brief annotation explaining your reasoning

Respond with a JSON array of annotated records.`;

		await agent.prompt(prunePrompt);
		await agent.waitForIdle();

		// Parse agent response to extract annotations
		const lastMsg = agent.state.messages[agent.state.messages.length - 1];
		const agentText =
			lastMsg?.role === "assistant" && lastMsg.content?.[0]?.type === "text" ? lastMsg.content[0].text : "";

		// Attempt to parse JSON from agent response
		let annotated: Array<{ photoId: number; needsRender: boolean; agentAnnotation: string }> = [];
		try {
			const jsonMatch = agentText.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				annotated = JSON.parse(jsonMatch[0]);
			}
		} catch {
			// Parsing failed — use defaults
		}

		const annotationMap = new Map(annotated.map((a) => [a.photoId, a]));

		for (const c of rawResult.candidates) {
			const annotation = annotationMap.get(c.photoId);
			const nr = annotation?.needsRender ?? guessNeedsRender(c.url);
			candidates.push({
				...c,
				needsRender: nr,
				agentAnnotation: annotation?.agentAnnotation ?? null,
			});
			if (!c.flagged && !nr) {
				recommendedForCapture++;
			}
		}
	} else {
		// No agent — pass through with defaults
		for (const c of rawResult.candidates) {
			const nr = guessNeedsRender(c.url);
			candidates.push({
				...c,
				needsRender: nr,
				agentAnnotation: null,
			});
			if (!c.flagged && !nr) {
				recommendedForCapture++;
			}
		}
	}

	return {
		queryPoint: { lat: location.lat, lon: location.lon },
		radiusMeters: options.radiusMeters,
		candidates,
		stats: {
			totalDiscovered: rawResult.candidates.length,
			flagged: rawResult.stats.flagged,
			previouslyCaptured: previouslyCapturedCount,
			recommendedForCapture,
		},
	};
}

// ── Stage 03 — Capture ─────────────────────────────────────────────────

/**
 * Run stage 03: capture images for approved candidates.
 *
 * Deterministic — no Agent constructed. Iterates candidates and
 * calls captureDirect or captureRender based on needsRender flag.
 * A single failure does not abort the stage.
 *
 * @param candidates - Approved candidate records (human-reviewed).
 * @returns CaptureStageResult with per-capture results.
 */
export async function runStage03(candidates: CandidateRecord[]): Promise<CaptureStageResult> {
	const captures: CaptureRecord[] = [];
	let totalBytes = 0;

	for (const c of candidates) {
		try {
			if (!c.needsRender) {
				const result = await captureDirect({ photoId: c.photoId, url: c.url });
				captures.push({
					photoId: c.photoId,
					sequenceId: c.sequenceId,
					path: result.path,
					sha256: result.sha256,
					sizeBytes: result.bytes,
					captureMethod: "direct",
					status: "success",
					error: null,
				});
				totalBytes += result.bytes;
			} else {
				const result = await captureRender({ url: c.url });
				captures.push({
					photoId: c.photoId,
					sequenceId: c.sequenceId,
					path: result.path,
					sha256: result.sha256,
					sizeBytes: 0, // render result doesn't include bytes
					captureMethod: "render",
					status: "success",
					error: null,
				});
				// captureRender doesn't return byte count — we could stat the file
			}
		} catch (err) {
			captures.push({
				photoId: c.photoId,
				sequenceId: c.sequenceId,
				path: "",
				sha256: "",
				sizeBytes: 0,
				captureMethod: c.needsRender ? "render" : "direct",
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	const succeeded = captures.filter((c) => c.status === "success");

	return {
		captures,
		stats: {
			total: captures.length,
			succeeded: succeeded.length,
			failed: captures.length - succeeded.length,
			totalBytes,
		},
	};
}

// ── Stage 04 — Store ───────────────────────────────────────────────────

/**
 * Run stage 04: store captured evidence.
 *
 * Deterministic — no Agent constructed. For each successful capture,
 * calls storeEvidence and records in SQLite. Also logs any human
 * overrides from the review gate to corrections.sqlite.
 *
 * @param captures - Successful capture results from stage 03.
 * @param candidates - Original candidate records (for metadata).
 * @param ctx - Stage context with storage root.
 * @param corrections - Optional human-override corrections from review gate.
 * @returns StoreStageResult with stored file paths.
 */
export async function runStage04(
	captures: CaptureRecord[],
	candidates: CandidateRecord[],
	ctx: StageContext,
	corrections?: CorrectionEntry[],
): Promise<StoreStageResult> {
	const storageRoot = ctx.storageRoot ?? "./evidence";
	const successCaptures = captures.filter((c) => c.status === "success");
	const candidateMap = new Map(candidates.map((c) => [c.photoId, c]));

	const stored: StoredRecord[] = [];
	let totalBytes = 0;

	for (const cap of successCaptures) {
		const cand = candidateMap.get(cap.photoId);
		if (!cand) {
			continue;
		}

		try {
			const evidenceInput: StoreEvidenceInput & { storageRoot?: string } = {
				photoId: cap.photoId,
				sequenceId: cap.sequenceId,
				lat: cand.lat,
				lon: cand.lon,
				heading: cand.heading,
				capturedAt: cand.capturedAt,
				sha256: cap.sha256,
				filePath: cap.path,
				sourceUrl: cand.url,
				captureMethod: cap.captureMethod,
				sizeBytes: cap.sizeBytes,
				flagged: cand.flagged,
				flagReason: cand.flagReason,
				storageRoot,
			};

			const result: StoreEvidenceResult = await storeEvidence(evidenceInput);

			stored.push({
				photoId: cap.photoId,
				path: result.path,
				sidecarPath: result.sidecarPath,
				sha256: result.sha256,
				geohash7: result.geohash7,
				sizeBytes: cap.sizeBytes,
			});
			totalBytes += cap.sizeBytes;
		} catch {
			// Skip failed store (non-fatal)
		}
	}

	// Log corrections if provided
	let correctionsLogged = 0;
	if (corrections && corrections.length > 0) {
		try {
			const db = openCorrectionsDb(storageRoot);
			for (const corr of corrections) {
				logCorrection(db, corr);
				correctionsLogged++;
			}
			db.close();
		} catch {
			// Corrections logging failure is non-fatal
		}
	}

	return {
		stored,
		stats: {
			totalStored: stored.length,
			totalBytes,
			correctionsLogged,
		},
	};
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Guess whether a KartaView URL needs headless render.
 * URLs pointing to kartaview.org/marker/ or dynamic endpoints typically
 * serve HTML rather than raw image bytes.
 */
function guessNeedsRender(url: string): boolean {
	// Marker pages need headless render. Direct /photo/ URLs are typically raw images.
	return /kartaview\.org\/marker\//i.test(url);
}
