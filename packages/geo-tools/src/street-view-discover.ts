/**
 * Google Street View discovery module.
 * Mirrors kartaview-discover.ts shape: input → candidate records + coverage.
 *
 * Uses:
 *   - Street View Metadata API — check panorama availability
 *   - Street View Static API   — build capture URLs for 4 headings
 *
 * API key must have Street View Static API enabled. Billing required.
 */

import { computeCoverage, headingToBucket } from "./heading-utils.ts";
import { type CoverageInfo, type PhotoRecord, type Source, ToolError } from "./types.ts";

const METADATA_BASE = "https://maps.googleapis.com/maps/api/streetview/metadata";
const STATIC_BASE = "https://maps.googleapis.com/maps/api/streetview";
const TIMEOUT_MS = 15_000;
const IMAGE_SIZE = "640x640";
const SOURCE: Source = "google-streetview";
const HEADINGS = [0, 90, 180, 270];

interface StreetViewMetadataResponse {
	status: string;
	pano_id?: string;
	lat?: number;
	lng?: number;
	date?: string;
	copyright?: string;
}

function parseDate(dateStr: string | undefined): string | null {
	if (!dateStr) return null;
	return dateStr.length <= 7 ? `${dateStr}-01` : dateStr;
}

function buildStaticUrl(lat: number, lon: number, heading: number, apiKey: string): string {
	return `${STATIC_BASE}?location=${lat},${lon}&size=${IMAGE_SIZE}&heading=${heading}&pitch=0&fov=90&key=${apiKey}`;
}

/**
 * Check if Google Street View has imagery at a coordinate.
 * Returns the metadata response, or null if none found.
 */
async function checkAvailability(lat: number, lon: number, apiKey: string): Promise<StreetViewMetadataResponse | null> {
	const url = `${METADATA_BASE}?location=${lat},${lon}&key=${apiKey}`;
	let resp: Response;
	try {
		resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (err) {
		throw new ToolError(
			`Street View metadata request failed: ${err instanceof Error ? err.message : String(err)}`,
			"NETWORK_ERROR",
		);
	}
	if (!resp.ok) {
		throw new ToolError(`Street View metadata returned ${resp.status}`, "API_ERROR", resp.status);
	}
	const data = (await resp.json()) as StreetViewMetadataResponse;
	if (data.status !== "OK" || !data.pano_id) return null;
	return data;
}

/**
 * Discover Street View imagery at a coordinate.
 * Mirrors kartaview-discover shape.
 * Returns up to 4 candidates (one per heading: 0, 90, 180, 270).
 * Google returns the single nearest panorama; this splits it into 4 heading views.
 */
export async function streetviewDiscover(
	lat: number,
	lon: number,
	apiKey: string,
): Promise<{ candidates: PhotoRecord[]; coverage: CoverageInfo }> {
	if (!apiKey) {
		throw new ToolError("Google Maps API key is required for Street View", "MISSING_API_KEY");
	}

	const metadata = await checkAvailability(lat, lon, apiKey);
	if (!metadata) {
		return { candidates: [], coverage: computeCoverage([]) };
	}

	const panoId = metadata.pano_id!;
	const capturedAt = parseDate(metadata.date);
	const snappedLat = metadata.lat ?? lat;
	const snappedLon = metadata.lng ?? lon;

	const candidates: PhotoRecord[] = HEADINGS.map((heading) => ({
		source: SOURCE,
		id: `${panoId}_${heading}`,
		lat: snappedLat,
		lon: snappedLon,
		heading,
		capturedAt,
		url: buildStaticUrl(snappedLat, snappedLon, heading, apiKey),
		sequenceId: panoId,
		flagged: false,
		flagReason: null,
		headingBucket: "N", // computed below via computeCoverage
	}));

	const coverage = computeCoverage(HEADINGS);
	for (const c of candidates) {
		c.headingBucket = headingToBucket(c.heading);
	}

	return { candidates, coverage };
}
