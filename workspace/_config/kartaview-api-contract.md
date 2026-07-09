# KartaView API Contract

## Base URL

```
https://kartaview.org
```

## Endpoints

### 1. List Nearby Photos

```
GET /1.0/list/nearby-photos
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lat` | number | yes | Latitude of center point |
| `lng` | number | yes | Longitude of center point |
| `radius` | number | no | Search radius in meters (default: 100) |

**Response:**
```json
{
  "sequences": [
    {
      "id": number,
      "username": string,
      "coordinateHeading": number,
      "photoId": number,
      "capturedAt": string (ISO 8601),
      "lat": number,
      "lon": number,
      "heading": number
    }
  ]
}
```

### 2. Photo Details

```
GET /1.0/photo
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sequenceId` | number | yes | Sequence ID from nearby-photos response |

**Response:**
```json
{
  "id": number,
  "sequenceId": number,
  "capturedAt": string (ISO 8601),
  "lat": number,
  "lon": number,
  "heading": number,
  "url": string
}
```

The `url` field in the response points to the full-resolution image for direct download.

## Auth

**Header format:** `Authorization: Bearer {token}`

KartaView uses OSM OAuth under the hood. The token is obtained by registering an OSM OAuth application and following the KartaView upload-scripts auth flow.

## Rate Limits

| Auth State | Limit | Notes |
|------------|-------|-------|
| Unauthenticated | ~100 requests/hour | May result in 403 errors if exceeded |
| Authenticated | ~1000 requests/hour | Requires valid Bearer token |

The rate limit tracker in `kartaview-discover.ts` should default to 100/hr when no token is provided and 1000/hr when a token is present.

## Metadata Accuracy Caveat

**KartaView timestamps and coordinates must not be treated as ground truth.**

- `capturedAt` depends on the uploader's device clock and may be inaccurate.
- `lat`/`lon` are GPS-reported at capture time with typical consumer GPS accuracy (±5–15m under good conditions, potentially much worse in urban canyons).
- Photos returned within a sequence may show coordinates that are >50m from the query point, especially for long drive sequences.

These caveats are why stage 02 flags records where `capturedAt` is >2 years old or where coordinates are >~50m from the query point. The flag alerts the human reviewer; it does not automatically reject.

## TODO: Verify

- [ ] The exact auth flow (OSM OAuth → KartaView token) needs empirical confirmation.
- [ ] Whether all photo URLs are directly downloadable vs. some requiring the viewer page.
- [ ] Rate limit thresholds (100/1000) need empirical confirmation — these are based on community documentation.
