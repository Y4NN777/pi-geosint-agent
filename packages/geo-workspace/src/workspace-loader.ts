/**
 * Geo-OSINT workspace loader.
 *
 * Reads workspace context from markdown files:
 *   - Layer 0: AGENT.md — agent identity and non-negotiables
 *   - Layer 1: CONTEXT.md — pipeline overview and stage ordering
 *   - Stage contracts: stages/{stageName}/CONTEXT.md — per-stage inputs/process/outputs
 *
 * Used by stage-driver to assemble system prompts and validate stage inputs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parsed stage contract extracted from a stage's CONTEXT.md.
 */
export interface StageContract {
	/** The stage's purpose description. */
	purpose: string;
	/** Declared inputs from the contract table. */
	inputs: Array<{ name: string; source: string; description: string }>;
	/** Ordered list of process steps. */
	process: string[];
	/** Raw JSON shape from the Outputs section. */
	outputShape: string;
}

/**
 * Read and concatenate Layer 0 (AGENT.md) and Layer 1 (CONTEXT.md).
 *
 * @param workspaceRoot - Absolute path to the `workspace/` directory.
 * @returns Concatenated content of AGENT.md followed by CONTEXT.md, separated by a header.
 */
export function loadLayer0And1(workspaceRoot: string): string {
	const agentPath = join(workspaceRoot, "AGENT.md");
	const contextPath = join(workspaceRoot, "CONTEXT.md");

	const parts: string[] = [];

	if (existsSync(agentPath)) {
		parts.push("# Layer 0 — Agent Identity");
		parts.push(readFileSync(agentPath, "utf-8"));
	}

	if (existsSync(contextPath)) {
		parts.push("# Layer 1 — Pipeline Context");
		parts.push(readFileSync(contextPath, "utf-8"));
	}

	return parts.join("\n\n");
}

/**
 * Load and parse a stage contract from its CONTEXT.md.
 *
 * @param workspaceRoot - Absolute path to the `workspace/` directory.
 * @param stageName - Stage folder name, e.g. `01_resolve`.
 * @returns Parsed StageContract.
 * @throws If the stage CONTEXT.md cannot be read.
 */
export function loadStageContract(workspaceRoot: string, stageName: string): StageContract {
	const stagePath = join(workspaceRoot, "stages", stageName, "CONTEXT.md");
	if (!existsSync(stagePath)) {
		throw new Error(`Stage contract not found: ${stagePath}`);
	}

	const content = readFileSync(stagePath, "utf-8");
	const sections = extractSections(content);

	return {
		purpose: extractSectionBody(sections, "Purpose"),
		inputs: parseInputTable(sections),
		process: parseProcessSteps(sections),
		outputShape: extractSectionBody(sections, "Outputs"),
	};
}

/**
 * Assemble a system prompt for a stage by combining Layer 0, Layer 1,
 * the stage contract, and any relevant config files from `_config/`.
 *
 * Only LLM-touching stages (01, 02) should call this. Deterministic
 * stages (03, 04) do not need a system prompt.
 *
 * @param workspaceRoot - Absolute path to the `workspace/` directory.
 * @param stageName - Stage folder name, e.g. `01_resolve`.
 * @returns Assembled system prompt string.
 */
export function assembleSystemPrompt(workspaceRoot: string, stageName: string): string {
	const parts: string[] = [];

	// Layer 0 + 1
	parts.push(loadLayer0And1(workspaceRoot));

	// Stage contract
	const contract = loadStageContract(workspaceRoot, stageName);
	parts.push(`# Stage Contract — ${stageName}`);
	parts.push(`## Purpose\n${contract.purpose}`);
	parts.push("## Inputs");
	for (const input of contract.inputs) {
		parts.push(`- **${input.name}** (${input.source}): ${input.description}`);
	}
	parts.push("## Process");
	for (const step of contract.process) {
		parts.push(`- ${step}`);
	}
	parts.push("## Expected Output Shape");
	parts.push(contract.outputShape);

	// Config files from _config/
	const configDir = join(workspaceRoot, "_config");
	if (existsSync(configDir)) {
		parts.push("# Domain Configuration");
		const entries = readDirSafe(configDir);
		for (const entry of entries.sort()) {
			const configPath = join(configDir, entry);
			if (configPath.endsWith(".md")) {
				parts.push(`## ${entry.replace(".md", "")}`);
				parts.push(readFileSync(configPath, "utf-8"));
			}
		}
	}

	return parts.join("\n\n");
}

// ── Helpers ────────────────────────────────────────────────────────────

interface SectionMap {
	[key: string]: string;
}

/**
 * Split markdown content into sections by ## headings.
 */
function extractSections(content: string): SectionMap {
	const sections: SectionMap = {};
	const lines = content.split("\n");
	let currentHeading = "";
	let currentBody: string[] = [];

	for (const line of lines) {
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			if (currentHeading) {
				sections[currentHeading] = currentBody.join("\n").trim();
			}
			currentHeading = headingMatch[1].trim();
			currentBody = [];
		} else {
			currentBody.push(line);
		}
	}
	if (currentHeading) {
		sections[currentHeading] = currentBody.join("\n").trim();
	}

	return sections;
}

/**
 * Extract the body of a named section.
 */
function extractSectionBody(sections: SectionMap, name: string): string {
	return sections[name] ?? "";
}

/**
 * Parse the Inputs markdown table into structured entries.
 */
function parseInputTable(sections: SectionMap): StageContract["inputs"] {
	const raw = sections.Inputs;
	if (!raw) {
		return [];
	}

	const lines = raw.split("\n").filter((l) => l.trim().length > 0);
	const inputs: StageContract["inputs"] = [];

	// Skip header and separator lines (contain | and ---)
	let inTable = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("|") && trimmed.includes("---")) {
			inTable = true;
			continue;
		}
		if (!inTable || !trimmed.startsWith("|")) {
			continue;
		}

		const cells = trimmed
			.split("|")
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		if (cells.length >= 3) {
			inputs.push({
				name: cells[0],
				source: cells[1],
				description: cells[2],
			});
		}
	}

	return inputs;
}

/**
 * Parse the Process section into a list of steps.
 */
function parseProcessSteps(sections: SectionMap): string[] {
	const raw = sections.Process;
	if (!raw) {
		return [];
	}

	return raw
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith("#"))
		.map((l) => l.replace(/^\d+\.\s*/, "").trim());
}

/**
 * Safe readdir that returns [] on missing dir.
 */
function readDirSafe(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}
