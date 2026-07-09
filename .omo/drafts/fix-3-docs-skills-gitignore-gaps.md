---
slug: fix-3-docs-skills-gitignore-gaps
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/fix-3-docs-skills-gitignore-gaps.md
approach: Three independent fixes: (1) create canonical providers.md and strip vendor-specific names from workspace docs, (2) add SKILL.md files to geo packages with pi.skills registration, (3) gitignore evidence/ to prevent auth token leak
---

# Draft: fix-3-docs-skills-gitignore-gaps

## Components (topology ledger)
| id | outcome | status | evidence path |
|----|---------|--------|---------------|
| C1-providers-docs | Canonical providers.md created; AGENT.md/CONTEXT.md/stage CONTEXT.md/questionnaire.md stripped of vendor-specific names | active | workspace/_config/providers.md, workspace/AGENT.md, workspace/CONTEXT.md, workspace/stages/*/CONTEXT.md, workspace/setup/questionnaire.md |
| C2-skills | 3 SKILL.md files created; pi.skills registered in package.json | active | packages/geo-tools/skills/, packages/geo-workspace/skills/, packages/geo-tools/package.json, packages/geo-workspace/package.json |
| C3-gitignore | evidence/ added to .gitignore | active | .gitignore |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|------------|----------------|-----------|-------------|
| _config/*.md and Skills coexist | Keep _config/*.md as Layer 3 reference; Skills are progressive-disclosure load points that reference _config/*.md rather than duplicating content | Skills need to be short (frontmatter + brief body) to fulfill on-demand loading; the full contract detail stays in the existing files | Yes — can migrate later |
| provider names replaced with "configurable via providers.md" | Strip explicit Anthropic/DeepSeek names from workspace docs, replace with generic model-class descriptions + pointer to providers.md | The user explicitly requested this in the issue description | Yes |
| evidence/ gitignored (not workspace/) | Only evidence/ added to .gitignore | workspace/ contains the MWP prompt files which are version-controlled intentionally; settings leak is through evidence/settings.json only | Yes |

## Findings (cited - path:lines)

### Issue 1: Provider config docs are vendor-specific
- **packages/ai/README.md:58-87** — pi-ai supports 25+ providers (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Groq, Cerebras, xAI, Mistral, Together, HuggingFace, Ollama via openai-compatible, etc.)
- **workspace/AGENT.md:30-31** — "Every LLM-touching stage must state which provider/model it targets and why" + mentions "Haiku-class/DeepSeek-class" and "stronger reasoning model"
- **workspace/CONTEXT.md:54-59** — Provider/Model Requirements table: stage 01 = Anthropic/DeepSeek, stage 02 = Anthropic
- **workspace/stages/01_resolve/CONTEXT.md:16** — "Model choice ... default: cheap fast model — Haiku-class/DeepSeek-class"
- **workspace/stages/02_discover/CONTEXT.md:16** — "Model choice ... default: stronger reasoning model — Sonnet-class"
- **workspace/setup/questionnaire.md:28-48** — Hardcodes DeepSeek for stage 01, Anthropic for stage 02
- **workspace/_config/docker-network-policy.md:16** — Mentions "Provider API domains | LLM provider endpoints (Anthropic, DeepSeek, OpenRouter, etc.)" — this is fine as a non-exhaustive example

### Issue 2: geo packages have no Skills
- **packages/geo-tools/package.json** — No `pi.skills` entry, no `skills/` directory
- **packages/geo-workspace/package.json** — Same, no `pi.skills` entry
- **workspace/_config/*.md** — 4 files (kartaview-api-contract.md, storage-schema.md, docker-network-policy.md, capture-path-rules.md) that Layer 3 reference material that Skills would load on demand
- No `skills/` directory exists in either geo package

### Issue 3: evidence/ not gitignored, settings.json leaks auth token
- **.gitignore:1-41** — Does NOT contain evidence/ or settings.json
- **evidence/ exists** — Directory created at /home/aiobi6/pi-geosint-agent/evidence/ (currently empty)
- **packages/geo-webui/src/server.ts:64-68** — Default settings include storageRoot: join(process.cwd(), "evidence"); settings.json written to storageRoot/settings.json
- **packages/geo-webui/src/server.ts:53-58** — Settings interface includes kartaviewAuthToken?: string — stored in plain JSON

## Decisions (with rationale)
1. **C1 approach: Create providers.md, edit 5 files to strip vendor names** — One new canonical reference file, then targeted edits to AGENT.md, CONTEXT.md, both stage CONTEXT.md files, and questionnaire.md. The docker-network-policy.md mention of "Anthropic, DeepSeek, OpenRouter, etc." is kept as an illustrative example, not a restriction.
2. **C2 approach: 3 SKILL.md files + pi.skills in package.json** — kartaview-discovery/SKILL.md and evidence-capture/SKILL.md in geo-tools; geohash-recall/SKILL.md in geo-workspace. Skills reference existing _config/*.md rather than duplicating content. pi.skills entries use the skills/ directory discovery path.
3. **C3 approach: Add evidence/ to .gitignore** — Single line in .gitignore. No other changes needed.

## Scope IN
- Create workspace/_config/providers.md as canonical provider reference
- Edit AGENT.md, CONTEXT.md, questionnaire.md, 01_resolve/CONTEXT.md, 02_discover/CONTEXT.md to strip vendor-specific names, replace with references to providers.md
- Create 3 SKILL.md files (kartaview-discovery, evidence-capture, geohash-recall)
- Register pi.skills in geo-tools/package.json and geo-workspace/package.json
- Add evidence/ to .gitignore

## Scope OUT (Must NOT have)
- Do NOT create a full ADR for the Skills vs _config coexistence decision — user said "worth a short note", not a formal ADR. A comment in providers.md or a one-paragraph NOTE in _config/README.md is sufficient.
- Do NOT implement provider dropdown in web UI settings panel — that's a separate feature in the UI code, not a docs/config fix
- Do NOT touch 03_capture/CONTEXT.md or 04_store/CONTEXT.md — they have no provider references
- Do NOT migrate _config/*.md content into Skills — keep them as reference docs, Skills point to them
- Do NOT add workspace/ to .gitignore — workspace contains intentional version-controlled prompt files

## Open questions
None — all forks resolved by exploration or best-practice defaults (recorded in assumptions above).

## Approval gate
status: awaiting-approval
