# 2026-07-19 11:18 - TODO 086 v198 - Codex review of Claude v197 prerelease

Created: 2026-07-19 11:18
Timezone: Atlantic/Reykjavik

Review target:

- `2026-07-19-1115-todo-086-v197-claude-v196-done-prerelease.md`

## Findings

### 1. Blocker: save-default button likely disappears exactly when user needs it

Files:

- `components/weather/WeatherThresholdBar.tsx`
- `components/weather/WeatherOverviewClient.tsx`

Problem:

`WeatherThresholdBar` always-open mode now shows the save button only when:

- draft values are valid
- draft values differ from the currently applied `thresholds`

See:

- `components/weather/WeatherThresholdBar.tsx:136-140`

But the always-open inputs still call `onApply()` immediately when values become valid:

- `components/weather/WeatherThresholdBar.tsx:150-157`
- `components/weather/WeatherThresholdBar.tsx:165-172`

On `/vedrid`, `onApply` updates applied thresholds via `setOverrides`:

- `components/weather/WeatherOverviewClient.tsx:895-904`

That means the normal flow is likely:

1. User types valid new value.
2. `onApply` immediately applies it.
3. Parent sends new `thresholds` prop.
4. `draftDiffersFromApplied` becomes false.
5. Save-default button is hidden.

So Stebbi may not be able to save the just-applied thresholds as defaults. This is a regression from the explicit-save fix.

Recommended fix:

- The save-default button should compare draft/current values against the saved default values, not against the currently applied session thresholds.
- Pass something like `savedDefaultThresholds` or `savedValues` into `WeatherThresholdBar`, or compute this in `WeatherOverviewClient`.
- If there are no saved defaults, show the save button when current valid thresholds differ from the built-in/default threshold baseline, or simply always show it when `onSaveDefault` is provided and values are valid.

Simplest product-safe option for release:

- In `/vedrid`, keep the save button visible whenever:
  - `onSaveDefault` is provided
  - draft values are valid
  - and either no saved defaults exist or draft values differ from saved defaults
- Do not compare to live `thresholds`, because live thresholds intentionally change while typing.

Acceptance:

- Typing valid thresholds updates the map.
- The save button remains available after valid typing.
- Clicking the save button saves/redirects once.
- After logged-in reload, saved defaults auto-apply.
- If saved defaults already equal the visible values, the save button can be hidden.

### 2. Minor: route dedupe only fixes curated duplicates, generic `Leið n` duplicates can remain

Files:

- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`

This is mostly expected and documented by Claude:

- curated variants are grouped by `CURATED_*` label
- non-curated variants are grouped by `routeVariantKey`

So screenshot duplicates like duplicate `Til að sleppa við Öxi` and duplicate `Um Hellisheiði` should collapse. Generic `Leið 3` / `Leið 5` may remain if they have unique route keys. That is acceptable for this release if Stebbi is okay with it.

Future improvement:

- collapse non-curated variants by station-set signature or IcelandRoadmap/control-point signature, but not before release unless the generic pills are still too noisy.

## What Looks Good

- `route_caution_ids` is still omitted from the upsert payload, so `sql/87` is not required by this release code.
- Dedupe is non-destructive and does not delete Supabase rows.
- Write-time stable key for curated labels should prevent new curated duplicates.
- The dedupe test coverage is good for the current intended behavior.
- `vercel.json` still includes `warm-vegagerdin` cron.

## Test Status

Codex ran:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts
```

Results:

- TypeScript: pass
- Vitest targeted suite: 3 files passed, 76 tests passed

These tests do not cover the browser/UI interaction where the save button disappears after instant apply.

## Required Next Step Before Release

Claude Code should do one small hotfix:

1. Fix the save-default button visibility logic so it does not compare draft values to already-applied session thresholds.
2. Prefer comparing against saved defaults, or show the save button whenever valid values can be saved.
3. Add a small unit/component-level test if feasible; otherwise handoff should call out exact localhost check.
4. Rerun type-check and targeted tests.

Do not run migrations, commit, push, deploy, or production changes without Stebbi's explicit instruction.

## Migration Guidance

Current state:

- `sql/82`: required for saved wind thresholds.
- `sql/83`: required for Vegagerðin history fallback.
- `sql/86`: required for route-memory picker/filtering and variant pills.
- `sql/87`: additive and safe to run after `sql/86`, but not required by current release code.
- `sql/85`: do not run.

No destructive route cleanup SQL is needed for v197 because dedupe is read-time and write-time canonicalization only.

## Route Intelligence Check

- Route-family affected: `/vedrid` route-memory variants, especially curated route alternatives such as `CURATED_AVOID_OXI` and `CURATED_VIA_HELLISHEIDI`.
- Provider-neutrality: current dedupe is mostly provider-neutral and uses Teskeið semantic labels. This is acceptable for Phase 1.
- Google cost: no new Google calls.
- Privacy: no raw Google geometry, raw addresses, user IDs, duration, or distance added.
- IcelandRoadmap: no new route knowledge was added, just dedupe behavior. If non-curated route signatures are added later, update `IcelandRoadmap.md` or `lib/iceland-routes/` accordingly.

## Design Check

Relevant `Design.md` points:

- Buttons must be clear, deliberate actions.
- A save button should not vanish as a side effect of the same typing that makes values valid.
- Inputs remain text-base, good for iOS/mobile zoom.
- Route pills are less cluttered after curated dedupe, which improves mobile scanning.

## Localhost Checks for Stebbi

After Claude's next hotfix:

### Save-default button

1. Open `/auth-mvp/vedrid`.
2. Start with no saved defaults or known saved defaults.
3. Change `Óþægilegt` from `10` to another valid value, for example `9`.
4. Expected: map updates immediately.
5. Expected: save-default button remains visible after the value is applied.
6. Click save-default button.
7. Public user expected: redirect to login only on click.
8. Logged-in expected: save happens only on click.
9. Reload logged in.
10. Expected: saved thresholds auto-apply and the button can be hidden if visible values equal saved defaults.

### Route variant dedupe

1. Open `/auth-mvp/vedrid`.
2. Select Reykjavík -> Egilsstaðir.
3. Expected:
   - `Til að sleppa við Öxi` appears once.
   - `Um Hellisheiði` appears once.
   - `Allar leiðir` appears once.
4. Generic `Leið n` pills may remain if they represent unique non-curated variants.
5. Click each pill and confirm the map filters to that variant.

### Production readiness

Before production deploy:

1. Confirm `sql/82`, `sql/83`, `sql/86` are run.
2. Confirm whether Stebbi has run `sql/87`; it is not required by code but safe after `sql/86`.
3. Confirm Vercel plan supports `*/3 * * * *`.
4. Confirm production `CRON_SECRET`.
5. Do not hammer Google Routes in production to create test rows.

## Óvissa / þarf að staðfesta

- Codex did not run browser devtools; finding 1 is inferred from React state/prop flow.
- Codex did not inspect actual Supabase route-memory rows, so generic `Leið n` behavior still needs Stebbi localhost confirmation.
