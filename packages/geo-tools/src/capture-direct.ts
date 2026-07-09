/**
 * Direct image download from a photo URL (KartaView or Google Street View).
 *
 * No dependency on pi-agent-core. Deterministic function.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CaptureDirectInput, type CaptureDirectResult, ToolError } from "./types.ts";

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 50 * 1024 * 1024;

export async function captureDirect(input: CaptureDirectInput): Promise<CaptureDirectResult> {
	const { id, url } = input;

	if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
		throw new ToolError(`Invalid URL for ${id}: ${url}`, "INVALID_URL");
	}

	let response: Response;
	try {
		response = await fetch(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { "User-Agent": "pi-geosint-agent/0.1.0" },
		});
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError") {
			throw new ToolError(`Download timeout (${TIMEOUT_MS}ms) for ${id}`, "TIMEOUT");
		}
		throw new ToolError(
			`Download failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
			"NETWORK_ERROR",
		);
	}

	if (response.status === 404) {
		throw new ToolError(`URL returned 404 for ${id}`, "NOT_FOUND", 404);
	}

	if (!response.ok) {
		throw new ToolError(
			`Download returned ${response.status} ${response.statusText} for ${id}`,
			"HTTP_ERROR",
			response.status,
		);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.startsWith("image/")) {
		throw new ToolError(
			`Unexpected content type for ${id}: ${contentType} (expected image/*)`,
			"INVALID_CONTENT_TYPE",
		);
	}

	let buffer: ArrayBuffer;
	try {
		buffer = await response.arrayBuffer();
	} catch (err) {
		throw new ToolError(
			`Failed to read response body for ${id}: ${err instanceof Error ? err.message : String(err)}`,
			"READ_ERROR",
		);
	}

	if (buffer.byteLength === 0) {
		throw new ToolError(`Empty response body for ${id}`, "EMPTY_BODY");
	}

	if (buffer.byteLength > MAX_BYTES) {
		throw new ToolError(`Response too large for ${id}: ${buffer.byteLength} bytes (max ${MAX_BYTES})`, "TOO_LARGE");
	}

	const hash = createHash("sha256");
	hash.update(Buffer.from(buffer));
	const sha256 = hash.digest("hex");

	const ext = contentType === "image/png" ? ".png" : ".jpg";

	const tempDir = join(tmpdir(), "geo-tools-capture");
	await mkdir(tempDir, { recursive: true });
	const filePath = join(tempDir, `${id}${ext}`);
	await writeFile(filePath, Buffer.from(buffer));

	return {
		path: filePath,
		sha256,
		bytes: buffer.byteLength,
	};
}
