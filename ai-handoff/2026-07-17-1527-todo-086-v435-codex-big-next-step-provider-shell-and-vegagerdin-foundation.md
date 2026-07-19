# 2026-07-17 15:27 — TODO-086 v435 — Codex big next step: provider shell + Vegagerðin foundation

Created: 2026-07-17 15:27
Builds on:
- `2026-07-17-1500-todo-086-v433-claude-b3c-provider-neutral-shell-prerelease.md`
- `2026-07-17-1523-todo-086-v434-codex-v433-provider-neutral-shell-review.md`
- `2026-07-15-0709-todo-086-v197-codex-vegagerdin-current-measurements-handoff.md`
- `2026-07-16-1431-todo-086-v330-codex-v197-vegagerdin-structure-review.md`

## Short Human Summary

Stebbi has localhost-tested v433 and wants a bigger next step than the small B3C.1 polish suggested in v434.

Do a bold but bounded combined step:

1. Harden the provider-neutral overview shell so it can truly host multiple providers.
2. Add the first Vegagerðin foundation: access model, parser/cache skeleton, types, tests, and a provider adapter seam.
3. Do **not** yet blend Vegagerðin current measurements into trip forecast calculations.
4. Do **not** run SQL, deploy, push, or call Vegagerðin upstream without explicit permission.

The product line to hold: Vegagerðin data is **current/live measurement data**, not a future forecast. It can be displayed beside the route and overview, but must not change departure scrubber / worst forecast / forecast status until we deliberately design that rule.

## Big Step Name

B3D + B4A:

- **B3D:** real multi-provider overview shell hardening
- **B4A:** Vegagerðin current-measurement provider foundation

## Why This Bigger Step Is Safe Enough

This is a large step, but still safe because:

- no production changes
- no SQL execution
- no Vercel/env changes
- no deploy
- no current measurement data affecting safety/status decisions yet
- all new Vegagerðin behavior is behind provider/access wiring and server-side parsing
- any external network fetch must be approved separately by Stebbi

## Hard Scope Boundaries

### In Scope

1. Provider-neutral shell hardening:
   - provider controls/toggles in the shell
   - multi-provider-safe URL restoration
   - generic shell i18n/labels
   - provider unavailable/degraded state
   - tests where practical

2. Vegagerðin feature/access foundation:
   - add `weather-provider-vegagerdin` as a feature key
   - add `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` semantics
   - admin/guard/API wiring for granting provider access
   - write migration file only if needed, but do not run it

3. Vegagerðin current-measurement provider foundation:
   - server-only types/parser/normalizer
   - raw cache strategy using existing shared weather cache if possible
   - explicit semantics for mean wind vs gust
   - tests with fixture or approved sampled data

4. Overview integration seam:
   - add Vegagerðin as a provider config seam in the overview shell
   - if no real data yet, show it as unavailable/upcoming only through the generic provider strip
   - if parser/cache is complete and data is safely available, map it as a separate provider layer

5. Route matching foundation if it is already shared enough:
   - reuse existing provider route matching / projection helpers
   - do not duplicate geometry functions
   - do not attach Vegagerðin points to met.no points

### Out Of Scope

Do not do these in this step:

- Do not run SQL migrations.
- Do not deploy, push, or commit.
- Do not edit Vercel env.
- Do not add cron jobs.
- Do not add DATEX II, road closures, road condition/færð, cameras, or WFS road geometry.
- Do not change met.no sampling.
- Do not change Veðurstofan station route matching in this step except if required by shared types.
- Do not feed Vegagerðin current measurements into:
  - departure scrubber
  - worst forecast point
  - selected forecast provider comparison
  - `selectDecisiveProvider`
  - future travel candidate status
- Do not create one-off Vegagerðin chat tables.
- Do not move Púls to Vegagerðin yet unless only adding target-type planning.

## B3D Details — Provider-Neutral Overview Shell

### Required Changes

Extend `WeatherOverviewProviderConfig` so the shell owns provider controls, not each adapter.

Minimum useful contract:

```ts
type WeatherOverviewProviderConfig = {
  providerId: string
  label: string
  shortLabel?: string
  statusLabel?: string
  helperText?: string
  loading: boolean
  loadError: boolean
  providerRestricted: boolean
  unavailableReason?: 'restricted' | 'disabled' | 'upcoming' | 'error' | 'empty'
  canToggle: boolean
  isVisible: boolean
  onToggle?: (nextVisible: boolean) => void
  mapLayer: ProviderMapLayer | null
  renderPreMap?: (ctx: ProviderContentCtx) => React.ReactNode
  renderPostMap?: (ctx: ProviderContentCtx) => React.ReactNode
}
```

Adapt this to existing style, but keep the intent:

- the shell renders the provider strip
- adapters render domain-specific details
- `IcelandOverviewMap` receives only visible provider layers
- provider unavailable states are visible enough to avoid confusing blank UI

### URL Restore Fix

The current one-shot `?stationId=` restore can fail once multiple providers load asynchronously.

Change it so it retries until:

- the requested marker is found, or
- all providers are done loading and no matching marker exists.

Do not mark restoration as complete before a match is found unless all providers are settled.

### Generic Copy / Namespace

Move generic overview shell text out of the legacy-ish `eltaVedrid` namespace or pass labels into the shell.

Good direction:

- `teskeid.vedrid.overview.*` for overview shell copy
- keep provider-specific Veðurstofan labels under the existing namespace if that is smaller for now

Do not hardcode new user-facing text in components.

## B4A Details — Vegagerðin Foundation

### Access Model

Use the current provider graduation model:

```text
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```

Means:

- Vegagerðin provider is restricted to users with feature access row:
  - `feature_access.feature_key = 'weather-provider-vegagerdin'`

Missing/false/anything other than exact `true` means:

- Vegagerðin provider is open to all users who can access weather.

Do not create or use:

```text
WEATHER_PROVIDER_VEGAGERDIN_ENABLED
```

Required code/docs/test surface if feature key is added:

- SQL migration file adding `weather-provider-vegagerdin` to the feature check constraint
- `lib/loans/guard.ts`
- admin feature-access API allowlist
- admin page type/section
- `.env.example`
- targeted tests

Do not run the migration.

### Parser / Normalizer

Vegagerðin endpoint from previous handoffs:

```text
https://gagnaveita.vegagerdin.is/api/vedur2014_1
```

External fetch requires explicit Stebbi approval. If Claude Code has no approval, build parser against a tiny documented fixture from existing handoff/sample and clearly mark that live response verification is pending.

Suggested normalized shape:

```ts
export type VegagerdinCurrentMeasurement = {
  source: 'vegagerdin'
  stationId: string
  stationName: string
  lat: number
  lon: number
  measuredAtIso: string
  fetchedAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  dataQuality: 'complete' | 'partial'
}
```

Rules:

- `Vindhradi` means mean/current wind speed.
- `Vindhvida` means recent/max gust, not forecast gust.
- null remains null.
- missing numeric values must not become `0`.
- parse measured time explicitly.
- preserve fetched time separately from measured time.
- do not expose raw upstream payload to clients.

Suggested files, adapt names to repo style:

```text
lib/weather/providers/vegagerdinCurrent.server.ts
lib/weather/providers/vegagerdinCurrentTypes.ts
lib/weather/providers/vegagerdinCurrentSchema.ts
lib/weather/providers/vegagerdinCurrentTime.ts
lib/__tests__/weather-vegagerdin-current.test.ts
lib/__tests__/weather-vegagerdin-current-time.test.ts
```

### Cache

Use server-side shared cache. Do not fetch from browser.

Initial cache key:

```text
vegagerdin:vedur2014_1:latest
```

Recommended behavior:

- fresh TTL: 2 minutes
- do not call upstream if cache is fresh
- stale fallback max: 30 minutes
- upstream timeout: 8 seconds or less
- surface `freshness`/`stale` metadata to downstream code

If current `weather_cache` helper is unsuitable, stop and explain why before inventing a new persistence layer.

### Product Tables

v330 suggested product tables early because the architecture is more mature now.

For this big step:

- It is OK to write a migration plan or migration file if Claude Code thinks product tables are necessary.
- Do not run it.
- Prefer not to block parser/cache work on product tables unless needed.
- If adding product tables, they must be service-role only, RLS enabled, no anon/authenticated grants.

Recommended conservative route:

1. Parser/cache first.
2. Overview provider seam second.
3. Product table migration plan/file only if it is clearly needed before UI.

### Overview Provider Adapter

If parser/cache is ready, add a Vegagerðin overview adapter that implements the same shell contract:

- provider label: `Vegagerðin`
- provider status/helper text clearly says current measurements
- markers are separate layer, not Veðurstofan stations
- tones should reflect freshness/data availability, not driving safety
- selected marker preview says:

```text
Núverandi mæling frá Vegagerðinni
Mælt kl. HH:mm
Vindur X m/s
Hviða síðustu 10 mín. Y m/s
```

If no live data is available yet, provider strip should show `Vegagerðin` as upcoming/unavailable without breaking the overview.

## Route Matching Rule

Vegagerðin points must be their own fixed-provider points, like Veðurstofan:

- one physical station/live point appears once
- match against dense route geometry / shared route projection helper
- compute distance from route
- compute distance along route
- sort by route order

Do not attach Vegagerðin to met.no sample points.

If route matching helper is already extracted (`providerRouteMatching`, `routeControlPoints`, etc.), reuse it. If not, extract before copying geometry.

## Tests To Run

Minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/pulseBack.test.ts
```

Add/run targeted tests for:

- provider shell controls
- multi-provider URL restoration
- Vegagerðin feature access key/admin/guard if implemented
- Vegagerðin parser/null/time behavior
- cache fresh/stale behavior with mocked fetch/cache

If a migration file is written, no SQL is run. Include SQL/RLS/grant analysis in handoff.

## Stop Conditions

Stop and hand off if:

- external fetch is required and Stebbi has not approved it
- SQL execution would be needed
- feature access migration becomes coupled to unrelated admin refactor
- product table design gets bigger than one small provider-specific schema
- provider shell changes would require redesigning `/vedrid`
- Vegagerðin data starts influencing trip status decisions
- tests fail due unrelated dirty worktree
- any change would require Vercel/env/deploy/production action

## Localhost Checks For Stebbi

After Claude implementation, Stebbi should test:

1. Public overview:
   - `http://localhost:3004/vedrid`
   - expected: overview loads, provider strip appears, Veðurstofan works as before.

2. Auth overview:
   - `http://localhost:3004/auth-mvp/vedrid`
   - expected: same overview with auth menu, provider strip appears, CTA to ferðaveður works.

3. Provider toggles:
   - toggle Veðurstofan off/on if toggle is enabled
   - expected: map markers and provider content hide/show without route reload.

4. URL restore:
   - select a station, go to Púls, return with `?stationId=...`
   - expected: correct marker/card selected even after async provider load.

5. Restricted provider:
   - set provider access required for Veðurstofan or Vegagerðin
   - expected: overview still renders and provider state is clear/quiet, not broken.

6. Vegagerðin if adapter is visible:
   - expected: it is clearly labeled as current measurement, not forecast.
   - no departure scrubber/worst-point/status changes because of Vegagerðin.

7. Mobile:
   - 390px and 546px widths
   - expected: no horizontal overflow, no input zoom, no oversized controls, no map overlap.

Do not test production, SQL, RLS, Vercel, cron, or upstream hammering.

## Suggested Prompt For Claude Code

```text
Workflow.

Please continue from:
- 2026-07-17-1500-todo-086-v433-claude-b3c-provider-neutral-shell-prerelease.md
- 2026-07-17-1523-todo-086-v434-codex-v433-provider-neutral-shell-review.md
- 2026-07-17-1527-todo-086-v435-codex-big-next-step-provider-shell-and-vegagerdin-foundation.md

Stebbi has localhost-tested v433 and wants a bigger next step. Be bold, but stay inside this bounded scope.

Goal:
Implement B3D + B4A:
1. Harden the overview shell so it is genuinely multi-provider.
2. Add the first Vegagerðin current-measurement provider foundation.

Rules:
- First review this plan critically. If you see a blocker or product decision, stop and hand off.
- If no blocker, implement.
- Do not commit, push, deploy, edit Vercel env, run SQL, or touch production.
- Do not call the live Vegagerðin endpoint unless you explicitly ask Stebbi for approval and he approves.
- Writing a migration file is allowed only if it is part of the scoped feature-access/product-table work; do not run it.
- Read relevant Design.md sections before UI edits.

B3D scope:
- Add provider-control metadata to `WeatherOverviewProviderConfig`.
- Render a generic provider strip/toggle area in `WeatherOverviewShell`.
- Make map layers respect provider visibility.
- Fix URL restoration so it is safe for async multi-provider layers.
- Move generic shell copy out of the legacy `eltaVedrid` namespace or pass labels into the shell.
- Add graceful provider unavailable/degraded states.

B4A scope:
- Add current-model Vegagerðin foundation, not forecast logic.
- Use `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` and `weather-provider-vegagerdin`.
- Do not use `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`.
- Add guard/admin/API/docs/tests for the feature key if implementing access.
- Parser/normalizer must preserve `Vindhradi` as mean wind and `Vindhvida` as recent gust.
- Null values stay null, never 0.
- Cache server-side; no browser fetch.
- Vegagerðin must not affect scrubber, worst forecast point, selected provider aggregation, or future travel status in this step.
- If adding overview markers, they are separate provider markers and must say current measurement, not forecast.

Verification:
- Run `npm run type-check`.
- Run existing focused tests:
  `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/pulseBack.test.ts`
- Add/run targeted tests for provider shell controls, URL restoration, feature access, and Vegagerðin parser/cache if implemented.

After implementation, stop and create a full handoff in `ai-handoff/` including:
- plan
- what changed
- files inspected
- files changed
- commands and exit codes
- risks
- skipped items
- SQL/RLS/auth notes if any migration file was written
- Localhost checks for Stebbi
```
