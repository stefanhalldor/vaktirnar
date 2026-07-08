# TODO-067 v198 - Claude handoff - SHORTER_DISTANCE live, sorted routes

Created: 2026-07-08 13:13
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review and explicit commit/push approval.

## What shipped

### `lib/weather/google.server.ts`

**`requestedReferenceRoutes: ['SHORTER_DISTANCE']`** added to `getRouteOptions` request body — no feature flag, always-on per Stebbi's instruction.

**`routes.routeToken`** added to field mask (required by Google for shorter-distance routes).

**Sort by `durationS` ascending** — fastest route is always first. Previously the sort only happened in the routes API handler; now it also happens in the provider itself, so the order is guaranteed regardless of which endpoint calls `getRouteOptions`.

**Deduplication by geometry fingerprint with label merging** — if Google returns the same route geometry under both `DEFAULT_ROUTE` and `SHORTER_DISTANCE` labels, it is kept once with both labels merged. Dev diagnostic log shows when this happens.

Updated dev diagnostic to show `rawRouteCount` (before dedup) and `dedupedRouteCount` (after), plus `labels` per route.

### `messages/is.json` + `messages/en.json`

New key: `routeOptionShorterDistance` — IS `"Styttri leið"`, EN `"Shorter distance"`.

### `components/weather/RouteSelectionStep.tsx`

Updated label logic:

```
idx === 0                → "Fljótlegasta leið"   (always fastest after sort)
labels includes SHORTER_DISTANCE (not idx 0) → "Styttri leið"
isDefault               → "Sjálfgefin Google-leið"
otherwise               → "Önnur leið"
```

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 58 files, 1888 passed, 27 skipped, 8 todo — all green
```

## Tests added (5 new in `weather-google.test.ts`)

- `routes are sorted by durationS ascending — fastest first`
- `includes requestedReferenceRoutes SHORTER_DISTANCE in body`
- `includes routes.routeToken in field mask`
- `SHORTER_DISTANCE route appears as a distinct option when geometry differs`
- `SHORTER_DISTANCE route is deduplicated when geometry matches DEFAULT_ROUTE and labels are merged`

Also fixed 2 existing tests that assumed `results[0]` was `DEFAULT_ROUTE` — they now find by label content rather than index, which is correct after sorting.

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

## Localhost checks for Stebbi

**Primary check — Þorlákshöfn:**

1. Open `/auth-mvp/vedrid` on localhost.
2. Clear both fields.
3. Type `Garðabær`, pick Google suggestion.
4. Type `Þorlákshöfn`, pick Google suggestion.
5. Check Next.js terminal for `[weather/google] getRouteOptions diagnostics` — expected:
   - `"originType": "placeId"`, `"destType": "placeId"`
   - `rawRouteCount: 2` or more (if SHORTER_DISTANCE returned something new)
   - Route with `"labels": ["SHORTER_DISTANCE"]` if Google found a distinct shorter route
6. In route picker — does `Styttri leið` appear as a second option?
7. If yes: does the map follow a different path than Route 427? Is the distance/duration plausible (expect ~51 km / ~42 min for Route 39)?
8. Select `Styttri leið` and continue through the wizard to confirm no `Valin leið fannst ekki` error.

**Normal route regression checks:**

9. `Garðabær -> Selfoss` — confirm no weird local-road route appears alongside the normal option.
10. `Garðabær -> Akureyri` — same check.
11. Any long route where Route 427 style shortcutting would be obviously wrong.

**If `rawRouteCount` is still 1 in the terminal:**
Google did not return a SHORTER_DISTANCE route for this query. This means the `SHORTER_DISTANCE` feature is experimental and did not fire for Þorlákshöfn. Next step would be a curated corridor fallback (separate handoff, requires Stebbi approval).

**If `rawRouteCount` is 2 and `dedupedRouteCount` is 1:**
Google returned SHORTER_DISTANCE but it had the same geometry as the standard route — deduplicated with merged labels. Same result in the UI.
