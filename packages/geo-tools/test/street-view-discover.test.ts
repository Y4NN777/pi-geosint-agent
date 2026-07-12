/**
 * Unit tests for Google Street View discovery.
 * Mirrors kartaview-discover.test.ts shape.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { streetviewDiscover } from "../src/street-view-discover.ts";
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

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("streetviewDiscover", () => {
	const TEST_KEY = "test-api-key";
	const TEST_LAT = 48.8566;
	const TEST_LON = 2.3522;

	it("returns 4 candidates when panorama is found", async () => {
		mockFetch(
			jsonResponse({
				status: "OK",
				pano_id: "abc123",
				lat: TEST_LAT,
				lng: TEST_LON,
				date: "2024-06",
			}),
		);

		const result = await streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY);

		expect(result.candidates).toHaveLength(4);
		expect(result.candidates[0].source).toBe("google-streetview");
		expect(result.candidates[0].id).toBe("abc123_0");
		expect(result.candidates[0].heading).toBe(0);
		expect(result.candidates[0].headingBucket).toBe("N");
		expect(result.candidates[1].id).toBe("abc123_90");
		expect(result.candidates[1].heading).toBe(90);
		expect(result.candidates[1].headingBucket).toBe("E");
		expect(result.candidates[2].id).toBe("abc123_180");
		expect(result.candidates[2].heading).toBe(180);
		expect(result.candidates[2].headingBucket).toBe("S");
		expect(result.candidates[3].id).toBe("abc123_270");
		expect(result.candidates[3].heading).toBe(270);
		expect(result.candidates[3].headingBucket).toBe("W");
		expect(result.candidates[0].capturedAt).toBe("2024-06-01");
		expect(result.candidates[0].flagged).toBe(false);
		expect(result.coverage.distinctHeadings).toBe(4);
	});

	it("returns empty candidates when no panorama is found", async () => {
		mockFetch(
			jsonResponse({
				status: "ZERO_RESULTS",
			}),
		);

		const result = await streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY);

		expect(result.candidates).toHaveLength(0);
		expect(result.coverage.distinctHeadings).toBe(0);
	});

	it("returns empty candidates when panorama is not found", async () => {
		mockFetch(
			jsonResponse({
				status: "NOT_FOUND",
			}),
		);

		const result = await streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY);

		expect(result.candidates).toHaveLength(0);
	});

	it("throws on missing API key", async () => {
		await expect(streetviewDiscover(TEST_LAT, TEST_LON, "")).rejects.toThrow(ToolError);
		await expect(streetviewDiscover(TEST_LAT, TEST_LON, "")).rejects.toThrow(/API key/);
	});

	it("throws on network error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("Connection refused"))),
		);

		await expect(streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY)).rejects.toThrow(ToolError);
		await expect(streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY)).rejects.toThrow(/request failed/i);
	});

	it("throws on non-200 API response", async () => {
		mockFetch(new Response("Internal Server Error", { status: 500 }));

		await expect(streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY)).rejects.toThrow(ToolError);
	});

	it("parses date without day by appending -01", async () => {
		mockFetch(
			jsonResponse({
				status: "OK",
				pano_id: "pano1",
				date: "2023-10",
			}),
		);

		const result = await streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY);
		expect(result.candidates[0].capturedAt).toBe("2023-10-01");
	});

	it("builds correct static URL", async () => {
		mockFetch(
			jsonResponse({
				status: "OK",
				pano_id: "pano1",
				lat: TEST_LAT,
				lng: TEST_LON,
			}),
		);

		const result = await streetviewDiscover(TEST_LAT, TEST_LON, TEST_KEY);
		const url0 = result.candidates[0].url;
		expect(url0).toContain("maps.googleapis.com/maps/api/streetview");
		expect(url0).toContain(`location=${TEST_LAT},${TEST_LON}`);
		expect(url0).toContain("heading=0");
		expect(url0).toContain("key=" + TEST_KEY);
	});
});
