# TODO 086 v177 - Codex review of v176 provider-specific rename

Created: 2026-07-14 20:31
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2030-todo-086-v176-claude-v175-done-prerelease.md`

Mode:
- Review only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this review file.

## Findings

### Medium - `.env.example` does not document the new Veðurstofan provider kill switch

v176 changed the actual kill switch to `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`, and `lib/loans/guard.ts:85-88` now requires it to be exactly `true`.

But `.env.example:41-47` still documents only:
- `WEATHER_ENABLED`
- `WEATHER_FLAG`
- `WEATHER_TRIP_FLAG`
- `WEATHER_ELTA_VEDRID_FLAG`

There is no mention of `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.

Impact:
- Localhost checks in v176 tell Stebbi to add the new env var, but the canonical env example will not help the next agent or future setup.
- Vercel/env rollout can drift because the new flag is not listed next to the other weather flags.

Recommended fix:
- Add a commented `.env.example` line near the weather flags:

```txt
# WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true  # enable Veðurstofan travel-layer provider for users with weather-provider-vedurstofan access
```

Make it clear that unset/false means MET/Yr-only for that provider.

### Medium - Admin UI cannot grant/revoke `weather-provider-vedurstofan`, even though the admin API can

`app/api/admin/feature-access/route.ts:7` now allows `weather-provider-vedurstofan`, which is good.

But the admin page type/render list still excludes it:
- `app/(admin)/admin/page.tsx:164` union only includes `umonnun | tengsl | facebook-oauth | vedrid | ferdalagid | elta-vedrid`
- `app/(admin)/admin/page.tsx:1645-1668` renders sections only through `elta-vedrid`

Impact:
- Stebbi can technically grant via API or direct SQL after migration 76, but not through the existing admin UI.
- Since this provider is explicitly per-user gated, the lack of UI increases the chance of manual mistakes.

Recommended fix:
- Add `weather-provider-vedurstofan` to the admin page feature-key union.
- Render a `FeatureAccessSection` for it, probably near `elta-vedrid`, with `flagName="WEATHER_PROVIDER_VEDURSTOFAN_ENABLED"`.
- If Claude Code intentionally wants API-only for now, v176 handoff should say that clearly and give a safe one-line admin API example for Stebbi after migration approval.

### Low - Migration 76 filename and test heading still say `extra_weather_providers`

The SQL content is now provider-specific and correct:
- `sql/76_feature_access_extra_weather_providers.sql:1-24` adds `weather-provider-vedurstofan`, not `extra-weather-providers`.

But the filename still says `extra_weather_providers`, and `lib/__tests__/sql-migration.test.ts:1233` still describes `sql/76_feature_access_extra_weather_providers.sql`.

Impact:
- Not a runtime bug.
- It will be confusing later when Vegagerðin gets its own provider migration.

Recommended fix before commit:
- Rename the migration to something like `sql/76_feature_access_weather_provider_vedurstofan.sql`.
- Update the sql-migration test file path/describe text accordingly.

## What Looks Good

- The old generic `extra-weather-providers` and `WEATHER_EXTRA_PROVIDERS_FLAG` no longer appear in app code/tests, based on `rg`.
- `weather-provider-vedurstofan` is now provider-specific in:
  - `lib/loans/guard.ts`
  - travel route gate
  - manual refresh route gate
  - admin API allowlist
  - SQL constraint
  - tests
- `elta-vedrid` remains separate for the station explorer/validator route.
- The SQL migration does not touch grants, RLS, auth policies, or data rows.

## Tests / Commands Reviewed

Codex inspected:
- v176 handoff
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- `sql/76_feature_access_extra_weather_providers.sql`
- `.env.example`
- relevant tests for guard, feature-access API, travel API, and SQL migration

Codex did not run the test suite.

v176 reports "Tests (311 pass)" but does not include the exact commands or exit codes. Before release, Claude Code should include the command names and results in the next handoff, especially if this is going to production.

## Supabase / SQL Notes

- No SQL was run by Codex.
- Do not run migration 76 until Stebbi explicitly approves Supabase execution.
- If migration 76 is renamed, run/review the renamed file only.
- After migration approval/execution, grant users `weather-provider-vedurstofan`, not `extra-weather-providers`.

## Recommended Next Step For Claude Code

Small v178 cleanup before release:

1. Add `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` to `.env.example`.
2. Decide whether the existing admin page should support granting `weather-provider-vedurstofan`.
   - Codex recommends yes, because this is per-user gated.
3. Rename migration 76 from `extra_weather_providers` to `weather_provider_vedurstofan` and update tests.
4. Run targeted tests and type-check.
5. Do not run SQL, commit, push, or deploy without explicit Stebbi approval.

## Localhost Checks for Stebbi

After the cleanup:

1. Ensure `.env.local` has `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`.
2. Ensure the test user has `weather-provider-vedurstofan` access after migration 76 is approved and run.
3. Open `/auth-mvp/vedrid`.
4. Expected: Veðurstofan provider toggle/layer/manual refresh is available for that user.
5. Remove/revoke the user's `weather-provider-vedurstofan` access.
6. Expected: MET/Yr-only behavior; no Veðurstofan provider layer/manual refresh.
7. Set `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false` and restart localhost.
8. Expected: MET/Yr-only behavior even for a user with the per-user row.
9. Confirm `/auth-mvp/vedrid/elta-vedrid` remains separately gated by `elta-vedrid` + `WEATHER_ELTA_VEDRID_FLAG`.

Do not test Supabase migration, production env, Vercel, or production data casually. Those require explicit Stebbi approval.
