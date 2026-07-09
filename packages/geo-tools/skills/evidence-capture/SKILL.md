---
name: evidence-capture
description: Capture image evidence from KartaView and Google Street View — direct download or headless browser render.
allowed-tools:
  - capture-direct
  - capture-render
---

# evidence-capture

Capture image evidence from candidate records. Two paths: direct download (default) or headless render (fallback). Supports both KartaView photo URLs and Google Street View Static API URLs.

## Default Path: Direct Download

All candidates default to `needs_render: false`. The `capture-direct` function downloads image bytes from the photo or static API URL:

```
candidate.url → HTTP GET → bytes → sha256 → store
```

For Google Street View, the URL is a Static API endpoint with heading, pitch, fov, and size parameters baked in by `street-view-discover`.

## Render Path: Headless Browser

Candidates flagged `needs_render: true` use `xvfb-run cutycapt` for headless rendering:

```
candidate.url → xvfb-run cutycapt --url=... --out=... → png bytes → sha256 → store
```

The render path is used when:
1. The candidate URL is a viewer page (not a direct image URL)
2. Direct download returned a non-image response in a prior attempt

## Source-Specific Notes

| Source | URL Pattern | Capture Method |
|--------|-------------|----------------|
| KartaView | `https://kartaview.org/...` (photo detail page) | render (viewer page)
| KartaView | Direct image URL from `photo.url` | direct download
| Google Street View | `https://maps.googleapis.com/maps/api/streetview?...` | direct download (Static API returns raw image)

## Timeouts

| Path | Timeout | On Timeout |
|------|---------|------------|
| Direct download | 30s per photo | Return typed error, no retry |
| Render (CutyCapt) | 120s per URL | Kill subprocess, return typed error |

## Error Handling

Single capture failure does not abort the batch. Failed captures are recorded as `status: failed` in the result set with the error reason. The pipeline continues with remaining candidates.

## See Also

Full capture path rules: `workspace/_config/capture-path-rules.md`
Google Street View discovery: `packages/geo-tools/skills/street-view-discovery/SKILL.md`
