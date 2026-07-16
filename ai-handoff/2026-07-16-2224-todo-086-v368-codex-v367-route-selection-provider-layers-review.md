# TODO 086 v368 - Codex review of v367 and provider layers on route selection

Created: 2026-07-16 22:24
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoffs:
- `2026-07-16-2156-todo-086-v366-codex-provider-route-geometry-matching-handoff.md`
- `2026-07-16-2215-todo-086-v367-claude-v366-done-prerelease.md`

## Findings

1. **Medium: One regression test does not actually model the failure it claims to cover**

   In `lib/__tests__/weather-travel-api.test.ts`, the test named `selects a station via route geometry even when sampleRouteWeatherPoints does not cover its location` says the sampled point is "near Gardabaer" and "nowhere near Hellisheidi", but the mocked sampled point uses `lat: 64.09, lon: -21.93`, which is also the Hellisheidi-ish coordinate used in the match helper setup. See `lib/__tests__/weather-travel-api.test.ts:505` and `lib/__tests__/weather-travel-api.test.ts:512`.

   This does not look like a product bug, because the route API is now calling `matchProviderPointsToRoute(...)` with `routeGeometry.points`. But the test is weaker than the handoff says. It should use a sampled MET/Yr point that is genuinely away from the station and a route geometry that still passes near the station. That way the test proves the original bug instead of mostly proving that the matcher mock can return a station.

2. **Low: `pointToSegmentM` is now dead helper code in the new provider matcher**

   `lib/weather/providerRouteMatching.ts:39` defines `pointToSegmentM(...)`, but `projectToPolyline(...)` duplicates the segment projection math inline and never calls `pointToSegmentM`. This is not dangerous, but it is easy drift. Either remove `pointToSegmentM` or make `projectToPolyline(...)` share the same segment projection helper. Since this file is meant to become the provider-neutral spatial foundation for Vegagerdin too, it is worth keeping it tidy now.

3. **No blocking issue found in the scoped v367 route-matching implementation**

   The main product direction in v367 is right: fixed provider points are now selected against `routeGeometry.points`, not sampled MET/Yr points. `app/api/teskeid/weather/travel/route.ts:261` through `app/api/teskeid/weather/travel/route.ts:273` is the important change. MET/Yr sampling appears to remain in the existing route-weather path, while Veðurstofan station selection uses the new provider matcher.

   Remaining risk is mostly tuning and verification: the 15 km station inclusion radius may need product adjustment after localhost tests, especially on long/coarse route geometries.

## Product direction: show provider stations on the route-selection step

I like this as the next product step, with one caveat: route selection is a planning/context surface, not the final calculation surface. The UI should help the user understand the route and pick a route, without turning the first step into a dense dashboard.

Recommended model:

- Add optional provider layers on the route-selection map.
- Start with Veðurstofan.
- Add Vegagerdin later using the same model.
- Use the v367 provider-route matcher, not `sampleRouteWeatherPoints()`.
- Keep MET/Yr route sampling and final calculation unchanged.
- Show only provider points that match the candidate/selected route geometry, not all stations in Iceland.
- On station click, open a small preview drawer/card.

Station preview should show:

- station name
- provider badge, e.g. `Veðurstofan`
- three weather rows around the currently selected/previewed time
- newest one Veðurpúls message if available
- link/button to open the full Veðurpúls

For mobile, this should be a bottom sheet or inline drawer with no hover-only interaction. Before UI implementation, Claude Code should read the relevant `Design.md` guidance.

## Weather thresholds and time scrubber on route selection

This is also a good direction, but I would phase it after the first station-layer pass.

Desired behavior:

- User can set weather thresholds earlier.
- The route-selection map can use those thresholds to color provider station markers.
- A scrubber can move the preview time forward/back, similar in spirit to vedur.is.
- Scrubber state is preview context and should carry forward into final calculation where relevant.

Important boundary:

- This should not replace the final route weather calculation.
- It should not cause extra Google route calls.
- It should not rewire MET/Yr sampling.
- It should recolor already selected/matched provider points based on cached/provider forecast rows.

## Yr forecast at the same coordinates as Veðurstofan stations

This is feasible and potentially very valuable, but it needs careful wording and architecture.

What it means technically:

- For each Veðurstofan station that is relevant to a route, request or derive a MET/Yr forecast at the same station coordinates.
- Compare:
  - `Veðurstofan forecast at station`
  - `Yr/met.no forecast at the exact same station coordinate`
- This gives a co-located provider comparison instead of comparing a station to some nearby sampled MET/Yr route point.

This should be treated as a **provider comparison layer**, not as the baseline route calculation at first.

Guardrails:

- Do not fetch Yr-at-station for all 280 stations by default.
- Do not fetch Yr-at-station for hidden provider layers.
- Prefer lazy fetch on station click or a route-scoped capped/cached fetch for matched stations.
- Avoid increasing met.no load unnecessarily.
- Cache/reuse responses where possible.
- Make it clear in UI that this is a comparison between forecasts, not a guarantee of truth.

Suggested internal shape:

```ts
type ProviderPointForecastComparison = {
  pointId: string
  pointName: string
  lat: number
  lon: number
  routeDistanceM: number
  distanceFromOriginM: number
  forecasts: {
    vedurstofan?: ProviderForecastRows
    metnoAtPoint?: ProviderForecastRows
    vegagerdin?: ProviderObservationRows
  }
}
```

## "Jákvæðasta" vs. "Neikvæðasta" forecast modes

The idea is interesting and very Teskeid-leg, but the labels need safety thinking.

For travel-weather decisions, the default should not be "positive" or optimistic. The safest default is a conservative aggregation:

- `Varfærnasta matið`: use the worst/highest-risk status across selected providers.
- `Mildara matið`: show the least severe provider interpretation, but not as the recommendation.
- `Samanburður`: show both providers side by side without collapsing to one answer.

If product language still wants something playful like "Jákvæðasta spáin" and "Neikvæðasta spáin", I would avoid making "Jákvæðasta" the default or route recommendation. It could be a comparison lens, but the main safety/status should stay conservative.

Implementation rule:

- Use one shared status evaluator for wind/rain/temperature labels.
- Do not create separate "best/worst" math in the map, cards, summary, and route-selection step.
- The selected comparison mode should be a display/aggregation setting, not a hidden rewrite of provider data.

## Proposed implementation phases

### Phase A - Tighten v367 before expanding

- Fix the weak regression test described above.
- Remove or reuse the dead `pointToSegmentM` helper.
- Keep all v367 behavior otherwise unchanged.

### Phase B - Provider stations on route-selection map

- Add a provider-neutral route-selection station layer model.
- Use `matchProviderPointsToRoute(...)` with candidate/selected route geometry.
- Add Veðurstofan layer toggle.
- Add marker click preview with:
  - station name
  - latest/nearby three forecast rows
  - one newest Veðurpúls message
  - open full pulse link
- Respect current Veðurstofan public/access rules.

### Phase C - Time scrubber and threshold coloring

- Add scrubber to route-selection station preview layer.
- Recolor provider markers by selected time and user weather thresholds.
- Keep it client-light and avoid extra route calls.

### Phase D - Yr-at-station comparison

- Add co-located MET/Yr forecast fetch for matched provider stations.
- Keep it lazy/cached.
- Add comparison UI:
  - Veðurstofan
  - Yr at same coordinates
  - later Vegagerdin current/road data
- Default aggregation should be conservative.

### Phase E - Vegagerdin

- Feed Vegagerdin fixed/current points into the same provider matching model.
- Use provider-specific route radius and freshness rules.
- Do not invent a second spatial matching model.

## Scope boundaries for Claude Code

For the next implementation pass, I would not do all phases at once.

Recommended next handoff to Claude Code:

1. Fix v367 test/dead-helper cleanup.
2. Implement only Phase B route-selection Veðurstofan markers and station preview.
3. Leave scrubber and Yr-at-station comparison as follow-up unless Stebbi explicitly approves a larger pass.

Do not include:

- SQL migrations
- env changes
- deploy
- production work
- Vegagerdin import
- changing MET/Yr route calculation
- changing final summary/worst-point semantics

## Localhost checks for Stebbi

After Phase B implementation:

1. Open `/vedrid`.
2. Choose a route that has Veðurstofan stations near it, for example Reykjavík -> Selfoss.
3. On the route-selection step, toggle Veðurstofan station layer on/off.
4. Confirm the map shows only stations relevant to the shown route, not all Iceland stations.
5. Click a station marker.
6. Confirm preview shows station name, provider badge, three weather rows, and newest Veðurpúls message if one exists.
7. Confirm `Opna Veðurpúlsinn` preserves return context back to the route/trip.
8. Continue to final result.
9. Confirm the final Veðurstofan station cards are consistent with the route-selection station layer.
10. Toggle met.no only in final result and confirm MET/Yr baseline behavior is unchanged.

For a later scrubber phase:

1. Move the scrubber time.
2. Confirm station marker colors change by forecast time.
3. Confirm no unexpected Google route recalculation happens just from moving the scrubber.

No SQL, RLS, Vercel env, migration, deployment, secrets, billing, or production-data checks belong to this pass unless Stebbi explicitly asks.

## Questions for Claude Code / Codex review

1. Does the implementation keep route-selection station matching provider-neutral?
2. Does it reuse `matchProviderPointsToRoute(...)` rather than create a new geometry model?
3. Does it avoid extra MET/Yr calls until the Yr-at-station comparison phase?
4. Does it keep MET/Yr route sampling unchanged?
5. Does the station preview use shared Veðurstofan card/forecast formatting where possible?
6. Does it avoid cluttering the route-selection step on mobile?
7. Does it preserve the public/login/returnTo flow for Veðurpúls?

## Óvissa / þarf að staðfesta

- Whether route-selection map should show provider markers for all route options or only the currently selected/highlighted option. I recommend starting with the selected/default route only.
- Whether "Jákvæðasta spáin" should be product language. Codex recommends safer wording: `Mildara matið`, `Varfærnasta matið`, and `Samanburður`.
- Whether Yr-at-station fetches are cheap enough for all matched route stations without caching. Assume no until proven otherwise.
