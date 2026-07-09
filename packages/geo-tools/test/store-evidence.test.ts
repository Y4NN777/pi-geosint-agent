/**
 * Unit tests for evidence storage.
 *
 * Uses a temporary directory for each test to isolate filesystem and
 * SQLite state. Verifies file copy, sidecar JSON, and idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeEvidence } from '../src/store-evidence.ts';
import { ToolError, type StoreEvidenceInput } from '../src/types.ts';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

let tempRoot: string;

const makeInput = (overrides: Partial<StoreEvidenceInput & { storageRoot?: string }> = {}): StoreEvidenceInput & { storageRoot?: string } => ({
	photoId: 1001,
	sequenceId: 42,
	lat: 48.8566,
	lon: 2.3522,
	heading: 180,
	capturedAt: '2026-06-15T10:30:00Z',
	sha256: 'abc123def456',
	filePath: '',
	sourceUrl: 'https://kartaview.org/photo/1001',
	captureMethod: 'direct' as const,
	sizeBytes: 12345,
	flagged: false,
	flagReason: null,
	storageRoot: tempRoot,
	...overrides,
});

beforeEach(async () => {
	tempRoot = await mkdtemp(join(tmpdir(), 'geo-test-'));
	// Create a minimal source file
	await writeFile(join(tempRoot, 'source.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
});

afterEach(async () => {
	await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
});

describe('storeEvidence', () => {
	it('copies the image file to the geohash-bucketed path', async () => {
		const result = await storeEvidence(makeInput({ filePath: join(tempRoot, 'source.jpg') }));

		// Paris geohash-7
		expect(result.geohash7).toBe('u09tvw0');

		// Verify the file was copied
		const stored = await readFile(result.path);
		expect(stored[0]).toBe(0xff);
		expect(stored[1]).toBe(0xd8);
	});

	it('writes a sidecar JSON file with metadata', async () => {
		const result = await storeEvidence(makeInput({ filePath: join(tempRoot, 'source.jpg') }));

		const sidecar = JSON.parse(await readFile(result.sidecarPath, 'utf-8'));
		expect(sidecar.photoId).toBe('1001');
		expect(sidecar.sequenceId).toBe(42);
		expect(sidecar.sha256).toBe('abc123def456');
		expect(sidecar.geohash7).toBe('u09tvw0');
		expect(sidecar.fetchedAt).toBeDefined();
		expect(sidecar.flagged).toBe(false);
	});

	it('records the evidence in index.sqlite', async () => {
		await storeEvidence(makeInput({ filePath: join(tempRoot, 'source.jpg') }));

		const db = new DatabaseSync(join(tempRoot, 'index.sqlite'));
		const rows = db.prepare('SELECT * FROM evidence').all() as Array<Record<string, unknown>>;
		expect(rows).toHaveLength(1);
		expect(rows[0].sha256).toBe('abc123def456');
		expect(rows[0].geohash7).toBe('u09tvw0');
		expect(rows[0].photo_id).toBe('1001');
		db.close();
	});

	it('is idempotent: same SHA256 returns existing path without duplicating', async () => {
		const first = await storeEvidence(makeInput({ filePath: join(tempRoot, 'source.jpg') }));
		const second = await storeEvidence(makeInput({ filePath: join(tempRoot, 'source.jpg') }));

		expect(first.path).toBe(second.path);
		expect(first.sidecarPath).toBe(second.sidecarPath);

		// Only one row in DB
		const db = new DatabaseSync(join(tempRoot, 'index.sqlite'));
		const count = db.prepare('SELECT COUNT(*) as cnt FROM evidence').get() as { cnt: number };
		expect(count.cnt).toBe(1);
		db.close();
	});

	it('flags metadata consistently with flagged=true', async () => {
		const result = await storeEvidence(
			makeInput({
				filePath: join(tempRoot, 'source.jpg'),
				flagged: true,
				flagReason: 'stale photo',
			}),
		);

		const sidecar = JSON.parse(await readFile(result.sidecarPath, 'utf-8'));
		expect(sidecar.flagged).toBe(true);
		expect(sidecar.flagReason).toBe('stale photo');

		const db = new DatabaseSync(join(tempRoot, 'index.sqlite'));
		const row = db.prepare('SELECT flagged, flag_reason FROM evidence WHERE sha256 = ?').get('abc123def456') as {
			flagged: number;
			flag_reason: string | null;
		};
		expect(row.flagged).toBe(1);
		expect(row.flag_reason).toBe('stale photo');
		db.close();
	});

	it('uses .png extension for render method', async () => {
		await writeFile(join(tempRoot, 'source-render.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		const result = await storeEvidence(
			makeInput({
				filePath: join(tempRoot, 'source-render.png'),
				captureMethod: 'render',
				sha256: 'render123',
			}),
		);
		expect(result.path).toContain('.png');
	});

	it('throws ToolError on missing source file', async () => {
		await expect(
			storeEvidence(makeInput({ filePath: join(tempRoot, 'nonexistent.jpg') })),
		).rejects.toThrow(ToolError);
	});
});
