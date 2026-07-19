# 2026-07-19 09:24 - TODO 086 v186 - Claude: self-registering route-memory places

Created: 2026-07-19 09:24
Timezone: Atlantic/Reykjavik

## Context

Implementation of v186 architecture as described in:
`ai-handoff/2026-07-19-0857-todo-086-v186-codex-route-memory-self-registering-places.md`

Post-release hardening. Released earlier today as commit `62678be`.

## What was done

### 1. `lib/iceland-routes/routePlaceNormalization.ts` — generic parser

Added `slugifyPlaceKey()` and `extractLocality()` helpers. Changed `normalizePlaceForMemory()` to a three-stage resolution:

1. Alias table (`PLACE_NORM_ENTRIES`) — checked first, wins for known/variant spellings.
2. Generic address parser on `formattedAddress` — splits by comma, strips country/postal prefix, skips street-like parts containing digits, returns first locality.
3. Name itself — if not street-like and not a country label, used directly.

The alias table is no longer the gatekeeper. Any valid Icelandic public locality self-registers.

`slugifyPlaceKey` maps Icelandic diacritics consistently: á→a, ð→d, é→e, í→i, ó→o, ú→u, ý→y, þ→th, æ→ae, ö→o.

### 2. `lib/__tests__/route-place-normalization.test.ts` — updated tests

- Updated "returns null for unknown town" → `Sandgerði` now self-registers as `{ key: 'sandgerdi', label: 'Sandgerði' }`.
- Updated "returns null for street address with unknown locality" → `Strandvegur 4, Sandgerði` now returns `{ key: 'sandgerdi', label: 'Sandgerði' }`.
- Added tests for postal-prefix stripping (`470 Þingeyri, Iceland` → `thingeyri`).
- Added `slugifyPlaceKey` test suite.
- Added `slugifyPlaceKey` to imports.

### 3. `lib/__tests__/weather-travel-api.test.ts` — test expectation updated

The route-memory write block in `route.ts` now executes for both Garðabær and Þorlákshöfn (both normalize with generic parser). This means `mockMatchProviderPoints` is called twice instead of once. Updated the expectation and comment to reflect the correct behavior.

### 4. `app/api/teskeid/weather/route-memory/place-focus/route.ts` — new API

`GET /api/teskeid/weather/route-memory/place-focus?placeKey=siglufjordur`

Returns endpoint station IDs derived from existing SQL 86 route-memory rows:
- Routes where `from_place_key = placeKey`: first station per provider per route (lowest `route_order` = departure end).
- Routes where `to_place_key = placeKey`: last station per provider per route (highest `route_order` = arrival end).
- Deduplicates across all matching routes.

Output: `{ vedurstofanStationIds: string[], vegagerdinStationIds: string[] }`

No new Google calls. No new schema.

### 5. `middleware.ts` — added `/place-focus` to public paths

`/api/teskeid/weather/route-memory/place-focus` added to `EXACT_PUBLIC_PATHS`.

### 6. `components/weather/RouteMemoryPicker.tsx` — callback type changed

- `RouteMemoryPlace` interface is now exported.
- `onPlacesChange` type changed from `(from: RouteDraftPlace | null, to: RouteDraftPlace | null)` to `(from: RouteMemoryPlace | null, to: RouteMemoryPlace | null)`.
- Removed `toRouteDraftPlace()` helper and all `getCanonicalPlace` / `RouteDraftPlace` dependencies.
- All handlers pass `RouteMemoryPlace` directly — no coord lookup, no Reykjavík fallback.

### 7. `components/weather/WeatherOverviewClient.tsx` — coord-free filtering

- Removed `findNearestStations` import entirely.
- `fromPlaceDraft`/`toPlaceDraft` (`RouteDraftPlace`) replaced by `fromMemoryPlace`/`toMemoryPlace` (`RouteMemoryPlace`).
- Route-memory lookup now passes only `fromName: label, toName: label` (no `formattedAddress`).
- Single-place filter: replaced haversine nearest-station useMemos with `placeFocusIds` state + useEffect calling `/place-focus`. Both Veðurstofan and Vegagerðin single-place filters now use the API response.
- `visibleStatuses` effect: dep changed from `fromPlaceDraft?.lat/lon` to `fromMemoryPlace?.key`.
- Draft write: uses `getCanonicalPlace()` for known seeded places; if either place is not in canonical, draft is cleared (not written with 0,0 coords). `activeTripHref` only includes `?routeDraft=1` when canonical coords are available for both places.

## Architecture: what changed vs v186 plan

Everything from the plan was implemented. No new migrations needed.

The FerðalagidClient prefill (`?routeDraft=1`) still only works for places in the canonical seed list (`routePlaces.ts`). For unknown places (e.g. Sandgerði, Þingeyri), the draft is intentionally not written — the user lands on an empty FerðalagidClient and enters the route manually. This is safe and avoids passing 0,0 coords to Google Routes.

`routePlaces.ts` and `PLACE_NORM_ENTRIES` remain as optional seed/aliases, not as gatekeepers.

## Test results

- `lib/__tests__/route-place-normalization.test.ts`: 28/28 passed.
- `lib/__tests__/weather-travel-api.test.ts`: 24/24 passed (expectation updated).
- `npm run type-check`: clean.
- `npm run build`: successful.

## Localhost checks for Stebbi

1. In `/ferdalagid`, calculate a route to a place NOT in `routePlaces.ts` (e.g. Sandgerði, Þorlákshöfn, Þingeyri, Flateyri).
2. Return to `/vedrid`.
3. Expected: the new place appears in `Skoða veðrið á ákveðinni leið` without any code change.
4. Select only that place.
   - Expected: map filters to endpoint station(s) from route-memory (no haversine guess, no Reykjavík fallback).
   - Expected: no station card auto-opens.
5. Select the counterpart place.
   - Expected: map filters to exact stored provider station IDs for that route.
6. Click `Ferðalagið`.
   - Expected: for known seeded places → `/ferdalagid?routeDraft=1` with pre-filled origin/destination.
   - Expected: for unknown places → `/ferdalagid` without draft marker (user fills in manually).
7. Network tab on `/vedrid`:
   - Expected: only `/api/teskeid/weather/route-memory/*` for route picker/filtering.
   - Expected: `/place-focus?placeKey=...` when a single place is selected.
   - Expected: no Google call from the overview picker.

## Privacy

- No raw street addresses stored.
- No exact home/user coordinates stored.
- No raw Google geometry stored.
- `slugifyPlaceKey` produces only ASCII locality keys from public place names.

## Files changed

- `lib/iceland-routes/routePlaceNormalization.ts` — generic parser
- `lib/__tests__/route-place-normalization.test.ts` — updated tests
- `lib/__tests__/weather-travel-api.test.ts` — expectation fix
- `app/api/teskeid/weather/route-memory/place-focus/route.ts` — new API
- `middleware.ts` — new public path
- `components/weather/RouteMemoryPicker.tsx` — RouteMemoryPlace type export, coord-free callback
- `components/weather/WeatherOverviewClient.tsx` — place-focus integration, removed haversine
