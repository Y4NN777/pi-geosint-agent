/**
 * Reverse-geocode coordinates using Nominatim.
 *
 * Calls the configured OSM Nominatim endpoint and applies an ambiguity
 * heuristic: if the top result's confidence is within 0.15 of the second
 * result, or if two results are within 0.05 of each other, the alternates
 * are populated. This signals stage 01's Agent to decide whether to ask
 * the human.
 *
 * @param input - { lat, lon, endpoint? }
 * @returns Structured address with confidence scores
 * @throws {ToolError} On network failure or invalid response
 */

import { ToolError, type ReverseGeocodeInput, type ReverseGeocodeResult } from './types.ts';

interface NominatimResponse {
	display_name: string;
	importance: number;
	type: string;
	lat: string;
	lon: string;
}

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org';

/**
 * Reverse-geocode a coordinate pair via Nominatim.
 *
 * @param input - Latitude, longitude, and optional custom endpoint
 * @returns Resolved address with confidence scores and optional alternates
 */
export async function reverseGeocode(
	input: ReverseGeocodeInput & { endpoint?: string },
): Promise<ReverseGeocodeResult> {
	const { lat, lon } = input;
	const endpoint = input.endpoint ?? DEFAULT_ENDPOINT;
	const url = `${endpoint}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`;

	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		throw new ToolError(
			`Coordinates out of range: lat=${lat}, lon=${lon}`,
			'INVALID_COORDS',
		);
	}

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { 'User-Agent': 'pi-geosint-agent/0.1.0' },
			signal: AbortSignal.timeout(10_000),
		});
	} catch (err) {
		throw new ToolError(
			`Failed to reach geocoder: ${err instanceof Error ? err.message : String(err)}`,
			'NETWORK_ERROR',
		);
	}

	if (!response.ok) {
		throw new ToolError(
			`Geocoder returned ${response.status} ${response.statusText}`,
			'HTTP_ERROR',
			response.status,
		);
	}

	let data: NominatimResponse | NominatimResponse[];
	try {
		data = (await response.json()) as NominatimResponse | NominatimResponse[];
	} catch {
		throw new ToolError('Invalid JSON from geocoder', 'PARSE_ERROR');
	}

	// Normalize to array
	const results = Array.isArray(data) ? data : [data];

	if (results.length === 0) {
		throw new ToolError('No results found for coordinates', 'NO_RESULTS');
	}

	const top = results[0];
	const baseResult: ReverseGeocodeResult = {
		address: top.display_name,
		confidence: top.importance,
	};

	// Ambiguity check: only when we have 2+ results
	if (results.length >= 2) {
		const second = results[1];
		const diff = top.importance - second.importance;
		const alternates = results.slice(1, 4).map((r) => ({
			address: r.display_name,
			confidence: r.importance,
		}));

		// Thresholds from the build plan:
		// - top - second < 0.15 → ambiguous
		// - 2+ alternates within 0.05 of each other → ambiguous
		if (diff < 0.15 || hasCloseCluster(results, 0.05)) {
			baseResult.alternates = alternates;
		}
	}

	return baseResult;
}

/**
 * Check if any cluster of 2+ results have confidence values within `threshold` of each other.
 */
function hasCloseCluster(results: NominatimResponse[], threshold: number): boolean {
	const scores = results.map((r) => r.importance).sort((a, b) => b - a);
	for (let i = 0; i < scores.length - 1; i++) {
		for (let j = i + 1; j < Math.min(i + 3, scores.length); j++) {
			if (Math.abs(scores[i] - scores[j]) <= threshold) {
				return true;
			}
		}
	}
	return false;
}
