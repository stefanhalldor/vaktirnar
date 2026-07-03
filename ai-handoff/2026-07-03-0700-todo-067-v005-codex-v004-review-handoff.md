# TODO #67 (proposed) - Codex v005 - Review of Claude v004 revised plan

Created: 2026-07-03 07:00  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review handoff + mini-revision request for Claude Code  
Refs:

- `ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md`
- `ai-handoff/2026-07-03-0020-todo-067-v003-codex-v002-review-decisions.md`
- `ai-handoff/2026-07-03-0010-todo-067-v002-claude-phase0-nidustadur.md`
- `ai-handoff/2026-07-03-0000-todo-067-v001-codex-vedrid-ai-first-handoff.md`

No code, SQL, env, Supabase, dependency install, commit, push, deploy, or production changes were made.

## Findings

### 1. Major - Do not approve disabled RLS on `public.weather_cache`

Claude v004 proposes:

`ALTER TABLE public.weather_cache DISABLE ROW LEVEL SECURITY;`

Reference: `ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md:89`

Do not approve this as written.

Bulletproof posture for this project should be:

- `ENABLE ROW LEVEL SECURITY`
- no client policies
- `REVOKE` direct table access from `PUBLIC`, `anon`, and `authenticated`
- server-only access through the existing service-role/admin server helper
- no user data, prompt text, email, auth/session data, or secrets in cache rows

Rationale:

- This keeps the table private by default even if future grants or policies are changed accidentally elsewhere.
- Service-role server code can still operate.
- It matches the general project instinct: do not weaken RLS unless there is a very explicit reason.

Claude Code should revise the SQL plan before any migration is written.

### 2. Major - v004 is missing the required `Localhost checks for Stebbi` section

The repo workflow requires every implementation plan, handoff, and review to include `Localhost checks for Stebbi`.

Claude v004 does not include that section.

Before v004 can become an execution handoff, Claude Code must add clear localhost checks covering:

- feature disabled
- per-user gate
- AI disabled
- AI enabled
- cache behavior
- mobile input/keyboard behavior
- safety wording
- what not to test casually, especially Supabase, API keys, billing, and production allowlists

### 3. Medium - Cache key is too narrow

Claude v004 proposes:

`metno:{lat3}:{lon3}`

Reference: `ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md:72`

Use a key that includes provider, API family, API version, endpoint, and coordinate precision.

Recommended shape:

`metno:locationforecast:2.0:compact:{lat3}:{lon3}`

Rationale:

- avoids collisions if met.no endpoint/version changes
- allows adding nowcast, alerts, or a different provider later
- makes cache rows easier to inspect/debug

### 4. Medium - Cleanup/expiry is too optimistic for future route sampling

Claude v004 says old data will not grow without bound because one cache key equals one row.

Reference: `ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md:118`

That is probably okay for Phase 1 grill/place checks, but too optimistic once route sampling enters the feature. Route sampling can create many rounded coordinate keys.

Claude Code should revise the cache plan to include a modest cleanup posture even if no cron is implemented yet:

- keep `expires_at`
- keep `fetched_at`
- include a documented manual or server-helper cleanup path
- consider deleting rows older than a conservative window, for example 7 to 14 days, once route sampling is added
- do not add `pg_cron` in Phase 1 unless separately approved

## Methodology Decision

Do not skip Phase 1A technically.

The AI layer in Phase 1B needs:

- deterministic tool result
- stable `toolResultId`
- weather cache
- feature guard
- types
- thresholds
- met.no parser/client
- UI shell

But do not stop after Phase 1A as a product milestone.

Best method:

1. Claude Code implements Phase 1A first as an internal checkpoint.
2. Claude Code then continues directly into Phase 1B in the same product work lot.
3. The first real release candidate is only considered ready when both Phase 1A and Phase 1B are present.
4. Codex reviews before commit/push/deploy.

This keeps the implementation safe without creating an AI-less MVP.

## Stebbi Decisions To Carry Into v005 Mini-Revision

- Supabase cache: yes.
- Anthropic SDK: yes, if SDK is the better path.
- User-Agent: use `Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)`.
- Per-user feature gate: required pattern for this feature.
- Release method: Phase 1A and Phase 1B can be separate internal checkpoints, but should be one product lot.

## Required v005 Mini-Revision From Claude Code

Claude Code should create a small revised handoff that:

1. Replaces disabled RLS with enabled RLS, no client policies, and explicit revokes.
2. Updates cache key from `metno:{lat3}:{lon3}` to `metno:locationforecast:2.0:compact:{lat3}:{lon3}` or an equivalent versioned key.
3. Adds a realistic cleanup/expiry strategy that acknowledges future route sampling.
4. Adds the required `Localhost checks for Stebbi` section.
5. Updates the User-Agent to `Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)`.
6. States that Phase 1A and Phase 1B are one product lot with an internal checkpoint after 1A.

After that, Stebbi can give a very scoped implementation approval for the Phase 1A + 1B lot.

## Localhost checks for Stebbi

These checks should be included in Claude Code's revised execution handoff and used after implementation.

### Feature disabled

Setup:

- `WEATHER_ENABLED` unset or false.

Steps:

- Open `/auth-mvp/heim`.
- Open `/auth-mvp/vedrid` directly.

Expected:

- Vedrid does not appear as an active ready Teskeid card.
- Direct route access is blocked/redirected according to the existing feature guard pattern.

### Per-user gate

Setup:

- `WEATHER_ENABLED=true`
- `WEATHER_FLAG=true`

Steps:

- Test a user without `feature_access(feature_key='vedrid')`.
- Test a user with `feature_access(feature_key='vedrid')`.

Expected:

- Non-allowlisted user cannot access Vedrid.
- Allowlisted user can access Vedrid.

Do not edit production allowlists casually. Production feature access changes require explicit approval.

### AI disabled

Setup:

- `WEATHER_ENABLED=true`
- `WEATHER_AI_ENABLED=false`

Steps:

- Ask: `Er grillvedur i Moso i kvold?`

Expected:

- Deterministic answer is shown.
- No Anthropic call is made.
- No API key is needed for this path.

### AI enabled

Setup:

- `WEATHER_ENABLED=true`
- `WEATHER_AI_ENABLED=true`
- valid server-side `ANTHROPIC_API_KEY`

Steps:

- Ask: `Er grillvedur i Moso i kvold?`
- If implementation includes a safe dev/test hook, force invalid AI output or AI error.

Expected:

- AI-worded answer is shown only if it validates against deterministic `toolResultId`.
- Invalid, contradictory, or failing AI output falls back to deterministic answer.
- API key is never exposed in client output, logs, or network responses.

### Cache behavior

Steps:

- Ask the same place/time question twice.
- Inspect server logs/test output if available.

Expected:

- Second request uses cache or conditional revalidation path.
- The app does not repeatedly hammer met.no for the same rounded coordinates.
- Cache rows contain no user prompt, user id, email, auth/session data, or secrets.

### Mobile UI

Steps:

- Test `/auth-mvp/vedrid` at 360px, 390px, and 460px.
- Focus the textarea/input with mobile keyboard open.

Expected:

- No mobile zoom.
- No horizontal overflow.
- No overlapping controls.
- Submit/loading state is stable.

### Safety wording

Steps:

- Ask a high-wind or caravan-style question if the intent is supported.

Expected:

- No guarantee language such as "oruggt", "engin haetta", "tryggt", or "safe".
- Answer uses cautious recommendation wording.

### Do not test casually

Do not casually test or change:

- production Supabase migrations
- production `feature_access`
- production API keys
- production Anthropic billing-impacting loops
- rapid met.no request loops
- commit/push/deploy

These require explicit, separate approval from Stebbi.

## Final Recommendation

Ask Claude Code for `todo-067-v006` or the next available revised handoff that only fixes these plan issues. Do not start implementation until the revised handoff has been reviewed and Stebbi gives explicit scoped approval.
