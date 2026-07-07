# TODO-067 v158 - Saved places migration + release handoff

Created: 2026-07-07 22:51
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Handoff/plan. No code, SQL, migration, commit, push, or deploy performed by Codex.

## Context

Stebbi has asked Claude Code to ship the current code. That current code includes the auth hotfix and the saved-places implementation work from v155/v157.

Important distinction:

- **Auth hotfix:** does not require SQL migration. It changes the value passed into the existing IP rate-limit RPC.
- **Saved/recent places for Ferðaveðrið:** does require SQL migration. Without `sql/69_weather_saved_places.sql` applied to Supabase, the full feature is not live end-to-end.

Stebbi wants the full-blown saved-places behavior, not a localStorage/MVP shortcut.

## Goal

Finish Phase D saved/recent places properly:

- logged-in users get recent/saved `Frá` and `Til` places in Ferðaveðrið;
- places persist server-side per user;
- users can delete saved places with `X`;
- places are isolated with RLS;
- failures in saved-place storage never block route selection;
- production rollout is explicit, reviewed, and testable.

## Current state observed by Codex

Files currently present in working tree:

- `sql/69_weather_saved_places.sql`
- `lib/weather/savedPlaces.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `lib/__tests__/sql-saved-places.test.ts`
- `lib/__tests__/weather-saved-places-api.test.ts`
- UI changes in:
  - `components/weather/PlaceSearch.tsx`
  - `components/weather/RouteSelectionStep.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`

v157 appears to have addressed the main v156 saved-places issues:

- POST returns `500 { error: 'save_failed' }` on insert/update failure.
- Cap queries are explicitly scoped with `.eq('user_id', user.id)`.
- Delete rollback restores previous state on failed DELETE.
- Saved-place list shows name as primary and formatted address as secondary.
- SQL tests now check update/delete RLS clauses more directly.

## Main finding before running migration

### High - Make `sql/69_weather_saved_places.sql` safely rerunnable before Stebbi runs it

The migration currently has:

```sql
CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

If this migration is accidentally run twice, trigger creation can fail because the trigger already exists.

Before asking Stebbi to run the migration, Claude Code should make this idempotent:

```sql
DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at
  ON public.weather_saved_places;

CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

This matches the project's preference for migrations that are safe to rerun where practical. The table, index, and policies are already mostly rerunnable due to `IF NOT EXISTS` / `DROP POLICY IF EXISTS`.

Also add/update the SQL static test so it asserts the trigger is dropped before creation.

## Required implementation steps for Claude Code

Do this as a small follow-up after the current code deploy is complete.

1. Update `sql/69_weather_saved_places.sql`:
   - Add `DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at ON public.weather_saved_places;` before `CREATE TRIGGER`.
   - Keep `BEGIN;` / `COMMIT;`.
   - Keep RLS and grants unchanged unless a specific issue is found.

2. Update `lib/__tests__/sql-saved-places.test.ts`:
   - Assert the migration drops the trigger before creating it.
   - Keep the existing RLS tests.

3. Add the saved-places release item to `TODO.md` or explicitly nest it under #67:
   - It must say that the code exists but the feature is not fully live until `sql/69_weather_saved_places.sql` is applied.
   - It must include RLS/manual verification as a release prerequisite.

4. Re-run local verification:
   - `npm run type-check`
   - `npm run test:run`
   - `npm run build`

5. Prepare a migration execution note for Stebbi:
   - exact file: `sql/69_weather_saved_places.sql`
   - what it creates
   - that it changes Supabase schema/RLS/grants
   - that it stores user-specific saved route places
   - rollback: `DROP TABLE IF EXISTS public.weather_saved_places;`
   - risk: low if run once after review, but it touches production schema and user data boundaries

6. Do not run the migration unless Stebbi explicitly says to run it.

7. Do not commit, push, or deploy this follow-up unless Stebbi explicitly approves those actions.

## Migration review checklist

Before production migration:

- `public.teskeid_set_updated_at()` exists. Codex found it in `sql/04_teskeid_schema.sql`.
- `weather_saved_places` table does not already exist in production, or if it does, Claude Code must stop and ask Stebbi before continuing.
- RLS is enabled.
- No anonymous access.
- `authenticated` has only `SELECT, INSERT, UPDATE, DELETE`.
- All policies use `user_id = auth.uid()`.
- `user_id` references `auth.users(id) ON DELETE CASCADE`.
- `place_key` is server-computed and unique per `(user_id, place_key)`.
- Coordinate constraints are Iceland-scoped.
- API uses authenticated Supabase client, not service role, for saved-place CRUD.
- API client failure remains best-effort and does not block route creation.

## Suggested production rollout sequence

1. Finish and deploy the auth hotfix currently in progress.
2. Confirm login-code issue is resolved in production.
3. Commit/push the saved-places idempotency/TODO follow-up after review.
4. Wait for Vercel build to go green.
5. Run `sql/69_weather_saved_places.sql` in Supabase only after explicit Stebbi approval.
6. Immediately test saved places in production with one real account.
7. Test with a second account to confirm no cross-user leakage.
8. If anything fails, do not keep poking production data casually. Capture exact error and decide whether rollback is needed.

## Localhost checks for Stebbi

Run these only after the migration has been applied in the local/Supabase environment you are testing against.

Setup:

- `AUTH_MVP_ENABLED=true`
- `WEATHER_ENABLED=true`
- `WEATHER_FLAG=true`
- logged-in user with access to `vedrid`
- `sql/69_weather_saved_places.sql` has been applied

Checks:

1. Open `/auth-mvp/vedrid`.
2. Click `Frá`.
3. Search for and select a place, for example `Garðabær`.
4. Click `Til`.
5. Search for and select another place, for example `Selfoss`.
6. Start over or return to the route step.
7. Click into `Frá` again.
8. Expected: recently selected places appear under the saved/recent places section.
9. Click a saved place.
10. Expected: it is selected without typing.
11. Click `X` next to a saved place.
12. Expected: the row disappears and does not reappear after refresh.
13. Sign in as another user with `vedrid` access.
14. Expected: the first user's saved places are not visible.
15. Select `Vestmannaeyjar` and choose a ferry port.
16. Expected: ferry port selection itself is not saved unless it was explicitly selected through PlaceSearch.

Regression checks:

- Google Places search still works.
- Server fallback place search still works if Google fails.
- Ferðaveðrið can still calculate route results if saved-places API fails.
- Route alternatives and Herjólfur handling still work.
- No mobile zoom or horizontal overflow appears in the saved-places list.

Production caution:

- Do not test cross-user privacy by using real unrelated user accounts unless Stebbi controls both accounts.
- Do not manually edit/delete production saved-place rows unless explicitly deciding to do data cleanup.
- If migration fails halfway, stop and capture the exact Supabase error before retrying.

## Notes for Stebbi

Saved places should be treated as part of **TODO #67 / Pakki F - Veðrið / Ferðalagið**, not as an auth hotfix follow-up.

The reason it fell between chairs is that v155 explicitly said `TODO.md` had not been updated, while the work lived in the handoff chain. This handoff makes the missing release step explicit.

## Commands run by Codex

Read-only inspection only:

- Read `ai-handoff/README.md`
- Read relevant beginning of `Design.md`
- `git status --short`
- `rg -n "teskeid_set_updated_at|weather_saved_places_set_updated_at|weather_saved_places" sql lib app components messages TODO.md`
- Read `sql/69_weather_saved_places.sql`
- Read `app/api/teskeid/weather/saved-places/route.ts`
- Read `lib/__tests__/sql-saved-places.test.ts`
- Read part of `lib/__tests__/weather-saved-places-api.test.ts`

Codex did not run type-check/tests/build for this handoff because the purpose was to prepare the next release handoff, not verify a fresh code change.

