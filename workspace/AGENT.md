# Geo-OSINT Agent — Workspace Layer 0

This workspace drives a geo-OSINT pipeline built on the `pi` agent framework. It discovers street-level imagery from KartaView for a given coordinate, captures the images (direct download or headless render), and stores them with structured metadata for evidence.

## Folder Map

```
workspace/
├── AGENT.md                        # Layer 0 — this file
├── CONTEXT.md                      # Layer 1 — pipeline overview, stage order, review gates
├── _config/                        # Layer 3 — domain contracts
│   ├── kartaview-api-contract.md   #   KartaView API endpoints, auth, rate limits
│   ├── storage-schema.md           #   Evidence file layout and sidecar metadata
│   ├── docker-network-policy.md    #   Allowed egress, no inbound except localhost
│   └── capture-path-rules.md       #   Direct vs render capture path rules
├── stages/                         # Pipeline stage contracts
│   ├── 01_resolve/CONTEXT.md       #   Reverse-geocode coordinates to address
│   ├── 02_discover/CONTEXT.md       #   Discover nearby KartaView photos
│   ├── 03_capture/CONTEXT.md       #   Capture image bytes (direct or render)
│   └── 04_store/CONTEXT.md         #   Store evidence with metadata
└── setup/questionnaire.md          # Setup-time configuration questions
```

## Non-negotiables

These four rules carry into every stage's implementation. A stage that violates them must be rejected in review:

1. **No autonomous git push, no unconfirmed docker exec, no credential logging.** Any action that modifies state outside the evidence directory requires explicit human approval via the review gate.

2. **Every LLM-touching stage must state which provider/model it targets and why.** Stage contracts list the model class appropriate to the stage (see `_config/providers.md` for the canonical provider reference). Implementations must respect this.

3. **Deterministic work never goes through an LLM call.** Downloading, hashing, storing, and geocoding (non-ambiguous) are executed directly. Only ambiguity resolution (stage 01) and candidate pruning (stage 02) use an agent loop.

4. **Every review gate blocks execution until a human explicitly approves via the web UI.** Stage 03 (capture) may not run until the human has reviewed and approved the candidate list from stage 02.
