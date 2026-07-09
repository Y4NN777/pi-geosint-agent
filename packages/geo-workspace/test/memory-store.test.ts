/**
 * Unit tests for memory-store.
 *
 * Uses real node:sqlite with temporary database files.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	logCorrection,
	openCorrectionsDb,
	openIndexDb,
	queryCorrections,
	queryRecentCaptures,
} from "../src/memory-store.ts";

let tmpDir: string;
let storageRoot: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `geo-memory-test-${randomUUID()}`);
	storageRoot = join(tmpDir, "evidence");
	mkdirSync(storageRoot, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("openIndexDb", () => {
	it("creates index.sqlite with evidence schema", () => {
		const db = openIndexDb(storageRoot);

		// Verify the table exists by querying it
		const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'").all();
		expect(rows).toHaveLength(1);

		// Verify indexes exist
		const indexes = db
			.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='evidence'")
			.all() as Array<{ name: string }>;
		const indexNames = indexes.map((i) => i.name);
		expect(indexNames).toContain("idx_evidence_geohash");
		expect(indexNames).toContain("idx_evidence_captured_at");
		expect(indexNames).toContain("idx_evidence_source");
		expect(indexNames).toContain("idx_evidence_sha256");

		db.close();
		expect(existsSync(join(storageRoot, "index.sqlite"))).toBe(true);
	});

	it("is idempotent when called multiple times", () => {
		const db1 = openIndexDb(storageRoot);
		db1.close();

		const db2 = openIndexDb(storageRoot);
		const rows = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence'").all();
		expect(rows).toHaveLength(1);
		db2.close();
	});

	it("inserts and retrieves a row", () => {
		const db = openIndexDb(storageRoot);
		db.prepare(
			`INSERT INTO evidence (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading, sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"gcpvj0d",
			"2024-06-01T12:00:00Z",
			"kartaview",
			"101",
			1,
			51.5,
			-0.13,
			90,
			"abc123",
			"/evidence/gcpvj0d/2024-06-01/kartaview/101.jpg",
			"/evidence/gcpvj0d/2024-06-01/kartaview/101.sidecar.json",
			1024,
			"direct",
			0,
			"2024-06-01T12:00:00Z",
		);

		const row = db.prepare("SELECT * FROM evidence WHERE sha256 = ?").get("abc123") as any;
		expect(row).toBeDefined();
		expect(row.photo_id).toBe("101");
		expect(row.lat).toBe(51.5);
		expect(row.lon).toBe(-0.13);

		db.close();
	});
});

describe("openCorrectionsDb", () => {
	it("creates corrections.sqlite with corrections schema", () => {
		const db = openCorrectionsDb(storageRoot);

		const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='corrections'").all();
		expect(rows).toHaveLength(1);

		db.close();
		expect(existsSync(join(storageRoot, "corrections.sqlite"))).toBe(true);
	});

	it("is idempotent when called multiple times", () => {
		const db1 = openCorrectionsDb(storageRoot);
		db1.close();

		const db2 = openCorrectionsDb(storageRoot);
		const rows = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='corrections'").all();
		expect(rows).toHaveLength(1);
		db2.close();
	});
});

describe("queryRecentCaptures", () => {
	it("returns empty array when index.sqlite does not exist", () => {
		const results = queryRecentCaptures(join(storageRoot, "index.sqlite"), "gcpvj0d");
		expect(results).toEqual([]);
	});

	it("returns records matching geohash prefix", () => {
		const db = openIndexDb(storageRoot);
		db.prepare(
			`INSERT INTO evidence (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading, sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"gcpvj0d",
			"2024-06-01T12:00:00Z",
			"kartaview",
			"101",
			1,
			51.5,
			-0.13,
			90,
			"abc123",
			"/evidence/gcpvj0d/2024-06-01/kartaview/101.jpg",
			"/evidence/gcpvj0d/2024-06-01/kartaview/101.sidecar.json",
			1024,
			"direct",
			0,
			"2024-06-01T12:00:00Z",
		);
		db.prepare(
			`INSERT INTO evidence (geohash7, captured_at, source, photo_id, sequence_id, lat, lon, heading, sha256, file_path, sidecar_path, size_bytes, capture_method, flagged, fetched_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"xn774c0",
			"2024-06-02T12:00:00Z",
			"kartaview",
			"202",
			2,
			35.68,
			139.65,
			180,
			"def456",
			"/evidence/xn774c0/2024-06-02/kartaview/202.jpg",
			"/evidence/xn774c0/2024-06-02/kartaview/202.sidecar.json",
			2048,
			"render",
			1,
			"2024-06-02T12:00:00Z",
		);
		db.close();

		// Query by 'gcp' prefix should only return the first record
		const results = queryRecentCaptures(join(storageRoot, "index.sqlite"), "gcp");
		expect(results).toHaveLength(1);
		expect(results[0].source).toBe("kartaview");
		expect(results[0].capturedAt).toBe("2024-06-01T12:00:00Z");

		// Query by 'xn' prefix should return the second
		const results2 = queryRecentCaptures(join(storageRoot, "index.sqlite"), "xn");
		expect(results2).toHaveLength(1);
	});
});

describe("logCorrection and queryCorrections", () => {
	it("logs and retrieves a correction entry", () => {
		const db = openCorrectionsDb(storageRoot);

		logCorrection(db, {
			photoId: 101,
			field: "needsRender",
			oldValue: "false",
			newValue: "true",
			reason: "URL requires JS rendering",
		});

		db.close();

		const results = queryCorrections(join(storageRoot, "corrections.sqlite"), 101);
		expect(results).toHaveLength(1);
		expect(results[0].field).toBe("needsRender");
		expect(results[0].oldValue).toBe("false");
		expect(results[0].newValue).toBe("true");
		expect(results[0].reason).toBe("URL requires JS rendering");
		expect(results[0].photoId).toBe(101);
	});

	it("returns empty array for non-existent corrections db", () => {
		const results = queryCorrections(join(storageRoot, "corrections.sqlite"), 999);
		expect(results).toEqual([]);
	});

	it("returns empty array for nonexistent photo", () => {
		const db = openCorrectionsDb(storageRoot);
		logCorrection(db, {
			photoId: 101,
			field: "flagged",
			oldValue: null,
			newValue: "true",
		});
		db.close();

		const results = queryCorrections(join(storageRoot, "corrections.sqlite"), 999);
		expect(results).toEqual([]);
	});

	it("handles correction without oldValue", () => {
		const db = openCorrectionsDb(storageRoot);
		logCorrection(db, {
			photoId: 202,
			field: "flagged",
			oldValue: null,
			newValue: "true",
		});
		db.close();

		const results = queryCorrections(join(storageRoot, "corrections.sqlite"), 202);
		expect(results).toHaveLength(1);
		expect(results[0].oldValue).toBeNull();
	});
});
