# TODO 086 v112 - Codex provider-aware point layer addendum

Created: 2026-07-13 21:43
Timezone: Atlantic/Reykjavik
Agent: Codex
Context: Stebbi had not yet sent `2026-07-13-2140-todo-086-v111-codex-v110-ui-toggle-review.md` to Claude Code.

## Stebbi's clarified product expectation

Stebbi expected the travel-weather point model to move toward:

- Existing MET/Yr route forecast points remain visible.
- Veðurstofan points are added as additional forecast/station points during testing.
- The point count in "Allir spápunktarnir á leiðinni" should move from something like `72` to `72 + Veðurstofan points`, not only recolor/recalculate the same 72 MET/Yr points.
- Cards should clearly say which provider/source they belong to:
  - `met.no` for existing MET/Yr forecast points.
  - `Veðurstofan` or `Veðurstofan (í prófun)` for Veðurstofan points.
- Links must be provider-aware:
  - `Yr` only on MET/Yr cards.
  - `Hrá met.no gögn` only on MET/Yr cards.
  - `vedur.is` link only on Veðurstofan cards when a direct station/source URL is available.

Important wording clarification:

- We should still say Vegagerðin road-condition data is not included yet.
- Some Veðurstofan station records have `owner: 'Vegagerðin'`, but the product/provider label for these forecast rows should remain `Veðurstofan` unless/until we integrate a separate Vegagerðin data source.

## Codex recommendation

Do not send v111 alone as the next execution instruction.

v111 is still valid for the small accessibility/consistency fixes, but it is too narrow now. The better next instruction to Claude Code is:

1. Keep the v111 fixes:
   - accessible switch name
   - >=40x40 touch target
   - clear stale drawers on toggle
2. Then pivot the UI/data model toward a provider-aware, reusable forecast point component.

This is more future-proof and closer to what Stebbi wants long-term.

## Why this is the right direction

The current implementation treats Veðurstofan mostly as an alternate calculation layer:

- toggle off: MET/Yr baseline
- toggle on: augmented MET/Yr + Veðurstofan result

That is useful, but it hides the actual provider differences. For validation, Stebbi needs to see the real Veðurstofan points as their own visible evidence, not only the effect they have on the score.

It also sets up the right architecture for future weather systems:

- MET/Yr route/grid points
- Veðurstofan station/forecast points
- later Vegagerðin data, if/when added
- maybe observations/gusts later as separate provider layers

## Current code shape to account for

Relevant current components:

- `components/weather/RouteWeatherPointDetailCard.tsx`
  - already used as shared content for selected map point / route point rows
  - currently assumes MET/Yr-ish links because `PointSummary` always has `yrnoUrl`, `googleMapsUrl`, `metnoUrl`
- `components/weather/TravelAuditMap.tsx`
  - renders route weather markers and optional met.no forecast grid markers
  - selected panel uses `RouteWeatherPointDetailCard`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - renders `TravelAuditMap`
  - renders "Allir spápunktarnir á leiðinni" using `RoutePointRow`
  - opens `ForecastDrawer` from route point rows and map panel

So the reusable-component path is plausible. The component already exists conceptually; it needs to become provider-aware rather than MET/Yr-only.

## Proposed next implementation phase

### Phase A - Preserve v111 fixes

First patch the immediate v111 issues:

- Give the Veðurstofan switch a real accessible name.
- Make the touch target at least 40x40 px.
- Clear `forecastDrawerData` when switching baseline/Veðurstofan.
- Consider closing `compareDrawerOpen` too, because comparison rows are copied from the current result.

### Phase B - Introduce a provider-aware display model

Add a UI-facing normalized type, likely in a component helper file rather than core weather scoring first:

```ts
type ForecastPointProvider = 'metno' | 'vedurstofan'

type ForecastPointCardModel = {
  id: string
  provider: ForecastPointProvider
  providerLabel: string
  testing?: boolean
  title: string
  routeIndex?: number
  stationId?: string
  stationName?: string
  lat: number
  lon: number
  distanceFromRouteM?: number
  etaIso?: string
  forecastTimeIso?: string
  windMs?: number
  precipMmPerHour?: number
  tempC?: number
  status?: WeatherStatus
  freshness?: 'ok' | 'stale' | 'unavailable'
  links: Array<{
    label: string
    href: string
    kind: 'forecast' | 'map' | 'raw' | 'provider'
  }>
}
```

The exact shape can differ, but the key is that the card component is provider-aware and does not assume `Yr`/`met.no` links for every point.

### Phase C - Create a reusable point card

Create or refactor toward one component, for example:

- `components/weather/ForecastPointCard.tsx`, or
- evolve `RouteWeatherPointDetailCard` into a provider-aware version.

It should be usable for:

- worst point card
- selected map point panel
- all forecast points list
- later Veðurstofan station cards

Rules:

- MET/Yr cards show provider label `met.no`.
- MET/Yr cards may show `Yr`, `Google Maps`, and `Hrá met.no gögn`.
- Veðurstofan cards show provider label `Veðurstofan (í prófun)`.
- Veðurstofan cards should show `vedur.is` only if a real station/source URL is available.
- Do not render dead links.
- Keep user text in `messages/is.json` and `messages/en.json`.

### Phase D - Add Veðurstofan points to "Allir spápunktarnir"

When `vedurstofanLayer` exists, "Allir spápunktarnir á leiðinni" should be able to render:

- all existing MET/Yr route points
- plus Veðurstofan points from `vedurstofanLayer.points`

The count/heading should make this understandable, e.g.:

- `Allir spápunktarnir á leiðinni`
- count/details can say something like:
  - `72 met.no punktar`
  - `+ 8 Veðurstofan punktar í prófun`

Do not necessarily merge/sort perfectly in the first pass if it becomes risky. A safe first version can group them:

1. `met.no`
2. `Veðurstofan (í prófun)`

Then later we can interleave by route distance if desired.

### Phase E - API fields needed for Veðurstofan cards

Current `vedurstofanLayer.points` likely needs a little more metadata to render true Veðurstofan cards:

- station lat/lon
- station/source URL if available
- route distance / station distance context
- provider label/status

Potential source:

- `vedurstofan_stations.source_url` exists in the product table migration.
- The static `VedurstofanStation` currently has `stationId`, `stationName`, `lat`, `lon`, `owner`, `coordinatesVerified`, but not `sourceUrl`.

Prefer using product-table station metadata or adding `sourceUrl`/`stationUrl` to the layer response. Do not invent links if the source URL is not available.

### Phase F - Map markers

The map should eventually show Veðurstofan points as their own marker layer, distinct from:

- road route points
- MET/Yr forecast grid points

But this can be split from the first card pass if necessary.

Recommended first implementation:

1. Add the provider-aware card/list model.
2. Show Veðurstofan cards in "Allir spápunktarnir".
3. Then add separate Veðurstofan map markers using the same model, with distinct visual style and title `Veðurstofan: {stationName}`.

Avoid making the map much heavier before the list/card model is stable.

## What not to do

- Do not label Veðurstofan points as Vegagerðin unless we are actually using a separate Vegagerðin data source.
- Do not put Yr links on Veðurstofan cards.
- Do not put raw met.no links on Veðurstofan cards.
- Do not remove the MET/Yr baseline.
- Do not add extra Google or met.no calls.
- Do not make this public to all `vedrid` users yet; keep the effective gates.

## Updated instruction to Claude Code

Claude Code should treat v111 as a technical review, but follow this v112 addendum as the product direction.

Recommended order:

1. Patch v111 accessibility/stale drawer issues.
2. Implement a provider-aware forecast point display model/component.
3. Add MET/Yr provider labels to current cards.
4. Add Veðurstofan points/cards to "Allir spápunktarnir" when `vedurstofanLayer` exists.
5. Make links provider-specific and omit unavailable links.
6. Keep map marker additions as a follow-up unless the component/model work is small and safe.

## Localhost checks for Stebbi

After Claude Code implements the next phase:

1. With layer disabled:
   - Run ferðaveður.
   - Expected: current MET/Yr-only experience remains stable.

2. With all three gates enabled:
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`
   - `WEATHER_ELTA_VEDRID_FLAG=true`
   - per-user `elta-vedrid` access
   - Run the same route.
   - Expected: MET/Yr points still show, and Veðurstofan points/cards appear as extra testing points.

3. Provider labels:
   - MET/Yr cards should clearly say `met.no`.
   - Veðurstofan cards should clearly say `Veðurstofan (í prófun)`.

4. Links:
   - MET/Yr cards show `Yr` and `Hrá met.no gögn`.
   - Veðurstofan cards do not show those links.
   - Veðurstofan cards show a `vedur.is` link only when valid.

5. Count/heading:
   - "Allir spápunktarnir" should make clear that the list now includes both provider families, for example `72 met.no + N Veðurstofan`.

6. Mobile:
   - Check 360, 390, and 460 px widths.
   - Provider labels and links must wrap without overflow.

Do not test production cron, Vercel env vars, production Supabase, or production feature grants without explicit approval.

## Confidence / uncertainty

Confidence is high on the product direction. The exact API fields needed for direct `vedur.is` links need verification in implementation, especially whether the route response can easily include `vedurstofan_stations.source_url` without extra user-facing latency.
