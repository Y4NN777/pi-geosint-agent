/**
 * Unit tests for heading-utils: headingToBucket and computeCoverage.
 */

import { describe, expect, it } from "vitest";
import { computeCoverage, headingToBucket } from "../src/heading-utils.ts";

describe("headingToBucket", () => {
	it("maps north (337.5 - 360)", () => {
		expect(headingToBucket(0)).toBe("N");
		expect(headingToBucket(10)).toBe("N");
		expect(headingToBucket(22.4)).toBe("N");
		expect(headingToBucket(340)).toBe("N");
		expect(headingToBucket(359)).toBe("N");
	});

	it("maps north (0 - 22.5)", () => {
		expect(headingToBucket(0)).toBe("N");
		expect(headingToBucket(10)).toBe("N");
		expect(headingToBucket(22.4)).toBe("N");
	});

	it("maps northeast (22.5 - 67.5)", () => {
		expect(headingToBucket(22.5)).toBe("NE");
		expect(headingToBucket(45)).toBe("NE");
		expect(headingToBucket(67.4)).toBe("NE");
	});

	it("maps east (67.5 - 112.5)", () => {
		expect(headingToBucket(67.5)).toBe("E");
		expect(headingToBucket(90)).toBe("E");
		expect(headingToBucket(112.4)).toBe("E");
	});

	it("maps southeast (112.5 - 157.5)", () => {
		expect(headingToBucket(112.5)).toBe("SE");
		expect(headingToBucket(135)).toBe("SE");
		expect(headingToBucket(157.4)).toBe("SE");
	});

	it("maps south (157.5 - 202.5)", () => {
		expect(headingToBucket(157.5)).toBe("S");
		expect(headingToBucket(180)).toBe("S");
		expect(headingToBucket(202.4)).toBe("S");
	});

	it("maps southwest (202.5 - 247.5)", () => {
		expect(headingToBucket(202.5)).toBe("SW");
		expect(headingToBucket(225)).toBe("SW");
		expect(headingToBucket(247.4)).toBe("SW");
	});

	it("maps west (247.5 - 292.5)", () => {
		expect(headingToBucket(247.5)).toBe("W");
		expect(headingToBucket(270)).toBe("W");
		expect(headingToBucket(292.4)).toBe("W");
	});

	it("maps northwest (292.5 - 337.5)", () => {
		expect(headingToBucket(292.5)).toBe("NW");
		expect(headingToBucket(315)).toBe("NW");
		expect(headingToBucket(337.4)).toBe("NW");
	});

	it("normalizes negative angles", () => {
		expect(headingToBucket(-10)).toBe("N"); // 350 → N
		expect(headingToBucket(-90)).toBe("W"); // 270 → W
		expect(headingToBucket(-180)).toBe("S"); // 180 → S
	});

	it("normalizes angles above 360", () => {
		expect(headingToBucket(450)).toBe("E"); // 90 → E
		expect(headingToBucket(720)).toBe("N"); // 0 → N
	});
});

describe("computeCoverage", () => {
	it("returns empty coverage for no headings", () => {
		const result = computeCoverage([]);
		expect(result.distinctHeadings).toBe(0);
		expect(result.bucketsPresent).toEqual([]);
		expect(result.bucketsMissing).toHaveLength(8);
		expect(result.angleSpread).toBe(0);
	});

	it("detects single-heading coverage", () => {
		const result = computeCoverage([90]);
		expect(result.distinctHeadings).toBe(1);
		expect(result.bucketsPresent).toEqual(["E"]);
		expect(result.bucketsMissing).toHaveLength(7);
		expect(result.angleSpread).toBe(0);
	});

	it("detects multi-heading coverage within same bucket", () => {
		const result = computeCoverage([80, 90, 100]);
		expect(result.distinctHeadings).toBe(1);
		expect(result.bucketsPresent).toEqual(["E"]);
		expect(result.angleSpread).toBe(20);
	});

	it("detects coverage across multiple buckets", () => {
		const result = computeCoverage([0, 90, 180, 270]);
		expect(result.distinctHeadings).toBe(4);
		expect(result.bucketsPresent).toEqual(["N", "E", "S", "W"]);
		expect(result.bucketsMissing).toEqual(["NE", "SE", "SW", "NW"]);
	});

	it("reports 8-bucket full coverage", () => {
		const result = computeCoverage([0, 45, 90, 135, 180, 225, 270, 315]);
		expect(result.distinctHeadings).toBe(8);
		expect(result.bucketsPresent).toHaveLength(8);
		expect(result.bucketsMissing).toEqual([]);
	});

	it("calculates angle spread for sorted headings", () => {
		const result = computeCoverage([10, 350]);
		expect(result.angleSpread).toBe(340);
	});
});
