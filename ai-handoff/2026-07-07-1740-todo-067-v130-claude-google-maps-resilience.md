# Handoff: todo-067 v130 — Claude Google Maps resilience pass

**Date:** 2026-07-07 17:40
**From:** Claude (Sonnet 4.6)
**To:** Codex or next Claude session
**Branch:** main (uncommitted)

---

## What was done

Implemented the full P1 resilience pass from Codex v130.

---

### 1. Server-side place search BFF (`app/api/place/search/route.ts`) — NEW

`GET /api/place/search?q=...`

- Auth + `vedrid` feature gate (same pattern as travel/reverse-geocode routes)
- Rate limit: 30 req / 60s per IP (in-memory, best-effort)
- In-memory cache: 10-minute TTL per normalized query
- Validates `q`: min 2, max 100 chars → 400 + `{ results: [] }`
- Calls `getWeatherMapProvider()` → `provider.geocodePlace(q)`
- Filters results with `validateIcelandicCoords` (only Iceland in bounding box)
- Returns `{ results: PlaceResult[] }` — no Google key or raw provider data exposed
- Provider missing → 503; provider throws → 503

---

### 2. PlaceSearch fallback (`components/weather/PlaceSearch.tsx`) — REWRITTEN

New unified `SearchSuggestion` discriminated union type:
```ts
type SearchSuggestion =
  | { source: 'google'; label: string; raw: google.maps.places.AutocompleteSuggestion }
  | { source: 'server'; label: string; place: PlaceResult }
```

Search flow:
1. Try Google Places JS with 4-second timeout (`Promise.race`)
2. On any failure/timeout: set `googleUnavailableRef.current = true` and fall to server BFF
3. Once Google is marked unavailable in this component instance, stay on server fallback for subsequent keystrokes (avoids repeated 403 spam)
4. If both fail: set `fetchError` → shows `errorAllProviders` key

Selection:
- `source === 'google'`: uses existing `fetchFields` flow for lat/lon
- `source === 'server'`: calls `onPlaceSelected(suggestion.place)` directly (lat/lon already present)

No user-visible "Google is broken" message — silent fallback when server results are returned.

---

### 3. RouteSelectionStep map error state (`components/weather/RouteSelectionStep.tsx`)

- Added `const [mapError, setMapError] = useState(false)`
- Map init `catch` now sets `setMapError(true)` (with `cancelled` guard)
- UI: shows `routeMapUnavailable` message in map box instead of infinite loading overlay
- Loading overlay only shows when `!mapLoaded && !mapError`
- Confirm button still works when origin + destination are selected

---

### 4. TravelAuditMap static image `onError` (`components/weather/TravelAuditMap.tsx`)

- Added `const [staticMapFailed, setStaticMapFailed] = useState(false)`
- Static image now has `onError={() => setStaticMapFailed(true)}`
- When static image fails: re-renders to `auditMapUnavailable` text fallback
- Text fallback explains: result is still correct, map is only a visual layer

---

### 5. Messages

New keys added in both locales:

`teskeid.vedrid.placeSearch`:
- `errorAllProviders` — shown when both Google and server BFF fail

`teskeid.vedrid.ferdalagid`:
- `routeMapUnavailable` — shown in route selection map box when Google Maps JS fails
- `auditMapUnavailable` — shown in result map when both JS map and static image fail

---

### 6. Tests (`lib/__tests__/place-search-api.test.ts`) — NEW (9 tests)

Covers:
- 404 when `AUTH_MVP_ENABLED` not true
- 401 when unauthenticated
- 404 when no `vedrid` feature access
- 400 for too-short query
- 400 for missing query
- 503 when provider not configured
- 200 with normalized results for valid query
- Non-Iceland coords filtered out
- 503 when provider throws (uses distinct query to avoid module-level cache hit)

---

## Test results

- `npm run type-check` — clean
- `npm run test:run` — 1769 passed / 27 skipped / 8 todo (54 files)

Previous baseline: 1759. +10 new tests.

---

## Files changed

```
app/api/place/search/route.ts               — NEW: server-side place search BFF
components/weather/PlaceSearch.tsx          — fallback: Google → server BFF with timeout
components/weather/RouteSelectionStep.tsx   — mapError state, error overlay
components/weather/TravelAuditMap.tsx       — staticMapFailed state, image onError
messages/is.json                            — errorAllProviders, routeMapUnavailable, auditMapUnavailable
messages/en.json                            — same keys in English
lib/__tests__/place-search-api.test.ts      — NEW: 9 API route tests
```

---

## Production acceptance criteria (from Codex v130) — met

- If `loadPlacesLibrary()` fails → falls back to BFF, user still gets search results
- If Google JS map fails in RouteSelectionStep → no infinite loading, map box shows message
- User can still confirm origin + destination without interactive map
- If TravelAuditMap static image fails → text fallback shown, result not hidden
- Server key never sent to client
- No changes to weather thresholds, route logic, or deterministic weather model

---

## Localhost test suggestions for Stebbi

1. Block `maps.googleapis.com` in DevTools Network → place search should still return results via server BFF
2. Block both `maps.googleapis.com` and `places.googleapis.com` → route selection map should show `routeMapUnavailable` message instead of hanging
3. With Google blocked: verify confirm button still works when origin + destination are typed
4. Verify `/api/place/search?q=reykjavik` returns results in browser after logging in with `vedrid` access

## Note: `GOOGLE_MAPS_SERVER_KEY` + Geocoding API

The `/api/place/search` endpoint uses `provider.geocodePlace()` which calls the Google Geocoding REST API with `GOOGLE_MAPS_SERVER_KEY`. Verify this key has **Geocoding API** enabled in Google Cloud Console (it is already needed for the `travel` route geometry endpoint).
