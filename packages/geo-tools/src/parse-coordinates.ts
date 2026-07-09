import type { ParseResult } from "./types.ts";

const GMAPS_RE = /(?:maps\.google\.[a-z]+\/)(?:\?q=|@)([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/;
const DD_RE = /^([+-]?\d{1,3}(?:\.\d+)?)\s*[,/\s]\s*([+-]?\d{1,3}(?:\.\d+)?)$/;
const PLUS_CODE_PREFIX_RE = /^[23456789CFGHJMPQRVWX]{2,}\+/;

function dmsComponent(raw: string): Array<{ deg: string; min?: string; sec?: string; dir: string }> {
	const parts: Array<{ deg: string; min?: string; sec?: string; dir: string }> = [];
	const tokenRe =
		/([+-]?\d+(?:\.\d+)?)\s*[°d]?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])/gi;
	for (const m of raw.matchAll(tokenRe)) {
		if (m[4] && m[1]) {
			parts.push({ deg: m[1], min: m[2], sec: m[3], dir: m[4].toUpperCase() });
		}
	}
	return parts;
}

function dmsToDecimal(deg: string, min: string | undefined, sec: string | undefined, dir: string): number {
	let val = parseFloat(deg);
	if (min) val += parseFloat(min) / 60;
	if (sec) val += parseFloat(sec) / 3600;
	if (dir === "S" || dir === "W") val = -val;
	return val;
}

function isValidLat(lat: number): boolean {
	return lat >= -90 && lat <= 90;
}

function isValidLon(lon: number): boolean {
	return lon >= -180 && lon <= 180;
}

function validateCoordPair(first: number, second: number): ParseResult {
	if (!isValidLat(first)) {
		if (isValidLon(first) && isValidLat(second)) {
			return {
				ok: false,
				error: `Value ${first} is outside latitude range [-90, 90] but is valid as longitude. The pair appears to be in lon,lat order (GeoJSON convention). Rejected to avoid a confidently wrong location.`,
			};
		}
		return { ok: false, error: `First value ${first} is not a valid latitude (-90..90)` };
	}
	if (!isValidLon(second)) {
		return { ok: false, error: `Second value ${second} is not a valid longitude (-180..180)` };
	}
	return { ok: true, lat: first, lon: second };
}

function parseGoogleMapsUrl(raw: string): ParseResult {
	const m = GMAPS_RE.exec(raw);
	if (!m) return { ok: false, error: "Not a Google Maps URL" };
	return validateCoordPair(parseFloat(m[1]), parseFloat(m[2]));
}

function parseDecimalDegrees(raw: string): ParseResult {
	const m = DD_RE.exec(raw.trim());
	if (!m) return { ok: false, error: "Not decimal degrees" };
	return validateCoordPair(parseFloat(m[1]), parseFloat(m[2]));
}

function parseDms(raw: string): ParseResult {
	const parts = dmsComponent(raw);
	if (parts.length < 2) return { ok: false, error: "Not a DMS/DDM pair" };

	const lat = dmsToDecimal(parts[0].deg, parts[0].min, parts[0].sec, parts[0].dir);
	const lon = dmsToDecimal(parts[1].deg, parts[1].min, parts[1].sec, parts[1].dir);
	return validateCoordPair(lat, lon);
}

/**
 * Parse a coordinate string in any supported format.
 * Deterministic normalisation step that runs before stage 01.
 *
 * Supported: DD (48.8566, 2.3522), DMS (48°51'24"N 2°17'40"E),
 * DDM (48 51.4' N 2°17.7' E), Google Maps URL, Plus Codes (stub).
 */
export function parseCoordinates(raw: string): ParseResult {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: false, error: "Empty input" };

	const gmaps = parseGoogleMapsUrl(trimmed);
	if (gmaps.ok) return gmaps;

	const dms = parseDms(trimmed);
	if (dms.ok) return dms;

	const dd = parseDecimalDegrees(trimmed);
	if (dd.ok) return dd;

	if (PLUS_CODE_PREFIX_RE.test(trimmed)) {
		return {
			ok: false,
			error: "Plus Code detected. To enable Plus Code parsing, install: npm install open-location-code",
		};
	}

	return {
		ok: false,
		error: `Could not parse "${raw}". Supported: DD (48.85, 2.35), DMS (48°51'24"N 2°17'40"E), DDM (48°51.4'N 2°17.7'E), Google Maps URL.`,
	};
}
