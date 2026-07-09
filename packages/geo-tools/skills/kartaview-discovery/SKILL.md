---
name: kartaview-discovery
description: Discover nearby street-level photos from KartaView around a coordinate with heading coverage.
allowed-tools:
  - kartaview-discover
---

# kartaview-discovery

Discover nearby street-level photos from KartaView's photo database for a given location. Returns candidates with 8-compass heading bucket coverage.

## Setup

Requires a KartaView Bearer auth token for authenticated access (1000 req/hr). Without a token, rate is limited to ~100 req/hr.

The token is configured via the workspace settings and stored in `evidence/settings.json`.

## Usage

Call `kartaview-discover` with:

```
{ lat, lon, radiusMeters, kartaviewAuthToken }
```

- Fetches sequences from KartaView's `/1.0/list/nearby-photos` endpoint
- For each sequence, fetches photo details from `/1.0/photo`
- Assigns each record a `headingBucket` (N/NE/E/SE/S/SW/W/NW)
- Returns coverage info: distinct heading count, present buckets, missing buckets, angle spread

## Rate Limits

| Auth State | Limit | Behavior |
|------------|-------|----------|
| Unauthenticated | ~100 req/hr | May receive 403 if exceeded |
| Authenticated | ~1000 req/hr | Requires valid Bearer token |

## Staleness & Accuracy Flagging

The function automatically flags records that may be unreliable:

- **Stale**: Photos with `capturedAt` > 2 years old
- **Inaccurate**: Photos with coordinates > 50m from the query point

## Output Shape

```json
{
  "queryPoint": { "lat": 48.8566, "lon": 2.3522 },
  "radiusMeters": 100,
  "candidates": [
    {
      "source": "kartaview",
      "heading": 45,
      "headingBucket": "NE",
      "flagged": false,
      ...
    }
  ],
  "coverage": {
    "distinctHeadings": 3,
    "bucketsPresent": ["N", "NE", "E"],
    "bucketsMissing": ["SE", "S", "SW", "W", "NW"],
    "angleSpread": 90
  }
}
```

## See Also

Full API contract: `workspace/_config/kartaview-api-contract.md`
Coverage model: `packages/geo-tools/skills/heading-coverage/SKILL.md`
