/**
 * Direct image download from KartaView URL.
 *
 * Downloads image bytes from a KartaView-provided photo URL,
 * writes to a temp path, and returns the SHA256 hash.
 *
 * No dependency on pi-agent-core. Deterministic function.
 *
 * @param input - Photo ID and download URL
 * @returns Path, SHA256, and byte count of the downloaded image
 * @throws {ToolError} On 404, timeout, or non-image response
 */

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolError, type CaptureDirectInput, type CaptureDirectResult } from './types.ts';

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 50 * 1024 * 1024; // 50MB sanity limit

/**
 * Download image bytes directly from a URL.
 *
 * @param input - { photoId, url }
 * @returns Path to downloaded file, hex SHA256, and byte count
 * @throws {ToolError} On non-image response, 404, timeout, or oversized file
 */
export async function captureDirect(input: CaptureDirectInput): Promise<CaptureDirectResult> {
	const { photoId, url } = input;

	if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
		throw new ToolError(`Invalid URL for photo ${photoId}: ${url}`, 'INVALID_URL');
	}

	let response: Response;
	try {
		response = await fetch(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { 'User-Agent': 'pi-geosint-agent/0.1.0' },
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			throw new ToolError(
				`Download timeout (${TIMEOUT_MS}ms) for photo ${photoId}`,
				'TIMEOUT',
			);
		}
		throw new ToolError(
			`Download failed for photo ${photoId}: ${err instanceof Error ? err.message : String(err)}`,
			'NETWORK_ERROR',
		);
	}

	if (response.status === 404) {
		throw new ToolError(`Photo URL returned 404 for photo ${photoId}`, 'NOT_FOUND', 404);
	}

	if (!response.ok) {
		throw new ToolError(
			`Download returned ${response.status} ${response.statusText} for photo ${photoId}`,
			'HTTP_ERROR',
			response.status,
		);
	}

	// Verify content type is an image
	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.startsWith('image/')) {
		throw new ToolError(
			`Unexpected content type for photo ${photoId}: ${contentType} (expected image/*)`,
			'INVALID_CONTENT_TYPE',
		);
	}

	let buffer: ArrayBuffer;
	try {
		buffer = await response.arrayBuffer();
	} catch (err) {
		throw new ToolError(
			`Failed to read response body for photo ${photoId}: ${err instanceof Error ? err.message : String(err)}`,
			'READ_ERROR',
		);
	}

	if (buffer.byteLength === 0) {
		throw new ToolError(`Empty response body for photo ${photoId}`, 'EMPTY_BODY');
	}

	if (buffer.byteLength > MAX_BYTES) {
		throw new ToolError(
			`Response too large for photo ${photoId}: ${buffer.byteLength} bytes (max ${MAX_BYTES})`,
			'TOO_LARGE',
		);
	}

	// Compute SHA256
	const hash = createHash('sha256');
	hash.update(Buffer.from(buffer));
	const sha256 = hash.digest('hex');

	// Determine extension from content type
	const ext = contentType === 'image/png' ? '.png' : '.jpg';

	// Write to temp directory
	const tempDir = join(tmpdir(), 'geo-tools-capture');
	await mkdir(tempDir, { recursive: true });
	const filePath = join(tempDir, `${photoId}${ext}`);
	await writeFile(filePath, Buffer.from(buffer));

	return {
		path: filePath,
		sha256,
		bytes: buffer.byteLength,
	};
}
