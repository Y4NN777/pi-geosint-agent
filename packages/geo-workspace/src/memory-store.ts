/**
 * Memory store — SQLite database management for evidence index
 * and human-override corrections.
 *
 * Schemas mirror those used internally by store-evidence.ts so that
 * both modules can operate on the same index.sqlite file.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GeohashHistoryRecord } from "@y4nn777/geo-tools";

// ── Types ──────────────────────────────────────────────────────────────

/**
 * A human-override correction to a photo record.
 * Records what field was changed, from what old value to what new value.
 */
export interface CorrectionEntry {
	photoId: number;
	field: string;
	oldValue: string | null;
	newValue: string;
	reason?: string;
}

/**
 * Row shape returned from index.sqlite queries.
 */
export interface EvidenceRow {
	id: number;
	geohash7: string;
	captured_at: string;
	source: string;
	photo_id: string;
	sequence_id: number | null;
	lat: number;
	lon: number;
	heading: number | null;
	sha256: string;
	file_path: string;
	sidecar_path: string;
	size_bytes: number;
	capture_method: string;
	flagged: number;
	flag_reason: string | null;
	fetched_at: string;
	created_at: string;
}

// ── Index DB ───────────────────────────────────────────────────────────

/**
 * Open (or create) an index.sqlite at the given storage root.
 * Creates the evidence table and indexes if they don't exist.
 *
 * Schema matches the one in store-evidence.ts so both modules
 * can operate on the same database file.
 *
 * @param storageRoot - Base directory for evidence storage.
 * @returns Synchronous database handle.
 */
export function openIndexDb(storageRoot: string): DatabaseSync {
	const dbPath = join(storageRoot, "index.sqlite");
	ensureDir(dirname(dbPath));

	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE IF NOT EXISTS evidence (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			geohash7 TEXT NOT NULL,
			captured_at TEXT NOT NULL,
			source TEXT NOT NULL DEFAULT 'kartaview',
			photo_id TEXT NOT NULL,
			sequence_id INTEGER,
			lat REAL NOT NULL,
			lon REAL NOT NULL,
			heading REAL,
			sha256 TEXT NOT NULL UNIQUE,
			file_path TEXT NOT NULL,
			sidecar_path TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			capture_method TEXT NOT NULL DEFAULT 'direct',
			flagged INTEGER NOT NULL DEFAULT 0,
			flag_reason TEXT,
			fetched_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	const indexes = [
		"CREATE INDEX IF NOT EXISTS idx_evidence_geohash ON evidence(geohash7)",
		"CREATE INDEX IF NOT EXISTS idx_evidence_captured_at ON evidence(captured_at)",
		"CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source)",
		"CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence(sha256)",
	];
	for (const idx of indexes) {
		db.exec(idx);
	}

	return db;
}

// ── Corrections DB ─────────────────────────────────────────────────────

/**
 * Open (or create) a corrections.sqlite at the given storage root.
 * Creates the corrections table if it doesn't exist.
 *
 * @param storageRoot - Base directory for evidence storage.
 * @returns Synchronous database handle.
 */
export function openCorrectionsDb(storageRoot: string): DatabaseSync {
	const dbPath = join(storageRoot, "corrections.sqlite");
	ensureDir(dirname(dbPath));

	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE IF NOT EXISTS corrections (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			photo_id INTEGER NOT NULL,
			field TEXT NOT NULL,
			old_value TEXT,
			new_value TEXT NOT NULL,
			reason TEXT,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	const indexes = [
		"CREATE INDEX IF NOT EXISTS idx_corrections_photo ON corrections(photo_id)",
		"CREATE INDEX IF NOT EXISTS idx_corrections_applied ON corrections(applied_at)",
	];
	for (const idx of indexes) {
		db.exec(idx);
	}

	return db;
}

// ── Query Functions ────────────────────────────────────────────────────

/**
 * Query recent captures by geohash prefix.
 *
 * Returns records whose geohash starts with the given prefix,
 * ordered by capture date descending.
 *
 * @param dbPath - Path to index.sqlite.
 * @param geohashPrefix - Geohash prefix to match (e.g. 'gcpvj').
 * @param limit - Max rows to return (default 50).
 * @returns Array of matching history records.
 */
export function queryRecentCaptures(dbPath: string, geohashPrefix: string, limit: number = 50): GeohashHistoryRecord[] {
	if (!existsSync(dbPath)) {
		return [];
	}

	const db = new DatabaseSync(dbPath);
	try {
		const rows = db
			.prepare(
				`SELECT geohash7, captured_at, source, file_path
				 FROM evidence
				 WHERE geohash7 LIKE ?
				 ORDER BY captured_at DESC
				 LIMIT ?`,
			)
			.all(`${geohashPrefix}%`, limit) as Array<{
			geohash7: string;
			captured_at: string;
			source: string;
			file_path: string;
		}>;

		return rows.map((r) => ({
			capturedAt: r.captured_at,
			source: r.source,
			path: r.file_path,
		}));
	} finally {
		db.close();
	}
}

/**
 * Log a human-override correction to corrections.sqlite.
 *
 * @param db - Open corrections database handle.
 * @param entry - Correction to log.
 */
export function logCorrection(db: DatabaseSync, entry: CorrectionEntry): void {
	db.prepare(
		`INSERT INTO corrections (photo_id, field, old_value, new_value, reason)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(entry.photoId, entry.field, entry.oldValue ?? null, entry.newValue, entry.reason ?? null);
}

/**
 * Query corrections for a given photo.
 *
 * @param dbPath - Path to corrections.sqlite.
 * @param photoId - Photo ID to query.
 * @returns Array of correction entries.
 */
export function queryCorrections(dbPath: string, photoId: number): CorrectionEntry[] {
	if (!existsSync(dbPath)) {
		return [];
	}

	const db = new DatabaseSync(dbPath);
	try {
		const rows = db
			.prepare(
				`SELECT photo_id, field, old_value, new_value, reason
				 FROM corrections
				 WHERE photo_id = ?
				 ORDER BY applied_at DESC`,
			)
			.all(photoId) as Array<{
			photo_id: number;
			field: string;
			old_value: string | null;
			new_value: string;
			reason: string | null;
		}>;

		return rows.map((r) => ({
			photoId: r.photo_id,
			field: r.field,
			oldValue: r.old_value,
			newValue: r.new_value,
			reason: r.reason ?? undefined,
		}));
	} finally {
		db.close();
	}
}

// ── Helpers ────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}
