# Handoff: todo-067 v127 — Claude forecast-point distance

**Date:** 2026-07-07 10:20
**From:** Claude (Sonnet 4.6)
**To:** Codex or next Claude session
**Branch:** main

---

## What was done

Implemented the forecast-point distance display feature from Codex v127.

### Feature: forecast grid point distance from route

In the selected point details panel (`TravelAuditMap.tsx` `PointDetailsPanel`), the vague explanatory sentence:

> "Veðurmatið notar spá fyrir þennan met.no punkt. Hann getur verið örlítið frá veginum því spáin er á hnitaneti."

is replaced with a concrete distance-aware sentence:

- `< 50 m`: `Spápunkturinn er nánast á leiðinni.`
- `< 1000 m`: `Spápunkturinn er um {meters} m frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`
- `>= 1000 m`: `Spápunkturinn er um {kilometers} km frá leiðinni. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`

km values use `formatNum` for locale-aware decimal (comma for Icelandic).

---

### Implementation details

**`components/weather/travelAuditMap.helpers.ts`**:
- Added `forecastDistanceFromRouteM: number` field to `PointSummary` type
- In `buildPointSummary`: computed using existing private `haversineMeters(getRoutePointLatLng(pt), getForecastPointLatLng(pt))`, rounded to nearest meter

**`components/weather/TravelAuditMap.tsx`**:
- Replaced `tf('forecastPointExplanation')` with 3-branch conditional using `summary.forecastDistanceFromRouteM`
- `< 50m` branch uses `forecastPointOnRoute`
- `< 1000m` branch uses `forecastPointDistanceMeters` with `{ meters }` param
- `>= 1000m` branch uses `forecastPointDistanceKilometers` with `{ kilometers: formatNum(m / 1000, locale) }` param

**`messages/is.json`** and **`messages/en.json`**:
- Removed `forecastPointExplanation`
- Added `forecastPointOnRoute`, `forecastPointDistanceMeters`, `forecastPointDistanceKilometers`

**`lib/__tests__/travelAuditMap.helpers.test.ts`**:
- 3 new tests in `buildPointSummary` describe:
  1. Same coords → `forecastDistanceFromRouteM === 0`
  2. Far coords → `forecastDistanceFromRouteM > 1000`
  3. Known ~2km offset → distance in expected range (1500–3500m)

---

## Test results

- `npm run type-check` — clean
- `npm run test:run` — 1759 passed / 27 skipped / 8 todo (53 files)

Previous baseline: 1756. +3 new tests.

---

## Files changed

```
components/weather/travelAuditMap.helpers.ts   — forecastDistanceFromRouteM in PointSummary + buildPointSummary
components/weather/TravelAuditMap.tsx          — 3-branch distance sentence replaces forecastPointExplanation
messages/is.json                               — forecastPointOnRoute/DistanceMeters/DistanceKilometers
messages/en.json                               — same keys in English
lib/__tests__/travelAuditMap.helpers.test.ts   — 3 forecastDistanceFromRouteM tests
```

---

## Note on `< 50m` branch

`hasSeparateForecastPoint` uses a 50m tolerance (in `shouldShowForecastPointMarker`), so the `forecastPointOnRoute` branch is currently unreachable — the panel section is only shown when distance > 50m. The branch is included for correctness and in case the threshold is adjusted in future.

---

## Remaining known gap

The v119/v121 active-candidate forecast timestep in map chips / panel still not implemented. Larger data-model work, deferred.
