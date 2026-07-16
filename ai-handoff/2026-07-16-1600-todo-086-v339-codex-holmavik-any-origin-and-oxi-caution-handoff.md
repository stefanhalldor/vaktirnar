# TODO 086 v339 - Codex handoff: Hólmavík alternate from non-capital origins + Öxi caution separation

Created: 2026-07-16 16:00  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Related handoffs:
- `2026-07-16-1541-todo-086-v336-codex-route-caution-model-handoff.md`
- `2026-07-16-1553-todo-086-v337-claude-v334-v335-v336-done-prerelease.md`
- `2026-07-16-1557-todo-086-v338-codex-v337-prerelease-review.md`

## Context

Stebbi tested:

1. `Höfn -> Ísafjörður`
   - Google returns two route options.
   - Both are correctly labeled `Varasamt með eftirvagna`.
   - But Teskeið does **not** offer a third `Gegnum Hólmavík` route.

2. `Höfn -> Egilsstaðir`
   - Stebbi is thinking about Öxi / Öxi fjallaskarð as a separate caution case.
   - Important correction from Stebbi: the two `Höfn -> Ísafjörður` route warnings are because of the same Westfjords segment, not Öxi.
   - Öxi should be considered for routes that actually pass through the Öxi corridor, for example potentially `Höfn -> Egilsstaðir`.

## Why this happens now

The current v337 behavior makes sense from the code:

- `lib/weather/routeCautions.ts` labels routes to northern Westfjords that do **not** pass near Hólmavík as `Varasamt með eftirvagna`.
- That is why both `Höfn -> Ísafjörður` Google options get the caution.
- But the curated `Gegnum Hólmavík` route in `lib/weather/google.server.ts` is currently limited to origins inside `CAPITAL_AREA_BOUNDS`.

Current rule:

```ts
{
  id: 'capital-to-westfjords-north-via-holmavik',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: { bounds: [WESTFJORDS_NORTH_BOUNDS] },
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}
```

So `Höfn -> Ísafjörður` can get the warning, but cannot get the Hólmavík alternate route. That is the mismatch.

## Product expectation

For destinations in northern/western Westfjords:

- If Google route options avoid Hólmavík and therefore get `Varasamt með eftirvagna`, Teskeið should generally try to offer an alternate via Hólmavík.
- This should not be limited to Reykjavík/capital origins.
- It should still avoid silly/duplicate alternatives.

Example:

- `Höfn -> Ísafjörður`
  - current: two Google routes, both `Varasamt með eftirvagna`
  - desired: two Google routes + third `Gegnum Hólmavík` route, if Google does not already return it

## Recommended implementation direction

### 1. Generalize the Hólmavík curated route rule

Do not simply add `Höfn` as a special case.

Instead, make the Hólmavík alternate rule apply to more origins when:

- destination is in `WESTFJORDS_NORTH_BOUNDS`
- route distance is above the existing long-route threshold
- Google base options do not already pass near Hólmavík
- origin is not already in a place where going through Hólmavík would be obviously nonsensical

Possible implementation options:

#### Option A: Make `origin` optional on `CuratedRouteRule`

Allow a rule to say:

```ts
origin: undefined
destination: { bounds: [WESTFJORDS_NORTH_BOUNDS] }
```

Then add explicit suppressions:

- do not add if base route already passes Hólmavík
- do not add if origin is also inside the same northern Westfjords area
- maybe do not add if origin is very close to destination

#### Option B: Add `excludedOrigin` / `originExclusionBounds`

Keep the matcher explicit:

```ts
origin: { bounds: [ICELAND_BOUNDS] }
excludedOrigin: { bounds: [WESTFJORDS_NORTH_BOUNDS] }
destination: { bounds: [WESTFJORDS_NORTH_BOUNDS] }
```

Codex leans toward Option B if it stays small, because it documents intent: "any Icelandic origin except already-inside-this-Westfjords-area."

### 2. Keep duplicate suppression

The existing `shouldSkipCuratedHolmavik` duplicate filter is still important:

- if Google already gives a route via Hólmavík, do not add another one
- if the curated route geometry is identical to an existing route, geometry fingerprint dedupe should skip it

This makes the broader origin rule safer.

### 3. Do not call it "suðurleið" generically

Stebbi described "suðurleiðin en í gegnum Hólmavík" for the observed Höfn route, but the reusable label should probably stay:

- `Gegnum Hólmavík`

That is route-agnostic and works from Reykjavík, Höfn, Akureyri, etc.

### 4. Separate Westfjords caution from Öxi caution internally

Do not reuse one internal caution ID for all trailer-risk roads.

Keep the compact user-facing label the same if desired:

- `Varasamt með eftirvagna`

But the internal IDs/details should differ:

- `westfjords-north-trailer-no-holmavik`
- `oxi-trailer-caution` or similar

This matters because:

- `Höfn -> Ísafjörður` warnings are currently Westfjords/Route 60-ish caution.
- `Höfn -> Egilsstaðir` should only get Öxi caution if the route actually passes through/near Öxi.
- Later Vegagerðin data may attach different live road states to each caution.

### 5. Add Öxi only after visual geometry verification

Do not tag all `Höfn -> Egilsstaðir` routes as Öxi.

The screenshot appears to show a route described as `Hringvegur/Leið 1`. If the actual route is coastal Route 1 and not Road 939/Öxi, it should **not** get an Öxi caution.

The rule should be geometry-based:

- if route passes near verified Öxi corridor points -> `routeCautionTrailer`
- if route avoids Öxi and stays on coastal Route 1 -> no Öxi caution

This is exactly why the caution model should use `presentViaNearPoints` or corridor matching, not origin/destination alone.

## Suggested Claude Code plan

1. Read this handoff and v338 first.
2. Update curated route applicability so `Gegnum Hólmavík` can be offered from non-capital origins like Höfn.
3. Add guard(s) to avoid absurd Hólmavík alternates:
   - suppress if origin is already inside northern/western Westfjords
   - suppress if base Google route already passes near Hólmavík
   - keep min distance threshold
4. Keep the route option label `Gegnum Hólmavík`.
5. Keep Westfjords caution label on routes that avoid Hólmavík.
6. Add or plan Öxi as a separate caution ID:
   - only implement if corridor points are visually verified
   - otherwise leave a precise TODO and tests pending
7. Add tests.
8. Run:
   - `npm run type-check`
   - relevant weather tests
9. Create Claude handoff. Do not commit, push, deploy, or run external changes.

## Tests to add/update

### Hólmavík alternate route

1. `Höfn -> Ísafjörður`
   - base Google routes avoid Hólmavík
   - expect one `CURATED_VIA_HOLMAVIK` option to be added
   - expect base Google routes to keep `westfjords-north-trailer-no-holmavik` caution
   - expect curated Hólmavík route not to get that caution

2. `Reykjavík -> Ísafjörður`
   - existing behavior still works

3. `Ísafjörður -> Bolungarvík` or another local Westfjords short route
   - should not add a useless `Gegnum Hólmavík` route

4. Base route already via Hólmavík
   - curated duplicate should be suppressed

### Öxi caution

Only if implementing Öxi now:

1. Route fixture that passes near verified Öxi / Road 939 corridor
   - expect `oxi-trailer-caution`

2. `Höfn -> Egilsstaðir` fixture that stays on coastal Route 1
   - expect no Öxi caution

3. Ensure Öxi caution and Westfjords caution can coexist in the model without sharing IDs.

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Höfn -> Ísafjörður

1. Origin: `Höfn`
2. Destination: `Ísafjörður`
3. Expected:
   - Google routes still appear.
   - Google routes that avoid Hólmavík show `Varasamt með eftirvagna`.
   - A `Gegnum Hólmavík` route is also offered if Google did not already return one.
   - `Gegnum Hólmavík` should not have the Westfjords no-Hólmavík caution.
   - Map should visually show the Hólmavík route going through Hólmavík/Route 61.

### Reykjavík -> Ísafjörður

1. Confirm existing Hólmavík alternate still appears.
2. Confirm the fastest/problematic route warning still makes sense.

### Höfn -> Egilsstaðir

1. Inspect whether Google route visually uses Öxi/Road 939 or coastal Route 1.
2. Expected if route uses Öxi:
   - route shows `Varasamt með eftirvagna`
   - internally/logically this is `oxi-trailer-caution`, not Westfjords caution
3. Expected if route does not use Öxi:
   - no Öxi warning

### Mobile route selection

1. Check route option cards at 360 px, 390 px, 460 px.
2. Warning badge should not push duration offscreen.
3. Three route options should remain scannable.

## Open questions

1. Should `Gegnum Hólmavík` be offered for any Iceland origin to northern Westfjords, or only for routes above a stronger distance threshold?

   Codex recommendation: any Iceland origin outside the same northern Westfjords area, with duplicate suppression and distance threshold.

2. Should route caution detail text be visible in route selection now?

   Codex recommendation: no, keep only compact label for now. Details can come in a later route-info drawer or tooltip.

3. Should Öxi be implemented immediately?

   Codex recommendation: only if Claude can visually verify route geometry and add tests. Otherwise leave it as a clearly scoped next handoff.

## Codex recommendation

This is a good catch. The warning and alternate-route systems are currently slightly out of sync:

- warning system says: "this route avoids Hólmavík and is risky for trailers"
- alternate-route system only knows how to add Hólmavík from capital origins

Fix the Hólmavík alternate rule so it can apply from Höfn and other sensible origins, while keeping Öxi as a separate geometry-based caution. This preserves the future-proof model and avoids turning safety annotations into hardcoded destination pairs.
