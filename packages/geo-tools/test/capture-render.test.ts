/**
 * Unit tests for headless browser rendering capture.
 *
 * These tests mock the child_process spawn module to avoid requiring
 * xvfb-run and cutycapt to be installed in CI.
 */

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Top-level vi.mock IS hoisted by vitest above all imports
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

// Mock readFile for the success path (vi.spyOn doesn't work on ESM module namespace)
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		readFile: vi.fn(),
	};
});

import { captureRender } from "../src/capture-render.ts";
import { ToolError } from "../src/types.ts";

/** Create a mocked child process with given behavior */
function makeMockProcess(options: {
	exitCode: number | null;
	signal?: string | null;
	error?: Error;
	stderrData?: string;
}): EventEmitter {
	const proc = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		pid: number;
		kill: ReturnType<typeof vi.fn>;
	};

	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.pid = 12345;
	proc.kill = vi.fn();

	if (options.stderrData) {
		setImmediate(() => {
			proc.stderr.emit("data", Buffer.from(options.stderrData));
		});
	}

	if (options.error) {
		setImmediate(() => {
			proc.emit("error", options.error);
		});
	} else {
		setImmediate(() => {
			proc.emit("close", options.exitCode, options.signal ?? null);
		});
	}

	return proc;
}

describe("captureRender", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("throws ToolError with MISSING_BINARY when spawn emits ENOENT", async () => {
		const childProc = await import("node:child_process");
		const mockSpawn = childProc.spawn as ReturnType<typeof vi.fn>;
		mockSpawn.mockImplementation(() =>
			makeMockProcess({
				exitCode: null,
				error: Object.assign(new Error("spawn xvfb-run ENOENT"), { code: "ENOENT" }),
			}),
		);

		await expect(captureRender({ url: "https://example.com" })).rejects.toThrow(ToolError);
	});

	it("throws ToolError with RENDER_FAILED on non-zero exit", async () => {
		const childProc = await import("node:child_process");
		const mockSpawn = childProc.spawn as ReturnType<typeof vi.fn>;
		mockSpawn.mockImplementation(() =>
			makeMockProcess({
				exitCode: 1,
				stderrData: "CutyCapt error: QSslSocket",
			}),
		);

		await expect(captureRender({ url: "https://example.com" })).rejects.toThrow(ToolError);
	});

	it("resolves with path and sha256 on successful render", async () => {
		const childProc = await import("node:child_process");
		const mockSpawn = childProc.spawn as ReturnType<typeof vi.fn>;
		mockSpawn.mockImplementation(() => makeMockProcess({ exitCode: 0 }));

		const fsMod = await import("node:fs/promises");
		(fsMod.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const result = await captureRender({ url: "https://example.com" });
		expect(result.path).toContain("render-");
		expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
	});
});
