<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="64" style="vertical-align: middle">
  </a>
  <span style="display: inline-block; font: 700 32px/1 monospace; letter-spacing: 4px; vertical-align: middle; margin-left: 10px; color: #000;">
    GEOSINT
  </span>
</p>

<p align="center">
  <em>Geo-OSINT investigation agent — browser-based OSINT pipeline built on the Pi agent harness</em>
</p>

<p align="center">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
</p>

---

**pi-geosint-agent** is a modular geo-OSINT investigation tool that chains browser-based capture stages into a review-gated pipeline. It searches street-level imagery APIs (KartaView, Mapillary, MV.Live), renders locations in a headless browser, and resolves coordinates through reverse geocoding — all coordinated by a lightweight HTTP server with real-time SSE progress.

Built on the [Pi agent harness](https://pi.dev) (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`), which provides the LLM provider abstraction and agent runtime.

## Quick Start

```bash
docker compose up --build
```

Then open `http://127.0.0.1:8080` and submit coordinates to start a pipeline run.

The server exposes:

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Frontend UI |
| `/runs` | POST | Start a new pipeline run |
| `/runs` | GET | List runs |
| `/runs/:id/events` | GET | SSE progress stream |
| `/runs/:id/review` | POST | Submit review-gate decision |
| `/evidence` | GET | Query captured evidence |
| `/settings` | GET/PUT | View or update settings |

## Pipeline

A run progresses through four stages:

```
01_geocode  →  02_discover  →  [review gate]  →  03_capture  →  04_store
```

- **01** resolves coordinates via reverse geocoding
- **02** discovers nearby street-level imagery (KartaView / MV.Live / Mapillary)
- **Review gate** pauses for human review of discovered locations
- **03** captures screenshots via headless Chromium (CutyCapt)
- **04** stores evidence in SQLite with geohash indexing

## Packages

| Package | Description |
|---|---|
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) — foundation |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management — foundation |
| **[@y4nn777/geo-tools](packages/geo-tools)** | Geo primitives: geohash, KartaView discovery, reverse geocode, capture, evidence store |
| **[@y4nn777/geo-workspace](packages/geo-workspace)** | Pipeline orchestrator: workspace loader, stage driver, memory store |
| **[@y4nn777/geo-webui](packages/geo-webui)** | HTTP server, SSE event stream, single-page frontend |

## Development

```bash
npm install --ignore-scripts
npm run build        # Build all packages
npm run check        # Lint, format, type check
./test.sh            # Run tests (skips LLM tests without API keys)
```

## Docker

Multi-stage Dockerfile builds in dependency order:

```
ai → agent → geo-tools → geo-workspace → geo-webui
```

The runtime image (`node:24-bookworm-slim`) includes Chromium and CutyCapt for headless browser capture. Volumes mount `./workspace` and `./evidence` for persistent state across restarts.

## License

MIT
