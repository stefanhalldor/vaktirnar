# Handoff: TODO #75 v035 - Remove gusts from travel weather

Created: 2026-07-09 21:53
Timezone: Atlantic/Reykjavik
Status: New product correction / implementation handoff - not implemented by Codex

## Critical new information from Stebbi

Stebbi received important information: the forecast data currently used by the travel-weather feature does **not** show gusts.

Therefore, Teskeið must not display, configure, warn on, compare, or decide travel weather based on gusts until the product has a verified data source for real gust forecasts.

This is not a small copy tweak. It is a correctness issue.

## Product rule

Remove all user-facing and decision-making gust behavior:

- No `hviður` / `gusts` copy in UI.
- No gust threshold input.
- No gust value in forecast drawer.
- No gust value in origin/destination comparison.
- No gust value in selected departure summary, destination weather, route point detail, or map cards.
- No gust metric deciding whether a departure is green/yellow/red.
- No "gust over threshold" warnings.
- No thresholds summary that mentions gusts.

The system may keep temporary internal compatibility fields only if removing them is too risky in one pass, but those fields must not affect output or UI. If compatibility fields remain, mark them clearly as deprecated/internal and set them from wind only.

## Current places to fix

Search result highlights from current code:

### Copy/messages

- `messages/is.json`
  - `betaBannerBody` mentions `hviður`
  - `resultLoadingStepWeather` mentions `hviður`
  - `metricGust`
  - `forecastGustAbbr`
  - `forecastGustNearLimit`
  - `forecastGustOverLimit`
  - `howAssessedShort` mentions `hviður`
  - `thresholdRedGust`
  - `thresholdsCustom`
  - `thresholdSummaryLine`
  - `stepNavThresholdSummaryAria`
- `messages/en.json`
  - same gust-related keys/copy.

Expected new copy direction:

- `resultLoadingStepWeather`: "Ber saman vind og úrkomu"
- `howAssessedShort`: remove hviður from the list.
- `thresholdSummaryLine`: "Veðurmörk: vindur {caution}/{red} m/s · úrkoma {precip} mm/klst"
- `thresholdsCustom`: "vindur {caution}/{red} m/s, úrkoma {precip} mm/klst"
- `stepNavThresholdSummaryAria`: "Veðurmörk: vindur {caution}/{red} m/s, úrkoma {precip} mm/klst"
- Beta banner can still mention wind direction/crosswind/trailer if useful, but not gusts unless we have data.

Delete unused gust message keys if they become unused, or leave only if needed during a staged cleanup. No user-facing gust strings should remain in active UI.

### Forecast parsing

- `lib/weather/forecast.ts`
  - currently reads `wind_speed_of_gust?: number`
  - currently sets `windGustMs: d.wind_speed_of_gust ?? d.wind_speed ?? 0`

Because the current product data should not be treated as gust-capable:

- Do not rely on `wind_speed_of_gust` for product behavior in this feature.
- Preferred: remove `wind_speed_of_gust` parsing and `windGustMs` from `HourPoint` in a cleanup pass.
- If removing `windGustMs` from all types is too broad for this patch, set `windGustMs` equal to `windSpeedMs`, stop using it everywhere, and add a short comment explaining it is compatibility-only until real gust data is available.

### Thresholds / settings

- `lib/weather/thresholds.ts`
  - `redGustMs` exists under driving/heavyTrailer/caravan.
  - `resolveThresholds` returns `redGustMs`.
  - `deriveThreshold` has a `gust` branch.
- `lib/weather/types.ts`
  - `TravelThresholdOverrides.redGustMs`
  - `ResolvedTravelThresholds.redGustMs`
- `app/api/teskeid/weather/travel/route.ts`
  - validates `redGustMs`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - has draft red gust state/input.
  - shows `thresholdRedGust`.
  - formats nav threshold as `{caution}/{red}/{gust}`.

Expected:

- Remove gust threshold input from UI.
- Remove `redGustMs` from persisted/submitted overrides if possible.
- Server should ignore legacy `redGustMs` in request bodies if present, or at least not use it.
- Update thresholds validation/order logic to only validate wind caution < wind red, plus precipitation bounds.
- Presets should include wind and precipitation only.

### Travel assessment logic

Files:

- `lib/weather/travel.ts`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/TravelAuditMap.tsx`

Current behavior includes:

- `evalDrivingLeg(wind, gust, precip, ...)`
- `worstGust`
- `metric: 'gust'`
- displayPoint `gustMs`
- arrival weather `gustMs`
- highlighted issue can be `gust`
- summary can display gust if `gustMs > windMs`
- route point `summaryForWindow.worstGustMs`

Expected:

- Travel assessment should use wind speed and precipitation only.
- `evalDrivingLeg` should no longer accept or evaluate gust.
- Candidate decisive metric should be `'wind' | 'precipitation' | 'data'`; no gust.
- Any "worst wind-related" selection should choose wind, not max(wind, gust).
- Display point should contain wind/precip/temp/forecast time, no gust.
- Arrival weather should contain wind/precip/temp/status, no gust.
- Map and point detail should never show gust.
- If types still contain optional gust fields for compatibility, do not populate them into UI.

### Forecast drawer and comparison UI

Files:

- `components/weather/ForecastDrawer.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Current UI shows:

- gust sublines in wind cells
- `gustMetricClass`
- origin/destination visual comparison gust rows
- detail drawer gust rows
- warning markers for gust thresholds

Expected:

- Wind cell only shows wind speed and wind trend.
- Forecast drawer columns should be: time, temperature, wind, precipitation.
- No gust subline.
- Remove `gustMetricClass` or leave unused only if TypeScript demands it temporarily.
- Comparison strip/detail should show temperature first, then wind, precipitation; no gust.
- Any color logic for wind/precip/temp should remain.

### Weather tools / older helpers

Files:

- `lib/weather/tools.ts`

Current text/tool logic mentions or evaluates gusts:

- golf windows include `maxGustMs`
- caravan/trailer summaries include hviður
- `too windy` may use gust.

Expected:

- Remove gust from user-visible tool strings and decision logic unless these tools are truly using a verified gust-capable data source. Based on Stebbi's new information, assume they are not.
- If a broader cleanup is risky, create a follow-up TODO for non-travel helper cleanup and clearly state what remains. But travel-weather UI must be corrected now.

## Implementation guidance

Use a staged but honest cleanup:

### Phase 1, must ship before next weather release

1. Remove gust from all user-visible travel-weather UI and copy.
2. Remove gust threshold input and threshold summaries.
3. Remove gust from travel-weather decision-making.
4. Ensure API ignores legacy `redGustMs` and no longer requires or validates it for current clients.
5. Update tests that assert gust behavior.

### Phase 2, cleanup if Phase 1 leaves compatibility fields

1. Remove `windGustMs`, `worstGust`, `gustMs`, `ForecastDrawerGustCell`, `GustSeverity`, `metric: 'gust'` from shared types.
2. Remove old tests dedicated to gust thresholds.
3. Remove dead messages.

If Claude Code can do full cleanup safely in one pass, that is fine. If not, Phase 1 correctness is the priority.

## Tests to update

Likely affected tests include:

- `lib/__tests__/weather-forecast.test.ts`
- `lib/__tests__/weather-travel.test.ts`
- `lib/__tests__/weather-tools.test.ts`
- `lib/__tests__/travelAuditMap.helpers.test.ts`
- any component tests covering `FerdalagidClient`, forecast drawer, comparison strip, threshold summaries.

Remove or rewrite tests that expect:

- red gust thresholds,
- gust decisive metric,
- gust subline display,
- gust warning colors,
- `wind_speed_of_gust` parsing.

Add or update tests to assert:

- threshold summary has wind and precipitation only.
- custom threshold UI has no gust input.
- selected summary/detail cards show wind, precipitation, temperature only.
- weather status is decided by wind and precipitation only.
- legacy `redGustMs` in API payload does not crash and does not affect result.

## Release risk

High if left unfixed:

- The UI currently implies Teskeið knows and evaluates wind gusts.
- If the underlying data does not include gusts, this is misleading in a safety-adjacent travel-weather tool.
- It can make warnings, thresholds and explanations look more precise than they are.

Preferred release stance:

- Treat this as a release blocker for weather UI that mentions hviður/gusts.

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `http://localhost:3004/auth-mvp/vedrid`.
2. Start a normal route forecast.
3. Confirm the weather threshold/settings UI has no hviður/gust field.
4. Confirm threshold summary near the departure scrubber mentions only wind and precipitation.
5. Confirm loading/status copy no longer says hviður/gusts.
6. Confirm the selected departure summary box shows:
   - wind
   - precipitation
   - temperature where applicable
   - no gust line or gust label.
7. Open `Spá 🥄` / forecast drawer for a point.
8. Confirm the drawer has no gust subline in wind cells.
9. Confirm origin/destination comparison has no gust rows or sublines.
10. Confirm route point detail cards and "Allir spápunktarnir" cards have no gust values.
11. Try trailer/custom threshold flow and confirm nothing asks for gust limits.
12. Run at 360-390 px mobile width and confirm the removed gust rows did not leave blank rows, awkward spacing, or missing separators.

Important: do not test by assuming a hidden gust value exists. The product must behave as if gust data is unavailable.

## Commands before handoff back to Codex

```bash
npm run type-check
npm run test:run
npm run build
```

If `test:run` is too broad or slow, Claude Code should at minimum run targeted weather tests plus `type-check` and `build`, and explain what was not run.

## Not part of this task

- No SQL migration.
- No Supabase/RLS/auth changes.
- No production data changes.
- No route-provider changes.
- No Mapbox/routing fidelity work.
- No deploy unless Stebbi explicitly asks.
