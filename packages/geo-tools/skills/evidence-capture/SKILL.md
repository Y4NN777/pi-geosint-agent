---
name: evidence-capture
description: Capture image evidence from KartaView — direct download or headless browser render.
allowed-tools:
  - capture-direct
  - capture-render
---

# evidence-capture

Capture image evidence from approved candidate sequences. Two paths: direct download (default) or headless render (fallback).

## Default Path: Direct Download

All candidates default to `needs_render: false`. The `capture-direct` function downloads image bytes from the KartaView photo URL:

```
candidate.photoUrl → HTTP GET → bytes → sha256 → store
```

## Render Path: Headless Browser

Candidates flagged `needs_render: true` use `xvfb-run cutycapt` for headless rendering:

```
candidate.url → xvfb-run cutycapt --url=... --out=... → png bytes → sha256 → store
```

The render path is used when:
1. The KartaView photo URL is a viewer page (not a direct image URL)
2. Direct download returned a non-image response in a prior attempt
3. The human reviewer manually set `needs_render: true`

## Timeouts

| Path | Timeout | On Timeout |
|------|---------|------------|
| Direct download | 30s per photo | Return typed error, no retry |
| Render (CutyCapt) | 120s per URL | Kill subprocess, return typed error |

## Error Handling

Single capture failure does not abort the batch. Failed captures are recorded as `status: failed` in the result set with the error reason. The pipeline continues with remaining candidates.

## See Also

Full capture path rules: `workspace/_config/capture-path-rules.md`
