# TODO-067 v210 - Claude handoff - staticDuration for route duration accuracy

Created: 2026-07-08 14:25
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## Problem solved

Teskeið was showing 57 min for Þrengslavegur/Route 39, while Google Maps shows 45 min.
Root cause: Teskeið used `TRAFFIC_AWARE` `duration` (live traffic ETA at request time) for
`RouteOption.durationS`. Google also returns `staticDuration` (base travel time without live
traffic). For a weather forecast product where users plan future departures over multiple hours,
`staticDuration` is the more appropriate baseline.

## What shipped

### `lib/weather/google.server.ts`

**`RoutesResponse` type:**
```ts
duration: string         // traffic-aware ETA
staticDuration?: string  // base travel time without live traffic
```

**New `parseGoogleSeconds` helper:**
```ts
function parseGoogleSeconds(value: string | undefined): number | null {
  if (!value?.endsWith('s')) return null
  const parsed = Number.parseInt(value.slice(0, -1), 10)
  return Number.isFinite(parsed) ? parsed : null
}
```

**`getRouteOptions` — field mask:** added `routes.staticDuration`

**`getRouteOptions` — duration parsing (main routes):**
```ts
const trafficDurationS = parseGoogleSeconds(route.duration)
const staticDurationS = parseGoogleSeconds(route.staticDuration)
const durationS = staticDurationS ?? trafficDurationS ?? 0
```

**`fetchCuratedRoute` — field mask:** added `routes.staticDuration`

**`fetchCuratedRoute` — duration parsing:**
```ts
durationS: parseGoogleSeconds(route.staticDuration) ?? parseGoogleSeconds(route.duration) ?? 0,
```

**Dev diagnostic:** added `durationNote` explaining which source is used.

`getRouteGeometry` (used for simple preview, not multi-route selection) is unchanged.

### `lib/__tests__/weather-google.test.ts`

**`makeMultiRouteResponse`** updated to support `staticDurationMultiplier?`:
```ts
staticDuration: staticDurationMultiplier != null ? `${numPoints * 300 * staticDurationMultiplier}s` : undefined,
```

**5 new tests:**
- `uses staticDuration for durationS when both duration and staticDuration are present`
- `falls back to traffic duration when staticDuration is absent`
- `curated route uses staticDuration when present`
- `routes sorted by staticDuration when static values are present`
- `includes routes.staticDuration in field mask`

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 59 files, 1902 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `lib/weather/google.server.ts`
- `lib/__tests__/weather-google.test.ts`

## No changes to

- `components/weather/RouteSelectionStep.tsx`
- `messages/is.json` / `messages/en.json`
- SQL, RLS, Supabase, saved-places schema
- API handlers, deployment config

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost.
2. Select `Garðabær` + `Þorlákshöfn` from Google autocomplete.
3. Route picker expected:
   - `Um Þrengslaveg` — ~56 km — duration should be closer to 45 min than the previous 57 min
   - `Sjálfgefin Google-leið` / Route 427 — ~67 km — around 59 min
4. If `staticDuration` reduces Þrengslavegur to ~45 min, the route picker now correctly shows
   Route 39 as materially faster than Route 427.
5. Select `Um Þrengslaveg` and click `Nota þessa leið`.
6. Expected: Ferðaveðrið result loads, no `Valin leið fannst ekki`, timing reflects the
   shorter ~45 min trip rather than 57 min.
7. Regression: `Garðabær → Selfoss` and `Garðabær → Akureyri` should still work normally.

**If staticDuration does not significantly change the Þrengslavegur duration:**
Google may not return `staticDuration` for via-waypoint requests, or the static estimate for
Route 39 may still be around 55 min. In that case, the next diagnostic step is a controlled
comparison with `routingPreference: 'TRAFFIC_UNAWARE'` (separate handoff, requires approval).

## Commit scope note (from Codex v208)

When Stebbi approves commit, stage only the TODO-067 implementation files. Do not accidentally
include unrelated TODO-069 / SQL / handoff files. The TODO-067 files are:

- `lib/weather/google.server.ts`
- `lib/weather/provider.types.ts`
- `components/weather/PlaceSearch.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/place/search/route.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-google.test.ts`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/place-search-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
