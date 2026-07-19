# 2026-07-17 06:44 — TODO-086 v386 — Route control points and Teskeið road intelligence layer

Created: 2026-07-17 06:44  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Context: follow-up after v384/v385 B0.4 hardening. Stebbi observed that a station can still barely qualify at ~0.9 km because Google's route polyline visibly cuts past the actual road around Vík/Skeiðflötur.

## Product Read

Stebbi's instinct is right: high-quality Google polyline + RDP is a better input, but it is still not the same thing as the actual Icelandic road. For fixed providers like Veðurstofan and Vegagerðin, a simplified/chorded route line can create both false positives and false negatives near fjords, bridges, coastal curves, mountain roads and road junctions.

The next smarter step is not to increase the threshold back to 2 km. The next step is to introduce a small, curated **route control point / road intelligence layer** that augments the provider-matching geometry in known problematic road sections.

This should only affect fixed-provider matching. It should not change Google route display, Google route duration/distance, or the existing met.no/Yr sampling flow.

## Findings / Risks To Guard Against

1. **Medium: blindly adding anchors can create false positives**

   If we simply inject control points whenever a route is broadly near Vík or the Westfjords, the provider-matching line can be pulled onto a road the user is not actually driving. Control points must be activated only when the selected Google route is already determined to be using that corridor.

2. **Medium: this should not become a second routing engine immediately**

   We can gradually become much smarter about Icelandic roads, but v1 should not attempt to replace Google routing. Let Google continue to choose route alternatives, durations and distances. Teskeið's own layer should correct/augment **matching geometry and product warnings** for known Iceland-specific road facts.

3. **Medium: licensing/data-source decisions matter before importing road graphs**

   A future "own Google Maps for Icelandic road intelligence" direction is viable, but importing OSM, Vegagerðin or other road graph data needs an explicit license/compliance pass. Start with tiny hand-authored control point sets in code. Do not bulk import road data yet.

4. **Low: provider matching and route caution logic should share the same road knowledge where possible**

   We already have caution concepts like Öxi and Westfjords/Hólmavík. The control-point registry should be compatible with that world instead of becoming a parallel hardcoded mess.

## Proposed Implementation: B0.6 Route Control Points

### Goal

Create a small reusable registry of known Icelandic road sections where Google polyline shape is too sparse or can chord across curves/fjords. Use it to augment `providerMatchingPoints` before matching fixed provider stations.

### Scope

In scope:

- route-control registry in `lib/weather/`
- augmentation helper for fixed-provider matching geometry
- one first corridor: Vík / Skeiðflötur / Vatnsskarðshólar area on Route 1
- tests proving anchors are only applied when route actually touches the corridor
- route-selection and final-result provider matching use the same augmented geometry

Out of scope:

- no new SQL
- no route cache yet
- no overview map yet
- no Vegagerðin implementation yet
- no bulk road graph import
- no changes to met.no/Yr route sampling
- no change to Google route display/distance/duration

## Suggested Data Model

Create something like `lib/weather/routeControlPoints.ts`:

```ts
export type RouteControlSection = {
  id: string
  name: string
  reason: string

  /**
   * The route must pass near these gate points before anchors are applied.
   * This prevents anchors from affecting unrelated nearby routes.
   */
  gates: Array<{ lat: number; lon: number; radiusM: number }>

  /**
   * Ordered points that approximate the actual road shape for provider matching.
   * These are not waypoints, not stops, and not shown as route geometry.
   */
  anchors: Array<{ lat: number; lon: number }>

  /**
   * Optional IDs tying this section to route warnings/curated route rules later.
   */
  cautionIds?: string[]
}
```

Then:

```ts
export function augmentProviderMatchingPoints(input: {
  routePoints: Array<{ lat: number; lon: number }>
  sections?: readonly RouteControlSection[]
}): Array<{ lat: number; lon: number }>
```

Behavior:

1. Start with `providerMatchingPoints` from Google/RDP.
2. For each `RouteControlSection`, check whether the route passes near the required gates.
3. If yes, insert the section's ordered anchors into the provider-matching geometry in the right approximate route position.
4. Re-run the same cap protection (`<= 1000`) after augmentation.
5. Return augmented points only for provider matching.

## First Corridor Candidate

Name: `ring-road-vik-skeidflotur`  
Purpose: stop provider matching from relying on a Google polyline chord around Vík/Skeiðflötur/Vatnsskarðshólar.

Claude Code should not guess the final coordinates from memory. Use the current Google route geometry and Stebbi's screenshot to add a handful of anchors along the actual Route 1 curve/road section, then verify visually on localhost.

Suggested principle:

- 2 gate points: one west of Vík/Skeiðflötur corridor, one east of it.
- 3-8 anchor points along the real road curve.
- Keep it small and obvious.

## Tests To Add

1. **Does not alter unrelated route**

   Route far away from the corridor returns unchanged points.

2. **Adds anchors only when gates match**

   Synthetic route passing through both gates gets anchors inserted.

3. **Still capped at <=1000**

   If route is already near cap, augmentation preserves endpoints and never returns >1000.

4. **Provider station effect**

   Synthetic station near the real road/anchor is included; synthetic station near the old chord but away from anchors is not included, when using 1 km threshold.

## Integration Point

Preferred sequence in `lib/weather/google.server.ts`:

1. Google returns full/high-quality `allPoints`.
2. `providerMatchingPointsFrom(allPoints)` runs RDP + cap.
3. `augmentProviderMatchingPoints(...)` adds eligible route control anchors.
4. final cap is enforced.
5. returned route option/geometry includes `providerMatchingPoints`.

This keeps the route-selection endpoint and final travel endpoint unchanged because both already consume `providerMatchingPoints ?? points`.

## Long-Term Direction: Teskeið Road Intelligence Layer

This is the first small step toward Stebbi's "own Google Maps for Iceland" idea, but scoped safely.

Over time, this layer can include:

- known difficult road sections: Öxi, south Westfjords road, mountain passes, exposed wind corridors
- curated alternatives: "Gegnum Hólmavík", "Til að sleppa við Öxi"
- fixed-provider matching geometry
- route-cache corridor aggregation
- route-interest heatmap
- Vegagerðin live points and road state
- later: licensed road graph / OSM-derived road corridor model if compliance allows

Important: the route-control registry should become the shared foundation for all of this, not just a one-off Veðurstofan hack.

## Updated Phase Placement

Recommended order after v384/v385:

1. **B0.4 validation** — Stebbi localhost tests current 1 km + dense provider geometry.
2. **B0.6 route control points** — add the small control-point system and first Vík/Skeiðflötur corridor.
3. **B0.5 provider preview shell cleanup** — can happen before or after B0.6, but should happen before Vegagerðin UI.
4. **B1 localhost validation** — route-selection vs final-result consistency.
5. **H-track route cache / route interest heatmap** — preserved from v382/v383.
6. **Vegagerðin provider** — uses the same fixed-provider matching model.
7. **Overview map / Iceland status surface** — uses route cache, provider layers and road intelligence.

If Stebbi wants the fastest fix for the screenshot issue, do B0.6 before B0.5. If Stebbi wants architecture cleanliness first, do B0.5 then B0.6. My recommendation: **B0.6 first**, because it directly validates the road-intelligence model before Vegagerðin.

## Localhost Checks For Stebbi

After B0.6:

1. Open `http://localhost:3004/vedrid`.
2. Select Reykjavík -> Egilsstaðir.
3. On the route-selection map near Vík/Skeiðflötur, confirm Veðurstofan stations are included/excluded based on the actual road corridor, not the visible Google chord.
4. Click `Vatnsskarðshólar` if visible and confirm the distance from road now feels plausible.
5. Continue to final result and confirm the same station logic applies there.
6. Test a nearby but different route if possible to confirm the corridor anchors do not pull in unrelated stations.
7. Re-test Reykjavík-area short route to confirm no new far-off stations appear.
8. Confirm met.no/Yr summary/worst/selected behavior is unchanged.

Do not test SQL, Supabase, migrations, Vercel or production for this phase.

## Copy/Paste Handoff For Claude Code

```md
Workflow

Please review and, if there are no blocking questions, implement the scoped B0.6 route-control-points phase from:

`ai-handoff/2026-07-17-0644-todo-086-v386-codex-route-control-points-road-intelligence.md`

Key intent:
- Fix the provider-matching geometry issue where Google's high-quality route polyline still chords past actual roads, e.g. Vík/Skeiðflötur/Vatnsskarðshólar.
- Do not widen the provider threshold as the main fix.
- Do not change met.no/Yr sampling, route display, Google duration/distance, SQL, route cache, overview map, Vegagerðin, env, commit, push or deploy.
- Create a reusable route-control/road-intelligence foundation that later helps Veðurstofan, Vegagerðin, route warnings and overview surfaces.

Please be critical first. If the plan is too broad, if the first corridor cannot be safely detected, or if you need coordinate/product confirmation from Stebbi, stop and handoff questions instead of implementing.

After implementation, create a handoff with tests run and exact localhost checks.
```
*** End Patch
 
