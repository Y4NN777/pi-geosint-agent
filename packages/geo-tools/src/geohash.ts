/**
 * Geohash encoding utility.
 *
 * Computes a 7-character geohash from lat/lon coordinates.
 * Precision at 7 characters is approximately ±150m.
 *
 * This is a minimal implementation with no external dependencies.
 * Based on the standard geohash algorithm (Gustavo Niemeyer, 2008).
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Compute a 7-character geohash for the given coordinates.
 *
 * @param lat - Latitude (-90 to 90)
 * @param lon - Longitude (-180 to 180)
 * @param precision - Number of characters (default: 7, precision ~150m)
 * @returns Geohash string
 */
export function geohash7(lat: number, lon: number, precision = 7): string {
	let minLat = -90;
	let maxLat = 90;
	let minLon = -180;
	let maxLon = 180;

	let hash = "";
	let bit = 0;
	let ch = 0;
	let even = true;

	while (hash.length < precision) {
		if (even) {
			const mid = (minLon + maxLon) / 2;
			if (lon >= mid) {
				ch = (ch << 1) | 1;
				minLon = mid;
			} else {
				ch = ch << 1;
				maxLon = mid;
			}
		} else {
			const mid = (minLat + maxLat) / 2;
			if (lat >= mid) {
				ch = (ch << 1) | 1;
				minLat = mid;
			} else {
				ch = ch << 1;
				maxLat = mid;
			}
		}
		even = !even;
		bit++;

		if (bit === 5) {
			hash += BASE32[ch];
			bit = 0;
			ch = 0;
		}
	}

	return hash;
}

/**
 * Compute neighbouring geohash buckets for expanded search.
 *
 * @param hash - A geohash string
 * @returns Array of neighbouring geohashes (same precision)
 */
export function geohashNeighbours(hash: string): string[] {
	const neighbours: string[] = [hash];
	const dirs = [
		[0, 1],
		[1, 0],
		[0, -1],
		[-1, 0],
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1],
	];

	const center = decodeGeohash(hash);
	for (const [dlat, dlon] of dirs) {
		// Approximate lat/lon shift for one geohash precision step
		const shiftLat = (90 / (1 << Math.ceil((hash.length * 5) / 2))) * dlat;
		const shiftLon = (180 / (1 << Math.ceil((hash.length * 5) / 2))) * dlon;
		const nlat = Math.max(-90, Math.min(90, center.lat + shiftLat));
		const nlon = center.lon + shiftLon;
		neighbours.push(geohash7(nlat, nlon, hash.length));
	}

	return [...new Set(neighbours)];
}

/** Decoded geohash center point */
function decodeGeohash(hash: string): { lat: number; lon: number } {
	let minLat = -90;
	let maxLat = 90;
	let minLon = -180;
	let maxLon = 180;
	let even = true;

	for (const c of hash) {
		const idx = BASE32.indexOf(c);
		if (idx === -1) {
			throw new Error(`Invalid geohash character: ${c}`);
		}
		for (let mask = 16; mask >= 1; mask >>= 1) {
			if (even) {
				const mid = (minLon + maxLon) / 2;
				if (idx & mask) {
					minLon = mid;
				} else {
					maxLon = mid;
				}
			} else {
				const mid = (minLat + maxLat) / 2;
				if (idx & mask) {
					minLat = mid;
				} else {
					maxLat = mid;
				}
			}
			even = !even;
		}
	}

	return {
		lat: (minLat + maxLat) / 2,
		lon: (minLon + maxLon) / 2,
	};
}
