/**
 * @y4nn777/geo-workspace — Geo-OSINT pipeline orchestrator.
 *
 * Modules:
 * - workspace-loader.ts    — reads workspace context and stage contracts
 * - stage-driver.ts        — runs the 4-stage pipeline
 * - memory-store.ts        — SQLite evidence index and corrections store
 *
 * Deterministic stages (03, 04) never import from @earendil-works/pi-agent-core.
 * Only stage-driver's Agent-backed paths (01, 02) touch the pi Agent class.
 */

export type { CorrectionEntry, EvidenceRow } from "./memory-store.ts";
export {
	logCorrection,
	openCorrectionsDb,
	openIndexDb,
	queryCorrections,
	queryRecentCaptures,
} from "./memory-store.ts";
export type {
	AgentConfig,
	CandidateRecord,
	CaptureRecord,
	CaptureStageResult,
	DiscoverStageResult,
	ResolveResult,
	StageContext,
	StoredRecord,
	StoreStageResult,
} from "./stage-driver.ts";
export {
	runStage01,
	runStage02,
	runStage03,
	runStage04,
} from "./stage-driver.ts";
export type { StageContract } from "./workspace-loader.ts";
export {
	assembleSystemPrompt,
	loadLayer0And1,
	loadStageContract,
} from "./workspace-loader.ts";
