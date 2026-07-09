# Stage 03 — Capture

## Purpose

Download or render each approved candidate photo. This stage is fully deterministic — no LLM calls, no agent loop.

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| Approved candidates | Review gate from stage 02 | `candidate_sequences.json` (human-approved) |

## Process

1. Iterate over approved candidates.
2. For each candidate:
   - If `needsRender: false` → call `capture-direct.ts(photoRecord)`.
     - Downloads image bytes from the URL.
     - Returns `{ path, sha256, bytes }`.
   - If `needsRender: true` → call `capture-render.ts({ url })`.
     - Shells out to `xvfb-run cutycapt --url=... --out=...`.
     - Returns `{ path, sha256 }`.
   - On failure (404, timeout, subprocess error):
     - Record the error in the result set.
     - Continue to the next candidate. A single failure does not abort the stage.
3. Collect all results into a `CaptureResult`.

## Outputs

```json
{
  "captures": [
    {
      "photoId": "number",
      "sequenceId": "number",
      "path": "string",
      "sha256": "string",
      "sizeBytes": "number",
      "captureMethod": "direct | render",
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
- The import boundary rule: `capture-direct.ts` and `capture-render.ts` must not import from `@earendil-works/pi-agent-core`.
- A hard timeout applies per capture (30s direct, 120s render).
