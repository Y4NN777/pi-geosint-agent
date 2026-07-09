/**
 * Unit tests for KartaView photo discovery.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kartaviewDiscover, resetRateLimit } from "../src/kartaview-discover.ts";
import { ToolError } from "../src/types.ts";

function mockFetch(response: Response | ((url: string) => Response)): void {
	const fn = typeof response === "function" ? response : () => response;
	vi.stubGlobal(
		"fetch",
		vi.fn((url: string) => Promise.resolve(fn(url))),
	);
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

// Helper: create a sample sequence item
function seq(id: number): {
	id: number;
	photoId: number;
	lat: number;
	lon: number;
	heading: number;
	capturedAt: string;
} {
	return { id, photoId: id, lat: 48.85, lon: 2.35, heading: 90, capturedAt: new Date().toISOString() };
}

// Helper: create a detail response
function detail(id: number, overrides: Partial<{ lat: number; lon: number; capturedAt: string }> = {}): object {
	return {
		id,
		sequenceId: id,
		capturedAt: overrides.capturedAt ?? new Date().toISOString(),
		lat: overrides.lat ?? 48.85,
		lon: overrides.lon ?? 2.35,
		heading: 90,
		url: `https://kartaview.org/photo/${id}`,
	};
}

describe("kartaviewDiscover", () => {
	beforeEach(() => {
		resetRateLimit();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns empty candidates when no sequences exist", async () => {
		mockFetch(jsonResponse({ sequences: [] }));

		const result = await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 });
		expect(result.candidates).toHaveLength(0);
		expect(result.stats.totalDiscovered).toBe(0);
		expect(result.queryPoint).toEqual({ lat: 48.85, lon: 2.35 });
	});

	it("discovers photos from returned sequences", async () => {
		let callCount = 0;
		mockFetch((url: string) => {
			callCount++;
			if (url.includes("nearby-photos")) {
				return jsonResponse({ sequences: [seq(1), seq(2)] });
			}
			// Detail endpoint
			const seqId = parseInt(url.match(/sequenceId=(\d+)/)?.[1] ?? "0", 10);
			return jsonResponse(detail(seqId));
		});

		const result = await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 });
		expect(result.candidates).toHaveLength(2);
		expect(result.stats.totalDiscovered).toBe(2);
		expect(callCount).toBe(3); // 1 list + 2 detail
	});

	it("flags stale photos (older than 2 years)", async () => {
		const oldDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
		mockFetch((url: string) => {
			if (url.includes("nearby-photos")) {
				return jsonResponse({ sequences: [seq(1)] });
			}
			return jsonResponse(detail(1, { capturedAt: oldDate }));
		});

		const result = await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 });
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].flagged).toBe(true);
		expect(result.candidates[0].flagReason).toContain("years old");
	});

	it("flags photos with inconsistent coordinates (>50m from query)", async () => {
		mockFetch((url: string) => {
			if (url.includes("nearby-photos")) {
				return jsonResponse({ sequences: [seq(1)] });
			}
			// ~111km away from (48.85, 2.35)
			return jsonResponse(detail(1, { lat: 49.85, lon: 2.35 }));
		});

		const result = await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 });
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].flagged).toBe(true);
		expect(result.candidates[0].flagReason).toContain("from query point");
	});

	it("throws ToolError on API error", async () => {
		mockFetch(new Response("Server Error", { status: 500 }));

		await expect(kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 })).rejects.toThrow(ToolError);
	});

	it("throws ToolError when rate limited", async () => {
		// Fill up the rate tracker by calling many times
		mockFetch(jsonResponse({ sequences: [] }));

		// Make many rapid calls to exhaust rate limit
		for (let i = 0; i < 100; i++) {
			await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 }).catch(() => {});
		}

		// Next call should hit rate limit
		await expect(kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 })).rejects.toThrow(ToolError);
	});

	it("includes auth token in headers when provided", async () => {
		let authHeader = "";
		mockFetch((url: string) => {
			// Don't inspect auth on the constructor call
			return jsonResponse({ sequences: [] });
		});

		vi.stubGlobal(
			"fetch",
			vi.fn((url: string, init?: RequestInit) => {
				if (url.includes("nearby-photos")) {
					authHeader = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
				}
				return Promise.resolve(jsonResponse({ sequences: [] }));
			}),
		);

		await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100, authToken: "tok_abc" });
		expect(authHeader).toBe("Bearer tok_abc");
	});

	it("continues past a single failed detail request", async () => {
		let callCount = 0;
		mockFetch((url: string) => {
			callCount++;
			if (url.includes("nearby-photos")) {
				return jsonResponse({ sequences: [seq(1), seq(2), seq(3)] });
			}
			const seqId = parseInt(url.match(/sequenceId=(\d+)/)?.[1] ?? "0", 10);
			if (seqId === 2) {
				return new Response("Not Found", { status: 404 });
			}
			return jsonResponse(detail(seqId));
		});

		const result = await kartaviewDiscover({ lat: 48.85, lon: 2.35, radiusMeters: 100 });
		expect(result.candidates).toHaveLength(2); // seq 2 failed, but 1 and 3 succeeded
	});
});
