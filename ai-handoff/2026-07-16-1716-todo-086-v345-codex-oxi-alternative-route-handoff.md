# 2026-07-16 17:16 - TODO-086 v345 - Codex handoff: curated alternative route to avoid Oxi

## Context

We now have the first version of curated road-caution logic for selected road sections, including:

- `westfjords-south-route60` as a transitional proxy based on missing Hólmavík corridor.
- `oxi-axarvegur-939` as an active approximate geometry detection for Oxi / Axarvegur 939.
- Route option caution chips in route selection.
- Curated Hólmavík route support in the Google route pipeline.

Stebbi's next product decision: when the default Google route goes over Oxi, Teskeid should not only warn. It should also try to offer a curated alternative route that goes around the fjords.

The route option can be called:

- `Til að sleppa við Öxi`

The descriptive framing can be:

- Base/default route: `Um Öxi` or current Google label plus the caution chip.
- Alternative: `Um firðina` / `Til að sleppa við Öxi`.

Avoid wording that promises safety. This is route-shaping and decision support, not an official safety guarantee.

## Product Requirement

When the originally returned Google route touches Axarvegur 939 / Oxi:

1. Keep the original route visible.
2. Show the existing caution label/text for Oxi.
3. Request an extra curated route from Google Routes with Reyðarfjörður as a `via` waypoint.
4. Verify that the curated route no longer matches the `oxi-axarvegur-939` caution.
5. If it avoids Oxi, show it as an additional route option labelled `Til að sleppa við Öxi`.
6. Reyðarfjörður is route-shaping only. It must not appear as a stop/waypoint in the UI and must not affect stop-time logic.

Suggested via point:

```ts
const OXI_ALTERNATIVE_VIA_POINT = {
  latitude: 65.0317,
  longitude: -14.2183,
}
```

Google Routes shape:

```ts
const intermediates = [
  {
    location: {
      latLng: OXI_ALTERNATIVE_VIA_POINT,
    },
    via: true,
  },
]
```

The conceptual route is:

```text
Origin
-> via fjords
-> Reyðarfjörður
-> Destination
```

## Important Guardrail

Do not trust the via waypoint alone.

After Google returns the curated route, run the same road-segment/caution matcher on the returned full polyline. If the curated route still has `oxi-axarvegur-939`, do not label it as avoiding Oxi.

If Reyðarfjörður alone is not enough in localhost testing, the next fallback can be a stricter via sequence:

```text
Fáskrúðsfjörður -> Reyðarfjörður
```

But start with the single Reyðarfjörður `via: true` waypoint.

## Suggested Implementation Shape

This should build on the existing curated-route system, not create a parallel route implementation.

Relevant files to inspect:

- `lib/weather/google.server.ts`
- `lib/weather/routeCautions.ts`
- `lib/weather/routeCautionConstants.ts`
- `components/weather/RouteSelectionStep.tsx`
- `messages/is.json`
- `messages/en.json`
- existing weather Google/route-caution tests

### Preferred approach

Add a curated rule that is triggered by actual route caution results, not by origin/destination alone.

Current curated rules are mostly matcher-based on `origin`/`destination`. For Oxi, the trigger should be:

```text
At least one base route has caution id `oxi-axarvegur-939`
```

Then fetch an extra route using Reyðarfjörður as a via point.

Implementation options:

1. Add a `triggerCautionId?: string` or similar field to `CuratedRouteRule`, and make `getCuratedRouteOptions` capable of checking base route cautions before fetching.
2. Or add a small dedicated helper after base routes are built:
   - inspect base routes for `oxi-axarvegur-939`
   - if present, call `fetchCuratedRoute` with an Oxi-avoid rule
   - validate the returned route's cautions before appending

Option 1 is cleaner if it stays simple. Option 2 is acceptable if it avoids over-generalizing the curated framework too early.

### Suggested constants

Use the same internal shape as existing curated route via points:

```ts
const REYDARFJORDUR_VIA = { lat: 65.0317, lon: -14.2183 }
```

Suggested label:

```ts
labels: ['CURATED_AVOID_OXI']
```

Then in `RouteSelectionStep.tsx` map:

```ts
CURATED_AVOID_OXI -> routeOptionAvoidOxi
```

Suggested Icelandic text:

```json
"routeOptionAvoidOxi": "Til að sleppa við Öxi"
```

English can be:

```json
"routeOptionAvoidOxi": "Avoid Öxi"
```

If a secondary description is needed, keep it short:

```text
Um firðina
```

### Duplicate / usefulness rule

Avoid adding an unnecessary duplicate.

Recommended v1 rule:

- Add the curated Oxi-avoid route only when no existing base route already avoids `oxi-axarvegur-939`.
- If Google already returns a non-Oxi route, either do not add a curated route, or consider labelling the existing non-Oxi route later. Do not solve that second part unless it is trivial.

This keeps cost and UI noise down.

### Validation rule

After `fetchCuratedRoute` returns:

```ts
const stillHasOxi = curated.cautions?.some(c => c.id === 'oxi-axarvegur-939')
```

If `stillHasOxi`, suppress the route and log a dev-only diagnostic. Do not show a route called `Til að sleppa við Öxi` if the matcher still says it includes Oxi.

## Tests To Add

Add focused tests rather than broad snapshot-style coverage.

Minimum recommended tests:

1. Base route with `oxi-axarvegur-939` triggers one extra curated route request.
2. The curated request body includes Reyðarfjörður as an intermediate with `via: true`.
3. The curated route is kept and labelled `CURATED_AVOID_OXI` when its returned geometry does not trigger `oxi-axarvegur-939`.
4. The curated route is suppressed when its returned geometry still triggers `oxi-axarvegur-939`.
5. No curated Oxi route is requested when no base route has `oxi-axarvegur-939`.
6. If a base Google route already avoids Oxi, the curated route is not duplicated, unless Claude deliberately chooses a different rule and documents why.

Existing tests that should continue to pass:

- `npm run test:run -- lib/__tests__/weather-google.test.ts`
- `npm run test:run -- lib/__tests__/weather-route-cautions.test.ts`
- `npm run type-check`

Do not run broader commands unless needed.

## UX Notes

Route cards should stay compact.

Suggested route option display:

```text
Fljótlegasta leiðin
Varasamt með eftirvagna
Hringvegur / Öxi / ...
2 klst. 41 mín.
```

```text
Til að sleppa við Öxi
Um firðina
Hringvegur / Reyðarfjörður / ...
3 klst. ...
```

Do not show Reyðarfjörður as a user destination or stop.

If both routes have warnings for other reasons, preserve those warnings. This feature only means the alternative avoids Oxi, not that it is warning-free.

## Risk / Things To Watch

- The current Oxi detection point is still approximate. If it false-positives or false-negatives, this curated route feature inherits that error.
- A false positive causes an unnecessary extra Google Routes request and extra route option.
- A false negative means the Oxi alternative will not be offered.
- The Reyðarfjörður waypoint may not always force the intended route; validation after fetch is mandatory.
- Extra Google Routes cost should be small because it only triggers after Oxi is detected and no non-Oxi base route exists.
- Do not make this origin/destination based. The trigger is the road segment/caution itself.

## Supabase / Env / Deployment

No SQL expected.

No RLS/grants/auth changes expected.

No new env vars expected.

Do not deploy. This is implementation-only until Stebbi has done localhost checks and Codex has reviewed the result.

## Localhost Checks For Stebbi

After Claude implements, Stebbi should test on localhost before any release:

1. Open `/vedrid` as public or authenticated user.
2. Try `Höfn -> Egilsstaðir`.
3. Confirm the default route that goes over Oxi shows the caution chip/text.
4. Confirm an additional route appears with the label `Til að sleppa við Öxi`.
5. Select `Til að sleppa við Öxi`.
6. Confirm the map route visibly goes around the fjords / through Reyðarfjörður area and not over Axarvegur 939.
7. Confirm Reyðarfjörður is not shown as a stop, destination, or separate time-affecting waypoint.
8. Try reverse direction `Egilsstaðir -> Höfn`.
9. Try a route that should not touch Oxi and confirm no extra `Til að sleppa við Öxi` route appears.
10. Check mobile widths around 360px, 390px, and 546px: route cards should not overflow or become too text-heavy.

If the curated route still appears to go over Oxi, do not release. Claude should then try the stricter via sequence `Fáskrúðsfjörður -> Reyðarfjörður` and repeat validation.
