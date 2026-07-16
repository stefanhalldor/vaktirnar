# TODO 086 v336 - Codex handoff: Route caution model for trailers

Created: 2026-07-16 15:41  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Related handoffs:
- `2026-07-16-1413-todo-086-v329-codex-holmavik-route-and-route-pulse-handoff.md`
- `2026-07-16-1436-todo-086-v330-claude-v328-v329-done-prerelease.md`
- `2026-07-16-1536-todo-086-v335-codex-route-pulse-collapsed-drawer-handoff.md`

## Context

Stebbi tested the new Hólmavík alternate route for Reykjavík -> Ísafjörður. The route option is now present, and the product direction is clearer:

- Google's fastest/default route to Ísafjörður can use a route that is risky for cars with trailers.
- Teskeið should not only add the safer alternate route; it should also visibly label known risky route options.
- This should become a reusable model for other parts of Iceland, not a one-off Ísafjörður/Hólmavík hack.
- Example future caution area: Öxi / Öxi fjallaskarð.

Stebbi's desired route-selection label:

> Varasamt með eftirvagna

## Files inspected

- `components/weather/RouteSelectionStep.tsx`
- `lib/weather/google.server.ts`
- `messages/is.json`
- `messages/en.json`

## Current implementation shape

`lib/weather/google.server.ts` already has a curated route registry:

- `CURATED_ROUTE_RULES`
- `CuratedRouteRule`
- `CURATED_VIA_HOLMAVIK`
- `HOLMAVIK_VIA`
- duplicate filters such as `shouldSkipCuratedHolmavik`

`components/weather/RouteSelectionStep.tsx` currently renders route labels from `RouteOption.labels`:

- `CURATED_RING_ROAD` -> `Hringurinn`
- `CURATED_VIA_HELLISHEIDI` -> `Um Hellisheiði`
- `CURATED_VIA_HOLMAVIK` -> `Gegnum Hólmavík`
- otherwise fastest/default/other

Route options currently show:

- title
- optional Google description
- distance
- duration

They do not yet show route warnings/cautions.

## Product direction

Build a small, reusable "route caution" model.

This should answer:

1. Does this route option pass through a known caution segment?
2. If yes, what compact label should be shown in route selection?
3. Is there an alternate route we should show next to it?
4. Later: can Vegagerðin/current road data strengthen or override this warning?

Do not build this as a one-off `if Ísafjörður then show label`.

## Recommended model

### Phase 1: code-level curated caution registry

Create a small registry in `lib/weather`, for example:

- `lib/weather/routeCautions.ts`

Suggested shape:

```ts
export type RouteCautionSeverity = 'info' | 'caution' | 'warning'

export type RouteCautionVehicle = 'trailer' | 'caravan' | 'camper' | 'all'

export type RouteCaution = {
  id: string
  labelKey: string
  detailKey?: string
  severity: RouteCautionSeverity
  appliesTo: RouteCautionVehicle[]
  match: {
    nearPoints?: Array<{ lat: number; lon: number; radiusM: number }>
    labels?: string[]
  }
}
```

Codex recommendation:

- Prefer a typed `cautions?: RouteCautionResult[]` field on `RouteOption`.
- Avoid overloading `RouteOption.labels` with user-facing warnings. `labels` currently mixes Google route labels and curated route identity; warnings are a separate concern.

Potential `RouteOption` extension:

```ts
type RouteOption = {
  ...
  labels: string[]
  cautions?: Array<{
    id: string
    severity: 'info' | 'caution' | 'warning'
    labelKey: string
    detailKey?: string
    appliesTo: Array<'trailer' | 'caravan' | 'camper' | 'all'>
  }>
}
```

### Phase 1 caution examples

1. **Fast/default Westfjords route that does not go via Hólmavík**

   If destination is northern/western Westfjords and a route does not pass near `HOLMAVIK_VIA`, mark it:

   - label: `Varasamt með eftirvagna`
   - appliesTo: `trailer`, `caravan`, `camper`
   - severity: `caution`

   This makes the UI explain why `Gegnum Hólmavík` exists.

2. **Öxi / Öxi fjallaskarð**

   Add a caution segment for routes passing near the Öxi road corridor.

   Important: do not rely only on Google route `description`, because it can be localized, inconsistent, or absent. Use route geometry proximity to curated points/corridor. The exact points need visual verification on localhost before release.

   Label:

   - `Varasamt með eftirvagna`

   Detail copy can later mention that users should check Vegagerðin/current conditions.

## UI recommendation

In `RouteSelectionStep.tsx`, show caution labels inside route option cards.

For each route option:

- keep route title as-is:
  - `Fljótlegasta leiðin`
  - `Gegnum Hólmavík`
  - `Hringurinn`
- below or beside the title, show a compact amber badge:
  - `Varasamt með eftirvagna`
- include a small alert icon only if it fits cleanly, e.g. Lucide `AlertTriangle`
- do not make the warning dominate the card more than the route name and duration
- ensure duration remains aligned and readable

Suggested visual:

```tsx
<div className="flex flex-col gap-1 min-w-0">
  <span className="text-sm font-medium truncate">Fljótlegasta leiðin</span>
  {ro.cautions?.map(caution => (
    <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <AlertTriangle size={11} />
      {tf(caution.labelKey)}
    </span>
  ))}
  ...
</div>
```

Keep this mobile-first:

- no horizontal overflow
- badge wraps gracefully if needed
- route duration should not be pushed offscreen
- selected card should still be obvious

## Translation keys

Add keys to both `messages/is.json` and `messages/en.json`.

Suggested Icelandic:

```json
"routeCautionTrailer": "Varasamt með eftirvagna",
"routeCautionTrailerDetail": "Þessi leið getur verið varasöm fyrir bíla með eftirvagna. Skoðaðu aðra leið og athugaðu aðstæður hjá Vegagerðinni."
```

Suggested English:

```json
"routeCautionTrailer": "Caution with trailers",
"routeCautionTrailerDetail": "This route can be risky for vehicles with trailers. Consider another route and check road conditions."
```

Only the short label is required for the first route-selection UI.

## Safety and language constraints

This is safety-adjacent. Be careful with wording.

Do:

- say `Varasamt með eftirvagna`
- encourage checking Vegagerðin/current conditions in detail copy
- treat this as a caution signal, not a final safety decision
- make labels data-driven and testable

Do not:

- say a route is safe just because it lacks a caution label
- say Hólmavík is always safe
- imply Teskeið replaces Vegagerðin or local judgment
- rely on live weather alone for road suitability
- hardcode broad claims without a curated source/comment

## Implementation plan for Claude Code

1. Inspect `lib/weather/provider.types.ts` and add a minimal typed `cautions` field to `RouteOption`.
2. Create a small route-caution matcher module in `lib/weather`, or keep it near `google.server.ts` if Claude decides a separate module is premature.
3. Match caution rules after route options are fetched and curated routes are added.
4. For Westfjords:
   - routes to northern/western Westfjords that do not pass near Hólmavík should get `routeCautionTrailer`
   - curated `CURATED_VIA_HOLMAVIK` should not get that caution by default
5. For Öxi:
   - add a clearly marked pending/verified caution segment only after visual route verification
   - if exact coordinates are uncertain, implement the model first and leave Öxi as TODO/pending in comments rather than shipping a bad matcher
6. Update `RouteSelectionStep.tsx` to display caution badges.
7. Add translations in `messages/is.json` and `messages/en.json`.
8. Add focused tests for:
   - Reykjavík -> Ísafjörður fastest/base route gets trailer caution when it avoids Hólmavík
   - `CURATED_VIA_HOLMAVIK` route does not get the same trailer caution
   - routes that do not match caution segments get no caution
   - route option UI can render caution labels without crashing
9. Run:
   - `npm run type-check`
   - relevant Vitest tests around Google/weather route options

## Tests / verification that should exist

At minimum, add or update tests around `weather-google.test.ts` or a new route-caution test file:

1. **Westfjords caution**
   - input route option points that avoid `HOLMAVIK_VIA`
   - destination inside `WESTFJORDS_NORTH_BOUNDS`
   - expect `routeCautionTrailer`

2. **Hólmavík no duplicate caution**
   - route option points near `HOLMAVIK_VIA`
   - expect no trailer caution or a different positive/neutral label only if product explicitly wants that

3. **Non-Westfjords no caution**
   - Reykjavík -> Akureyri or Reykjavík -> Selfoss
   - expect no Westfjords trailer caution

4. **Future Öxi matcher**
   - once the Öxi segment is visually verified, add a fixture route that passes near it and expect trailer caution

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Reykjavík -> Ísafjörður

1. Select Reykjavík as origin.
2. Select Ísafjörður as destination.
3. Wait for route options.
4. Expected:
   - Google/default/fastest route is visible.
   - `Gegnum Hólmavík` route is visible.
   - route option that uses the more problematic route has a clear badge: `Varasamt með eftirvagna`.
   - `Gegnum Hólmavík` does not show the same warning unless it truly crosses another caution segment.
   - card still fits at mobile width.

### Reykjavík -> Akureyri

1. Select Reykjavík -> Akureyri.
2. Expected:
   - normal route options show.
   - no Westfjords trailer warning appears.

### Öxi verification when implemented

1. Pick a route that Google routes through Öxi.
2. Expected:
   - route option crossing Öxi gets `Varasamt með eftirvagna`.
   - route option not crossing Öxi does not get that caution.
   - visually inspect map polyline to confirm the matcher is not accidentally tagging nearby but unrelated roads.

### Mobile and accessibility

1. Test at 360 px, 390 px, and 460 px widths.
2. Badge text must not overflow.
3. Selected route state must remain obvious.
4. Duration must remain readable.
5. Keyboard focus must still work on route option buttons.

## Rollout recommendation

This can ship without a new env flag if it is implemented as a cautious UI annotation inside the already enabled weather route-selection flow.

However, if Claude Code believes the caution matching is uncertain, ship only the model and Hólmavík warning first. Leave Öxi disabled/commented as pending verification.

## Codex recommendation

Yes, build this as a reusable route-caution model now.

The important product distinction:

- `CURATED_ROUTE_RULES` adds route alternatives.
- `routeCautions` explains risks on any route option.

Keeping those separate will make it much easier to add Öxi, other mountain roads, Vegagerðin live/current condition overlays, and future vehicle-specific guidance without turning route selection into a pile of special cases.
