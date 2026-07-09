# pi-geosint-agent — Architecture

> **Status**: Living document — reflects the system as built.
> **Scope**: [@y4nn777/geo-\*](../../packages/) packages only. The upstream `@earendil-works/pi-*` packages are treated as platform dependencies and documented at their boundary, not internally.

## The System in One Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Human Operator                            │
│                    (browser dashboard)                            │
└───────────────────────┬──────────────────────────────────────────┘
                        │ HTTP (REST + SSE)
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                     geo-webui (HTTP server)                       │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ /runs   │  │ /events   │  │/evidence │  │ /settings      │   │
│  │ POST/GET│  │ SSE stream│  │ GET      │  │ GET/PUT        │   │
│  └────┬────┘  └───────────┘  └────┬─────┘  └────────────────┘   │
└───────┼───────────────────────────┼──────────────────────────────┘
        │                           │
        ▼                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    geo-workspace (pipeline)                        │
│                                                                   │
│  ┌───────────────┐   ┌───────────────┐   ┌──────────────────┐    │
│  │ stage-driver  │──▶│ workspace-     │   │ memory-store     │    │
│  │ (state machine│   │ loader        │   │ (SQLite)         │    │
│  │  + Agent)     │   │ (markdown     │   │ - index.sqlite   │    │
│  └───────┬───────┘   │  contracts)   │   │ - corrections    │    │
│          │           └───────────────┘   │   .sqlite         │    │
│          │                               └──────────────────┘    │
│          ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  01_resolve → 02_discover → [review] → 03_capture → 04_store│ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
┌───────────────────┐   ┌─────────────────────────────────────────┐
│  External APIs     │   │  geo-tools (deterministic functions)    │
│                    │   │                                         │
│  - Nominatim (OSM) │   │  ┌──────────────┐  ┌────────────────┐  │
│  - KartaView API   │   │  │ capture-     │  │ kartaview-     │  │
│  - (Mapillary,     │   │  │ direct       │  │ discover       │  │
│    MV.Live)        │   │  └──────────────┘  └────────────────┘  │
│                    │   │  ┌──────────────┐  ┌────────────────┐  │
│                    │   │  │ capture-     │  │ reverse-       │  │
│                    │   │  │ render       │  │ geocode        │  │
│  xvfb + CutyCapt   │   │  └──────────────┘  └────────────────┘  │
│  (subprocess)      │   │  ┌──────────────┐  ┌────────────────┐  │
│                    │   │  │ store-       │  │ geohash        │  │
│                    │   │  │ evidence     │  │                │  │
│                    │   │  └──────────────┘  └────────────────┘  │
└───────────────────┘   └─────────────────────────────────────────┘
```

**Interactions (key):**
- **→ REST/SSE** — HTTP request-response or server-sent event stream
- **→ API call** — outbound HTTPS to external services (Nominatim, KartaView)
- **→ subprocess** — `xvfb-run cutycapt` spawned for headless page rendering
- **→ SQLite** — synchronous file-based database access via `node:sqlite`

## The System in One Paragraph

pi-geosint-agent is a single-process geo-OSINT investigation server. Given a coordinate pair, it resolves the location (Nominatim reverse geocode), discovers nearby street-level imagery (KartaView API), presents candidates to a human for approval via a browser dashboard, captures the approved imagery (direct HTTP download or xvfb+CutyCapt headless render), and stores the results in a geohash-indexed SQLite store. Stages 01 and 02 optionally construct a pi Agent for LLM-based ambiguity resolution. Stages 03 and 04 are deterministic and never touch the agent runtime.

## Bounded Contexts

The system decomposes into five bounded contexts, two inherited and three custom. Each has a well-defined ownership rule.

### @earendil-works/pi-ai (inherited)
**Responsibility**: Unified multi-provider LLM API — OpenAI, Anthropic, Google, and others.
**Boundary**: Packages import model types and provider resolution. No geo-specific logic.
**Ownership rule**: Upstream (`@earendil-works`). Patches come through the monorepo.

### @earendil-works/pi-agent-core (inherited)
**Responsibility**: Agent runtime — tool calling, state management, message handling.
**Boundary**: Constructed only in `stage-driver.ts` (stages 01, 02). Never imported by `geo-tools`.
**Ownership rule**: Upstream. The geo packages depend on it but do not extend it.

### @y4nn777/geo-tools (custom)
**Responsibility**: Pure(ish) geo-OSINT tool functions — geohash encoding, reverse geocoding, KartaView discovery, image capture, evidence storage.
**Boundary**: Zero dependency on `@earendil-works/pi-*`. Only imports Node built-ins, `node:sqlite`, and its own types. Every function is a plain `async` export with typed inputs/outputs.
**Ownership rule**: These are the atomic units of the system. No function calls another geo-tools function (except `store-evidence` → `geohash` for the geohash7 encoding). They are composed by the orchestrator layer.

### @y4nn777/geo-workspace (custom)
**Responsibility**: Pipeline orchestration — stage state machine, workspace context loading, SQLite memory store for evidence queries.
**Boundary**: Imports from both `@earendil-works/pi-*` (for Agent construction) and `@y4nn777/geo-tools` (for tool function calls). Does not serve HTTP.
**Ownership rule**: The pipeline layer. Dictates the stage ordering, the review gate, and the data structures passed between stages.

### @y4nn777/geo-webui (custom)
**Responsibility**: HTTP server — REST endpoints for pipeline management, SSE event streaming for live progress, static file serving for the browser dashboard, settings persistence.
**Boundary**: Imports from `@y4nn777/geo-workspace` for pipeline functions and `@y4nn777/geo-tools` for geohash7. Does not import `@earendil-works/pi-*` directly.
**Ownership rule**: The Web/adapter layer. Translates HTTP requests into pipeline operations. Knows about HTTP but not about Agent internals.

### Cross-context rule

When the same concept appears in two contexts (e.g. `CandidateRecord` appears in both geo-workspace's stage-driver types and in the HTTP response), the ownership sits in geo-workspace (the orchestrator), and geo-webui transforms it to its own HTTP-specific shape. There is no shared type library across the two layers — the boundary is explicit serialization boundaries.

## Data Flow on the Golden Path

The golden path is the happy path: a user submits valid coordinates, stages complete without errors, the human approves candidates, evidence is stored.

### Step-by-step

```
User                geo-webui           geo-workspace         geo-tools        External
 │                     │                     │                    │               │
 │  POST /runs         │                     │                    │               │
 │  {lat, lon}         │                     │                    │               │
 │────────────────────>│                     │                    │               │
 │                     │  runStage01()       │                    │               │
 │                     │────────────────────>│                    │               │
 │                     │                     │  reverseGeocode()  │               │
 │                     │                     │───────────────────>│               │
 │                     │                     │                    │  Nominatim    │
 │                     │                     │                    │──────────────>│
 │                     │                     │                    │<──────────────│
 │                     │                     │<───────────────────│               │
 │                     │  return Resolve     │                    │               │
 │                     │<────────────────────│                    │               │
 │                     │                     │                    │               │
 │                     │  runStage02()       │                    │               │
 │                     │────────────────────>│                    │               │
 │                     │                     │  kartaviewDiscover │               │
 │                     │                     │───────────────────>│ KartaView API │
 │                     │                     │                    │──────────────>│
 │                     │                     │                    │<──────────────│
 │                     │                     │<───────────────────│               │
 │                     │  return Discover    │                    │               │
 │                     │<────────────────────│                    │               │
 │                     │                     │                    │               │
 │  SSE: awaiting_     │                     │                    │               │
 │  review             │                     │                    │               │
 │<────────────────────│                     │                    │               │
 │                     │                     │                    │               │
 │  POST /runs/:id/    │                     │                    │               │
 │  review (candidates)│                     │                    │               │
 │────────────────────>│                     │                    │               │
 │                     │  runStage03()       │                    │               │
 │                     │────────────────────>│                    │               │
 │                     │                     │  captureDirect() / │               │
 │                     │                     │  captureRender()   │               │
 │                     │                     │───────────────────>│ HTTP/xvfb     │
 │                     │                     │<───────────────────│               │
 │                     │  return Capture     │                    │               │
 │                     │<────────────────────│                    │               │
 │                     │                     │                    │               │
 │                     │  runStage04()       │                    │               │
 │                     │────────────────────>│                    │               │
 │                     │                     │  storeEvidence()   │               │
 │                     │                     │───────────────────>│               │
 │                     │                     │<───────────────────│               │
 │                     │  return Store       │                    │               │
 │                     │<────────────────────│                    │               │
 │  SSE: run_complete  │                     │                    │               │
 │<────────────────────│                     │                    │               │
```

### Key invariants on the golden path

- Each stage receives exactly the output type of the previous stage (enforced by TypeScript).
- The review gate produces `CandidateRecord[]` that stage 03 consumes. The same array is used for metadata enrichment in stage 04 (via `candidateMap`).
- Stage 03 is single-failure tolerant: a failed capture produces a `CaptureRecord` with `status: "failed"` but does not abort the for loop. Stage 04 skips failed captures.
- Stage 04 is idempotent by SHA256: if the same image was already stored, `INSERT OR REPLACE` is a no-op.
- SSE events are fanned out to all connected clients for a run. If a client disconnects mid-stream, their `ServerResponse` is removed from the run's events array.

## Consistency Map

| Store | Data | Consistency Model | Consumers | Access Pattern |
|---|---|---|---|---|
| **index.sqlite** | Evidence records (file paths, metadata, SHA256, geohash7) | Per-row monotonic. `INSERT OR REPLACE` by SHA256. No concurrent writers. | Stage 04 (write), evidence query endpoints (read), stage 02 geohash history check (read) | Write: one row per capture. Read: paginated prefix scan by geohash |
| **corrections.sqlite** | Human override corrections | Append-only log. No updates. | Stage 04 (write), future audit queries | Write: log on every human correction. Read: by photo ID |
| **settings.json** | Server configuration (workspace root, search radius, KartaView token) | Last-write-wins. Read on server start; re-read on PUT. | Server init (read), PUT /settings (write), pipeline stages (read at start) | Write: on every settings save. Read: once per process or on reload |
| **evidence/{gh7}/{date}/** | Captured images + `.sidecar.json` | File-system durability. Append-only (new files never overwrite existing ones given distinct SHA256). | Stage 03 (write temp), Stage 04 (copy to permanent), `/evidence-file` (read) | Write: one image + sidecar per capture. Read: by path derived from geohash7 + date + photo ID |

### Consistency guarantees

- index.sqlite reads may be slightly stale if a concurrent write is in progress (single writer, synchronous SQLite). Given the single-process architecture, staleness window is bounded by the write duration (< 50ms for typical inserts).
- Settings changes take effect on the next pipeline run, not mid-run. The run captures `settings` values at creation time via the closure in `handleCreateRun`.
- Evidence files are copied, not moved. If the copy fails, sidecar and index are not written (stage 04 abandons that capture).
- There is no distributed state. All state lives in the process memory (`runs` Map) and on the local filesystem.

## Failure Modes

| Failure | Detection | Effect | Mitigation |
|---|---|---|---|
| **Nominatim unreachable** | `ToolError("NETWORK_ERROR")` thrown by `reverseGeocode` | Stage 01 fails; run enters `failed` state; SSE sends `run_error` | Retry with backoff is caller-side (currently none — first failure aborts the run) |
| **KartaView API rate-limited** | `ToolError("RATE_LIMITED")` thrown by rate tracker | Stage 02 aborts; run fails | Set KartaView auth token for higher limit (1,000/hr). Rate tracker resets on process restart |
| **KartaView API returns 5xx** | `ToolError("API_ERROR")` | Stage 02 fails; run fails | Transient — retry the run |
| **Single capture fails (404, timeout)** | `ToolError` caught in stage 03 for loop | That capture recorded as `status: "failed"`. Other captures continue | Non-fatal by design |
| **CutyCapt binary missing** | `ToolError("MISSING_BINARY")` from `captureRender` | That capture fails; others continue | Install via `apt-get install xvfb cutycapt chromium` (packaged in Docker) |
| **Capture render hangs** | `AbortSignal.timeout(120_000)` kills the subprocess | That capture fails; subprocess is SIGTERM'd | Kill propagates to child process via negative PID |
| **Disk full / filesystem error** | `ToolError("FS_ERROR")` from `storeEvidence` | Stage 04 fails for that capture; other captures continue | Stage 04's inner try/catch isolates per-capture failures |
| **SQLite corruption** | SQLite throws on prepare/exec | Index query or write fails; data already stored in filesystem | index.sqlite is a secondary index; primary data is on the filesystem (images + sidecars) |
| **Server crash mid-run** | Process exit | In-memory run state (`runs` Map) is lost; in-progress pipeline is orphaned | Rerun from scratch. Evidence already written to disk survives |
| **Evidence file path traversal** | Path resolved against `storageRoot` is validated by prefix check in `handleEvidenceFile` | Rejected with 403 | `!resolved.startsWith(storageRoot)` guard |
| **Invalid coordinates** | Range check (`lat ∈ [-90,90]`, `lon ∈ [-180,180]`) in `handleCreateRun` | Returns 400 before pipeline starts | Client-side validation in dashboard as well |

### Single points of failure

- **The server process** — everything runs in one Node process. There is no redundancy, no graceful degradation, no load shedding. This is by design (single-analyst tool, not a multi-tenant service).
- **`index.sqlite`** — the evidence index is a single file. Corruption makes evidence queryable only by filesystem traversal (images and sidecars survive independently).
- **KartaView API** — the system has no fallback imagery source. If KartaView is down, stage 02 produces zero candidates and the pipeline terminates.
- **The `runs` Map** — in-memory state is lost on restart. Running pipelines are orphaned. No recovery mechanism exists.

## Decisions That Shape This

The system does not have formal ADRs (Architecture Decision Records). The load-bearing decisions, extracted from the code and its comments, are:

### D-001: Deterministic stages never import pi-agent-core
**File**: `packages/geo-workspace/src/stage-driver.ts` (lines 5-11)
**Why**: Stages 03 and 04 are pure data-processing loops. Importing the agent runtime there would create a coupling between the capture path and the LLM dependency tree, making the deterministic path harder to test and slower to load. The import gate is enforced by TypeScript module boundaries.
**Trade-off accepted**: Duplication of the SQLite schema definition (appears in both `store-evidence.ts` and `memory-store.ts`). Chosen over a shared schema module that would create a cross-boundary dependency.

### D-002: Single-process architecture
**Why**: The expected usage is a single analyst running investigations. Splitting into separate services (API server, pipeline worker, evidence store) would add operational complexity with zero benefit at this scale.
**Trade-off accepted**: No horizontal scaling. Runs are sequential per process (but async). In-memory state is lost on crash.

### D-003: Human review gate blocks the pipeline
**File**: `packages/geo-webui/src/server.ts` (lines 408-414)
**Why**: Evidence capture is an irreversible action (imagery is stored to disk). The gate ensures a human validates the candidate list before any data is written.
**Trade-off accepted**: The SSE connection must stay open during the review pause. HTTP keep-alive and SSE reconnect handle transient disconnects.

### D-004: KartaView as the primary imagery source
**Why**: KartaView provides a free API with programmatic access to street-level imagery. Mapillary and MV.Live are listed in the pipeline description but not yet integrated.
**Trade-off accepted**: Single-source dependency for imagery discovery. If KartaView changes its API or terms, discovery is broken until a fallback is implemented.

### D-005: SQLite with synchronous `node:sqlite` API
**File**: `packages/geo-tools/src/store-evidence.ts`, `packages/geo-workspace/src/memory-store.ts`
**Why**: Node 22.19+ ships the synchronous `DatabaseSync` API. For a single-process tool with low write volume (< 10 writes/min), synchronous access is simpler and eliminates connection pooling.
**Trade-off accepted**: Writes block the event loop for ~1-5ms. Acceptable given the investigation workflow is human-paced.

### D-006: SSE over WebSocket
**File**: `packages/geo-webui/src/server.ts` (lines 221-243)
**Why**: SSE is simpler to implement with Node's built-in `http` module (no upgrade handshake, no library dependency). The data flow is unidirectional (server → client) which fits SSE's native model.
**Trade-off accepted**: No client-to-server streaming (not needed). No native reconnection delay control (browser EventSource API handles this).

### D-007: Geohash7 for spatial indexing
**File**: `packages/geo-tools/src/geohash.ts`
**Why**: Geohash7 provides ~150m × 150m grid cells at the equator — appropriate precision for street-level imagery grouping. Prefix queries (`LIKE 'gcpvj%'`) enable variable-precision spatial lookups without a spatial index.
**Trade-off accepted**: Boundary artifacts (two photos a few meters apart on opposite sides of a geohash boundary end up in different buckets). Acceptable — the UI queries by prefix, and the sidecar JSON contains exact coordinates.

## What This Is Not

- **Not a multi-tenant service** — no user accounts, no auth, no isolation between analysts. Designed for one operator per server instance.
- **Not a distributed system** — no message queue, no worker pool, no horizontal scaling. Everything runs in one Node process.
- **Not an evidence management platform** — no tagging, no export pipelines, no integration with external case management tools. Evidence is stored as files + SQLite index.
- **Not real-time monitoring** — SSE events provide push progress during an active run, but there is no persistent event log, no webhook, and no retention policy for completed runs (evidence persists; run metadata is in-memory only).
- **Not a geospatial database** — geohash is a bucketing strategy, not a spatial index. Radius queries require filtering candidates after retrieval.
- **Not LLM-dependent** — the pipeline functions correctly without an LLM provider configured. Stages 01 and 02 fall back to heuristic-only mode when no agent config is provided.

---

*See [README.md](../../README.md) for quick start, API reference, and development setup.*
