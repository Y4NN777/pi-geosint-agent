# Geo-Imagery Source Credentials

Canonical reference for geo-imagery data source credentials. These are **not** LLM provider credentials — they authenticate to image-hosting services and are configured separately from `providers.md`.

| Service | Env Var | Notes |
|---|---|---|
| KartaView | `KARTAVIEW_AUTH_TOKEN` | OSM OAuth; 100/hr unauth, 1000/hr authed |
| Google Maps/Street View | `GOOGLE_MAPS_API_KEY` | Enable Street View Static API in Google Cloud Console; billing required beyond $200/mo free credit |
| Mapillary | `MAPILLARY_ACCESS_TOKEN` | (future) Integrate via Mapillary API v4 |

## Source-specific docs

- **KartaView:** `_config/kartaview-api-contract.md`
- **Google Maps/Street View:** `_config/google-maps-api-contract.md`

## Which source to use

| Coverage need | Preferred source | Reason |
|---|---|---|
| Max street-level photo density | KartaView | Crowd-sourced, many photos per location |
| Max angle completeness | Google Street View | Explicit heading parameter — 4-angle capture |
| Freshness | KartaView (check date) | Google SV updates are infrequent and opaque |
| Attribution requirements | Both (check per contract) | KartaView CC-BY-SA, Google ToS |

## Attribution

- **KartaView:** All uses must credit "KartaView" and link to `https://kartaview.org`. Photos are CC-BY-SA.
- **Google Street View:** Static API images must include "Google" attribution on or adjacent to the image when displayed. See Google Maps Platform ToS for details.
