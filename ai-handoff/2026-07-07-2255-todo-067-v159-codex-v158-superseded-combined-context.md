# TODO-067 v159 - Supersedes v158 with combined v2245 context

Created: 2026-07-07 22:55
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Handoff addendum/replacement. Supersedes v158 for the next saved-places handoff. No code, SQL, migration, commit, push, or deploy performed by Codex.

## Why this exists

Stebbi asked whether Codex had considered:

`2026-07-07-2245-claude-hugmyndir-nav-plus-v157-combined-handoff`

when creating v158.

Answer: Codex had not read it before creating v158. v158 was still directionally correct for saved places, but it did not include the newest combined deploy context. This v159 should be used instead of v158 for the next Claude Code handoff.

## Relationship to v158

v158 remains in the archive for audit history and should not be overwritten.

Use this v159 as the current instruction:

- v2245 has now been read.
- v2245 does not invalidate the saved-places migration plan from v158.
- v2245 adds one extra deploy-context item that must be verified separately: `Hugmyndir` public nav on idea detail pages.

## Current combined context from v2245

The currently shipped/pending code bundle includes three work areas:

1. **Hugmyndir nav fix**
   - `app/hugmyndir/[slug]/page.tsx`
   - Adds `<PublicTopNav />`.
   - Removes the older centered `TeskeidLogo` block.

2. **Auth hotfix**
   - `lib/auth/ip-rate-limit.ts`
   - `lib/__tests__/ip-rate-limit.test.ts`
   - Raises the IP daily OTP limit from hardcoded `10` to env-configurable default `250`, capped at `5000`.
   - No SQL migration required for this auth hotfix.

3. **Phase D saved-places tightening**
   - `app/api/teskeid/weather/saved-places/route.ts`
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
   - `components/weather/PlaceSearch.tsx`
   - `lib/__tests__/sql-saved-places.test.ts`
   - `lib/__tests__/weather-saved-places-api.test.ts`
   - Addresses v156 findings: DB write failures return 500, cap queries scope by user, delete rollback restores UI, SQL tests cover RLS clauses, saved place label is clearer.

## Decision

Keep these streams separate:

- **Auth hotfix + Hugmyndir nav:** deploy verification.
- **Saved places:** release is not complete until the Supabase migration is reviewed and applied.

Saved places are not an auth-hotfix follow-up. They are part of **TODO #67 / Pakki F - Veðrið / Ferðalagið**.

## Main saved-places blocker before migration

Before Stebbi runs `sql/69_weather_saved_places.sql`, Claude Code should make the trigger idempotent.

Current migration has:

```sql
CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

Recommended:

```sql
DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at
  ON public.weather_saved_places;

CREATE TRIGGER weather_saved_places_set_updated_at
  BEFORE UPDATE ON public.weather_saved_places
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

This makes accidental reruns safer.

## Required next handoff for Claude Code

After the current deploy is stable, Claude Code should do this focused follow-up:

1. Update `sql/69_weather_saved_places.sql`:
   - add `DROP TRIGGER IF EXISTS weather_saved_places_set_updated_at ON public.weather_saved_places;`
   - keep RLS, grants, policies and constraints unchanged unless a real issue is found

2. Update `lib/__tests__/sql-saved-places.test.ts`:
   - assert the trigger is dropped before creation
   - keep scoped RLS assertions

3. Update `TODO.md`:
   - add an explicit #67 saved-places release item
   - say code exists, but full server-side saved places require `sql/69_weather_saved_places.sql`
   - include migration/RLS/manual verification as release prerequisites

4. Run:
   - `npm run type-check`
   - `npm run test:run`
   - `npm run build`

5. Prepare migration execution note for Stebbi:
   - file: `sql/69_weather_saved_places.sql`
   - creates `public.weather_saved_places`
   - stores user-specific saved/recent weather route places
   - enables RLS and user-owned policies
   - grants only to `authenticated` and `service_role`
   - rollback: `DROP TABLE IF EXISTS public.weather_saved_places;`

6. Do not run SQL, commit, push, or deploy without explicit Stebbi approval.

## Review checklist for the combined deploy

### Auth hotfix

- Confirm `getIpDailyLimit()` exists.
- Confirm default is `250`.
- Confirm env override is supported and capped at `5000`.
- Confirm `checkIpRateLimit` passes `getIpDailyLimit()` to the RPC.
- Confirm no SQL migration was added for auth hotfix.
- Confirm per-email limit remains unchanged.

### Hugmyndir nav

- Confirm `/hugmyndir/[slug]` has exactly one intended public top nav.
- Confirm the old logo block is gone.
- Confirm mobile layout does not gain top overlap, horizontal overflow or awkward double spacing.
- Confirm links go to:
  - Hugmyndir: `/`
  - Ný hugmynd: `/senda-hugmynd`
  - Innskráning: `/innskraning`

### Saved places

- Confirm saved-place API uses authenticated Supabase client, not service role.
- Confirm `user_id` is server-derived.
- Confirm RLS policies use `user_id = auth.uid()`.
- Confirm `place_key` is server-computed.
- Confirm saved-place storage failure does not block route selection.
- Confirm migration is not considered complete until it has been applied and manually verified.

## Localhost checks for Stebbi

### Current combined deploy checks

1. Open a real idea detail page, e.g. `/hugmyndir/<slug>`.
2. Expected: sticky public nav appears at top.
3. Expected: old centered Teskeið logo block is not shown below nav.
4. Click `Hugmyndir`, `Ný hugmynd`, and `Innskráning`.
5. Expected: links navigate correctly and do not dead-click after logout.
6. Request login codes for a few different test emails from the same network.
7. Expected: you should not hit `Prófaðu aftur kl. 00:00` after only a few attempts.

Do not spam a real production email 20+ times just to test the per-email limit unless you explicitly want to consume that test window.

### Saved places after migration

Run these only after `sql/69_weather_saved_places.sql` has been applied in the environment under test.

1. Log in as a user with access to `vedrid`.
2. Open `/auth-mvp/vedrid`.
3. Select `Frá`, e.g. `Garðabær`.
4. Select `Til`, e.g. `Selfoss`.
5. Return to the route step or start over.
6. Click into `Frá` or `Til`.
7. Expected: recently selected places appear.
8. Select a saved place.
9. Expected: it is chosen without typing.
10. Delete a saved place with `X`.
11. Refresh and open the field again.
12. Expected: deleted place does not reappear.
13. Log in as another user.
14. Expected: first user's saved places are not visible.

Production caution:

- Do not test cross-user privacy with unrelated real users.
- Do not manually modify production saved-place rows unless explicitly deciding on data cleanup.
- If migration fails, stop and capture the exact Supabase error before retrying.

## Commands run by Codex

Read-only:

- Read `ai-handoff/README.md`
- Read `ai-handoff/2026-07-07-2251-todo-067-v158-codex-saved-places-migration-release-handoff.md`
- Read `ai-handoff/2026-07-07-2245-claude-hugmyndir-nav-plus-v157-combined-handoff.md`
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` immediately before file creation.

