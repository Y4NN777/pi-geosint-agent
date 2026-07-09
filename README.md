<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="64" style="vertical-align: middle">
  </a>
  <span style="display: inline-block; font: 700 32px/1 monospace; letter-spacing: 4px; vertical-align: middle; margin-left: 10px; color: #000;">
    GEOSINT
  </span>
</p>

<p align="center">
  <em>Browser-based geo-OSINT investigation pipeline — discover, capture, and store street-level imagery</em>
</p>

<p align="center">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
</p>

---

**pi-geosint-agent** is a modular geo-OSINT investigation tool. Given a coordinate pair, it normalises the input via a deterministic coordinate parser (DD, DMS/DDM, Google Maps URL, Plus Codes), resolves the location via reverse geocoding, discovers nearby street-level imagery from KartaView and Google Street View, renders inaccessible pages in a headless browser, and stores captured evidence in an indexed SQLite store — all coordinated through an HTTP server with real-time SSE progress.

Built on the [Pi agent harness](https://pi.dev) (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`), which provides the LLM provider abstraction and agent runtime. Deterministic pipeline stages (capture, store) run independently; the agent is only constructed when LLM ambiguity resolution is needed (stages 01 and 02).

## Features

- **Coordinate input flexibility** — accepts DD, DMS/DDM, Google Maps URLs, and Plus Codes through a deterministic parser with ambiguity guard (no LLM)
- **4-stage investigation pipeline** — resolve → discover → capture → store, with configurable stage contracts
- **Multi-source discovery** — queries both KartaView and Google Street View in parallel; deduplicates by proximity and timestamp
- **8-compass heading coverage** — each source reports which heading buckets (N/NE/E/SE/S/SW/W/NW) have imagery, enabling angle-completeness decisions
- **Linear pipeline** — five stages run automatically: parse → resolve → discover → capture → store. All candidates are captured without manual intervention.
- **LLM-assisted candidate pruning** — stage 02 optionally constructs a pi Agent to annotate, deduplicate, and recommend candidates based on geohash history
- **Dual capture methods** — direct image download for raw photo URLs, headless browser rendering (xvfb + CutyCapt) for dynamic viewer pages
- **Real-time SSE progress** — browser dashboard receives live stage transitions, capture results, and run errors
- **Geohash-indexed evidence store** — captured images bucketed by geohash7 prefix in SQLite, with sidecar JSON metadata and SHA256 deduplication
- **Rate-limited API integration** — KartaView `nearby-photos` and `photo` endpoints with in-memory rate tracking (100/hr unauthenticated, 1,000/hr with token); Google Street View Metadata + Static API with heading parameter
- **Multi-provider LLM support** — OpenAI, Anthropic, Google, and more through the pi-ai provider abstraction
- **One-command Docker deployment** — multi-stage build, Chromium + CutyCapt bundled, persistent workspace and evidence volumes

## How It Works

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  Submit   │    │  Parse   │    │ Stage 01     │    │  Stage 02    │    │ Stage 03 │
│  Input    │───▶│  Coords  │───▶│  Resolve     │───▶│  Discover    │───▶│ Capture  │
│ (any fmt) │    │ (no LLM) │    │ (Nominatim)  │    │ KartaView +  │    │ (direct  │
└──────────┘    └──────────┘    └──────────────┘    │  GSV         │    │  /xvfb)  │
                                                     └──────┬───────┘    └─────┬────┘
                                                            │                  │
                                                            ▼                  ▼
                                                     ┌──────────────┐   ┌──────────┐
                                                     │ Stage 04     │   │  xvfb +  │
                                                     │ Store        │◀──│  CutyCapt│
                                                     │ (evidence/   │   │  / direct│
                                                     │  index.sqlite│   │  download│
                                                     └──────────────┘   └──────────┘
```

1. **Submit coordinates** — POST `/runs` with `{ lat, lon }`, DMS string, Google Maps URL, or Plus Code. The server normalises the input via `parse-coordinates.ts` (deterministic, no LLM) before the pipeline starts.
2. **Stage 01 — Resolve** — calls Nominatim (OSM) to reverse-geocode the coordinates. If multiple addresses are returned with close confidence scores, an optional pi Agent is constructed to disambiguate.
3. **Stage 02 — Discover** — queries **both** KartaView (`/1.0/list/nearby-photos`) and Google Street View (Metadata API + Static API) in parallel. Each source returns candidates with 8-compass heading bucket coverage. An LLM agent optionally annotates candidates, flags stale records, and checks geohash history for prior captures. Results are merged and deduplicated by geohash6 proximity.
4. **Stage 03 — Capture** — for each candidate, downloads the image directly (if a raw photo URL) or renders the page via `xvfb-run cutycapt` (if a dynamic viewer page). Stage failures are isolated — one failed capture does not abort the rest.
5. **Stage 04 — Store** — copies each captured image to `evidence/{geohash7}/{date}/{source}/`, writes a sidecar JSON metadata file, and upserts the record into `index.sqlite` (idempotent by SHA256).

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
parse → 01_resolve → 02_discover → 03_capture → 04_store
```

| Stage | Description | LLM-backed |
|---|---|---|
| **Pre — Parse** | Normalises coordinate input (DD, DMS/DDM, Google Maps URL, Plus Codes). Ambiguity guard rejects lon,lat order. Deterministic — no LLM. | No |
| **01 — Resolve** | Reverse-geocode via Nominatim. Optionally disambiguates conflicting addresses with an LLM agent. | Optional |
| **02 — Discover** | Queries KartaView + Google Street View in parallel. Returns heading-bucket coverage per source. Agent optionally prunes candidates, checks geohash history, and recommends captures. | Optional |
| **03 — Capture** | Downloads images or renders pages with xvfb + CutyCapt. Single-failure tolerant. | No |
| **04 — Store** | Copies evidence to geohash-bucketed directories, writes sidecar JSON, indexes in SQLite. | No |

LLM-backed stages (01, 02) construct a pi Agent only when `agentConfig` is provided. Without it, they run in pass-through mode with default heuristics (flag stale records, skip agent annotation).

## Packages

| Package | Description |
|---|---|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@y4nn777/geo-tools](packages/geo-tools)** | Geo primitives: coordinate parsing (DD/DMS/Plus Codes), geohash, multi-source discovery (KartaView + Google Street View), reverse geocode, capture, heading coverage reporting, evidence store |
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
  ├── parse-coordinates — DD, DMS/DDM, Google Maps URL, Plus Codes parser
  ├── kartaview-discover — KartaView API client + rate limiter + coverage
  ├── street-view-discover — Google Street View metadata check + 4-heading static URLs + coverage
  ├── heading-utils — 8-compass heading bucket computation
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
