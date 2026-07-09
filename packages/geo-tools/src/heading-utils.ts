import type { CoverageInfo, HeadingBucket } from "./types.ts";

const ALL_BUCKETS: HeadingBucket[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const HEADING_RANGES: Array<{ bucket: HeadingBucket; min: number; max: number }> = [
	{ bucket: "N", min: 337.5, max: 360 },
	{ bucket: "N", min: 0, max: 22.5 },
	{ bucket: "NE", min: 22.5, max: 67.5 },
	{ bucket: "E", min: 67.5, max: 112.5 },
	{ bucket: "SE", min: 112.5, max: 157.5 },
	{ bucket: "S", min: 157.5, max: 202.5 },
	{ bucket: "SW", min: 202.5, max: 247.5 },
	{ bucket: "W", min: 247.5, max: 292.5 },
	{ bucket: "NW", min: 292.5, max: 337.5 },
];

export function headingToBucket(heading: number): HeadingBucket {
	const h = ((heading % 360) + 360) % 360;
	for (const r of HEADING_RANGES) {
		if (h >= r.min && h < r.max) return r.bucket;
	}
	return "N";
}

export function computeCoverage(headings: number[]): CoverageInfo {
	if (headings.length === 0) {
		return { distinctHeadings: 0, bucketsPresent: [], bucketsMissing: ALL_BUCKETS, angleSpread: 0 };
	}
	const bucketSet = new Set(headings.map(headingToBucket));
	const present = ALL_BUCKETS.filter((b) => bucketSet.has(b));
	const missing = ALL_BUCKETS.filter((b) => !bucketSet.has(b));
	const sorted = [...headings].sort((a, b) => a - b);
	const spread = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0;
	return { distinctHeadings: bucketSet.size, bucketsPresent: present, bucketsMissing: missing, angleSpread: spread };
}
