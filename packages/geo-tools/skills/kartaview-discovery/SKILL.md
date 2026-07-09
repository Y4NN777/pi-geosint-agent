---
name: kartaview-discovery
description: Discover nearby street-level photos from KartaView around a coordinate.
allowed-tools:
  - kartaview-discover
---

# kartaview-discovery

Discover nearby street-level photos from KartaView's photo database for a given location.

## Setup

Requires a KartaView Bearer auth token for authenticated access (1000 req/hr). Without a token, rate is limited to ~100 req/hr.

The token is configured via the workspace settings and stored in `evidence/settings.json`.

## Usage

Call `kartaview-discover` with:

```
{ lat, lon, radiusMeters, authToken }
```

- `kartaview-discover.ts` fetches sequences from KartaView's `/1.0/list/nearby-photos` endpoint
- For each sequence, it fetches photo details from `/1.0/photo`
- Returns an array of photo records with metadata

## Rate Limits

| Auth State | Limit | Behavior |
|------------|-------|----------|
| Unauthenticated | ~100 req/hr | May receive 403 if exceeded |
| Authenticated | ~1000 req/hr | Requires valid Bearer token |

## Staleness & Accuracy Flagging

The function automatically flags records that may be unreliable:

- **Stale**: Photos with `capturedAt` > 2 years old
- **Inaccurate**: Photos with coordinates > 50m from the query point

These flags are informational — the human reviewer decides whether to accept or reject flagged records.

## See Also

Full API contract: `workspace/_config/kartaview-api-contract.md`
