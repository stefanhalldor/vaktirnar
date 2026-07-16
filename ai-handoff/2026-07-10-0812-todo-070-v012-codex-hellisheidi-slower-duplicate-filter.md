# TODO #70 - Filter slower duplicate Hellisheiði curated route

Created: 2026-07-10 08:12  
Timezone: Atlantic/Reykjavik

## Context

Stebbi tested `Reykjavík -> Selfoss` after the Hringurinn/Hellisheiði route work and saw:

- `Fljótlegasta leiðin` already uses `Hringvegur` and appears to go through the normal Hellisheiði corridor.
- `Um Hellisheiði` is also shown, but it is slower and slightly longer.
- The `Um Hellisheiði` map shape appears to include a small extra detour.

Stebbi asked:

> Getum við lagað það að Hellisheiðin sé ekki valinn með einhverjum auka detour, sérstaklega þegar búið er að setja Hellisheiði sem fljótlegustu leiðina? Ætti kannski að vera einföld regla bara ef "Um Hellisheiði" er lengri en stysta leiðin þá sleppum við að sýna hana?

## Product interpretation

Yes, this should be fixed.

But Codex recommends a slightly narrower rule than "hide `Um Hellisheiði` whenever it is longer than the shortest route".

Reason:

- The purpose of the curated Hellisheiði route is to add a missing sensible/normal route when Google fails to return it.
- Sometimes that curated route may be a little longer than Google's fastest option but still valuable as an alternate route.
- The bad case is when Google already found the normal Hellisheiði/Hringvegur route, and our curated route adds a slower duplicate with an accidental detour.

So the rule should be:

> Hide `CURATED_VIA_HELLISHEIDI` when an existing Google route already appears to pass through the Hellisheiði corridor and the curated route is not meaningfully better than the fastest route.

Do **not** apply this rule to `CURATED_RING_ROAD`. `Hringurinn` is intentionally allowed to be longer.

## Recommended technical approach

Add a post-fetch filter for curated `CURATED_VIA_HELLISHEIDI` routes.

Suggested logic:

1. Before curated routes are fetched, keep the already fetched Google route options as `baseRoutes`.
2. After fetching a curated route, if it has `CURATED_VIA_HELLISHEIDI`:
   - check whether any `baseRoutes` already passes near `HELLISHEIDI_VIA`;
   - check whether the curated route is slower than, or not meaningfully faster than, the fastest base route;
   - if both are true, skip the curated route.

Pseudo-code:

```ts
const HELLISHEIDI_DUPLICATE_TOLERANCE_S = 60
const HELLISHEIDI_PROXIMITY_M = 3000

function routePassesNearPoint(route: RouteOption, point: { lat: number; lon: number }, maxDistanceM: number) {
  // Prefer point-to-segment distance if cheap.
  // Point-to-point over sampled route points may be okay as a first pass if the threshold is generous.
}

function shouldSkipCuratedRoute(
  rule: CuratedRouteRule,
  curated: RouteOption,
  baseRoutes: RouteOption[]
) {
  if (!curated.labels.includes('CURATED_VIA_HELLISHEIDI')) return false
  if (curated.labels.includes('CURATED_RING_ROAD')) return false

  const fastestBase = baseRoutes[0]
  if (!fastestBase) return false

  const baseAlreadyUsesHellisheidi = baseRoutes.some(route =>
    routePassesNearPoint(route, HELLISHEIDI_VIA, HELLISHEIDI_PROXIMITY_M)
  )

  const curatedIsNotMeaningfullyBetter =
    curated.durationS >= fastestBase.durationS - HELLISHEIDI_DUPLICATE_TOLERANCE_S

  return baseAlreadyUsesHellisheidi && curatedIsNotMeaningfullyBetter
}
```

If point-to-segment distance feels too much for this patch, a simpler first version can use sampled point distance with a slightly larger threshold, for example 4-5 km. But point-to-segment is safer because sampled points may not land exactly on Hellisheiði.

## Why not just duration compare?

Do **not** globally skip every curated Hellisheiði route that is slower than the fastest route.

That would weaken the original reason for the Hellisheiði curated rule: Google sometimes returns a technically faster or odd route, while Stebbi still wants the normal Hellisheiði option available.

The important distinction is:

- if Google already has a Hellisheiði-like route: hide the slower duplicate;
- if Google does **not** have a Hellisheiði-like route: keep `Um Hellisheiði`, even if it is slightly slower, because it adds useful route choice.

## Tests to add/update

Add tests in `lib/__tests__/weather-google.test.ts`.

Recommended cases:

1. `Reykjavík/Garðabær -> Selfoss`: base route already passes near `HELLISHEIDI_VIA`, curated Hellisheiði route is slower.
   - Expected: no `CURATED_VIA_HELLISHEIDI` in results.

2. Base route does **not** pass near `HELLISHEIDI_VIA`, curated Hellisheiði route is slower.
   - Expected: `CURATED_VIA_HELLISHEIDI` remains visible.
   - This preserves the original product goal.

3. Base route passes near `HELLISHEIDI_VIA`, curated Hellisheiði route is meaningfully faster.
   - Expected: keep curated route if Claude Code chooses a tolerance-based implementation.
   - Or document if product decides to always hide duplicate Hellisheiði when base already passes near it.

4. `CURATED_RING_ROAD` remains unaffected.
   - Expected: `Hringurinn` can still be longer and still appear for long trips.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid`.

Recommended checks:

1. `Reykjavík -> Selfoss`
   - Expected: if Google fastest route already goes via normal `Hringvegur` / Hellisheiði corridor, do **not** show a slower `Um Hellisheiði` duplicate.

2. `Garðabær -> Selfoss`
   - Same expected behavior.

3. `Garðabær -> Hveragerði`
   - Expected: no slower duplicate with a detour if the fastest route is already normal Route 1 / Hellisheiði.

4. A destination where Google previously skipped Hellisheiði incorrectly, for example an Austurland route that motivated the curated rule.
   - Expected: `Um Hellisheiði` still appears when Google does not already provide that corridor.

5. `Reykjavík -> Akureyri`
   - Expected: `Hringurinn` behavior unchanged.
   - The new duplicate filter must not hide `Hringurinn`.

6. Inspect the map for every remaining `Um Hellisheiði` option:
   - no odd short detour;
   - no local slaufur;
   - route label should only appear when it truly adds something useful.

No Supabase/auth/RLS/SQL testing is needed. Do not run migrations.

## Suggested next step

Claude Code should implement this as a small follow-up patch to the route registry/refactor work.

Keep scope narrow:

- `lib/weather/google.server.ts`
- `lib/__tests__/weather-google.test.ts`
- no UI text changes expected
- no SQL
- no route label changes

## Óvissa / þarf að staðfesta

Codex is assuming the base route geometry points are sufficient to detect "already goes through Hellisheiði". If sampling makes that unreliable, use a point-to-segment distance helper over route points, or keep the threshold generous.

Stebbi's screenshot suggests Google description `Hringvegur` is not enough by itself; geometry/corridor detection is safer than relying only on description strings.
