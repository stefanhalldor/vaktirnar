# TODO-071 v018 - Codex handoff - active slot weather details regression

Created: 2026-07-08 17:45
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Ready for Claude Code implementation. Stebbi explicitly asked Codex to follow workflow, create TODO/handoff, and let Claude Code fix according to this.

## Context

Stebbi tested localhost after the v014/v016 active-slot changes and found two regressions:

1. In `Allir spapunktarnir a leidinni`, selected-slot detail cards now lose the detailed weather values. They show point number/status, distance, ETA and forecast-point distance, but not:
   - `Vedurspa a thessum stad kl. HH:MM`
   - `Vindur ... · Urkoma ... · Hiti ...`
2. The map panel card `Mest krefjandi a leidinni` shows only one decisive metric, for example:
   - `Vindur: 10 m/s`
   but it should show the full values when data exists:
   - `Vindur: 10 m/s · Urkoma: 0 mm/klst · Hiti: 10,3°C`

Stebbi noted that the data is clearly available because the top departure summary card already shows the full active-slot line:

```text
Vindur: 10 m/s · Urkoma: 0 mm/klst · Hiti: 10,3°C
```

I updated `TODO.md` under #71 with this regression/follow-up requirement.

## Important constraint from previous reviews

Do **not** fix this by reusing `summaryForWindow` blindly in active-candidate mode.

The previous bug was that `summaryForWindow` could belong to a different/default departure window. When the user explicitly selects a heatmap slot, displayed weather details must come from active-slot-safe data:

- preferably `activeCandidate.displayPoint`, when the row/panel matches that route point;
- or another explicitly active-candidate-safe data source;
- no stale default summary values for a different departure time.

No-data points should still avoid stale weather metrics and show the no-data detail copy.

## Likely root cause

### Detail list rows

`RoutePointRow` in `app/auth-mvp/vedrid/FerdalagidClient.tsx` suppresses all weather metrics in active mode:

- active mode detection: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1173-1175`
- ETA uses active candidate correctly: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1200-1203`
- active mode render currently only shows no-data copy for no-data points: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1223-1227`
- full wind/precip/temp rendering exists only in the non-active `summaryForWindow` branch: `app/auth-mvp/vedrid/FerdalagidClient.tsx:1228-1246`

So when a slot is explicitly selected, even the candidate's own decisive `displayPoint` does not show its `forecastTimeIso`, `windMs`, `precipMmPerHour` or `airTemperatureC`.

### Map panel / "Mest krefjandi a leidinni"

`PointDetailsPanel` in `components/weather/TravelAuditMap.tsx` intentionally switches to `highlightedIssue.value` for highlighted issue rows:

- `hasIssueValues`: `components/weather/TravelAuditMap.tsx:630-637`
- issue-only render: `components/weather/TravelAuditMap.tsx:697-704`
- full wind/precip/temp render only happens in the fallback branch: `components/weather/TravelAuditMap.tsx:705-718`

`highlightedIssue.value` is only the decisive metric from `candidateToIssue`, so it cannot show the full weather line.

But active-slot full values already exist:

- `displayPoint` is built with `windMs`, `gustMs`, `precipMmPerHour`, `airTemperatureC`, `forecastTimeIso` and route index: `lib/weather/travel.ts:145-170`
- `DepartureHeatmap` already uses `candidate.displayPoint` to render the full line: `components/weather/DepartureHeatmap.tsx:299-327`
- `buildPointSummary` already knows how to use `activeCandidate.displayPoint` when the selected point matches: `components/weather/travelAuditMap.helpers.ts:306-341`

The subtle issue in `buildPointSummary`: if `isHighlighted` is true, `isDisplayPoint` is currently forced false:

```ts
const isDisplayPoint = !isHighlighted && activeCandidate?.displayPoint?.routeIndex === pt.routeIndex
const showSummaryMetrics = !activeCandidate || isHighlighted
```

That likely makes the highlighted/worst point prefer `summaryForWindow` / `highlightedIssue` behavior instead of the active candidate display point, exactly where Stebbi now sees only `Vindur: 10 m/s`.

## Recommended implementation

Keep this narrowly scoped.

### 1. Create/reuse one active-candidate-safe formatting source

Prefer a small helper/model rather than duplicating display-point logic in both `RoutePointRow` and `PointDetailsPanel`.

Possible shape:

```ts
type ActivePointWeatherDetails = {
  forecastTimeIso: string
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC?: number
}
```

Helper idea:

```ts
function activeDisplayPointForRouteIndex(
  candidate: TravelCandidate | undefined,
  routeIndex: number,
): CandidateDisplayPoint | undefined {
  return candidate?.displayPoint?.routeIndex === routeIndex
    ? candidate.displayPoint
    : undefined
}
```

Use existing types from `lib/weather/types.ts`; do not invent incompatible payload fields.

### 2. Fix `RoutePointRow`

When `isActiveMode`:

- If `activeStatus === 'no_data'`, keep the no-data copy and do not show stale metrics.
- Else if `activeCandidate.displayPoint?.routeIndex === pt.routeIndex`, show:
  - `pointForecastHereAt` using `displayPoint.forecastTimeIso`
  - `Vindur: X m/s`
  - optional `Hvidur: Y m/s` when `gustMs > windMs`
  - `Urkoma: X mm/klst`
  - `Hiti: X°C` when available
- Else keep suppressing metrics for non-display points in active mode, because there may not be active-slot-safe full weather values for every point yet.

This directly restores details for the selected slot's decisive point without reintroducing stale `summaryForWindow`.

### 3. Fix `PointDetailsPanel` / map panel

For the highlighted/worst point, if `activeCandidate.displayPoint` matches the panel route index, prefer full displayPoint values over the single `highlightedIssue.value`.

Implementation options:

- Adjust `buildPointSummary` so displayPoint can win even when the point is highlighted.
- Or pass enough information into `PointDetailsPanel` to render displayPoint values.

I prefer adjusting `buildPointSummary` because it already centralizes panel display values:

- Let `isDisplayPoint = activeCandidate?.displayPoint?.routeIndex === pt.routeIndex`
- Use `dp` values whenever present.
- Preserve `highlightedIssue` for label/distance/threshold context if needed, but do not let it downgrade the weather line to one metric when `dp` has full values.
- Ensure no stale `summaryForWindow` leaks for active-candidate non-display points.

Expected result for Stebbi's screenshot:

```text
Mest krefjandi a leidinni
Punktur 57/58
Brottfarartimi: kl. 23:36
Aatladur timi 50 km fra Gardsabae: kl. 00:19
Spapunktur um 20 m fra veginum.
Vedurspa a thessum stad kl. 01:00
Vindur: 10 m/s · Urkoma: 0 mm/klst · Hiti: 10,3°C
```

### 4. Preserve earlier #71 requirements

Do not regress:

- forecast point distance line
- `Allir spapunktarnir a leidinni` title/copy
- colored cards
- no-data copy for insufficient data
- hlekkir: `Skoda vedurspa`, `Opna a korti`, `Hra met.no gogn`
- explicit slot ETA behavior
- default summary mode after route calculation when no slot has been explicitly clicked

## Tests to add or update

At minimum, add focused tests around existing helpers if possible:

- `buildPointSummary` should use `activeCandidate.displayPoint` values when route index matches, even if the point is also highlighted.
- `buildPointSummary` should still suppress stale `summaryForWindow` values for active-candidate non-display points.
- Existing tests around displayPoint should remain green:
  - `lib/__tests__/travelAuditMap.helpers.test.ts`
  - `lib/__tests__/weather-travel.test.ts`

If component testing `RoutePointRow` is awkward because it is local to `FerdalagidClient.tsx`, do not over-refactor just for tests. A small extracted helper for choosing active weather details is acceptable if it reduces duplication and is testable.

## Files likely touched

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/__tests__/travelAuditMap.helpers.test.ts`
- maybe `messages/is.json` and `messages/en.json` only if new copy is truly needed

Avoid touching route provider, SQL, Supabase, auth, RLS, admin analytics, saved places, Vercel env vars, commit, push or deploy in this fix.

## Commands to run

```bash
npm run type-check
npm run test:run
git diff --check
```

Do not start/restart localhost; Stebbi runs it.

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid`.

1. Calculate `Gardsabaer -> Akranes`.
2. Select an uncomfortable heatmap slot that shows a full line in the top departure card, e.g. `Vindur: 10 m/s · Urkoma: 0 mm/klst · Hiti: 10,3°C`.
3. Check the map panel `Mest krefjandi a leidinni`.
4. Expected: it shows forecast point distance, forecast time, and the full weather line with wind, precipitation and temperature.
5. Open `Allir spapunktarnir a leidinni`.
6. Find the same point, e.g. `Punktur 57/58`.
7. Expected: it shows `Vedurspa a thessum stad kl. HH:MM` and `Vindur · Urkoma · Hiti` for the selected active slot.
8. Check nearby green/detail points.
9. Expected: no stale summary metrics appear for points that do not have active-slot-safe details. If the chosen point is not the display point, it is acceptable to omit weather metrics rather than show wrong-time values.
10. Select a no-data/insufficient-data slot.
11. Expected: no-data rows still show the no-data detail copy and do not show old wind/precip/temp values.
12. Deselect the heatmap slot or calculate a fresh route.
13. Expected: default summary mode still shows rich `summaryForWindow` metrics for all rows.
14. Check mobile widths 360, 390 and 460 px for wrapping, no horizontal overflow and readable card density.

No Supabase, auth, RLS, secrets, SQL, migration, billing, Vercel, commit, push or deploy should be touched during these checks.

## Open question for Claude Code

If active-candidate-safe full weather values are only available for `displayPoint`, keep the implementation honest and only show them there. Do not fabricate full weather lines for every point unless the payload already contains per-point active-slot forecast values.
