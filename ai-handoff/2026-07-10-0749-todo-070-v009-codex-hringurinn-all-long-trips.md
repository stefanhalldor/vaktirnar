# TODO #70 - Hringurinn for long trips over 350 km

Created: 2026-07-10 07:49  
Timezone: Atlantic/Reykjavik

Supersedes product stance in: `2026-07-10-0744-todo-070-v008-codex-v007-hringurinn-review.md`

## Context

Stebbi clarified that v008 was too conservative.

Product direction from Stebbi:

> Ég vil sýna hringinn fyrir lengri ferðir en 350km. Í mínum huga er þetta ekki UI noise því þetta er bara einn auka valmöguleiki sem er neðst og þetta er mjög íslenskt að hugsa þetta með þessum hætti. Við þurfum bara að passa að halda okkur á þjóðvegi 1 á leiðinni til þess að fara ekki óþarfa auka slaufur sem lengir hringinn enn meira.

Codex correction:

v008 would **not** have shown Hringurinn for all trips over 350 km. It recommended starting narrower. That is not aligned with Stebbi's product decision.

This v009 updates the plan: show one Hringurinn option for long trips over 350 km, with guardrails focused on route geometry quality.

## Updated product decision

For trips where the normal/fastest route is longer than roughly 350 km:

- create one extra curated route suggestion;
- label it `Hringurinn`;
- keep it as one additional option, usually sorted near/bottom by duration;
- do not treat it as UI noise;
- make sure it actually follows Þjóðvegur 1 / Hringvegurinn as much as possible;
- avoid unnecessary extra loops/slaufur caused by bad via-points.

The value proposition is travel-weather specific: the longest route can still be the weather-sensible route.

## Revised Codex recommendation

Implement a generic long-trip Hringurinn rule, but do it with geometry guardrails:

1. Use `minFastestRouteDistanceM: 350_000` or equivalent.
2. Add one curated route request for `CURATED_RING_ROAD`.
3. Use multiple verified via-points on Route 1.
4. Show it only if it is distinct from already returned routes.
5. If Google returns a route with obvious off-Route-1 detours caused by bad via-points, adjust via-points before release.

Do not use "destination family only" as the main matcher anymore. Distance threshold is now part of the product rule.

## Important technical caveat

The route must not be a random long route.

It must be a Hringurinn/Route 1 route. The via-points should be placed on or immediately at Route 1, not town centers that can pull the route into extra local loops.

For example, avoid using a via coordinate in the middle of Vík/Höfn/Egilsstaðir if that makes Google leave Route 1, enter town streets, and return to Route 1. Prefer road-aligned coordinates on the ring road itself.

## Proposed route-registry shape

Extend `CuratedRouteRule` with a distance guardrail if not already present:

```ts
type CuratedRouteRule = {
  id: string
  logName: string
  origin: PlaceMatcher
  destination: PlaceMatcher
  vias: readonly { lat: number; lon: number }[]
  labels: readonly string[]
  minFastestRouteDistanceM?: number
}
```

Important:

- `minFastestRouteDistanceM` should be evaluated using already fetched normal Google route options.
- Do not make an extra provider call just to decide whether to try Hringurinn.
- Do not put distance threshold under `destination`; it is a route-pair condition, not a destination property.

## Proposed v1 Hringurinn rule

Start with Iceland-wide or broad Iceland-route matching, guarded by distance:

```ts
{
  id: 'long-trip-ring-road',
  logName: 'Hringurinn',
  origin: { bounds: [ICELAND_BOUNDS] },
  destination: { bounds: [ICELAND_BOUNDS] },
  minFastestRouteDistanceM: 350_000,
  vias: [
    // Direction/anchor points must be verified on Route 1.
    HELLISHEIDI_VIA,
    RING_ROAD_SOUTH_VIA,
    RING_ROAD_EAST_VIA,
    RING_ROAD_NORTH_EAST_VIA,
  ],
  labels: ['CURATED_RING_ROAD'],
}
```

User-facing label:

- `Hringurinn`

Do not label it:

- `Um Hellisheiði`
- `Önnur leið`
- `Sjálfgefin Google-leið`

## Route direction / via-point concern

One static via sequence may work for capital-area-origin examples like:

- Reykjavík -> Akureyri
- Garðabær -> Akureyri
- Reykjavík -> Mývatn

But it may not be correct for every possible origin/destination pair in Iceland.

For v1, Claude Code should either:

1. implement Hringurinn only for origins that are in or go through the capital-area/west approach, while still using `>350 km`; or
2. implement a direction-aware via sequence for broader Iceland-wide long trips.

If choosing option 1, the product still satisfies Stebbi's current examples and avoids accidentally bad routes from arbitrary Icelandic origins.

If choosing option 2, tests must cover several origin/destination directions.

Codex lean: start with capital-area / west-approach origins for the first Hringurinn release, then generalize once we have proof. But the product rule remains "long trips over 350 km get Hringurinn" within the supported origin scope.

## Via-point guidance

Candidate anchors should be verified visually on Route 1:

- Hellisheiði / Route 1
- South coast Route 1 anchor, not an in-town point
- East/southeast Route 1 anchor around Höfn/Djúpivogur corridor, not an in-town detour
- Northeast Route 1 anchor around Egilsstaðir/Jökuldalur/Mývatn corridor, if needed for Akureyri

Claude Code should not ship coordinates just because they are near a town. The map must show the route staying on Hringvegurinn without unnecessary slaufur.

## Filtering / duplicate handling

Still use existing duplicate geometry/fingerprint skipping.

Show Hringurinn if:

- fastest route distance >= 350 km;
- curated route returns successfully;
- geometry is distinct from existing routes;
- route geometry is visually sane on localhost.

Do **not** require the Hringurinn route to be 40% longer or 150 km longer before showing. The product decision is to show it as one extra long-trip option. Duration sorting can put it last.

If the returned route is only trivially different from the fastest route, duplicate skipping should remove it.

## UI copy

Add route label mapping:

```ts
CURATED_RING_ROAD -> "Hringurinn"
```

Translations:

- `messages/is.json`: `"routeOptionRingRoad": "Hringurinn"`
- `messages/en.json`: `"routeOptionRingRoad": "Ring Road"`

Route label priority should be:

1. `CURATED_RING_ROAD`
2. `CURATED_VIA_HELLISHEIDI`
3. fastest/default/other labels

Keep:

- `routeOptionShortest`: `Fljótlegasta leiðin`

## Tests Claude Code should add/update

Immediate cleanup from v006 still stands:

1. Remove stale Þrengslavegur curated generation.
2. Change `Fljótlegasta leið` -> `Fljótlegasta leiðin`.
3. Keep historic analytics tolerant of `CURATED_VIA_THRENGSLAVEGUR`.

For Hringurinn:

1. A route with fastest distance <350 km does not request Hringurinn.
2. `Reykjavík/Garðabær -> Akureyri` requests Hringurinn.
3. Hringurinn request includes multiple via-points in the intended order.
4. Hringurinn route gets label `CURATED_RING_ROAD`.
5. Route picker displays `Hringurinn`.
6. If Google returns duplicate geometry, Hringurinn is skipped.
7. Selecting Hringurinn survives final submit and weather sampling uses its geometry.
8. `Reykjavík -> Egilsstaðir` does not get a confusing duplicate if the Hellisheiði/Austurland route already covers the useful route. If both are returned, labels must be clear and not misleading.
9. Test at least one long route that should not produce a bad off-Route-1 slaufa if supported by mocks/geometry fixtures.

If implementing Iceland-wide long-trip matching, also test:

- non-capital origin -> long destination where Hringurinn should be sane;
- non-capital origin -> long destination where Hringurinn should not be attempted or should use a different via sequence.

## Localhost checks for Stebbi

After implementation, open `/auth-mvp/vedrid`.

Required checks:

1. `Reykjavík -> Akureyri`
   - Expected: route picker shows `Hringurinn`.
   - Expected: route goes from Reykjavík over Hellisheiði and then along Route 1 south/east/north toward Akureyri.
   - Expected: no unnecessary local-town loops around via points.
   - Expected: Hringurinn likely sorts below the fastest route.
   - Select it and continue.
   - Expected: no `selected_route_unavailable`; result/weather route follows Hringurinn geometry.
2. `Garðabær -> Akureyri`
   - Same expected result.
3. `Reykjavík -> Egilsstaðir`
   - Expected: no confusing duplicate labels.
   - If both `Um Hellisheiði` and `Hringurinn` appear, Stebbi should decide whether both are useful or whether one should be skipped.
4. `Reykjavík -> Þorlákshöfn`
   - Expected: no stale `Um Þrengslaveg` duplicate.
   - Expected: no Hringurinn because route is under 350 km.
5. `Garðabær -> Selfoss/Hveragerði`
   - Expected: no Hringurinn because route is under 350 km.
   - Existing `Um Hellisheiði` behavior remains if relevant.
6. One route just under/over 350 km if easy to find
   - Expected: threshold behavior is understandable.

Do not test broad production sweeps casually. Each matching Hringurinn route adds a Google Routes request.

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No user-data storage changes expected.

Analytics/admin may record coarse label `CURATED_RING_ROAD`. That is okay.

Do not store raw route geometry, exact route pairs, origin/destination coordinates, place names, or Google payloads.

## Suggested next step

Claude Code should update the plan from v008:

1. finish v006 cleanup;
2. implement Hringurinn for long trips over 350 km as a deliberate product rule;
3. start with capital-area/west-approach origins unless Claude Code can make broader direction-aware matching safely;
4. verify via-points visually on localhost;
5. stop for Codex/Stebbi review before release.

## Óvissa / þarf að staðfesta

The exact via-points are not specified here because they must be verified on Route 1.

The biggest risk is not UI noise; it is bad geometry: a "Hringurinn" option that leaves Route 1 for avoidable slaufur or does not actually go around the ring.

If one static via sequence cannot support all long routes, scope v1 to capital-area/west-approach origins and make broader Iceland-wide support a later direction-aware route-family step.
