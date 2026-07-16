# TODO #70 - Codex review of v007 Hringurinn product analysis

Created: 2026-07-10 07:44  
Timezone: Atlantic/Reykjavik

Reviews: `2026-07-10-0745-todo-070-v007-claude-hringurinn-product-analysis.md`

## Findings

### High - Do not use "all trips >350 km" as the primary matcher

v007 describes Stebbi's idea as "gera þetta fyrir allar ferðir >350km" and sketches `destination: { minDistanceKm: 350 }` as Leið A: `v007` lines 42-45 and 78-88.

Codex recommendation: do **not** implement Leið A as the first Hringurinn implementation.

Reason:

- `>350 km` is not a route-family. It catches unrelated long trips where the south/east ring road is not a sensible option.
- It can create UI noise for Westfjords, Snæfellsnes, north/west, or other long routes.
- It adds a Google Routes request for every matching long route.
- It forces the route registry to become more clever before we have one verified Hringurinn route.

Use distance only as a secondary guardrail, not as the main product rule.

### Medium - Choose Leið C/hybrid, not pure Leið A or pure Leið B

v007's Leið C says to use a distance threshold to decide whether to try Hringurinn, but still use geographic destination matching to avoid wrong routes: `v007` line 95.

This is the right direction.

Recommended first implementation:

1. Keep explicit destination family bounds.
2. Add a minimum normal-route distance or straight-line heuristic only to avoid short/irrelevant trips.
3. Start with one high-value family:
   - capital area -> North Iceland, especially Akureyri/Mývatn.
4. Do not try to cover all Icelandic long trips in one generic rule.

That gives us a useful Hringurinn option without making the route picker noisy everywhere.

### Medium - "Áberandi lengri" should be a filter/diagnostic, not the source of the user label

v007 suggests `labelIfLongerThanFastestByPct: 40` and asks whether the threshold belongs in registry or UI: `v007` lines 61-63 and 84-88.

Codex recommendation:

- The route-family label should come from the rule: `CURATED_RING_ROAD_SOUTH_EAST` -> `Hringurinn`.
- A "materially different" threshold can decide whether to **show or skip** the route after Google returns it.
- The UI should not dynamically decide whether a returned route is Hringurinn based on percent difference.

In other words:

```ts
labels: ['CURATED_RING_ROAD_SOUTH_EAST']
displayOnlyIfLongerThanFastestByPct: 25 // optional filter, not label source
```

Why:

- User-facing labels should be stable and intentional.
- UI should not infer route semantics from duration/distance math.
- If Google returns a Hringurinn geometry that is only 20% longer, it is still Hringurinn.

### Medium - Three via-points may be enough for Akureyri, but v007's proposed points are not enough to trust without an east/north anchor

v007 proposes Hellisheiði + Vík + Höfn as candidate points: `v007` lines 67-74.

Those are plausible starting points, but for `Reykjavík -> Akureyri` they may still not fully guarantee the intended ring-road geometry. The safer candidate route should include an east/north anchor after Höfn, for example around Egilsstaðir or another verified Route 1 point before the route turns toward Mývatn/Akureyri.

Recommended first candidate:

```ts
vias: [
  HELLISHEIDI_VIA,
  RING_ROAD_SOUTH_VIA,      // Vík/Kirkjubæjarklaustur/Höfn, verified on Route 1
  RING_ROAD_EAST_VIA,       // Höfn/Djúpivogur area, verified on Route 1
  RING_ROAD_EAST_NORTH_VIA, // Egilsstaðir/Jökuldalur/Mývatn corridor, verified on Route 1
]
```

It is okay if Claude Code starts with 3 via-points, but only if localhost proves `Reykjavík -> Akureyri` actually follows the full south/east ring-road path. Do not guess and ship.

### Low - v007 is missing the required "Localhost checks for Stebbi" section

Per `ai-handoff/README.md`, every handoff/plan/review needs `Localhost checks for Stebbi`.

v007 has useful next steps, but no dedicated localhost checklist.

This does not invalidate the analysis, but Claude Code should include the required section in the next handoff.

## Direct answers to Claude's questions

### 1. Er Leið A raunhæf?

Technically yes, product-wise not as v1.

`CuratedRouteRule` could support `minDistanceKm`, but pure distance-based matching is too blunt. Use a hybrid:

- destination family bounds,
- origin bounds,
- optional route distance / straight-line distance threshold,
- optional show/skip threshold after the route returns.

### 2. Þarf `CuratedRouteRule` að styðja distance-threshold matcher?

Eventually yes, but not as the only matcher.

If added, make it explicit and boring:

```ts
minFastestRouteDistanceM?: number
```

or:

```ts
minOriginDestinationDistanceKm?: number
```

Prefer using already-returned fastest route distance if available so we do not add extra preflight provider calls.

Do not put distance threshold under `destination`; it is not a destination property.

### 3. Hvernig á að meðhöndla "áberandi lengri" threshold?

Put it in provider post-processing / registry filtering, not UI.

Example semantics:

- rule always has label `CURATED_RING_ROAD_SOUTH_EAST`;
- after route returns, compare to fastest existing route;
- if it is duplicate or not meaningfully different, skip it;
- if it is much longer, still show it, because that is the point of Hringurinn.

Avoid making the threshold too strict. For Hringurinn, "longer" is expected. The filter should prevent accidental near-duplicates, not hide a valid weather route.

### 4. Eru 3 via-punktar nóg?

Maybe for some routes, not guaranteed.

For `Reykjavík -> Akureyri`, Codex expects 3-4 via-points are safer:

- Hellisheiði
- south/east coast anchor
- Höfn/east anchor
- Egilsstaðir/Jökuldalur/Mývatn-side anchor

The exact points must be chosen from verified Route 1 locations, not approximate town centers if those centerpoints cause detours.

### 5. Er API-kostnaður við allar ferðir >350km ásættanlegur?

Probably manageable at current scale, but not a reason to make the matcher broad.

The bigger issue is UI noise and wrong route semantics. Keep matchers explicit now. If usage grows, admin analytics can show how often curated route labels appear and whether the extra request cost is worth it.

## Recommended next implementation order

Do not jump straight to Hringurinn implementation before v005/v006 are clean.

Recommended order:

1. Finish v006 cleanup:
   - remove stale Þrengslavegur curated generation;
   - change `Fljótlegasta leið` -> `Fljótlegasta leiðin`;
   - update tests.
2. Commit/push/release only after Stebbi confirms localhost/prod behavior for:
   - Þorlákshöfn cleanup,
   - Egilsstaðir Hellisheiði,
   - Selfoss/Hveragerði Hellisheiði.
3. Create a separate Hringurinn implementation handoff.
4. Implement first Hringurinn route family for `capital area -> North Iceland`, starting with Akureyri.

## Suggested Hringurinn v1 scope

Route family:

- origin: capital area, possibly west/north approach later.
- destination: North Iceland route family, starting with Akureyri and maybe Mývatn after testing.
- label: `CURATED_RING_ROAD_SOUTH_EAST`.
- user-facing label: `Hringurinn`.
- via-points: verified Route 1 anchors, probably 3-4 points.

Do not include:

- every trip >350 km;
- Westfjords;
- Snæfellsnes;
- random south/east trips already handled by Hellisheiði;
- short trips.

## Localhost checks for Stebbi

For cleanup first:

1. `Reykjavík -> Þorlákshöfn`
   - Expected: no `Um Þrengslaveg` duplicate.
   - Expected: fastest Google route still looks sane.
   - Expected: `Fljótlegasta leiðin` text appears.
2. `Reykjavík -> Egilsstaðir`
   - Expected: `Um Hellisheiði` still appears.
3. `Garðabær -> Selfoss/Hveragerði`
   - Expected: `Um Hellisheiði` still appears.

For Hringurinn later:

1. `Reykjavík -> Akureyri`
   - Expected: route picker shows `Hringurinn`.
   - Expected: map route goes south/east around Route 1, not just over Hellisheiði and back north.
   - Expected: duration is likely much longer and sorts after fastest route.
   - Expected: selecting `Hringurinn` reaches final weather result without `selected_route_unavailable`.
2. `Reykjavík -> Egilsstaðir`
   - Expected: does not show a confusing duplicate Hringurinn if `Um Hellisheiði` already covers the useful route.
3. `Reykjavík -> Ísafjörður/Snæfellsnes` if easy to test
   - Expected: no Hringurinn south/east route in v1.

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No user-data storage changes expected.

Adding route-family labels to analytics is okay if they are coarse labels only, such as `CURATED_RING_ROAD_SOUTH_EAST`. Do not store raw route geometries, exact origin/destination coordinates, place names, or provider payloads.

Each Hringurinn match adds a Google Routes request. Keep v1 matchers narrow and confirm in admin analytics later.

## Final recommendation

Approve v007's product direction, but do not implement Leið A.

Use Leið C:

- explicit destination family,
- optional distance guardrail,
- multiple verified via-points,
- stable `Hringurinn` label from route-family rule,
- separate implementation after v006 cleanup.

This keeps the door open for the strong product idea while avoiding a noisy "try Hringurinn for everything long" implementation.
