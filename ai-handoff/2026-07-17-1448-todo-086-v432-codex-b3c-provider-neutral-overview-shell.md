# 2026-07-17 14:48 — TODO-086 v432 — Codex B3C provider-neutral overview shell

Created: 2026-07-17 14:48
Related review: `2026-07-17-1445-todo-086-v431-codex-v430-middleware-stations-review.md`

## Short Human Summary

v431 looks good enough to continue: the exact public middleware exception for `/api/teskeid/weather/vedurstofan/stations` is scoped correctly.

Next we should take a bigger but still bounded implementation step: make the new `/vedrid` overview architecture provider-neutral, with Veðurstofan as the first real provider layer. The point is not to add Vegagerðin yet, but to make the overview screen, map, selected-marker preview, loading/degraded states, and provider toggles reusable so Vegagerðin can plug into the same shell instead of becoming a second custom implementation.

## Goal For Claude Code

Build B3C: a provider-neutral weather overview shell for:

- `/vedrid`
- `/auth-mvp/vedrid`
- compatibility/back-link surfaces that currently point through `/auth-mvp/vedrid/elta-vedrid`

Keep Veðurstofan working as the first provider. Do not implement Vegagerðin data fetching yet.

## Scope

### In Scope

1. Keep the v431 middleware fix and tests intact.
2. Extract or firm up reusable overview components/contracts around the current Veðurstofan overview:
   - provider-neutral overview shell/layout
   - provider layer config/adapter contract
   - provider-neutral marker type
   - selected marker preview card area
   - provider toggles/filter strip
   - shared loading/empty/degraded/error states
3. Keep `IcelandOverviewMap` provider-neutral.
4. Keep the Veðurstofan station layer as the first implementation of the provider contract.
5. Preserve public/auth routing behavior:
   - public `/vedrid` opens overview
   - public `/vedrid/ferdalagid` opens trip weather
   - auth `/auth-mvp/vedrid` opens overview
   - auth `/auth-mvp/vedrid/ferdalagid` opens trip weather with saved/auth features
6. Keep the user-facing route to travel weather clear from overview:
   - CTA text may be something like `Reikna ferðaveður`
   - do not make `/vedrid` silently become the old trip screen again
7. Make degraded provider behavior graceful:
   - if Veðurstofan provider is unavailable/restricted/off/404, the overview screen still renders
   - CTA to trip weather still exists
   - no dead map controls or confusing blank state
8. Keep mobile-first behavior clean per `Design.md`.
9. Run focused tests and type-check.
10. Produce an immediate handoff after implementation.

### Out Of Scope

Do not do these in this step:

- No Vegagerðin data/API/schema implementation.
- No SQL migrations.
- No RLS, grants, auth-policy, or Supabase changes.
- No Vercel/env changes.
- No commit, push, deploy, or production action.
- No route-cache / interest-heatmap implementation.
- No Vík/Reynisfjall section deferred fix.
- No Öxi south-coast/Höfn deferred route work.
- No met.no computation refactor.
- No Púls/chat-core refactor unless a tiny type reuse is required by the provider shell.
- No broad visual redesign beyond the shell extraction and necessary states.

## Product And Access Rules To Preserve

Use the current flag/access model:

- `WEATHER_ENABLED=All` means public and authenticated users can access weather.
- `WEATHER_ENABLED=Authenticated` means only authenticated users can access weather.
- other/missing `WEATHER_ENABLED` means weather is closed.
- `WEATHER_AUTH_ACCESS_REQUIRED=true` gates authenticated weather entry behind per-user access, where applicable.
- `WEATHER_ELTA_VEDRID_FLAG=true` enables the overview/Veðurstofan exploration surface.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` restricts Veðurstofan provider layer to users with `weather-provider-vedurstofan`.
- if `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is missing or not exactly `true`, Veðurstofan provider is globally visible to users who can access weather.

Important: do not reintroduce the old `WEATHER_PUBLIC_ENABLED`, `WEATHER_FLAG`, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`, or `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` semantics.

## Architecture Guidance

Prefer a small reusable core over duplicated screens.

Suggested shape, but adapt to existing code if names differ:

- `WeatherOverviewShell`
  - owns generic layout: header, CTA, provider controls, map slot, selected preview slot, degraded/empty/loading states
  - should not know about Veðurstofan-specific fields except through provider config/render props

- `WeatherOverviewProviderConfig` or similar
  - `id`
  - `label`
  - `statusLabel`
  - `enabled`
  - `visible`
  - marker list
  - selected marker renderer or preview component
  - optional degraded/error state

- `WeatherOverviewMarker`
  - provider-neutral marker fields: id, providerId, label, lat, lon, status/severity, title, subtitle, distance if available, raw/provider payload if needed

- `VedurstofanOverviewProvider` / adapter
  - fetches/receives current station endpoint data
  - maps stations into provider-neutral markers
  - renders Veðurstofan preview using existing station preview/pulse pieces

- `IcelandOverviewMap`
  - remains map-only/provider-neutral: route geometry, markers, selected marker id, marker click callback, viewport behavior
  - no direct feature-gate or provider-specific API logic inside the map component

If the existing components already map closely to this, do not rename everything just for purity. The important part is dependency direction: generic shell/map should not become Veðurstofan-specific.

## UI / Design Requirements

Read relevant `Design.md` sections before editing UI.

Must preserve:

- Mobile-first app feel.
- No horizontal overflow.
- No input/textarea zoom issues.
- No dead navigation during server/client loading.
- No cards inside cards.
- Compact operational UI, not a landing page/hero.
- Loading and degraded states must be visible enough that the product does not look broken.

The overview map should still feel like an overview of Iceland, not a travel route result screen.

## Exact Execution Plan

1. Read v431 review and inspect the current files touched by v430/v431.
2. Read the current overview route/component tree:
   - `/vedrid`
   - `/auth-mvp/vedrid`
   - `/auth-mvp/vedrid/elta-vedrid`
   - station endpoint usage
   - map and preview components
3. Identify the smallest extraction that makes the overview provider-neutral.
4. Implement the provider-neutral shell/contract.
5. Wire Veðurstofan through that contract.
6. Keep all route URLs working:
   - `/vedrid`
   - `/vedrid/ferdalagid`
   - `/auth-mvp/vedrid`
   - `/auth-mvp/vedrid/ferdalagid`
   - `/auth-mvp/vedrid/elta-vedrid` as compatibility/legacy wrapper if it still exists
7. Ensure provider-off/restricted/error cases degrade gracefully.
8. Run focused verification.
9. Stop and write handoff. Do not proceed into Vegagerðin or route-cache phases.

## Stop Conditions

Stop and return a handoff instead of pushing through if:

- The extraction requires changing the travel-weather computation contract.
- You discover two competing sources of truth for weather access that cannot be resolved locally.
- Any change would require SQL, RLS, grants, migration, env, Vercel, deploy, or production data.
- The provider-neutral shell would force a large redesign of `/vedrid`.
- Tests fail for reasons that look unrelated to this work.
- You need to edit files that are clearly mid-edit by another agent and not part of this step.

## Suggested Verification

Run at minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts
```

If touched files have existing focused tests, run those too. If route/component tests exist for `/vedrid`, overview routing, or provider access, include them.

Do not run full browser automation unless already available and cheap. Stebbi handles localhost/manual browser checks.

## Localhost Checks For Stebbi

After Claude implementation, Stebbi should test:

1. Public overview:
   - open `http://localhost:3004/vedrid`
   - expected: overview loads, Iceland map shows, Veðurstofan layer appears if provider access is globally open locally, travel-weather CTA is visible

2. Public trip weather:
   - open `http://localhost:3004/vedrid/ferdalagid`
   - calculate a normal route
   - expected: existing trip-weather flow still works, no regression in route choice, scrubber, summary, worst/selected/all-point cards

3. Auth overview:
   - log in and open `http://localhost:3004/auth-mvp/vedrid`
   - expected: auth shell opens overview, hamburger works, no redirect loop, same overview behavior with auth chrome

4. Auth trip weather:
   - open `http://localhost:3004/auth-mvp/vedrid/ferdalagid`
   - expected: saved/auth-specific weather features still work

5. Provider access toggle:
   - with `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`, test a user without provider access
   - expected: overview still renders, but Veðurstofan layer is hidden or gracefully unavailable
   - with provider access/global access, expected: Veðurstofan layer appears

6. Mobile layout:
   - test around 390px and 546px width
   - expected: no horizontal overflow, no too-large controls, no map/header overlap, selected station preview remains usable

Do not test production, Vercel env, SQL, RLS, or deployment as part of this step.

## Suggested Prompt For Claude Code

```text
Workflow.

Please continue from:
- 2026-07-17-1445-todo-086-v431-codex-v430-middleware-stations-review.md
- 2026-07-17-1448-todo-086-v432-codex-b3c-provider-neutral-overview-shell.md

Task: implement B3C as a bigger but bounded step.

Goal:
Make the `/vedrid` overview architecture provider-neutral, with Veðurstofan as the first provider layer, so Vegagerðin can later plug into the same overview shell without duplicating map/preview/filter/loading/error logic.

Rules:
- First review the plan critically. If you find a blocker or product decision needed, stop and hand off.
- If no blocker, implement only the bounded B3C scope.
- Do not commit, push, deploy, run SQL, write migrations, change env, change Vercel, or touch production.
- Do not implement Vegagerðin yet.
- Do not refactor met.no/travel computation, Púls/chat-core, route-cache/heatmap, Vík/Reynisfjall deferred issue, or Öxi south-coast deferred issue.
- Read relevant `Design.md` sections before UI edits.

Implementation scope:
1. Keep the exact middleware public-stations fix from v430/v431 intact.
2. Extract or firm up a provider-neutral weather overview shell/contract.
3. Keep `IcelandOverviewMap` provider-neutral.
4. Wire Veðurstofan through the provider contract as the first provider.
5. Preserve current route behavior:
   - `/vedrid` = public overview
   - `/vedrid/ferdalagid` = public trip weather
   - `/auth-mvp/vedrid` = auth overview
   - `/auth-mvp/vedrid/ferdalagid` = auth trip weather
   - `/auth-mvp/vedrid/elta-vedrid` remains compatibility/back-link surface if still needed
6. Provider unavailable/restricted/off must degrade gracefully while the overview still renders.
7. No manual refresh button for public users.

Verification:
- Run `npm run type-check`
- Run focused tests at minimum:
  `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`
- Run any additional focused tests directly affected by the extraction.

After implementation, stop and create a handoff in `ai-handoff/` with:
- plan
- what changed
- files inspected
- files changed
- commands and exit codes
- risks
- skipped items
- next step
- Localhost checks for Stebbi
```
