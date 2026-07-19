# 2026-07-18 12:20 - TODO 086 v488 - Claude v486+v487 done, prerelease

Created: 2026-07-18 12:20
Timezone: Atlantic/Reykjavik

Sources implemented against:
- `ai-handoff/2026-07-18-1142-todo-086-v486-codex-v485-prerelease-review.md`
- `ai-handoff/2026-07-18-1145-todo-086-v487-codex-vedrid-ferdalagid-map-parity-thresholds.md`
- Stebbi: SQL 81 already run; SQL 80 question; workflow og framkvæmd

## SQL 80 Answer

`sql/80_feature_access_weather_provider_vegagerdin.sql` adds `weather-provider-vegagerdin` to the `feature_access` table's CHECK constraint. This allows the DB to store per-user feature_access rows for the Vegagerðin provider gate.

You do NOT need to run SQL 80 unless `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` is set in the environment AND you want to grant/deny specific users access via `feature_access`. If that env var is not set (graduation path), all weather users can access Vegagerðin without any per-user row. Running SQL 80 is a DB schema prerequisite for later per-user Vegagerðin gating if you need it.

## What Was Implemented

### v486 Hardening (all 4 items)

**1. FIX: Legend overlay moved from bottom-left to top-left**

`components/weather/ProviderStationContextMap.tsx`:
- `absolute bottom-2 left-2` → `absolute top-2 left-2`
- Google attribution (and map zoom controls) sit at bottom. Top-left is safe.
- Updated comment to describe the placement rationale.

**2. FIX: Hardcoded threshold input IDs replaced with `useId()`**

`components/weather/WeatherThresholdBar.tsx`:
- Added `useId()` from React; generates `${uid}-caution-wind` and `${uid}-danger-wind`.
- Multiple instances of the component can now coexist on a page without duplicate IDs.

**3. FIX: `renderFeedPreMap` contract clarified**

`components/weather/WeatherOverviewShell.tsx`:
- Comment already updated in v485. Confirmed correct: "rendered unconditionally for all providers; the callback is responsible for what to show; it must not assume provider access."
- No additional code change needed.

**4. ADD: `alwaysOpen` prop on `WeatherThresholdBar`**

(Also serves v487 Phase 3 — inline always-visible threshold controls.)
- When `alwaysOpen=true`: edit panel is always visible, no Breyta/Loka toggle.
- Draft values sync to active thresholds via `useEffect` when thresholds change externally (after Reset or future server-loaded preferences).
- Used by `WeatherOverviewClient` for /vedrid overview: `<WeatherThresholdBar alwaysOpen .../>`.

### v487 Phase 4: Default Thresholds 10/15 m/s

**Product effect: MORE points and markers will show Nálgast óþægindi, Óþægilegt, Nálgast hættumörk, Hættulegt. This is intentional.**

`lib/weather/thresholds.ts`:
- `WEATHER_THRESHOLDS.driving.cautionWindMs`: 15 → **10**
- `WEATHER_THRESHOLDS.driving.redWindMs`: 25 → **15**
- `WEATHER_THRESHOLDS.driving.redGustMs`: 35 (unchanged)
- Trailer/caravan defaults: unchanged.

`lib/weather/useWeatherThresholds.ts`: comment updated for new defaults.

`lib/__tests__/weather-travel.test.ts`: 10 assertions updated for new defaults. Wind values in tests that previously sat at the old caution/danger boundaries were adjusted to remain logically correct at the new thresholds.

`lib/__tests__/travelAuditMap.helpers.test.ts`: one assertion updated (default cautionWindMs threshold 15 → 10).

### v487 Phase 1: WindStatusFilterPills Reusable Component

**New file:** `components/weather/WindStatusFilterPills.tsx`

- Extracts the duplicated pill rendering from `TravelAuditMap` and `DepartureHeatmap`.
- Contract: `{ counts, visibleStatuses, onVisibleStatusesChange, showAllLabel, showAllButton?, alwaysShowWithinLimits? }`
- Handles toggle internally (builds next Set, calls `onVisibleStatusesChange(next)`).
- Callers that have selection side effects (TravelAuditMap, DepartureHeatmap) wrap `onVisibleStatusesChange` with their own logic before/instead of calling up.
- Translates labels from `teskeid.vedrid.ferdalagid` — same namespace as `WindStatusBadge`.
- Used by: `TravelAuditMap`, `DepartureHeatmap`. Ready for `/vedrid` overview in the next phase.

`components/weather/TravelAuditMap.tsx`:
- Removed `ALL_WIND_DISPLAY_STATUSES` import (no longer needed for pills).
- Replaced inline pill loop with `<WindStatusFilterPills ... showAllButton />`.
- `toggleMapStatus` renamed to `handleVisibleStatusesChange(next: Set)` — receives already-toggled Set from `WindStatusFilterPills`, applies selection side effects, then propagates.

`components/weather/DepartureHeatmap.tsx`:
- Removed `ALL_WIND_DISPLAY_STATUSES` import.
- Replaced inline pill loop with `<WindStatusFilterPills ... alwaysShowWithinLimits />`.
- `toggleStatus` renamed to `handleStatusesChange(next: Set)`.

### v487 Phase 6: CTA Moved to Bottom, Renamed

`components/weather/WeatherOverviewShell.tsx`:
- Removed CTA from between header and provider strip.
- Added CTA after post-map content, centered with `flex justify-center`.
- Added `Car` icon from lucide-react next to the label.
- Touch target `min-h-[44px]` for iOS HIG compliance.

`messages/is.json`: `teskeid.vedrid.overview.tripCta`: "Reikna ferðaveðrið" → "**Ferðalagið**"
`messages/en.json`: `teskeid.vedrid.overview.tripCta`: "Calculate trip weather" → "**Trip Weather**"

### v487 Phase 5 (partial): SQL Migration Written

**SQL was WRITTEN but NOT RUN.**

`sql/82_weather_user_preferences.sql`:
- Creates `public.weather_user_preferences` table.
- Columns: `user_id` (PK, FK to profiles, ON DELETE CASCADE), `caution_wind_ms`, `red_wind_ms`, `created_at`, `updated_at`.
- DB-level constraints: range (0 < value <= 40), ordering (`caution < red`).
- RLS enabled: authenticated users can SELECT/INSERT/UPDATE/DELETE their own row only. No anon access.
- `updated_at` trigger.
- Rollback script in comments.

API routes and client persistence are **deferred to a dedicated Phase B** session (see below).

## What Was NOT Implemented

### v487 Phase 2: Veðurstofan Now-Anchored Marker Classification

**Deferred.** Currently, Veðurstofan station markers on /vedrid overview use `stationTone(s.status)` where `status` is 'ok'/'stale'/'unavailable' (freshness-based). The handoff requires classifying markers by the closest-to-now forecast wind row using `WindDisplayStatus`.

This is product-significant and needs a careful pass. The `StationExplorerStation.forecasts` array has the forecast rows; the logic is: find the row with `ftimeIso` closest to `Date.now()`, classify `windSpeedMs` with `classifyPointWindDisplayStatus`. Not done here.

### v487 Phase 5 API Routes and Client Persistence

**Deferred.** Needs:
- `GET /api/teskeid/weather/preferences/thresholds`
- `PUT /api/teskeid/weather/preferences/thresholds`
- Client: load on mount (authenticated users), save button "Vista sem sjálfgefið"
- SQL 82 must be run before API routes will work

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

- `components/weather/ProviderStationContextMap.tsx` — legend at `top-2 left-2`
- `components/weather/WeatherThresholdBar.tsx` — `useId()`, `alwaysOpen` prop, draft sync `useEffect`
- `components/weather/WeatherOverviewClient.tsx` — `alwaysOpen` on `WeatherThresholdBar`
- `components/weather/WeatherOverviewShell.tsx` — CTA moved to bottom, `Car` icon, `min-h-[44px]`
- `components/weather/WindStatusFilterPills.tsx` — NEW reusable component
- `components/weather/TravelAuditMap.tsx` — use `WindStatusFilterPills`, rename toggle handler
- `components/weather/DepartureHeatmap.tsx` — use `WindStatusFilterPills`, rename toggle handler
- `lib/weather/thresholds.ts` — driving defaults 10/15 m/s
- `lib/weather/useWeatherThresholds.ts` — comment update
- `lib/__tests__/weather-travel.test.ts` — 10 assertions updated for new defaults
- `lib/__tests__/travelAuditMap.helpers.test.ts` — 1 assertion updated
- `messages/is.json` — `tripCta` → "Ferðalagið"
- `messages/en.json` — `tripCta` → "Trip Weather"
- `sql/82_weather_user_preferences.sql` — NEW, written but not run

## Localhost Checks For Stebbi

1. Open `http://localhost:3004/vedrid`.
2. **Threshold controls visible without clicking Breyta** — two inputs (Óþægilegt / Hættulegt) should be directly visible under the safnpúls.
3. **Default values 10 / 15 m/s** — confirm inputs show 10 and 15 on fresh load.
4. **More markers colored amber/orange/red** — tighter defaults mean more stations show non-green status.
5. **Marker colors update instantly** — change threshold values and click Setja; markers recolor without page reload.
6. **Ferðalagið CTA at the bottom** — button with Car icon, centered, below map and post-map content. Does NOT appear at the top of the page.
7. **Click Ferðalagið** — routes to `/vedrid/ferdalagid` (or `/auth-mvp/vedrid/ferdalagid` for authenticated path). Should not feel dead while navigating.
8. **Pulse map legend top-left** — open a Vegagerðin station pulse page; the station name legend inside the map should be at the top-left, not covering the Google logo at the bottom.
9. **Status filter pills same in ferdalagid and overview** — visual appearance should match (same chip colors/styles). Both use `WindStatusFilterPills` now.
10. Mobile widths 360, 390, 460 px: no horizontal overflow, threshold inputs do not zoom on focus.

## SQL 82 Notes

`sql/82_weather_user_preferences.sql` was written but not run. When Stebbi decides to run it:
- Run it against the Supabase project after SQL 81 is confirmed applied.
- Then implement the API routes (GET/PUT) and client load/save behavior.
- The `caution_wind_ms` and `red_wind_ms` columns store user's saved defaults.
- Authenticated users get their saved values loaded on mount; public users use 10/15 defaults.
