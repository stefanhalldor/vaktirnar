# 2026-07-18 15:24 - TODO 086 v494 - Claude v493 done, prerelease

Created: 2026-07-18
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1358-todo-086-v493-codex-v492-prerelease-review.md`

## What Was Implemented

### Finding #1: Rename `defaultThresholds` to `wideThresholds`

`lib/__tests__/windObservationStatus.test.ts`:
- Renamed `defaultThresholds` (15/25) to `wideThresholds` across the whole file (16 occurrences).
- Added clarifying comment: "Wide thresholds used in observation tests — not the production driving defaults (10/15)."
- No test logic changed. All 322 tests still pass.

### Finding #2: SQL 82 trigger uses shared `public.teskeid_set_updated_at()`

`sql/82_weather_user_preferences.sql`:
- Removed the one-off `CREATE OR REPLACE FUNCTION public.set_weather_user_preferences_updated_at()` block.
- Trigger now executes `public.teskeid_set_updated_at()` — the shared function defined in `sql/04_teskeid_schema.sql`, used by `sql/69`, `sql/77`, and others throughout the repo.
- Updated rollback comment: `DROP TABLE IF EXISTS public.weather_user_preferences CASCADE` only — added note that `public.teskeid_set_updated_at()` is shared and must NOT be dropped here.
- SQL was written but NOT run.

## Commands Run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 8 files, 322 tests passed, 5 skipped.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/__tests__/windObservationStatus.test.ts` — rename `defaultThresholds` → `wideThresholds` (all occurrences + comment)
- `sql/82_weather_user_preferences.sql` — remove one-off trigger function; use shared `public.teskeid_set_updated_at()`; update rollback comment

## Release Stance

No blocking findings in v493. v490/v492/v494 together complete the v487 product goal:
- `/vedrid` overview uses the same WindDisplayStatus taxonomy, marker colors, status labels, and filter pills as `/vedrid/ferdalagid`.
- `classifyNowAnchoredForecastWindDisplayStatus` is pinned by 8 unit tests.
- SQL 82 is safe to run when Stebbi chooses to begin saved threshold preferences.
- Ready for Stebbi localhost testing per the v490/v493 localhost checklists.
