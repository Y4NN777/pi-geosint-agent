/**
 * Geo-OSINT agent shared types for tool inputs/outputs.
 */

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

/** KartaView photo discovery */
export interface DiscoverInput {
	lat: number;
	lon: number;
	radiusMeters: number;
	authToken?: string;
}

export interface PhotoRecord {
	sequenceId: number;
	photoId: number;
	lat: number;
	lon: number;
	heading: number;
	capturedAt: string; // ISO 8601
	url: string;
	flagged: boolean;
	flagReason: string | null;
}

export interface DiscoverResult {
	queryPoint: { lat: number; lon: number };
	radiusMeters: number;
	candidates: PhotoRecord[];
	stats: {
		totalDiscovered: number;
		flagged: number;
	};
}

/** Capture results */
export interface CaptureDirectInput {
	photoId: number;
	url: string;
}

export interface CaptureDirectResult {
	path: string;
	sha256: string;
	bytes: number;
}

export interface CaptureRenderInput {
	url: string;
}

export interface CaptureRenderResult {
	path: string;
	sha256: string;
}

/** Evidence storage */
export interface StoreEvidenceInput {
	photoId: number;
	sequenceId: number;
	lat: number;
	lon: number;
	heading: number;
	capturedAt: string;
	sha256: string;
	filePath: string;
	sourceUrl: string;
	captureMethod: 'direct' | 'render';
	sizeBytes: number;
	flagged: boolean;
	flagReason: string | null;
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

/** Typed errors for deterministic tools */
export class ToolError extends Error {
	readonly code: string;
	readonly statusCode?: number;

	constructor(
		message: string,
		code: string,
		statusCode?: number,
	) {
		super(message);
		this.name = 'ToolError';
		this.code = code;
		this.statusCode = statusCode;
	}
}
