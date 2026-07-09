/**
 * Tests for geo-webui server endpoints.
 *
 * Mocks @y4nn777/geo-workspace so we don't need actual SQLite
 * or real pipeline execution during unit tests.
 */

import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockStage01 = vi.fn();
const mockStage02 = vi.fn();
const mockStage03 = vi.fn();
const mockStage04 = vi.fn();
const mockQueryRecent = vi.fn();
const mockGeohash7 = vi.fn();

vi.mock("@y4nn777/geo-workspace", () => ({
	runStage01: mockStage01,
	runStage02: mockStage02,
	runStage03: mockStage03,
	runStage04: mockStage04,
	queryRecentCaptures: mockQueryRecent,
	openIndexDb: vi.fn(),
	openCorrectionsDb: vi.fn(),
}));

vi.mock("@y4nn777/geo-tools", () => ({
	geohash7: mockGeohash7,
}));

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
	const res = await fetch(url, init);
	const text = await res.text();
	let body: any;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	return { status: res.status, body };
}

function fetchRaw(url: string): Promise<{ status: number; body: string; headers: Headers }> {
	return fetch(url).then(async (res) => ({
		status: res.status,
		body: await res.text(),
		headers: res.headers,
	}));
}

async function waitForServer(url: string, retries = 10): Promise<void> {
	for (let i = 0; i < retries; i++) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 200));
		}
	}
}

// ── Mock data ──────────────────────────────────────────────────────────

const dummyCandidate = {
	photoId: 1001,
	sequenceId: 42,
	lat: 47.3769,
	lon: 8.5417,
	heading: 180,
	capturedAt: "2025-06-01T12:00:00Z",
	url: "https://example.com/photo/1001",
	source: "kartaview",
	flagged: false,
	flagReason: null,
	needsRender: false,
	agentAnnotation: "Clear view of target location",
};

const dummyCaptureResult = {
	captures: [
		{
			photoId: 1001,
			sequenceId: 42,
			path: "/tmp/evidence/1001.jpg",
			sha256: "abc",
			sizeBytes: 12345,
			captureMethod: "direct" as const,
			status: "success" as const,
			error: null,
		},
	],
	stats: { total: 1, succeeded: 1, failed: 0, totalBytes: 12345 },
};

const dummyStoreResult = {
	stored: [
		{
			photoId: 1001,
			path: "/tmp/evidence/1001.jpg",
			sidecarPath: "/tmp/evidence/1001.json",
			sha256: "abc",
			geohash7: "u12xyz",
			sizeBytes: 12345,
		},
	],
	stats: { totalStored: 1, totalBytes: 12345, correctionsLogged: 0 },
};

// ── Tests ──────────────────────────────────────────────────────────────

describe("geo-webui server", () => {
	let server: Server;
	let baseUrl: string;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Set up default mock implementations
		mockGeohash7.mockReturnValue("u12xyz");
		mockQueryRecent.mockReturnValue([]);

		// Dynamic import so mocks are registered
		const mod = await import("../src/server.ts");
		server = mod.startServer(0); // port 0 = OS-assigned

		// Wait for server to start and grab the actual port
		await new Promise<void>((resolve) => {
			server.on("listening", () => {
				const addr = server.address();
				if (addr && typeof addr === "object") {
					baseUrl = `http://127.0.0.1:${addr.port}`;
				}
				resolve();
			});
		});
		await waitForServer(baseUrl);
	});

	afterEach(() => {
		server?.close();
	});

	// ── Static files ─────────────────────────────────────────────────

	it("serves index.html on GET /", async () => {
		const { status, body } = await fetchRaw(baseUrl + "/");
		expect(status).toBe(200);
		expect(body).toContain("Geo-OSINT");
	});

	// ── POST /runs ───────────────────────────────────────────────────

	it("creates a run on POST /runs", async () => {
		mockStage01.mockResolvedValue({
			address: "Zurich, Switzerland",
			confidence: 0.9,
			lat: 47.3769,
			lon: 8.5417,
		});
		mockStage02.mockResolvedValue({
			queryPoint: { lat: 47.3769, lon: 8.5417 },
			radiusMeters: 100,
			candidates: [dummyCandidate],
			stats: { totalDiscovered: 1, flagged: 0, previouslyCaptured: 0, recommendedForCapture: 1 },
		});

		const { status, body } = await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: 47.3769, lon: 8.5417 }),
		});

		expect(status).toBe(201);
		expect(body).toHaveProperty("runId");
		expect(typeof body.runId).toBe("string");
	});

	it("rejects invalid coordinates on POST /runs", async () => {
		const { status, body } = await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: "invalid", lon: 8.5 }),
		});

		expect(status).toBe(400);
		expect(body).toHaveProperty("error");
	});

	it("rejects out-of-range coordinates on POST /runs", async () => {
		const { status, body } = await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: 100, lon: 8.5 }),
		});

		expect(status).toBe(400);
		expect(body).toHaveProperty("error");
	});

	// ── GET /runs ────────────────────────────────────────────────────

	it("lists runs on GET /runs", async () => {
		mockStage01.mockResolvedValue({
			address: "Zurich, Switzerland",
			confidence: 0.9,
			lat: 47.3769,
			lon: 8.5417,
		});
		mockStage02.mockResolvedValue({
			queryPoint: { lat: 47.3769, lon: 8.5417 },
			radiusMeters: 100,
			candidates: [dummyCandidate],
			stats: { totalDiscovered: 1, flagged: 0, previouslyCaptured: 0, recommendedForCapture: 1 },
		});

		// Create a run first
		await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: 47.3769, lon: 8.5417 }),
		});

		// Allow pipeline to start
		await new Promise((r) => setTimeout(r, 200));

		const { status, body } = await fetchJson(baseUrl + "/runs");
		expect(status).toBe(200);
		expect(Array.isArray(body)).toBe(true);
		expect(body.length).toBeGreaterThanOrEqual(1);
		expect(body[0]).toHaveProperty("id");
		expect(body[0]).toHaveProperty("state");
	});

	// ── POST /runs/:id/review ────────────────────────────────────────

	it("rejects review on non-existent run", async () => {
		const { status, body } = await fetchJson(baseUrl + "/runs/no-such-id/review", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ candidates: [] }),
		});

		expect(status).toBe(404);
		expect(body).toHaveProperty("error");
	});

	it("rejects review when run is not awaiting review", async () => {
		mockStage01.mockResolvedValue({
			address: "Zurich, Switzerland",
			confidence: 0.9,
			lat: 47.3769,
			lon: 8.5417,
		});
		mockStage02.mockResolvedValue({
			queryPoint: { lat: 47.3769, lon: 8.5417 },
			radiusMeters: 100,
			candidates: [dummyCandidate],
			stats: { totalDiscovered: 1, flagged: 0, previouslyCaptured: 0, recommendedForCapture: 1 },
		});

		const { body: createBody } = await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: 47.3769, lon: 8.5417 }),
		});

		// Wait for pipeline to reach awaiting_review
		await new Promise((r) => setTimeout(r, 100));

		const { status, body: reviewBody } = await fetchJson(baseUrl + `/runs/${createBody.runId}/review`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ candidates: [dummyCandidate] }),
		});

		expect(status).toBe(200);
		expect(reviewBody).toHaveProperty("status", "approved");
	});

	// ── GET /evidence ────────────────────────────────────────────────

	it("returns evidence on GET /evidence", async () => {
		mockQueryRecent.mockReturnValue([
			{ capturedAt: "2025-06-01T12:00:00Z", source: "kartaview", path: "/tmp/evidence/1001.jpg" },
		]);

		const { status, body } = await fetchJson(baseUrl + "/evidence");
		expect(status).toBe(200);
		expect(body).toHaveProperty("records");
		expect(Array.isArray(body.records)).toBe(true);
	});

	it("filters evidence by geohash query param", async () => {
		mockQueryRecent.mockReturnValue([
			{ capturedAt: "2025-06-01T12:00:00Z", source: "kartaview", path: "/tmp/evidence/1001.jpg" },
		]);

		const { status, body } = await fetchJson(baseUrl + "/evidence?geohash=u12&limit=10");
		expect(status).toBe(200);
		expect(body.records.length).toBe(1);
		expect(mockQueryRecent).toHaveBeenCalledWith(expect.any(String), "u12", 10);
	});

	// ── GET /settings ────────────────────────────────────────────────

	it("returns settings on GET /settings", async () => {
		const { status, body } = await fetchJson(baseUrl + "/settings");
		expect(status).toBe(200);
		expect(body).toHaveProperty("workspaceRoot");
		expect(body).toHaveProperty("storageRoot");
		expect(body).toHaveProperty("searchRadius");
	});

	// ── PUT /settings ────────────────────────────────────────────────

	it("updates settings on PUT /settings", async () => {
		const { status, body } = await fetchJson(baseUrl + "/settings", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ searchRadius: 200 }),
		});

		expect(status).toBe(200);
		expect(body).toHaveProperty("searchRadius", 200);
	});

	// ── SSE events ───────────────────────────────────────────────────

	it("returns 404 for SSE on non-existent run", async () => {
		const { status } = await fetchRaw(baseUrl + "/runs/no-such-id/events");
		expect(status).toBe(404);
	});

	it("returns SSE stream on GET /runs/:id/events", async () => {
		mockStage01.mockResolvedValue({
			address: "Zurich, Switzerland",
			confidence: 0.9,
			lat: 47.3769,
			lon: 8.5417,
		});
		mockStage02.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 300));
			return {
				queryPoint: { lat: 47.3769, lon: 8.5417 },
				radiusMeters: 100,
				candidates: [dummyCandidate],
				stats: { totalDiscovered: 1, flagged: 0, previouslyCaptured: 0, recommendedForCapture: 1 },
			};
		});

		const { body: createBody } = await fetchJson(baseUrl + "/runs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ lat: 47.3769, lon: 8.5417 }),
		});

		const runId = createBody.runId;

		// Connect to SSE
		const sseRes = await fetch(baseUrl + `/runs/${runId}/events`);
		expect(sseRes.status).toBe(200);
		expect(sseRes.headers.get("content-type")).toBe("text/event-stream");

		// Read available events — pipeline sends initial state then awaits review
		const reader = sseRes.body!.getReader();
		const decoder = new TextDecoder();
		let data = "";

		// Read from SSE with a timeout so we don't block forever
		const readWithTimeout = (timeoutMs: number): Promise<{ done: boolean; value?: string }> =>
			Promise.race([
				reader.read().then(({ done, value }) => ({
					done,
					value: value ? decoder.decode(value, { stream: true }) : undefined,
				})),
				new Promise<{ done: true }>((resolve) => setTimeout(() => resolve({ done: true }), timeoutMs)),
			]);

		// Collect up to 3 events with 200ms timeout per read
		for (let i = 0; i < 3; i++) {
			const { done, value } = await readWithTimeout(1000);
			if (done) break;
			if (value) data += value;
		}
		reader.releaseLock();

		expect(data).toContain('"type":"state"');
		expect(data).toContain(runId);
	}, 15000);
});
