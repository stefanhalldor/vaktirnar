# 2026-07-17 06:47 — TODO-086 v387 — Use provider evidence to catch Öxi route cautions

Created: 2026-07-17 06:47  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Context: Stebbi found a route from Höfn toward Egilsstaðir that clearly passes Öxi, and the route-selection layer shows the Veðurstofan station `Öxi` at `0.0 km frá veginum`, but the route option is not marked as caution and no alternate "Til að sleppa við Öxi" is offered.

## Short Answer

Yes, we should use the Veðurstofan station evidence to deepen the Öxi detection.

But the safest way is **not** to depend on live forecast fetches or provider-layer UI state. The route caution and curated alternate need to happen while Google route options are being built, before the user chooses a route and before the Veðurstofan preview layer fetch runs.

So the right model is:

- Use fixed provider/evidence points, initially the known Veðurstofan station `Öxi` (`stationId: 35963`, `lat: 64.8257`, `lon: -14.6573`), as part of route caution detection.
- Keep it provider-neutral so later Vegagerðin live points can feed the same model.
- Let that evidence trigger the existing `oxi-axarvegur-939` caution.
- Let the existing curated-route rule `CURATED_AVOID_OXI` then request the Reyðarfjörður via route.

## Findings

1. **Medium: current Öxi caution point is likely too far east from the actual evidence point**

   Current Öxi caution in `lib/weather/routeCautions.ts:163-174` uses:

   ```ts
   { lat: 64.860, lon: -14.365, radiusM: 10_000 }
   ```

   The Veðurstofan registry has the actual `Öxi` station at `lib/weather/providers/vedurstofanStationsRegistry.ts:3281-3295`:

   ```ts
   stationId: "35963"
   name: "Öxi"
   lat: 64.8257
   lon: -14.6573
   ```

   The screenshot shows that station is matched at `0.0 km frá veginum`, but the caution did not trigger. That strongly suggests the caution corridor point is misplaced for this route geometry, even with a 10 km radius.

2. **Medium: route caution cannot rely on the route-selection provider-stations endpoint**

   `components/weather/RouteSelectionStep` fetches provider stations after route options are already returned. But `lib/weather/google.server.ts:514-531` only adds the curated Öxi-avoid route when a base route already has `triggerCautionId: 'oxi-axarvegur-939'`.

   Therefore, if we wait until the UI has matched the Öxi station, it is too late to ask Google for the alternate route in the same route-options result.

3. **Medium: do not make safety warnings depend on Veðurstofan provider access**

   Some users may not have Veðurstofan provider layer enabled, but route safety/caution labels should still be shown if the base weather product is available. The evidence point should be a server-side road-intelligence datum, not a feature-flagged forecast datum.

## Proposed Implementation: B0.7 Provider Evidence For Route Cautions

### Goal

If a route passes near fixed road-evidence points like Veðurstofan's `Öxi` station, route caution detection should be able to trigger `oxi-axarvegur-939`, which in turn triggers the existing alternate curated route "Til að sleppa við Öxi".

### In Scope

- Add a small provider-neutral road evidence registry.
- Add Öxi station as the first evidence point.
- Integrate evidence matching into route caution evaluation.
- Keep existing caution IDs and curated route flow.
- Add tests for Höfn -> Egilsstaðir / Öxi route detection and alternate route trigger if practical.

### Out Of Scope

- No SQL.
- No live Veðurstofan forecast fetch dependency.
- No provider-layer UI dependency.
- No feature flag dependency.
- No Vegagerðin implementation yet.
- No route cache or heatmap.
- No Google route display/duration/distance changes.

## Suggested Design

### 1. Add a route evidence registry

Example file:

`lib/weather/routeEvidencePoints.ts`

```ts
export type RouteEvidencePoint = {
  id: string
  name: string
  provider: 'vedurstofan' | 'vegagerdin' | 'manual'
  providerId?: string
  lat: number
  lon: number
  radiusM: number
  cautionIds: string[]
  note?: string
}

export const ROUTE_EVIDENCE_POINTS: readonly RouteEvidencePoint[] = [
  {
    id: 'vedurstofan-oxi-35963',
    name: 'Öxi',
    provider: 'vedurstofan',
    providerId: '35963',
    lat: 64.8257,
    lon: -14.6573,
    radiusM: 1_500, // start tighter than old 10 km corridor, tune on localhost
    cautionIds: ['oxi-axarvegur-939'],
    note: 'Veðurstofan station Öxi; route passing near this station is strong evidence of Road 939 / Öxi.',
  },
]
```

Why separate registry instead of importing the full Veðurstofan registry into caution logic?

- It keeps route caution code independent from forecast/provider internals.
- It avoids feature flag/access confusion.
- It gives us a place to add future Vegagerðin evidence points without tying route caution to forecast fetches.

### 2. Extend caution matching with evidence points

Option A, simplest:

- In `matchRouteCautions(points, from, to)`, after normal geometry detection, evaluate evidence points.
- If route passes within `radiusM` of an evidence point, add any missing caution results for its `cautionIds`.

Option B, cleaner:

- Add `evidencePointIds` / `evidenceCautionIds` support to the `SENSITIVE_ROAD_SEGMENTS` model.
- Each segment can define both corridor geometry and evidence points.
- `oxi-axarvegur-939` can use both:
  - existing corridor point(s)
  - evidence point `vedurstofan-oxi-35963`

I prefer **Option B** if it stays small, because it keeps each road segment's detection definition in one place.

### 3. Keep existing curated route flow

Do not create a new alternate-route mechanism.

Current flow is already correct:

- `matchRouteCautions(...)` returns `oxi-axarvegur-939`.
- `CURATED_ROUTE_RULES` includes rule `avoid-oxi-via-reydarfjordur`.
- `getRouteOptions` triggers curated route when any base route has that caution.
- Curated route is suppressed if it still carries the same caution.

The missing piece is simply that `oxi-axarvegur-939` did not fire.

## Important Guardrails

1. **Use evidence points as detection support, not weather risk scoring**

   Passing Öxi station means "this route goes over/near Öxi"; it does not mean the weather is dangerous right now. The label should remain route/road caution: `Varasamt með eftirvagna`.

2. **Keep public behavior independent of Veðurstofan layer visibility**

   Even if Veðurstofan forecast layer is hidden/flagged, the route option should still warn about Öxi if the route passes the evidence point.

3. **Avoid over-triggering coastal Route 1**

   The old point had a 10 km radius because it was approximate. A real Öxi station evidence point can use a tighter radius, probably 1-2 km first, then tune after visual tests.

4. **Do not use the provider-stations endpoint result to mutate route options client-side**

   That would be too late to generate the alternate route and would create inconsistent UI. Detection must happen server-side while route options are built.

## Tests To Add

1. Unit test for evidence point matching:

   - route passes near `vedurstofan-oxi-35963`
   - `matchRouteCautions` returns `oxi-axarvegur-939`

2. Negative test:

   - route passes the coastal fjord road but not near the Öxi evidence point
   - no `oxi-axarvegur-939`

3. Curated route trigger test:

   - base route gets `oxi-axarvegur-939`
   - `getRouteOptions` attempts/includes `CURATED_AVOID_OXI`

4. Validation/suppression test:

   - curated avoid route still has `oxi-axarvegur-939`
   - it is suppressed, as today.

## Localhost Checks For Stebbi

After implementation:

1. Open `http://localhost:3004/vedrid`.
2. Test `Höfn -> Egilsstaðir`.
3. Confirm route option over Öxi shows:
   - route caution chip `Varasamt með eftirvagna`
   - explanatory Öxi text
4. Confirm an alternate route appears:
   - label `Til að sleppa við Öxi`
   - route via Reyðarfjörður / around the fjords
5. Confirm clicking the route still shows the Öxi station on the provider layer when Veðurstofan is visible.
6. Test reverse direction `Egilsstaðir -> Höfn`.
7. Test a nearby coastal/east-fjord route that should **not** go over Öxi and confirm it does not get false-positive warning.
8. Confirm public users see route caution/alternate even if Veðurstofan forecast layer is not visible.

Do not test SQL, Supabase, migrations, env, Vercel, push or production from this handoff.

## Suggested Copy/Paste For Claude Code

```md
Workflow

Please review and, if no blocking concerns, implement the scoped B0.7 provider-evidence route caution phase from:

`ai-handoff/2026-07-17-0647-todo-086-v387-codex-oxi-provider-evidence-caution-handoff.md`

Intent:
- The route Höfn -> Egilsstaðir currently passes Öxi, and the Veðurstofan station Öxi is matched at 0.0 km from the route, but the route is not flagged as `Varasamt með eftirvagna` and no `Til að sleppa við Öxi` alternate is offered.
- Use the fixed location of the Öxi Veðurstofan station as route-evidence for `oxi-axarvegur-939`.
- Do this server-side in route caution / route option generation, not in the UI after provider-stations fetch.
- Do not depend on live forecast fetches or provider feature access.
- Preserve existing curated route mechanism (`CURATED_AVOID_OXI` via Reyðarfjörður).
- No SQL, env, commit, push, deploy, route cache, heatmap, overview map, or Vegagerðin implementation.

Please be critical first. If you think this should be combined with route-control-points v386 or implemented differently, stop and handoff the decision instead of implementing.

After implementation, create a handoff with files changed, tests run, and localhost checks.
```
*** End Patch
 
