---
name: street-view-discovery
description: Discover Google Street View imagery at a coordinate with 4-heading coverage.
allowed-tools:
  - street-view-discover
---

# street-view-discovery

Discover Google Street View imagery for a given location. Mirrors `kartaview-discovery` shape — checks panorama availability via the Metadata API, then builds capture URLs for 4 headings (0, 90, 180, 270).

## Setup

Requires a Google Maps API key with the Street View Static API enabled in Google Cloud Console. Billing required beyond the $200/mo free credit.

The key is configured via workspace settings in `evidence/settings.json` as `googleMapsApiKey`.

## Usage

Call `street-view-discover` with:

```
{ lat, lon, apiKey }
```

1. **Metadata API** — `GET /streetview/metadata?location=lat,lon&key=...` checks if panorama exists
2. **Static API URLs** — if panorama exists, builds 4 URLs at headings 0, 90, 180, 270 with `size=640x640`, `pitch=0`, `fov=90`
3. Returns up to 4 candidates, each with its own `headingBucket` and the shared `pano_id` as `sequenceId`

## Output Shape

```json
{
  "candidates": [
    {
      "source": "google-streetview",
      "heading": 0,
      "headingBucket": "N",
      "sequenceId": "abc123",
      "url": "https://maps.googleapis.com/maps/api/streetview?location=...&heading=0&..."
    }
  ],
  "coverage": {
    "distinctHeadings": 4,
    "bucketsPresent": ["N", "E", "S", "W"],
    "bucketsMissing": ["NE", "SE", "SW", "NW"],
    "angleSpread": 270
  }
}
```

## Limitations

- Returns at most 1 panorama per coordinate (the nearest one)
- Coverage is always 4 headings from the same panorama — not true 360-degree capture
- Imagery update frequency is opaque and much lower than KartaView
- Static API images require "Google" attribution when displayed

## See Also

API contract: `workspace/_config/google-maps-api-contract.md`
KartaView discovery: `packages/geo-tools/skills/kartaview-discovery/SKILL.md`
Coverage model: `packages/geo-tools/skills/heading-coverage/SKILL.md`
