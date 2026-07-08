# TODO-067 v182 - Codex addendum: active challenging point metrics

Created: 2026-07-08 09:12
Timezone: Atlantic/Reykjavik
Author: Codex
Status: New follow-up from Stebbi localhost review. v180 fixed stale metrics by hiding too much.

Context:
- Stebbi tested `/auth-mvp/vedrid` after v180/v181.
- Screenshot shows the map detail card:
  - title: `Mest krefjandi á leiðinni`
  - point: `Punktur 70/80`
  - departure: `Brottfarartími: kl. 09:10`
  - ETA: `Áætlaður tími 501 km frá Garðabæ: kl. 15:13`
  - links only
- Missing from that card:
  - wind/precipitation/temperature line
  - forecast-time line in the wording/order Stebbi wants: `Veðurspá á þessum stað kl. HH:mm`

## Findings

### High - v180 hides too much for the active "Mest krefjandi" point

v180 correctly stopped showing stale `summaryForWindow` metrics for manually selected non-highlighted points. But the guard is now too broad:

`components/weather/travelAuditMap.helpers.ts:304-324`

```ts
const showSummaryMetrics = !activeCandidate || isHighlighted
```

For a selected green departure slot:

- `activeCandidate` exists
- `candidateToIssue(...)` returns `undefined`
- `highlightedIssue` is therefore undefined
- `initialSelectedIndex(...)` still correctly auto-selects the active candidate's worst metric point by routeIndex
- but `isHighlighted` is false, so all metrics and decisive time are cleared

Result: the card is the correct `Mest krefjandi á leiðinni` point, but it cannot show the active candidate's weather values.

This should be fixed without reintroducing stale `summaryForWindow` data.

### Medium - Forecast-time line has the wrong order and is currently missing

Stebbi wants the line below ETA to read:

`Veðurspá á þessum stað kl. HH:mm`

Current render order in `components/weather/TravelAuditMap.tsx:685-688` is:

```tsx
{tf('pointForecastLabel')} {tf('pointTimeLine', { time: decisiveTime })} {tf('pointForecastHere')}
```

which produces:

`Veðurspá kl. HH:mm á þessum stað`

For the active challenging point in the screenshot the line is missing entirely because `decisiveTime` is cleared by the v180 guard.

## Recommended Fix

Do not solve this by turning `summaryForWindow` back on for active candidates. That was the stale-data bug.

Instead add a small active-candidate display summary produced server-side from the same point/hour used for the candidate's most challenging metric.

Suggested shape:

```ts
export type CandidateDisplayPoint = {
  routeIndex: number
  etaIso: string
  forecastTimeIso: string
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC: number
  metric: 'wind' | 'gust' | 'precipitation'
}

export type TravelCandidate = {
  ...
  displayPoint?: CandidateDisplayPoint
}
```

Implementation direction:

1. In `evaluateCandidate(...)`, after `worstWind`, `worstGust`, `worstPrecip`, and `legResult` are known, choose the same display metric as `DepartureHeatmap`/`candidateToIssue`:
   - precipitation when `reasonCode === 'precipitation'`
   - gust when gust is decisive
   - otherwise wind
2. Use that metric's `routeIndex` and `timeIso` to find the matching `TravelPointForecast` and forecast `HourPoint`.
3. Store `displayPoint` on the candidate with:
   - routeIndex
   - ETA for that point under this candidate
   - forecastTimeIso from the chosen hour
   - wind/gust/precip/temp values from the same chosen hour
4. In `initialSelectedIndex(...)`, prefer `activeCandidate.displayPoint?.routeIndex` before the individual `worstWind/worstGust/worstPrecip` fallback.
5. In `buildPointSummary(...)`, when `activeCandidate?.displayPoint?.routeIndex === pt.routeIndex`, populate:
   - `windMs`
   - `gustMs`
   - `precipMmPerHour`
   - `decisiveTempC`
   - `decisiveTimeFormatted` / `forecastTimeIso`
   from `activeCandidate.displayPoint`.
6. Continue suppressing metrics for other active-candidate manual points unless reliable per-point active-candidate values are available.
7. Change the forecast line order in `PointDetailsPanel` to:

```tsx
{tf('pointForecastLabel')} {tf('pointForecastHere')} {tf('pointTimeLine', { time: decisiveTime })}
```

or introduce one translation key if grammar gets awkward:

```json
"pointForecastHereAt": "Veðurspá á þessum stað kl. {time}"
```

Codex preference: use a single translation key for cleaner Icelandic and English, e.g.

- IS: `Veðurspá á þessum stað kl. {time}`
- EN: `Forecast at this point at {time}`

## What Not To Do

- Do not simply set `showSummaryMetrics = true` for active candidates. That reopens stale metrics from a different departure/window.
- Do not pull wind/precip/temp from global `activeCandidate.worstWind/worstPrecip` unless they are known to be from the same route point and forecast hour.
- Do not ask AI to generate this line. It is deterministic forecast data.
- Do not touch SQL, saved places, auth, RLS, Supabase policies, or Google Maps provider setup for this fix.

## Tests To Add Or Update

Recommended focused tests:

1. `evaluateCandidate(...)` / travel result test:
   - candidate includes `displayPoint`
   - `displayPoint.routeIndex` matches the selected decisive/worst metric point
   - `displayPoint.forecastTimeIso` is the hour used for displayed values
   - `displayPoint.airTemperatureC` is included
2. `buildPointSummary(...)` helper test:
   - active candidate + matching `displayPoint.routeIndex` populates wind/gust/precip/temp and forecast time
   - active candidate + non-matching route point keeps stale metrics hidden
3. Optional component-level assertion if existing test seam supports it:
   - point detail can render `Veðurspá á þessum stað kl. HH:mm`.

## Localhost Checks for Stebbi

Use `/auth-mvp/vedrid` with `Garðabær -> Egilsstaðir` or another long route.

1. Select a green departure slot such as `09:10`.
2. Confirm map auto-selects `Mest krefjandi á leiðinni`.
3. Expected: card shows:
   - `Brottfarartími: kl. 09:10`
   - `Áætlaður tími 501 km frá Garðabæ: kl. 15:13` or equivalent distance/time
   - `Veðurspá á þessum stað kl. HH:mm`
   - `Vindur: ... · Hviður: ... · Úrkoma: ... · Hiti: ...`
4. Click another point manually.
5. Expected: manual `Valin veðurspá` must not show stale weather values unless active-candidate-safe values are available for that point.
6. Select a yellow slot.
7. Expected: the challenging point still shows active candidate values and does not jump to old/default-window times.
8. Check 360px mobile width for no overlap or horizontal overflow.

## Commands Run

Read-only commands:

- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- line-number reads of `components/weather/TravelAuditMap.tsx`
- line-number reads of `components/weather/travelAuditMap.helpers.ts`
- `rg --files ai-handoff | rg "todo-067-v18[0-9]|todo-067-v182|challenging|forecast"`
- `rg -n "function findWorstMetric|findWorstMetric|WorstMetric|airTemperatureC|decisiveTempC|worstWind|worstGust|worstPrecip" lib\\weather\\travel.ts lib\\weather\\types.ts components\\weather\\DepartureHeatmap.tsx components\\weather\\travelAuditMap.helpers.ts lib\\__tests__\\weather-travel.test.ts lib\\__tests__\\travelAuditMap.helpers.test.ts`
- line-number reads of `lib/weather/travel.ts`
- line-number reads of `components/weather/DepartureHeatmap.tsx`

No tests were run by Codex.

## Files Changed By Codex

- `ai-handoff/2026-07-08-0912-todo-067-v182-codex-challenging-point-metrics-addendum.md`

No application code, SQL, migration, Supabase data, commit, push, deploy, or migration run was changed by Codex.

## Óvissa / Þarf Að Staðfesta

Confidence is high about the cause: v180's `showSummaryMetrics` guard hides the correct active challenging point values because green candidates have no `highlightedIssue`.

The exact payload name (`displayPoint`, `challengingPoint`, etc.) is up to Claude Code, but it should be a typed deterministic candidate-level summary, not stale `summaryForWindow`.
