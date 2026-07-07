# 2026-07-06-0745-todo-067-v067-codex-v066-auditability-combined-review

Created: 2026-07-06 07:45  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Review of `2026-07-06-0750-todo-067-v066-claude-auditability-shipped.md`, plus the earlier Codex v066 findings that Stebbi had not yet sent to Claude Code.

## Bottom Line

The auditability pass is a useful step: the result now exposes route weather points, links to Google Maps, met.no forecast coordinates, and an expandable transparency section.

It is not ready for localhost trust-testing as the next user-facing iteration. The deterministic correctness issues from Codex v066 are still present, and Stebbi has now found a concrete trust failure: a highlighted point for Reykjavík to Selfoss appears off the route that a user expects in Google Maps. That means the next Claude Code pass should not be another copy/UI pass. It should fix the route/point model and render the actual route line together with the sampled points.

## Route Alternatives Product Rule

Stebbi clarified an important product rule after this review:

- It is good to evaluate more than one possible driving route.
- Teskeið should not recommend a longer route just because it exists.
- A longer route should only be recommended when it is meaningfully safer weather-wise than the default/fastest route.
- When recommending the longer safer route, the UI must explicitly say how much longer it takes, e.g. `Þessi leið tekur um X mínútum lengur, en veðrið lítur betur út á henni.`
- The default/fastest route should remain the baseline unless an alternative route materially improves the weather status or avoids the decisive red/yellow issue.

Official Google Routes docs say `computeAlternativeRoutes: true` can return the default route plus up to three alternatives, alternatives are not always available, may increase response time, and can include polylines when `routes.polyline` is requested in the field mask:

- https://developers.google.com/maps/documentation/routes/alternative-routes

Recommended deterministic ranking:

1. Evaluate every returned route independently using the same weather model.
2. Rank first by weather status: `graent > gult > rautt`.
3. If two routes have the same status, prefer shorter duration unless one route materially reduces the decisive metric.
4. Only surface a longer recommendation when:
   - default route is `rautt` and alternative is `gult` or `graent`, or
   - default route is `gult` and alternative is `graent`, or
   - both are same status but alternative clearly reduces a severe decisive metric and the time penalty is small enough to be worth mentioning.
5. Always show the time penalty compared with the default route.

This should be treated as a product rule, not just a provider detail. If Mapbox is used later, the same route-ranking rule should apply.

## Findings

### Blocker 1: Return-leg ETA still evaluates route points in outbound direction

Files:

- `lib/weather/travel.ts:37-50`
- `lib/weather/travel.ts:126-140`
- `lib/weather/travel.ts:354-366`

`findWorstMetric()` still computes ETA as:

```ts
const fraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0
const etaMs = depMs + fraction * durMs
```

That is correct for outbound travel from origin to destination. It is wrong for return travel from destination back to origin. On the return leg, the point nearest destination should be evaluated near return departure, and the point nearest origin should be evaluated near return arrival.

Required fix:

- Add leg direction to the candidate/evaluation path, e.g. `'outbound' | 'return'`.
- For return candidates, use:

```ts
const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
```

- Apply this consistently in:
  - `findWorstMetric`
  - `evaluateCandidate`
  - `generateCandidates`
  - `buildRouteWeatherPoints` when summarizing a return issue or return candidate

Required tests:

- Create a route with two points: origin and destination.
- Put bad weather at destination-side point at return departure time.
- Assert return analysis flags the destination-side point at return departure, not the origin-side point.
- Add the inverse case for bad weather near origin at return arrival.

### Blocker 2: The highlighted/worst point is still not metric-aware

Files:

- `lib/weather/travel.ts:179-185`
- `lib/weather/travel.ts:187-210`

`worstCandidateOf()` still tie-breaks same-status candidates by `worstWind` only:

```ts
(b.status === a.status && (b.worstWind?.value ?? 0) > (a.worstWind?.value ?? 0))
```

This can pick the wrong candidate when the status/reason is precipitation, gust, or another non-wind reason. The UI can then display a “worst point” that does not actually explain the result.

Required fix:

- Centralize candidate severity selection:
  - rank by status first: `rautt > gult > graent`
  - then rank by the metric that actually caused the reason code
  - for `precipitation`, compare `worstPrecip.value`
  - for wind/trailer reason codes, compare the decisive wind/gust threshold overage
  - for `no_data` and impossible home cases, do not pretend there is a physical worst weather point
- `buildHighlightedIssue()` should receive or derive the same decisive metric used for candidate selection.

Required tests:

- Two `gult` candidates:
  - candidate A: higher wind but dry
  - candidate B: lower wind but higher precipitation and `reasonCode === 'precipitation'`
- Assert highlighted issue points to candidate B when precipitation is the reason.

### Blocker 3: A point can appear off the expected route; auditability must show the route line and point markers together

Observed by Stebbi during localhost testing:

- Route: Reykjavík to Selfoss.
- A highlighted point appeared north of the route a user expects in Google Maps.
- The point did not visually look like part of the Reykjavík to Selfoss road route.

This is a trust blocker. It is not enough to show a point link. Users need to see:

- the exact route geometry returned by our provider
- all sampled weather points on that route
- the decisive/worst point highlighted on the same map
- the destination-nearest point
- the difference between:
  - road/route coordinate
  - rounded met.no forecast coordinate

Important detail: rounding coordinates to 3 decimals should only move a point roughly tens of meters, not several kilometers. If the marker is far off-route, that is not explained by met.no rounding alone.

Required fix:

- Add an audit map to the result screen that renders the actual route line used by the backend and overlays the sampled weather points.
- Do not present a forecast coordinate as if it were a road coordinate.
- Label both values when useful:
  - `Leiðarpunktur: lat, lon`
  - `Spágögn sótt fyrir: forecastLat, forecastLon`
- If we cannot render the full route line yet, do not label the point as confidently “á leiðinni”.

Suggested implementation:

- API route returns a bounded audit geometry, e.g. `travelPlan.route.auditPolylinePoints` or similar, max ~80 points.
- UI renders route line plus markers.
- Immediate pragmatic option: use Google Static Maps with `path=` and markers, reusing the browser-restricted key.
- Better product option: an embedded map component if already available, but keep this pass small.

Required tests:

- Unit-test sampling so origin and destination are always included.
- Unit-test `isDestinationClosest` against the actual final route point, not merely the last retained array item.
- If adding a map URL builder, test URL contains path plus worst/destination markers.

### Major 1: Destination-nearest point is still not guaranteed under max cap

Files:

- `lib/weather/google.server.ts:49-52`
- `app/api/teskeid/weather/travel/route.ts:133-145`
- `lib/weather/travel.ts:252-264`

There are two separate last-point issues:

1. `google.server.ts` appends the last route point and then slices to `maxPoints`, which can drop the appended last point:

```ts
if (sampled[sampled.length - 1] !== last) sampled.push(last)
return sampled.slice(0, maxPoints)
```

2. `route.ts` only appends the destination point if `weatherPoints.length < MAX_WEATHER_POINTS`. If the sampled list is already full, the actual destination endpoint is not appended.

3. `buildRouteWeatherPoints()` labels `idx === total - 1` as `isDestinationClosest`, even if that last retained point is not the true destination.

Required fix:

- Sampling must preserve both origin and destination.
- If the cap is full, replace the last sampled non-destination point with the actual destination endpoint.
- Mark destination-nearest using explicit endpoint knowledge, not array position alone unless endpoint preservation is guaranteed.

### Major 2: `TravelIssue` drops audit fields, and UI uses a type cast for `metnoUrl`

Files:

- `lib/weather/types.ts:91-102`
- `lib/weather/travel.ts:201-210`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:545-583`

`WorstMetric` now has `forecastLat`, `forecastLon`, and `metnoUrl`, but `TravelIssue` does not. `IssueAuditCard` casts:

```ts
(issue as { metnoUrl?: string }).metnoUrl
```

But `buildHighlightedIssue()` never copies `metnoUrl`, so that link will generally not render for the highlighted issue.

Required fix:

- Add these fields to `TravelIssue`:
  - `routeIndex?: number`
  - `forecastLat?: number`
  - `forecastLon?: number`
  - `metnoUrl?: string`
  - `googleMapsUrl?: string`
- Populate them from the decisive `WorstMetric`.
- Remove the UI type cast.

### Major 3: Route point summaries are outbound-only and can mislead when the issue is on the return leg

Files:

- `lib/weather/travel.ts:213-270`
- `lib/weather/travel.ts:442-446`

`summaryCandidate` is selected only from outbound candidates:

```ts
const summaryCandidate = bestOutboundWindow
  ? outboundCandidates.find(c => c.departureIso === bestOutboundWindow.fromIso) ?? outboundCandidates[0]
  : outboundCandidates[0]
```

Then `buildRouteWeatherPoints()` computes summaries using the outbound ETA formula. If the decisive issue is on the return leg, the route point table can show values for an outbound candidate while labeling a return issue elsewhere.

Required fix:

- Either:
  - show route point summaries for the currently decisive candidate/leg, or
  - explicitly label the section as outbound-only.
- Prefer the first: pass `{ candidate, leg }` into `buildRouteWeatherPoints()`.

### Major 4: `decisiveTimeIso` uses wind/gust even when precipitation is decisive

File:

- `lib/weather/travel.ts:235-243`

For each route point summary, `decisiveMetric` can be `precipitation`, but `decisiveTimeIso` always chooses the hour with max wind/gust:

```ts
const aVal = Math.max(a.windSpeedMs, a.windGustMs)
const bVal = Math.max(b.windSpeedMs, b.windGustMs)
```

Required fix:

- If decisive metric is precipitation, choose max precipitation hour.
- If decisive metric is gust, choose max gust hour.
- If decisive metric is wind, choose max wind hour.

### Major 5: User-facing strings are hardcoded in the client component

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:556-614`

Examples:

- `Tími:`
- `km frá uppruna`
- `Hnit:`
- `Punktur`
- `Vindur`
- `Hviður`
- `Úrkoma`
- `Spápunktur met.no`

Per workflow, user-facing copy belongs in `messages/is.json` and `messages/en.json`. This is not the highest-risk problem, but it should be fixed while touching the audit UI.

### Major 6: `Skoða spágögn` opens raw met.no JSON, which is not useful to users

Files:

- `lib/weather/travel.ts:9-10`
- `lib/weather/travel.ts:60`
- `lib/weather/travel.ts:265-266`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:564-581`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:613-614`

The current `Skoða spágögn (met.no)` link opens `https://api.met.no/weatherapi/locationforecast/2.0/compact?...`, which is raw JSON. That is useful for developers only. It does not help Stebbi or normal users verify the forecast.

Required fix:

- Replace the user-facing forecast link with a human-readable forecast page:
  - preferred: `yr.no` forecast page with the relevant location selected, if a stable coordinate/place URL can be generated
  - acceptable alternative: `vedur.is` page with the relevant location selected, if a stable coordinate/place URL can be generated
- Keep raw `api.met.no` only as an explicitly labeled developer/debug link if needed:
  - Icelandic label: `Hrá met.no gögn`
  - English label: `Raw met.no data`
  - Put it behind the technical details/audit section, not as the primary user link.
- Rename the current user-facing label:
  - `Skoða veðurspá`
  - not `Skoða spágögn`

Claude Code should briefly research the stable URL format before implementing. Do not guess a brittle yr.no or vedur.is deep link if it breaks for arbitrary coordinates. If neither provider has a stable coordinate deep link, use a provider search URL with the location name/coordinates and label it honestly, e.g. `Leita að spá á yr.no`.

### Minor: Audit UI is still more debug-panel than user trust layer

The table is useful for us, but for Stebbi and early users the main trust artifact should be visual:

- route line
- sampled points
- highlighted worst point
- destination point
- then a compact expandable technical list underneath

The copy can openly say this is being developed, but it should not feel like raw internal debugging.

## Verification Run By Codex

Commands:

```txt
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
npm run test:run
npm run build
git status --short
```

Results:

- `npm run type-check`: exit 0.
- Targeted weather tests: exit 0, 4 files passed, 119 tests passed, 5 skipped.
- Full Vitest: exit 0, 51 files passed, 1644 tests passed, 27 skipped, 8 todo.
- `npm run build`: exit 0.
- Build warnings remain unrelated/existing:
  - `app/s/[sessionId]/page.tsx`: React hook dependency warnings.
  - `components/landing/Avatar.tsx`: `<img>` warning.
  - Browserslist data stale warning.
- `git status --short`: worktree is dirty with many Claude/weather changes and many untracked handoff files. Codex did not revert anything.

## Files Inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-06-0750-todo-067-v066-claude-auditability-shipped.md`
- `ai-handoff/2026-07-06-0735-todo-067-v066-codex-v065-blocker-fixes-review.md`
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/places.ts`
- `lib/weather/google.server.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-travel.test.ts`

## Files Changed By Codex

- `ai-handoff/2026-07-06-0745-todo-067-v067-codex-v066-auditability-combined-review.md`

No application code, SQL, env variables, commits, pushes, deployments, or dev-server commands were changed/run by Codex.

## Recommended Claude Code Plan

Claude Code should do this as one focused correctness pass:

1. Fix return-leg ETA direction in the deterministic model.
2. Fix metric-aware worst candidate/highlighted issue selection.
3. Fix route sampling so origin and destination are always preserved under caps.
4. Add support for route alternatives where available, but recommend a longer route only when it is weather-safer and show the extra minutes clearly.
5. Add route audit geometry to the travel result for the selected/default route and any recommended alternative.
6. Render a route audit map on the result screen with route line + sampled points + highlighted point + destination point.
7. Make route vs forecast coordinates explicit.
8. Replace raw `api.met.no` user links with useful `yr.no` or `vedur.is` forecast links; keep raw met.no only as clearly labeled debug data if needed.
9. Move hardcoded audit UI text into `messages/is.json` and `messages/en.json`.
10. Add focused tests for all correctness fixes.
11. Run:
   - `npm run type-check`
   - `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts`
   - `npm run test:run`
   - `npm run build`

Do not do unrelated cleanup. Do not change env variables. Do not touch Supabase/SQL.

## Questions For Claude Code To Answer In Handoff

1. Does Google Routes return a route geometry for Reykjavík to Selfoss that actually goes near the off-route point Stebbi saw, or did our sampling/display create that point?
2. Are route point Google Maps links using the road coordinate or the rounded met.no forecast coordinate?
3. After fixing sampling, are origin and destination always present even when route geometry is long and caps are hit?
4. When the highlighted issue is return-leg, do the map marker, row summary, `svar`, and `facts` all refer to the same leg/time/metric?
5. If alternative routes are returned, which route did the model choose and why: default fastest route, or a longer weather-safer route?
6. When a longer route is recommended, does the UI show the added drive time in minutes?
7. Which human forecast provider URL was chosen for `Skoða veðurspá`, and why is it stable enough for arbitrary route/weather points?

## Localhost Checks For Stebbi

After Claude Code completes the next pass, Stebbi should test on localhost:

1. Open `/auth-mvp/vedrid`.
2. Select `Reykjavík` as origin and `Selfoss` as destination.
3. Leave optional times empty first, select no trailer, and submit.
4. Expected:
   - result screen shows an audit map
   - the route line is visible
   - weather points sit on or very near the route line
   - the highlighted/worst marker is on the displayed route line
   - the destination-nearest marker is near Selfoss
   - if any point is intentionally a rounded forecast coordinate, the UI clearly says so and also shows the road/route coordinate
5. Repeat with `Húsafell`, `Apavatn`, or another longer route.
6. Test with `Þarf að vera heima í síðasta lagi` filled in.
7. Expected for return:
   - if the result warns about heimferð, the map/point/time must clearly refer to the return leg
   - distance wording should make sense from destination on return, not from origin unless explicitly labeled
8. Click `Skoða veðurspá`.
9. Expected:
   - it opens a human-readable forecast page on `yr.no` or `vedur.is`
   - it must not open raw JSON from `api.met.no`
   - if there is also a raw-data link, it must be clearly labeled as raw/developer data
10. Check mobile width:
   - no horizontal overflow
   - map fits the screen
   - route point rows do not force zoom or overlap
11. Do not turn on production env variables or deploy from this pass.
12. No Supabase data changes should be required for this pass.
