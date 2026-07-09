---
name: heading-coverage
description: Evaluate directional coverage of street-level imagery using 8-compass heading buckets.
allowed-tools:
  - heading-utils
---

# heading-coverage

Assess how well a set of photos covers all directions around a location. Used by both `kartaview-discovery` and `street-view-discovery` to report coverage completeness.

## Heading Buckets

| Bucket | Heading Range |
|--------|--------------|
| N  | 337.5° – 22.5° |
| NE | 22.5° – 67.5° |
| E  | 67.5° – 112.5° |
| SE | 112.5° – 157.5° |
| S  | 157.5° – 202.5° |
| SW | 202.5° – 247.5° |
| W  | 247.5° – 292.5° |
| NW | 292.5° – 337.5° |

## Coverage Info

Both discovery modules return a `coverage` object:

```json
{
  "distinctHeadings": 4,
  "bucketsPresent": ["N", "E", "S", "W"],
  "bucketsMissing": ["NE", "SE", "SW", "NW"],
  "angleSpread": 270
}
```

| Field | Description |
|-------|-------------|
| `distinctHeadings` | How many unique buckets have at least one photo |
| `bucketsPresent` | Which buckets are covered |
| `bucketsMissing` | Which buckets have no imagery |
| `angleSpread` | Degrees between min and max heading value |

## Interpretation

- **8/8 buckets present** — full 360-degree coverage. All directions visible.
- **4/8 with 270° spread** — typical for Google Street View (N/E/S/W from 4 orthogonal headings). Missing the intercardinal views.
- **1-2/8 with narrow spread** — very limited coverage. Only one or two angles available.
- **0/8** — no imagery found at this location.

## See Also

KartaView discovery: `packages/geo-tools/skills/kartaview-discovery/SKILL.md`
Street View discovery: `packages/geo-tools/skills/street-view-discovery/SKILL.md`
