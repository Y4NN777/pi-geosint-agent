/**
 * Google Street View discovery and capture.
 *
 * Uses two Google Maps APIs:
 *   - Street View Metadata API — check availability, get pano_id + date
 *   - Street View Static API   — download the actual image bytes
 *
 * API key must have Street View Static API enabled in Google Cloud Console.
 * Billing required beyond $200/month free credit.
 */

import { type StreetViewMetadata, type StreetViewResult, ToolError } from "./types.ts";

const METADATA_BASE = "https://maps.googleapis.com/maps/api/streetview/metadata";
const STATIC_BASE = "https://maps.googleapis.com/maps/api/streetview";

const TIMEOUT_MS = 15_000;
const DEFAULT_HEADING = 0;
const DEFAULT_PITCH = 0;
const DEFAULT_FOV = 90;
const IMAGE_SIZE = "640x640";

/**
 * Check Street View availability and return metadata for a location.
 * Returns null when no panorama exists at or near the coordinates.
 */
export async function streetviewMetadata(lat: number, lon: number, apiKey: string): Promise<StreetViewMetadata | null> {
	if (!apiKey) {
		throw new ToolError("Google Maps API key is required for Street View", "MISSING_API_KEY");
	}

	const url = `${METADATA_BASE}?location=${lat},${lon}&key=${apiKey}`;

	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (err) {
		throw new ToolError(
			`Street View metadata request failed: ${err instanceof Error ? err.message : String(err)}`,
			"NETWORK_ERROR",
		);
	}

	if (!response.ok) {
		throw new ToolError(
			`Street View metadata returned ${response.status} ${response.statusText}`,
			"API_ERROR",
			response.status,
		);
	}

	let data: StreetViewMetadata;
	try {
		data = (await response.json()) as StreetViewMetadata;
	} catch {
		throw new ToolError("Invalid JSON from Street View metadata endpoint", "PARSE_ERROR");
	}

	if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") {
		return null;
	}

	if (data.status !== "OK" || !data.pano_id) {
		return null;
	}

	return data;
}

/**
 * Discover Street View imagery at a coordinate.
 * Returns a single result (Google returns the nearest panorama).
 */
export async function streetviewDiscover(lat: number, lon: number, apiKey: string): Promise<StreetViewResult | null> {
	const metadata = await streetviewMetadata(lat, lon, apiKey);
	if (!metadata) return null;

	// Build the direct image URL (Static API)
	const imageUrl = `${STATIC_BASE}?location=${lat},${lon}&size=${IMAGE_SIZE}&heading=${DEFAULT_HEADING}&pitch=${DEFAULT_PITCH}&fov=${DEFAULT_FOV}&key=${apiKey}`;

	// Parse date — Street View Metadata returns "YYYY-MM" or "YYYY"
	let capturedAt: string | null = null;
	if (metadata.date) {
		// If only "YYYY-MM", append "-01" to make ISO-8601 date
		capturedAt = metadata.date.length <= 7 ? `${metadata.date}-01` : metadata.date;
	}

	return {
		source: "google-streetview",
		panoId: metadata.pano_id!,
		lat: metadata.lat ?? lat,
		lon: metadata.lng ?? lon,
		heading: DEFAULT_HEADING,
		capturedAt,
		imageUrl,
		metadataUrl: `${METADATA_BASE}?location=${lat},${lon}&key=${apiKey}`,
	};
}

/**
 * Perform a multi-angle Street View capture (0, 90, 180, 270 degree headings).
 * Google Street View only allows one heading per request, so this
 * captures 4 angles around the location.
 *
 * Returns one CaptureDirectResult per angle.
 */
export async function streetviewCaptureMulti(
	lat: number,
	lon: number,
	apiKey: string,
	panoId: string,
): Promise<Array<{ heading: number; url: string }>> {
	const headings = [0, 90, 180, 270];
	return headings.map((heading) => {
		const url = `${STATIC_BASE}?location=${lat},${lon}&size=${IMAGE_SIZE}&heading=${heading}&pitch=${DEFAULT_PITCH}&fov=${DEFAULT_FOV}&key=${apiKey}`;
		return { heading, url };
	});
}
