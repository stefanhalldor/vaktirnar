# TODO 086 v337 - Claude handoff: v334 + v335 + v336 done, prerelease

Created: 2026-07-16 15:53
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1527-todo-086-v333-claude-v332-done-prerelease.md` (v332 done)
- `2026-07-16-1531-todo-086-v334-codex-v333-prerelease-review.md` (v334 review)
- `2026-07-16-1536-todo-086-v335-codex-route-pulse-collapsed-drawer-handoff.md` (v335 design)
- `2026-07-16-1541-todo-086-v336-codex-route-caution-model-handoff.md` (v336 design)

## Status

v334 + v335 + v336 fully implemented. Type-check clean, 104/104 tests pass.

---

## v334 fixes (from Codex review of v333)

### `useChatPreview` stale state reset

`components/chat/useChatPreview.ts` — reset `messages = []` and `loaded = false` at the start of the effect before any fetch, so stale messages from the previous URL never flash under the new target:

```ts
useEffect(() => {
  setMessages([])
  setLoaded(false)
  let cancelled = false
  // ...
}, [url, pollingIntervalMs])
```

### Supabase Realtime subscribe comment

`app/auth-mvp/vedrid/vedurpulsTransport.ts` — added explanatory comment on `subscribe()` clarifying that `teskeid_chat_messages` must be added to the Supabase Realtime publication and appropriate RLS/grants must be in place. Without that config the channel subscribes silently but delivers no events; polling continues as fallback. Comment warns against adding broad grants to "fix" this without a security review.

### Bolungarvík test

`lib/__tests__/weather-google.test.ts` — added `TO_BOLUNGARVIK` candidate (lat 66.15, lon -23.26) and test confirming it triggers `CURATED_VIA_HOLMAVIK`, giving a second representative point inside `WESTFJORDS_NORTH_BOUNDS`.

---

## v335 — VedurstofanRoutePulseSummary collapsed drawer

`components/weather/VedurstofanRoutePulseSummary.tsx` — fully rewritten as a collapsed disclosure:
- Default closed (`open` state = `false`)
- Summary row: small "SAFNPÚLS LEIÐARINNAR" label + "{count} stöðvar með nýleg skilaboð" subtitle + chevron icon
- Expanded: `divide-y divide-border/60` station groups, each with `border-l border-border/60 pl-3` indent
- Hidden when no messages (`!hasAnyMessages → return null`)
- Outer element is `<div className="py-3">` to fit inside the `divide-y` parent in FerdalagidClient

`app/auth-mvp/vedrid/FerdalagidClient.tsx` — moved `VedurstofanRoutePulseSummary` from outside the journey summary fragment into the `border-y divide-y` div, after the `Áfangastaður` section. It now gets natural `divide-y` separation from the rest of the summary content.

Translations added (`teskeid.vedrid.eltaVedrid`):
- IS: `"safnpulsRouteSummaryStations": "{count} stöðvar með nýleg skilaboð"`
- EN: `"safnpulsRouteSummaryStations": "{count} stations with new messages"`

---

## v336 — Route caution model

### New types in `lib/weather/provider.types.ts`

```ts
export type RouteCautionSeverity = 'info' | 'caution' | 'warning'
export type RouteCautionVehicle = 'trailer' | 'caravan' | 'camper' | 'all'
export type RouteCautionResult = {
  id: string
  severity: RouteCautionSeverity
  labelKey: string
  detailKey?: string
  appliesTo: RouteCautionVehicle[]
}

// RouteOption now has:
cautions?: RouteCautionResult[]
```

### New file `lib/weather/routeCautions.ts`

Reusable caution registry + matcher. Contains:

- `WESTFJORDS_NORTH_BOUNDS` (same bounds as in `google.server.ts`)
- `HOLMAVIK_VIA_POINT` + `HOLMAVIK_PROXIMITY_M = 8_000` (in sync with `google.server.ts`)
- `ROUTE_CAUTION_RULES` registry with one active rule:
  - `westfjords-north-trailer-no-holmavik`: triggers when destination is in `WESTFJORDS_NORTH_BOUNDS` AND route does NOT pass within 8 km of `HOLMAVIK_VIA_POINT`
  - `labelKey: 'routeCautionTrailer'`, severity `'caution'`, appliesTo `trailer | caravan | camper`
- `TODO` comment for Öxi — coordinates unverified, not added
- Exported `matchRouteCautions(points, to): RouteCautionResult[]`

### `lib/weather/google.server.ts`

After all route options (base + curated) are assembled, applies cautions:

```ts
for (const route of routeOptions) {
  const cautions = matchRouteCautions(route.points, to)
  if (cautions.length > 0) route.cautions = cautions
}
```

Diagnostics log now includes `cautions: r.cautions?.map(c => c.id)` per route.

### `components/weather/RouteSelectionStep.tsx`

- Added `AlertTriangle` to lucide-react imports
- After the route label, renders caution badges for each `ro.cautions` entry:

```tsx
{ro.cautions?.map(caution => (
  <span
    key={caution.id}
    className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
  >
    <AlertTriangle size={11} aria-hidden />
    {tf(caution.labelKey as Parameters<typeof tf>[0])}
  </span>
))}
```

Badge sits between the route title and the Google description line. Duration column is unaffected.

### Translations

Added to `teskeid.vedrid.eltaVedrid` in both locales:

IS:
```json
"routeCautionTrailer": "Varasamt með eftirvagna",
"routeCautionTrailerDetail": "Þessi leið getur verið varasöm fyrir bíla með eftirvagna. Skoðaðu aðra leið og athugaðu aðstæður hjá Vegagerðinni."
```

EN:
```json
"routeCautionTrailer": "Caution with trailers",
"routeCautionTrailerDetail": "This route can be risky for vehicles with trailers. Consider another route and check road conditions."
```

### Tests

**New file `lib/__tests__/weather-route-cautions.test.ts`** (pure unit tests, no HTTP):
- Route to Ísafjörður avoiding Hólmavík → gets `westfjords-north-trailer-no-holmavik`
- Route to Bolungarvík avoiding Hólmavík → gets caution
- Route to Ísafjörður via Hólmavík → no caution
- Route to Akureyri (outside bounds) → no caution
- Route to Selfoss (south Iceland) → no caution
- Caution has correct severity, labelKey, appliesTo

**New integration tests appended to `weather-google.test.ts`** (inside the Holmavik describe block):
- Base route to Ísafjörður (NE auto-gen, avoids Hólmavík) → `cautions` includes `westfjords-north-trailer-no-holmavik`
- CURATED_VIA_HOLMAVIK route → no trailer caution
- Route to Akureyri → no Westfjords caution on any option

---

## Test results

```
Tests  104 passed (104)
```

Type-check: clean.

---

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Route caution badge

1. Reykjavík → Ísafjörður
   - Expect: fastest/default route card shows amber "Varasamt með eftirvagna" badge with AlertTriangle icon
   - Expect: "Gegnum Hólmavík" route does NOT show the badge
   - Badge should not overflow at mobile widths (360-460px)
   - Duration column must remain readable

2. Reykjavík → Akureyri
   - Expect: no amber badge appears on any route option

### VedurstofanRoutePulseSummary (collapsed drawer)

1. Navigate to a route with Veðurstofan stations active
   - Expect: "SAFNPÚLS LEIÐARINNAR" section appears collapsed (ChevronDown visible)
   - Expect: subtitle shows "{n} stöðvar með nýleg skilaboð"
   - Tap to expand — station groups with pulse messages appear with `border-l` indent
   - Tap again to collapse

2. If no stations have messages → section is hidden entirely

---

## Pending / not implemented

- **Öxi caution**: coordinates unverified, not added. Comment in `routeCautions.ts` marks the TODO.
- **`routeCautionTrailerDetail`**: translation key added but not yet rendered anywhere. Ready for future detail panel/tooltip.
- **Vehicle-specific filtering**: `appliesTo` field is present on `RouteCautionResult` but the UI does not yet filter by vehicle type. All users see all applicable cautions.
