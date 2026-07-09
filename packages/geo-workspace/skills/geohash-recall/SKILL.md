---
name: geohash-recall
description: Query prior capture history near a geohash before a fresh discovery run.
allowed-tools:
  - check-geohash-history
---

# geohash-recall

Query `index.sqlite` for prior evidence captures near a given geohash, so the agent can avoid re-discovering areas already covered.

## Usage

Call `check-geohash-history` with a geohash prefix to find prior captures:

```
check-geohash-history(geohashPrefix, limit?)
```

The function queries `index.sqlite` in the configured storage root and returns matching evidence records.

## When to Call

Before starting stage 02 (discovery) for a coordinate, call this to check if the area was already captured previously. This avoids redundant API calls to KartaView for areas already in the evidence store.

## Precision

Geohash7 provides approximately 150m × 150m grid cells at the equator. Prefix queries (e.g., `LIKE 'gcpvj%'`) enable variable-precision spatial lookups.

## Interpreting Results

- Records found → the area has prior captures; the agent may skip re-discovery or only look for new photos
- No records found → proceed with fresh discovery

## See Also

Full storage schema: `workspace/_config/storage-schema.md`
