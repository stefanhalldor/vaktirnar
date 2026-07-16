# Handoff: TODO #75 Phase 1 Complete

**Date:** 2026-07-08
**From:** Claude
**Status:** localhost-ready, type-check clean, all 1958 tests pass

---

## What was done

### Phase 1: ForecastDrawer reused for all route points

Implemented full reuse of `ForecastDrawer` across three trigger points. Users can now open a forecast table from:

1. **Destination arrival block** — "Skoða spána a afangastað betur" button below arrival weather summary
2. **Map panel (PointDetailsPanel)** — "Spá 🥄" button in the links row when the selected point has forecast rows
3. **RoutePointRow (explainer list)** — "Spá 🥄" button in each row's links when forecast rows exist

---

## Files changed

### `lib/weather/types.ts`
- Added `GustSeverity`, `ForecastDrawerMetricCell`, `ForecastDrawerGustCell`, `ForecastDrawerRow` types
- Added `forecastRows?: ForecastDrawerRow[]` to `RouteWeatherPoint`
- Replaced `destinationForecastHours?: HourPoint[]` with `destinationForecastRows?: ForecastDrawerRow[]` in `TravelPlan`

### `lib/weather/travel.ts`
- Added `deriveGustSeverity(windMs, gustMs, thresholds)` — threshold-relative severity: danger >= red, caution >= 80%, notice >= 65% AND spike >= 3 m/s
- Added `buildForecastRows(hours, trailerKind, thresholds)` — builds typed rows with delta/direction/tone/severity per metric
- Wired `forecastRows` into `buildRouteWeatherPoints` return
- Wired `destinationForecastRows` into `checkTravelWeather` travelPlan construction
- Applied `enrichWithArrivalWeather` to both `outboundCandidates` and `timelineCandidates` (bug fix: arrival weather was previously only on outbound candidates, invisible in single-departure UI mode)

### `components/weather/ForecastDrawer.tsx` (new)
- Sheet-style bottom drawer: overlay + panel (max-w-md, rounded-t-2xl, max-h-[75vh])
- Table: date/time | temp | wind (with gust sub-line) | precip
- Highlighted row for the forecast time used by Teskeid
- Gust severity coloring: danger=red, caution=amber, notice=yellow
- Wind/precip tone coloring: positive=green, negative=amber

### `components/weather/TravelAuditMap.tsx`
- Added `onOpenForecastDrawer?: (routeIndex: number) => void` to props
- Passed to `PointDetailsPanel` as `onOpenForecast` when point has `forecastRows`
- Added "Spá 🥄" button in `PointDetailsPanel` links section

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Replaced `showArrivalForecast: boolean` state with `forecastDrawerData: { rows, title, highlightedTimeIso? } | null`
- Replaced large inline drawer JSX with `<ForecastDrawer>` component
- Removed now-unused `formatForecastDate` helper (moved into `ForecastDrawer`)
- Wired destination arrival block button to open drawer with `destinationForecastRows`
- Added `onOpenForecastDrawer` to `TravelAuditMap` call — opens drawer for any route point
- Added `onOpenForecast` prop to `RoutePointRow` + "Spá 🥄" button

### `messages/is.json` + `messages/en.json`
- `arrivalSummaryLine` — two-line arrival copy
- `spaSpoon` — "Spá 🥄" / "Forecast 🥄"
- `drawerClose` — "Loka" / "Close"
- `forecastWorstPointTitle`, `forecastPointTitle` — drawer titles
- `forecastGustAbbr` — "hvið." / "gust"
- `forecastUsedByTeskeid` — highlighted row label
- `forecastColDateTime`, `forecastColTemp`, `forecastColWind`, `forecastColPrecip` — table headers
- `viewForecast` -> "Yr", `openOnMap` -> "Google Maps"

---

## What to test on localhost

1. Open the weather wizard, run a route
2. **Arrival block:** Confirm "Komutími kl. HH:MM, spáin þar kl. HH:MM:" copy. Click "Skoða spána..." -> drawer opens with destination forecast, arrival hour highlighted
3. **Map panel:** Tap any point on the map -> panel shows "Spá 🥄" button -> drawer opens with correct point title and rows
4. **Explainer list:** Expand "Hvernig er þetta metið?" -> each RoutePointRow shows "Spá 🥄" -> drawer opens with correct point forecast
5. **Drawer UX:** Close by tapping overlay or X. Gust line appears below wind when relevant. Colors correct (danger=red, caution=amber, notice=yellow, positive=green, negative=amber)

---

## Deferred to Phase 2

- Night-time filter (grey out or skip 23:00-06:00 rows)
- Gust trend arrows (`hvið. 12.3 ↑1.2`) in wind cell
