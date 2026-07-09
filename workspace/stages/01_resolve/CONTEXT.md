# Stage 01 — Resolve

## Purpose

Convert raw coordinates `{ lat, lon }` into a human-readable address. If the geocoder returns ambiguous results (multiple plausible addresses close in confidence), dispatch to an LLM agent to resolve.

## Inputs

Accepts the following from Layer 3 configs:

| Input | Source | Description |
|-------|--------|-------------|
| `lat` | User/Run trigger | Latitude |
| `lon` | User/Run trigger | Longitude |
| Geocoder URL | `setup/questionnaire.md` | Nominatim geocoder endpoint (default: `https://nominatim.openstreetmap.org`) |
| Model choice | `setup/questionnaire.md` | Provider/model for the agent path (default: cheap fast model — Haiku-class/DeepSeek-class) |

## Process

1. Validate coordinates are within range (-90 to 90 lat, -180 to 180 lon).
2. Call `reverse-geocode.ts` with `{ lat, lon }`.
3. If the result has no `alternates` (unambiguous):
   - Return the single address directly. No `Agent` constructed.
   - This is the fast path — completes in one HTTP call.
4. If the result has `alternates` populated (ambiguous):
   - Construct an `Agent` with the configured model.
   - Use `assembleSystemPrompt(workspaceRoot, '01_resolve')` for the system prompt.
   - The Agent receives the coordinate + alternates list and decides which address is most likely correct, or to ask the human.
   - Return the resolved (or partially resolved) result.

## Outputs

```json
{
  "address": "string",
  "confidence": "number (0-1)",
  "lat": "number",
  "lon": "number",
  "alternates": [
    {"address": "string", "confidence": "number"}
  ]
}
```

The `alternates` field is only populated when:
- The geocoder returned multiple close-confidence results, AND
- The Agent was not able to definitively resolve them and is deferring to the human.

## Review Gate

No review gate after this stage. The result flows directly to stage 02.
