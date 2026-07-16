# TODO 086 v346 - Claude handoff: v344 + v345 done, prerelease

Created: 2026-07-16 17:30
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1705-todo-086-v343-claude-v342-position-and-oxi-analysis.md`
- `2026-07-16-1712-todo-086-v344-codex-v343-position-and-oxi-review.md`
- `2026-07-16-1716-todo-086-v345-codex-oxi-alternative-route-handoff.md`

## Status

v344 + v345 fully implemented. 123/123 tests pass, type-check clean.

Stebbi skipped the v344 Westfjords text change ("Mér finnst ekki þurfa textalagfæringu").

---

## v344 items addressed

### Skipped: Westfjords summary text

Stebbi decided not to soften the Westfjords summary text. Current text remains:
> "Leiðin fer um erfiðari vegarkafla á sunnanverðum Vestfjörðum. Leiðin um Hólmavík er oft einfaldari kostur. Athugaðu aðstæður hjá Vegagerðinni."

### Fixed: "coexist" test made real

The trivial ID-equality test in `lib/__tests__/weather-route-cautions.test.ts` was replaced with a real coexist test:

```ts
it('Westfjords and Öxi cautions can coexist on a single route', () => {
  // Synthetic route: starts in Westfjords, avoids Hólmavík, AND passes near Öxi
  const POINTS_VIA_OXI_AND_WESTFJORDS = [
    { lat: 66.07, lon: -23.13 }, // Ísafjörður — in WESTFJORDS_NORTH_BOUNDS
    { lat: 64.86, lon: -14.37 }, // near Öxi corridor
    { lat: 65.27, lon: -14.40 }, // Egilsstaðir area
  ]
  // Both cautions fire → result has length 2
})
```

### Not addressed: point-to-segment distance

The v344 architectural note about `routePassesNear` using point-proximity instead of point-to-segment distance is noted. Not addressed now — the 6 km Öxi radius and 8 km Hólmavík radius compensate adequately for current use cases.

---

## v345 — Curated Öxi-avoid route

### `lib/weather/routeCautionConstants.ts`

Added `REYDARFJORDUR_VIA`:

```ts
export const REYDARFJORDUR_VIA = { lat: 65.0317, lon: -14.2183 }
```

### `lib/weather/google.server.ts`

**`CuratedRouteRule` type extended:**

```ts
type CuratedRouteRule = {
  ...
  /**
   * If set, this rule is triggered when at least one base route has this caution ID,
   * and no base route already avoids it. Origin/destination matching is skipped.
   * After fetch, the curated route is validated: if it still carries the same caution
   * it is suppressed.
   */
  triggerCautionId?: string
  origin?: PlaceMatcher       // optional when triggerCautionId is set
  destination?: PlaceMatcher  // optional when triggerCautionId is set
  ...
}
```

**`getCuratedRouteOptions` logic extended:**

For rules with `triggerCautionId`, origin/destination matching is replaced by:
1. Skip if no base route has the caution.
2. Skip if any base route already avoids the caution (user already has a non-Öxi option).
3. After fetch: suppress curated route if it still carries the same caution.

**New rule in `CURATED_ROUTE_RULES`:**

```ts
{
  id: 'avoid-oxi-via-reydarfjordur',
  logName: 'Öxi / Reyðarfjörður',
  triggerCautionId: 'oxi-axarvegur-939',
  vias: [REYDARFJORDUR_VIA],
  labels: ['CURATED_AVOID_OXI'],
},
```

**Import:** `REYDARFJORDUR_VIA` imported from `routeCautionConstants`.

### `components/weather/RouteSelectionStep.tsx`

Added `CURATED_AVOID_OXI` to the label chain:

```tsx
: ro.labels.includes('CURATED_AVOID_OXI')
? tf('routeOptionAvoidOxi')
```

### `messages/is.json` + `messages/en.json`

```json
"routeOptionAvoidOxi": "Til að sleppa við Öxi"   // IS
"routeOptionAvoidOxi": "Avoid Öxi"                // EN
```

### Tests

6 new integration tests in `lib/__tests__/weather-google.test.ts`:

1. Base route via Öxi triggers one extra curated fetch.
2. Curated request uses Reyðarfjörður as single via with `via: true` and correct coordinates.
3. Curated route has no `oxi-axarvegur-939` caution when it avoids Öxi.
4. Curated route suppressed when returned geometry still triggers `oxi-axarvegur-939`.
5. No curated fetch when no base route has `oxi-axarvegur-939`.
6. No curated route when a base route already avoids Öxi (duplicate suppression).

---

## Pending / not implemented

- **Öxi coordinate verification**: `source.verified: false` on `oxi-axarvegur-939`. Stebbi should localhost-check that `Höfn → Egilsstaðir` shows the caution and `Til að sleppa við Öxi` appears.
- **Reyðarfjörður via-point verification**: The via `{ lat: 65.0317, lon: -14.2183 }` is approximate. Verify that the curated route visually avoids Road 939.
- **Route 60 corridor**: Westfjords `missing-via` transitional proxy still in place.
- **Bidirectional Hólmavík alternate**: `Ísafjörður → Höfn` caution fires but no Hólmavík alternate offered.
- **Vehicle profile filtering**: `appliesTo` field present but not used for filtering.

---

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Öxi caution + alternate

1. Route `Höfn → Egilsstaðir`:
   - Default route should show "Varasamt með eftirvagna" chip + Öxi summary text.
   - A second route "Til að sleppa við Öxi" should appear.
2. Select "Til að sleppa við Öxi" and check the map — route should go around the fjords via Reyðarfjörður area, NOT through the Öxi mountain pass.
3. Confirm Reyðarfjörður does not appear as a stop or destination.
4. Try reverse: `Egilsstaðir → Höfn` — same behaviour expected.

### If Öxi caution fires but curated route still uses Öxi

The curated route will be suppressed (validation check prevents showing it). In that case, adjust `REYDARFJORDUR_VIA` coordinates or add a second via (Fáskrúðsfjörður area) as fallback.

### If Öxi corridor point over-fires (coastal route gets caution)

Tighten `radiusM` from 6_000 to 4_000 in `routeCautions.ts`, or move `{ lat: 64.860, lon: -14.365 }` slightly further into the mountain pass interior.

### Regression checks

1. `Reykjavík → Akureyri`: no Öxi or Westfjords caution, no "Til að sleppa við Öxi".
2. `Garðabær → Ísafjörður`: Westfjords caution + "Gegnum Hólmavík" still work.
3. Mobile 360/390/460 px: route cards with caution chip + summary must not overflow.
