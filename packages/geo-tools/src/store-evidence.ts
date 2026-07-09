/**
 * Evidence storage with geohash bucketing and SQLite indexing.
 *
 * Writes captured images to:
 *   evidence/{geohash7}/{date}/{source}/{photoId}.{ext}
 * Writes sidecar JSON alongside.
 * Upserts the record into index.sqlite (idempotent by SHA256).
 *
 * No dependency on pi-agent-core. Deterministic function.
 *
 * @param input - Capture output + discovery metadata
 * @returns Storage paths and geohash
 * @throws {ToolError} On filesystem or database errors
 */

import { copyFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { geohash7 } from './geohash.ts';
import { ToolError, type StoreEvidenceInput, type StoreEvidenceResult } from './types.ts';

const EVIDENCE_DIR = 'evidence';

/**
 * Store a captured image and its metadata.
 *
 * @param input - Image metadata, source path, and optional storage root
 * @returns Stored file path, sidecar path, SHA256, and geohash
 * @throws {ToolError} On filesystem or database failure
 */
export async function storeEvidence(
	input: StoreEvidenceInput & { storageRoot?: string },
): Promise<StoreEvidenceResult> {
	const {
		photoId,
		sequenceId,
		lat,
		lon,
		heading,
		capturedAt,
		sha256,
		filePath: sourcePath,
		sourceUrl,
		captureMethod,
		sizeBytes,
		flagged,
		flagReason,
	} = input;

	const root = input.storageRoot ?? EVIDENCE_DIR;
	const gh7 = geohash7(lat, lon);
	const date = capturedAt.slice(0, 10); // YYYY-MM-DD from ISO
	const source = 'kartaview';
	const ext = captureMethod === 'render' ? '.png' : '.jpg';

	const destDir = join(root, gh7, date, source);
	const destPath = join(destDir, `${photoId}${ext}`);
	const sidecarPath = join(destDir, `${photoId}.sidecar.json`);

	// Create directories
	try {
		await mkdir(destDir, { recursive: true });
	} catch (err) {
		throw new ToolError(
			`Failed to create directory ${destDir}: ${err instanceof Error ? err.message : String(err)}`,
			'FS_ERROR',
		);
	}

	// Copy image file (idempotent — skip if SHA256 already exists in DB)
	const db = openIndexDb(root);
	try {
		const existing = db
			.prepare('SELECT sha256 FROM evidence WHERE sha256 = ?')
			.get(sha256) as { sha256: string } | undefined;

		if (existing) {
			// Already stored — return existing path
			return {
				path: destPath,
				sidecarPath,
				sha256,
				geohash7: gh7,
			};
		}

		// Copy the file
		try {
			await copyFile(sourcePath, destPath);
		} catch (err) {
			throw new ToolError(
				`Failed to copy ${sourcePath} to ${destPath}: ${err instanceof Error ? err.message : String(err)}`,
				'FS_ERROR',
			);
		}

		// Write sidecar
		const sidecar = {
			photoId: String(photoId),
			sequenceId,
			lat,
			lon,
			heading,
			capturedAt,
			fetchedAt: new Date().toISOString(),
			sha256,
			sourceUrl,
			captureMethod,
			flagged,
			flagReason: flagReason ?? null,
			sizeBytes,
			geohash7: gh7,
		};
		try {
			await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2));
		} catch (err) {
			throw new ToolError(
				`Failed to write sidecar ${sidecarPath}: ${err instanceof Error ? err.message : String(err)}`,
				'FS_ERROR',
			);
		}

		// Upsert into index.sqlite
		db.prepare(
			`INSERT OR REPLACE INTO evidence
			 (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading,
			  sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, flag_reason, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			gh7,
			capturedAt,
			source,
			String(photoId),
			sequenceId,
			lat,
			lon,
			heading,
			sha256,
			destPath,
			sidecarPath,
			sizeBytes,
			captureMethod,
			flagged ? 1 : 0,
			flagReason ?? null,
			new Date().toISOString(),
		);
	} finally {
		db.close();
	}

	return {
		path: destPath,
		sidecarPath,
		sha256,
		geohash7: gh7,
	};
}

/**
 * Open or create index.sqlite with the evidence schema.
 */
function openIndexDb(storageRoot: string): DatabaseSync {
	const dbPath = join(storageRoot, 'index.sqlite');
	const dir = dirname(dbPath);
	if (!existsSync(dir)) {
		try {
			mkdir(dir, { recursive: true });
		} catch {
			// Will be caught by the caller
		}
	}

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

	// Create indexes if they don't exist
	const indexes = [
		'CREATE INDEX IF NOT EXISTS idx_evidence_geohash ON evidence(geohash7)',
		'CREATE INDEX IF NOT EXISTS idx_evidence_captured_at ON evidence(captured_at)',
		'CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source)',
		'CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence(sha256)',
	];
	for (const idx of indexes) {
		db.exec(idx);
	}

	return db;
}
