/**
 * KartaView photo discovery.
 *
 * Queries the KartaView API for nearby photos and flags stale or
 * inconsistent records for human review.
 *
 * @param input - Coordinates, radius, and optional auth token
 * @returns Discovered photo records with flag annotations
 * @throws {ToolError} On API failure or rate-limit exhaustion
 */

import { ToolError, type DiscoverInput, type PhotoRecord } from './types.ts';

const KARTAVIEW_BASE = 'https://kartaview.org';
const MAX_CALLS_PER_HOUR_UNAUTH = 100;
const MAX_CALLS_PER_HOUR_AUTH = 1000;
const STALE_THRESHOLD_YEARS = 2;
const COORD_THRESHOLD_METERS = 50;

/** Simple in-memory rate-limit tracker (per-process) */
class RateLimitTracker {
	private callTimestamps: number[] = [];
	private maxPerHour: number;

	constructor(maxPerHour: number) {
		this.maxPerHour = maxPerHour;
	}

	setLimit(maxPerHour: number): void {
		this.maxPerHour = maxPerHour;
	}

	check(): void {
		const now = Date.now();
		const oneHour = 60 * 60 * 1000;
		this.callTimestamps = this.callTimestamps.filter((t) => now - t < oneHour);
		if (this.callTimestamps.length >= this.maxPerHour) {
			const oldestInWindow = this.callTimestamps[0];
			const waitMs = oneHour - (now - oldestInWindow) + 1000;
			throw new ToolError(
				`Rate limit of ${this.maxPerHour}/hr reached. Retry in ~${Math.ceil(waitMs / 60000)}m.`,
				'RATE_LIMITED',
				429,
			);
		}
		this.callTimestamps.push(now);
	}

	reset(): void {
		this.callTimestamps = [];
	}
}

// Singleton rate tracker for the process
const rateTracker = new RateLimitTracker(MAX_CALLS_PER_HOUR_UNAUTH);

export function setRateLimit(maxPerHour: number): void {
	rateTracker.setLimit(maxPerHour);
}

export function resetRateLimit(): void {
	rateTracker.reset();
}

interface NearbyPhotosResponse {
	sequences?: Array<{
		id: number;
		photoId: number;
		lat: number;
		lon: number;
		heading: number;
		capturedAt: string;
	}>;
}

interface PhotoDetailResponse {
	id: number;
	sequenceId: number;
	capturedAt: string;
	lat: number;
	lon: number;
	heading: number;
	url: string;
}

/**
 * Compute approximate distance in meters between two coordinates (Haversine).
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6_371_000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dlat = toRad(lat2 - lat1);
	const dlon = toRad(lon2 - lon1);
	const a =
		Math.sin(dlat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a date string is more than N years in the past.
 */
function isOlderThanYears(dateStr: string, years: number): boolean {
	const then = new Date(dateStr).getTime();
	if (Number.isNaN(then)) return false;
	const cutoff = Date.now() - years * 365.25 * 24 * 60 * 60 * 1000;
	return then < cutoff;
}

/**
 * Discover nearby KartaView photos.
 *
 * Calls /1.0/list/nearby-photos then /1.0/photo per sequence.
 * Flags stale records (>2yr) and inconsistent coordinates (>50m from query).
 */
export async function kartaviewDiscover(input: DiscoverInput): Promise<{
	queryPoint: { lat: number; lon: number };
	radiusMeters: number;
	candidates: PhotoRecord[];
	stats: { totalDiscovered: number; flagged: number };
}> {
	const { lat, lon, radiusMeters, authToken } = input;

	// Set rate limit based on auth status
	if (authToken) {
		rateTracker.setLimit(MAX_CALLS_PER_HOUR_AUTH);
	} else {
		rateTracker.setLimit(MAX_CALLS_PER_HOUR_UNAUTH);
	}

	// Step 1: Get nearby photo sequences
	rateTracker.check();
	const listUrl = `${KARTAVIEW_BASE}/1.0/list/nearby-photos?lat=${lat}&lng=${lon}&radius=${radiusMeters}`;
	const headers: Record<string, string> = { 'User-Agent': 'pi-geosint-agent/0.1.0' };
	if (authToken) {
		headers['Authorization'] = `Bearer ${authToken}`;
	}

	let listResponse: Response;
	try {
		listResponse = await fetch(listUrl, { headers, signal: AbortSignal.timeout(15_000) });
	} catch (err) {
		throw new ToolError(
			`KartaView list request failed: ${err instanceof Error ? err.message : String(err)}`,
			'NETWORK_ERROR',
		);
	}

	if (!listResponse.ok) {
		throw new ToolError(
			`KartaView list returned ${listResponse.status} ${listResponse.statusText}`,
			'API_ERROR',
			listResponse.status,
		);
	}

	let nearbyData: NearbyPhotosResponse;
	try {
		nearbyData = (await listResponse.json()) as NearbyPhotosResponse;
	} catch {
		throw new ToolError('Invalid JSON from KartaView list endpoint', 'PARSE_ERROR');
	}

	const sequences = nearbyData.sequences ?? [];

	// Step 2: For each sequence, fetch photo details
	const candidates: PhotoRecord[] = [];
	for (const seq of sequences) {
		rateTracker.check();
		const detailUrl = `${KARTAVIEW_BASE}/1.0/photo?sequenceId=${seq.id}`;
		let detailResponse: Response;
		try {
			detailResponse = await fetch(detailUrl, { headers, signal: AbortSignal.timeout(15_000) });
		} catch (err) {
			// Log but don't throw — continue with next sequence
			console.error(`Failed to fetch detail for sequence ${seq.id}: ${err instanceof Error ? err.message : String(err)}`);
			continue;
		}

		if (!detailResponse.ok) {
			console.error(`KartaView detail returned ${detailResponse.status} for sequence ${seq.id}`);
			continue;
		}

		let detail: PhotoDetailResponse;
		try {
			detail = (await detailResponse.json()) as PhotoDetailResponse;
		} catch {
			console.error(`Invalid JSON for sequence ${seq.id}`);
			continue;
		}

		// Check for staleness and coordinate inconsistency
		let flagged = false;
		const reasons: string[] = [];

		if (isOlderThanYears(detail.capturedAt, STALE_THRESHOLD_YEARS)) {
			flagged = true;
			reasons.push(`capturedAt >${STALE_THRESHOLD_YEARS} years old`);
		}

		const distance = haversineMeters(lat, lon, detail.lat, detail.lon);
		if (distance > COORD_THRESHOLD_METERS) {
			flagged = true;
			reasons.push(`coordinates ~${Math.round(distance)}m from query point`);
		}

		candidates.push({
			sequenceId: detail.sequenceId,
			photoId: detail.id,
			lat: detail.lat,
			lon: detail.lon,
			heading: detail.heading,
			capturedAt: detail.capturedAt,
			url: detail.url,
			flagged,
			flagReason: reasons.length > 0 ? reasons.join('; ') : null,
		});
	}

	const flaggedCount = candidates.filter((c) => c.flagged).length;

	return {
		queryPoint: { lat, lon },
		radiusMeters,
		candidates,
		stats: {
			totalDiscovered: candidates.length,
			flagged: flaggedCount,
		},
	};
}
