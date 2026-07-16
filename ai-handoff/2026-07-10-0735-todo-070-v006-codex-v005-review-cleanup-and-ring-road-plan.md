# TODO #70 - v005 review: remove stale Þrengslavegur rule, copy polish, plan Hringurinn

Created: 2026-07-10 07:35  
Timezone: Atlantic/Reykjavik

Reviews: `2026-07-10-0730-todo-070-v005-claude-vias-refactor-austurland-done.md`

## Findings

### Medium - Þrengslavegur curated rule is now producing a worse duplicate

Stebbi's production screenshots show:

- `Reykjavík -> Þorlákshöfn`
  - Google fastest route is now the correct-looking Þrengslavegur route: `53 km`, `45 mín.`
  - `Um Þrengslaveg` curated route is slower/longer: `58 km`, `58 mín.`
  - Default Route 427 route remains as a third option: `76 km`, `1 klst. 7 mín.`

The old `CURATED_VIA_THRENGSLAVEGUR` rule has become counterproductive. It no longer fixes the route picker; it adds a visibly worse duplicate and makes the UI less trustworthy.

Recommendation: remove/deactivate the explicit Þrengslavegur curated rule from `CURATED_ROUTE_RULES`.

Do not remove support for historical `CURATED_VIA_THRENGSLAVEGUR` labels in analytics sanitization/admin tests unless that is necessary. Historic usage rows may still contain the label and should not break admin aggregation.

### Low - Fastest label should be more natural Icelandic

Change Icelandic route option copy:

- from: `Fljótlegasta leið`
- to: `Fljótlegasta leiðin`

Likely key:

- `messages/is.json`: `routeOptionShortest`

English can remain `Fastest route` unless Claude Code sees a reason to adjust it.

### Product - Hringurinn should be a route family, not a generic Hellisheiði exception

Stebbi wants users to be able to see Hringurinn as a real travel-weather alternative. This is valid product direction: a longer route may be the only weather-sensible route.

Do not implement Hringurinn as "always add one Hellisheiði via-point for everything." A single Hellisheiði via-point may not produce the full south/east ring-road geometry for Akureyri; Google could satisfy Hellisheiði and then route back north/west.

Recommendation: create an explicit curated route family for Hringurinn using multiple hidden via-points.

## Immediate implementation scope

For the next small patch, Claude Code should do only:

1. Remove/deactivate the `capital-area-to-thorlakshofn-via-threngslavegur` curated rule.
2. Remove `THRENGSLAVEGUR_VIA` if it becomes unused.
3. Remove the UI mapping for `CURATED_VIA_THRENGSLAVEGUR` only if no current route can produce that label.
4. Keep analytics/admin sanitization tolerant of historic `CURATED_VIA_THRENGSLAVEGUR` labels if those tests exist.
5. Change `routeOptionShortest` in Icelandic to `Fljótlegasta leiðin`.
6. Update affected tests.

Do not bundle full Hringurinn implementation into this cleanup unless Stebbi explicitly scopes it in. It deserves its own deliberate route-family pass.

## Test updates expected for cleanup

Update `lib/__tests__/weather-google.test.ts`:

- Remove or rewrite tests that expect `CURATED_VIA_THRENGSLAVEGUR` to be generated for Þorlákshöfn.
- Add/adjust a regression that `Garðabær/Reykjavík -> Þorlákshöfn` does **not** produce `CURATED_VIA_THRENGSLAVEGUR` after cleanup.
- Keep tests that prove route options still survive when Google returns multiple default alternatives.
- Keep final-submit tests generic or switch them to `CURATED_VIA_HELLISHEIDI` if they only need "selected curated route works."

Update route-label tests if present:

- `routeOptionShortest` displays `Fljótlegasta leiðin`.
- `CURATED_VIA_HELLISHEIDI` still displays `Um Hellisheiði`.

Analytics tests:

- Do not accidentally reject historic `CURATED_VIA_THRENGSLAVEGUR` metadata if the sanitizer currently accepts it. Historic admin data should still aggregate safely.

## Hringurinn route-family plan

Create a later explicit route-family implementation for:

- `CURATED_RING_ROAD_SOUTH_EAST`
- user-facing label: `Hringurinn`
  - possible fuller label later: `Hringurinn um suður/eystra land`

This should use the new `vias` support from v005. Candidate multi-via shape for Reykjavík/capital-area -> Akureyri:

```ts
{
  id: 'capital-area-to-north-via-south-east-ring-road',
  logName: 'Hringurinn suður/eystra',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: { bounds: [NORTH_ICELAND_BOUNDS] },
  vias: [
    HELLISHEIDI_VIA,
    SOUTH_EAST_RING_ANCHOR_VIA,
    EAST_NORTH_RING_ANCHOR_VIA,
  ],
  labels: ['CURATED_RING_ROAD_SOUTH_EAST'],
}
```

The exact via-points must be verified visually. Do not guess and ship. For Akureyri, the route must actually go:

- Reykjavík/capital area
- Hellisheiði
- south/east along Route 1
- past Höfn / east side as appropriate
- north/west to Akureyri

It must not merely touch Hellisheiði and then route back west/north.

## Hringurinn UI expectations

When implemented, do not label this as:

- `Um Hellisheiði`
- `Önnur leið`
- or generic `Sjálfgefin Google-leið`

It should be visibly intentional:

- `Hringurinn`
- maybe with helper text later: `Lengri leið sem getur skipt máli í veðri`

Duration sorting can still put it last. That is fine. But the label should make clear why a very long route appears.

## Hringurinn tests for later phase

Not required in the immediate cleanup patch unless Stebbi explicitly asks Claude Code to implement Hringurinn now.

When implemented:

1. `Reykjavík -> Akureyri` shows `Hringurinn`.
2. The `Hringurinn` route geometry actually goes south/east around Route 1.
3. It uses multiple `intermediates` in the intended order.
4. It sorts by duration, probably after fastest/default routes.
5. Selecting it survives final submit.
6. Weather sampling uses the long ring-road geometry.
7. It does not appear for irrelevant short/capital-area routes.

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No production data changes expected.

Removing the Þrengslavegur generation rule should reduce extra Google Routes calls for Þorlákshöfn.

Future Hringurinn route-family rules will add Google Routes calls when they match. Keep matchers narrow and explicit.

Do not store raw route geometry, exact route pairs, origin/destination coordinates, place names, or provider payloads in analytics/admin.

## Localhost checks for Stebbi

After the immediate cleanup patch:

1. `Reykjavík -> Þorlákshöfn`
   - Expected: no `Um Þrengslaveg` curated duplicate.
   - Expected: fastest/default Google option should still show the useful Þrengslavegur route if Google returns it.
   - Expected: route list looks cleaner than the current screenshot.
2. `Garðabær -> Þorlákshöfn`
   - Same expectation.
3. `Reykjavík -> Egilsstaðir`
   - Expected: `Um Hellisheiði` still appears from v005.
   - Expected: no regression in the Austurland rule.
4. `Garðabær -> Selfoss/Hveragerði`
   - Expected: `Um Hellisheiði` still appears.
5. `Reykjavík/Garðabær -> Akureyri`
   - Expected for immediate cleanup: no Hringurinn yet unless Stebbi separately scopes it.
   - Expected label copy for fastest route: `Fljótlegasta leiðin`.

For the later Hringurinn phase:

1. `Reykjavík -> Akureyri`
   - Expected: route picker shows `Hringurinn`.
   - Expected: geometry actually goes south/east, not just a token Hellisheiði detour.
   - Expected: selecting it reaches final weather result without `selected_route_unavailable`.

## Suggested next step

Claude Code should first do the cleanup patch:

1. remove Þrengslavegur curated generation;
2. update fastest copy;
3. update tests;
4. hand off for review.

Then, if Stebbi wants to proceed, create a separate Hringurinn implementation handoff with verified via-points and screenshots before coding.

## Óvissa / þarf að staðfesta

Codex has not verified the current production behavior beyond Stebbi's screenshots.

If Google stops returning the correct Þrengslavegur fastest route later, removing the curated rule could re-open that old issue. Given current screenshots, the duplicate is worse than the old protection. If this worries Claude Code, consider leaving a disabled/commented documented rule or adding a future fallback only when Google fails to return any short Þrengslavegur-like route.

The Hringurinn via-points are intentionally not specified here. They need visual verification before implementation.
