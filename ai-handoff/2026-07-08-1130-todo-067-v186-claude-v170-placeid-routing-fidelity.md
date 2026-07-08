# TODO-067 v186 - Claude handoff - v170 Place ID routing fidelity

Created: 2026-07-08 11:30
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## What was done

Implemented Place ID routing fidelity end-to-end (v170 from Codex handoff `2026-07-08-0625`).

## Goal recap

Google Routes was receiving raw `latLng` waypoints instead of Place IDs. This can cause Google to snap to a different road approach than Google Maps consumer UI, explaining why Teskeið showed the longer Route 427 to Þorlákshöfn instead of the shorter Route 39.

## Changes

### `lib/weather/provider.types.ts`

Added `description?: string` to `RouteOption`.

### `lib/weather/google.server.ts`

**`waypointFor` helper (new):**

```ts
function waypointFor(candidate: PlaceCandidate): Record<string, unknown> {
  if (
    candidate.placeId &&
    candidate.placeId !== 'confirmed' &&
    candidate.placeId !== 'curated'
  ) {
    return { placeId: candidate.placeId }
  }
  return { location: { latLng: { latitude: candidate.lat, longitude: candidate.lon } } }
}
```

Real Google Place IDs use `{ placeId }`. Curated/saved/manual places without a real ID fall back to `{ location: { latLng } }`.

**`getRouteGeometry` and `getRouteOptions`:**

- `origin`/`destination` now use `waypointFor(from/to)` instead of hardcoded `latLng`
- Added `routingPreference: 'TRAFFIC_AWARE'` to align with Google Maps "Leave now" behaviour
- Added `routes.description` to both field masks
- `getRouteOptions` now includes `description: route.description` in the returned `RouteOption`

### `components/weather/PlaceSearch.tsx`

- Added `placeId?: string` to `PlaceResult`
- Google selection path: `place.id` is available immediately after `toPlace()` (no extra `fetchFields` call needed); included as `placeId: place.id ?? undefined`
- Server fallback: `PlaceResult` now has `placeId?`, so it passes through automatically from the API response

### `app/api/place/search/route.ts`

- Added `placeId?: string` to `PlaceSearchResult`
- Maps `c.placeId || undefined` so falsy place IDs (empty string) become `undefined`

### `components/weather/RouteSelectionStep.tsx`

- Added `placeId?: string` to `RoutePlace`
- `handleOriginSelected`/`handleDestinationSelected` now pass `p.placeId` through
- Route option buttons show `ro.description` as a secondary line when Google provides it

Example route card with description:
```
Fljótlegasta leið
via Þrengslavegur/Route 39
51 km               42 mín.
```

### No changes needed to

- `FerdalagidClient.tsx` — `origin`/`destination` are serialized as-is via `JSON.stringify`; `placeId` flows through automatically once `RoutePlace` has it
- `/api/teskeid/weather/travel/routes/route.ts` — already accepts optional `placeId` in `validateConfirmedPlace`
- `/api/teskeid/weather/travel/route.ts` — already accepts optional `placeId` and passes it to `PlaceCandidate`
- Saved places — continue to work via coordinates; no SQL changes

## How Place ID flows end-to-end

```
User types in PlaceSearch (Google path)
  → AutocompleteSuggestion.toPlace()
  → place.fetchFields(['displayName', 'formattedAddress', 'location'])
  → place.id (Place ID, always available without fetching)
  → onPlaceSelected({ ..., placeId: place.id })
  → RouteSelectionStep.handleOriginSelected/handleDestinationSelected
  → RoutePlace { ..., placeId }
  → FerdalagidClient state (origin/destination)
  → JSON.stringify body to /api/teskeid/weather/travel/routes
  → validateConfirmedPlace accepts placeId?
  → PlaceCandidate { placeId: origin.placeId ?? 'confirmed' }
  → googleProvider.getRouteOptions(originCandidate, destCandidate)
  → waypointFor(candidate) → { placeId: 'ChIJ...' }
  → Google Routes API receives real Place ID
  → correct road snap (Route 39 for Þorlákshöfn)
```

Server search path (fallback):
```
PlaceSearch → /api/place/search → geocodePlace returns placeId → PlaceSearchResult includes placeId → PlaceResult.placeId → same flow as above
```

Saved places (no Place ID):
```
SavedPlace → onPlaceSelected({ ..., placeId: undefined })
  → RoutePlace { placeId: undefined }
  → PlaceCandidate { placeId: 'confirmed' }
  → waypointFor → { location: { latLng } }  ← falls back gracefully
```

## Tests

Added 11 new tests across two files:

**`lib/__tests__/weather-google.test.ts`** (9 new):
- `getRouteGeometry`: uses `placeId` waypoint for real place ID
- `getRouteGeometry`: falls back to `latLng` for `confirmed`
- `getRouteGeometry`: includes `routingPreference: TRAFFIC_AWARE`
- `getRouteGeometry`: includes `routes.description` in field mask
- `getRouteOptions`: uses `placeId` waypoint for real place ID
- `getRouteOptions`: falls back to `latLng` for `confirmed`
- `getRouteOptions`: includes `routingPreference: TRAFFIC_AWARE`
- `getRouteOptions`: passes `description` through when Google provides it
- `getRouteOptions`: `description` is undefined when not provided

**`lib/__tests__/place-search-api.test.ts`** (2 new):
- includes `placeId` in results when provider returns it
- omits `placeId` when provider returns empty string

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 58 files, 1879 passed, 27 skipped, 8 todo — all green
```

## Files changed

- `lib/weather/provider.types.ts`
- `lib/weather/google.server.ts`
- `components/weather/PlaceSearch.tsx`
- `app/api/place/search/route.ts`
- `components/weather/RouteSelectionStep.tsx`
- `lib/__tests__/weather-google.test.ts`
- `lib/__tests__/place-search-api.test.ts`

## No changes to

- SQL, RLS, auth, Supabase, saved-places schema
- Weather scoring, thresholds, met.no
- Deployment config, env vars

## Localhost checks for Stebbi

Use `/auth-mvp/vedrid`. Ensure Google Maps is enabled.

### Primary regression test

1. Search origin: `Garðabær`
2. Search destination: `Þorlákshöfn` (via Google autocomplete, not saved place)
3. Expected: route options now include a shorter/faster route (Route 39 / Þrengslavegur, ~51 km / ~42 min) as the first option
4. Expected: the old longer Route 427 route (~68 km / ~56 min) may still appear as an alternative
5. Expected: route cards show a description line like `via Þrengslavegur/Route 39` if Google returns it
6. Select the faster route, proceed through wizard
7. Expected: result map follows the selected route

### Secondary checks

8. `Egilsstaðir -> Garðabær` — compare route distances and durations with Google Maps. With `TRAFFIC_AWARE`, durations should be closer to Google Maps "Leave now" times
9. Saved Þorlákshöfn place (if any) — still works, routes by coordinates, no regression
10. `Garðabær -> Selfoss`, `Garðabær -> Akureyri` — confirm no regressions
11. Vestmannaeyjar ferry flow — ferry port is a curated place (`confirmed`), falls back to `latLng`, should still work

### What to watch for

- If `Garðabær -> Þorlákshöfn` still shows only the long route: Google Routes may not differentiate on Place ID alone for this destination. Document whether the description field confirms which route is which. A follow-up curated corridor approach may be needed (v170 section 9).
- If route durations for `Egilsstaðir -> Garðabær` are now closer to Google Maps, `TRAFFIC_AWARE` is working as expected.
- If description is missing from route cards: Google may not return `description` for all routes — this is normal; the label (`Fljótlegasta leið` / `Önnur leið`) still appears.

## Known limitations

- Saved places do not store Place ID — they always route by coordinates. This is by design until a future SQL migration adds `place_id` to `weather_saved_places`.
- `TRAFFIC_AWARE` may increase latency slightly. If Stebbi notices slower route fetching, document it.
- Google Routes API may return fewer alternatives than Google Maps consumer UI — this is an API constraint, not a bug.
