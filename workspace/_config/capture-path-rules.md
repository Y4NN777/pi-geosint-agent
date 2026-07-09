# Capture Path Rules

## Direct Download (Default)

All candidates use direct HTTP download via `capture-direct.ts`:

### KartaView
```
candidate.url → HTTP GET → bytes → sha256 → store
```

### Google Street View
```
https://maps.googleapis.com/maps/api/streetview?location=...&heading=N&key=... → HTTP GET → bytes → sha256 → store
```

Google Street View captures 4 headings per location (0, 90, 180, 270), producing 4 separate image files.

## Render Path: Headless Browser

The render path (`capture-render.ts` using `xvfb-run cutycapt`) is available for KartaView URLs that require browser rendering. It is no longer the default — use only when direct download fails with a non-image response.

```
candidate.url → xvfb-run cutycapt --url=... --out=... → png bytes → sha256 → store
```

## Timeout Rules

| Path | Timeout | Behavior on Timeout |
|------|---------|---------------------|
| Direct download | 30 seconds per URL | Return typed error, do not retry |
| Render (CutyCapt) | 120 seconds per URL | Kill subprocess, return typed error |

## Error Handling

If a candidate fails, it is recorded as `status: failed` in `index.sqlite` with the error reason. The pipeline continues with remaining candidates — a single failed capture does not abort stage 03.
