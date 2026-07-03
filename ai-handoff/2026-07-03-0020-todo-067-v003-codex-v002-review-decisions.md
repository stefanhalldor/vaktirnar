# TODO #67 (proposed) - Codex v003 - Review of Claude v002 and Stebbi decisions

Created: 2026-07-03 00:20  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review + decision handoff for Claude Code  
Refs:

- `ai-handoff/2026-07-03-0000-todo-067-v001-codex-vedrid-ai-first-handoff.md`
- `ai-handoff/2026-07-03-0030-todo-067-v002-claude-phase0-nidustadur.md`

No code, SQL, env, Supabase, commit, push, deploy, or production changes were made.

## Summary

Claude Code's Phase 0 mapping is directionally good. It found the right route pattern, loader pattern, feature-gate pattern, message namespace need, and dependency/cache questions.

Stebbi has now answered the open product/architecture questions. The next step should be a revised Claude Code plan, not implementation yet.

Most important correction: because Stebbi wants the most bulletproof path unless clearly overkill, Phase 1 should no longer assume "no SQL" if we choose shared Supabase cache for met.no responses. A small, server-only cache table/function plan may be justified and should be reviewed separately before execution.

## Findings

### 1. Phase 1A must not become a shipped AI-less MVP

Claude v002 separates Phase 1A foundation, Phase 1B AI, and Phase 1C more intents. That is fine as internal sequencing, but not fine as a product release boundary.

Stebbi has explicitly decided:

- Vedrid should feel like a real final feature from the start.
- AI answer is required for the product to be good enough.
- `WEATHER_AI_ENABLED` exists to disable AI quality/cost risk, not to make the MVP AI-less.

Codex recommendation:

- Claude Code may implement foundation first internally.
- But the first release candidate for Vedrid should include the final UI shape and AI answer path behind `WEATHER_AI_ENABLED`.
- Do not ship the visible feature to users as deterministic-only unless Stebbi explicitly accepts that as a temporary internal test.

### 2. Supabase cache is more consistent with Stebbi's "bulletproof unless overkill" rule

Claude v002 recommended Next.js `fetch` cache as the likely Phase 1 production option. It is a reasonable simple option, but Stebbi prefers the more future-proof path when the extra scope is justified.

For met.no weather:

- cache is required by provider expectations
- many users can ask about the same rounded coordinates
- hourly-ish weather data naturally benefits from shared cache
- Vercel/serverless in-memory cache is not reliable
- Next.js fetch cache may be enough, but is less explicit and less portable than an app-owned cache

Codex recommendation:

- Use Supabase shared cache for met.no responses if Claude Code can keep it small and server-only.
- This means Phase 1 is no longer "no SQL" if the cache table is included.
- The SQL must be a small, separately reviewed migration.
- No client grants. No RLS weakening. No user data in cache. No secrets in cache.

Possible table direction for Claude to evaluate, not implement yet:

- `public.external_api_cache` or `public.weather_api_cache`
- cache key like `metno:compact:{lat3}:{lon3}`
- response JSON
- provider metadata: `expires_at`, `last_modified`, `etag` if available, `status`, `created_at`, `updated_at`
- server-only reads/writes through service role helpers
- no public/client access needed

Claude Code should propose exact SQL and permissions in the revised plan before writing any migration.

### 3. Feature key should be `vedrid`

Claude v002 says "`weather`/`vedrid` case" in `checkFeatureAccess`. Pick one.

Stebbi supplied the public idea URL:

`https://www.teskeid.is/hugmyndir/vedrid`

Codex recommendation:

- route slug: `vedrid`
- idea slug: `vedrid`
- `feature_access.feature_key`: `vedrid`
- env names: `WEATHER_ENABLED`, `WEATHER_FLAG`, `WEATHER_AI_ENABLED`

This keeps the user-facing Teskeid slug stable while env names remain readable.

### 4. Per-user feature gate is required from day 1

Stebbi decision:

> Per user feature flag gate... alltaf svoleiðis í þessum feature flöggum hjá okkur

Therefore:

- Add `WEATHER_ENABLED` global kill switch.
- Add `WEATHER_FLAG` optional per-user switch.
- When `WEATHER_ENABLED=true` and `WEATHER_FLAG=true`, require `feature_access(feature_key='vedrid')`.
- When `WEATHER_ENABLED=true` and `WEATHER_FLAG` is unset/false, logged-in users can access the feature.
- `WEATHER_AI_ENABLED` remains separate and should not replace access control.

### 5. Start free for geocoding and directions

Stebbi decision:

> Byrja með það sem er ókeypis og endurskoða síðar

Codex recommendation:

- Phase 1 should start with a local alias map for the first supported examples:
  - `moso` / `mosfellsbaer`
  - `grafarholt` / `grafarholtid`
  - `selfoss`
  - `reykjavik`
- Optionally evaluate Nominatim/OSM later, but do not wire production dependence on it until usage policy, accuracy, rate limits, and attribution requirements are reviewed.
- Do not add Google/Mapbox keys in Phase 1.
- Do not implement production `route_safety` until directions provider is chosen. It is better to honestly scope route questions than fake route weather from endpoints only.

### 6. Use `stebbi@teskeid.is` for met.no User-Agent if it is monitored

Stebbi suggested:

`stebbi@teskeid.is`

Codex recommendation:

`Teskeidin/1.0 (+https://teskeid.is; stebbi@teskeid.is)`

Claude Code should ask only if this email is not monitored or should not receive operational/provider contact.

### 7. Prefer Anthropic SDK for bulletproof AI implementation

Claude v002 correctly found that `@anthropic-ai/sdk` is not currently in `package.json`.

Explanation for Stebbi:

- Native `fetch` means we hand-write HTTP calls to Anthropic's API ourselves.
- `@anthropic-ai/sdk` is Anthropic's official client package. It usually gives cleaner request code, better typed responses, and less custom boilerplate around errors/API shapes.
- In both cases, the app uses the server-side `ANTHROPIC_API_KEY`.
- That API key belongs to the Teskeid/Vercel environment Stebbi configures. Usage/billing goes to that Anthropic API account, not to end users.
- Users never see the key.

Codex recommendation:

- For this AI-first, safety-sensitive feature, use `@anthropic-ai/sdk` rather than hand-rolled native fetch.
- Adding the package is a dependency change and requires explicit Stebbi approval before implementation.
- Keep all AI calls server-side.
- Keep `WEATHER_AGENT_MODEL` configurable.
- Keep deterministic result validation in app code. Do not trust SDK output just because it came from the model.

## Stebbi Decisions To Carry Forward

1. Geocoding/provider strategy: start free and revisit later.
2. met.no contact email: likely `stebbi@teskeid.is`.
3. Cache strategy: Supabase sounds more future-proof and bulletproof than in-memory/Next-only cache.
4. AI implementation: prefer the more robust path; Codex recommends Anthropic SDK, with server-side `ANTHROPIC_API_KEY`.
5. Feature gates: always support per-user gate for this kind of feature.
6. Slug/public idea URL: `vedrid`, based on `https://www.teskeid.is/hugmyndir/vedrid`.

## Revised Scope Recommendation For Claude v004

Claude Code should produce a revised implementation plan that treats Phase 1 as:

### Phase 1A - Access, UI shell, deterministic weather foundation, shared cache plan

Include:

- `vedrid` feature key in existing `checkFeatureAccess`
- `WEATHER_ENABLED`
- `WEATHER_FLAG`
- `WEATHER_AI_ENABLED`
- `WEATHER_AGENT_MODEL`
- `ANTHROPIC_API_KEY`
- `METNO_USER_AGENT`
- `/auth-mvp/vedrid` page and `loading.tsx`
- home ready-card integration for `vedrid`
- `teskeid.vedrid.*` messages
- final-shaped UI, not a throwaway demo
- `lib/weather` types, thresholds, met.no parser/fetch wrapper
- local alias map for first places
- grill/place weather deterministic tool
- tests for flags, thresholds, parser, fallback behavior
- proposed Supabase cache migration, but not executed until separately approved

### Phase 1B - AI answer layer

Include:

- approved `@anthropic-ai/sdk` dependency
- server-only Anthropic client
- AI answer behind `WEATHER_AI_ENABLED`
- `toolResultId` validation
- contradiction/unsafe-wording guard
- deterministic fallback on any AI failure
- tests that AI is not called when flag is off
- tests that invalid AI output falls back cleanly

### Phase 1C - More intents

Include after grill/place path is solid:

- golf window in Grafarholt
- route-safety only after directions provider decision

## Requirements For Supabase Cache Plan

Claude Code should not write SQL yet. It should first propose:

- table name
- columns
- primary key / unique key
- indexes
- whether RLS is enabled
- grants: ideally no client grants
- server-only access pattern
- cleanup/expiry strategy
- how `Expires`, `Last-Modified`, `If-Modified-Since`, 304, 403, 429, and 203 are handled
- proof that no user data, email, prompt text, secrets, or auth data enters the cache
- rollback plan

Preferred security posture:

- Cache table contains only external weather response data keyed by rounded coordinates/provider endpoint.
- No user-specific rows.
- No user prompt storage.
- No public/anon/authenticated direct access.
- Writes/read through server code using service role or tightly scoped server-only route.

## Required Plan Corrections From v002

Claude v004 should explicitly update these v002 assumptions:

- Replace "Ekkert SQL" with "No SQL unless Supabase cache is approved; if using Supabase cache, SQL migration is part of Phase 1A and needs separate review."
- Replace ambiguous "`weather`/`vedrid`" feature key with `vedrid`.
- Replace "Next.js fetch cache recommended" with "Supabase cache preferred by Stebbi unless Claude can show it is overkill."
- Replace "Native fetch vs SDK open question" with "Codex recommends SDK; Stebbi needs to approve dependency install."
- Replace "Phase 1A then AI later" wording with a release boundary where the first real release candidate includes AI behind flag.

## Localhost checks for Stebbi

For the revised plan and later implementation, Claude Code should include these checks:

1. Feature hidden when disabled:
   - Set `WEATHER_ENABLED` unset/false.
   - Open `/auth-mvp/heim`.
   - Expected: no active Vedrid card.
   - Open `/auth-mvp/vedrid`.
   - Expected: redirected/blocked according to existing feature guard pattern.

2. Per-user access:
   - Set `WEATHER_ENABLED=true` and `WEATHER_FLAG=true`.
   - Test a user without `feature_access(feature_key='vedrid')`.
   - Expected: no access.
   - Test an allowlisted user.
   - Expected: access.
   - Do not edit production `feature_access` casually; production allowlist changes need explicit approval.

3. AI off:
   - Set `WEATHER_AI_ENABLED=false`.
   - Ask "Er grillvedur i Moso i kvold?"
   - Expected: deterministic answer appears, no Anthropic call is made, no model/API key required.

4. AI on:
   - Set `WEATHER_AI_ENABLED=true` with a valid server-side `ANTHROPIC_API_KEY`.
   - Ask same question.
   - Expected: AI-worded answer appears only if it validates against deterministic result.
   - Force/observe AI failure safely if test hook exists.
   - Expected: deterministic fallback.

5. Weather cache:
   - Ask same place/time twice.
   - Expected: second call reuses shared cache/revalidation path and does not hammer met.no.
   - Do not call met.no rapidly in loops.

6. Mobile UI:
   - Test `/auth-mvp/vedrid` at 360px, 390px, and 460px.
   - Focus the textarea/input with keyboard open.
   - Expected: no mobile zoom, horizontal overflow, control overlap, or stuck scroll state.

7. Safety wording:
   - Ask a high-wind caravan-style question if supported.
   - Expected: no "oruggt", "engin haetta", "safe", or guarantee wording.

## Next Step

Claude Code should create `todo-067-v004` as a revised implementation plan using these decisions. It should still not implement code, SQL, dependency installs, env changes, Supabase changes, commits, pushes, or deploys until Stebbi gives explicit scoped implementation approval.
