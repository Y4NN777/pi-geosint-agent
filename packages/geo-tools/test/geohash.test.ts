/**
 * Unit tests for geohash encoding utilities.
 */

import { describe, expect, it } from "vitest";
import { geohash7, geohashNeighbours } from "../src/geohash.ts";

// Known geohash-7 values verified against external references:
//   https://www.movable-type.co.uk/scripts/geohash.html
//   https://geohash.softeng.co/
describe("geohash7", () => {
	it("encodes Null Island (0, 0) as s000000", () => {
		expect(geohash7(0, 0)).toBe("s000000");
	});

	it("encodes London (~51.5, ~-0.13) as gcpvj0d", () => {
		expect(geohash7(51.5074, -0.1278)).toBe("gcpvj0d");
	});

	it("encodes Tokyo (~35.68, ~139.65) as xn76cyd", () => {
		expect(geohash7(35.6762, 139.6503)).toBe("xn76cyd");
	});

	it("encodes Sydney (~-33.87, ~151.21) as r3gx2f7", () => {
		expect(geohash7(-33.8688, 151.2093)).toBe("r3gx2f7");
	});

	it("encodes North Pole (90, 0) as upbpbpb", () => {
		expect(geohash7(90, 0)).toBe("upbpbpb");
	});

	it("encodes South Pole (-90, 0) as h000000", () => {
		expect(geohash7(-90, 0)).toBe("h000000");
	});

	it("respects the precision parameter", () => {
		expect(geohash7(51.5074, -0.1278, 1)).toBe("g");
		expect(geohash7(51.5074, -0.1278, 3)).toBe("gcp");
		expect(geohash7(51.5074, -0.1278, 5)).toBe("gcpvj");
		expect(geohash7(51.5074, -0.1278, 7)).toBe("gcpvj0d");
		expect(geohash7(51.5074, -0.1278, 12).length).toBe(12);
	});

	it("produces consistent results for the same coordinates", () => {
		const a = geohash7(48.8566, 2.3522);
		const b = geohash7(48.8566, 2.3522);
		expect(a).toBe(b);
	});

	it("produces different hashes for distant coordinates", () => {
		const london = geohash7(51.5074, -0.1278);
		const tokyo = geohash7(35.6762, 139.6503);
		expect(london).not.toBe(tokyo);
	});
});

describe("geohashNeighbours", () => {
	it("returns unique hashes including the center", () => {
		const result = geohashNeighbours("gcpvj0p");
		// Center + 8 directions (some may be same hash = deduplicated)
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result.length).toBeLessThanOrEqual(9);
		// No duplicates
		expect(new Set(result).size).toBe(result.length);
		// Center hash included
		expect(result).toContain("gcpvj0p");
	});

	it("returns multiple neighbours for most regions", () => {
		const result = geohashNeighbours("xn774c0"); // Tokyo
		expect(result.length).toBeGreaterThan(1);
	});

	it("all returned hashes match the input precision", () => {
		const result = geohashNeighbours("gcp");
		for (const h of result) {
			expect(h.length).toBe(3);
		}
	});

	it("handles the south pole (all zeros)", () => {
		const result = geohashNeighbours("0000000");
		expect(result).toContain("0000000");
		for (const h of result) {
			expect(h.length).toBe(7);
		}
	});

	it("produces valid base32 characters", () => {
		const validChars = new Set("0123456789bcdefghjkmnpqrstuvwxyz");
		const result = geohashNeighbours("gcpvj0p");
		for (const h of result) {
			for (const c of h) {
				expect(validChars.has(c)).toBe(true);
			}
		}
	});
});
