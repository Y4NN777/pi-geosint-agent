# Google Maps/Street View API Contract

## Base URLs

```
Street View Metadata: https://maps.googleapis.com/maps/api/streetview/metadata
Street View Static:   https://maps.googleapis.com/maps/api/streetview
```

## Endpoints

### 1. Street View Metadata

```
GET /maps/api/streetview/metadata?location=LAT,LNG&key=API_KEY
```

**Parameters:**
| Parameter  | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `location` | string | yes      | `lat,lon` of the query point         |
| `key`      | string | yes      | Google Cloud API key                 |

**Response:**
```json
{
  "status": "OK" | "ZERO_RESULTS" | "NOT_FOUND",
  "pano_id": "string",
  "lat": number,
  "lng": number,
  "date": "string (YYYY-MM or YYYY)",
  "copyright": "string"
}
```

- `status: "ZERO_RESULTS"` or `"NOT_FOUND"` means no street-level imagery exists at the location.
- `date` may be just `"YYYY"` (year only) or `"YYYY-MM"` (year + month).
- The returned `lat`/`lng` may differ from the query — Google snaps to the nearest panorama.

### 2. Street View Static Image

```
GET /maps/api/streetview?location=LAT,LNG&size=WxH&heading=DEG&pitch=DEG&fov=DEG&key=API_KEY
```

**Parameters:**
| Parameter  | Type   | Required | Default | Description                              |
|------------|--------|----------|---------|------------------------------------------|
| `location` | string | yes      | —       | `lat,lon` of the query point             |
| `size`     | string | yes      | —       | `WxH` in pixels (max 640x640 for free)   |
| `heading`  | number | no       | 0       | Camera heading in degrees (0= north)     |
| `pitch`    | number | no       | 0       | Camera pitch (-90 to 90)                 |
| `fov`      | number | no       | 90      | Horizontal field of view (10-100)        |
| `key`      | string | yes      | —       | Google Cloud API key                     |

**Response:** Raw image bytes (JPEG). Content-Type: `image/jpeg`

- Returns the nearest Street View panorama to the given location.
- If no panorama exists within 50m, returns a 404-level placeholder image.
- Multi-angle capture: query the Static API with different `heading` values (0, 90, 180, 270) to capture a full 360-degree view.

## Auth

**Header format:** API key passed as query parameter `key=API_KEY`, not as a header.

The API key must have the **Street View Static API** enabled in Google Cloud Console. Billing must be enabled for the project (though the first $200/month in usage is free).

**Street View Static API pricing:**
- Standard (non-interactive): ~$7.00 per 1000 requests (varies by region)
- Static images are counted per URL request

## Rate Limits

| Plan              | Limit                      |
|-------------------|----------------------------|
| Free (with billing) | $200/month free credit   |
| Paid              | Pay-as-you-go after credit |

There are no hard per-second rate limits for standard usage, but sustained high throughput may trigger Google's automated rate limiting.

## Coordinate Handling

- Google Street View returns the **nearest** panorama to the query coordinates.
- The returned `lat`/`lng` from metadata may differ from the query — this is the actual panorama location.
- Unlike KartaView, there is no "list nearby" endpoint. You query a coordinate and get the single nearest panorama (or nothing).
- Use the metadata API first to check availability before calling the static API.
