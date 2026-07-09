# Geo-OSINT Agent — Layer 1: Linear Pipeline Context

## Pipeline

The pipeline runs four stages linearly — no branching, no review gates, no LLM agents:

```
01_resolve → 02_discover (KartaView + Google Street View) → 03_capture → 04_store
```

### 01_resolve — Reverse Geocode
- **Input:** `{ lat: number, lon: number }`
- **Process:** Calls Nominatim (or configured geocoder). If ambiguous, uses deterministic tie-breaking by confidence score.
- **Output:** `{ address: string, confidence: number, lat: number, lon: number }`

### 02_discover — Multi-Source Discovery
- **Input:** Resolved location + API keys
- **Process:** Queries **both** sources in parallel:
  - **KartaView:** `/1.0/list/nearby-photos` → `/1.0/photo` per sequence. Flags stale (>2yr) or distant (>50m) records.
  - **Google Street View:** Metadata API first (check availability), then builds capture URLs.
  - Merges results into a single candidate list, deduplicated by geohash6 proximity.
- **Output:** `candidates.json` — unified list of photo records from both sources.
- **No LLM agent.** All flagging and deduplication is deterministic.
- **No review gate.** Pipeline continues immediately to stage 03.

### 03_capture — Image Capture
- **Input:** Candidate records from stage 02
- **Process:** No `Agent` constructed. For each candidate:
  - **KartaView records:** Direct download from photo URL (`capture-direct.ts`).
  - **Google Street View:** Static API download for headings [0, 90, 180, 270] (`google-streetview.ts` → `capture-direct.ts`).
- **Output:** Captured image files with SHA256 hashes.

### 04_store — Evidence Storage
- **Input:** Captured images + discovery metadata
- **Process:** Computes geohash7, writes files to `evidence/{geohash}/{date}/{source}/`, writes sidecar JSON, upserts row into `index.sqlite`.
- **Output:** Indexed evidence in `evidence/` directory + `index.sqlite`.

## Where Evidence Lands

```
evidence/
└── {geohash7}/
    └── {YYYY-MM-DD}/
        ├── kartaview/
        │   ├── {photoId}.jpg
        │   └── {photoId}.sidecar.json
        └── google-streetview/
            ├── {pano_id}_{heading}.jpg
            └── {pano_id}_{heading}.sidecar.json
```

## Source Types

| Source               | Type key              | Description                              |
|----------------------|-----------------------|------------------------------------------|
| KartaView            | `kartaview`           | Crowd-sourced street-level photos        |
| Google Street View   | `google-streetview`   | Google's street-level panoramas          |

## Configuration

| Setting               | Config source                      |
|-----------------------|-------------------------------------|
| Search radius         | `setup/questionnaire.md`            |
| KartaView auth token  | `setup/questionnaire.md`            |
| Google Maps API key   | `setup/questionnaire.md`            |
| Storage root          | `setup/questionnaire.md`            |
| Geocoder endpoint     | `setup/questionnaire.md`            |
