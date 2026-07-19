# 2026-07-18 13:00 - TODO 086 v490 - Claude v489 done, prerelease

Created: 2026-07-18
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1224-todo-086-v489-codex-v488-prerelease-review.md`

## What Was Implemented

### Finding #1: Veðurstofan overview parity with /vedrid/ferdalagid

**New function: `classifyNowAnchoredForecastWindDisplayStatus`**

`lib/weather/windDisplayStatus.ts`:
- Added `classifyNowAnchoredForecastWindDisplayStatus(forecasts, thresholds)`.
- Finds the forecast row whose `ftimeIso` is closest to `Date.now()`.
- Classifies via `classifyPointWindDisplayStatus` (same path as Vegagerðin and route points).
- Returns `'no_data'` when forecasts is empty or closest row has `windSpeedMs === null`.

**`stationTone` removed from `WeatherOverviewClient.tsx`**

- The freshness-based `stationTone(s.status)` function is gone.
- `vedurstofanLayer` now builds each marker with:
  - `tone: windStatusToTone(status)` — same helper as Vegagerðin
  - `markerColor: WIND_STATUS_MARKER_COLOR[status]` — hex fill color
  - `statusLabel: tf(WIND_STATUS_META[status].labelKey)` — same label namespace as `/ferdalagid`
  - `visible: visibleStatuses.size === 0 || visibleStatuses.has(status)` — filter gating

**`vegagerdinLayer` updated**

- `visible: true` replaced with `visible: visibleStatuses.size === 0 || visibleStatuses.has(status)`.
- Both providers now respond to the same `visibleStatuses` state without refetching.

**`visibleStatuses` shared state**

`components/weather/WeatherOverviewClient.tsx`:
- `const [visibleStatuses, setVisibleStatuses] = useState<Set<WindDisplayStatus>>(new Set())`
- Empty set = no filter, show all. Same contract as TravelAuditMap.

**`overviewStatusCounts` useMemo**

- Aggregates counts across both visible providers.
- Tallies Veðurstofan stations using `classifyNowAnchoredForecastWindDisplayStatus`.
- Tallies Vegagerðin stations using `classifyObservationWindDisplayStatus`.
- Recomputes when `showVedurstofan`, `showVegagerdin`, `data`, `vegagerdinData`, or `thresholds` change.

**`renderBelowMap` — new slot in `WeatherOverviewShell`**

`components/weather/WeatherOverviewShell.tsx`:
- Added `renderBelowMap?: () => React.ReactNode` to `WeatherOverviewProviderConfig`.
- Rendered between the map and post-map content, always visible (not gated on provider active state).
- Iterates all providers (same as `renderFeedPreMap`) so it fires once per provider that sets it.

`components/weather/WeatherOverviewClient.tsx`:
- `renderBelowMap` attached to `vegagerdinProvider` (first in the `providers` array).
- Renders `<WindStatusFilterPills counts={overviewStatusCounts} visibleStatuses={visibleStatuses} onVisibleStatusesChange={setVisibleStatuses} showAllLabel={...} showAllButton />`.
- Same component, same props contract as `TravelAuditMap`.

**Detail cards hide when filtered out**

- `vedurstofanProvider.renderPostMap`: classifies selected station's status via `classifyNowAnchoredForecastWindDisplayStatus`; returns `null` when that status is filtered out.
- `vegagerdinProvider.renderPostMap`: classifies via `classifyObservationWindDisplayStatus`; returns `null` when filtered.

### Finding #2: SQL 82 hardened

`sql/82_weather_user_preferences.sql`:
- Added `REVOKE ALL ON public.weather_user_preferences FROM PUBLIC, anon, authenticated`
- Added `GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO authenticated`
- Added `GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_user_preferences TO service_role`
- Added `DROP POLICY IF EXISTS "weather_user_preferences_own_row" ON public.weather_user_preferences`
- Added `DROP TRIGGER IF EXISTS weather_user_preferences_updated_at ON public.weather_user_preferences`
- Migration is now idempotent and follows the `sql/69` pattern.
- SQL was **written but NOT run**.

### Finding #4: WindStatusFilterPills comment corrected

`components/weather/WindStatusFilterPills.tsx`:
- Comment "shared with /vedrid overview station markers" now says "via WeatherOverviewClient renderBelowMap" — accurately describes actual usage.

## What Was NOT Implemented

- API routes `GET/PUT /api/teskeid/weather/preferences/thresholds` — deferred to dedicated Phase B.
- SQL 82 has not been run.

## Commands Run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```
Exit 0. 8 files, 313 tests passed, 5 skipped.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## Files Changed

- `lib/weather/windDisplayStatus.ts` — NEW `classifyNowAnchoredForecastWindDisplayStatus`
- `components/weather/WeatherOverviewShell.tsx` — NEW `renderBelowMap` slot in interface and JSX
- `components/weather/WeatherOverviewClient.tsx` — remove `stationTone`; add `visibleStatuses` state; add `overviewStatusCounts` useMemo; update `vedurstofanLayer` to use forecast classification + markerColor + filter; update `vegagerdinLayer` to gate `visible` on filter; add `renderBelowMap` with `WindStatusFilterPills`; hide detail cards when filtered
- `components/weather/WindStatusFilterPills.tsx` — comment fix
- `sql/82_weather_user_preferences.sql` — hardened with REVOKE/GRANT/DROP POLICY IF EXISTS/DROP TRIGGER IF EXISTS

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. Both provider toggles still work: `Vegagerðin (núna)` and `Veðurstofan (spá)`.
3. **Map markers colored by wind threshold, not freshness** — Veðurstofan stations should now show green/amber/orange/red based on nearest forecast wind, not data staleness. A station with stale data but calm winds should show green.
4. **Status filter pills appear below the map** — same `Innan marka`, `Nálgast óþægindi`, `Óþægilegt`, `Nálgast hættumörk`, `Hættulegt` pills as on `/vedrid/ferdalagid`. Counts aggregate both providers.
5. **Toggling a provider pill updates counts and marker visibility** — hide Veðurstofan, pill counts should drop to only Vegagerðin counts.
6. **Filtering by status** — click a status pill; only matching markers remain visible on both layers. Click again or "Sýna allt" to clear.
7. **Change thresholds, click Setja** — marker colors AND pill counts update without reload, for both providers.
8. **Detail card hides when its status is filtered** — select a station that is "Nálgast óþægindi", then filter to "Innan marka" only; the detail card should disappear (marker becomes invisible too).
9. **Open `/vedrid/ferdalagid`** — pills and colors should still match overview (same labels, same colors).
10. Mobile widths 360/390/460 px: no horizontal overflow.

## SQL 82 Notes

Still not run. When Stebbi decides to run it, the migration is now safe to re-run (idempotent).
After running: implement `GET/PUT /api/teskeid/weather/preferences/thresholds` and client load/save.
