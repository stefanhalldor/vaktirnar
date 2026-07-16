# TODO 086 v181 - Codex review of v180 + first security audit pass

Created: 2026-07-14 21:02:37 +00:00
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-14-2330-todo-086-v180-claude-v179-done-prerelease.md`

Mode:
- Read-only Codex review and initial security audit.
- No app code changed.
- No SQL written or run.
- No Supabase, production, commit, push, or deploy action.

## Findings

No blocking findings in v180.

v180 only fixes the stale test comment in `lib/__tests__/sql-migration.test.ts`. The old `extra_weather_providers` wording is gone, and the current repo references the provider-specific key consistently as `weather-provider-vedurstofan` with the env kill switch `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.

Security follow-up, Medium operational risk: confirm `sql/41_profiles_select_own.sql` has been applied in the target Supabase environment before treating the broader auth surface as safe.

Why: the original base schema has `profiles_select` as `USING (true)` in `sql/01_schema.sql:183-185`, which would let any authenticated user read all profile rows, including columns such as `phone` if granted through the table. The repo does contain the hardening migration in `sql/41_profiles_select_own.sql:52-55`, changing the policy to `USING (id = auth.uid())`, with tests in `lib/__tests__/profiles-14a.test.ts`. This is not a v180 code blocker if production already has migration 41, but it is exactly the kind of historical RLS drift Stebbi is worried about. It should be verified read-only in Supabase before confidence goes up.

No immediate `lánað og skilað` cross-user leak found in this first pass.

Evidence from the codebase:
- `sql/30_loan_items.sql:92-96` enables RLS, revokes `PUBLIC`, `anon`, and `authenticated`, and grants table access only to `service_role`.
- `sql/31_loan_invitations.sql:71-74` does the same for invitations.
- Loan pages call `guardLoanAccess()` before service-role reads, e.g. `app/auth-mvp/lanad-og-skilad/page.tsx:15-22` and `app/auth-mvp/lanad-og-skilad/[id]/page.tsx:24-45`.
- Detail fallback for pending recipients uses `get_loan_for_pending_recipient` with `p_actor_id` and `p_loan_id`, then 404s when no matching row exists: `app/auth-mvp/lanad-og-skilad/[id]/page.tsx:56-74`.
- `get_my_loans` only returns rows where the actor is lender/borrower or the pending invitation recipient by canonical email: `sql/55_get_my_loans_add_recipient_email.sql:111-144`.
- `recent_events` is service-role-only and all reads/acks are scoped by `user_id`: `sql/46_recent_events.sql:44-53`, `lib/recent-events/helpers.server.ts:73-87`, `lib/recent-events/helpers.server.ts:114-138`.
- `relationships` tables are service-role-only, and relationship reads are scoped with `owner_id`: `sql/54_relationships.sql:116-126`, `lib/relationships/actions.ts:177-184`, `lib/relationships/actions.ts:603-623`.

## v180 Review

What changed according to v180:
- `lib/__tests__/sql-migration.test.ts` comment now says `feature_access_weather_provider_vedurstofan`.

Codex verification:
- `rg "extra-weather-providers|WEATHER_EXTRA_PROVIDERS_FLAG|extra_weather_providers" app lib sql .env.example` returned no matches.
- `rg "weather-provider-vedurstofan|WEATHER_PROVIDER_VEDURSTOFAN_ENABLED|weather_provider_vedurstofan" app lib sql .env.example` shows the expected references in guard, admin API, admin UI, tests, `.env.example`, travel API, refresh API, and migration 76.
- `git diff` shows v180 itself only resolves the final stale naming issue from v179; the broader dirty worktree still includes the prior feature-flag/admin/migration changes.

## Security Audit Scope Started

First pass focused on:
- Feature access and provider flag naming.
- Admin feature-access API.
- Supabase service-role helper usage.
- `lánað og skilað` auth guard, pages, server actions, RPC boundaries, table grants, and recent events.
- Relationship-derived loan data and private relationship notes.
- Historical `profiles` RLS hardening.

Files inspected:
- `ai-handoff/2026-07-14-2330-todo-086-v180-claude-v179-done-prerelease.md`
- `.env.example` (not `.env.local`)
- `app/(admin)/admin/page.tsx`
- `app/api/admin/feature-access/route.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/actions.ts`
- `app/auth-mvp/heim/RecentSection.tsx`
- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx`
- `app/api/teskeid/profile/route.ts`
- `lib/loans/guard.ts`
- `lib/loans/actions.ts`
- `lib/loans/history.server.ts`
- `lib/recent-events/helpers.server.ts`
- `lib/relationships/actions.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/server.ts`
- `lib/auth/guard.ts`
- `lib/teskeid/admin-auth.ts`
- `sql/01_schema.sql`
- `sql/30_loan_items.sql`
- `sql/31_loan_invitations.sql`
- `sql/32_loan_functions.sql`
- `sql/41_profiles_select_own.sql`
- `sql/46_recent_events.sql`
- `sql/54_relationships.sql`
- `sql/55_get_my_loans_add_recipient_email.sql`
- `sql/60_get_loan_event_history_pending_access.sql`
- `sql/65_fix_switch_loan_role_security_definer.sql`
- `sql/75_weather_fetch_runs_metadata.sql`
- `sql/76_feature_access_weather_provider_vedurstofan.sql`

## Commands Run

Read-only commands only:

```powershell
Get-Content -Encoding UTF8 'WORKFLOW.md' | Select-Object -First 140
Get-Content -Encoding UTF8 'ai-handoff/README.md' | Select-Object -First 220
Get-Content -Encoding UTF8 'ai-handoff/2026-07-14-2330-todo-086-v180-claude-v179-done-prerelease.md' | Select-Object -First 240
git status --short --untracked-files=all -- .env.example "app/(admin)/admin/page.tsx" "lib/__tests__/sql-migration.test.ts" "sql/76_feature_access_weather_provider_vedurstofan.sql" "ai-handoff/2026-07-14-2330-todo-086-v180-claude-v179-done-prerelease.md"
git diff -- .env.example "app/(admin)/admin/page.tsx" "lib/__tests__/sql-migration.test.ts" "sql/76_feature_access_weather_provider_vedurstofan.sql"
rg -n "extra-weather-providers|WEATHER_EXTRA_PROVIDERS_FLAG|extra_weather_providers" app lib sql .env.example
rg -n "weather-provider-vedurstofan|WEATHER_PROVIDER_VEDURSTOFAN_ENABLED|weather_provider_vedurstofan" app lib sql .env.example
rg --files app lib sql | rg "loan|loans|lanad|skilad|recent_events|relationship|auth|guard|supabase|feature-access"
rg -n "guardLoanAccess|getAdmin\(|\.rpc\(|export async function|console\.error|from\('loan_items'|from\('loan_invitations'" lib/loans/actions.ts
rg -n "CREATE OR REPLACE FUNCTION public\.(create_loan|get_my_loans|update_loan|mark_loan_returned|undo_loan_return|delete_loan|add_loan_invitation|update_loan_with_diff|get_loan_event_history|switch_loan_role)|CREATE POLICY|ENABLE ROW LEVEL SECURITY|GRANT EXECUTE|SECURITY DEFINER|p_user_id|auth\.uid|lender_user_id|borrower_user_id|recipient_email_normalized" sql/30_loan_items.sql sql/31_loan_invitations.sql sql/32_loan_functions.sql sql/34_loan_permissions_and_rpc_fix.sql sql/35_loan_auth_users_and_ambiguity_fix.sql sql/43_open_loans.sql sql/48_update_loan_with_diff.sql sql/55_get_my_loans_add_recipient_email.sql sql/59_get_loan_event_history.sql sql/60_get_loan_event_history_pending_access.sql sql/63_switch_loan_role.sql sql/65_fix_switch_loan_role_security_definer.sql
Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
```

There were two harmless PowerShell/regex quoting failures while searching, then equivalent simpler searches/read commands were run. No files or data were affected by those failed searches.

## Tests

Codex did not rerun tests in this audit pass.

Claude Code reported in v180:

```powershell
npx vitest run lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/sql-migration.test.ts
# Test Files  4 passed (4)
# Tests       311 passed (311)

npx tsc --noEmit
# no errors
```

Recommendation before release:
- If no code changed after v180, Stebbi can rely on Claude Code's test run for this tiny comment fix.
- For security confidence, run or have Claude Code run targeted loan/security tests next, especially:
  - `lib/__tests__/loans.test.ts`
  - `lib/__tests__/loan-pages.test.tsx`
  - `lib/__tests__/profiles-14a.test.ts`
  - `lib/__tests__/feature-access-api.test.ts`
  - `lib/__tests__/guard.test.ts`
  - `lib/__tests__/middleware.test.ts`

## Supabase / SQL Notes

No SQL was run by Codex.

Before running migration 75/76, Stebbi still needs explicit Supabase approval.

Read-only Supabase checks recommended before release or broadening access:

```sql
-- Confirm profile hardening is active.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- Confirm no direct authenticated/anon access to loan and relationship data.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'loan_items',
    'loan_invitations',
    'recent_events',
    'relationships',
    'relationship_tags',
    'relationship_sources',
    'feature_access'
  )
ORDER BY table_name, grantee, privilege_type;

-- Confirm RLS is enabled on sensitive tables.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'loan_items',
  'loan_invitations',
  'recent_events',
  'relationships',
  'relationship_tags',
  'relationship_sources',
  'feature_access',
  'profiles'
);
```

Expected:
- `profiles_select` should be `id = auth.uid()` or equivalent.
- `loan_items`, `loan_invitations`, `recent_events`, `relationships`, `relationship_tags`, `relationship_sources`, and `feature_access` should not grant direct table access to `anon` or `authenticated`.
- Sensitive tables should have RLS enabled.

## Recommended Next Steps For Claude Code

1. Treat v180 as code-ready unless new changes land.

2. Start a dedicated security audit phase before release:
   - Do not change app behavior yet.
   - Run the targeted test list above.
   - Add a short checklist result to a new handoff.

3. With explicit Stebbi approval only, perform the read-only Supabase SQL checks above on the target environment.

4. If the profile policy is not hardened in the target environment, stop release work and run/prepare `sql/41_profiles_select_own.sql` before exposing more authenticated users.

5. Continue a second audit pass over service-role API routes outside `lánað og skilað`:
   - `app/api/admin/*`
   - `app/api/votes/route.ts`
   - `app/api/analytics/route.ts`
   - `app/api/teskeid/profile/route.ts`
   - weather refresh and cron routes
   - auth OTP/request-code routes

6. Add explicit cross-user negative tests if missing:
   - User B cannot open User A loan detail by guessed UUID.
   - User B cannot edit, delete, return, undo return, add party, chat, or mark recent events for User A.
   - Pending recipient can only see the exact invited loan when their canonical email matches.
   - Relationship detail cannot load another user's relationship ID.

## Localhost Checks For Stebbi

Use two test users if possible. Do not use real sensitive production users for casual testing.

1. Feature flag smoke:
   - User with `weather-provider-vedurstofan` access and `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` should see the Veðurstofan layer controls.
   - User without that feature row should only get MET/Yr behavior.
   - With `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false`, everyone should get MET/Yr-only behavior.

2. Loan isolation:
   - User A creates a loan.
   - Copy the detail URL.
   - Log in as User B who is not lender, borrower, or pending invited recipient.
   - Open the copied URL.
   - Expected: not found/blocked, no item name, note, chat, history, counterpart name, or recent event details shown.

3. Pending invitation boundary:
   - Invite User B's exact email to a loan.
   - User B should see only that pending loan/invitation.
   - User B should not see User A's unrelated loans.

4. Recent events isolation:
   - User A and User B should only see their own Nýlegt rows.
   - Marking a recent event read as User B must not clear User A's event.

5. Profile endpoint:
   - `/api/teskeid/profile` should return only the logged-in user's `display_name` and email.
   - It should not return phone, other users' profiles, feature access rows, or relationship/private notes.

Production/Supabase caution:
- Do not run migrations, mutate data, rotate secrets, or test with real private user data without explicit approval.
- The SQL checks listed above are read-only, but still touch production metadata if run there and should be treated as a separate approved step.

