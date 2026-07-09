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
  "question": "Which provider/model for stage 01 resolve (cheap fast model)?",
  "recommended": "deepseek/deepseek-chat or anthropic/claude-haiku-3-5",
  "default_provider": "deepseek",
  "default_model": "deepseek-chat",
  "type": "provider-model"
}
```

### Stage 02 — Discover (Agent path)

```json
{
  "question": "Which provider/model for stage 02 discovery (stronger reasoning model)?",
  "recommended": "anthropic/claude-sonnet-4-5",
  "default_provider": "anthropic",
  "default_model": "claude-sonnet-4-5",
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
