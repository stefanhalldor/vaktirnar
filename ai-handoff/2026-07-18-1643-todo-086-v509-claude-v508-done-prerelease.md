# 2026-07-18 16:43 - TODO 086 v509 - Claude v508 done, prerelease

Created: 2026-07-18 16:43
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1630-todo-086-v508-codex-v507-review-before-v505-v506.md`

## SQL

Nothing run. No SQL was run in this session.

`sql/83_vegagerdin_measurements_history.sql` was modified (new index added). Not run.

## What Was Implemented

### High: Fix history fallback to use `last_fetched_at` as batch anchor

**Root cause (Codex v508 finding #1):**
`readVegagerdinCurrentFromHistory` was using `measured_at` to find the newest batch and then querying `measured_at >= batchCutoff`. This excluded stations that hadn't sent a new measurement in 15-40 minutes, even though those stations were present in the most recent upstream fetch. This directly undermined the "always have data" goal.

**Fix:**
`lib/weather/providers/vegagerdinCurrent.server.ts`:
- Changed the first DB query to select and order by `last_fetched_at` instead of `measured_at`
- Changed the batch cutoff to filter by `last_fetched_at >= newestLastFetchedAt - HISTORY_BATCH_WINDOW_MS`
- Changed the batch rows select to include `last_fetched_at` in the column list and filter by `last_fetched_at`
- `VegagerdinHistoryDbRow` type: added `last_fetched_at: string`
- `buildPayloadFromHistoryRows`: changed `payload.fetchedAtIso` to use newest `last_fetched_at` across rows (was: oldest `fetched_at`). Renamed internal variable `oldestFetchedAtIso` → `newestLastFetchedAtIso`. This represents "when this batch was last confirmed from upstream".

**sql/83:**
- Added `vegagerdin_measurements_history_last_fetched_at_desc_idx ON (last_fetched_at DESC)` as the primary index for fallback queries
- Existing `measured_at DESC` and `(station_id, measured_at DESC)` indexes retained

### Medium: Route all user-facing Vegagerðin station lookup through history fallback

Added exported helper:
```ts
export async function findVegagerdinCurrentMeasurementByStationId(
  stationId: string,
): Promise<VegagerdinCurrentMeasurement | null>
```
Uses `readVegagerdinCurrentWithHistoryFallback` internally. Returns null for unavailable or not found. Never throws.

Updated call sites:
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx` — replaces `readVegagerdinCurrentFromCache` with `findVegagerdinCurrentMeasurementByStationId`. Removed now-unused `VegagerdinCurrentMeasurement` import.
- `lib/chat/adapters/weather.server.ts` (`buildWeatherPulseTarget`) — replaces `readVegagerdinCurrentFromCache` with `findVegagerdinCurrentMeasurementByStationId`.

**Preview route handled separately:**
`app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts` — uses `readVegagerdinCurrentWithHistoryFallback` directly (not the helper) to preserve the existing distinction: `unavailable` → `[]` (fail-open), station not found → `400`. Using the helper would lose this distinction.

**Cron anti-stampede (unchanged):**
`app/api/cron/warm-vegagerdin/route.ts` remains cache-only for its anti-stampede check and verify step. This is correct: cron should verify the cache write, not accept a history fallback as proof of success.

### Medium: SQL83 static tests

Added to `lib/__tests__/sql-migration.test.ts`:
- `sql/83_vegagerdin_measurements_history.sql` exists
- Creates `public.vegagerdin_measurements_history`
- Primary key `(station_id, measured_at)`
- `first_fetched_at DEFAULT now()`
- `last_fetched_at` column
- RLS enabled
- Revokes PUBLIC, anon, authenticated
- Grants service_role only (no anon/authenticated/PUBLIC grants)
- Index on `last_fetched_at DESC`
- Index on `measured_at DESC`
- Composite index on `(station_id, measured_at DESC)`
- Updated_at trigger using `public.teskeid_set_updated_at()`
- DROP TRIGGER IF EXISTS before CREATE TRIGGER (idempotent)
- Rollback drops the table
- Rollback does not DROP FUNCTION

### Low: Provider fallback and batch tests

Updated `lib/__tests__/vegagerdin-history.test.ts`:
- `makeRow` fixture now includes `last_fetched_at` (required by updated type)
- Updated "sets fetchedAtIso" test: now asserts newest `last_fetched_at` (was: oldest `fetched_at`)
- Added test: **"preserves all stations from the same batch even when measured_at differs widely"** -- S2 has `measured_at` 40 minutes older than S1 but both have the same `last_fetched_at`. Both must appear in the payload. This directly tests the batch-by-`last_fetched_at` semantics.
- Added Supabase-chain mocked tests for `readVegagerdinCurrentWithHistoryFallback`:
  - cache missing + history recent batch → `cacheStatus: 'history_fallback'` with correct stations
  - cache missing + history empty → `status: 'unavailable'`
  - cache fresh → returns `fresh` without touching history (getAdmin called exactly once)

Updated `lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts`:
- Renamed `mockReadCache` → `mockReadCurrent`
- Updated mock target: `readVegagerdinCurrentFromCache` → `readVegagerdinCurrentWithHistoryFallback`

## Commands Run

```
npm run type-check
```
Exit 0.

```
npx vitest run lib/__tests__/vegagerdin-history.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 281+ passed.

```
npx vitest run
```
Exit 0. 109 test files, 3213 passed, 27 skipped, 0 failed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/weather/providers/vegagerdinCurrent.server.ts` — `VegagerdinHistoryDbRow` + `last_fetched_at`, `buildPayloadFromHistoryRows` uses newest `last_fetched_at` for `fetchedAtIso`, `readVegagerdinCurrentFromHistory` anchors by `last_fetched_at`, new `findVegagerdinCurrentMeasurementByStationId` helper
- `sql/83_vegagerdin_measurements_history.sql` — added `last_fetched_at DESC` index (NOT run)
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx` — uses `findVegagerdinCurrentMeasurementByStationId`, removed unused type import
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts` — uses `readVegagerdinCurrentWithHistoryFallback` directly (preserves 400 for unknown station)
- `lib/chat/adapters/weather.server.ts` — uses `findVegagerdinCurrentMeasurementByStationId`
- `lib/__tests__/sql-migration.test.ts` — SQL83 static tests
- `lib/__tests__/vegagerdin-history.test.ts` — updated fixture type, updated fetchedAtIso test, new batch-preservation test, Supabase-mocked fallback tests
- `lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts` — mock renamed and retargeted to `readVegagerdinCurrentWithHistoryFallback`

## What Is NOT Done

- SQL 83 not run (awaiting Stebbi)
- SQL 82 not run
- v505 (3h forecast scrubber on `/vedrid`) not started
- v506 (`sql/84_metno_point_forecasts_history.sql`) not started

## Localhost Checks For Stebbi

After sql/83 is applied and cron has run at least once:

1. **Normal flow**: `/api/teskeid/weather/vegagerdin/current` — `cacheStatus: 'fresh'` or `'stale'`
2. **History fallback**: let cache expire past 30min or delete the `weather_cache` row. Route should return `cacheStatus: 'history_fallback'` with all stations from the last fetch, including stations with older `measured_at`.
3. **Pulse page**: with expired cache, open a Vegagerðin station pulse page. Should still load (uses history fallback), not 404.
4. **Chat thread creation**: sending a message for a Vegagerðin station with expired cache should still resolve station identity (via `buildWeatherPulseTarget` → `findVegagerdinCurrentMeasurementByStationId`).
5. **Public preview**: `/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview` — returns `[]` when cache+history unavailable, `400` for unknown station, `200` with messages when station is known.
6. **Cron**: `warm-vegagerdin` cron should return `historyStatus: 'ok'` after a successful fetch.

## Next Steps

v505 (forecast scrubber) and v506 (SQL84 met.no history) as planned by Codex.
