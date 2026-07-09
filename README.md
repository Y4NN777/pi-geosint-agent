<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="64" style="vertical-align: middle">
  </a>
  <span style="display: inline-block; font: 700 32px/1 monospace; letter-spacing: 4px; vertical-align: middle; margin-left: 10px; color: #000;">
    GEOSINT
  </span>
</p>

<p align="center">
  <em>Browser-based geo-OSINT investigation pipeline — discover, review, capture, and store street-level imagery</em>
</p>

<p align="center">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
</p>

---

**pi-geosint-agent** is a modular geo-OSINT investigation tool. Given a coordinate pair, it resolves the location via reverse geocoding, discovers nearby street-level imagery from public APIs (KartaView, Mapillary, MV.Live), renders inaccessible pages in a headless browser, and stores captured evidence in an indexed SQLite store — all coordinated through an HTTP server with real-time SSE progress and a human review gate.

Built on the [Pi agent harness](https://pi.dev) (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`), which provides the LLM provider abstraction and agent runtime. Deterministic pipeline stages (capture, store) run independently; the agent is only constructed when LLM ambiguity resolution is needed (stages 01 and 02).

## Features

- **4-stage investigation pipeline** — resolve → discover → capture → store, with configurable stage contracts
- **Human review gate** — pipeline pauses after discovery; you approve or reject candidate evidence before capture
- **LLM-assisted candidate pruning** — stage 02 constructs an optional pi Agent to annotate, deduplicate, and recommend candidates based on geohash history
- **Dual capture methods** — direct image download for raw photo URLs, headless browser rendering (xvfb + CutyCapt) for dynamic viewer pages
- **Real-time SSE progress** — browser dashboard receives live stage transitions, capture results, and run errors
- **Geohash-indexed evidence store** — captured images bucketed by geohash7 prefix in SQLite, with sidecar JSON metadata and SHA256 deduplication
- **Rate-limited API integration** — KartaView `nearby-photos` and `photo` endpoints with in-memory rate tracking (100/hr unauthenticated, 1,000/hr with token)
- **Multi-provider LLM support** — OpenAI, Anthropic, Google, and more through the pi-ai provider abstraction
- **One-command Docker deployment** — multi-stage build, Chromium + CutyCapt bundled, persistent workspace and evidence volumes

## How It Works

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│  Submit   │    │ Stage 01 │    │  Stage 02    │    │ Stage 03 │    │ Stage 04 │
│  Coords   │───▶│ Resolve  │───▶│  Discover    │───▶│ Capture  │───▶│  Store   │
│ (lat/lon) │    │          │    │              │    │          │    │          │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘    └──────────┘
                                     │                    │
                                     ▼                    ▼
                              ┌──────────────┐    ┌──────────────┐
                              │  Review Gate │    │  xvfb +      │
                              │  (human)     │───▶│  CutyCapt    │
                              └──────────────┘    │  / direct    │
                                                   │  download    │
                                                   └──────────────┘
```

1. **Submit coordinates** — POST `/runs` with `{ lat, lon }`. The server creates a run and starts the pipeline asynchronously.
2. **Stage 01 — Resolve** — calls Nominatim (OSM) to reverse-geocode the coordinates. If multiple addresses are returned with close confidence scores, an optional pi Agent is constructed to disambiguate.
3. **Stage 02 — Discover** — queries the KartaView `/1.0/list/nearby-photos` API for street-level imagery within a configurable radius. An LLM agent annotates candidates, flags stale records, and checks geohash history for prior captures.
4. **Review gate** — the server emits an `awaiting_review` SSE event. The dashboard displays candidates with thumbnails and annotations. The human selects which to capture and submits the decision via POST `/runs/:id/review`.
5. **Stage 03 — Capture** — for each approved candidate, downloads the image directly (if a raw photo URL) or renders the page via `xvfb-run cutycapt` (if a dynamic viewer page). Stage failures are isolated — one failed capture does not abort the rest.
6. **Stage 04 — Store** — copies each captured image to `evidence/{geohash7}/{date}/kartaview/`, writes a sidecar JSON metadata file, and upserts the record into `index.sqlite` (idempotent by SHA256).

The full pipeline runs in a single process. Stages 03 and 04 are deterministic and never construct an LLM agent — they import only from `@y4nn777/geo-tools` and Node built-ins.

## Quick Start

```bash
docker compose up --build
```

Then open `http://127.0.0.1:8080` and submit coordinates to start a pipeline run.

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Frontend dashboard |
| `/runs` | POST | Start a new pipeline run (`{ lat, lon }`) |
| `/runs` | GET | List active and recent runs |
| `/runs/:id/events` | GET | SSE progress stream |
| `/runs/:id/review` | POST | Submit review-gate candidate decision |
| `/runs/:id/evidence` | GET | Captured evidence for a specific run |
| `/evidence` | GET | Paginated evidence query by geohash prefix |
| `/evidence-file` | GET | Serve stored evidence image file |
| `/settings` | GET/PUT | View or update server settings |

### Configuration

Settings are persisted to `evidence/settings.json` and editable through the dashboard or API:

| Setting | Default | Description |
|---|---|---|
| `workspaceRoot` | `./workspace` | Pipeline stage contracts and context |
| `storageRoot` | `./evidence` | Evidence output directory |
| `searchRadius` | `100` | KartaView search radius in meters |
| `kartaviewAuthToken` | — | Optional token for higher rate limit (1,000/hr) |

## Pipeline Details

```
01_geocode  →  02_discover  →  [review gate]  →  03_capture  →  04_store
```

| Stage | Description | LLM-backed |
|---|---|---|
| **01 — Resolve** | Reverse-geocode via Nominatim. Optionally disambiguates conflicting addresses with an LLM agent. | Optional |
| **02 — Discover** | Queries KartaView for nearby photos. Agent prunes candidates, checks geohash history, and recommends captures. | Optional |
| **Review gate** | Blocks pipeline. Human selects which candidates to capture via the dashboard. | No |
| **03 — Capture** | Downloads images or renders pages with xvfb + CutyCapt. Single-failure tolerant. | No |
| **04 — Store** | Copies evidence to geohash-bucketed directories, writes sidecar JSON, indexes in SQLite. | No |

LLM-backed stages (01, 02) construct a pi Agent only when `agentConfig` is provided. Without it, they run in pass-through mode with default heuristics (flag stale records, skip agent annotation).

## Packages

| Package | Description |
|---|---|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@y4nn777/geo-tools](packages/geo-tools)** | Geo primitives: geohash, KartaView discovery, reverse geocode, capture, evidence store |
| **[@y4nn777/geo-workspace](packages/geo-workspace)** | Pipeline orchestrator: workspace loader, stage driver, memory store |
| **[@y4nn777/geo-webui](packages/geo-webui)** | HTTP server, SSE event stream, single-page frontend |

### Architecture

```
geo-webui (HTTP server)
  ├── /runs — pipeline orchestration (async)
  ├── /events — SSE progress stream
  └── /evidence — evidence queries
        │
        ▼
geo-workspace (pipeline orchestrator)
  ├── stage-driver — runs the 4-stage pipeline
  ├── workspace-loader — reads stage contracts from markdown
  └── memory-store — SQLite evidence + corrections DB
        │
        ▼
geo-tools (deterministic tool functions)
  ├── kartaview-discover — KartaView API client + rate limiter
  ├── reverse-geocode — Nominatim client with ambiguity detection
  ├── capture-direct — direct image download
  ├── capture-render — xvfb + CutyCapt headless rendering
  ├── store-evidence — geohash-bucketed storage + SQLite index
  └── geohash — geohash7 encoding + neighbour computation
```

The key design rule: **deterministic stages never import `@earendil-works/pi-agent-core`**. The LLM agent boundary is contained to `stage-driver.ts` (stages 01 and 02 only). All geo-tools functions are plain async exports with zero framework dependency.

## Development

```bash
npm install --ignore-scripts
npm run build        # Build all packages
npm run check        # Lint, format, type check
./test.sh            # Run tests (skips LLM tests without API keys)
```

### Local run (without Docker)

```bash
node packages/geo-webui/dist/server.js
```

## Docker

Multi-stage Dockerfile builds in dependency order: `ai → agent → geo-tools → geo-workspace → geo-webui`.

The runtime image (`node:24-bookworm-slim`) includes Chromium, xvfb, and CutyCapt for headless browser capture. Volumes mount `./workspace` and `./evidence` for persistent state across restarts.

```bash
# Build and run
docker build -t geo-osint-agent .
docker run -p 127.0.0.1:8080:8080 \
  -v ./workspace:/app/workspace \
  -v ./evidence:/app/evidence \
  geo-osint-agent
```

## License

MIT
