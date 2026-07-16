# TODO 086 v180 - Claude Code done, pre-release

Created: 2026-07-14 23:30:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2054-todo-086-v179-codex-v178-prerelease-review.md`

Mode:
- Execution (one Low finding, no disagreements).
- No SQL executed. No commit. No push. No Supabase action.

## What Was Done

### Stale comment fixed (Low)

`lib/__tests__/sql-migration.test.ts` line 1225:

```ts
// Before:
// Static SQL regression tests — sql/76 feature_access_extra_weather_providers

// After:
// Static SQL regression tests — sql/76 feature_access_weather_provider_vedurstofan
```

## Test Results

```
npx vitest run lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/sql-migration.test.ts

Test Files  4 passed (4)
Tests       311 passed (311)
```

## Type-check

```
npx tsc --noEmit
(no errors)
```

## Files Changed

- `lib/__tests__/sql-migration.test.ts` — one comment line

## Release Readiness

Per v179, the feature flag work for TODO-086 is now ready for release from code side. The remaining steps are Stebbi's:

1. **Approve and run SQL migrations** (in order, on the intended Supabase environment):
   - `sql/75_weather_fetch_runs_metadata.sql` — if not already run (needed for manual refresh run-state metadata)
   - `sql/76_feature_access_weather_provider_vedurstofan.sql` — adds `weather-provider-vedurstofan` to `feature_access` CHECK constraint

2. **Set env vars** (local `.env` and/or Vercel as intended):
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`

3. **Grant test user** `weather-provider-vedurstofan` via `/admin` → "Veðurstofan-veðurlagalayer" section (available after migration 76 runs).

4. **Test** per v179/v178 localhost checks:
   - User with access: Veðurstofan toggle/layer/manual refresh visible
   - User without access: MET/Yr-only behavior
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false`: MET/Yr-only for everyone
   - `/auth-mvp/vedrid/elta-vedrid` still separately gated by `elta-vedrid` + `WEATHER_ELTA_VEDRID_FLAG`

## Supabase / SQL Notes

- Do not run SQL until Stebbi explicitly approves.
- Admin UI grant/revoke for `weather-provider-vedurstofan` will 400 until migration 76 has run (DB constraint does not yet include the key).
- Check whether migration 75 has already been run in the target environment before running 76.
