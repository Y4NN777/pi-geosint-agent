# Stage 02 — Multi-Source Discovery

## Purpose

Query **KartaView** and **Google Street View** in parallel for street-level imagery around the resolved location. Merge results into a single candidate list. No LLM agent — all logic is deterministic.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Resolved location | Stage 01 output | `{ address, lat, lon, confidence }` |
| Search radius | `setup/questionnaire.md` | Default search radius in meters (default: 100) |
| KartaView auth token | `setup/questionnaire.md` | Bearer token for authenticated API access (optional) |
| Google Maps API key | `setup/questionnaire.md` | Required for Street View Static API |

## Process

1. **Parallel source queries** (both run simultaneously):
   - **KartaView:** Call `kartaview-discover.ts` → `GET /1.0/list/nearby-photos` → `GET /1.0/photo` per sequence. Flags stale (>2yr) or distant (>50m) records.
   - **Google Street View:** Call `google-streetview.ts` → `GET /streetview/metadata` (check availability). If OK, build Static API URLs for headings [0, 90, 180, 270].

2. **Merge:** Combine both source results into a single `candidates[]` array. Deduplicate by geohash6 proximity (records within ~60m of each other and within 1 year timestamp are deduplicated, keeping the higher-quality source).

3. **Output** `candidates.json` without blocking.

## Pre-Discovery: Coordinate Parsing

Coordinate inputs accepted by `parse-coordinates.ts` (deterministic, no LLM):

| Format | Example | Notes |
|--------|---------|-------|
| Decimal Degrees | `48.8566, 2.3522` | Standard lat,lon order |
| DMS | `48°51'24"N 2°17'40"E` | Single/double quote markers |
| DDM | `48 51.4' N 2°17.7' E` | Degrees decimal minutes |
| Google Maps URL | `https://maps.google.com/?q=48.8566,2.3522` or `@48.8566,2.3522` | Shortened URLs supported |
| Plus Code | `8FW4V75V+` | Stub — requires `open-location-code` package |

**Ambiguity guard:** A bare `48.85, 2.29` is treated as (lat, lon). If the first value exceeds ±90 (e.g., lon,lat order), the parser rejects the pair rather than guessing.

## Outputs

```json
{
  "queryPoint": {"lat": "number", "lon": "number"},
  "radiusMeters": "number",
  "candidates": [
    {
      "source": "kartaview" | "google-streetview",
      "id": "string",
      "lat": "number",
      "lon": "number",
      "heading": "number",
      "capturedAt": "string | null",
      "url": "string",
      "sequenceId": "string",
      "flagged": "boolean",
      "flagReason": "string | null",
      "headingBucket": "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"
    }
  ],
  "coverage": {
    "distinctHeadings": "number — how many unique 8-compass buckets have imagery",
    "bucketsPresent": ["array of heading buckets with coverage"],
    "bucketsMissing": ["array of heading buckets without coverage"],
    "angleSpread": "number — degrees between min and max heading"
  },
  "stats": {
    "totalDiscovered": "number",
    "flagged": "number",
    "kartaviewCount": "number",
    "googleStreetviewCount": "number"
  }
}
```

## AgentTool Available

- `check-geohash-history` — queries `index.sqlite` for prior captures near this area to avoid re-discovery (optional).

## Notes

- No Agent is constructed. Stage 02 calls `geo-tools` functions directly.
- Google Street View returns at most 1 result per coordinate (nearest panorama). KartaView returns many.
- Google Street View captures 4 headings (0, 90, 180, 270). KartaView photos have a single heading each.
