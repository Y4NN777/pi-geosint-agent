# Geo-OSINT Agent — Build Plan (pi fork)

**Intent:** Fork `earendil-works/pi`, keep `pi-ai` + `pi-agent-core` as the provider/agent-loop foundation, add a geo-OSINT capability layer (KartaView discovery, CutyCapt/EyeWitness capture, structured evidence storage) driven by an MWP-style folder workspace, exposed through a local web UI, fully containerized.

**Non-negotiables (carry into every stage's contract):**
- No autonomous git push, no unconfirmed docker exec, no credential logging.
- Every LLM-touching stage must state which provider/model it targets and why.
- Deterministic work (fetch/download/hash/store) never goes through an LLM call.
- Every review gate blocks execution until a human explicitly approves via the web UI.

---

## Phase 0 — Verification (do this before writing code)

- [ ] Fork `earendil-works/pi`, `npm install --ignore-scripts`, run `npm run build` and `./test.sh` to confirm a clean baseline.
- [ ] Read `packages/agent/docs/agent-harness.md` in full. Determine whether `AgentHarness` already provides durable session persistence. **Decision point:** if yes, use it for session storage instead of a custom `sessions.sqlite`; if no, note why and proceed with the custom store in Phase 3.
- [ ] Read `packages/ai/README.md` provider list in full. Confirm whether DeepSeek is a named provider (`@earendil-works/pi-ai/providers/deepseek`) or must be wired as an OpenAI-compatible endpoint. Same check for OpenRouter and local Ollama.
- [ ] Read `packages/coding-agent/docs/containerization.md` in full — confirm the exact "Plain Docker" recipe (base image, entrypoint) rather than assuming.
- [ ] Confirm KartaView auth flow currently works: register an OSM OAuth app (public API docs don't formally document auth; verify via the upload-scripts repo referenced in prior research) and obtain a token. Note the 100/hr (unauth) vs 1000/hr (auth) limits in `_config/kartaview-api-contract.md` once written.

**Acceptance:** a short `docs/verification-notes.md` in the fork answering each bullet above with citations to the source file/line.

---

## Phase 1 — MWP workspace scaffold

Create the folder structure below exactly. No code yet — this phase is pure scaffolding + contract-writing, since every later phase reads from it.

```
workspace/
├── AGENT.md                          # Layer 0
├── CONTEXT.md                        # Layer 1
├── _config/                          # Layer 3
│   ├── kartaview-api-contract.md
│   ├── storage-schema.md
│   ├── docker-network-policy.md
│   └── capture-path-rules.md
├── stages/
│   ├── 01_resolve/CONTEXT.md
│   ├── 02_discover/CONTEXT.md
│   ├── 03_capture/CONTEXT.md
│   └── 04_store/CONTEXT.md
└── setup/questionnaire.md
```

Tasks:
- [ ] Write `AGENT.md`: what this workspace is, folder map, the four non-negotiables above.
- [ ] Write `CONTEXT.md`: stage order, when a run stops for human review, where evidence lands.
- [ ] Write `_config/kartaview-api-contract.md`: endpoints (`/1.0/list/nearby-photos`, `/1.0/photo`), rate limits, auth header format, the metadata-accuracy caveat (don't treat KartaView timestamps/coords as ground truth without noting it).
- [ ] Write `_config/storage-schema.md`: the geohash7/date/source bucketing, sidecar JSON shape (`lat, lon, heading, captured_at, fetched_at, sha256, source_url`).
- [ ] Write `_config/docker-network-policy.md`: allowed egress domains only (`kartaview.org`, geocoder host), no inbound ports except localhost web UI.
- [ ] Write `_config/capture-path-rules.md`: default to direct download; render path only when a candidate is explicitly flagged `needs_render: true`.
- [ ] Write each `stages/NN_*/CONTEXT.md` per the Inputs/Process/Outputs template (see Phase 3 for exact per-stage schemas — write these in tandem with the tool specs so they don't drift apart).
- [ ] Write `setup/questionnaire.md`: default search radius, storage root path, provider/model choice per stage, KartaView auth token entry.

**Acceptance:** a human (not an agent) can read all files top-to-bottom and understand the entire pipeline without running anything, per MWP's literate-programming property.

---

## Phase 2 — `packages/geo-tools`

Each tool is a plain async function plus an `AgentTool` wrapper (typebox schema) **only for the two stages that need LLM judgment** (01, 02). Stages 03/04 call these functions directly, no `AgentTool` wrapper needed for those call sites — but write them as plain exported functions either way so both call paths (direct or agent-mediated) can reuse the same implementation.

### `reverse-geocode.ts`
- Input: `{ lat: number, lon: number }`
- Calls Nominatim (or configured geocoder).
- Output: `{ address: string, confidence: number, alternates?: Array<{address, confidence}> }`
- **Ambiguity rule:** if top confidence − second confidence < 0.15, or 2+ alternates within 0.05 of each other, return `alternates` populated — this is the signal stage 01's `Agent` uses to decide whether to ask the human.
- [ ] Unit test: known coordinate resolves; boundary coordinate (e.g. near a border) returns alternates.

### `kartaview-discover.ts`
- Input: `{ lat, lon, radiusMeters, authToken? }`
- Calls `/1.0/list/nearby-photos`, then `/1.0/photo?sequenceId=X` per sequence.
- Output: `Array<{ sequenceId, photoId, lat, lon, heading, capturedAt, url }>`
- **Staleness/consistency rule:** flag any photo where `capturedAt` is >2 years old, or where returned coordinates are >~50m from the query point (KartaView's own accuracy caveat) — set `flagged: true, flagReason: string` on the record. This is what stage 02's `Agent` reasons over.
- Rate limit handling: track calls/hour locally (simple in-memory or sqlite counter), refuse to exceed configured limit, surface a clear error rather than silently retrying into a ban.
- [ ] Unit test with a mocked HTTP layer: verify flagging logic on synthetic stale/inconsistent records.

### `capture-direct.ts`
- Input: one discovered photo record.
- Downloads the image bytes directly from the KartaView-provided URL.
- Output: `{ path: string, sha256: string, bytes: number }`
- [ ] Test: download failure (404/timeout) returns a typed error, doesn't throw raw.

### `capture-render.ts`
- Input: `{ url: string }` (a KartaView viewer page URL, only used when `needs_render: true`)
- Shells out to `xvfb-run cutycapt --url=... --out=...` (or EyeWitness if batching multiple URLs — decide per Phase 0 verification of which is simpler to wire for single-URL calls; CutyCapt is likely the leaner primitive here).
- Output: `{ path: string, sha256: string }`
- [ ] Test: verify subprocess timeout handling (headless browser hangs are common — set a hard timeout, kill and error rather than hang the pipeline).

### `store-evidence.ts`
- Input: capture output + discovery metadata.
- Computes geohash7, writes file to `evidence/{geohash}/{date}/{source}/`, writes sidecar JSON, upserts row into `index.sqlite`.
- [ ] Test: idempotency — running store twice on the same sha256 doesn't duplicate rows.

### `check-geohash-history.ts` (exposed as an `AgentTool` for stage 02)
- Input: `{ geohash: string, radiusBuckets?: number }`
- Queries `index.sqlite` for prior captures near this bucket.
- Output: `Array<{ capturedAt, source, path }>`
- Purpose: lets stage 02's model avoid re-discovering/re-flagging what's already in evidence.
- [ ] Test: returns empty array cleanly on first-ever run (no table yet).

**Acceptance for Phase 2:** every function has a unit test, none of the deterministic functions (`capture-direct`, `capture-render`, `store-evidence`) import anything from `pi-agent-core` — that import boundary is how you enforce the tools-vs-scripts separation in code review.

---

## Phase 3 — `packages/geo-workspace`

### `workspace-loader.ts`
- [ ] `loadLayer0And1(workspaceRoot): string` — reads `AGENT.md` + `CONTEXT.md`, concatenates.
- [ ] `loadStageContract(workspaceRoot, stageName): StageContract` — parses a stage's `CONTEXT.md` into `{ inputs: string[], process: string, outputs: string[] }`. Simple markdown section parsing is fine — don't over-engineer a parser here.
- [ ] `assembleSystemPrompt(workspaceRoot, stageName): string` — Layer 0 + 1 + this stage's Layer 2 + whichever `_config/*.md` (Layer 3) files the stage's Inputs table names. This is the single function every stage call goes through.

### `stage-driver.ts`
- [ ] `runStage01(coords): ResolveResult` — calls `reverse-geocode.ts` directly first; only constructs an `Agent` (with `assembleSystemPrompt`) if the result has `alternates` populated. Model choice for this stage read from `setup/questionnaire.md` config (default: a cheap fast model — Haiku-class/DeepSeek-class).
- [ ] `runStage02(location): DiscoverResult` — calls `kartaview-discover.ts`, then constructs an `Agent` with `check-geohash-history` as an `AgentTool`, prompted to review flagged records and produce a pruned/annotated `candidate_sequences.json`. Model choice: a stronger reasoning model, since this is the one stage where judgment quality matters most.
- [ ] `runStage03(candidates): CaptureResult` — **no `Agent` constructed.** Plain loop calling `capture-direct.ts` or `capture-render.ts` per candidate based on its `needs_render` flag. This stage only runs after the human review-gate approval (see Phase 4).
- [ ] `runStage04(captures): StoreResult` — **no `Agent` constructed.** Plain loop calling `store-evidence.ts`.
- [ ] `memory-store.ts` — SQLite schema for `index.sqlite` (geohash, coords, source, path, sha256, captured_at) and, separately, a `corrections.sqlite` table logging every human override at the stage-02 review gate (`stage, input_hash, original_flag, human_decision, timestamp`) — write-only for now, no automated promotion to Layer 3 yet (that's a documented v2, don't build it in v1).

**Acceptance:** `stage-driver.ts` has one exported function per stage, each independently testable by mocking `geo-tools` functions — no test should need a real KartaView API call or a real LLM call.

---

## Phase 4 — `packages/geo-webui`

### Server (`server.ts`)
- [ ] REST endpoint: `POST /runs` — starts a new pipeline run given `{ lat, lon }`, returns a `runId`.
- [ ] WebSocket per run: streams stage progress events (reuse `Agent.subscribe` event shape for stages 01/02; synthesize equivalent progress events for 03/04 since those aren't `Agent`-backed).
- [ ] `POST /runs/:id/review` — the review-gate approval endpoint. Body: pruned/edited `candidate_sequences.json`. This unblocks `runStage03`.
- [ ] `GET /evidence?geohash=&dateFrom=&dateTo=&source=` — paginated query against `index.sqlite` for the evidence browser.
- [ ] Settings endpoint for API keys — store via Docker secrets or an encrypted local file; never write keys into `workspace/` or logs.

### Frontend (`src/`)
- [ ] Run trigger form (lat/lon input).
- [ ] Review-gate panel: renders `candidate_sequences.json` as a list with approve/reject/edit-in-place controls, submits to `/runs/:id/review`.
- [ ] Evidence browser: paginated grid over `/evidence`, filterable.
- [ ] Live progress view: consumes the WebSocket stream, shows current stage + streamed model text for stages 01/02.
- [ ] (v1.5, optional) free-form chat panel against session memory — defer unless v1 is solid.

**Acceptance:** a full run — coordinate in, review gate shown, approve, evidence appears in the browser — works end to end against at least two different providers (e.g. Anthropic + one OpenAI-compatible/local model) to prove the multi-provider abstraction actually holds.

---

## Phase 5 — Docker

- [ ] `Dockerfile` based on the Plain Docker pattern confirmed in Phase 0 — add `xvfb`, `cutycapt`, `chromium` (or EyeWitness's deps) on top of pi's own base image requirements.
- [ ] `docker-compose.yml`: single service (orchestrator + web UI in one container is fine for v1 — don't split services prematurely), volumes for `workspace/` and `evidence/`, egress allowlist per `_config/docker-network-policy.md`, only the web UI port exposed and bound to `127.0.0.1`.
- [ ] Non-root user in the container, matching your existing DevSecOps conventions.

**Acceptance:** `docker compose up` from a clean checkout produces a working local agent with no host dependencies beyond Docker itself.

---

## Phase 6 — Test pass / hardening

- [ ] Run a real end-to-end test against a known KartaView-covered coordinate (verify coverage first — remember their coverage is uneven and concentrated in specific regions per prior research; pick a location known to have imagery, don't assume Ouagadougou has dense coverage without checking).
- [ ] Verify rate-limit handling actually refuses gracefully at the configured threshold rather than erroring on the KartaView side.
- [ ] Verify the review-gate genuinely blocks stage 03 — test by *not* approving and confirming nothing gets captured.
- [ ] Verify `corrections.sqlite` is actually populated on a rejected/edited candidate.

---

## Suggested delegation order

If handing this to a coding agent in discrete tickets, this order minimizes rework:

1. Phase 0 (verification — do this yourself or have the agent report back before Phase 1 starts, since it can change Phase 3's design)
2. Phase 1 (scaffolding — cheap, unblocks everything else, and forces the contracts to exist before any code)
3. Phase 2 (tools — fully unit-testable in isolation, no `pi-agent-core` dependency)
4. Phase 3 (workspace driver — depends on 1 and 2 both being stable)
5. Phase 5 (Docker — can happen in parallel with 3/4 once Phase 2's toolchain deps are known)
6. Phase 4 (web UI — depends on 3's stage-driver interfaces being stable)
7. Phase 6 (hardening — last, needs everything else working)
