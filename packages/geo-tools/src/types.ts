/**
 * Geo-OSINT agent shared types for tool inputs/outputs.
 */

/** Supported imagery sources */
export type Source = "kartaview" | "google-streetview";

/** Heading buckets for coverage reporting */
export type HeadingBucket = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** Coordinate parsing result */
export type ParseResult = { ok: true; lat: number; lon: number } | { ok: false; error: string };

/** Reverse geocode result */
export interface ReverseGeocodeInput {
	lat: number;
	lon: number;
}

export interface ReverseGeocodeResult {
	address: string;
	confidence: number;
	alternates?: Array<{ address: string; confidence: number }>;
}

/** Multi-source discovery input */
export interface DiscoverInput {
	lat: number;
	lon: number;
	radiusMeters: number;
	kartaviewAuthToken?: string;
	googleMapsApiKey?: string;
}

export interface PhotoRecord {
	source: Source;
	id: string;
	lat: number;
	lon: number;
	heading: number;
	capturedAt: string | null;
	url: string;
	sequenceId: string;
	flagged: boolean;
	flagReason: string | null;
	headingBucket: HeadingBucket;
}

/** Heading coverage per location */
export interface CoverageInfo {
	distinctHeadings: number;
	bucketsPresent: HeadingBucket[];
	bucketsMissing: HeadingBucket[];
	angleSpread: number;
}

export interface DiscoverResult {
	queryPoint: { lat: number; lon: number };
	radiusMeters: number;
	candidates: PhotoRecord[];
	coverage: CoverageInfo;
	stats: {
		totalDiscovered: number;
		flagged: number;
		kartaviewCount: number;
		googleStreetviewCount: number;
	};
}

/** Capture results */
export interface CaptureDirectInput {
	source: Source;
	id: string;
	url: string;
}

export interface CaptureDirectResult {
	path: string;
	sha256: string;
	bytes: number;
}

export interface CaptureRenderInput {
	url: string;
	outputDir?: string;
	zoomLevels?: string[];
}

export interface CaptureRenderResult {
	path: string;
	sha256: string;
}

/** Evidence storage */
export interface StoreEvidenceInput {
	source: Source;
	id: string;
	lat: number;
	lon: number;
	heading: number;
	capturedAt: string | null;
	sha256: string;
	filePath: string;
	sourceUrl: string;
	captureMethod: "direct" | "render";
	sizeBytes: number;
	flagged: boolean;
	flagReason: string | null;
	sequenceId?: string;
}

export interface StoreEvidenceResult {
	path: string;
	sidecarPath: string;
	sha256: string;
	geohash7: string;
}

/** Geohash history query */
export interface GeohashHistoryInput {
	geohash: string;
	radiusBuckets?: number;
}

export interface GeohashHistoryRecord {
	capturedAt: string;
	source: string;
	path: string;
}

/** Google Street View metadata API response shape */
export interface StreetViewMetadata {
	status: "OK" | "ZERO_RESULTS" | "NOT_FOUND";
	pano_id?: string;
	lat?: number;
	lng?: number;
	date?: string;
	copyright?: string;
}

/** Typed errors for deterministic tools */
export class ToolError extends Error {
	readonly code: string;
	readonly statusCode?: number;

	constructor(message: string, code: string, statusCode?: number) {
		super(message);
		this.name = "ToolError";
		this.code = code;
		this.statusCode = statusCode;
	}
}
