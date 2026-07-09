# Stage 01 — Resolve

## Purpose

Convert raw coordinates `{ lat, lon }` into a human-readable address. Deterministic — no LLM agent.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `lat` | User/Run trigger | Latitude |
| `lon` | User/Run trigger | Longitude |
| Geocoder URL | `setup/questionnaire.md` | Nominatim geocoder endpoint (default: `https://nominatim.openstreetmap.org`) |

## Process

1. Validate coordinates are within range (-90 to 90 lat, -180 to 180 lon).
2. Call `reverse-geocode.ts` with `{ lat, lon }`.
3. If the result has no `alternates` (unambiguous):
   - Return the single address directly.
4. If the result has `alternates` populated (ambiguous):
   - Pick the highest-confidence result.
   - If equal confidence, pick the first result.
   - Return the resolved address.

## Outputs

```json
{
  "address": "string",
  "confidence": "number (0-1)",
  "lat": "number",
  "lon": "number"
}
```

## Notes

- No review gate after this stage. The result flows directly to stage 02.
- No Agent is constructed — deterministic geocoding only.
