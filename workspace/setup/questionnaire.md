# Setup Questionnaire

Answer these questions before the first run. Answers configure the pipeline at runtime.

## Default Search Radius

```json
{
  "question": "What is the default search radius for KartaView discovery (in meters)?",
  "default": 100,
  "type": "number"
}
```

## Storage Root

```json
{
  "question": "Where should evidence files be stored (absolute path)?",
  "default": "./evidence",
  "type": "string"
}
```

## KartaView Auth Token

```json
{
  "question": "Enter your KartaView Bearer auth token (leave empty for unauthenticated, 100/hr limit)",
  "type": "secret",
  "required": false
}
```

## Google Maps API Key

```json
{
  "question": "Enter your Google Maps API key (required for Street View; enable Street View Static API in Google Cloud Console)",
  "type": "secret",
  "required": true
}
```

## Geocoder

```json
{
  "question": "Nominatim geocoder endpoint (use a custom instance for higher rate limits)",
  "default": "https://nominatim.openstreetmap.org",
  "type": "string"
}
```

---

> **Note:** API keys for LLM providers are configured through the pi agent framework's credential store, not this questionnaire. This questionnaire covers only the geo-OSINT-specific configuration.
