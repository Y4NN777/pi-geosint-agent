/**
 * Unit tests for direct image capture.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureDirect } from '../src/capture-direct.ts';
import { ToolError } from '../src/types.ts';
import { readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function mockFetch(response: Response | ((url: string) => Response) | Promise<never>): void {
	vi.stubGlobal(
		'fetch',
		vi.fn((url: string) => {
			const result = typeof response === 'function' ? response(url) : response;
			return Promise.resolve(result);
		}),
	);
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageResponse(data: Uint8Array, contentType: string): Response {
	return new Response(data, {
		status: 200,
		headers: { 'content-type': contentType },
	});
}

describe('captureDirect', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		// Clean up temp files from geo-tools-capture
		const tempDir = join(tmpdir(), 'geo-tools-capture');
		try {
			const entries = await readFile(tempDir, 'utf-8');
			for (const entry of entries.split('\n').filter(Boolean)) {
				await unlink(join(tempDir, entry)).catch(() => {});
			}
			await rmdir(tempDir).catch(() => {});
		} catch {
			// ignore
		}
	});

	it('downloads a JPEG image and returns path, sha256, bytes', async () => {
		mockFetch(imageResponse(JPEG_BYTES, 'image/jpeg'));

		const result = await captureDirect({ photoId: 42, url: 'https://example.com/photo.jpg' });
		expect(result.path).toContain('/geo-tools-capture/42.jpg');
		expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result.bytes).toBe(JPEG_BYTES.length);
	});

	it('saves PNG with .png extension', async () => {
		mockFetch(imageResponse(PNG_BYTES, 'image/png'));

		const result = await captureDirect({ photoId: 7, url: 'https://example.com/photo.png' });
		expect(result.path).toContain('/geo-tools-capture/7.png');
	});

	it('writes actual file to disk', async () => {
		mockFetch(imageResponse(JPEG_BYTES, 'image/jpeg'));

		const result = await captureDirect({ photoId: 99, url: 'https://example.com/photo.jpg' });
		const fileBuffer = await readFile(result.path);
		expect(new Uint8Array(fileBuffer)).toEqual(JPEG_BYTES);
	});

	it('throws ToolError for invalid URL', async () => {
		await expect(captureDirect({ photoId: 1, url: '' })).rejects.toThrow(ToolError);
		await expect(captureDirect({ photoId: 1, url: 'ftp://bad' })).rejects.toThrow(ToolError);
	});

	it('throws ToolError on 404', async () => {
		mockFetch(new Response('Not Found', { status: 404 }));

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/missing' })).rejects.toThrow(
			ToolError,
		);
	});

	it('throws ToolError on non-image content type', async () => {
		mockFetch(new Response('not an image', { status: 200, headers: { 'content-type': 'text/html' } }));

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/page' })).rejects.toThrow(
			ToolError,
		);
	});

	it('throws ToolError on empty response body', async () => {
		mockFetch(new Response('', { status: 200, headers: { 'content-type': 'image/jpeg' } }));

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/empty' })).rejects.toThrow(
			ToolError,
		);
	});

	it('throws ToolError on timeout', async () => {
		const timeoutError = new DOMException('The operation was aborted', 'TimeoutError');
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(timeoutError)),
		);

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/slow' })).rejects.toThrow(ToolError);
	});

	it('throws ToolError for oversized payload (>50MB)', async () => {
		const big = new Uint8Array(51 * 1024 * 1024);
		mockFetch(imageResponse(big, 'image/jpeg'));

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/big' })).rejects.toThrow(
			ToolError,
		);
	});

	it('throws ToolError on network error', async () => {
		mockFetch(() => {
			throw new TypeError('fetch failed');
		});

		await expect(captureDirect({ photoId: 1, url: 'https://example.com/fail' })).rejects.toThrow(
			ToolError,
		);
	});
});
