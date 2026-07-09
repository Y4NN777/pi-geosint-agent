/**
 * Headless browser rendering for KartaView viewer pages.
 *
 * Shells out to xvfb-run cutycapt (or fallback) to render a URL
 * to a PNG image. Used only when a candidate has needs_render: true.
 *
 * No dependency on pi-agent-core. Deterministic function.
 *
 * @param input - URL to render and optional output path
 * @returns Path and SHA256 of rendered PNG
 * @throws {ToolError} On subprocess timeout, crash, or missing binary
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CaptureRenderInput, type CaptureRenderResult, ToolError } from "./types.ts";

const TIMEOUT_MS = 120_000;
const CUTYCAPT_BIN = "cutycapt";
const XVFB_RUN_BIN = "xvfb-run";

interface SubprocessError extends Error {
	code?: string;
	signal?: string;
}

/**
 * Render a URL to a PNG using xvfb-run cutycapt.
 *
 * @param input - { url, outputDir? }
 * @returns File path and hex SHA256 of the rendered PNG
 * @throws {ToolError} If CutyCapt is not installed, or subprocess times out / crashes
 */
export async function captureRender(input: CaptureRenderInput & { outputDir?: string }): Promise<CaptureRenderResult> {
	const { url } = input;
	const outputDir = input.outputDir ?? join(tmpdir(), "geo-tools-render");
	const outputPath = join(outputDir, `render-${Date.now()}.png`);

	await mkdir(outputDir, { recursive: true });

	return new Promise<CaptureRenderResult>((resolve, reject) => {
		const args = [
			"--auto-servernum",
			CUTYCAPT_BIN,
			`--url=${url}`,
			`--out=${outputPath}`,
			"--min-width=1920",
			"--min-height=1080",
			"--delay=2000",
		];

		const proc = spawn(XVFB_RUN_BIN, args, {
			timeout: TIMEOUT_MS,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timer = setTimeout(() => {
			proc.kill("SIGTERM");
			// Also kill the cutycapt child
			try {
				process.kill(-(proc.pid ?? 0), "SIGTERM");
			} catch {
				// ignore if already dead
			}
			reject(new ToolError(`Render timeout (${TIMEOUT_MS}ms) for ${url}`, "TIMEOUT"));
		}, TIMEOUT_MS);

		let stderr = "";
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("error", (err: SubprocessError) => {
			clearTimeout(timer);
			if (err.code === "ENOENT") {
				reject(
					new ToolError(
						`${XVFB_RUN_BIN} or ${CUTYCAPT_BIN} not found. Install with: apt-get install xvfb cutycapt`,
						"MISSING_BINARY",
					),
				);
			} else {
				reject(new ToolError(`Render subprocess error: ${err.message}`, "SUBPROCESS_ERROR"));
			}
		});

		proc.on("close", async (exitCode, signal) => {
			clearTimeout(timer);
			if (exitCode !== 0 || signal) {
				// Clean up partial output
				try {
					await unlink(outputPath);
				} catch {
					// ignore if file doesn't exist
				}
				reject(
					new ToolError(
						`Render failed: exitCode=${exitCode}, signal=${signal}, stderr: ${stderr.slice(0, 500)}`,
						"RENDER_FAILED",
					),
				);
				return;
			}

			try {
				const buffer = await readFile(outputPath);
				const hash = createHash("sha256");
				hash.update(buffer);
				const sha256 = hash.digest("hex");

				resolve({
					path: outputPath,
					sha256,
				});
			} catch (err) {
				reject(
					new ToolError(
						`Failed to read rendered output: ${err instanceof Error ? err.message : String(err)}`,
						"READ_ERROR",
					),
				);
			}
		});
	});
}
