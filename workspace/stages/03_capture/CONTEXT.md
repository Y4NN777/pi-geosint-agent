# Stage 03 — Capture

## Purpose

Download images from all approved candidates. Fully deterministic — no LLM calls, no agent loop.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Candidates | Stage 02 output | `candidates.json` |

## Process

1. Iterate over candidates from stage 02.
2. For each candidate:
   - **KartaView** (`source: "kartaview"`):
     - Call `capture-direct.ts(id, url)` — downloads image bytes from the KartaView photo URL.
     - Returns `{ path, sha256, bytes }`.
   - **Google Street View** (`source: "google-streetview"`):
     - Call `capture-direct.ts(id, url)` for each heading URL (4 angles: 0, 90, 180, 270).
     - Returns one result per heading.
   - On failure (404, timeout, API error):
     - Record the error in the result set.
     - Continue to the next candidate. Single failure does not abort the stage.
3. Collect all results into a `CaptureResult`.

## Outputs

```json
{
  "captures": [
    {
      "source": "kartaview" | "google-streetview",
      "id": "string",
      "path": "string",
      "sha256": "string",
      "sizeBytes": "number",
      "captureMethod": "direct",
      "status": "success | failed",
      "error": "string | null"
    }
  ],
  "stats": {
    "total": "number",
    "succeeded": "number",
    "failed": "number",
    "totalBytes": "number"
  }
}
```

## Notes

- No `Agent` is constructed. This stage calls `geo-tools` functions directly.
- Google Street View Static API calls are plain HTTP GET requests — same `capture-direct.ts` path.
- A hard timeout applies per capture (30s direct).
