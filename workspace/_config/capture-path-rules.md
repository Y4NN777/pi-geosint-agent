# Capture Path Rules

## Default Path: Direct Download

All candidates default to `needs_render: false`. The `capture-direct.ts` function downloads the image bytes from the URL returned by the KartaView `/1.0/photo` endpoint.

```
candidate.photoUrl → HTTP GET → bytes → sha256 → store
```

## Render Path: Headless Browser

Only candidates explicitly flagged `needs_render: true` use the render path. This flag is set by stage 02's `Agent` when:

1. The KartaView photo URL is a viewer page URL (not a direct image URL).
2. The direct download returned a non-image response (e.g., HTML error page) in a prior failed attempt.
3. The human reviewer manually set `needs_render: true` during the review gate.

The render path uses `xvfb-run cutycapt` (or EyeWitness for batched sequences):

```
candidate.url → xvfb-run cutycapt --url=... --out=... → png bytes → sha256 → store
```

## Timeout Rules

Both paths enforce a hard timeout:

| Path | Timeout | Behavior on Timeout |
|------|---------|---------------------|
| Direct download | 30 seconds per photo | Return typed error, do not retry |
| Render (CutyCapt) | 120 seconds per URL | Kill subprocess, return typed error |

## Error Handling

If a candidate fails both paths (direct fails → human sets `needs_render` → render also fails), the candidate is recorded as `status: failed` in `index.sqlite` with the error reason. The pipeline continues with remaining candidates — a single failed photo does not abort the entire stage 03 run.
