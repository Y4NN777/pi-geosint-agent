---
name: parse-coordinates
description: Normalise coordinate input strings into structured lat/lon values.
allowed-tools:
  - parse-coordinates
---

# parse-coordinates

Normalise coordinate input before the pipeline starts. Accepts multiple formats and rejects ambiguous input. Deterministic — no LLM.

## Supported Formats

| Format | Example | Notes |
|--------|---------|-------|
| Decimal Degrees (DD) | `48.8566, 2.3522` | Comma, space, or slash separator |
| DMS | `48°51'24"N 2°17'40"E` | Degree/minute/second markers |
| DDM | `48 51.4' N 2°17.7' E` | Degrees decimal minutes |
| Google Maps URL | `https://maps.google.com/?q=48.8566,2.3522` or `@48.8566,2.3522,15z` | Both `?q=` and `@` syntax |
| Plus Code | `8FW4V75V+` | Detected but requires `open-location-code` package |


## Ambiguity Guard

Bare `48.85, 2.29` is treated as (lat, lon). If the first value exceeds ±90 (indicating GeoJSON lon,lat order), the parser rejects the pair rather than guessing which value is latitude. This prevents a confidently wrong location.

## Output

```json
{ "ok": true, "lat": 48.8566, "lon": 2.3522 }
```

On failure:
```json
{ "ok": false, "error": "First value 151.2 is outside latitude range [-90, 90]..." }
```

## See Also

Stage 02 context: `workspace/stages/02_discover/CONTEXT.md`
