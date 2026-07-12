# TODO 071 - Shared weather point detail component

Created: 2026-07-12 09:34  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Type: implementation handoff / refactor plan for Claude Code

## Context

Stebbi spotted a mismatch in the route weather point detail UI:

- The worst point card shows threshold context, for example `Vindur (3,3 yfir 10 m/s mörkum)`.
- The manually selected map point does not show the same threshold context.
- The "Allir spápunktarnir á leiðinni" cards are a third implementation and can drift from both.

This is exactly the kind of divergence we should remove now. These three surfaces represent the same concept: a route weather point detail. They should share one component and one data/view-model builder.

## Product Requirement

Create one reusable component for route weather point details and use it in all three places:

1. Worst point above/below the map: title/badge `Mest krefjandi á leiðinni`.
2. Manually selected point on the map: title `Valin veðurspá`.
3. List rows under `Allir spápunktarnir á leiðinni`: keep list card/status background styling and point title `Punktur x/y`.

The only intended differences should be presentation wrapper differences:

- Worst point gets the special red/destructive label.
- All-points rows keep their colored card background/border according to weather status.
- Selected map point can keep the title `Valin veðurspá`.

Otherwise the content must be materially identical:

- `Punktur x/y`
- departure time
- ETA and distance from leg start / origin
- forecast point distance from road
- forecast time at this place
- full weather line: wind, precipitation, temperature
- threshold context line when applicable, e.g. `Vindur (3,3 yfir 10 m/s mörkum)`
- `Spágildi notað`
- same links: `Spá`, `Yr`, `Google Maps`, `Hrá met.no gögn`

## Validation Against Current Data Flow

I validated this against the current code/data model. No new API call or new server data appears necessary.

Relevant current data:

- `TravelAuditMap` already receives:
  - `weatherPoints`
  - `highlightedIssue`
  - `selectedCandidatePointStatuses`
  - `activeCandidate`
  - `activeLeg`
  - `thresholdsUsed`
  - `onOpenForecastDrawer`
- `RoutePointRow` already receives:
  - `pt`
  - `activeCandidate`
  - `activeLeg`
  - `selectedCandidatePointStatuses`
  - `thresholdsUsed`
  - `onOpenForecast`
- `RouteWeatherPoint` already contains:
  - route coordinates and forecast coordinates
  - `distanceFromOriginM`
  - `routeFraction`
  - `forecastRows`
  - `summaryForWindow`
  - `yrnoUrl`, `googleMapsUrl`, `metnoUrl`
- `TravelIssue` already contains the worst-point threshold context:
  - `metric`
  - `value`
  - `unit`
  - `thresholdValue`
  - `thresholdUnit`
  - `timeIso`
  - `distanceFromLegStartM`
  - `legStartName`
- `derivePointWeatherForCandidate()` already derives active-candidate-safe wind/precip/temp/forecast-time values for non-display route points.
- `buildPointSummary()` already normalizes most of what `PointDetailsPanel` needs.

Conclusion: the blocker is not missing data. The blocker is duplication of presentation and view-model logic.

## Current Duplication

### Map selected/worst point

`components/weather/TravelAuditMap.tsx` contains `PointDetailsPanel`.

It already handles the rich canonical detail display, including the threshold line:

```tsx
{hasIssueValues && highlightedIssue!.thresholdValue !== undefined && highlightedIssue!.value! > highlightedIssue!.thresholdValue && (
  <p className="text-muted-foreground/70 text-[11px]">
    {issueMetricLabel} {tf('aboveThresholdWithExcess', ...)}
  </p>
)}
```

But `hasIssueValues` is tied to `summary.isHighlighted`, so a manually selected point does not get this context even if the displayed wind is over a user-defined threshold.

### All route points

`app/auth-mvp/vedrid/FerdalagidClient.tsx` contains `RoutePointRow`.

It separately derives weather values and renders a parallel-but-not-identical point detail. This is why the list can drift from the map panel.

## Proposed Implementation

### 1. Extract a shared view model

Create a shared helper, either by extending `components/weather/travelAuditMap.helpers.ts` or by adding a focused file such as:

```txt
components/weather/routeWeatherPointDetail.model.ts
```

Suggested model:

```ts
export type RouteWeatherPointDetailModel = {
  routeIndex: number
  totalPoints: number
  titleVariant: 'worst' | 'selected' | 'list'
  isOrigin: boolean
  isDestination: boolean
  distanceFromOriginKm: number
  legStartName?: string
  distanceFromLegStartKm?: number
  departureIso?: string
  etaIso?: string
  forecastTimeIso?: string
  forecastDistanceFromRouteM: number
  windMs?: number
  precipMmPerHour?: number
  airTemperatureC?: number
  thresholdContext?: {
    metric: 'wind' | 'precipitation'
    labelKey: 'metricWind' | 'metricPrecip'
    value: number
    unit: 'm/s' | 'mm/klst'
    thresholdValue: number
    thresholdUnit: 'm/s' | 'mm/klst'
    excess: number
  }
  status?: WindDisplayStatus
  yrnoUrl: string
  googleMapsUrl: string
  metnoUrl: string
  canOpenForecast: boolean
}
```

Do not reintroduce gust/hviður into the visible UI here. The current user-facing threshold model is wind-first and the disclaimer tells users to check hviður on Vegagerðin.

### 2. Normalize threshold context once

Add one small helper for threshold context.

For the worst point:

- Prefer `highlightedIssue.thresholdValue`, `highlightedIssue.value`, `highlightedIssue.unit`.
- This preserves the current canonical line.

For selected/list points:

- Use the displayed weather value from the same forecast hour being rendered.
- Use `thresholdsUsed` to determine the relevant threshold.
- Suggested wind rule:
  - if `windMs >= redWindMs`, compare against `redWindMs`
  - else if `windMs >= cautionWindMs`, compare against `cautionWindMs`
  - else no "yfir mörkum" threshold line
- If precipitation thresholds are still active in existing server logic, keep support behind the same normalized helper, but do not add new visible complexity unless current product already shows it.

Important: the threshold context line must be generated from the same values the card displays. Do not mix selected-departure values with `summaryForWindow`.

### 3. Extract shared component

Create a shared component, for example:

```txt
components/weather/RouteWeatherPointDetailCard.tsx
```

It should render the canonical detail content once.

Suggested props:

```ts
type RouteWeatherPointDetailCardProps = {
  detail: RouteWeatherPointDetailModel
  originName: string
  destinationName: string
  variant: 'worst' | 'selected' | 'list'
  className?: string
  statusClassName?: string
  onOpenForecast?: () => void
}
```

The component should own:

- all detail row ordering
- all threshold copy
- all links
- all forecast distance formatting
- all forecast time formatting
- all "Spágildi notað" display

Parents should only decide:

- which point is selected
- which variant/title applies
- which background/status class wrapper applies
- whether `onOpenForecast` exists

### 4. Replace the three current render paths

Use the shared component in:

1. `TravelAuditMap.tsx`
   - replace or shrink `PointDetailsPanel`
   - keep lazy place label only if still wanted, but avoid making it a reason to keep a separate component
   - worst vs selected should be variant only

2. `FerdalagidClient.tsx`
   - replace `RoutePointRow` internal detail rendering with the shared component
   - keep the colored list card wrapper/status calculation, but delegate content to the shared component

3. Any existing detail tests/helpers
   - update tests to assert one shared model output rather than copying expectations across implementations

### 5. Preserve card visual differences only where intended

For "Allir spápunktarnir á leiðinni":

- keep colored background/border based on status
- keep status chip if it exists today
- but the detail text itself should be the same as the shared component output

For "Mest krefjandi":

- keep special `Mest krefjandi á leiðinni` label
- same content and threshold context as shared component

For "Valin veðurspá":

- use `Valin veðurspá` title
- same content and threshold context as shared component

## Tests To Add / Update

Please add tests around the shared model/helper, not just rendered snapshots.

Minimum tests:

1. Worst point with `highlightedIssue.value = 13.3`, `thresholdValue = 10`, `unit = 'm/s'` returns threshold context with excess `3.3`.
2. Selected non-worst point with active candidate and `windMs = 13.3`, `thresholdsUsed.cautionWindMs = 10`, `redWindMs = 15` returns the same threshold context.
3. All-points/list point with same displayed wind and thresholds returns the same threshold context.
4. A point below caution threshold returns no threshold context.
5. The same displayed point detail model has identical weather/link/time fields for `selected` and `list` variants when built from the same `RouteWeatherPoint` + active candidate.

Keep the existing `travelAuditMap.helpers.test.ts` coverage for `derivePointWeatherForCandidate()` and active-candidate stale fallback.

Also keep or add the v025 fix:

```ts
forecastTimeIso: dp
  ? dp.forecastTimeIso
  : derived
    ? derived.forecastTimeIso
    : activeCandidate
      ? undefined
      : pt.summaryForWindow?.forecastTimeIso
```

## Acceptance Criteria

- Worst point, selected map point and all route point cards share one component or one shared content-rendering component.
- Threshold context line appears consistently whenever the displayed values exceed the relevant threshold.
- No timestamp chips appear on map markers.
- "Allir spápunktarnir" cards keep their colored card backgrounds.
- "Mest krefjandi" keeps its special label.
- Links remain unchanged.
- No new API calls.
- No SQL, Supabase or auth changes.
- TypeScript passes.
- Relevant unit tests pass.

## Risk / Things To Watch

- Do not reintroduce stale `summaryForWindow` values when an active candidate/departure slot is selected.
- Do not show threshold context based on a different forecast hour than the weather line being displayed.
- Do not lose the current "Spá" drawer link behavior for selected points and list points.
- Do not reintroduce gust/hviður as a user-facing threshold line in this refactor.
- Be careful with `RoutePointRow`: it currently owns status card classes. Keep styling there or pass it down explicitly; do not let the shared content component accidentally flatten the colored list cards.
- Keep mobile-first spacing. The detail line can wrap; it must not overflow.

## Commands Codex Ran

Read-only inspection only:

```powershell
Get-Content -Encoding UTF8 WORKFLOW.md
Get-Content -Encoding UTF8 ai-handoff/README.md
rg -n "PointDetailsPanel|RoutePointRow|buildPointSummary|highlightedIssue|aboveThresholdWithExcess|forecastDistanceFromRouteM|Valin veðurspá|Mest krefjandi|Allir spápunkt" components app lib messages
Get-Content targeted line ranges from:
  components/weather/TravelAuditMap.tsx
  components/weather/travelAuditMap.helpers.ts
  app/auth-mvp/vedrid/FerdalagidClient.tsx
  lib/weather/types.ts
  lib/weather/thresholds.ts
  lib/weather/windDisplayStatus.ts
  messages/is.json
```

No tests were run for this handoff. No application files were changed except this handoff file.

## Localhost checks for Stebbi

After Claude Code implements this:

1. Open `/vedrid` on localhost.
2. Calculate a route where at least one point is over the selected wind threshold.
3. Check the worst point detail:
   - has `Mest krefjandi á leiðinni`
   - shows full weather line
   - shows threshold excess line, e.g. `Vindur (x yfir y m/s mörkum)`
   - has unchanged links
4. Click a different point on the map:
   - title changes to `Valin veðurspá`
   - same content structure appears
   - threshold excess line appears if the displayed point is over the threshold
   - no timestamp label appears on the map marker itself
5. Open `Allir spápunktarnir á leiðinni`:
   - cards still have status-colored backgrounds/borders
   - point title remains `Punktur x/y`
   - same weather/time/link/detail structure appears
   - threshold excess line appears on over-threshold points
6. Try a safe/green point:
   - no misleading "yfir mörkum" line appears
7. Regression check:
   - `Spá` opens the drawer from worst, selected and list points
   - `Yr`, `Google Maps` and raw met.no links still open
   - mobile layout does not overflow horizontally

No Supabase, SQL, auth, production data, secrets, deployment or billing behavior should be touched by this task.

## Óvissa / þarf að staðfesta

This validation is based on the current TypeScript data flow and types, not on a live production payload. Claude Code should still verify with real localhost route data after implementation.

Need one product decision only if it comes up: for non-worst points near danger but below red threshold, should the threshold excess line compare against caution threshold or be omitted unless the point is actually over a threshold? My recommendation: show the "yfir mörkum" line only when the displayed value is actually over the relevant threshold; do not invent an excess line for "nálgast" states.
