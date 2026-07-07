# Codex review: todo-067 v152 - v151 prerelease plus saved places Supabase/RLS handoff

Created: 2026-07-07 21:42:08
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-07-2136-todo-067-v151-claude-v150-fixes-prerelease.md`
Related TODO: todo-067, Ferðalagið / Veðrið
Reviewed state: uncommitted working tree on `main`

## Findings on v151

1. **Medium - Clicking the already selected ferry port can clear route state without refetching routes.**
   `app/auth-mvp/vedrid/FerdalagidClient.tsx:201-221` clears route options, selected route, fallback state, and result every time a ferry-port button is clicked. The route-fetch effect at `FerdalagidClient.tsx:114-169` only depends on `ferrySelection?.ferryPortId`, not the object identity or a retry token. If the user clicks the same selected port again, the port id does not change, so the effect may not run again after `routeOptions` is cleared. Result: the route choices can disappear and the user may be stuck until another state change.

   Fix: make same-port selection a no-op unless there is a specific reason to reset state:

   ```ts
   if (ferrySelection?.ferryPortId === portId) return
   ```

   Or, if reselecting the same port should force refresh, increment `routeRetryCount` after clearing route state. The no-op is simpler and safer.

2. **Low - Direct line to Vestmannaeyjar before ferry-port selection is now an explicit product decision.**
   v150 recommended not drawing that line. v151 says Stebbi accepted it. That is fine, but keep the ferry copy prominent because the map can otherwise imply Teskeið is evaluating the sea leg. This is not a blocker because the product owner explicitly accepted the behavior.

3. **Low - v151 handoff says "Tvær nýjar negative tests" but lists three.**
   The code itself is fine; this is only handoff copy drift. No implementation change required unless Claude wants to clean the wording in a future handoff.

## What looked good in v151

- The trust-critical stale-result issue from v150 is mostly fixed: changing from Landeyjahöfn to Þorlákshöfn clears `result`, `error`, heatmap selections, explainer/details state, and submitted thresholds.
- `isVestmannaeyjarDestination` is now coordinate-only, which avoids mainland text false positives.
- New tests cover mainland coordinates that contain `Vestmannaeyjar` or `Heimaey` in text fields.
- The unused `ferryCheckHerjolfurNote` key was removed from both locale files.
- No SQL, Supabase changes, env changes, commit, push, or deployment were made by Claude in v151.

## Commands run by Codex

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 260`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-07-2136-todo-067-v151-claude-v150-fixes-prerelease.md'`
- `git status --short`
  - Exit code: 0.
  - Shows v151 changes plus prior Codex `TODO.md` and handoff files.
- `git diff --check`
  - Exit code: 0.
  - CRLF warnings only for `TODO.md` and `messages/is.json`.
- `npm run type-check`
  - Exit code: 0.
- `npm run test:run`
  - Exit code: 0.
  - 56 passed test files, 1809 passed tests, 27 skipped, 8 todo.

## Files inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `ai-handoff/2026-07-07-2136-todo-067-v151-claude-v150-fixes-prerelease.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/weather/PlaceSearch.tsx`
- `lib/weather/ferryPorts.ts`
- `lib/__tests__/ferryPorts.test.ts`
- `app/api/place/search/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/admin.ts`
- `lib/loans/guard.ts`
- `lib/auth/guard.ts`
- `sql/41_profiles_select_own.sql`
- `sql/54_relationships.sql`
- `sql/67_weather_cache.sql`
- `sql/68_feature_access_vedrid.sql`
- `messages/is.json`
- `messages/en.json`

## Required v151 fix before release

Claude Code should fix the same-port click edge case before Stebbi treats Phase C as prerelease-ready.

Minimum fix:

- In `handleFerryPortSelected`, return early when `ferrySelection?.ferryPortId === portId`.
- Add a unit/component test if feasible, or include an explicit localhost check:
  - Choose `Reykjavík -> Vestmannaeyjar`.
  - Choose `Landeyjahöfn`.
  - Click `Landeyjahöfn` again.
  - Route options should remain visible and selected route should not disappear.

## Saved Places - Supabase/RLS handoff for Claude Code

### Goal

Implement saved/recent weather places for signed-in users so `Frá` and `Til` fields can show previously selected places by default when the user opens the field, and each saved place can be deleted with an `X`.

This is for weather route selection only. It should not become a global address book yet.

### Product behavior

1. When a signed-in user selects a place in `Frá` or `Til`, save that confirmed place for that user.
2. When the user later focuses or opens either `Frá` or `Til`, show saved places before typing/searching.
3. The saved list should be usable with one tap/click.
4. Each saved place row should have an `X` delete action.
5. Deleting a saved place removes it for that user only.
6. If Google Maps/Places is flaky, saved places should still render because they come from Supabase.
7. Do not save system-selected ferry ports automatically. If user searches/selects `Landeyjahöfn` manually, that is fine, but Herjólfur port choice should not pollute saved places by itself.

### Privacy and security stance

Saved places can reveal home, work, family, or travel patterns. Treat this as private user data.

Rules:

- No anonymous access.
- No cross-user reads.
- No public API returning another user's places.
- No service-role use in the normal user flow unless there is a very specific reason.
- Use Supabase RLS as the hard data boundary.
- API routes may exist for validation and feature-gating, but they should use the regular authenticated Supabase server client so RLS is exercised.

### Migration

Create a new migration:

`sql/69_weather_saved_places.sql`

Recommended schema:

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.weather_saved_places (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_key         text NOT NULL,
  name              text NOT NULL,
  formatted_address text NOT NULL DEFAULT '',
  lat               double precision NOT NULL,
  lon               double precision NOT NULL,
  usage_count       integer NOT NULL DEFAULT 1,
  last_used_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT weather_saved_places_place_key_check CHECK (
    place_key = lower(trim(place_key))
    AND place_key <> ''
    AND char_length(place_key) <= 220
  ),
  CONSTRAINT weather_saved_places_name_check CHECK (
    trim(name) <> ''
    AND char_length(name) <= 160
  ),
  CONSTRAINT weather_saved_places_formatted_address_check CHECK (
    char_length(formatted_address) <= 300
  ),
  CONSTRAINT weather_saved_places_usage_count_check CHECK (usage_count >= 1),
  CONSTRAINT weather_saved_places_lat_check CHECK (lat BETWEEN 62 AND 68),
  CONSTRAINT weather_saved_places_lon_check CHECK (lon BETWEEN -26 AND -11),
  UNIQUE (user_id, place_key)
);

CREATE INDEX IF NOT EXISTS weather_saved_places_user_last_used_idx
  ON public.weather_saved_places (user_id, last_used_at DESC);

CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

ALTER TABLE public.weather_saved_places ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weather_saved_places FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_saved_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_saved_places TO service_role;

DROP POLICY IF EXISTS "weather_saved_places_select_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_select_own"
  ON public.weather_saved_places
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_insert_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_insert_own"
  ON public.weather_saved_places
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_update_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_update_own"
  ON public.weather_saved_places
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weather_saved_places_delete_own" ON public.weather_saved_places;
CREATE POLICY "weather_saved_places_delete_own"
  ON public.weather_saved_places
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMIT;
```

Notes:

- `place_key` should be computed in TypeScript from coordinates, not trusted from the client. Recommended: `lat.toFixed(5) + ':' + lon.toFixed(5)`.
- Coordinates are the dedupe key because `PlaceSearch` does not currently return a stable Google `placeId`.
- If Claude Code chooses to add `placeId` later, keep it optional and do not make it the MVP dependency.
- Do not run this migration without explicit permission from Stebbi.

### API routes

Create routes under:

- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`

Use the same auth and feature-gate pattern as weather APIs:

1. `AUTH_MVP_ENABLED === 'true'`
2. `createClient()` from `@/lib/supabase/server`
3. `supabase.auth.getUser()`
4. require `user.email`
5. `checkFeatureAccess(user.id, user.email, 'vedrid')`
6. use that same `supabase` client for table reads/writes so RLS applies

Endpoints:

- `GET /api/teskeid/weather/saved-places`
  - Returns latest saved places for the current user.
  - Order by `last_used_at desc`.
  - Limit to 12 or 20; choose one and document it.
- `POST /api/teskeid/weather/saved-places`
  - Body: `{ name, formattedAddress, lat, lon }`
  - Validate with `validateIcelandicCoords`.
  - Trim and length-check strings.
  - Server computes `place_key`.
  - If existing row found for current user and key, update `name`, `formatted_address`, `lat`, `lon`, `last_used_at`, and increment `usage_count`.
  - Else insert new row with `user_id = user.id`.
  - Race handling: if insert hits unique conflict, select existing row and update it.
- `DELETE /api/teskeid/weather/saved-places/[id]`
  - Delete by id through authenticated Supabase client.
  - RLS ensures only own rows can be deleted.
  - Return 204 or `{ ok: true }`.

Do not expose raw database errors to the client. Log generic server errors without place names or addresses.

### TypeScript helpers

Add a small server/client-safe helper module, for example:

`lib/weather/savedPlaces.ts`

Responsibilities:

- `type SavedWeatherPlace`
- `type SavedWeatherPlaceInput`
- `normalizeSavedPlaceInput`
- `makeWeatherPlaceKey(lat, lon)`
- `savedPlaceToRoutePlace(row)`

Keep validation duplicated server-side where needed. Do not trust client-normalized data.

### Client integration

Modify `FerdalagidClient` and/or `RouteSelectionStep` carefully:

1. Fetch saved places once when the weather route wizard mounts.
2. Store them in local state.
3. Pass them into `RouteSelectionStep`.
4. `RouteSelectionStep` passes them into `PlaceSearch` or renders them directly above `PlaceSearch`.
5. When `onOriginSelected` or `onDestinationSelected` receives a confirmed place:
   - update current field state immediately
   - fire a best-effort save request
   - update saved places locally from response if successful
   - do not block the route flow if saving fails
6. When user deletes a saved place:
   - optimistically remove locally
   - call DELETE
   - if DELETE fails, restore or refetch list

UI behavior:

- Saved places should show when input is empty/focused.
- Suggested heading: `Nýlegir staðir`.
- Row layout: place name, optional muted formatted address, `X` icon button.
- The row click selects the place.
- The `X` must not also select the row; use `event.stopPropagation()`.
- Delete icon needs `aria-label`, e.g. `Eyða vistuðum stað`.
- Avoid nested cards. Use simple list rows inside the existing search flow.
- Keep mobile input font at 16 px as current `PlaceSearch` does.

### Messages

Add all user-facing text to `messages/is.json` and `messages/en.json`, likely under `teskeid.vedrid.placeSearch` or `teskeid.vedrid.ferdalagid`.

Suggested Icelandic:

- `savedPlacesTitle`: `Nýlegir staðir`
- `savedPlaceDelete`: `Eyða vistuðum stað`
- `savedPlacesUnavailable`: `Náði ekki að sækja vistaða staði.`
- `savedPlaceSaveFailed`: `Náði ekki að vista staðinn.`

Do not show noisy save failure text during normal route selection unless it materially affects the user. Saving should be helpful, not a new blocker.

### Tests

Add tests before considering this done:

1. SQL static test:
   - Migration creates `public.weather_saved_places`.
   - RLS is enabled.
   - `anon` has no grant.
   - authenticated policies use `user_id = auth.uid()`.
   - insert policy has `WITH CHECK (user_id = auth.uid())`.
   - update policy has both `USING` and `WITH CHECK`.
   - delete policy has `USING`.
2. API tests:
   - unauthenticated GET/POST/DELETE rejected.
   - feature-denied user gets 404.
   - invalid coordinates rejected.
   - valid POST sets `user_id` server-side and does not trust body `user_id`.
   - DELETE uses id and authenticated client; no service-role path.
3. Component/client tests if feasible:
   - saved places render before typing.
   - clicking saved place selects it.
   - clicking delete does not select it.
   - save failure does not block route progression.

Run:

- `npm run type-check`
- `npm run test:run`

### Preflight before migration is ever run

Do not run these without Stebbi explicitly approving Supabase read-only checks.

Read-only preflight:

```sql
SELECT to_regclass('public.weather_saved_places') AS existing_table;

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'weather_saved_places'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'weather_saved_places'
ORDER BY grantee, privilege_type;
```

Expected before migration:

- table does not exist
- no policies
- no grants

Expected after migration:

- table exists
- four own-user policies
- authenticated has select/insert/update/delete
- anon has no access

### Rollback plan

If no production data matters yet:

```sql
DROP TABLE IF EXISTS public.weather_saved_places;
```

If production data exists:

1. Stop app writes first by deploying code that hides saved places or disables the API.
2. Export rows if Stebbi wants to preserve them.
3. Then drop table only with explicit approval.

### Localhost checks for Stebbi

These checks are for after Claude Code implements the feature and after the migration has been applied locally or in the relevant Supabase environment with explicit approval.

1. Sign in with a user that has `vedrid` access.
2. Open `/auth-mvp/vedrid`.
3. Click `Frá`.
4. If there are no saved places yet, the search should work exactly as before.
5. Select `Garðabær`.
6. Click `Til` and select `Selfoss`.
7. Start over or reload the page.
8. Click `Frá`.
9. Expected: `Garðabær` appears under `Nýlegir staðir`.
10. Click `Til`.
11. Expected: `Selfoss` appears under `Nýlegir staðir`.
12. Select a saved place and verify it fills the field without Google autocomplete needing to run.
13. Delete one saved place with `X`.
14. Reload and verify it stays deleted.
15. Verify deleting a saved place does not clear the currently selected origin/destination unless that is explicitly intended and documented.
16. Test `Reykjavík -> Vestmannaeyjar`.
17. Expected: selecting `Landeyjahöfn` as ferry port does not automatically add Landeyjahöfn to saved places unless it was manually searched as a place.
18. Regression: Google autocomplete and server fallback search still work when saved places exist.
19. Regression: route alternatives, ferry selection, thresholds, and result calculation still work.

Security checks Stebbi should not do casually:

- Do not manually edit Supabase rows in production to test cross-user access unless this is a planned RLS audit.
- Do not run migration on production until Stebbi has explicitly approved it.
- Do not expose saved places in screenshots if they contain private home/work addresses.

## Files changed by Codex

- `ai-handoff/2026-07-07-2142-todo-067-v152-codex-v151-review-plus-saved-places-rls.md`

Codex did not change app code, SQL, migrations, env vars, Supabase settings, Vercel settings, commits, pushes, or deployment.

## Óvissa / þarf að staðfesta

1. Saved places are planned as per-user private weather places. If Stebbi wants them shared across devices but not users, this plan matches that. If Stebbi wants household/shared places later, that is a separate RLS model and should not be mixed into this MVP.
2. The proposed table uses coordinate-based dedupe because `PlaceSearch` currently does not return `placeId`.
3. No generated Supabase TypeScript types were found in the repo during this review. If Claude Code finds generated DB types elsewhere, update them as part of implementation.
