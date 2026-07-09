/**
 * Query evidence history by geohash.
 *
 * Checks index.sqlite for prior captures near a given geohash bucket.
 * Lets stage 02's Agent avoid re-discovering or re-flagging areas
 * already in evidence.
 *
 * @param input - Geohash and optional radius for neighbouring buckets
 * @returns Array of prior capture records
 * @throws {ToolError} On database errors
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { geohashNeighbours } from './geohash.ts';
import { ToolError, type GeohashHistoryInput, type GeohashHistoryRecord } from './types.ts';

const DEFAULT_STORAGE_ROOT = 'evidence';

/**
 * Check for prior captures near the given geohash.
 *
 * @param input - { geohash, radiusBuckets?, storageRoot? }
 * @returns Array of prior capture records (empty array on first run)
 * @throws {ToolError} On database query failure
 */
export function checkGeohashHistory(
	input: GeohashHistoryInput & { storageRoot?: string },
): GeohashHistoryRecord[] {
	const { geohash: gh, radiusBuckets } = input;
	const root = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
	const dbPath = join(root, 'index.sqlite');

	// First run — no table yet, return empty
	if (!existsSync(dbPath)) {
		return [];
	}

	let db: DatabaseSync;
	try {
		db = new DatabaseSync(dbPath);
	} catch (err) {
		throw new ToolError(
			`Cannot open index.sqlite: ${err instanceof Error ? err.message : String(err)}`,
			'DB_ERROR',
		);
	}

	try {
		// Verify the evidence table exists
		const tableCheck = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'")
			.get() as { name: string } | undefined;

		if (!tableCheck) {
			return [];
		}

		// Query for the given geohash and optionally its neighbours
		const buckets = radiusBuckets && radiusBuckets > 0
			? geohashNeighbours(gh)
			: [gh];

		const placeholders = buckets.map(() => '?').join(',');
		const rows = db
			.prepare(
				`SELECT captured_at, source, file_path as path
				 FROM evidence
				 WHERE geohash7 IN (${placeholders})
				 ORDER BY captured_at DESC`,
			)
			.all(...buckets) as Array<{ captured_at: string; source: string; path: string }>;

		return rows.map((r) => ({
			capturedAt: r.captured_at,
			source: r.source,
			path: r.path,
		}));
	} catch (err) {
		throw new ToolError(
			`Geohash history query failed: ${err instanceof Error ? err.message : String(err)}`,
			'QUERY_ERROR',
		);
	} finally {
		db.close();
	}
}
