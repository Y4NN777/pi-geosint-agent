/**
 * Evidence storage with geohash bucketing and SQLite indexing.
 *
 * Writes captured images to:
 *   evidence/{geohash7}/{date}/{source}/{id}.{ext}
 * Writes sidecar JSON alongside.
 * Upserts the record into index.sqlite (idempotent by SHA256).
 *
 * No dependency on pi-agent-core. Deterministic function.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { geohash7 } from "./geohash.ts";
import { type StoreEvidenceInput, type StoreEvidenceResult, ToolError } from "./types.ts";

const EVIDENCE_DIR = "evidence";

export async function storeEvidence(
	input: StoreEvidenceInput & { storageRoot?: string },
): Promise<StoreEvidenceResult> {
	const {
		source,
		id,
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
		sequenceId,
	} = input;

	const root = input.storageRoot ?? EVIDENCE_DIR;
	const gh7 = geohash7(lat, lon);
	const date = capturedAt ? capturedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
	const ext = captureMethod === "render" ? ".png" : ".jpg";

	const destDir = join(root, gh7, date, source);
	const destPath = join(destDir, `${id}${ext}`);
	const sidecarPath = join(destDir, `${id}.sidecar.json`);

	try {
		await mkdir(destDir, { recursive: true });
	} catch (err) {
		throw new ToolError(
			`Failed to create directory ${destDir}: ${err instanceof Error ? err.message : String(err)}`,
			"FS_ERROR",
		);
	}

	const db = openIndexDb(root);
	try {
		const existing = db.prepare("SELECT sha256 FROM evidence WHERE sha256 = ?").get(sha256) as
			| { sha256: string }
			| undefined;

		if (existing) {
			return {
				path: destPath,
				sidecarPath,
				sha256,
				geohash7: gh7,
			};
		}

		try {
			await copyFile(sourcePath, destPath);
		} catch (err) {
			throw new ToolError(
				`Failed to copy ${sourcePath} to ${destPath}: ${err instanceof Error ? err.message : String(err)}`,
				"FS_ERROR",
			);
		}

		const sidecar = {
			source,
			id,
			lat,
			lon,
			heading,
			capturedAt: capturedAt ?? null,
			fetchedAt: new Date().toISOString(),
			sha256,
			sourceUrl,
			captureMethod,
			flagged,
			flagReason: flagReason ?? null,
			...(sequenceId ? { sequenceId } : {}),
			sizeBytes,
			geohash7: gh7,
		};
		try {
			await writeFile(sidecarPath, JSON.stringify(sidecar, null, 2));
		} catch (err) {
			throw new ToolError(
				`Failed to write sidecar ${sidecarPath}: ${err instanceof Error ? err.message : String(err)}`,
				"FS_ERROR",
			);
		}

		db.prepare(
			`INSERT OR REPLACE INTO evidence
			 (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading,
			  sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, flag_reason, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			gh7,
			capturedAt ?? date,
			source,
			id,
			sequenceId ?? null,
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

function openIndexDb(storageRoot: string): DatabaseSync {
	const dbPath = join(storageRoot, "index.sqlite");
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
			captured_at TEXT,
			source TEXT NOT NULL DEFAULT 'kartaview',
			photo_id TEXT NOT NULL,
			sequence_id TEXT,
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
