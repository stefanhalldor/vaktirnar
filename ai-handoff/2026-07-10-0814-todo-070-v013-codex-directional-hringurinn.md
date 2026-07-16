# TODO #70 - Direction-aware Hringurinn route

Created: 2026-07-10 08:14  
Timezone: Atlantic/Reykjavik

## Context

Stebbi tested `Reykjavík -> Höfn` and found a broken `Hringurinn` route:

- Fastest route: Reykjavík -> south coast -> Höfn, 461 km / 5 klst. 57 mín.
- `Hringurinn`: 788 km / 10 klst. 47 mín.
- Map shows the route going south past Höfn, continuing toward Egilsstaðir, and then back to Höfn.

Stebbi:

> Þurfum að passa að hringurinn fari raunverulega alltaf hinn hringinn... sjá hér á skjámynd sem sýnir að frá reykjavík til höfn er farið framhjá höfn til egilsstaða og svo aftur til baka til Hafnar

## Root Cause

Current Hringurinn implementation uses one fixed ordered via list:

```ts
[HELLISHEIDI_VIA, RING_ROAD_SOUTH_VIA, RING_ROAD_EAST_VIA, RING_ROAD_NORTHEAST_VIA]
```

That works for destinations like `Akureyri`, where the intended alternate is:

```txt
Reykjavík -> Hellisheiði -> south coast -> east -> north -> Akureyri
```

It fails for south/east destinations that occur before the later via-points, for example `Höfn`.

For `Reykjavík -> Höfn`, forcing via-points east/northeast of Höfn tells Google:

```txt
Reykjavík -> south coast -> pass Höfn -> Egilsstaðir area -> return to Höfn
```

That is not "hinn hringinn". It is a pass-the-destination-and-return route.

## Product Rule

`Hringurinn` should mean:

> Show the other sensible way around Route 1 to reach the destination, not a fixed full via chain that may pass the destination and come back.

So for examples:

- `Reykjavík -> Akureyri`
  - Fastest is usually north/west.
  - `Hringurinn` should go south/east/north.

- `Reykjavík -> Höfn`
  - Fastest is usually south/east.
  - `Hringurinn` should go north/east/south.
  - It must not go south past Höfn and back.

- `Reykjavík -> Egilsstaðir`
  - If fastest is north route, the alternate can be south/east via Hellisheiði.
  - It must not include unnecessary via-points beyond Egilsstaðir.

## Recommended Approach

Replace the single fixed Hringurinn via-list with direction-aware route families.

### Route family A - counter-clockwise / south-east-north

Use for destinations where the natural fastest route is north/west and the useful alternate is south/east:

```txt
Reykjavík -> Hellisheiði -> Mýrdalssandur/Vík area -> Höfn/Djúpivogur area -> Egilsstaðir area -> destination
```

Good candidates:

- Akureyri
- Mývatn / northeast
- possibly north destinations where this really is "the other way"

Do not include via-points after the destination in this direction.

### Route family B - clockwise / north-east-south

Use for south/east-coast destinations where the natural fastest route is south/east and the useful alternate is north/east/south:

```txt
Reykjavík -> Borgarnes/Route 1 north -> Blönduós area -> Akureyri/Mývatn area -> Egilsstaðir area -> destination
```

Good candidates:

- Höfn
- Djúpivogur
- Breiðdalsvík / east fjords if destination is reached from north/east
- possibly other south-east destinations where the "other hringurinn" should approach from the north/east

Do not include Hellisheiði/Mýrdalssandur before the destination for this family, because that is the same side as the fastest route.

## Minimum Safe Fix If Full Direction Logic Is Too Big

If Claude Code cannot safely implement direction-aware route families in one small patch:

1. Do **not** show `Hringurinn` for destinations where the current fixed via sequence would pass the destination and return.
2. Specifically hide/skip current Hringurinn for `Reykjavík/Garðabær -> Höfn` and similar south/east-coast destinations until Route family B exists.

Broken Hringurinn is worse than no Hringurinn.

## Implementation Notes

Preferred structure:

- Keep curated route registry central.
- Allow a Hringurinn rule to compute `vias` from `(origin, destination, baseRoutes)` rather than always using a static array.
- Or split Hringurinn into two explicit curated route rules:
  - `long-trip-ring-road-south-east-north`
  - `long-trip-ring-road-north-east-south`

The split-rule version may be simpler and easier to test.

Important details:

- `CURATED_RING_ROAD` label should remain `Hringurinn`.
- Only one `Hringurinn` option should appear for a given origin/destination pair.
- It is okay if `Hringurinn` is slow; it is not okay if it goes past the destination and doubles back because of wrong via ordering.
- Do not rely only on route description strings.
- Use destination bounds/regions and via ordering.
- Keep `minFastestRouteDistanceM: 350_000`.
- Keep `Hringurinn` separate from the Hellisheiði duplicate filter in v012.

## Suggested Destination Region Heuristic

This does not have to be perfect, but should be explicit and testable.

Possible first-pass region categories:

```txt
South coast / southeast before Egilsstaðir:
  Vík, Kirkjubæjarklaustur, Höfn, Djúpivogur
  -> use north-east-south Hringurinn, or skip until that family exists

North / northeast:
  Akureyri, Mývatn, Húsavík-ish if applicable
  -> use south-east-north Hringurinn

East Iceland:
  Egilsstaðir / Seyðisfjörður / Neskaupstaður
  -> use whichever family creates the true alternate without via-points beyond destination
```

If region classification feels fragile, prefer a conservative first release:

- Akureyri/north: show south-east-north Hringurinn.
- Höfn/southeast: show north-east-south Hringurinn only if via-points are visually verified.
- Otherwise skip Hringurinn rather than showing broken geometry.

## Tests To Add

Add/update tests in `lib/__tests__/weather-google.test.ts`.

Recommended cases:

1. `Reykjavík/Garðabær -> Akureyri`
   - `Hringurinn` request should include south/east via-points.
   - First via should be Hellisheiði.

2. `Reykjavík/Garðabær -> Höfn`
   - `Hringurinn` request must **not** use the current south/east/northeast fixed via-list.
   - It must not include via-points beyond Höfn that force pass-and-return.
   - If direction-aware north/east/south family is implemented, first via should be a north/west Route 1 point, not Hellisheiði.

3. `Reykjavík/Garðabær -> Egilsstaðir`
   - No via-points beyond destination that force a return.
   - It may use south/east via if that is the alternate, but should stop logically before destination.

4. Only one `CURATED_RING_ROAD` option is returned.

5. Hringurinn remains gated by fastest route distance >= 350 km.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid`.

Before release, Stebbi should test:

1. `Reykjavík -> Höfn`
   - Expected: `Hringurinn`, if shown, goes the *other* way around the country.
   - It must not go south past Höfn to Egilsstaðir and then back.
   - If direction-aware north/east route is not implemented, `Hringurinn` should be hidden for this route.

2. `Garðabær -> Höfn`
   - Same expectation.

3. `Reykjavík -> Akureyri`
   - Expected: `Hringurinn` still appears.
   - It should go south/east/north around Route 1.

4. `Reykjavík -> Egilsstaðir`
   - Expected: no pass-destination-and-return behavior.
   - `Um Hellisheiði` and `Hringurinn` labels should not look like confusing duplicates.

5. `Reykjavík -> Selfoss`
   - Expected: no Hringurinn because under 350 km.
   - This also overlaps with v012 duplicate Hellisheiði check.

6. Select every visible `Hringurinn` option and continue to weather result.
   - Expected: no `selected_route_unavailable`.
   - Map in result should match the selected route.

No Supabase/auth/RLS/SQL testing is required. Do not run migrations.

## Release Recommendation

Do not release current Hringurinn behavior while `Reykjavík -> Höfn` goes past Höfn and back.

Minimum release-safe outcome:

- `Reykjavík -> Akureyri`: Hringurinn works.
- `Reykjavík -> Höfn`: Hringurinn either works as the true other direction or is hidden.
- No broken pass-and-return Hringurinn options.

## Óvissa / þarf að staðfesta

The exact via-points for the north-east-south family need visual verification. Good candidates should be on Route 1 and not inside towns.

Codex has not picked exact coordinates in this handoff because the important fix is the routing model: dynamic/directional Hringurinn, not another tweak to the current one-way via-list.
