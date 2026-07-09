/**
 * Unit tests for workspace-loader.
 *
 * Creates temporary fixture files to test markdown reading and parsing.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleSystemPrompt, loadLayer0And1, loadStageContract } from "../src/workspace-loader.ts";

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `geo-workspace-test-${randomUUID()}`);
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relativePath: string, content: string): void {
	const fullPath = join(tmpDir, relativePath);
	mkdirSync(fullPath.substring(0, fullPath.lastIndexOf("/")), { recursive: true });
	writeFileSync(fullPath, content, "utf-8");
}

const MOCK_AGENT_MD = `# Test Agent

This is a test agent.`;

const MOCK_CONTEXT_MD = `# Stage Order

The pipeline runs four stages sequentially:

\`\`\`
01_resolve  →  02_discover  →  03_capture  →  04_store
\`\`\``;

const MOCK_STAGE_CONTRACT = `# Stage 01 — Resolve

## Purpose

Convert raw coordinates into a human-readable address.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| lat | User | Latitude |
| lon | User | Longitude |

## Process

1. Validate coordinates.
2. Call reverse-geocode.
3. Return address.

## Outputs

\`\`\`json
{ "address": "string" }
\`\`\``;

const MOCK_CONFIG_KARTAVIEW = `# KartaView API Contract

Base URL: https://kartaview.org`;

describe("loadLayer0And1", () => {
	it("returns concatenated AGENT.md + CONTEXT.md", () => {
		writeFile("AGENT.md", MOCK_AGENT_MD);
		writeFile("CONTEXT.md", MOCK_CONTEXT_MD);

		const result = loadLayer0And1(tmpDir);

		expect(result).toContain("# Layer 0");
		expect(result).toContain("Test Agent");
		expect(result).toContain("# Layer 1");
		expect(result).toContain("Stage Order");
		expect(result).toContain("01_resolve");
	});

	it("handles missing AGENT.md gracefully", () => {
		writeFile("CONTEXT.md", MOCK_CONTEXT_MD);

		const result = loadLayer0And1(tmpDir);

		expect(result).not.toContain("# Layer 0");
		expect(result).toContain("# Layer 1");
		expect(result).toContain("Stage Order");
	});

	it("handles missing CONTEXT.md gracefully", () => {
		writeFile("AGENT.md", MOCK_AGENT_MD);

		const result = loadLayer0And1(tmpDir);

		expect(result).toContain("# Layer 0");
		expect(result).not.toContain("# Layer 1");
		expect(result).toContain("Test Agent");
	});

	it("returns empty string when both files are missing", () => {
		const result = loadLayer0And1(tmpDir);
		expect(result).toBe("");
	});
});

describe("loadStageContract", () => {
	it("parses purpose, inputs, process, and outputs", () => {
		writeFile("stages/01_resolve/CONTEXT.md", MOCK_STAGE_CONTRACT);

		const contract = loadStageContract(tmpDir, "01_resolve");

		expect(contract.purpose).toContain("Convert raw coordinates");
		expect(contract.inputs).toHaveLength(2);
		expect(contract.inputs[0].name).toBe("lat");
		expect(contract.inputs[0].source).toBe("User");
		expect(contract.inputs[1].name).toBe("lon");
		expect(contract.process).toHaveLength(3);
		expect(contract.process[0]).toBe("Validate coordinates.");
		expect(contract.outputShape).toContain('"address"');
	});

	it("throws for missing stage contract", () => {
		expect(() => loadStageContract(tmpDir, "99_nonexistent")).toThrow("Stage contract not found");
	});
});

describe("assembleSystemPrompt", () => {
	it("assembles a system prompt from all layers", () => {
		writeFile("AGENT.md", MOCK_AGENT_MD);
		writeFile("CONTEXT.md", MOCK_CONTEXT_MD);
		writeFile("stages/01_resolve/CONTEXT.md", MOCK_STAGE_CONTRACT);
		writeFile("_config/kartaview-api-contract.md", MOCK_CONFIG_KARTAVIEW);

		const prompt = assembleSystemPrompt(tmpDir, "01_resolve");

		expect(prompt).toContain("Test Agent");
		expect(prompt).toContain("Stage Order");
		expect(prompt).toContain("Stage Contract — 01_resolve");
		expect(prompt).toContain("Convert raw coordinates");
		expect(prompt).toContain("Validate coordinates.");
		expect(prompt).toContain("Domain Configuration");
		expect(prompt).toContain("kartaview-api-contract");
		expect(prompt).toContain("KartaView API Contract");
	});

	it("works without config files", () => {
		writeFile("AGENT.md", MOCK_AGENT_MD);
		writeFile("CONTEXT.md", MOCK_CONTEXT_MD);
		writeFile("stages/01_resolve/CONTEXT.md", MOCK_STAGE_CONTRACT);

		const prompt = assembleSystemPrompt(tmpDir, "01_resolve");

		expect(prompt).toContain("Test Agent");
		expect(prompt).toContain("Stage Contract — 01_resolve");
		expect(prompt).not.toContain("Domain Configuration");
	});

	it("includes multiple config files", () => {
		writeFile("AGENT.md", MOCK_AGENT_MD);
		writeFile("CONTEXT.md", MOCK_CONTEXT_MD);
		writeFile("stages/02_discover/CONTEXT.md", MOCK_STAGE_CONTRACT.replace("01", "02"));
		writeFile("_config/kartaview-api-contract.md", MOCK_CONFIG_KARTAVIEW);
		writeFile("_config/storage-schema.md", "# Storage Schema");

		const prompt = assembleSystemPrompt(tmpDir, "02_discover");

		expect(prompt).toContain("kartaview-api-contract");
		expect(prompt).toContain("Storage Schema");
	});
});
