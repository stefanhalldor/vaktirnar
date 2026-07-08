# TODO-067 v207 - Claude handoff - Curated route registry + label priority + final-submit test

Created: 2026-07-08 14:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## What shipped

### `lib/weather/google.server.ts` — registry refactor

Replaced the one-off `THORLAKSHOFN_PLACE_ID`, `THORLAKSHOFN_BOUNDS`, `CAPITAL_AREA_BOUNDS`,
`THRENGSLAVEGUR_VIA`, `isNearThorlakshofn`, `isInCapitalArea`, `tryGetCuratedThrengslavegurRoute`
with a generic registry pattern:

**New types:**
```ts
type Bounds = { minLat; maxLat; minLon; maxLon }
type PlaceMatcher = { placeIds?: readonly string[]; bounds?: readonly Bounds[] }
type CuratedRouteRule = { id; logName; origin: PlaceMatcher; destination: PlaceMatcher; via; labels }
```

**`CURATED_ROUTE_RULES`** — one entry, unchanged behavior:
```ts
{
  id: 'capital-area-to-thorlakshofn-via-threngslavegur',
  logName: 'Þrengslavegur',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: { placeIds: ['ChIJU1N290hC1kgRypBJRWS0YX4'], bounds: [THORLAKSHOFN_BOUNDS] },
  via: { lat: 63.9550, lon: -21.4900 },
  labels: ['CURATED_VIA_THRENGSLAVEGUR'],
}
```

**New generic helpers:**
- `matchesBounds(c, b)` — point-in-bounds check
- `matchesPlaceMatcher(c, m)` — placeId OR bounds match
- `fetchCuratedRoute(rule, from, to, key, existingIds)` — one Google request per rule
- `getCuratedRouteOptions(from, to, key, existingIds)` — loops rules, collects results

Updated dev diagnostic:
```
curatedAdded: curatedRoutes.length > 0
curatedRules: curatedRoutes.map(r => r.labels[0])
```

Adding a new corridor in the future = one new entry in `CURATED_ROUTE_RULES`, no new helpers.

### `components/weather/RouteSelectionStep.tsx` — label priority fix

Curated label now wins over `idx === 0`:

```
CURATED_VIA_THRENGSLAVEGUR → "Um Þrengslaveg"   (wins even when fastest)
idx === 0                   → "Fljótlegasta leið"
isDefault                   → "Sjálfgefin Google-leið"
otherwise                   → "Önnur leið"
```

Before this fix, if the curated route was fastest (sorts first), it would show as
"Fljótlegasta leið" instead of "Um Þrengslaveg". Now it always shows correctly.

### `lib/__tests__/weather-google.test.ts` — test name update

`'makes a curated Þrengslavegur request for capital-area → Þorlákshöfn'`
→ `'uses curated route registry entry for capital-area → Þorlákshöfn (makes extra request)'`

All other curated route tests unchanged. All 1897 tests pass.

### `lib/__tests__/weather-travel-api.test.ts` — new file (3 tests)

Final-submit regression for `POST /api/teskeid/weather/travel/route`:

1. `succeeds when selectedRouteId matches a curated CURATED_VIA_THRENGSLAVEGUR route`
   — verifies no `selected_route_unavailable` when curated route ID is in `getRouteOptions` results.
2. `returns selected_route_unavailable when curated id is not in provider results`
   — verifies the error still fires when the curated route is absent (expected behavior).
3. `uses the curated route geometry for weather sampling, not the default route`
   — verifies that when the curated route is selected, its points are passed to
   `sampleRouteWeatherPoints` (weather samples Route 39, not Route 427).

Mocks: Supabase auth, checkFeatureAccess, getWeatherMapProvider (getRouteOptions),
fetchForecast, sampleRouteWeatherPoints. checkTravelWeather and thresholds run for real.

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 59 files, 1897 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `lib/weather/google.server.ts`
- `components/weather/RouteSelectionStep.tsx`
- `lib/__tests__/weather-google.test.ts`
- `lib/__tests__/weather-travel-api.test.ts` (new)

## No changes to

- `messages/is.json` / `messages/en.json` (keys already correct from v203)
- SQL, RLS, Supabase, saved-places schema
- Route API handlers (routes/route.ts), travel API (travel/route.ts app code)
- Deployment config

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost.
2. Select `Garðabær` + `Þorlákshöfn` from Google autocomplete.
3. Expected route cards:
   - `Um Þrengslaveg` (always, even if it is the fastest option)
   - `Sjálfgefin Google-leið` or `Fljótlegasta leið` for the Route 427 option
4. Terminal diagnostics: `curatedAdded: true`, `curatedRules: ["CURATED_VIA_THRENGSLAVEGUR"]`
5. Select `Um Þrengslaveg` and click `Nota þessa leið`.
6. Expected: Ferðaveðrið result loads normally, no `Valin leið fannst ekki`.
7. Regression checks:
   - `Garðabær → Selfoss`: no `Um Þrengslaveg` option
   - `Keflavík → Þorlákshöfn`: no `Um Þrengslaveg` option
   - `Þorlákshöfn → Garðabær`: should still route correctly as before (unaffected)

## Ready for commit

All v170-v207 changes are uncommitted. When Stebbi approves:
- commit with message: `feat: place-id routing, via-Þrengslavegur curated route registry (#67)`
- no push until separately approved
