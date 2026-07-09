# Geo-OSINT Agent — Layer 1: Pipeline Context

## Stage Order

The pipeline runs four stages sequentially:

```
01_resolve  →  02_discover  →  [REVIEW GATE]  →  03_capture  →  04_store
```

### 01_resolve — Reverse Geocode
- **Input:** `{ lat: number, lon: number }`
- **Process:** Calls Nominatim (or configured geocoder). If the geocoder returns multiple possible addresses within the ambiguity threshold, constructs an `Agent` with a cheap fast model (Haiku-class/DeepSeek-class) to resolve.
- **Output:** `{ address: string, confidence: number, alternates?: Array<{address, confidence}> }`

### 02_discover — KartaView Discovery
- **Input:** Resolved location
- **Process:** Calls KartaView `/1.0/list/nearby-photos` endpoint. For each sequence, fetches photo metadata. Flags stale (>2 years old) or inconsistent (>50m from query point) records. Constructs an `Agent` with a stronger reasoning model to prune flagged records and produce a `candidate_sequences.json`.
- **Output:** `candidate_sequences.json` — pruned and annotated list of photo records.
- **AgentTool available:** `check-geohash-history` — queries `index.sqlite` for prior captures near this area to avoid re-discovery.

### REVIEW GATE (blocking)
- Pipeline stops after stage 02.
- Human must review `candidate_sequences.json` via the web UI.
- Human may approve, reject, or edit the candidate list.
- Stage 03 does **not** run until the human explicitly approves.

### 03_capture — Image Capture
- **Input:** Approved candidate sequences
- **Process:** No `Agent` constructed. Plain loop. For each candidate:
  - If `needs_render: false` → `capture-direct.ts` (direct download from KartaView URL)
  - If `needs_render: true` → `capture-render.ts` (headless CutyCapt via xvfb)
- **Output:** Captured image files with SHA256 hashes.

### 04_store — Evidence Storage
- **Input:** Captured images + discovery metadata
- **Process:** No `Agent` constructed. Computes geohash7, writes files to `evidence/{geohash}/{date}/{source}/`, writes sidecar JSON, upserts row into `index.sqlite`. Also logs any human overrides to `corrections.sqlite`.
- **Output:** Indexed evidence in `evidence/` directory + `index.sqlite`.

## Where Evidence Lands

All evidence is written to `evidence/` at the configured storage root:
```
evidence/
└── {geohash7}/
    └── {YYYY-MM-DD}/
        └── {source}/
            ├── {photoId}.jpg
            └── {photoId}.sidecar.json
```

## Provider/Model Requirements

| Stage | Provider | Model Class | Why |
|-------|----------|-------------|-----|
| 01_resolve (Agent path only) | Anthropic/DeepSeek | Haiku-class or DeepSeek-chat | Cheap fast model for simple disambiguation |
| 02_discover (Agent) | Anthropic | Sonnet-class or equivalent | Stronger reasoning needed for flag/prune decisions |
| 03_capture | None | N/A | Deterministic — no LLM |
| 04_store | None | N/A | Deterministic — no LLM |
