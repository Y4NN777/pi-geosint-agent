/**
 * Unit tests for stage-driver.
 *
 * All geo-tools functions and the Agent class are mocked.
 * No real KartaView API calls or LLM calls are made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks (must be defined before vi.mock calls) ───────────────

const {
	mockReverseGeocode,
	mockKartaviewDiscover,
	mockCaptureDirect,
	mockCaptureRender,
	mockStoreEvidence,
	mockCheckGeohashHistory,
	mockGeohash7,
	mockAssembleSystemPrompt,
	mockOpenIndexDb,
	mockOpenCorrectionsDb,
	mockLogCorrection,
} = vi.hoisted(() => {
	const mockReverseGeocode = vi.fn();
	const mockKartaviewDiscover = vi.fn();
	const mockCaptureDirect = vi.fn();
	const mockCaptureRender = vi.fn();
	const mockStoreEvidence = vi.fn();
	const mockCheckGeohashHistory = vi.fn();
	const mockGeohash7 = vi.fn();
	const mockAssembleSystemPrompt = vi.fn();
	const mockOpenIndexDb = vi.fn();
	const mockOpenCorrectionsDb = vi.fn();
	const mockLogCorrection = vi.fn();
	return {
		mockReverseGeocode,
		mockKartaviewDiscover,
		mockCaptureDirect,
		mockCaptureRender,
		mockStoreEvidence,
		mockCheckGeohashHistory,
		mockGeohash7,
		mockAssembleSystemPrompt,
		mockOpenIndexDb,
		mockOpenCorrectionsDb,
		mockLogCorrection,
	};
});

const { mockAgentConstructor } = vi.hoisted(() => {
	class MockAgent {
		public state: { messages: any[]; model: any; tools: any[]; systemPrompt: string };
		public systemPrompt: string;
		public model: any;
		public tools: any[];
		public promptPromise: Promise<void>;

		constructor(opts: any) {
			this.systemPrompt = opts.initialState?.systemPrompt ?? "";
			this.model = opts.initialState?.model;
			this.tools = opts.initialState?.tools ?? [];
			this.state = {
				messages: [],
				model: this.model,
				tools: this.tools,
				systemPrompt: this.systemPrompt,
			};
			this.promptPromise = Promise.resolve();
		}

		prompt(_input: any): Promise<void> {
			this.state.messages.push({
				role: "assistant",
				content: [{ type: "text", text: "Agent processed the request." }],
			});
			return Promise.resolve();
		}

		waitForIdle(): Promise<void> {
			return Promise.resolve();
		}
	}

	const mockAgentConstructor = vi.fn((opts: any) => new MockAgent(opts));
	return { MockAgent, mockAgentConstructor };
});

// ── Mock modules ───────────────────────────────────────────────────────

vi.mock("@y4nn777/geo-tools", () => ({
	reverseGeocode: mockReverseGeocode,
	kartaviewDiscover: mockKartaviewDiscover,
	captureDirect: mockCaptureDirect,
	captureRender: mockCaptureRender,
	storeEvidence: mockStoreEvidence,
	checkGeohashHistory: mockCheckGeohashHistory,
	geohash7: mockGeohash7,
}));

vi.mock("../src/workspace-loader.ts", () => ({
	assembleSystemPrompt: mockAssembleSystemPrompt,
}));

vi.mock("../src/memory-store.ts", () => ({
	openIndexDb: mockOpenIndexDb,
	openCorrectionsDb: mockOpenCorrectionsDb,
	logCorrection: mockLogCorrection,
}));

vi.mock("@earendil-works/pi-agent-core", () => ({
	Agent: mockAgentConstructor,
}));

// ── SUT ────────────────────────────────────────────────────────────────

import { runStage01, runStage02, runStage03, runStage04 } from "../src/stage-driver.ts";

// ── Fixtures ───────────────────────────────────────────────────────────

const mockModel = {
	id: "test-model",
	name: "test-model",
	api: "test-api",
	provider: "test-provider",
	baseUrl: "http://localhost",
	reasoning: false,
	input: [],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 10000,
	maxTokens: 1000,
};

const testContext = {
	workspaceRoot: "/tmp/test-workspace",
	agentConfig: {
		model: mockModel,
		getApiKey: (provider: string) => `mock-key-${provider}`,
	},
	storageRoot: "/tmp/test-evidence",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockAssembleSystemPrompt.mockReturnValue("Mock system prompt");
	mockGeohash7.mockReturnValue("gcpvj0d");

	// Default mock implementations
	mockReverseGeocode.mockResolvedValue({
		address: "123 Main St, London, UK",
		confidence: 0.95,
	});

	mockKartaviewDiscover.mockResolvedValue({
		queryPoint: { lat: 51.5, lon: -0.13 },
		radiusMeters: 100,
		candidates: [
			{
				id: "101",
				sequenceId: "1",
				source: "kartaview",
				lat: 51.5001,
				lon: -0.1301,
				heading: 90,
				headingBucket: "E",
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/photo/101",
				flagged: false,
				flagReason: null,
			},
		],
		coverage: {
			distinctHeadings: 1,
			bucketsPresent: ["E"],
			bucketsMissing: ["N", "NE", "SE", "S", "SW", "W", "NW"],
			angleSpread: 0,
		},
		stats: { totalDiscovered: 1, flagged: 0, kartaviewCount: 1, googleStreetviewCount: 0 },
	});

	mockCaptureDirect.mockResolvedValue({
		path: "/tmp/captures/101.jpg",
		sha256: "abc123",
		bytes: 1024,
	});

	mockCaptureRender.mockResolvedValue({
		path: "/tmp/captures/101.png",
		sha256: "def456",
	});

	mockStoreEvidence.mockResolvedValue({
		path: "/tmp/evidence/gcpvj0d/2024-06-01/kartaview/101.jpg",
		sidecarPath: "/tmp/evidence/gcpvj0d/2024-06-01/kartaview/101.sidecar.json",
		sha256: "abc123",
		geohash7: "gcpvj0d",
	});

	mockOpenIndexDb.mockReturnValue({
		prepare: () => ({
			get: () => ({ cnt: 0 }),
			run: vi.fn(),
		}),
		exec: vi.fn(),
		close: vi.fn(),
	});

	mockOpenCorrectionsDb.mockReturnValue({
		prepare: () => ({
			run: vi.fn(),
		}),
		close: vi.fn(),
	});
});

// ── Stage 01 Tests ─────────────────────────────────────────────────────

describe("runStage01", () => {
	it("returns resolve result with coordinates on fast path (no alternates)", async () => {
		mockReverseGeocode.mockResolvedValue({
			address: "123 Main St, London, UK",
			confidence: 0.95,
		});

		const result = await runStage01({ lat: 51.5, lon: -0.13 }, testContext);

		expect(result.address).toBe("123 Main St, London, UK");
		expect(result.confidence).toBe(0.95);
		expect(result.lat).toBe(51.5);
		expect(result.lon).toBe(-0.13);
		expect(result.alternates).toBeUndefined();
		expect(mockReverseGeocode).toHaveBeenCalledWith({ lat: 51.5, lon: -0.13 });
		// Agent should not be created on fast path
		expect(mockAgentConstructor).not.toHaveBeenCalled();
	});

	it("constructs Agent when alternates exist", async () => {
		mockReverseGeocode.mockResolvedValue({
			address: "123 Main St, London, UK",
			confidence: 0.6,
			alternates: [
				{ address: "124 Main St, London, UK", confidence: 0.55 },
				{ address: "125 Main St, London, UK", confidence: 0.5 },
			],
		});

		const result = await runStage01({ lat: 51.5, lon: -0.13 }, testContext);

		expect(result.address).toBe("123 Main St, London, UK");
		expect(result.alternates).toHaveLength(2);
		expect(mockAgentConstructor).toHaveBeenCalledTimes(1);
		expect(mockAssembleSystemPrompt).toHaveBeenCalledWith(testContext.workspaceRoot, "01_resolve");
	});

	it("works without agent config (no alternates fast path)", async () => {
		const noAgentCtx = { ...testContext, agentConfig: undefined };

		const result = await runStage01({ lat: 48.85, lon: 2.35 }, noAgentCtx);

		expect(result.lat).toBe(48.85);
		expect(result.lon).toBe(2.35);
	});
});

// ── Stage 02 Tests ─────────────────────────────────────────────────────

describe("runStage02", () => {
	const location = {
		address: "123 Main St, London, UK",
		lat: 51.5,
		lon: -0.13,
		confidence: 0.95,
	};

	it("calls kartaviewDiscover and returns annotated candidates", async () => {
		const result = await runStage02(location, { radiusMeters: 100 }, testContext);

		expect(mockKartaviewDiscover).toHaveBeenCalledWith({
			lat: 51.5,
			lon: -0.13,
			radiusMeters: 100,
		});
		expect(result.queryPoint.lat).toBe(51.5);
		expect(result.queryPoint.lon).toBe(-0.13);
		expect(result.radiusMeters).toBe(100);
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].id).toBe("101");
		expect(result.candidates[0].needsRender).toBe(false);
		expect(result.candidates[0].agentAnnotation).toBeNull();
		expect(result.stats.totalDiscovered).toBe(1);
	});

	it("passes auth token to kartaviewDiscover", async () => {
		await runStage02(location, { radiusMeters: 200, authToken: "bearer-token" }, testContext);

		expect(mockKartaviewDiscover).toHaveBeenCalledWith({
			lat: 51.5,
			lon: -0.13,
			radiusMeters: 200,
			kartaviewAuthToken: "bearer-token",
		});
	});

	it("check geohash history on index db", async () => {
		await runStage02(location, { radiusMeters: 100 }, testContext);

		expect(mockOpenIndexDb).toHaveBeenCalledWith(testContext.storageRoot);
	});

	it("works without agent config (passthrough)", async () => {
		const noAgentCtx = { ...testContext, agentConfig: undefined };
		const result = await runStage02(location, { radiusMeters: 100 }, noAgentCtx);

		expect(result.candidates).toHaveLength(1);
	});
});

// ── Stage 03 Tests ─────────────────────────────────────────────────────

describe("runStage03", () => {
	it("captures all candidates via direct download", async () => {
		const candidates = [
			{
				id: "101",
				sequenceId: "1",
				source: "kartaview" as const,
				lat: 51.5,
				lon: -0.13,
				heading: 90,
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/photo/101",
				flagged: false,
				flagReason: null,
				needsRender: false,
				agentAnnotation: null,
			},
		];

		const result = await runStage03(candidates);

		expect(mockCaptureDirect).toHaveBeenCalledWith({
			source: "kartaview",
			id: "101",
			url: "https://kartaview.org/photo/101",
		});
		expect(result.captures).toHaveLength(1);
		expect(result.captures[0].status).toBe("success");
		expect(result.captures[0].captureMethod).toBe("direct");
		expect(result.stats.succeeded).toBe(1);
		expect(result.stats.failed).toBe(0);
	});

	it("uses render path for needsRender candidates", async () => {
		const candidates = [
			{
				id: "202",
				sequenceId: "2",
				source: "kartaview" as const,
				lat: 51.5,
				lon: -0.13,
				heading: 180,
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/marker/202",
				flagged: true,
				flagReason: "needs render",
				needsRender: true,
				agentAnnotation: null,
			},
		];

		const result = await runStage03(candidates);

		expect(mockCaptureRender).toHaveBeenCalledWith({ url: "https://kartaview.org/marker/202" });
		expect(result.captures[0].status).toBe("success");
		expect(result.captures[0].captureMethod).toBe("render");
	});

	it("continues on capture failure", async () => {
		mockCaptureDirect.mockRejectedValueOnce(new Error("HTTP 404"));

		const candidates = [
			{
				id: "101",
				sequenceId: "1",
				source: "kartaview" as const,
				lat: 51.5,
				lon: -0.13,
				heading: 90,
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/photo/101",
				flagged: false,
				flagReason: null,
				needsRender: false,
				agentAnnotation: null,
			},
			{
				id: "102",
				sequenceId: "1",
				source: "kartaview" as const,
				lat: 51.5,
				lon: -0.131,
				heading: 90,
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/photo/102",
				flagged: false,
				flagReason: null,
				needsRender: false,
				agentAnnotation: null,
			},
		];

		const result = await runStage03(candidates);

		expect(result.captures).toHaveLength(2);
		expect(result.captures[0].status).toBe("failed");
		expect(result.captures[1].status).toBe("success");
		expect(result.stats.succeeded).toBe(1);
		expect(result.stats.failed).toBe(1);
	});
});

// ── Stage 04 Tests ─────────────────────────────────────────────────────

describe("runStage04", () => {
	const captures = [
		{
			id: "101",
			sequenceId: "1",
			path: "/tmp/captures/101.jpg",
			sha256: "abc123",
			sizeBytes: 1024,
			captureMethod: "direct" as const,
			status: "success" as const,
			error: null,
		},
	];

	const candidates = [
		{
			id: "101",
			sequenceId: "1",
			source: "kartaview" as const,
			lat: 51.5,
			lon: -0.13,
			heading: 90,
			capturedAt: "2024-06-01T12:00:00Z",
			url: "https://kartaview.org/photo/101",
			flagged: false,
			flagReason: null,
			needsRender: false,
			agentAnnotation: null,
		},
	];

	it("stores successful captures", async () => {
		const result = await runStage04(captures, candidates, testContext);

		expect(mockStoreEvidence).toHaveBeenCalled();
		expect(result.stored).toHaveLength(1);
		expect(result.stats.totalStored).toBe(1);
		expect(result.stats.totalBytes).toBe(1024);
	});

	it("logs corrections when provided", async () => {
		const corrections = [
			{
				photoId: 101,
				field: "needsRender",
				oldValue: "false",
				newValue: "true",
				reason: "URL requires JS",
			},
		];

		const result = await runStage04(captures, candidates, testContext, corrections);

		expect(mockOpenCorrectionsDb).toHaveBeenCalledWith(testContext.storageRoot);
		expect(mockLogCorrection).toHaveBeenCalled();
		expect(result.stats.correctionsLogged).toBe(1);
	});

	it("skips failed captures", async () => {
		const mixedCaptures = [
			...captures,
			{
				id: "999",
				sequenceId: "2",
				path: "",
				sha256: "",
				sizeBytes: 0,
				captureMethod: "direct" as const,
				status: "failed" as const,
				error: "HTTP 500",
			},
		];

		const mixedCandidates = [
			...candidates,
			{
				id: "999",
				sequenceId: "2",
				source: "kartaview" as const,
				lat: 51.5,
				lon: -0.13,
				heading: 180,
				capturedAt: "2024-06-01T12:00:00Z",
				url: "https://kartaview.org/photo/999",
				flagged: false,
				flagReason: null,
				needsRender: false,
				agentAnnotation: null,
			},
		];

		const result = await runStage04(mixedCaptures, mixedCandidates, testContext);

		// Only the successful capture is stored
		expect(result.stored).toHaveLength(1);
		expect(result.stats.totalStored).toBe(1);
	});
});
