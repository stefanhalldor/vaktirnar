# TODO #67 Vedrid - Phase D: saved/recent places shipped (prerelease)

Created: 2026-07-07 22:15
From: Claude Code
To: Stebbi and Codex
Status: Prerelease. Type-check clean. All 58 test files pass (1845 tests). Not committed. Awaiting Stebbi permission to commit and push.

## What was done

Phase D (saved/recent route places for Ferðaveðrið) is fully implemented.

### New files

- **`sql/69_weather_saved_places.sql`** — migration (NOT run; Stebbi runs migrations himself)
- **`lib/weather/savedPlaces.ts`** — shared types and helpers (`SavedWeatherPlace`, `makeWeatherPlaceKey`, `normalizeSavedPlaceInput`, `savedPlaceToRoutePlace`)
- **`app/api/teskeid/weather/saved-places/route.ts`** — GET + POST handlers
- **`app/api/teskeid/weather/saved-places/[id]/route.ts`** — DELETE handler
- **`lib/__tests__/sql-saved-places.test.ts`** — 16 static SQL checks
- **`lib/__tests__/weather-saved-places-api.test.ts`** — 18 API tests

### Modified files

- **`components/weather/PlaceSearch.tsx`** — destructures `savedPlaces?` and `onDeleteSavedPlace?` props; renders "Nýlegir staðir" list when input is empty
- **`components/weather/RouteSelectionStep.tsx`** — imports `SavedPlace` type; adds `savedPlaces?` + `onDeleteSavedPlace?` props; passes to both origin and destination PlaceSearch instances
- **`app/auth-mvp/vedrid/FerdalagidClient.tsx`** — fetches saved places on mount; `savePlaceBestEffort` (POST + refresh); `handleDeleteSavedPlace` (optimistic remove + DELETE); `handleOriginSelected` now wraps `setOrigin` + save; `handleDestinationSelected` now also saves; RouteSelectionStep receives `savedPlaces` + `onDeleteSavedPlace`

## Key design decisions

- **Saved places are optional props** throughout `PlaceSearch` and `RouteSelectionStep`. Existing callers outside Ferðaveðrið are unaffected.
- **Ferry port selections are NOT auto-saved.** Only explicit PlaceSearch selections trigger a save.
- **Coordinate-based dedup key** (`lat.toFixed(5):lon.toFixed(5)`) computed server-side. Repeated selection of the same location increments `usage_count` and bumps `last_used_at`.
- **Server-side row cap: 50 per user.** Enforced in POST handler after upsert by deleting oldest rows beyond cap.
- **Display limit: 12.** Returned by GET handler ordered by `last_used_at DESC`.
- **RLS is the hard boundary.** All four policies use `user_id = auth.uid()`. No anonymous access. API uses authenticated Supabase client.
- **Best-effort throughout.** Fetch on mount, save on selection, and delete all catch silently. Saved places never block UX.
- **Optimistic delete.** Local state updated immediately; DELETE request is fire-and-forget.
- **Save + refresh.** After POST succeeds, list is re-fetched to show updated recency/usage_count order.

## Migration

`sql/69_weather_saved_places.sql` must be applied to Supabase before the feature works end-to-end. Stebbi applies all migrations himself. The migration:
- Creates `public.weather_saved_places` with lat/lon/name/usage_count constraints
- Enables RLS; grants only to `authenticated` and `service_role`
- Creates index on `(user_id, last_used_at DESC)`
- Creates `updated_at` trigger (reuses `public.teskeid_set_updated_at()`)
- Wraps in BEGIN/COMMIT

## Test results

```
Test Files  58 passed (58)
Tests       1845 passed | 27 skipped | 8 todo (1880)
```

Type-check: clean (`npx tsc --noEmit` exits 0).

## What is NOT done yet

- Migration has not been applied (Stebbi runs it)
- No localhost verification of the saved-places UI (Stebbi should verify after migration is applied)
- TODO.md has not been updated

## Uncommitted changes

```
M  TODO.md
M  app/auth-mvp/vedrid/FerdalagidClient.tsx
M  components/weather/PlaceSearch.tsx
M  components/weather/RouteSelectionStep.tsx
M  messages/en.json
M  messages/is.json
?? app/api/teskeid/weather/saved-places/
?? lib/__tests__/sql-saved-places.test.ts
?? lib/__tests__/weather-saved-places-api.test.ts
?? lib/weather/savedPlaces.ts
?? sql/69_weather_saved_places.sql
```

## Localhost checks for Stebbi (after migration is applied)

1. Sign in to `/auth-mvp/vedrid` with `vedrid` access.
2. Open Ferðaveðrið wizard. Click the origin field. Expected: shows "Nýlegir staðir" section if any places exist, empty otherwise.
3. Search for and select a place (e.g., Selfoss). Expected: place is saved silently in background.
4. Start a new trip. Click origin or destination field. Expected: Selfoss appears under "Nýlegir staðir".
5. Click a saved place. Expected: it is selected immediately without typing.
6. Click the X button next to a saved place. Expected: row disappears immediately (optimistic). Next mount confirms removal.
7. Select `Vestmannaeyjar` as destination. Pick `Landeyjahöfn`. Expected: ferry port is NOT saved to recent places. Only explicit PlaceSearch selections appear.
8. Sign in with a second user account. Verify that the first user's saved places are NOT visible.

## Codex prerelease checklist

- [ ] Type-check passes (`npx tsc --noEmit`)
- [ ] All tests pass (`npx vitest run`)
- [ ] Migration file is syntactically sound and has BEGIN/COMMIT
- [ ] `savedPlaces` props are optional and do not break existing PlaceSearch callers
- [ ] Ferry port selections cannot end up in saved places
- [ ] RLS policies are correct (select/insert/update/delete all use `user_id = auth.uid()`)
- [ ] Row cap is enforced server-side in POST handler
- [ ] `place_key` is always computed server-side, never trusted from client body
- [ ] Optimistic delete is safe if DELETE fails (list refreshes on next mount)
