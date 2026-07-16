# TODO #70 - Hringurinn as a real weather-route option

Created: 2026-07-10 07:23  
Timezone: Atlantic/Reykjavik

Extends: `2026-07-10-0721-todo-070-v003-codex-east-iceland-hellisheidi-expansion.md`

## Context

After v003, Stebbi clarified an important product direction:

> Á ferðalaginu vill fólk alveg líka sjá hringinn. Í seinni fösum, þegar við verðum klókari í að sýna fólki fleiri leiðir, getur hringurinn í mörgum tilfellum verið eina veðurfarslega leiðin sem meikar sens.

This changes the framing. A long "Hringurinn" route should not automatically be treated as UI noise. For travel weather, a route that is slower or much longer can still be the only weather-sensible option.

## Codex updated product stance

Keep v003 as the immediate fix for East Iceland, but do not permanently reject a broader Hringurinn concept.

The right model is:

1. **Normal Google alternatives**
   - what Google thinks is fastest/default.
2. **Confirmed corridor fixes**
   - e.g. Þrengslavegur, Hellisheiði to south/east, Hellisheiði to East Iceland.
3. **Weather-route families**
   - later phase: explicitly show long alternatives like "Hringurinn um suður/eystra land" when weather conditions could make them relevant.

The key is that "Hringurinn" should be labelled and treated as an intentional travel-weather alternative, not just a random extra route.

## Important technical distinction

Do not assume that a single hidden Hellisheiði via-point is enough to represent "the full ring road".

For example:

- `Reykjavík -> Akureyri` with one hidden via-point at Hellisheiði might:
  - go Reykjavík -> Hellisheiði,
  - then route back west/north to Akureyri,
  - or otherwise satisfy the via-point without representing the south/east ring-road route Stebbi has in mind.

If we want a real "Hringurinn um suður/eystra land" option, we likely need **multiple hidden via-points**, for example:

- Hellisheiði / Route 1
- south/east coast anchor such as Höfn/Djúpivogur/Egilsstaðir area, depending on destination
- possibly another north/east anchor for Akureyri/Mývatn-style destinations

Do not implement this as "one Hellisheiði point catches everything" unless localhost proves the geometry is actually right.

## Recommendation for current pass

For the immediate v003 follow-up:

1. Implement the East Iceland Hellisheiði expansion for `Reykjavík/Garðabær -> Egilsstaðir`.
2. Keep Akureyri/north routes excluded from the current simple Hellisheiði rule.
3. But structure the code so future curated route rules can support multiple via-points.

If the current `CuratedRouteRule` still only supports:

```ts
via: { lat: number; lon: number }
```

Claude Code should consider a small refactor to:

```ts
vias: readonly { lat: number; lon: number }[]
```

Then current rules simply use one item:

```ts
vias: [HELLISHEIDI_VIA]
```

and the existing Þrengslavegur rule uses:

```ts
vias: [THRENGSLAVEGUR_VIA]
```

This is only worth doing now if it stays small and tests remain clear. If it causes churn, leave it for the Hringurinn phase and keep v003 single-via.

## Future route-family concept

Create/track a later phase for route families like:

- `CURATED_RING_ROAD_SOUTH_EAST`
- user-facing label: `Hringurinn um suður/eystra land`
- possibly a short helper label: `Lengri veðurleið`

This should be presented differently from "Fljótlegasta leið":

- not as a mistake,
- not as a generic "Önnur leið",
- but as a deliberate weather-aware alternative.

Possible UI copy later:

- `Hringurinn um suður/eystra land`
- `Lengri leið sem getur skipt máli í veðri`
- `Skoða veður á þessari leið`

Do not implement this UI copy now unless Stebbi explicitly asks. This handoff is mainly to stop us from designing the data model in a way that makes it hard later.

## Why this matters for weather

Normal consumer routing optimizes primarily for time/distance. Ferðaveðrið is different: a much longer route can be more relevant if the shortest route has worse wind, precipitation, mountain passes, or exposed conditions.

So route selection should eventually become:

- fastest/direct route,
- reasonable alternate road route,
- weather-sensible longer route,
- and then the weather evaluation tells the user what each route looks like.

This is especially relevant for:

- East Iceland
- North Iceland
- mountain-pass-heavy routes
- trailer / hjólhýsi / high wind profiles

## Tests to add now vs later

### Current pass tests

Keep v003 tests:

- Reykjavík/Garðabær -> Egilsstaðir gets `Um Hellisheiði`.
- Reykjavík/Garðabær -> Akureyri does not get the simple Hellisheiði rule yet.
- Þorlákshöfn still gets `Um Þrengslaveg`.
- Hveragerði/Selfoss still get `Um Hellisheiði`.

If refactoring `via` to `vias`, add tests that:

- single-via rules still produce exactly one `intermediates` entry;
- future multiple-via structure serializes intermediates in order;
- existing duplicate-geometry logic still works.

### Later Hringurinn phase tests

Not for this immediate fix unless Stebbi explicitly scopes it in.

Later tests should include:

- Reykjavík -> Akureyri with a deliberate south/east ring-road option.
- Route geometry must actually go south/east, not just touch Hellisheiði and return north.
- UI label must be `Hringurinn...` or equivalent, not `Um Hellisheiði`.
- Weather sampling must use that long route's geometry.
- It must sort by duration, but still remain visibly intentional if it is last.

## Product decision on "always add Hellisheiði"

Updated from v003:

Do not dismiss the idea because the route is long.

But also do not implement it as a blind single-via Hellisheiði rule.

The better product/technical version is:

> Add explicit curated route families where the longer route is meaningful for weather, and label them as such.

That gives us the value Stebbi is describing without confusing users with accidental weird routes.

## Supabase / privacy / production notes

No SQL migration expected for this immediate work.

No RLS/auth/grants changes expected.

If route-family labels are added later, they are acceptable as coarse analytics metadata, but do not store raw coordinates, route geometry, exact origin/destination, or provider payloads.

Multiple via-points still create Google Routes requests and may increase provider cost if matchers are too broad.

## Localhost checks for Stebbi

For the immediate v003/v004 combined work, test:

1. `Reykjavík -> Egilsstaðir`
   - Expected now: `Um Hellisheiði` appears.
   - Expected route should start over Hellisheiði / Route 1.
   - Continue to result; no `selected_route_unavailable`.
2. `Garðabær -> Egilsstaðir`
   - Same expected result.
3. `Reykjavík -> Akureyri`
   - Expected in this immediate pass: no generic `Um Hellisheiði` yet.
   - This is intentional until Hringurinn route-family work is explicitly implemented.
4. `Garðabær -> Þorlákshöfn`
   - Expected: `Um Þrengslaveg` remains.
5. `Garðabær -> Selfoss/Hveragerði`
   - Expected: `Um Hellisheiði` remains.

For a later Hringurinn phase, Stebbi should test:

- Reykjavík -> Akureyri
- Reykjavík -> Mývatn
- Reykjavík -> Egilsstaðir

and confirm whether the "Hringurinn" option actually follows the intended full-route geometry, not just a token Hellisheiði detour.

## Suggested next step

Claude Code should still implement the v003 East Iceland expansion first.

While doing that, Claude Code should either:

1. keep the current single-via structure and note that Hringurinn needs a later multi-via refactor, or
2. make a small `via` -> `vias` refactor now if it is low-risk and well-tested.

Do not implement full Hringurinn route families in the same small fix unless Stebbi explicitly scopes that in.

## Óvissa / þarf að staðfesta

Codex has not verified which via-points are needed for a true Hringurinn route family.

The immediate Egilsstaðir fix may work with only Hellisheiði, but Akureyri-style Hringurinn almost certainly needs more than one via-point.

Future Hringurinn routes need product labels and UX treatment so users understand why a much longer route is being shown.
