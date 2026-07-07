# TODO-067 v161 - SQL 69 preflight approval

Created: 2026-07-07 23:02
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Confirmation handoff. Codex did not run SQL, commit, push, deploy, or alter production data.

## Context

Stebbi asked whether it is safe to run:

`sql/69_weather_saved_places.sql`

This migration is required before saved/recent places in Ferðaveðrið work end-to-end.

v160 from Claude Code says the code has shipped in commits:

- `2b33c79` - saved route places, auth IP limit fix, hugmyndir nav
- `765b8ef` - make sql/69 trigger idempotent and note saved-places migration in TODO

## Preflight result from Stebbi

Stebbi ran the read-only preflight:

```sql
select
  to_regclass('public.weather_saved_places') as weather_saved_places_table,
  to_regprocedure('public.teskeid_set_updated_at()') as updated_at_function;
```

Result:

| weather_saved_places_table | updated_at_function      |
| -------------------------- | ------------------------ |
| null                       | teskeid_set_updated_at() |

## Codex conclusion

This preflight is the expected safe state.

Codex recommendation:

**It is safe for Stebbi to run `sql/69_weather_saved_places.sql` in Supabase SQL Editor now.**

Reasoning:

- `public.weather_saved_places` does not exist yet, so the migration will create a new table rather than modifying an existing one.
- `public.teskeid_set_updated_at()` exists, so the trigger dependency is present.
- The migration now drops the trigger before creating it, so accidental reruns are safer.
- The migration is wrapped in `BEGIN;` / `COMMIT;`.
- The table is protected by RLS.
- Policies are scoped with `user_id = auth.uid()`.
- Anonymous access is revoked.
- The API uses the authenticated Supabase server client for saved-place CRUD.

## What SQL 69 does

Creates `public.weather_saved_places` for Ferðaveðrið saved/recent route places:

- `id`
- `user_id`
- `place_key`
- `name`
- `formatted_address`
- `lat`
- `lon`
- `usage_count`
- `last_used_at`
- `created_at`
- `updated_at`

Adds:

- unique `(user_id, place_key)`
- Iceland lat/lon constraints
- usage count constraint
- index on `(user_id, last_used_at DESC)`
- `updated_at` trigger
- RLS policies for authenticated users:
  - select own rows
  - insert own rows
  - update own rows
  - delete own rows

## Rollback note

Technical rollback:

```sql
DROP TABLE IF EXISTS public.weather_saved_places;
```

Important:

- Before users have saved places, rollback only removes the new feature table.
- After users start saving places, rollback deletes those saved places.
- Do not run rollback casually in production after users have started using the feature.

## Suggested execution

1. Open Supabase SQL Editor for the correct production project.
2. Confirm the project is the intended Teskeið production project.
3. Paste the full contents of `sql/69_weather_saved_places.sql`.
4. Run it once.
5. Save/capture the success message.
6. If it errors, stop and copy the exact error before retrying.

## Post-migration quick verification SQL

After running SQL 69, Stebbi may run this read-only verification:

```sql
select
  to_regclass('public.weather_saved_places') as weather_saved_places_table,
  to_regclass('public.weather_saved_places_user_last_used_idx') as weather_saved_places_index,
  to_regprocedure('public.teskeid_set_updated_at()') as updated_at_function;
```

Expected:

- table is not null
- index is not null
- updated_at function is not null

Optional RLS/policy check:

```sql
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'weather_saved_places'
order by policyname;
```

Expected policies:

- `weather_saved_places_select_own`
- `weather_saved_places_insert_own`
- `weather_saved_places_update_own`
- `weather_saved_places_delete_own`

All should scope to `user_id = auth.uid()` either in `qual`, `with_check`, or both depending on command.

## Localhost checks for Stebbi

Run after SQL 69 has been applied in the environment that localhost points to.

Setup:

- logged in user with `vedrid` access
- `WEATHER_ENABLED=true`
- `WEATHER_FLAG=true`
- Google Maps/env setup unchanged from current working setup

Checks:

1. Open `/auth-mvp/vedrid`.
2. Start Ferðalagið.
3. Select a `Frá` place via search, for example `Garðabær`.
4. Select a `Til` place via search, for example `Selfoss`.
5. Go back/start over and click into `Frá` or `Til`.
6. Expected: selected places appear under `Nýlegir staðir`.
7. Click a saved place.
8. Expected: it is selected without typing.
9. Click `X` next to a saved place.
10. Expected: row disappears immediately.
11. Refresh the page and click into the field again.
12. Expected: deleted place does not reappear.
13. Sign in as a second user with `vedrid` access.
14. Expected: first user's saved places are not visible.
15. Select Vestmannaeyjar and choose a ferry port.
16. Expected: ferry port itself is not saved unless it was selected through PlaceSearch.

Regression checks:

- Route calculation still works if saved places are empty.
- Google Places search still works.
- Server fallback place search still works if Google is unavailable.
- Saved-place API failure should not block route selection.
- No mobile zoom or horizontal overflow appears in the saved/recent places list.

Production caution:

- Do not test cross-user privacy with unrelated users.
- Do not manually edit or delete production saved-place rows unless doing explicit cleanup.
- If Supabase SQL errors, stop and preserve the exact message.

## Commands run by Codex

Read-only/local inspection:

- Read `ai-handoff/README.md`
- Read `sql/69_weather_saved_places.sql`
- Read `ai-handoff/2026-07-07-2300-todo-067-v160-claude-session-complete.md`
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` immediately before creating this file

Codex did not run SQL 69.

