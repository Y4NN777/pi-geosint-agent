/**
 * Geo-OSINT web UI server.
 *
 * Serves the frontend, manages pipeline runs via REST/SSE,
 * and exposes evidence queries against index.sqlite.
 *
 * Endpoints:
 *   POST /runs              — start a new pipeline run { lat, lon }
 *   GET  /runs/:id/events   — SSE stream of run progress
 *   GET  /evidence          — paginated evidence query
 *   GET  /runs/:id/evidence — evidence for a specific run
 *   GET  /settings          — current settings
 *   PUT  /settings          — update settings
 *   GET  /                  — serve frontend index.html
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { geohash7 } from "@y4nn777/geo-tools";
import type { CandidateRecord, CaptureStageResult, ResolveResult, StoreStageResult } from "@y4nn777/geo-workspace";
import { queryRecentCaptures, runStage01, runStage02, runStage03, runStage04 } from "@y4nn777/geo-workspace";

// ── Types ──────────────────────────────────────────────────────────────

type RunState = "pending" | "running_01" | "running_02" | "running_03" | "running_04" | "completed" | "failed";

interface PipelineRun {
	id: string;
	state: RunState;
	lat: number;
	lon: number;
	createdAt: string;
	resolvedLocation?: ResolveResult;
	discoveredCandidates?: CandidateRecord[];
	captureResult?: CaptureStageResult;
	storeResult?: StoreStageResult;
	error?: string;
	events: ServerResponse[];
}

interface Settings {
	workspaceRoot: string;
	storageRoot: string;
	searchRadius: number;
	kartaviewAuthToken?: string;
	googleMapsApiKey?: string;
}

// ── State ──────────────────────────────────────────────────────────────

const runs = new Map<string, PipelineRun>();
const frontendDir = join(import.meta.dirname, "..", "src", "frontend");
const defaultSettings: Settings = {
	workspaceRoot: join(process.cwd(), "workspace"),
	storageRoot: join(process.cwd(), "evidence"),
	searchRadius: 100,
};
let settings: Settings = loadSettings();

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
};

// ── Settings ───────────────────────────────────────────────────────────

function settingsPath(): string {
	return join(defaultSettings.storageRoot, "settings.json");
}

function loadSettings(): Settings {
	const path = settingsPath();
	try {
		if (existsSync(path)) {
			return { ...defaultSettings, ...JSON.parse(readFileSync(path, "utf-8")) };
		}
	} catch {
		// Corrupted settings — use defaults
	}
	return { ...defaultSettings };
}

function saveSettings(s: Settings): void {
	try {
		writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
	} catch {
		// Non-fatal
	}
}

// ── Server ─────────────────────────────────────────────────────────────

export function startServer(port: number = 8080) {
	const server = createServer(handleRequest);
	server.listen(port, "0.0.0.0", () => {
		console.log(`geo-webui server listening on http://0.0.0.0:${port}`);
	});
	return server;
}

// ── Request Router ─────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
	try {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const method = req.method ?? "GET";
		const path = url.pathname;

		// API routes
		if (method === "POST" && path === "/runs") {
			await handleCreateRun(req, res);
			return;
		}
		if (method === "GET" && path.match(/^\/runs\/([^/]+)\/events$/)) {
			const id = path.match(/^\/runs\/([^/]+)\/events$/)![1];
			await handleSseStream(req, res, id);
			return;
		}

		if (method === "GET" && path.match(/^\/runs\/([^/]+)\/evidence$/)) {
			const id = path.match(/^\/runs\/([^/]+)\/evidence$/)![1];
			await handleRunEvidence(req, res, id);
			return;
		}
		if (method === "GET" && path === "/evidence") {
			await handleQueryEvidence(req, res, url);
			return;
		}
		if (method === "GET" && path === "/evidence-file") {
			await handleEvidenceFile(res, url);
			return;
		}
		if (method === "GET" && path === "/settings") {
			respondJson(res, 200, settings);
			return;
		}
		if (method === "PUT" && path === "/settings") {
			await handleUpdateSettings(req, res);
			return;
		}

		// GET /runs — list active runs
		if (method === "GET" && path === "/runs") {
			const runList = Array.from(runs.values()).map((r) => ({
				id: r.id,
				state: r.state,
				lat: r.lat,
				lon: r.lon,
				createdAt: r.createdAt,
				error: r.error ?? null,
			}));
			respondJson(res, 200, runList);
			return;
		}

		// Default: serve frontend static file
		await serveStatic(res, path);
	} catch (err) {
		console.error("Request error:", err);
		if (!res.headersSent) {
			respondJson(res, 500, { error: "Internal server error" });
		}
	}
}

// ── Route Handlers ─────────────────────────────────────────────────────

async function handleCreateRun(req: IncomingMessage, res: ServerResponse) {
	const body = await readBody(req);
	const { lat, lon } = JSON.parse(body);

	if (typeof lat !== "number" || typeof lon !== "number") {
		respondJson(res, 400, { error: "lat and lon must be numbers" });
		return;
	}
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		respondJson(res, 400, { error: "Coordinates out of range" });
		return;
	}

	const run: PipelineRun = {
		id: randomUUID(),
		state: "pending",
		lat,
		lon,
		createdAt: new Date().toISOString(),
		events: [],
	};
	runs.set(run.id, run);

	respondJson(res, 201, { runId: run.id });

	// Start pipeline asynchronously
	runPipeline(run).catch((err) => {
		run.state = "failed";
		run.error = err instanceof Error ? err.message : String(err);
		broadcast(run, { type: "run_error", error: run.error });
	});
}

function handleSseStream(req: IncomingMessage, res: ServerResponse, runId: string) {
	const run = runs.get(runId);
	if (!run) {
		respondJson(res, 404, { error: "Run not found" });
		return;
	}

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	});

	// Send current state
	res.write(`data: ${JSON.stringify({ type: "state", state: run.state, runId })}\n\n`);

	// Register for future events
	run.events.push(res);
	req.on("close", () => {
		const idx = run.events.indexOf(res);
		if (idx >= 0) run.events.splice(idx, 1);
	});
}

function handleRunEvidence(_req: IncomingMessage, res: ServerResponse, runId: string) {
	const run = runs.get(runId);
	if (!run) {
		respondJson(res, 404, { error: "Run not found" });
		return;
	}

	const gh7 = geohash7(run.lat, run.lon);
	const dbPath = join(settings.storageRoot, "index.sqlite");
	const records = queryRecentCaptures(dbPath, gh7, 200);

	respondJson(res, 200, {
		runId,
		geohash7: gh7,
		lat: run.lat,
		lon: run.lon,
		records,
	});
}

function handleQueryEvidence(_req: IncomingMessage, res: ServerResponse, url: URL) {
	const geohashPrefix = url.searchParams.get("geohash") ?? "";
	const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);

	const dbPath = join(settings.storageRoot, "index.sqlite");
	const records = geohashPrefix ? queryRecentCaptures(dbPath, geohashPrefix, limit) : listAllEvidence(dbPath, limit);

	respondJson(res, 200, { records, count: records.length });
}

function handleEvidenceFile(res: ServerResponse, url: URL): void {
	const filePath = url.searchParams.get("path") ?? "";
	if (!filePath) {
		respondJson(res, 400, { error: "path query param required" });
		return;
	}

	// Security: only serve files under storageRoot
	const resolved = join(settings.storageRoot, filePath);
	if (!resolved.startsWith(settings.storageRoot)) {
		respondJson(res, 403, { error: "Forbidden" });
		return;
	}

	try {
		const content = readFileSync(resolved);
		const ext = extname(resolved);
		res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
		res.end(content);
	} catch {
		respondJson(res, 404, { error: "File not found" });
	}
}

async function handleUpdateSettings(req: IncomingMessage, res: ServerResponse) {
	const body = await readBody(req);
	const updates = JSON.parse(body);

	const updated: Settings = {
		...settings,
		...updates,
	};
	settings = updated;
	saveSettings(updated);

	respondJson(res, 200, settings);
}

// ── Static File Server ─────────────────────────────────────────────────

function serveStatic(res: ServerResponse, pathname: string): void {
	const filePath = pathname === "/" || pathname === "" ? join(frontendDir, "index.html") : join(frontendDir, pathname);

	if (!filePath.startsWith(frontendDir)) {
		respondJson(res, 403, { error: "Forbidden" });
		return;
	}

	try {
		const content = readFileSync(filePath);
		const ext = extname(filePath);
		res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
		res.end(content);
	} catch {
		// Try index.html for client-side routing
		try {
			const content = readFileSync(join(frontendDir, "index.html"));
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(content);
		} catch {
			respondJson(res, 404, { error: "Not found" });
		}
	}
}

// ── Pipeline Orchestration ─────────────────────────────────────────────

async function runPipeline(run: PipelineRun): Promise<void> {
	switch (run.state) {
		// biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional pipeline stage chaining
		case "pending": {
			run.state = "running_01";
			broadcast(run, { type: "stage_start", stage: "01_resolve" });

			const resolveResult = await runStage01(
				{ lat: run.lat, lon: run.lon },
				{ workspaceRoot: settings.workspaceRoot },
			);
			run.resolvedLocation = resolveResult;
			run.state = "running_02";
			broadcast(run, { type: "stage_end", stage: "01_resolve", result: resolveResult });
		}
		// falls through
		case "running_02": {
			broadcast(run, { type: "stage_start", stage: "02_discover" });

			const discoverResult = await runStage02(
				{
					address: run.resolvedLocation!.address,
					lat: run.resolvedLocation!.lat,
					lon: run.resolvedLocation!.lon,
					confidence: run.resolvedLocation!.confidence,
				},
				{
					radiusMeters: settings.searchRadius,
					authToken: settings.kartaviewAuthToken,
					googleMapsApiKey: settings.googleMapsApiKey,
				},
				{ workspaceRoot: settings.workspaceRoot },
			);
			run.discoveredCandidates = discoverResult.candidates;
			run.state = "running_03";
			broadcast(run, { type: "stage_end", stage: "02_discover", result: discoverResult });
		}
		// falls through
		case "running_03": {
			run.state = "running_03";
			broadcast(run, { type: "stage_start", stage: "03_capture" });

			const captureResult = await runStage03(run.discoveredCandidates ?? []);
			run.captureResult = captureResult;
			run.state = "running_04";
			broadcast(run, { type: "stage_end", stage: "03_capture", result: captureResult });
		}
		// falls through
		case "running_04": {
			broadcast(run, { type: "stage_start", stage: "04_store" });

			const storeResult = await runStage04(run.captureResult?.captures ?? [], run.discoveredCandidates ?? [], {
				workspaceRoot: settings.workspaceRoot,
				storageRoot: settings.storageRoot,
			});
			run.storeResult = storeResult;
			run.state = "completed";
			broadcast(run, { type: "run_complete", result: storeResult });
			return;
		}
		default:
			throw new Error(`Cannot run pipeline from state: ${run.state}`);
	}
}

// ── Helpers ────────────────────────────────────────────────────────────

function broadcast(run: PipelineRun, event: Record<string, unknown>): void {
	const data = JSON.stringify(event);
	for (const res of run.events) {
		try {
			res.write(`data: ${data}\n\n`);
		} catch {
			// Client disconnected — remove on next close event
		}
	}
}

function respondJson(res: ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
	});
	res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

// ── Main ────────────────────────────────────────────────────────────────

if (process.argv[1] === import.meta.filename) {
	const PORT = Number(process.env.PORT) || 8080;
	startServer(PORT);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function listAllEvidence(dbPath: string, limit: number): Array<{ capturedAt: string; source: string; path: string }> {
	try {
		if (!existsSync(dbPath)) return [];

		const db = new DatabaseSync(dbPath);
		try {
			const rows = db
				.prepare("SELECT captured_at, source, file_path FROM evidence ORDER BY captured_at DESC LIMIT ?")
				.all(limit) as Array<{ captured_at: string; source: string; file_path: string }>;
			return rows.map((r) => ({ capturedAt: r.captured_at, source: r.source, path: r.file_path }));
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}
