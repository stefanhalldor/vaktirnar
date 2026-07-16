# TODO 086 v341 - Claude handoff: v338 + v339 + v340 done, prerelease

Created: 2026-07-16 16:55
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1553-todo-086-v337-claude-v334-v335-v336-done-prerelease.md`
- `2026-07-16-1557-todo-086-v338-codex-v337-prerelease-review.md`
- `2026-07-16-1600-todo-086-v339-codex-holmavik-any-origin-and-oxi-caution-handoff.md`
- `2026-07-16-1640-todo-086-v340-codex-road-segment-caution-text-handoff.md`

## Status

v338 + v339 + v340 fully implemented. Type-check clean, 112/112 tests pass.

---

## v338 fixes

### 1. Safnpuls placement (medium)

`app/auth-mvp/vedrid/FerdalagidClient.tsx` — moved `VedurstofanRoutePulseSummary` from after `Áfangastaður` to between the `Á leiðinni` block and the `Áfangastaður` section. It is now the last element in `Á leiðinni` before destination context, as the v335 product request intended.

### 2. Full polyline for caution matching (medium)

Cautions are now evaluated on the full undecimated route geometry at construction time, before `samplePoints()`:

- **Base routes** (`getRouteOptions` rawOptions map): `matchRouteCautions(allPoints, from, to)` called using the full `allPoints` array right after coords are decoded.
- **Curated routes** (`fetchCuratedRoute`): `matchRouteCautions(allPoints, from, to)` called using full `coords.map(...)` before sampling.
- The end-of-function caution application loop (which used sampled `route.points`) has been removed.

### 3. Shared constants extracted (low/medium)

**New file `lib/weather/routeCautionConstants.ts`**:

```ts
export const ICELAND_BOUNDS: Bounds = { minLat: 63.0, maxLat: 67.0, minLon: -26.0, maxLon: -13.0 }
export const WESTFJORDS_NORTH_BOUNDS: Bounds = { minLat: 65.80, maxLat: 66.50, minLon: -25.0, maxLon: -22.00 }
export const HOLMAVIK_VIA = { lat: 65.703, lon: -21.685 }
export const HOLMAVIK_PROXIMITY_M = 8_000
```

Both `lib/weather/google.server.ts` and `lib/weather/routeCautions.ts` now import from this module instead of defining their own copies. `HOLMAVIK_DUPLICATE_PROXIMITY_M` (was `8_000` locally in `google.server.ts`) is replaced by the shared `HOLMAVIK_PROXIMITY_M`.

### 4. IS singular fix (low)

`messages/is.json`: `safnpulsRouteSummaryStations` changed from `"{count} stöðvar með nýleg skilaboð"` to `"Nýleg skilaboð frá stöðvum á leiðinni"`.

`messages/en.json`: `safnpulsRouteSummaryStations` changed from `"{count} stations with new messages"` to `"New messages from stations on route"`.

`components/weather/VedurstofanRoutePulseSummary.tsx`: removed `{ count: stationCount }` from the translation call and removed the now-unused `stationCount` variable.

### 5. summaryKey type cast (low, unchanged)

Kept as `tf(caution.labelKey as Parameters<typeof tf>[0])`. This is a known limitation of dynamic translation keys in next-intl. Not fixed in this pass (low priority, no clean union type available).

---

## v339 — Hólmavík alternate from any Iceland origin

### `lib/weather/google.server.ts`

Added `excludedOrigin?: PlaceMatcher` to `CuratedRouteRule` type:

```ts
type CuratedRouteRule = {
  ...
  excludedOrigin?: PlaceMatcher
  ...
}
```

Updated `getCuratedRouteOptions` to check excluded origin:

```ts
if (rule.excludedOrigin && matchesPlaceMatcher(from, rule.excludedOrigin)) continue
```

Changed the Westfjords Hólmavík curated route rule:

- **Before**: `origin: { bounds: [CAPITAL_AREA_BOUNDS] }` (capital area only)
- **After**: `origin: { bounds: [ICELAND_BOUNDS] }`, `excludedOrigin: { bounds: [WESTFJORDS_NORTH_BOUNDS] }`

Comment on rule:
> Origin is any Icelandic location EXCEPT origins already inside the Westfjords area (those origins are already past Hólmavík; an alternate via Hólmavík would be absurd).

ID updated from `capital-to-westfjords-north-via-holmavik` to `any-iceland-to-westfjords-north-via-holmavik`.

### Effect

- `Höfn → Ísafjörður`: now gets a `CURATED_VIA_HOLMAVIK` option (Höfn is in ICELAND_BOUNDS, not in WESTFJORDS_NORTH_BOUNDS)
- `Akureyri → Ísafjörður`, any other non-Westfjords origin → same
- `Ísafjörður → Garðabær` (origin inside WESTFJORDS_NORTH_BOUNDS) → excluded, no alternate offered
- Distance gate `minFastestRouteDistanceM: 180_000` still prevents short local trips from triggering

---

## v340 — SensitiveRoadSegment model + compact text

### `lib/weather/routeCautions.ts` — new segment model

Replaced `RouteCautionRule` type with `SensitiveRoadSegment`:

```ts
type RoadSegmentDetection =
  | { type: 'missing-via'; viaNearPoints: ...; anyPartyBounds: Bounds[] }
  | { type: 'present-near-corridor'; corridorPoints: ... }

type SensitiveRoadSegment = {
  id: string
  name: string
  roadNumbers: string[]
  detection: RoadSegmentDetection
  labelKey: string
  summaryKey: string
  severity: RouteCautionSeverity
  appliesTo: RouteCautionVehicle[]
  source: { type: 'manual-curated'; note: string; verified: boolean }
}
```

Active segment: `westfjords-south-route60` (renamed from `westfjords-north-trailer-no-holmavik`).

Detection: `type: 'missing-via'` with `anyPartyBounds: [WESTFJORDS_NORTH_BOUNDS]`. The `anyPartyBounds` check covers **both origin and destination** — so `Ísafjörður → Höfn` also gets the Westfjords caution (v340 requirement).

Öxi: added as a commented-out stub with `TODO` note. Approximate pass coordinates (~64.84, -14.37) included but marked "APPROXIMATE — verify visually." Detection disabled until localhost visual verification.

### `matchRouteCautions` signature change

```ts
// Before:
export function matchRouteCautions(points, to): RouteCautionResult[]

// After:
export function matchRouteCautions(points, from, to): RouteCautionResult[]
```

Both call sites in `google.server.ts` updated. Test files updated.

### `lib/weather/provider.types.ts` — summaryKey on RouteCautionResult

```ts
export type RouteCautionResult = {
  id: string
  severity: RouteCautionSeverity
  labelKey: string
  summaryKey?: string   // NEW
  detailKey?: string
  appliesTo: RouteCautionVehicle[]
}
```

### `components/weather/RouteSelectionStep.tsx` — compact detail text

Below the amber chip, renders a compact paragraph for `caution.summaryKey`:

```tsx
<div key={caution.id} className="flex flex-col gap-1">
  <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
    <AlertTriangle size={11} aria-hidden />
    {tf(caution.labelKey as Parameters<typeof tf>[0])}
  </span>
  {caution.summaryKey && (
    <p className="text-[11px] text-muted-foreground leading-snug">
      {tf(caution.summaryKey as Parameters<typeof tf>[0])}
    </p>
  )}
</div>
```

### New translation keys

IS:
```json
"routeCautionWestfjordsSummary": "Leiðin fer um erfiðari vegarkafla á sunnanverðum Vestfjörðum. Leiðin um Hólmavík er oft einfaldari kostur. Athugaðu aðstæður hjá Vegagerðinni.",
"routeCautionOxiSummary": "Leiðin fer um Öxi. Öxi er brattur og hlykkjóttur fjallvegur sem þarf að meta sérstaklega, sérstaklega í þoku, úrkomu eða vindi. Athugaðu aðstæður hjá Vegagerðinni."
```

EN:
```json
"routeCautionWestfjordsSummary": "This route includes a more difficult road section in the southern Westfjords. The route via Hólmavík is often a simpler option. Check road conditions.",
"routeCautionOxiSummary": "This route includes Öxi. Öxi is a steep, winding mountain road that requires special consideration, particularly in fog, rain, or wind. Check road conditions."
```

Note: `routeCautionOxiSummary` is added to messages but not yet served from any active caution segment (Öxi detection is commented out).

---

## Tests

Total: **112/112 passing** (up from 104).

New tests in `lib/__tests__/weather-route-cautions.test.ts`:
- `Höfn → Ísafjörður` (non-capital origin) gets caution — covers v340 direction
- `Ísafjörður → Höfn` (reverse, both parties in Westfjords/east) gets caution — covers v340 "Ísafjörður → Höfn á sama hátt"
- `Akureyri → Höfn` (neither party in Westfjords) gets no caution
- `summaryKey` is `routeCautionWestfjordsSummary` on caution result

New tests in `lib/__tests__/weather-google.test.ts`:
- `Höfn → Ísafjörður` triggers `CURATED_VIA_HOLMAVIK` — covers v339
- `Höfn → Ísafjörður` base route gets Westfjords caution
- `Höfn → Ísafjörður` CURATED_VIA_HOLMAVIK does not get Westfjords caution
- Westfjords origin does NOT trigger `CURATED_VIA_HOLMAVIK` (excludedOrigin guard)
- caution result includes `summaryKey`

---

## Answers to v340 open questions

**1. Is current route data sufficient for segment matching without extra API cost?**

Yes. Full polyline is available at construction time for both base routes (decoded from coords in `rawOptions.map`) and curated routes (decoded in `fetchCuratedRoute` before sampling). No extra API calls needed.

**2. Where to store first-pass geometry for Öxi and Vestfjords segment?**

In `lib/weather/routeCautions.ts` inside `SENSITIVE_ROAD_SEGMENTS`. Approximate corridor points belong in the segment registry, clearly marked with `source.verified: false` and code comments.

**3. Can we link Hólmavík alternate to matched segment now?**

The systems remain separate for v1: `CURATED_ROUTE_RULES` in `google.server.ts` handles the alternate route fetch, `SENSITIVE_ROAD_SEGMENTS` in `routeCautions.ts` handles caution detection. The connection is conceptual (Westfjords segment → suggest Hólmavík alternate) but implemented through two parallel registries. A transitional destination-based fallback was sufficient and is still in use.

**4. What text for translations?**

See above. Westfjords and Öxi summary keys added. Wording follows v340: "getur verið varasöm" / "þarf að meta sérstaklega", links to Vegagerðin. Avoids claiming the route is always dangerous.

**5. How to keep warnings compact on mobile?**

`text-[11px]` + `leading-snug` on the summary paragraph. Summary text is one or two sentences. Badge and text are inside `flex flex-col gap-1` in `min-w-0` container. Duration column `shrink-0 ml-3` is unaffected.

---

## Pending / not implemented

- **Öxi / Axarvegur 939**: segment stub exists in `routeCautions.ts` (commented out). Approximate coordinates: (~64.84, -14.37). Enable only after visual verification on localhost that the corridor points correctly identify Öxi and not nearby coastal Route 1.
- **Vehicle profile**: `appliesTo` field present but not used for filtering. All users see all cautions regardless of vehicle type.
- **Ísafjörður → Höfn Hólmavík alternate**: origin excluded from curated rule. The caution fires correctly for both directions (anyPartyBounds), but the safer Hólmavík alternate is not offered when origin is in Westfjords. Future: consider bidirectional curated alternate rule.

---

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Route caution — Reykjavík → Ísafjörður
1. Fastest/default route should show amber "Varasamt með eftirvagna" chip.
2. Below chip: "Leiðin fer um erfiðari vegarkafla á sunnanverðum Vestfjörðum. Leiðin um Hólmavík er oft einfaldari kostur. Athugaðu aðstæður hjá Vegagerðinni."
3. "Gegnum Hólmavík" route should NOT show the Westfjords warning.
4. Check at 360/390/460 px — text must not overflow, duration must remain readable.

### Route caution — Höfn → Ísafjörður
1. Google routes that avoid Hólmavík should show the same Westfjords caution.
2. A "Gegnum Hólmavík" option should appear (if Google doesn't already return a route via Hólmavík).
3. Verify map polyline for the Hólmavík alternate goes through Hólmavík visually.

### Safnpuls placement
1. Use a route with Veðurstofan stations that have messages.
2. Collapsed drawer should appear BEFORE destination context (Áfangastaður), not after.
3. Subtitle: "Nýleg skilaboð frá stöðvum á leiðinni" (no count, no singular issue).

### Reykjavík → Akureyri
1. No Westfjords caution on any route.
2. No Hólmavík alternate offered.
