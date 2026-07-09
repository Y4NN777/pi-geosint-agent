# Phase 0 — Verification Notes

## 1. Baseline build and test

**Source:** repo root, `npm install --ignore-scripts`, `npm run build`, `./test.sh`

- `npm install --ignore-scripts`: 351 packages, 0 vulnerabilities.
- `npm run build`: all 5 packages build successfully (tui, ai, agent, coding-agent, orchestrator).
- `./test.sh`: all tests pass.
  - `@earendil-works/pi-agent-core`: 67 files passed, 25 skipped, 451 tests passed, 733 skipped.
  - `@earendil-works/pi-coding-agent`: 158 files passed, 6 skipped, 1513 tests passed, 47 skipped.
  - `@earendil-works/pi-tui`: all tests pass (dot output).

**Verdict:** Clean baseline. No upstream regressions.

---

## 2. AgentHarness durable session persistence

**Source:** `packages/agent/docs/agent-harness.md`

`AgentHarness` provides durable session persistence via `Session` with pluggable storage implementations (`JsonlSessionStorage`, `InMemorySessionStorage`). It owns:
- Session persistence with message ordering
- Pending write queuing and flush at save points
- Compaction and tree navigation
- Turn snapshots with persisted messages, resolved resources, system prompt, model, etc.

**Decision:** Use `AgentHarness` for session storage of agent-backed stages (01, 02). No separate `sessions.sqlite` needed — the harness's built-in session layer covers conversation/run state for the agent loop. The `index.sqlite` for evidence indexing is a separate concern (geohash lookups, evidence metadata) and is still needed as specified in Phase 3's `memory-store.ts`. The `corrections.sqlite` for human override logging is also a separate concern.

**Key citations:**
- Line 3: "AgentHarness is the orchestration layer above the low-level agent loop. It owns session persistence..."
- Lines 80-84: Session contains persisted entries, durable leaf changes.
- Lines 86-92: Pending session writes queued during active operations, flushed at save points.
- Lines 142-152: Save point behavior flushes writes and creates fresh turn snapshots.

---

## 3. Provider list verification

**Source:** `packages/ai/README.md`

| Provider | Status | Import Path |
|----------|--------|-------------|
| **DeepSeek** | Named provider, built-in | `@earendil-works/pi-ai/providers/deepseek` |
| **OpenRouter** | Named provider, built-in | `@earendil-works/pi-ai/providers/openrouter` |
| **Ollama** | Not a named provider; wired via `createProvider()` with `openAICompletionsApi()` | Uses `createProvider()` pattern with `baseUrl: 'http://localhost:11434/v1'` |

All three are supported. DeepSeek and OpenRouter have dedicated factories. Ollama (and any OpenAI-compatible local endpoint) uses the generic `createProvider()` pattern documented in the "Custom Providers" section.

**Key citations:**
- Lines 62-63: "DeepSeek" listed under Supported Providers.
- Lines 73: "OpenRouter" listed under Supported Providers.
- Lines 926-953: `createProvider()` example for Ollama with `openAICompletionsApi()`, including model definition and auth config.
- Lines 380-413: Environment variable table — `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`.

---

## 4. Docker recipe (Plain Docker)

**Source:** `packages/coding-agent/docs/containerization.md`

The "Plain Docker" pattern (lines 45-77):

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent
WORKDIR /workspace
ENTRYPOINT ["pi"]
```

For the geo-OSINT agent, we will extend this base:
- Keep `node:24-bookworm-slim` as base.
- Add `xvfb`, `cutycapt`, and `chromium` for the render capture path.
- Use `npm install -g --ignore-scripts` for the published geo packages (or COPY for local builds).
- Non-root user matching DevSecOps conventions.

**Key citation:** Lines 49-61: `Dockerfile.pi` recipe.

---

## 5. KartaView auth flow

**Status:** Not yet verified. This requires:
1. Registering an OSM OAuth app (the upload-scripts repo documents this flow).
2. Obtaining a token.
3. Testing against the live API.

The rate limits are documented as 100/hr (unauthenticated) vs 1000/hr (authenticated). The contract file (`_config/kartaview-api-contract.md`) will include these limits with a `TODO: verify` note until the auth flow is confirmed in a later phase.

**Key unanswered question:** Whether KartaView's `/1.0/list/nearby-photos` endpoint returns photo URLs that can be downloaded directly (for `capture-direct.ts`) or always requires rendering the viewer page. This needs empirical testing.

---

## Phase 0 Summary

All verification items completed except KartaView auth flow (requires live API access and OSM OAuth registration — deferred to Phase 6 end-to-end testing).

- **Session persistence:** AgentHarness covers it for agent stages. `index.sqlite` and `corrections.sqlite` still needed for evidence/human-override logging.
- **Provider routing:** DeepSeek and OpenRouter are drop-in builtins. Ollama needs a custom provider wrapper.
- **Docker base:** `node:24-bookworm-slim` confirmed. Add `xvfb` + `cutycapt` for render path.
- **Import boundary:** Deterministic tools (`capture-direct`, `capture-render`, `store-evidence`) must not import from `@earendil-works/pi-agent-core`.
