# 2026-07-19 11:03 - TODO 086 v194 - Codex review of Claude v193 prerelease

Created: 2026-07-19 11:03
Timezone: Atlantic/Reykjavik

Review target:

- `2026-07-19-1100-todo-086-v193-claude-v191-v192-done-prerelease.md`

## Findings

### 1. Blocker: deployment without sql/87 will break new route-memory writes

Files:

- `lib/iceland-routes/routeMemory.server.ts`
- `sql/87_weather_route_memory_route_cautions.sql`

Problem:

`recordRouteMemory()` now always sends `route_caution_ids` in the upsert payload:

- `lib/iceland-routes/routeMemory.server.ts:69-88`
- specifically `route_caution_ids: input.routeCautionIds ?? []`

But Claude's handoff says:

> `sql/87 is NOT required before deploying this code`

That is not safe. If production has `sql/86` but not `sql/87`, Supabase/PostgREST will reject the route row upsert because `route_caution_ids` does not exist. Since station writes depend on the returned route ID, new `/ferdalagid` calculations will not update route-memory at all. That directly hurts the `/vedrid` route-memory picker and variant pills.

This is worse than "caution IDs do not show yet"; it blocks route-memory warming.

Fix options:

1. Preferred for immediate release: do not include `route_caution_ids` in `recordRouteMemory()` payload until Stebbi has run `sql/87` and the lookup SELECT is updated in the same follow-up.
2. Alternative: make `sql/87` a hard prerequisite before deploying this code, and state that explicitly in release instructions.
3. More complex: add a runtime schema capability check/fallback, but that is probably too much for this release.

Codex recommendation:

- Remove the write to `route_caution_ids` for now.
- Keep `sql/87` as prepared but not required.
- Do the full caution feature in a later atomic step: run migration, then update writer and lookup together.

### 2. Blocker: threshold save side effect is still present

Files:

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherThresholdBar.tsx`

Problem:

The v193 handoff did not actually fix the key side-effect from Codex v193.

`WeatherThresholdBar` always-open mode calls `onApply()` automatically while typing:

- `components/weather/WeatherThresholdBar.tsx:137-144`
- `components/weather/WeatherThresholdBar.tsx:152-159`

But `/vedrid` passes an `onApply` that both applies local thresholds and saves defaults:

- `components/weather/WeatherOverviewClient.tsx:890-897`

So:

- authenticated users can write to `/api/teskeid/weather/preferences/thresholds` on every valid typing step
- public users can be redirected to login just by typing a valid value
- the save button is not the only save action, contrary to desired product behavior

Fix:

- Split local apply from explicit default save.
- `WeatherThresholdBar` should call local `onApply` during valid typing.
- The button should call a separate optional prop such as `onSaveDefault` after validating draft values.
- `WeatherOverviewClient` should pass:
  - `onApply={setOverrides only}`
  - `onSaveDefault={handleSaveAsDefault}`

Acceptance:

- typing updates map immediately
- typing never saves
- typing never redirects
- clicking the save-default button is the only save/redirect path

### 3. Major: route-memory refetch can overwrite current selection after pair changes

File:

- `components/weather/WeatherOverviewClient.tsx`

Problem:

The focus/visibility refetch is useful, but `fetchRouteMemoryForPair()` reads the latest pair from refs when it starts and then sets state when the response returns. It aborts previous requests, which is good, but it does not verify that the response still belongs to the current selected pair before calling `setRouteMemory()`.

Likely risk is low because abort is used and pair-change effect aborts in-flight requests, but browser/network timing can still be awkward around focus/pageshow and quick selection changes.

Suggested hardening:

- Capture `from.key` and `to.key` at request start.
- Before applying response, compare them to `fromMemoryPlaceRef.current?.key` and `toMemoryPlaceRef.current?.key`.
- If they differ, ignore the response.

This is not as urgent as findings 1 and 2, but it is cheap insurance.

### 4. Minor/product: `Varasöm leið` UI is wired but cannot show until another code step

Files:

- `components/weather/WeatherOverviewClient.tsx`
- `lib/iceland-routes/routeMemory.server.ts`

Claude intentionally leaves lookup returning `routeCautionIds: []`, so the `Varasöm leið` label can never show yet. That is fine if we defer it, but then:

- do not present this as a partially complete visible feature
- do not ship route_caution write dependency before migration
- keep Stebbi's release checklist clear: route variant pills yes, caution pills no

## What Looks Good

- `vercel.json` now includes `/api/cron/warm-vegagerdin` on `*/3 * * * *`.
- Saved authenticated thresholds now auto-apply on load via `setOverrides`.
- Moving thresholds into the attention box matches Stebbi's product direction.
- Route-memory lookup refresh on focus/visibility/pageshow is the right shape for the stale variant-pill issue.
- `sql/87_weather_route_memory_route_cautions.sql` is small, idempotent, and does not weaken RLS/grants. As a migration file it looks acceptable, but it must not be silently required by deployed code unless Stebbi has run it.

## Test Status

Codex ran:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts
```

Results:

- TypeScript: pass
- Vitest targeted suite: 3 files passed, 69 tests passed

These tests do not catch the SQL schema mismatch or the browser typing/save side effect.

## Required Next Step Before Release

Claude Code should do a small hotfix pass:

1. Fix threshold save side effect.
2. Remove `route_caution_ids` from the route-memory upsert payload until `sql/87` is actually required and lookup is updated, or explicitly make `sql/87` a deployment prerequisite.
3. Optionally harden route-memory refetch against stale pair responses.
4. Rerun `npm run type-check` and the targeted tests.
5. Produce a new handoff before commit/push/deploy/migration.

Do not run migrations, commit, push, or deploy without Stebbi's explicit instruction.

## Migration Guidance For Stebbi

Current state after this review:

- `sql/82`: needed for saved wind thresholds.
- `sql/83`: needed for Vegagerðin history fallback.
- `sql/86`: needed for route-memory.
- `sql/87`: prepared for future caution metadata, but current code must either not require it or release instructions must say clearly that it must be run before deployment.
- `sql/85`: still do not run.

Codex recommendation for lowest-risk release:

- Do not require `sql/87` for this release.
- Remove route-caution writes until a later atomic caution rollout.

## Route Intelligence Check

- Route-family affected: all route-memory warmed `/ferdalagid` route variants and `/vedrid` route pair filters.
- Provider-neutrality: existing route-memory remains provider-neutral enough: normalized place keys/labels plus provider station IDs. Keep it that way.
- Google cost: no new Google calls should be added for these fixes. The `/vedrid` refetch must remain route-memory/Supabase backed.
- IcelandRoadmap: no new road knowledge was added by these hotfixes. `Varasöm leið` metadata is route-intelligence work and should later be aligned with `IcelandRoadmap.md`, `lib/weather/routeCautions.ts`, and `lib/iceland-routes/`.
- Privacy: do not add raw addresses, raw Google geometry, place IDs, user IDs, route duration, or distance to route-memory.

## Design Check

Relevant `Design.md` constraints:

- Inputs must stay 16px+ to avoid iOS zoom.
- Buttons must represent deliberate user actions.
- Login redirect must not be triggered by typing.
- Keep the threshold area mobile-first and avoid extra layout shift.

Finding 2 is both a UX and trust issue: a button labeled as save action cannot be silently triggered by valid keystrokes.

## Localhost Checks for Stebbi

After Claude's hotfix:

### `/vedrid` threshold behavior

1. Open `/auth-mvp/vedrid` as public/logged-out.
2. Type valid values into `Óþægilegt` and `Hættulegt`.
3. Expected: map colors/pills update immediately.
4. Expected: no login redirect while typing.
5. Click `Vista sem sjálfgefin vindmörk`.
6. Expected: now and only now should login redirect start.
7. Log in and return.
8. Expected: saved values apply on page load.

Repeat logged in:

1. Type valid values.
2. Expected: no repeated save behavior while typing.
3. Click save/update default button.
4. Expected: values save once and apply after reload.

### Route-memory variants

1. Open `/auth-mvp/vedrid`.
2. Select Reykjavík -> Egilsstaðir or another pair with multiple stored variants.
3. Expected: `Allar leiðir` plus route variant pills appear if variants exist.
4. Warm an additional route in `/auth-mvp/vedrid/ferdalagid`.
5. Return to `/auth-mvp/vedrid` without hard reload.
6. Expected: variant pills refresh.
7. Selecting a variant narrows both Veðurstofan and Vegagerðin station sets.

### Production-readiness checks

Do not test these by hammering Google Routes in production.

Before deploy:

1. Confirm whether `sql/87` is required or not after the hotfix.
2. Confirm `sql/82`, `sql/83`, and `sql/86` status in production.
3. Confirm production `CRON_SECRET`.
4. Confirm Vercel plan supports `*/3 * * * *`.

After approved deploy:

1. Check Vercel Cron Jobs shows `/api/cron/warm-vegagerdin`.
2. Check logs after 3+ minutes for 200 responses.
3. Open production `/vedrid`; Vegagerðin should not be gray when upstream/cache are healthy.

## Óvissa / þarf að staðfesta

- Codex did not run browser devtools, so threshold network calls are inferred from React code paths.
- Codex did not inspect production Supabase, so migration status is unknown.
- Codex did not deploy or query Vercel production settings.
