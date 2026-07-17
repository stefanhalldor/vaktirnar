# 2026-07-17 08:37 — Codex handoff: Vík-area Veðurstofan station mismatch

TODO: 086 — Veðrið / Veðurstofan provider-station route matching

Context from Stebbi after production release:

- Focus area: road section around Vík.
- `Höfn → Þorlákshöfn` shows only `Mýrdalssandur`.
- `Reykjavík → Egilsstaðir` shows only `Reynisfjall`.
- `Vík → Hella` shows `Reynisfjall` and `Vatnsskarðshólar`.
- All these routes pass the same broad Vík/Mýrdalur road section and should consistently show the same relevant Veðurstofan stations around that section: at least `Vatnsskarðshólar`, `Reynisfjall`, and `Mýrdalssandur`.

## Findings

### High: current Vík route-control section is not active in production

`lib/weather/routeControlPoints.ts:84` has:

```ts
verified: false
```

and `augmentProviderMatchingPoints` skips unverified sections in production at `lib/weather/routeControlPoints.ts:138`.

That means after release, production is still relying mostly on Google's route polyline/RDP geometry for provider-station matching. Long routes and short routes can get different Google line geometry around Vík, so different stations fall inside/outside the 1 km cutoff.

This explains why Stebbi sees route-dependent station selection around the same road section.

### High: do not just flip `verified: true` on the current section

The current section is also geographically incomplete for the product expectation.

Current anchors in `lib/weather/routeControlPoints.ts:93` to `lib/weather/routeControlPoints.ts:101` start around Vík and continue east:

```ts
{ lat: 63.419, lon: -19.005 } // Vík town area
...
{ lat: 63.448, lon: -18.580 } // east of Vatnsskarðshólar (comment is misleading)
```

But `Vatnsskarðshólar` is west of Vík:

- `Vatnsskarðshólar` station: `63.424, -19.1837`
- `Reynisfjall` station: `63.4521, -19.0378`
- `Mýrdalssandur` station: `63.4661, -18.6044`

Quick distance check against the current anchor polyline:

- `Vatnsskarðshólar`: about `8.9 km` from current anchor polyline
- `Reynisfjall`: about `4.0 km` from current anchor polyline
- `Mýrdalssandur`: about `2.0 km` from current anchor polyline

The product cutoff is `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000` in `lib/weather/providerRouteMatching.ts:20`.

So setting the current section to `verified: true` would not reliably solve the issue. The Vík corridor model itself must be corrected first.

### Medium: station matching is otherwise on the right shared path

Good news: the route-selection layer and final travel endpoint both use the shared provider matching module:

- Route-selection endpoint uses `matchProviderPointsToRoute` in `app/api/teskeid/weather/travel/provider-stations/route.ts:77` to `app/api/teskeid/weather/travel/provider-stations/route.ts:85`.
- Final travel endpoint uses the same function in `app/api/teskeid/weather/travel/route.ts:262` to `app/api/teskeid/weather/travel/route.ts:271`.
- Both use `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`.
- Route-selection sends `selectedRoute.providerMatchingPoints ?? selectedRoute.points` in `app/auth-mvp/vedrid/FerdalagidClient.tsx:466`.

So this should be fixed in the shared provider route geometry/control-point layer, not separately in UI components.

## Recommended Fix

### 1. Redefine the Vík/Mýrdalur route-control section

Do not keep the current section as-is.

Either replace `ring-road-vik-skeidflotur` or split it into clearer adjacent sections, for example:

- `ring-road-vik-west-vatnsskardsholar-reynisfjall`
- `ring-road-vik-east-myrdalssandur`

The important part is not the exact names, but the model:

- gates should detect that the route actually passes the Vík/Mýrdalur corridor;
- anchors must follow the actual Route 1 road path across the whole relevant section;
- anchors must be close enough to the road that all three target stations project within the 1 km product threshold when the route passes that road section;
- anchors should work both directions.

Concrete product acceptance for this phase:

- `Vatnsskarðshólar`, `Reynisfjall`, and `Mýrdalssandur` should all match on:
  - `Reykjavík → Egilsstaðir`
  - `Höfn → Þorlákshöfn`
  - `Vík → Hella`
- They should be ordered by `distanceFromOriginM`.
- They should not appear on unrelated routes that do not pass the Vík/Mýrdalur section.

### 2. Add regression tests before marking verified

Add tests at the shared geometry layer. Suggested minimum:

1. A route-control test with a representative sparse chord through the Vík area that would previously miss the target stations.
2. Run `augmentProviderMatchingPoints(...)`.
3. Run `matchProviderPointsToRoute(...)` against the three real registry stations.
4. Assert all three are included within `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`.
5. Assert reverse direction gives same station set in reverse/route order.
6. Assert an unrelated route does not inject the section.

Tests should not depend on live Google calls.

### 3. Only then set the corrected section `verified: true`

After Stebbi visually confirms on localhost, set the corrected Vík section(s) to `verified: true`.

That is the step that makes production behavior match localhost behavior.

### 4. Keep met.no/Yr untouched

This fix must stay in provider-station matching only:

- no change to `sampleRouteWeatherPoints`;
- no change to MET/Yr route sampling;
- no change to met.no forecast point count or scoring.

The goal is stable fixed-provider station matching for Veðurstofan now and Vegagerðin later.

## Implementation Guardrails for Claude Code

- Do not solve this with a global distance increase above 1 km.
- Do not special-case the three station IDs in the UI.
- Do not change card rendering.
- Do not add duplicate station filtering in UI as a workaround.
- Do not change Supabase, SQL, RLS, cron, or fetch/cache behavior.
- Keep the shared provider route matching path reusable for Vegagerðin.
- If adding route-control sections, keep them explicit and visually verifiable.

## Suggested Commands

After implementation:

```powershell
npm run type-check
```

```powershell
npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/routeControlPoints.test.ts lib/__tests__/weather-provider-stations.test.ts lib/__tests__/weather-travel-api.test.ts
```

If tests around Google route options are touched:

```powershell
npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts
```

## Localhost checks for Stebbi

Use the route-selection step in `/vedrid` with Veðurstofan layer visible.

1. `Reykjavík → Egilsstaðir`
   - Expected: around Vík/Mýrdalur, station layer includes `Vatnsskarðshólar`, `Reynisfjall`, and `Mýrdalssandur`.
   - Expected: clicking each marker opens the normal Veðurstofan station preview card.

2. `Höfn → Þorlákshöfn`
   - Expected: the same three stations are available around the Vík/Mýrdalur section, not only `Mýrdalssandur`.

3. `Vík → Hella`
   - Expected: the same three stations are available where appropriate for the driven corridor, not just a subset caused by short-route geometry.

4. Reverse-direction sanity check, for example `Egilsstaðir → Reykjavík`.
   - Expected: same station set, ordered naturally by route direction.

5. False-positive check:
   - Use a route that does not pass the Vík/Mýrdalur corridor, e.g. `Selfoss → Þorlákshöfn`.
   - Expected: no Vík/Mýrdalur control points and no Vík-area stations.

6. Final `/vedrid` result step:
   - Pick a route that passes Vík/Mýrdalur and calculate the travel weather.
   - Expected: the final Veðurstofan layer uses the same station set/order as the route-selection preview.

## Open Question

Should this Vík/Mýrdalur control be one long verified section or split into two smaller verified sections?

Codex preference: split if it makes visual verification and false-positive testing clearer. The product outcome matters more than the internal section count.

