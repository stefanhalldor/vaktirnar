# TODO 086 v068 - Codex review of v067 sql/74 Veðurstofan product tables

Created: 2026-07-13 07:54
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-0751-todo-086-v067-claude-sql74-vedurstofan-product-tables.md`

## Findings

### P2 - Add explicit freshness/stale fields before running migration

`sql/74_vedurstofan_product_tables.sql:71-84` and `sql/74_vedurstofan_product_tables.sql:100-115`

The latest forecast/observation tables store `fetched_at`, and forecasts also store `atime` while observations store `obs_time`. That is useful, but it does not fully encode the cache-first contract Stebbi has been asking for: new/old/missing data, outage tolerance, and clear stale status.

Right now the app would have to infer freshness from hardcoded code rules. That can work, but since this migration has not been run yet it is safer to add explicit fields now, for example:

- `expires_at timestamptz` or `stale_after timestamptz`
- optionally `source_updated_at timestamptz` if we want one shared name across obs/forec
- optionally `last_fetch_status` / `stale_reason` later if per-station diagnostics matter

Minimum recommendation before running SQL/74:

- add `expires_at timestamptz` to `vedurstofan_forecasts_latest`
- add `expires_at timestamptz` to `vedurstofan_observations_latest`
- document whether UI freshness uses `expires_at`, `fetched_at`, `atime`, or `obs_time`

This keeps the product tables aligned with the cache/database-first architecture, instead of re-creating hidden TTL logic in app code.

### P2 - `weather_fetch_runs` is partly generic but uses Veðurstofan-specific fetch types

`sql/74_vedurstofan_product_tables.sql:125-144`

`weather_fetch_runs.source` allows both `'vedurstofan'` and `'metno'`, but `fetch_type` only allows `'obs'` and `'forec'`. Those are Veðurstofan-style concepts. MET/Yr currently uses locationforecast/grid forecasts, not `obs`/`forec`.

This weakens the “two separate weather systems” principle from v065/v066 because the generic table starts with provider-specific type names.

Recommended fix before running migration:

- If this table is only for Veðurstofan now: change `source` CHECK to only `'vedurstofan'`, or rename/comment it as Veðurstofan-specific.
- If it is intended to be generic: make `fetch_type` generic enough for MET/Yr too, e.g. include `'locationforecast'` or use `fetch_kind text NOT NULL` with a broader CHECK such as `('vedurstofan_obs', 'vedurstofan_forec', 'metno_locationforecast')`.

Do not let MET/Yr runs be stored as fake `forec` rows just to fit the table.

### P2 - Add static SQL regression tests for migration 74

`lib/__tests__/sql-migration.test.ts:1014-1045`

The existing migration tests cover `sql/67` and `sql/73`, but there are no static checks for `sql/74_vedurstofan_product_tables.sql` yet.

Before approving SQL/74, add tests that assert:

- all four tables are created
- transaction wrapper exists
- RLS is enabled on all four tables
- no `CREATE POLICY` is present
- `PUBLIC`, `anon`, and `authenticated` are revoked
- only `service_role` receives DML grants
- `mapping_status` CHECK matches registry values
- FK relationships point to `vedurstofan_stations(station_id)`
- `weather_fetch_runs` CHECK values match the intended source/fetch-type design

This project already has a good pattern for static SQL tests. SQL/74 is important enough to get the same guardrails.

### P3 - Confirm `type=obs` units before locking column names

`sql/74_vedurstofan_product_tables.sql:100-115`

The `type=obs` parser is not implemented yet. The observations table already bakes units into column names such as `visibility_m` and `precipitation_mm`.

That may be correct, but Claude Code should explicitly confirm the Veðurstofan XML units while implementing the parser. If `V` is not meters, or if `R` means a period-specific amount rather than the unit implied here, the column names will be misleading after the migration is run.

This is not a blocker if Claude Code confirms the units before parser work, but it is cheaper to correct naming before SQL/74 is run.

## What looks good

- RLS is enabled on all four new tables.
- There are no client/anon/authenticated policies.
- Access is service-role only, matching `weather_cache`.
- The tables are additive and do not touch existing tables.
- Rollback order is safe relative to FK dependencies.
- `vedurstofan_stations` matches the generated registry shape well.
- Keeping `weather_cache` as raw cache and these tables as product layer is the right direction.

## Verification run by Codex

Codex ran:

```bash
npm run test:run -- lib/__tests__/sql-migration.test.ts
```

Result:

- Exit code: 0
- 1 test file passed
- 159 tests passed

Important caveat: those tests do not yet cover SQL/74.

Codex did not run the migration and did not touch Supabase.

## Recommended next step for Claude Code

Do a small SQL/74 patch before Stebbi runs it:

1. Add explicit freshness fields, at minimum `expires_at`, to the latest data tables.
2. Decide whether `weather_fetch_runs` is Veðurstofan-only or truly generic, and make the CHECK values match.
3. Add static tests for SQL/74.
4. Rerun `npm run test:run -- lib/__tests__/sql-migration.test.ts`.
5. Rerun type-check if test file changes require it.

Do not run the migration, seed data, set up cron, or change production without separate explicit approval from Stebbi.

## Localhost checks for Stebbi

No browser localhost check is required before running SQL/74 because this migration only creates empty service-role tables and does not change current UI behavior.

Before approving the migration, Stebbi should check the SQL/review outcome instead:

1. Confirm SQL/74 has not been run yet.
2. Confirm Claude Code has addressed freshness/stale fields.
3. Confirm `weather_fetch_runs` does not blur MET/Yr and Veðurstofan source semantics.
4. Confirm static SQL tests for SQL/74 pass.

After the migration is eventually run with explicit approval:

1. Confirm all four tables exist in Supabase.
2. Confirm RLS is enabled.
3. Confirm there are no anon/authenticated policies.
4. Confirm existing `weather_cache`, `feature_access`, `/auth-mvp/vedrid`, and `/auth-mvp/vedrid/elta-vedrid` still work.

Do not casually test cron, seed jobs, production refresh, or parser jobs until those are separately implemented and approved.

## Bottom line

SQL/74 is directionally right and there is no obvious RLS/auth blocker.

Because it has not been run yet, Codex recommends one small pre-run patch: add explicit freshness fields, tighten/genericize `weather_fetch_runs`, and add static SQL tests. Then it should be much safer for Stebbi to run later.
