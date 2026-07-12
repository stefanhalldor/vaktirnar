# TODO 071 - v025 + v026 done - prerelease handoff

Created: 2026-07-12 09:54
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: prerelease handoff / localhost testing

## What was implemented

### v025 - forecastTimeIso stale fallback fix

`buildPointSummary` in `components/weather/travelAuditMap.helpers.ts`:

Before:
```ts
forecastTimeIso: dp?.forecastTimeIso ?? derived?.forecastTimeIso ?? pt.summaryForWindow?.forecastTimeIso
```

After:
```ts
forecastTimeIso: dp
  ? dp.forecastTimeIso
  : derived
    ? derived.forecastTimeIso
    : activeCandidate
      ? undefined
      : pt.summaryForWindow?.forecastTimeIso
```

This prevents showing a stale `summaryForWindow` forecast time when an active candidate is selected but no `forecastRows` exist for the point.

### v026 - Shared RouteWeatherPointDetailCard component

**New file: `components/weather/RouteWeatherPointDetailCard.tsx`**

Fragment-returning component used by both `PointDetailsPanel` and `RoutePointRow`. Renders:
- Punktur x/y + optional `headerExtra` slot (for status badges)
- Brottfarartími
- ETA + distance from leg start / origin
- Forecast point distance from road
- Forecast time at this place
- Full weather line: Vindur, Úrkoma, Hiti
- Threshold context line (e.g. `Vindur (3,3 yfir 10 m/s mörkum)`) when applicable
- Place label + coord (map panel only, when `placeLabel` provided)
- Links: Spá, Yr, Google Maps, Hrá met.no gögn

**New helpers in `components/weather/travelAuditMap.helpers.ts`**

- `ThresholdContext` type
- `buildThresholdContext(summary, thresholdsUsed, highlightedIssue)`:
  - For highlighted/worst points: uses server `highlightedIssue.value/thresholdValue`
  - For other points: `windMs >= redWindMs` uses red threshold; `windMs >= cautionWindMs` uses caution threshold; else null

**`PointDetailsPanel` in `TravelAuditMap.tsx`** refactored to thin wrapper:
- Keeps lazy geocode for place label
- Keeps worst vs selected title logic
- Delegates all detail content to `RouteWeatherPointDetailCard`
- Receives `thresholdsUsed` prop (was missing before)

**`RoutePointRow` in `FerdalagidClient.tsx`** rewritten:
- Uses `buildPointSummary` (replaces manual `haversineMeters` + `derivePointWeatherForCandidate` calls)
- Delegates all detail content to `RouteWeatherPointDetailCard`
- Passes `headerExtra` with wind status chip + special badges (worst point, nearest destination)

**Cleanup:**
- Removed orphaned `nearestForecastWindMs` function from `FerdalagidClient.tsx`
- Removed `haversineMeters` and `derivePointWeatherForCandidate` imports from `FerdalagidClient.tsx`
- Removed `useLocale`, `formatNum`, `getOriginDisplay` from `TravelAuditMap.tsx` (no longer needed after refactor)

### Other fixes (from v023 review)

- `PointDetailsPanel` always shows full weather line first; single-metric issue fallback only for no-data edge cases
- Button affordances: "Nota þessa leið" and "Reikna ferðina" now have `shadow-sm cursor-pointer hover:shadow-md hover:opacity-95 active:opacity-90 transition-all`
- Threshold submit button disabled + label "Veldu þín veðurmörk" when wind fields are empty
- `messages/is.json` + `messages/en.json`: added `"thresholdNotReadyLabel"`

## Files changed

```
components/weather/travelAuditMap.helpers.ts     — forecastTimeIso fix, ThresholdContext, buildThresholdContext
components/weather/RouteWeatherPointDetailCard.tsx  — NEW shared component
components/weather/TravelAuditMap.tsx            — PointDetailsPanel thin wrapper, thresholdsUsed prop
app/auth-mvp/vedrid/FerdalagidClient.tsx         — RoutePointRow rewrite, nearestForecastWindMs removed
components/weather/RouteSelectionStep.tsx        — button affordances
lib/__tests__/travelAuditMap.helpers.test.ts     — buildThresholdContext tests (5), forecastTimeIso assertion
messages/is.json                                 — thresholdNotReadyLabel
messages/en.json                                 — thresholdNotReadyLabel
```

## Tests

- 67 tests pass (`npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts`)
- TypeScript: no errors (`npm run type-check`)

## Localhost testing checklist for Stebbi

Open `/vedrid` and calculate a route where at least one point exceeds the selected wind threshold.

### 1. Worst point panel

- [ ] Title: "Mest krefjandi á leiðinni" (red/destructive badge)
- [ ] Shows Punktur x/y
- [ ] Shows Brottfarartími (if departure set)
- [ ] Shows ETA + distance from origin
- [ ] Shows forecast point distance from road
- [ ] Shows forecast time at this place
- [ ] Shows full weather line: Vindur · Úrkoma · Hiti
- [ ] Shows threshold excess line, e.g. `Vindur (3,3 yfir 10 m/s mörkum)`
- [ ] Links: Spá (opens drawer), Yr, Google Maps, Hrá met.no gögn all work

### 2. Manually selected map point

- [ ] Title changes to "Valin veðurspá" (plain font-medium)
- [ ] Same content structure as worst point
- [ ] Threshold excess line appears if displayed wind exceeds threshold
- [ ] No threshold line for safe/green points
- [ ] No timestamp chip on the map marker itself
- [ ] "Spá" still opens forecast drawer

### 3. Allir spápunktarnir á leiðinni

- [ ] Cards still have status-colored backgrounds/borders (green/amber/red)
- [ ] Point title: "Punktur x/y"
- [ ] Wind status chip appears (e.g. "Innan marka", "Gættu þín", "Yfir mörkum")
- [ ] Special badges appear: "Versti punktur", "Næst áfangastað" where applicable
- [ ] Same weather/time/link/detail structure as panel
- [ ] Threshold excess line appears on over-threshold points
- [ ] No excess line on safe/green points
- [ ] "Spá" opens forecast drawer

### 4. Button affordances

- [ ] "Reikna ferðina" looks clearly clickable (shadow, pointer cursor, hover effect)
- [ ] "Nota þessa leið" looks clearly clickable
- [ ] Both show disabled state correctly when applicable

### 5. Threshold submit button

- [ ] When wind threshold fields are empty: button shows "Veldu þín veðurmörk" and is disabled
- [ ] Once both fields have values: button shows normal label and is enabled

### 6. Regression

- [ ] Mobile layout does not overflow horizontally on any panel
- [ ] No console errors

## No SQL / auth / Supabase changes in this session
