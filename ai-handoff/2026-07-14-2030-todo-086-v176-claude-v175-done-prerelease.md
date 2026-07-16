# TODO 086 v176 - Claude Code done, pre-release

Created: 2026-07-14 22:30:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2021-todo-086-v175-codex-v174-key-decision-review.md`

Mode:
- Execution (Codex said "Claude Code should implement option A from v174" with explicit file list, no deviation).
- No SQL executed. No commit. No push. No Supabase action.

## What Was Done

Pure rename — option A from v174/v175.

| Before | After |
|---|---|
| feature key: `extra-weather-providers` | `weather-provider-vedurstofan` |
| env kill switch: `WEATHER_EXTRA_PROVIDERS_FLAG` | `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` |

### Files changed

Application code:
- `lib/loans/guard.ts` — renamed key + env var
- `app/api/teskeid/weather/travel/route.ts` — renamed key
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts` — renamed key (2 occurrences: gate + comment)
- `app/api/admin/feature-access/route.ts` — renamed in `ALLOWED_FEATURES`

SQL (not run):
- `sql/76_feature_access_extra_weather_providers.sql` — rewritten to add `weather-provider-vedurstofan` instead of `extra-weather-providers`; comment updated to explain provider-specific naming rationale

Tests (311 pass):
- `lib/__tests__/guard.test.ts` — key + env var renamed throughout
- `lib/__tests__/feature-access-api.test.ts` — key renamed throughout
- `lib/__tests__/weather-travel-api.test.ts` — key + env var renamed throughout
- `lib/__tests__/sql-migration.test.ts` — key + regex pattern renamed

## What Was Not Changed

- `elta-vedrid` — untouched, still gates station validator/explorer route
- `WEATHER_ELTA_VEDRID_FLAG` — untouched
- `WEATHER_ENABLED` — untouched
- SQL migration 76 not executed — requires Stebbi's explicit Supabase approval
- No env vars set in `.env` or Vercel

## Future provider naming (per v173/v175)

When Vegagerðin is ready:
- feature key: `weather-provider-vegagerdin`
- env kill switch: `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`
- SQL migration: separate file widening the constraint to include `weather-provider-vegagerdin`

## Localhost Checks for Stebbi (per v175)

1. Add `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` to local `.env`.
2. Grant `weather-provider-vedurstofan` access to test user (via admin API or directly in `feature_access` after running migration 76).
3. Open `/auth-mvp/vedrid` — Veðurstofan toggle/layer/manual refresh should be available.
4. Remove user's `weather-provider-vedurstofan` row — MET/Yr-only behavior expected.
5. Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false` — MET/Yr-only for everyone, even if per-user row exists.
6. Confirm `/auth-mvp/vedrid/elta-vedrid` still works independently under `elta-vedrid` + `WEATHER_ELTA_VEDRID_FLAG`.

## Supabase / SQL Notes

- Run `sql/76_feature_access_extra_weather_providers.sql` only after Stebbi explicitly approves Supabase execution.
- After migration 76 runs, grant test user the new key name `weather-provider-vedurstofan` (not the old `extra-weather-providers`).
