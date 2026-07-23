# TODO-086 v349 - Post-release handoff: route/Mitt veður lifecycle fix + stepper standardization

Created: 2026-07-23 14:45
Timezone: Atlantic/Reykjavik

## Scope

Stebbi requested two things:

1. Implement the P1/P2 lifecycle fixes from Codex review v348.
2. Standardize weather value steppers in Mitt veður so temperature steps by ±1°C and wind by ±1 m/s, both with the same centered display as the existing precipitation stepper.

Execution permission was given. Committed and pushed to production.

## What was changed

### 1. Route/Mitt veður lifecycle fixes (Codex P1 + P2)

File: `components/weather/RoadMapPrototypeMap.tsx`

#### New React state: `routeActive`

Added `const [routeActive, setRouteActive] = useState(false)` alongside `isChatOpen`. This makes route activation reactive so that the Mitt veður marker effect reruns on route transitions instead of relying solely on ref mutation.

#### New function: `reconcilePlaceMarkerVisibility()`

Added before `clearWeatherChaseMapMarkers()`. Centralizes all DOM place marker show/hide logic in one place:

- Hides all place markers when either `routeActiveRef.current` is true OR `weatherChaseSelectedItemsRef.current.length > 0`.
- Otherwise shows place markers according to the existing zoom thresholds (importance 3 always, importance 2 at zoom >= 5.8, others at zoom >= 7.2).

This replaces three separate duplicated loops that previously lived in: the marker effect cleanup, `handleClearRoute`, and the zoom listener body.

#### Mitt veður marker effect updated

- Early return path now calls `reconcilePlaceMarkerVisibility()` instead of being silent about place markers.
- Body when showing markers: replaced `weatherChaseActiveRef.current = true` + inline place marker loop with `reconcilePlaceMarkerVisibility()`. The marker effect no longer writes to `weatherChaseActiveRef`.
- Cleanup simplified to only `clearWeatherChaseMapMarkers()` — place marker reconciliation happens reactively via `routeActive` state.
- Added `routeActive` to the dependency array so the effect reruns when a route starts or is cleared.

This fixes Codex P1a: route cancel now triggers a marker effect rerun which rebuilds Mitt veður markers.

#### `handleClearRoute` updated

- Added `setRouteActive(false)` immediately after `routeActiveRef.current = false`.
- Replaced the inline place marker zoom loop with `reconcilePlaceMarkerVisibility()`.

This fixes Codex P1b: route cancel with Mitt veður items still selected now keeps place markers hidden because `reconcilePlaceMarkerVisibility` checks selection before restoring.

#### Zoom listener updated

`updateRoadMapPlaceMarkerVisibility()` (inside `map.on('load')`) now simply calls `reconcilePlaceMarkerVisibility()` instead of duplicating the threshold logic with a stale `weatherChaseActiveRef` check. This removes the P2 conflicting ref ownership for place-marker visibility.

#### Route activation block updated

Added `setRouteActive(true)` immediately after `routeActiveRef.current = true`.

### 2. Temperature + wind stepper standardization

Files: `components/weather/WeatherChasePanel.tsx`, `messages/is.json`, `messages/en.json`, `components/weather/RoadMapPrototypeMap.tsx`

#### `WeatherChaseLabels` type

Added four new required fields:
- `decreaseTemperatureLabel`
- `increaseTemperatureLabel`
- `decreaseWindLabel`
- `increaseWindLabel`

#### New state, refs, functions

Mirroring the existing precipitation stepper pattern exactly:

- `temperatureCriteriaValueRef` + `temperatureDraft` state
- `windCriteriaValueRef` + `windDraft` state
- `useEffect` to sync external `minTemperatureC` changes to `temperatureDraft`
- `useEffect` to sync external `maxWindMs` changes to `windDraft`
- `updateTemperatureCriteriaFromText(value)` — freeform text entry
- `stepTemperatureCriteria(delta: -1 | 1)` — steps by ±1, no floor (temperature can be negative)
- `updateWindCriteriaFromText(value)` — freeform text entry
- `stepWindCriteria(delta: -1 | 1)` — steps by ±1, floor at 0

#### JSX

Replaced the plain `<input type="number">` for temperature and wind with the precipitation stepper layout: `border bg-background px-1.5` wrapper, `-` button, centered `<input type="text">`, `+` button, unit label.

#### Message keys added

| File | Key | Value |
|------|-----|-------|
| is.json | `roadMapPrototypeWeatherChaseDecreaseTemperature` | Lækka hitastigsmark |
| is.json | `roadMapPrototypeWeatherChaseIncreaseTemperature` | Hækka hitastigsmark |
| is.json | `roadMapPrototypeWeatherChaseDecreaseWind` | Lækka vindmark |
| is.json | `roadMapPrototypeWeatherChaseIncreaseWind` | Hækka vindmark |
| en.json | `roadMapPrototypeWeatherChaseDecreaseTemperature` | Lower temperature limit |
| en.json | `roadMapPrototypeWeatherChaseIncreaseTemperature` | Raise temperature limit |
| en.json | `roadMapPrototypeWeatherChaseDecreaseWind` | Lower wind limit |
| en.json | `roadMapPrototypeWeatherChaseIncreaseWind` | Raise wind limit |

Labels object in `RoadMapPrototypeMap.tsx` (~line 5260) passes the four new `t()` calls.

## What was NOT changed

- `weatherChaseActiveRef` is still read by `updateOverviewMarkerVisibility()` to suppress overview station markers while the Mitt veður panel is open. That usage is correct and unchanged. The ref is no longer written by the marker effect.
- The JSON namespace key `eltaVedrid` was not renamed.
- No SQL, RLS, auth, Supabase, or production data changes.
- No tests were added in this release (see remaining risk below).

## Verification

- `npm run type-check` -> exit code 0.
- `npm run test:run` -> 129 files passed, 3577 tests passed, 27 skipped, 8 todo. Exit code 0.

## Commit

Committed and pushed to `main`.

## Remaining risk

- No unit tests cover the new `reconcilePlaceMarkerVisibility` logic or the `route -> cancel with selection` state matrix. The Codex P2 test gap remains open. Browser integration testing by Stebbi (localhost checks below) is the current verification path.
- `weatherChaseActiveRef` now has only one writer (the `isWeatherChaseOpen` effect). If a future change adds another writer, the P2 conflict could recur. Consider renaming to `isWeatherChasePanelOpenRef` to make the semantic explicit.

## Localhost checks for Stebbi

Page: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup: sign in as a user with prototype/road-intelligence feature access.

### Lifecycle checks (Codex P1/P2)

1. With no route and no Mitt veður selection: confirm overview markers and zoom-appropriate green place pills appear.
2. Select 2-3 Mitt veður items. Confirm weather cards appear, overview station markers disappear, green place pills disappear.
3. Zoom in and out. Confirm green place pills do not reappear.
4. Calculate a route while Mitt veður items remain selected. Confirm Mitt veður markers disappear and only route markers remain.
5. Cancel the route without changing the Mitt veður selection. Confirm Mitt veður markers return and green place pills remain hidden.
6. Calculate and cancel again after removing every Mitt veður item. Confirm normal overview and zoom-appropriate green place pills return.
7. Repeat steps 4-6 with the Mitt veður panel open and closed.
8. On mobile viewport, confirm no overlaps, overflow, or stale markers.

### Stepper checks

9. Open Mitt veður criteria. Confirm temperature and wind inputs now show centered text with − and + buttons, matching the precipitation stepper layout.
10. Tap − and + on temperature: confirm value steps by 1°C. Confirm it can go below 0 (negative temperatures valid).
11. Tap − on wind at 0: confirm value stays at 0 (floor).
12. Tap − and + on wind: confirm value steps by 1 m/s.
13. Type a decimal into temperature or wind manually: confirm it is accepted and saved.
14. Tap + on precipitation: confirm it still steps by 0.1 (unchanged).

Main regressions to watch:

- Stale or missing Mitt veður markers after route cancel.
- Green place pills reappearing during route transitions or zoom.
- Overview markers remaining hidden after all Mitt veður items removed.
- Temperature or wind stepper not updating criteria (dimming not responding).
