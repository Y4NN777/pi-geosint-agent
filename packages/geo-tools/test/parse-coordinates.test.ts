import { describe, expect, it } from "vitest";
import { parseCoordinates } from "../src/parse-coordinates.ts";

describe("parseCoordinates", () => {
	it("parses decimal degrees with comma separator", () => {
		const r = parseCoordinates("48.8566, 2.3522");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8566, 4);
			expect(r.lon).toBeCloseTo(2.3522, 4);
		}
	});

	it("parses decimal degrees with space separator", () => {
		const r = parseCoordinates("48.8566 2.3522");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8566, 4);
			expect(r.lon).toBeCloseTo(2.3522, 4);
		}
	});

	it("parses decimal degrees with slash separator", () => {
		const r = parseCoordinates("48.8566/2.3522");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8566, 4);
			expect(r.lon).toBeCloseTo(2.3522, 4);
		}
	});

	it("parses DMS format", () => {
		const r = parseCoordinates("48°51'24\"N 2°17'40\"E");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8567, 3);
			expect(r.lon).toBeCloseTo(2.2944, 3);
		}
	});

	it("parses DDM format", () => {
		const r = parseCoordinates("48 51.4' N 2°17.7' E");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8567, 3);
			expect(r.lon).toBeCloseTo(2.295, 3);
		}
	});

	it("parses Google Maps URL (?q= format)", () => {
		const r = parseCoordinates("https://maps.google.com/?q=48.8566,2.3522");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8566, 4);
			expect(r.lon).toBeCloseTo(2.3522, 4);
		}
	});

	it("parses Google Maps URL (@ format)", () => {
		const r = parseCoordinates("https://maps.google.com/@48.8566,2.3522,15z");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(48.8566, 4);
			expect(r.lon).toBeCloseTo(2.3522, 4);
		}
	});

	it("handles southern hemisphere", () => {
		const r = parseCoordinates("33.8688, 151.2093");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(33.8688, 4);
			expect(r.lon).toBeCloseTo(151.2093, 4);
		}
	});

	it("rejects lon,lat order (GeoJSON convention)", () => {
		const r = parseCoordinates("151.2093, -33.8688");
		expect(r.ok).toBe(false);
	});

	it("rejects empty input", () => {
		const r = parseCoordinates("");
		expect(r.ok).toBe(false);
	});

	it("rejects whitespace-only input", () => {
		const r = parseCoordinates("   ");
		expect(r.ok).toBe(false);
	});

	it("rejects completely unrecognised format", () => {
		const r = parseCoordinates("some random text");
		expect(r.ok).toBe(false);
	});

	it("returns helpful error for Plus Codes", () => {
		const r = parseCoordinates("8FW4V75V+");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("Plus Code");
		}
	});

	it("parses DMS with southern/western directions", () => {
		const r = parseCoordinates("33°52'10\"S 151°12'30\"E");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(-33.8694, 3);
			expect(r.lon).toBeCloseTo(151.2083, 3);
		}
	});

	it("parses negative decimal degrees (south/west)", () => {
		const r = parseCoordinates("-33.8688, 151.2093");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.lat).toBeCloseTo(-33.8688, 4);
			expect(r.lon).toBeCloseTo(151.2093, 4);
		}
	});
});
