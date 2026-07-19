# 2026-07-18 16:23 - TODO 086 v507 - Claude v504 done, prerelease

Created: 2026-07-18 16:23
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1553-todo-086-v504-codex-v503-review-and-vegagerdin-cache-history.md`

Context also covered in session (earlier work, already in v503 prerelease handoff):
- `no_wind_data` WindDisplayStatus for Vegagerðin stations with no wind sensor
- `classifyNowAnchoredForecastWindDisplayStatus` for Veðurstofan overview markers
- `WindStatusFilterPills` on overview map via `renderBelowMap`
- `visibleStatuses` shared filter state, `overviewStatusCounts`
- SQL 82 hardened (idempotent), SQL 83 written

## SQL

Nothing run. No SQL was run in this session.

SQL 82 and SQL 83 are written and awaiting Stebbi to run them manually.

## What Was Implemented

### Vegagerðin cache/history reliability

Full implementation of the history fallback system described in v504.

#### `lib/weather/providers/vegagerdinCurrent.server.ts`

New constants:
- `HISTORY_MAX_AGE_MS = 24h` — how far back to look in history table
- `HISTORY_BATCH_WINDOW_MS = 10min` — width of the "most recent batch" window

New exported type:
- `VegagerdinHistoryDbRow` — mirrors the select columns from `vegagerdin_measurements_history`

New exported function:
- `buildPayloadFromHistoryRows(rows)` — maps history DB rows to `VegagerdinCachePayload`. Deduplicates by `station_id` (keeps newest `measured_at`). Computes `oldestMeasuredAtIso` and `fetchedAtIso` (oldest across rows). Returns null for empty input. Exported for unit testing.

New private function:
- `upsertVegagerdinHistory(measurements, fetchedAtIso)` — upserts into `vegagerdin_measurements_history`. Does NOT include `first_fetched_at` in the row object so the DB DEFAULT fires on insert and is preserved on conflict. Returns `{ ok: boolean }`. Never throws.

New private function:
- `readVegagerdinCurrentFromHistory()` — finds the newest `measured_at` within the 24h window, then fetches all rows within a 10min batch of that timestamp. Returns `{ status: 'stale', cacheStatus: 'history_fallback', measurementFreshness, payload }`.

New exported function:
- `readVegagerdinCurrentWithHistoryFallback()` — tries cache first (via `readVegagerdinCurrentFromCache`); falls back to `readVegagerdinCurrentFromHistory` only when cache is `unavailable`. This is the intended entry point for user-facing routes.

Updated `FetchVegagerdinResult` ok variant:
- Added `historyStatus: 'ok' | 'failed'` (non-blocking; history failure does not fail the fetch)

Updated `fetchVegagerdinCurrent()`:
- After successful cache write, calls `upsertVegagerdinHistory(measurements, fetchedAtIso)`
- Returns `historyStatus` in the ok result

`VegagerdinCurrentResult` type (already updated in prior session):
- `stale` variant now accepts `cacheStatus: 'stale' | 'history_fallback'`

#### `app/api/teskeid/weather/vegagerdin/current/route.ts`

- Changed import from `readVegagerdinCurrentFromCache` to `readVegagerdinCurrentWithHistoryFallback`
- Changed call accordingly

#### `app/api/cron/warm-vegagerdin/route.ts`

- Added `historyStatus: result.historyStatus` to the ok response JSON (diagnostic field, safe to expose in cron-only route)

### Tests

#### `lib/__tests__/weather-vegagerdin-current-api.test.ts`

- Renamed `mockReadCache` → `mockReadCurrent` (16 occurrences)
- Updated mock target: `readVegagerdinCurrentFromCache` → `readVegagerdinCurrentWithHistoryFallback`
- Added test: `history_fallback cacheStatus` — verifies that a `cacheStatus: 'history_fallback'` result from the provider is passed through correctly to the API response

#### `lib/__tests__/vegagerdin-history.test.ts` (new)

8 tests for `buildPayloadFromHistoryRows`:
1. empty rows → null
2. single row mapping (all fields, source, endpoint)
3. null wind/temperature fields preserved (not coerced to 0), `partial` dataQuality
4. deduplication by `station_id` — keeps newest `measured_at`, regardless of input order
5. distinct `station_id`s both kept
6. `oldestMeasuredAtIso` = oldest `measured_at` across stations
7. `fetchedAtIso` = oldest `fetched_at` across rows
8. `partial` dataQuality maps correctly

## Commands Run

```
npm run type-check
```
Exit 0.

```
npx vitest run lib/__tests__/vegagerdin-history.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts
```
Exit 0. 29 passed.

```
npx vitest run
```
Exit 0. 109 test files, 3194 passed, 27 skipped, 0 failed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/weather/providers/vegagerdinCurrent.server.ts` — history constants, types, `buildPayloadFromHistoryRows`, `upsertVegagerdinHistory`, `readVegagerdinCurrentFromHistory`, `readVegagerdinCurrentWithHistoryFallback`, updated `FetchVegagerdinResult`, updated `fetchVegagerdinCurrent`
- `app/api/teskeid/weather/vegagerdin/current/route.ts` — use `readVegagerdinCurrentWithHistoryFallback`
- `app/api/cron/warm-vegagerdin/route.ts` — include `historyStatus` in ok response
- `lib/__tests__/weather-vegagerdin-current-api.test.ts` — rename mock, update mock target, add `history_fallback` test
- `lib/__tests__/vegagerdin-history.test.ts` — new, 8 tests for `buildPayloadFromHistoryRows`

## What Is NOT Done

- SQL 83 not run (Stebbi runs all migrations manually)
- SQL 82 not run
- The history fallback will not function until Stebbi runs `sql/83_vegagerdin_measurements_history.sql`
- The history table will not be populated until the cron (`warm-vegagerdin`) runs successfully at least once after sql/83 is applied

## Localhost Checks For Stebbi

After sql/83 is applied and the cron has run at least once:

1. **Normal operation**: `/api/teskeid/weather/vegagerdin/current` returns `cacheStatus: 'fresh'` or `'stale'` as before.
2. **History fallback**: Clear the `weather_cache` row for key `vegagerdin:vedur2014_1:latest` (or wait for it to expire past 30min). The route should now return `cacheStatus: 'history_fallback'`, `status: 'ok'`, and stations from the most recent history batch — instead of `status: 'unavailable'`.
3. **Cron response**: After a successful warm-vegagerdin cron run, the JSON response now includes `historyStatus: 'ok'` (or `'failed'` if the history upsert had a DB error).
4. **History too old**: If all history rows are older than 24h, the route falls back to `status: 'unavailable'` as before.
