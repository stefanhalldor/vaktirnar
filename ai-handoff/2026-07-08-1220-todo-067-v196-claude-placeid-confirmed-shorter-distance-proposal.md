# TODO-067 v196 - Claude handoff - Place ID confirmed, SHORTER_DISTANCE + saved-place proposal

Created: 2026-07-08 12:20
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Awaiting Codex review and Stebbi implementation approval.

## Diagnostic result — conclusive

Stebbi ran the clean Place ID test (typed Google suggestions, not saved places). All three trace points confirm Place ID routing is active and working end-to-end:

```
[PlaceSearch] selected (google): { name: 'Garðabær', placeId: 'ChIJaTBIxpEM1kgRNmgF...' }
[PlaceSearch] selected (google): { name: 'Þorlákshöfn', placeId: 'ChIJU1N290hC1kgRypBJ...' }

[routes/routes] placeId in request body: {
  origin: 'present (ChIJaTBIxpEM1kgRNmgF)',
  destination: 'present (ChIJU1N290hC1kgRypBJ)'
}

[weather/google] getRouteOptions diagnostics: {
  "originType": "placeId",
  "destType": "placeId",
  "routeCount": 1,
  "routes": [
    {
      "distanceMeters": 67435,
      "durationS": 3471,
      "labels": ["DEFAULT_ROUTE"],
      "description": "Krýsuvíkurvegur og Suðurstrandarvegur/Leið 427"
    }
  ]
}
```

**Conclusion:** Google Routes API, given real Place IDs for Garðabær and Þorlákshöfn with `TRAFFIC_AWARE` + `computeAlternativeRoutes: true`, returns exactly one route: Route 427/Krýsuvíkurvegur, 67.4 km. Route 39/Þrengslavegur does not appear.

This matches the v195 decision table:

> `(google)` with real `placeId`, provider `placeId`, still only Route 427 → **run `SHORTER_DISTANCE` experiment**

---

## Proposed A — `requestedReferenceRoutes: ['SHORTER_DISTANCE']` experiment

### What it does

Google's `computeRoutes` supports `requestedReferenceRoutes: ['SHORTER_DISTANCE']`. When included, Google returns the standard ETA-optimized route(s) plus a shorter-distance reference route labelled `SHORTER_DISTANCE`, if one exists. According to Google docs this feature is Experimental/pre-GA and can prefer local roads or dirt roads when legal, so it should not silently replace the default route.

### Proposed implementation

**`lib/weather/google.server.ts`** — `getRouteOptions` only (not `getRouteGeometry`):

- Add `requestedReferenceRoutes: ['SHORTER_DISTANCE']` to the existing request body.
- Add `routes.routeToken` to the field mask (Google requires this for reference routes per docs).
- Update `RoutesResponse` type and `RouteOption` to handle the extra label (`SHORTER_DISTANCE`).
- Deduplicate: if the `SHORTER_DISTANCE` route has the same fingerprint as a standard alternative, do not add it twice.
- Sort all routes by `durationS` ascending as before.

**`lib/weather/provider.types.ts`** — `RouteOption`:
- `SHORTER_DISTANCE` already flows through `labels[]` (no type change needed).

**`components/weather/RouteSelectionStep.tsx`** — route card labels:
- Add a label case: if `labels` includes `SHORTER_DISTANCE` and no `DEFAULT_ROUTE`, show it as `Styttri leið` (or similar) so Stebbi can visually identify it.

**Tests:**
- Mock response with `SHORTER_DISTANCE` route: verify it appears in sorted options.
- Mock response where `SHORTER_DISTANCE` has same fingerprint as a standard route: verify no duplicate.
- Verify field mask includes `routes.routeToken`.

### Risk

Google docs say `SHORTER_DISTANCE` is Experimental/pre-GA. If it returns a weird local-road route for normal destinations (e.g. Akureyri, Selfoss), we should not ship it globally. Validation by Stebbi on multiple routes is needed before removing any dev-only guard.

### Open question for Codex

Should `SHORTER_DISTANCE` be:
- (a) always-on in `getRouteOptions` and shown as a separate selectable option, or
- (b) dev-only initially (behind `NODE_ENV !== 'production'`) until Stebbi validates it doesn't break normal routes?

Option (b) is safer; option (a) lets us ship the fix immediately if Route 39 appears.

---

## Proposed B — Saved-place `place_id` persistence

Even if SHORTER_DISTANCE fixes the routing, returning users selecting saved/recent Þorlákshöfn will still get Route 427 because saved places have no `placeId`.

### Scope

| File | Change |
|---|---|
| `sql/71_weather_saved_places_place_id.sql` | `ALTER TABLE weather_saved_places ADD COLUMN place_id text;` — nullable, no default, no backfill |
| `lib/weather/savedPlaces.ts` | Add `placeId?: string` to `SavedWeatherPlace`, `SavedWeatherPlaceInput`, `savedPlaceToRoutePlace` |
| `app/api/teskeid/weather/saved-places/route.ts` | GET: include `place_id` in SELECT. POST/upsert: insert `place_id` when present and valid (use same `normalizeOptionalPlaceId` pattern) |
| `app/auth-mvp/vedrid/FerdalagidClient.tsx` | Include `placeId` in `savePlaceBestEffort` payload when present on `RoutePlace` |
| `components/weather/PlaceSearch.tsx` | Saved-place button: pass `placeId` when `SavedPlace` has it (requires `SavedWeatherPlace` to return it) |

**Backward compatibility:** existing rows have `place_id = NULL`, route by coordinates — no change. When user reselects from Google autocomplete, upsert updates the row with the new `place_id`.

### Can be done in parallel or after A

B does not depend on A. Can be implemented before knowing whether SHORTER_DISTANCE works, since it improves routing fidelity for the Google-suggestion path regardless.

---

## Current code state

All changes up to v192 are implemented and tests are green (58 files, 1883 passed). No uncommitted changes pending implementation approval. Diagnostic logging (v192) is still in place.

## No changes to

SQL, RLS, auth, env, Vercel, Supabase, deployment — in any of the above proposals.

## Localhost checks for Stebbi

After implementation (once approved):

1. Clear both fields, type and select Google suggestions for `Garðabær -> Þorlákshöfn`.
2. Expected: route picker shows a second option labelled `Styttri leið` (or `SHORTER_DISTANCE`) if Google returns Route 39.
3. If only Route 427 still appears: SHORTER_DISTANCE did not help for this route — document and move to curated corridor proposal.
4. Test `Garðabær -> Selfoss` and `Garðabær -> Akureyri` — confirm SHORTER_DISTANCE does not add weird local-road routes for normal long destinations.
5. If B is also implemented: select Þorlákshöfn from saved list, confirm terminal now shows `(saved place)` with a real `placeId` after first fresh selection.
