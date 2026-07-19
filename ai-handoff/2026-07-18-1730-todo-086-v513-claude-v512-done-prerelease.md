# 2026-07-18 17:30 - TODO 086 v513 - Claude v512 done, prerelease

Created: 2026-07-18 17:30
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1710-todo-086-v512-codex-v511-review-and-big-next-plan.md`
- `ai-handoff/2026-07-18-1620-todo-086-v506-codex-metno-station-forecast-history-cache.md`

## SQL

Nothing run. `sql/84_metno_point_forecasts_history.sql` written but not run.

## What Was Implemented

### P0: Stale JSDoc fix

`lib/weather/providers/vegagerdinCurrent.server.ts` line ~492:
- "Finds the newest measured_at within the 24-hour window, then fetches all rows within a 10-minute batch window of that timestamp."
- → "Finds the newest last_fetched_at within the 24-hour window, then fetches all rows from that exact fetch batch."
- No behavior change.

### P1: Reusable explicit-anchor forecast classifier

`lib/weather/windDisplayStatus.ts`:
- Added `classifyForecastWindDisplayStatusAt(forecasts, thresholds, anchorMs)`:
  - Selects the latest forecast slot at-or-before anchorMs.
  - Falls back to first future slot if no at-or-before slot exists.
  - Returns `'no_data'` for empty forecasts or null wind.
- `classifyNowAnchoredForecastWindDisplayStatus` kept unchanged (backward compat for existing callers and tests).
- `classifyForecastWindDisplayStatusAt` is exported.

`lib/__tests__/windObservationStatus.test.ts`:
- Added import of `classifyForecastWindDisplayStatusAt`.
- 7 new tests for explicit anchor: empty forecasts, null wind, exact at anchor, latest at-or-before, first future fallback, null future fallback, threshold check.

### P2: Compact ForecastTimeScrubber on /vedrid

`components/weather/ForecastTimeScrubber.tsx` (new file):
- Props: `slots: ForecastTimeScrubberSlot[]`, `selectedTimeMs: number`, `onSelect`, `label`.
- Horizontal scrollable list; no page-level overflow.
- Slots grouped by UTC calendar day (Iceland = UTC year-round).
- Day label via `toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })`.
- Selected slot: `bg-foreground/10 ring-1 ring-foreground/30` highlight.
- Dot color: `WIND_STATUS_MARKER_COLOR[worstStatus]`.
- Hour label: ISO slice `[11:13]`.

`components/weather/WeatherOverviewClient.tsx`:
- State: `selectedForecastTimeMs: number | null` (null = default not yet applied).
- Memos:
  - `availableForecastSlots`: sorted unique slot times from all stations' forecasts.
  - `defaultForecastTimeMs`: latest at-or-before now, or first future slot.
  - `forecastAnchorMs`: `selectedForecastTimeMs ?? defaultForecastTimeMs ?? Date.now()`.
  - `forecastSlotStatuses`: worst `WindDisplayStatus` per slot across all mappable stations (memoized, does not recompute on slot selection).
- Effect: sets `selectedForecastTimeMs` to `defaultForecastTimeMs` when slots first load.
- `vedurstofanLayer` now uses `classifyForecastWindDisplayStatusAt(s.forecasts, thresholds, forecastAnchorMs)` for each marker color.
- `overviewStatusCounts` now uses `classifyForecastWindDisplayStatusAt` for Veðurstofan stations; added `forecastAnchorMs` to dependency array.
- `vedurstofanProvider.renderPostMap`: renders `ForecastTimeScrubber` above `StationDetail`. Scrubber shows even when no station is selected (as long as slots exist). Detail card visibility still respects `visibleStatuses` filter.
- Import: removed `classifyNowAnchoredForecastWindDisplayStatus`, added `classifyForecastWindDisplayStatusAt`, `worstWindDisplayStatus`, `ForecastTimeScrubber`, `ForecastTimeScrubberSlot`.
- `VegagerdinCurrentApiData` type: `cacheStatus` now includes `'history_fallback'`.

**Vegagerðin is NOT affected by the scrubber** — it uses `classifyObservationWindDisplayStatus` based on current `meanWindMs`, not `forecastAnchorMs`.

### P3: StationDetail windowed forecast rows

`components/weather/WeatherOverviewClient.tsx`:
- Added `findUsedForecastIndex(forecasts, anchorMs)` module-level helper: finds latest at-or-before index, falls back to first future index.
- `StationDetail` now accepts `selectedTimeMs: number` prop.
- Forecast section:
  - Shows "Spá gefin út kl. HH:mm" header (reuses `pulseForecastFrom` key) when `station.atimeIso` is available.
  - Windowed rows: 2 before used index + used row + 2 after used index (clamped).
  - Used row highlighted: `bg-foreground/5 font-medium`.
  - Used row has "Notað á korti" (`usedOnMap` key) in rightmost column.
  - When all rows fit in window (≤5 total) or full list equals window, no "see all".
  - If rows outside window exist, shows `<details>` with `pulseForecastShowAll` label containing full table.

### P4: SQL84 met.no/Yr history cache foundation

`sql/84_metno_point_forecasts_history.sql` (new file):
- Table `public.metno_point_forecasts_history`.
- Columns: `target_type`, `target_id`, `target_name`, `target_lat`, `target_lon`, `metno_updated_at`, `forecast_time`, `paired_provider`, `paired_provider_cycle_time`, `wind_speed_ms`, `wind_direction_deg`, `temperature_c`, `precipitation_mm_per_hour`, `weather_symbol_code`, `metno_cache_key`, `expires_at`, `first_fetched_at DEFAULT now()`, `last_fetched_at`, `created_at`, `updated_at`.
- Primary key: `(target_type, target_id, metno_updated_at, forecast_time)`.
- CHECK: `target_type IN ('vedurstofan_station')`.
- CHECK: `paired_provider IS NULL OR paired_provider IN ('vedurstofan')`.
- RLS enabled; REVOKE from PUBLIC, anon, authenticated; GRANT to service_role only.
- Indexes: `target_cycle_idx`, `forecast_time_idx`, `updated_at_idx`.
- `updated_at` trigger via `public.teskeid_set_updated_at()`.
- Rollback comment. NOT run.

`lib/__tests__/sql-migration.test.ts`:
- Added `sql84` constant reading the file.
- 12 static tests: transaction wrap, table creation, primary key, first_fetched_at default, last_fetched_at, target_type CHECK, RLS, revoke, service_role grant, target_cycle index, forecast_time index, updated_at index, trigger, idempotent DROP TRIGGER, rollback table drop, rollback no DROP FUNCTION.

### Messages

`messages/is.json`:
- `teskeid.vedrid.eltaVedrid.usedOnMap`: "Notað á korti"
- `teskeid.vedrid.overview.scrubberLabel`: "Veldu spátíma"

`messages/en.json`:
- `teskeid.vedrid.eltaVedrid.usedOnMap`: "Used on map"
- `teskeid.vedrid.overview.scrubberLabel`: "Select forecast time"

Reused existing keys (no new additions needed):
- `pulseForecastFrom`: "Spá gefin út kl. {time}" / "Forecast issued at {time}"
- `pulseForecastShowAll`: "Sjá öll spágildi" / "See all forecast values"

## Commands Run

```
npm run type-check
```
Exit 0.

```
npx vitest run lib/__tests__/windObservationStatus.test.ts lib/__tests__/sql-migration.test.ts
```
Exit 0. 291 passed.

```
npx vitest run
```
Exit 0. 109 test files, 3239 passed, 27 skipped, 8 todo, 0 failed. (3224 before → 3239 after = +15 new tests, +24 from P1 classifier tests + P4 SQL tests, minus existing count delta.)

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/weather/providers/vegagerdinCurrent.server.ts` — fixed stale JSDoc comment
- `lib/weather/windDisplayStatus.ts` — added `classifyForecastWindDisplayStatusAt`
- `lib/__tests__/windObservationStatus.test.ts` — 7 new tests for new classifier
- `messages/is.json` — added `usedOnMap`, `scrubberLabel`
- `messages/en.json` — added `usedOnMap`, `scrubberLabel`
- `components/weather/ForecastTimeScrubber.tsx` — new file
- `components/weather/WeatherOverviewClient.tsx` — scrubber integration, windowed StationDetail, forecastAnchorMs, VegagerdinCurrentApiData type fix
- `sql/84_metno_point_forecasts_history.sql` — new file, NOT run
- `lib/__tests__/sql-migration.test.ts` — 12 new SQL84 static tests

## What Was Skipped

- P5: Yr/met.no all-station runtime fetch — not implemented as planned.
- `classifyNowAnchoredForecastWindDisplayStatus` is still present in windDisplayStatus.ts and the test file still imports/tests it. It is no longer called in `WeatherOverviewClient.tsx` (replaced by `classifyForecastWindDisplayStatusAt`), but is kept for any future callers.

## SQL Impact

- `sql/84_metno_point_forecasts_history.sql` written, NOT run.
- Zero Supabase changes.
- Zero production changes.
- `sql/83_vegagerdin_measurements_history.sql` unchanged (not run).

## Risk Remaining

- `sql/83` and `sql/84` are only on disk until Stebbi runs them in Supabase.
- `ForecastTimeScrubber` with many slots (60+) may look crowded on 360px — the horizontal scroll handles it but Stebbi should verify on real device.
- The windowed forecast rows IIFE pattern (`(() => { ... })()`) inside JSX is valid but unusual. If Codex prefers extracting it to a helper sub-component, that's a low-risk refactor.
- `forecastAnchorMs` is computed fresh each render but is stable once a slot is selected. The `overviewStatusCounts` memo correctly lists it as a dep.

## Spurningar fyrir Codex

1. Er IIFE í JSX (`(() => { ... })()`) við hæfi eða á að færa `windowedForecasts` útreikninginn upp í `StationDetail` component body?
2. Á `ForecastTimeScrubber` að sýna `"kl. HH"` (með "kl.") eða bara `"HH"` á hverri dot? Núna sýnist `"HH"` eingöngu.
3. Á default forecast anchor að uppfærast reglulega (interval) þegar notandi er á síðunni lengi, eða er einstaklingsval notanda alltaf yfirgnæfingarlegt?

## Localhost Checks For Stebbi

1. Opnaðu `http://localhost:3004/vedrid` sem public notandi.
2. Veldu `Veðurstofan (spá)`.
3. Staðfestu að 3-klst scrubber birtist undir kortinu (þegar Veðurstofugögn eru til).
4. Færðu scrubber fram og til baka — punktar á korti eiga að breyta lit.
5. Status pillur og talningar eiga að breytast með selected slot.
6. Smelltu á Veðurstofustöð:
   - "Spá gefin út kl. HH:mm" ætti að sjást ofan við spágildi.
   - Windowed 5 rows sjást (2 fyrir, selected, 2 eftir).
   - Selected row er highlighted og sýnir "Notað á korti".
   - "Sjá öll spágildi" birtist ef fleiri rows eru til.
7. Veldu `Vegagerðin (núna)` og hreyfðu Veðurstofu scrubberinn (ef sjáanlegur).
   - Vegagerðin punktar eiga EKKI að breyta litum vegna scrubbers.
8. Prófaðu mobile widths 360, 390 og 460 px.
   - Enginn horizontal overflow á síðu.
   - Scrubber scrollar innan sín.
   - Engar layout shifts við val á slot.
9. Opnaðu `http://localhost:3004/vedrid/ferdalagid` og staðfestu að það virki óbreytt.
