# Stage 04 — Store

## Purpose

Index captured evidence into the file store and SQLite database. This stage is fully deterministic — no LLM calls, no agent loop.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Capture results | Stage 03 output | Array of captured images with metadata |
| Discovery metadata | Stage 02 output | Original discovery metadata for each photo |
| Storage root | `setup/questionnaire.md` | Base path for evidence storage |

## Process

1. For each successful capture, call `store-evidence.ts`:
   - Compute `geohash7` from the coordinates.
   - Construct the file path: `evidence/{geohash7}/{date}/{source}/{photoId}.{ext}`.
   - Write the image file to the path.
   - Write the sidecar JSON alongside it.
   - Upsert the row into `index.sqlite` (idempotent by SHA256).
2. If any human overrides were recorded during the review gate:
   - Log them to `corrections.sqlite`.
3. Return a summary of stored evidence.

## Outputs

```json
{
  "stored": [
    {
      "photoId": "number",
      "path": "string",
      "sidecarPath": "string",
      "sha256": "string",
      "geohash7": "string",
      "sizeBytes": "number"
    }
  ],
  "stats": {
    "totalStored": "number",
    "totalBytes": "number",
    "correctionsLogged": "number"
  }
}
```

## Notes

- No `Agent` is constructed. This stage calls `geo-tools` functions directly.
- The import boundary rule: `store-evidence.ts` must not import from `@earendil-works/pi-agent-core`.
- Idempotent: storing the same SHA256 twice does not duplicate the file or database row.
