# TODO-067 v203 - Claude handoff - Via-Þrengslavegur curated route + SHORTER_DISTANCE removed

Created: 2026-07-08 13:45
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## What shipped

### `lib/weather/google.server.ts`

**SHORTER_DISTANCE removed:**
- `requestedReferenceRoutes: ['SHORTER_DISTANCE']` removed from `getRouteOptions` body.
- `routes.routeToken` removed from field mask.
- `routeToken?` removed from `RoutesResponse` type.
- SHORTER_DISTANCE dedup log removed (dedup logic itself kept for general correctness).

**New constants and helpers:**
- `THORLAKSHOFN_PLACE_ID` — confirmed Place ID from Stebbi's live diagnostics.
- `THORLAKSHOFN_BOUNDS` — tight bounding box around Þorlákshöfn (catches coord-based selections such as saved places).
- `CAPITAL_AREA_BOUNDS` — covers Reykjavík, Garðabær, Kópavogur, Hafnarfjörður, Seltjarnarnes, Mosfellsbær. Excludes Reykjanes/southwest (Keflavík lon ≈ -22.56, Grindavík ≈ -22.44, Vogar ≈ -22.37 all < minLon -22.10).
- `THRENGSLAVEGUR_VIA = { lat: 63.9550, lon: -21.4900 }` — estimated via-point on Þrengslavegur/Route 39 in Þrengslin pass area. **Must be verified visually on localhost.**
- `isNearThorlakshofn(c)` — true if Place ID matches or coords are in bounding box.
- `isInCapitalArea(c)` — true if coords are in capital-area bounding box.
- `buildRouteFingerprint(distanceMeters, coords, fallbackIdx)` — extracted helper used by both main routes and curated route.

**`tryGetCuratedThrengslavegurRoute(from, to, key, existingIds)`:**
- Only fires when `isNearThorlakshofn(to) && isInCapitalArea(from)`.
- Makes one extra Google Routes request with `intermediates: [{ via: true, location: { latLng: THRENGSLAVEGUR_VIA } }]`.
- Silent fallback on HTTP error, ZERO_RESULTS, or empty response.
- If the returned geometry fingerprint matches an existing route, the curated option is skipped (via-waypoint didn't produce a meaningfully different route).
- Returns `RouteOption` with `labels: ['CURATED_VIA_THRENGSLAVEGUR']`, `isDefault: false`, `routeIndex: -1`.

**`getRouteOptions`:**
- Calls `tryGetCuratedThrengslavegurRoute` after dedup and sort.
- If curated route is non-null, pushes it and re-sorts.
- Dev diagnostic updated: `routeCount`, `curatedAdded: true/false`, per-route labels/description/distance/duration.
- `routeOptions` explicitly typed as `RouteOption[]` so `push(curated)` type-checks.

### `components/weather/RouteSelectionStep.tsx`

Label logic updated:

```
idx === 0                           → "Fljótlegasta leið"   (always fastest after sort)
labels includes CURATED_VIA_THRENGSLAVEGUR → "Um Þrengslaveg"
isDefault                          → "Sjálfgefin Google-leið"
otherwise                          → "Önnur leið"
```

### `messages/is.json` + `messages/en.json`

- Removed: `routeOptionShorterDistance`
- Added: `routeOptionViaThrengslavegur` — IS `"Um Þrengslaveg"`, EN `"Via Þrengslavegur"`

### `lib/__tests__/weather-google.test.ts`

Removed 4 SHORTER_DISTANCE tests:
- `includes requestedReferenceRoutes SHORTER_DISTANCE in body`
- `includes routes.routeToken in field mask`
- `SHORTER_DISTANCE route appears as a distinct option when geometry differs`
- `SHORTER_DISTANCE route is deduplicated when geometry matches DEFAULT_ROUTE and labels are merged`

Replaced with:
- `does not include requestedReferenceRoutes in body`
- `does not include routes.routeToken in field mask`
- `makes a curated Þrengslavegur request for capital-area → Þorlákshöfn` (2 fetch calls made)
- `curated route has CURATED_VIA_THRENGSLAVEGUR label when geometry differs from main routes`
- `curated route uses via: true intermediate waypoint on Þrengslavegur`
- `curated route is skipped when geometry matches a main route`
- `curated route is silently omitted when Google returns no route`
- `does not make a curated request for non-Þorlákshöfn destination`
- `does not make a curated request for Reykjanes/southwest origin`
- `curated route and main route both appear when distinct, sorted by durationS`

Also added `mockFetchSequence` helper for mocking multiple consecutive fetch calls.

Added test candidates: `FROM_GARDABAER`, `TO_THORLAKSHOFN`, `FROM_KEFLAVIK`.

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 58 files, 1894 passed, 27 skipped, 8 todo — all green
```

## Key observation from Stebbi during testing

When routing Þorlákshöfn → Garðabær (reverse direction), Teskeið already shows the correct route. This means Google Routes API routes asymmetrically: it finds Route 39 for the reverse trip but not for the forward trip. The curated trigger only fires when destination = Þorlákshöfn, so the reverse direction is unaffected.

This asymmetric routing confirms that Google does know about Route 39 — it just doesn't choose it for the Garðabær → Þorlákshöfn direction. The via-waypoint experiment forces it.

## Localhost checks for Stebbi

**Primary check — Þorlákshöfn:**

1. Open `/auth-mvp/vedrid` on localhost.
2. Clear both fields.
3. Type `Garðabær`, pick Google suggestion.
4. Type `Þorlákshöfn`, pick Google suggestion.
5. Check Next.js terminal:
   - `originType: "placeId"`, `destType: "placeId"` (confirmed from earlier tests)
   - `curatedAdded: true` — if the via-waypoint produced a distinct route
   - `curatedAdded: false` — if ZERO_RESULTS or same geometry (via-point may need adjustment)
6. If `curatedAdded: true`:
   - Does `Um Þrengslaveg` appear in the route picker alongside the standard Route 427 option?
   - Select `Um Þrengslaveg` — does the map polyline visibly follow a different path than Route 427?
   - Is the distance/duration plausible? Expected roughly 51 km / 42 min for Route 39.
   - Continue through the wizard — confirm no `Valin leið fannst ekki` error.
7. If `curatedAdded: false` (ZERO_RESULTS):
   - The via-point coordinate `{ lat: 63.9550, lon: -21.4900 }` may need adjustment.
   - Try adjusting lat/lon slightly and retesting. The Þrengslin pass area may be at slightly different coords.

**Regression checks:**

8. `Þorlákshöfn → Garðabær` — should still work correctly as before (unaffected by curated logic).
9. `Garðabær → Selfoss` — no `Um Þrengslaveg` option should appear.
10. `Garðabær → Akureyri` — no `Um Þrengslaveg` option.
11. `Keflavík → Þorlákshöfn` — no `Um Þrengslaveg` option (Reykjanes origin excluded).
12. `Grindavík → Þorlákshöfn` — no `Um Þrengslaveg` option.
13. Normal saved-place route (e.g. recent/saved Garðabær → recent/saved Þorlákshöfn) — curated option should still appear because trigger checks coordinate bounds, not only Place ID.

## Files changed

- `lib/weather/google.server.ts`
- `components/weather/RouteSelectionStep.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-google.test.ts`

## No changes to

- SQL, RLS, Supabase, saved-places schema
- Route API handlers, travel API, threshold logic
- Deployment config

## Via-point coordinate note

`THRENGSLAVEGUR_VIA = { lat: 63.9550, lon: -21.4900 }` is an estimate for the Þrengslin pass area. If `curatedAdded: false` appears in the terminal (ZERO_RESULTS), the coordinate needs adjustment. The road runs roughly between Garðabær (64.09°N, 21.93°W) and Þorlákshöfn (63.849°N, 21.365°W), passing through Þrengslin. The via-point should be on the road surface, not nearby.
