# TODO 086 v178 - Claude Code done, pre-release

Created: 2026-07-14 23:00:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2031-todo-086-v177-codex-v176-prerelease-review.md`

Mode:
- Execution (no disagreements with Codex v177 findings — three focused cleanup items with clear recommendations).
- No SQL executed. No commit. No push. No Supabase action.

## What Was Done

### Item 1 — `.env.example` documents new kill switch (Medium)

Added two lines after `WEATHER_ELTA_VEDRID_FLAG`:

```
# WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true  # enable Veðurstofan travel-layer provider for users with weather-provider-vedurstofan access
                                             # if unset or false: MET/Yr only, even if user has the per-user access row
```

### Item 2 — Admin UI can grant/revoke `weather-provider-vedurstofan` (Medium)

`app/(admin)/admin/page.tsx`:
- Added `'weather-provider-vedurstofan'` to `FeatureAccessSectionProps.featureKey` union.
- Added `FeatureAccessSection` render below the `elta-vedrid` section:

```tsx
<FeatureAccessSection
  featureKey="weather-provider-vedurstofan"
  heading="Veðurstofan-veðurlagalayer"
  flagName="WEATHER_PROVIDER_VEDURSTOFAN_ENABLED"
/>
```

### Item 3 — Migration 76 renamed (Low)

`sql/76_feature_access_extra_weather_providers.sql` → `sql/76_feature_access_weather_provider_vedurstofan.sql`

File contents were already correct (uses `weather-provider-vedurstofan`). Only the filename was stale.

Test path updated in `lib/__tests__/sql-migration.test.ts` accordingly.

## Test Results

```
npx vitest run lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/sql-migration.test.ts

Test Files  4 passed (4)
Tests       311 passed (311)
```

## Files Changed

- `.env.example` — new kill-switch documented
- `app/(admin)/admin/page.tsx` — union + section render
- `sql/76_feature_access_weather_provider_vedurstofan.sql` — renamed from `76_feature_access_extra_weather_providers.sql`
- `lib/__tests__/sql-migration.test.ts` — path updated

## What Was Not Changed

- No application logic changed — this was documentation, UI, and filename only.
- SQL migration not executed — requires Stebbi's explicit Supabase approval.
- No env vars set in `.env` or Vercel.
- `elta-vedrid` and `WEATHER_ELTA_VEDRID_FLAG` untouched.

## Localhost Checks for Stebbi (per v177)

1. Add `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` to local `.env`.
2. After migration 76 is run on Supabase (explicit approval needed), grant test user `weather-provider-vedurstofan` via the admin page at `/admin` under "Veðurstofan-veðurlagalayer".
3. Open `/auth-mvp/vedrid` — Veðurstofan toggle/layer/manual refresh should be available for that user.
4. Remove user's `weather-provider-vedurstofan` access via admin UI — MET/Yr-only expected.
5. Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false` — MET/Yr-only for everyone even with per-user row.
6. Confirm `/auth-mvp/vedrid/elta-vedrid` still governed by `elta-vedrid` + `WEATHER_ELTA_VEDRID_FLAG`.

## Supabase / SQL Notes

- Run `sql/76_feature_access_weather_provider_vedurstofan.sql` only after Stebbi explicitly approves.
- After migration runs, grant users via admin UI "Veðurstofan-veðurlagalayer" section (not the old `extra-weather-providers` name).
- Old filename `76_feature_access_extra_weather_providers.sql` no longer exists in the repo.
