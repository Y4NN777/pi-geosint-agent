# Stage 04 — Store

## Purpose

Index captured evidence into the file store and SQLite database. Fully deterministic — no LLM calls, no agent loop.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Capture results | Stage 03 output | Array of captured images with metadata |
| Discovery metadata | Stage 02 output | Original discovery metadata for each candidate |
| Storage root | `setup/questionnaire.md` | Base path for evidence storage |

## Process

1. For each successful capture, call `store-evidence.ts`:
   - Compute `geohash7` from the coordinates.
   - Construct the file path: `evidence/{geohash7}/{date}/{source}/{id}.{ext}`.
   - Write the image file to the path.
   - Write the sidecar JSON alongside it with source metadata.
   - Upsert the row into `index.sqlite` (idempotent by SHA256).
2. Return a summary of stored evidence.

## Outputs

```json
{
  "stored": [
    {
      "source": "kartaview" | "google-streetview",
      "id": "string",
      "path": "string",
      "sidecarPath": "string",
      "sha256": "string",
      "geohash7": "string",
      "sizeBytes": "number"
    }
  ],
  "stats": {
    "totalStored": "number",
    "totalBytes": "number"
  }
}
```

## Storage Layout

```
evidence/{geohash7}/{date}/
├── kartaview/
│   ├── {photoId}.jpg
│   └── {photoId}.sidecar.json
└── google-streetview/
    ├── {pano_id}_{heading}.jpg
    └── {pano_id}_{heading}.sidecar.json
```

## Notes

- No `Agent` is constructed. This stage calls `geo-tools` functions directly.
- The source-based directory layout keeps evidence from different providers separate.
