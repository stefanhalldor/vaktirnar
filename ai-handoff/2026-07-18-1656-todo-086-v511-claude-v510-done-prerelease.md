# 2026-07-18 16:56 - TODO 086 v511 - Claude v510 done, prerelease

Created: 2026-07-18 16:56
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1647-todo-086-v510-codex-v509-review-before-v505-v506.md`

## SQL

Nothing run. `sql/83_vegagerdin_measurements_history.sql` comment updated (not run).

## What Was Implemented

### Medium: Exact-batch history fallback query

`lib/weather/providers/vegagerdinCurrent.server.ts`:
- Removed `HISTORY_BATCH_WINDOW_MS` constant (no longer needed)
- `readVegagerdinCurrentFromHistory()`: second DB query changed from `.gte('last_fetched_at', batchCutoffIso)` to `.eq('last_fetched_at', newestRow.last_fetched_at)`
- This is safe because `upsertVegagerdinHistory()` writes the same `fetchedAtIso` to all rows in a single call. Exact equality reliably selects one batch without mixing in adjacent cron runs.
- Also removed the now-unused `newestMs` / `batchCutoffIso` intermediate variables.

### Low: Stale comment fixes

`sql/83_vegagerdin_measurements_history.sql` top comment:
- "Reads the newest measured_at batch (within a 10-minute window)" → "Reads all rows from the newest fetch batch by last_fetched_at (exact match), no older than 24 hours."

`app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts` JSDoc:
- "validated against the live Vegagerðin current-measurement cache" → "validated against the Vegagerðin cache/history current-measurement snapshot"
- "Returns [] if cache is unavailable" → "Returns [] if cache+history is unavailable"
- "stationId does not map to a known station in cache" → "stationId does not map to a known Vegagerðin station in the current snapshot"

### Low: Test query-contract hardening

`lib/__tests__/vegagerdin-history.test.ts` -- Supabase mock chain now exposes named mock functions (`gteCutoffFn`, `orderFn`, `eqBatchFn`) for assertion. New and updated tests:

- **"queries history by last_fetched_at (not measured_at) for newest batch anchor"**: asserts `gteCutoffFn` was called with `'last_fetched_at'`, `orderFn` was called with `'last_fetched_at'`, and `eqBatchFn` was called with `'last_fetched_at', BATCH_FETCH_AT`. This test would fail if someone reverted to `measured_at` filtering.
- **"uses exact last_fetched_at match so older cron batches are not mixed in"**: asserts `.eq('last_fetched_at', BATCH_FETCH_AT)` is the second query call, not `.gte`. Only newest batch rows returned.
- Existing fallback/unavailable/fresh-cache tests preserved.

## Commands Run

```
npm run type-check
```
Exit 0.

```
npx vitest run lib/__tests__/vegagerdin-history.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts
```
Exit 0. 289 passed.

```
npx vitest run
```
Exit 0. 109 test files, 3215 passed, 27 skipped, 0 failed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/weather/providers/vegagerdinCurrent.server.ts` — removed `HISTORY_BATCH_WINDOW_MS`, changed second history query to `.eq('last_fetched_at', ...)`
- `sql/83_vegagerdin_measurements_history.sql` — corrected top comment (NOT run)
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts` — updated JSDoc comments
- `lib/__tests__/vegagerdin-history.test.ts` — query-contract assertions, two new regression tests

## Next Steps

Vegagerðin history fallback is now complete and closed. Ready for:
1. v505: 3h forecast scrubber on `/vedrid`
2. v506: `sql/84_metno_point_forecasts_history.sql`
