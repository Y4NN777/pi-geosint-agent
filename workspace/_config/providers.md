# Provider Configuration Guide

> Canonical reference for LLM provider configuration in the geo-OSINT agent.
> Provider choice is **per-stage**, not global — each agent-touching stage configures its own provider and model.

## Supported Providers

pi-ai supports all major LLM providers. Any provider from the list below can be used for any agent-touching stage.

| Provider | Env Var(s) | Notes |
|----------|------------|-------|
| OpenAI | `OPENAI_API_KEY` | |
| Anthropic | `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` | |
| Google / Gemini | `GEMINI_API_KEY` | |
| DeepSeek | `DEEPSEEK_API_KEY` | |
| OpenRouter | `OPENROUTER_API_KEY` | Access to 200+ models through one API key |
| xAI | `XAI_API_KEY` | Grok models |
| Groq | `GROQ_API_KEY` | Fast inference on open models |
| Mistral | `MISTRAL_API_KEY` | |
| Together AI | `TOGETHER_API_KEY` | |
| Hugging Face | `HF_TOKEN` | |
| Cerebras | `CEREBRAS_API_KEY` | |
| Fireworks | `FIREWORKS_API_KEY` | |
| NVIDIA NIM | `NVIDIA_API_KEY` | |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_GATEWAY_ID` | |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` | |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` | |
| Amazon Bedrock | AWS ambient credentials | |
| Vertex AI | `GOOGLE_CLOUD_API_KEY` or ADC | |
| Ant Ling | `ANT_LING_API_KEY` | |
| OpenAI Codex | OAuth (ChatGPT Plus/Pro) | |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | |
| ZAI Coding Plan | `ZAI_API_KEY` | |
| MiniMax | `MINIMAX_API_KEY` | |
| Moonshot AI | `MOONSHOT_API_KEY` | |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` | |
| OpenCode Zen / Go | `OPENCODE_API_KEY` | |
| Kimi For Coding | `KIMI_API_KEY` | |
| Xiaomi MiMo | `XIAOMI_API_KEY` | |
| **Any OpenAI-compatible** | Custom env var | Ollama, vLLM, LM Studio, etc. Configure via `createProvider()` |

> **Full reference**: See `packages/ai/README.md` in `@earendil-works/pi-ai` for complete provider details, auth resolution order, and custom provider creation.

## Per-Stage Defaults

| Stage | Model Class | Recommended Default | Why |
|-------|-------------|--------------------|-----|
| 01_resolve (Agent path only) | Cheap-fast | Flash/Haiku/GPT-4o-mini class | Simple disambiguation — no heavy reasoning needed |
| 02_discover (Agent) | Reasoning | Sonnet/GPT-5/Pro class | Must evaluate flagged records and make prune decisions |
| 03_capture | N/A | — | Deterministic — no LLM |
| 04_store | N/A | — | Deterministic — no LLM |

### Choosing a provider per stage

Each stage that constructs an Agent reads its provider and model from the workspace configuration. The questionnaire (`workspace/setup/questionnaire.md`) prompts for these at setup time.

Recommended combinations:
- **Stage 01 (cheap-fast):** `google/gemini-2.5-flash`, `openai/gpt-4o-mini`, `deepseek/deepseek-chat`, `anthropic/claude-haiku-3-5`, `groq/llama-3.3-70b`
- **Stage 02 (reasoning):** `anthropic/claude-sonnet-4-5`, `openai/gpt-5-mini`, `google/gemini-2.5-pro`, `openrouter/anthropic/claude-sonnet-4-5`

These are examples — any provider/model combination appropriate to the model class will work.

## Configuration

### API Keys
API keys are configured through pi's credential store or environment variables (see env var table above). The credential store takes priority over environment variables.

### Per-Stage Override
The provider and model for each stage are set independently in the workspace configuration. See `workspace/setup/questionnaire.md` for the setup prompts.

> **Important:** Provider choice is per-stage, not global. Stage 01 can use a cheap model from Google while stage 02 uses a reasoning model from Anthropic.
