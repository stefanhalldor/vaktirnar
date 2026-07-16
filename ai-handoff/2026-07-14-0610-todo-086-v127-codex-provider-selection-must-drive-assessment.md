# TODO 086 v127 - Provider selection must drive assessment, map, and cards

Created: 2026-07-14 06:10
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on: `2026-07-14-0557-todo-086-v126-codex-v125-display-only-review-and-freshness.md`
User evidence: Stebbi screenshots with `met.no` off and `Veðurstofan` on

## Bottom line

v125 fixed one confusion by making Veðurstofan display-only. Stebbi's latest screenshots reveal the next, deeper requirement:

> The provider toggles must control all visible and calculated weather data. If `met.no` is unchecked, MET/Yr data must be removed from the map, status chips, worst-point card, all-points list, and the assessment calculation.

Current behavior is still wrong for `met.no off + Veðurstofan on`:

- The map still shows the 72 MET/Yr route points.
- The status chips still count MET/Yr points.
- The "Mest krefjandi punkturinn" card still shows a MET/Yr point (`Punktur 26/72`, `Yr`, `Hrá met.no gögn`).
- The actual most challenging Veðurstofan station appears to be `Sandskeið`, but it only appears in "Allir spápunktar" and does not drive the summary/worst point.

This means `showMetno` currently hides one list section only. It does not remove MET/Yr from the product model.

## Current code path causing this

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1200-1208`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1217`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1273-1322`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:456-458`

Current UI:

- `TravelAuditMap` always receives `result.travelPlan.routeWeatherPoints`.
- Worst-point/summary state is derived from `result.travelPlan` candidates, which are MET/Yr baseline candidates after v125.
- `showMetno` only gates rendering of `RoutePointRow` in the explainer/all-points section.
- `showVedurstofan` only gates rendering of `VedurstofanPointRow`.

So the provider toggles are display filters for part of the UI, not product-level provider selection.

## Product requirement

Provider selection must be generic and future-proof:

- `met.no` selected:
  - MET/Yr route sample points are included in assessment, map, status chips, worst point, selected point, and all-points.
- `Veðurstofan` selected:
  - Veðurstofan station points are included in assessment, map, status chips, worst point, selected point, and all-points.
- `Vegagerðin` selected later:
  - Vegagerðin points are included using the same provider-point interface.
- If a provider is unchecked:
  - no data from that provider may affect the calculation or remain on the map/point UI.

This must not be a one-off `if showMetno` patch. It should become a provider-aware point model.

## Recommended implementation model

### 1. Create a generic provider point shape

Introduce a normalized point type for route assessment/display, for example:

```ts
type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

type ProviderWeatherPoint = {
  id: string
  provider: WeatherProviderKey
  label: string
  lat: number
  lon: number
  distanceFromRouteM: number | null
  distanceFromOriginM: number | null
  routeFraction: number | null
  status/freshness metadata
  sourceUrl?: string
  forecastRows: normalized rows
}
```

MET/Yr route points already have `distanceFromOriginM` and `routeIndex`.

Veðurstofan station points currently have station coordinates and `distanceM` from route, but they do **not** yet have `distanceFromOriginM` / route projection. That is required if they should drive the timeline and "Mest krefjandi punkturinn".

### 2. Compute route projection for Veðurstofan stations

The distance fix in v122 computes distance to route segments, but for assessment we also need:

- nearest route segment index,
- projected point on the route,
- cumulative distance from route origin to that projection,
- route fraction.

Without this, the app cannot know when the vehicle reaches Sandskeið, so it cannot fairly evaluate Veðurstofan rows against ETA.

Recommendation:
- Extend the station-to-route distance helper to return:
  - `distanceM`
  - `distanceFromOriginM`
  - `routeFraction`
  - maybe projected lat/lon for map/debug
- Use this for Veðurstofan station cards, map markers, and assessment timing.

### 3. Build assessment from selected providers

Do not keep one global `result` that always means MET/Yr.

Instead:

- keep raw provider layers:
  - `metnoPoints`
  - `vedurstofanPoints`
  - later `vegagerdinPoints`
- keep selected provider state:
  - `selectedProviders = { metno: boolean, vedurstofan: boolean, vegagerdin: boolean }`
- derive an active assessment from selected providers:
  - if only `metno`: current baseline behavior
  - if only `vedurstofan`: assess Veðurstofan station points only
  - if both: either combine provider points as independent points, or use a clear future blend mode, but do not silently max-blend unless product-approved

For this phase, the cleanest behavior is:

> Assessment = all selected provider points as independent points. No max-blending by default.

That makes Sandskeið eligible to become "Mest krefjandi punkturinn" when only Veðurstofan is selected.

### 4. Map must use active provider points

When `met.no` is off:

- do not pass the 72 MET/Yr points to `TravelAuditMap`;
- pass only the 6 Veðurstofan station points in this example;
- map markers should show provider-specific point markers/badges.

If the current `TravelAuditMap` only accepts `RouteWeatherPoint[]`, either:

- generalize it to accept `ProviderWeatherPoint[]`, or
- add a separate provider marker overlay while keeping the route polyline.

Do not leave MET/Yr markers visible when `met.no` is off.

### 5. Worst point and selected point must be provider-aware

When only Veðurstofan is selected:

- "Mest krefjandi punkturinn" should be a Veðurstofan station, e.g. Sandskeið if it is worst.
- It should not say `Punktur 26/72`.
- It should not show `Yr` or `Hrá met.no gögn`.
- It should show `Veðurstofan (í prófun)`, station ID, source link, and route distance/projection.

This should use a shared provider-aware point card, not separate one-off cards.

## Freshness / "síðan hvenær eru gögnin?"

Yes, this applies and should be shown.

For each Veðurstofan station card, show enough provenance that the user understands the rows:

- `Spá frá:` source analysis/reference time (`atime`) if available.
- `Sótt:` when our warmer/fetch pulled or projected the data (`fetchedAt` / product synced time).
- Row time (`forecast_time` / `ftime`) per forecast row, already visible as `06:00`, `09:00`, etc.
- Freshness label using v126 semantics:
  - fresh/new,
  - old but usable,
  - very old/expired.

Suggested UI wording in Icelandic:

- `Spá frá kl. 06:00`
- `Sótt kl. 06:17`
- `Gömul gögn` / `Mjög gömul gögn` only when cadence-aware thresholds say so.

Do not rely only on "gömul gögn" without showing what timestamp made that decision.

## Important sequencing

Do not jump straight to blending again.

Suggested next Claude Code patch:

1. Model provider selection as the source of active assessment/display.
2. Keep `met.no` default on and `Veðurstofan` default off.
3. If `met.no` is off and `Veðurstofan` is on:
   - map shows only Veðurstofan station markers,
   - status chips count only Veðurstofan points,
   - worst point is the worst Veðurstofan station,
   - all route summary/worst-point UI is provider-aware.
4. Add station route projection (`distanceFromOriginM`/`routeFraction`) so Veðurstofan can be assessed by ETA.
5. Add provenance timestamps to Veðurstofan cards.
6. Keep `augmentedResult` hidden or remove it from active UI path until explicit blend mode exists.

## Risks / things Claude Code should not do

- Do not just hide the map markers with CSS while still calculating from MET/Yr.
- Do not keep `result.travelPlan.routeWeatherPoints` as the universal source of truth.
- Do not show `Punktur 1/72` for non-MET providers.
- Do not silently max-blend providers when multiple are selected.
- Do not build a Veðurstofan-only assessment without route projection/ETA; otherwise timing is fake.
- Do not make Supabase schema changes unless Stebbi separately approves.

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, Veðurstofan layer enabled, product table warmed.

1. Run the same route from Stebbi's screenshots.
2. Select only `met.no`.
   - Map shows 72 MET/Yr route points.
   - Worst point is a MET/Yr point.
   - All-points list shows only MET/Yr section.
3. Select only `Veðurstofan`.
   - Map shows only the Veðurstofan station points near the route, e.g. 6 in this case.
   - Status chips count only those station points.
   - Worst point is a Veðurstofan station, expected Sandskeið in Stebbi's example if it has the highest/riskier values.
   - No `Punktur 26/72`, `Yr`, `Hrá met.no gögn`, or MET/Yr marker remains.
4. Select both `met.no` and `Veðurstofan`.
   - UI clearly shows both provider groups.
   - Assessment semantics are explicit: either independent selected-provider points, or a clearly labelled future blend mode. No silent max-blend.
5. Inspect a Veðurstofan station card.
   - It shows forecast row times.
   - It shows `Spá frá` / `Sótt` or equivalent timestamp provenance.
   - Freshness label matches v126 cadence-aware threshold.
6. Check 360, 390, and 460 px widths for provider card wrapping and no horizontal overflow.

Do not run migrations, Supabase changes, production cron, deploy, push, or commit as part of this check unless Stebbi gives explicit separate approval.

## Design.md notes

Relevant Design.md rules checked:

- mobile-first (`Design.md:55`, `Design.md:133`)
- status meaning must not rely on color alone (`Design.md:95`)
- all user-facing text in messages (`Design.md:127`)
- touch targets around 40x40 px (`Design.md:168`, `Design.md:400`)
- structured summary panels for route status (`Design.md:206-210`)
- binary settings use toggles (`Design.md:310-313`)
- heading hierarchy must follow meaning (`Design.md:402`)

The provider model should preserve these: toggles remain touch-friendly, headings distinguish provider groups, and non-MET cards should use the same shared card hierarchy rather than introducing a parallel inconsistent layout.
