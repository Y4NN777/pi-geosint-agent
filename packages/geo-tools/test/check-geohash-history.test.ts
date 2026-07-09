/**
 * Unit tests for geohash history query.
 *
 * Uses a temporary directory to create and populate index.sqlite,
 * verifying both the empty-database and populated-database paths.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkGeohashHistory } from "../src/check-geohash-history.ts";
import { ToolError } from "../src/types.ts";

let tempRoot: string;

/** Populate index.sqlite with sample evidence rows for testing */
function seedDatabase(
	storageRoot: string,
	records: Array<{ geohash: string; capturedAt?: string; source?: string }>,
): void {
	const dbPath = join(storageRoot, "index.sqlite");
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
	db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_geohash ON evidence(geohash7)");

	const insert = db.prepare(
		`INSERT INTO evidence
		 (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading,
		  sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, flag_reason, fetched_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);

	for (let i = 0; i < records.length; i++) {
		const r = records[i];
		insert.run(
			r.geohash,
			r.capturedAt ?? "2026-06-15T10:00:00Z",
			r.source ?? "kartaview",
			String(1000 + i),
			i,
			0,
			0,
			0,
			`sha${i}`,
			`/path/to/${i}.jpg`,
			`/path/to/${i}.sidecar.json`,
			1000,
			"direct",
			0,
			null,
			"2026-06-15T12:00:00Z",
		);
	}

	db.close();
}

beforeEach(async () => {
	tempRoot = await mkdtemp(join(tmpdir(), "geo-test-"));
});

afterEach(async () => {
	await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
});

describe("checkGeohashHistory", () => {
	it("returns empty array when index.sqlite does not exist", () => {
		const result = checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot });
		expect(result).toEqual([]);
	});

	it("returns empty array when evidence table does not exist", () => {
		// Create index.sqlite but with no evidence table
		const db = new DatabaseSync(join(tempRoot, "index.sqlite"));
		db.exec("CREATE TABLE other (x int)");
		db.close();

		const result = checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot });
		expect(result).toEqual([]);
	});

	it("returns matching records for a geohash", () => {
		seedDatabase(tempRoot, [
			{ geohash: "u09tvw0", capturedAt: "2026-06-15T10:00:00Z" },
			{ geohash: "u09tvw0", capturedAt: "2026-06-14T10:00:00Z" },
			{ geohash: "u09tvw1", capturedAt: "2026-06-13T10:00:00Z" },
		]);

		const result = checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot });
		expect(result).toHaveLength(2);
		expect(result[0].capturedAt).toBe("2026-06-15T10:00:00Z"); // DESC order
		expect(result[1].capturedAt).toBe("2026-06-14T10:00:00Z");
	});

	it("returns records sorted by captured_at DESC", () => {
		seedDatabase(tempRoot, [
			{ geohash: "u09tvw0", capturedAt: "2026-01-01T00:00:00Z" },
			{ geohash: "u09tvw0", capturedAt: "2026-06-01T00:00:00Z" },
			{ geohash: "u09tvw0", capturedAt: "2026-03-01T00:00:00Z" },
		]);

		const result = checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot });
		expect(result).toHaveLength(3);
		expect(result[0].capturedAt).toBe("2026-06-01T00:00:00Z");
		expect(result[1].capturedAt).toBe("2026-03-01T00:00:00Z");
		expect(result[2].capturedAt).toBe("2026-01-01T00:00:00Z");
	});

	it("queries neighbours when radiusBuckets > 0", () => {
		seedDatabase(tempRoot, [
			{ geohash: "u09tvw0", capturedAt: "2026-06-15T00:00:00Z" },
			{ geohash: "u09tvw1", capturedAt: "2026-06-14T00:00:00Z" },
		]);

		const result = checkGeohashHistory({
			geohash: "u09tvw0",
			radiusBuckets: 1,
			storageRoot: tempRoot,
		});
		// Should include both the center and the neighbour
		expect(result.length).toBeGreaterThanOrEqual(2);
	});

	it("queries exact match only when radiusBuckets is 0 or undefined", () => {
		seedDatabase(tempRoot, [
			{ geohash: "u09tvw0", capturedAt: "2026-06-15T00:00:00Z" },
			{ geohash: "u09tvw1", capturedAt: "2026-06-14T00:00:00Z" },
		]);

		const result = checkGeohashHistory({
			geohash: "u09tvw0",
			radiusBuckets: 0,
			storageRoot: tempRoot,
		});
		expect(result).toHaveLength(1);
		expect(result[0].capturedAt).toBe("2026-06-15T00:00:00Z");
	});

	it("returns source and path fields in records", () => {
		seedDatabase(tempRoot, [{ geohash: "u09tvw0", source: "kartaview" }]);

		const result = checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot });
		expect(result[0].source).toBe("kartaview");
		expect(result[0].path).toContain(".jpg");
	});

	it("throws ToolError on corrupt database", async () => {
		await writeFile(join(tempRoot, "index.sqlite"), "not a sqlite file");

		expect(() => checkGeohashHistory({ geohash: "u09tvw0", storageRoot: tempRoot })).toThrow(ToolError);
	});
});
