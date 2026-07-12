# Handoff: TODO #071 v022 — Prerelease

**Date:** 2026-07-12
**Session:** Claude
**Status:** Ready for localhost testing. No commit yet.
**Related TODO:** #71 Veður: allir spápunktar og fjarlægð frá vegi

---

## What was implemented

### 1. Timestamp chips removed from map canvas

`components/weather/TravelAuditMap.tsx`:

- Removed `makeTimeLabelSvg()` function
- Removed `chipMarkersRef` ref
- Removed chip marker cleanup from init effect cleanup function
- Removed entire chip creation block from the marker update effect (the block that created floating `HH:mm` SVG markers over route point dots)

The marker update effect still updates dot colors, ✓/! labels, visibility, and selected state. Only the floating timestamp chips are gone.

### 2. Shared `derivePointWeatherForCandidate` helper added

`components/weather/travelAuditMap.helpers.ts`:

- Added `ForecastDrawerRow` to imports
- Added `DerivedPointWeather` type
- Added `derivePointWeatherForCandidate(pt, candidate, leg)` function:
  - Computes ETA with `estimatePointEtaIso`
  - Finds nearest `forecastRows` entry by time delta
  - Returns `{ windMs, gustMs, precipMmPerHour, airTemperatureC, forecastTimeIso, etaIso }` or `null` if no forecastRows

### 3. `buildPointSummary` uses `derivePointWeatherForCandidate`

Old suppression logic (`showSummaryMetrics = !activeCandidate || ...`) removed. New priority order:

1. `dp` (displayPoint match) — active-candidate-safe server values
2. `derived` (non-displayPoint, activeCandidate present, forecastRows available) — nearest row to ETA
3. `activeCandidate` present but no forecastRows — zeros/undefined (no stale summaryForWindow)
4. No activeCandidate — summaryForWindow fallback

### 4. `RoutePointRow` in FerdalagidClient.tsx shows full weather for all active points

Old code: only showed weather when `pt.routeIndex === activeCandidate.displayPoint?.routeIndex`; returned `null` for all other active points.

New code: imports `derivePointWeatherForCandidate` and uses it for non-displayPoint active points. Renders forecast time + wind/precip/temp for any point with forecastRows.

### 5. Tests updated

`lib/__tests__/travelAuditMap.helpers.test.ts`:

- Replaced `'hides summaryForWindow metrics for a non-matching point when activeCandidate present'` with two new tests:
  - `'uses nearest forecastRows ETA values for a non-displayPoint active-candidate point'`
  - `'returns zero metrics for a non-displayPoint active-candidate point with no forecastRows'`
- Added new `describe('derivePointWeatherForCandidate')` block with 5 tests covering null returns, nearest row selection, etaIso computation, and return leg logic

**Result: 62/62 tests pass. `tsc --noEmit` clean.**

---

## Localhost checks for Stebbi

Prerequisites:

- Run localhost as usual
- Use `/auth-mvp/vedrid` logged-in or `/vedrid` public
- Pick a route with many weather points, e.g. Garðabær to Akranes or a longer route

Checks:

1. Reikna ferð, bíða eftir niðurstöðu
2. Horfa á kortið: **expected: engir svartir/dökk `HH:mm` klukkutíma-chipes yfir punktamörkum**
3. Punktamörkin sjálf (litaðir hringir) eru enn til staðar og klikkanlegar
4. Klicka á versta punkt (sjálfvalinn): **expected: full gögn — vindur, úrkoma, hiti, spátími**
5. Klicka á annan punkt sem er ekki versti punktur: **expected: sama gögnaform — vindur/úrkoma/hiti, ekki tómt**
6. Breyta brottfarartíma í skrubbaranum
7. **Expected: valinn punktur uppfærir sig með nýjum ETA og spágildum — ekki gömul summaryForWindow gildi**
8. Opna "Allir spápunktarnir á leiðinni"
9. **Expected: allir punktar með gögn sýna vindur/úrkoma/hiti — ekki bara displayPoint**
10. Prófa á 360-460px breidd: engin lárétt yfirflæði, linkarnir brjótast náttúrulega

---

## Files changed

- `components/weather/travelAuditMap.helpers.ts` — `derivePointWeatherForCandidate` + updated `buildPointSummary`
- `components/weather/TravelAuditMap.tsx` — chip markers removed
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `RoutePointRow` uses `derivePointWeatherForCandidate`
- `lib/__tests__/travelAuditMap.helpers.test.ts` — tests updated

No SQL, RLS, auth, Supabase, or message string changes.
