# Stage 02 — Discover

## Purpose

Query KartaView for nearby street-level photos around the resolved location. Flag stale or low-accuracy records. Use an LLM agent to prune the candidate list intelligently before presenting to the human for review.

## Inputs

Accepts the following from Layer 3 configs:

| Input | Source | Description |
|-------|--------|-------------|
| Resolved location | Stage 01 output | `{ address, lat, lon, confidence }` |
| Search radius | `setup/questionnaire.md` | Default search radius in meters (default: 100) |
| KartaView auth token | `setup/questionnaire.md` | Bearer token for authenticated API access |
| Model choice | `setup/questionnaire.md` | Provider/model for the agent (default: stronger reasoning model — Sonnet-class) |
| Agent tool | Implemented in Phase 2 | `check-geohash-history` — queries `index.sqlite` for prior captures |

## Process

1. Call `kartaview-discover.ts` with `{ lat, lon, radiusMeters, authToken }`.
   - Fetches sequences from `/1.0/list/nearby-photos`.
   - For each sequence, fetches details from `/1.0/photo`.
   - Flags records that are >2 years old or >50m from query point.
2. Construct an `Agent` with the configured model and `check-geohash-history` as an `AgentTool`.
3. The Agent receives the flagged record list and:
   - Reviews flagged records, noting which flags are actionable vs. informational.
   - Checks `check-geohash-history` to see if any area has been previously captured.
   - Produces a pruned and annotated `candidate_sequences.json`.
4. **Pipeline stops.** The human must review and approve via the review gate before stage 03.

## Outputs

```json
{
  "queryPoint": {"lat": "number", "lon": "number"},
  "radiusMeters": "number",
  "candidates": [
    {
      "sequenceId": "number",
      "photoId": "number",
      "lat": "number",
      "lon": "number",
      "heading": "number",
      "capturedAt": "string (ISO 8601)",
      "url": "string",
      "flagged": "boolean",
      "flagReason": "string | null",
      "needsRender": "boolean",
      "agentAnnotation": "string | null"
    }
  ],
  "stats": {
    "totalDiscovered": "number",
    "flagged": "number",
    "previouslyCaptured": "number",
    "recommendedForCapture": "number"
  }
}
```

## Review Gate (blocking)

The pipeline blocks here until the human:
- Reviews each candidate's flag status and agent annotation.
- May edit, reject, or accept individual candidates.
- May toggle `needsRender` on individual candidates.
- Submits the decision via `POST /runs/:id/review`.

Until the review is submitted, stage 03 will not execute.
