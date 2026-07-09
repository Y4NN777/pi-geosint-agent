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

## Provider/Model Choices

### Stage 01 — Resolve (Agent path, only if ambiguous)

```json
{
  "question": "Which provider/model for stage 01 resolve (cheap-fast model class)?",
  "recommended": "cheap-fast model class (see _config/providers.md for the full list)",
  "default_provider": "see _config/providers.md",
  "default_model": "see _config/providers.md",
  "type": "provider-model"
}
```

### Stage 02 — Discover (Agent path)

```json
{
  "question": "Which provider/model for stage 02 discovery (reasoning model class)?",
  "recommended": "reasoning model class (see _config/providers.md for the full list)",
  "default_provider": "see _config/providers.md",
  "default_model": "see _config/providers.md",
  "type": "provider-model"
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

## Geocoder

```json
{
  "question": "Nominatim geocoder endpoint (use a custom instance for higher rate limits)",
  "default": "https://nominatim.openstreetmap.org",
  "type": "string"
}
```

---

**Note:** API keys for LLM providers are configured through the pi agent framework's credential store, not this questionnaire. See the `_credential-store` documentation for provider key setup.
