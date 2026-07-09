# Geo-OSINT Agent — Workspace Layer 0

This workspace drives a **linear, multi-source geo-OSINT pipeline** built on the `pi` agent framework. It discovers street-level imagery from **KartaView** and **Google Street View** for a given coordinate, captures the images, and stores them with structured metadata for evidence. The pipeline is fully deterministic — no LLM agents, no review gates, no human-in-the-loop.

## Folder Map

```
workspace/
├── AGENT.md                        # Layer 0 — this file
├── CONTEXT.md                      # Layer 1 — linear pipeline overview
├── _config/                        # Layer 3 — domain contracts
│   ├── kartaview-api-contract.md   #   KartaView API endpoints, auth, rate limits
│   ├── google-maps-api-contract.md #   Google Maps/Street View API endpoints, auth, pricing
│   ├── storage-schema.md           #   Evidence file layout and sidecar metadata
│   ├── docker-network-policy.md    #   Allowed egress, no inbound except localhost
│   └── capture-path-rules.md       #   Direct vs render capture path rules
├── stages/                         # Pipeline stage contracts
│   ├── 01_resolve/CONTEXT.md       #   Reverse-geocode coordinates to address
│   ├── 02_discover/CONTEXT.md       #   Discover imagery from KartaView + Google Street View
│   ├── 03_capture/CONTEXT.md       #   Capture image bytes (direct or render)
│   └── 04_store/CONTEXT.md         #   Store evidence with metadata
└── setup/questionnaire.md          # Setup-time configuration questions
```

## Non-negotiables

These rules carry into every stage's implementation:

1. **No autonomous git push, no unconfirmed docker exec, no credential logging.**

2. **Deterministic work never goes through an LLM call.** All stages are deterministic. Geocoding (non-ambiguous), multi-source discovery, image capture, and storage are executed directly. No stage constructs an LLM Agent.

3. **Multi-source merging is additive, not destructive.** Results from KartaView and Google Street View are merged into a single candidate list. Duplicates (same location, similar timestamp) are deduplicated by geohash6 proximity. No source's results are discarded unless they fail validation.
