# TODO 086 v183 - Codex review of v182 full security review

Created: 2026-07-14 21:17:10 +00:00
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `ai-handoff/2026-07-14-2115-todo-086-v182-claude-security-review-full.md`

Mode:
- Read-only Codex review of Claude Code's security review.
- No app code changed.
- No SQL written or run.
- No Supabase, production, commit, push, or deploy action.

## Findings

No critical or high findings against v182.

Claude Code's overall conclusion is credible: no obvious production-active critical vulnerability was identified in the reviewed surface, and the two real rollout blockers are environment/schema verification items.

### Medium - Supabase state must be verified before broadening access

v182 correctly carries forward:
- `profiles_select` must be hardened by `sql/41_profiles_select_own.sql`.
- `weather_saved_places` must have migration `sql/69_weather_saved_places.sql` applied with own-row RLS policies.

Codex agrees these are the most important pre-rollout checks. They are not theoretical niceties: if production drifted and `profiles_select` is still `USING (true)`, authenticated users could read other profiles. If `weather_saved_places` policies are missing or wrong, saved place deletion relies on a boundary that may not exist.

Required read-only Supabase checks before opening to a larger user group:

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'weather_saved_places';

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
    'feature_access',
    'weather_saved_places'
  )
ORDER BY table_name, grantee, privilege_type;
```

Expected:
- `profiles_select` is `id = auth.uid()` or equivalent.
- `weather_saved_places_*_own` policies are present and use `user_id = auth.uid()`.
- Sensitive loan/relationship/event/feature tables do not grant direct `anon` or broad `authenticated` access.

### Low - v182 is missing the required `Localhost checks for Stebbi` section

`ai-handoff/README.md` and `AGENTS.md` require every handoff/review to include `Localhost checks for Stebbi`. v182 has a pre-release checklist and one localhost mention in Next Steps, but no dedicated section.

This does not weaken the security analysis, but it makes the handoff incomplete by project workflow. Claude Code should add the section or treat this v183 section as the missing checks.

### Low - Add application-layer ownership to saved-place DELETE as defense-in-depth

v182 flags `app/api/teskeid/weather/saved-places/[id]/route.ts:29-33` as RLS-only:

```ts
await supabase
  .from('weather_saved_places')
  .delete()
  .eq('id', id)
```

The migration `sql/69_weather_saved_places.sql:83-87` is correct if applied. Still, given Stebbi's security concern, the safer implementation is to add an app-layer filter too:

```ts
.eq('id', id)
.eq('user_id', user.id)
```

This is not a release blocker if migration 69 is verified. It is a small hardening step that reduces blast radius if RLS or grants ever drift.

### Low - Confirm production `LEGACY_ENABLED` is actually off

v182 labels Flags 3-7 as legacy-gated and not exploitable in production. Codex agrees with the code-level gate:
- `middleware.ts:73-98` default-denies legacy route prefixes unless `LEGACY_ENABLED === 'true'`.
- Legacy handlers also call `legacyGuard()`, e.g. `app/api/chats/[id]/route.ts:7-8`, `app/api/children/[id]/route.ts:7-8`, and `app/api/cron/cleanup-chats/route.ts:8-9`.

But this conclusion depends on actual Vercel/production env. Before release, verify `LEGACY_ENABLED` is unset or not `true` in production. If it is `true`, v182's legacy findings become more urgent and should be fixed before broader exposure.

## What Codex Spot-Checked

v182 claims checked:
- `saved-places` DELETE really does rely on RLS only.
- Migration 69 does define own-row saved-place RLS.
- Legacy mass-assignment examples exist and are double-gated.
- Cron routes check `CRON_SECRET`.
- Admin weather routes use `requireAdmin`.
- Manual Veðurstofan refresh is per-user provider-gated.
- Votes route uses httpOnly cookie + HMAC token and does not expose raw IP/voter ID.

Spot-checked files:
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `sql/69_weather_saved_places.sql`
- `app/api/chats/[id]/route.ts`
- `app/api/children/[id]/route.ts`
- `middleware.ts`
- `lib/legacy/guard.ts`
- `lib/legacy/access.ts`
- `app/api/cron/cleanup-chats/route.ts`
- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/admin/weather/warm-vedurstofan/route.ts`
- `app/api/admin/weather/project-vedurstofan/route.ts`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- `app/api/votes/route.ts`

## Agreement With v182

Codex agrees:
- Do not broaden access before confirming Supabase migration state.
- Legacy findings do not block if `LEGACY_ENABLED` is off.
- `lánað og skilað` remains structurally safer than many other areas because it uses `guardLoanAccess()`, service-role-only tables, and RPCs/functions scoped by actor.
- Weather provider work should stay behind the Veðurstofan provider-specific per-user feature flag until Stebbi is ready to graduate it.

## Recommended Next Step

Before more TODO 086 feature work:

1. Run the read-only Supabase checks for:
   - profiles policy
   - weather_saved_places policies
   - sensitive table grants

2. Confirm Vercel production env:
   - `LEGACY_ENABLED` is unset or not `true`.
   - `AUTH_MVP_ENABLED`/`LOANS_ENABLED` are intentionally set.
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` is only enabled when Stebbi is ready for test users.

3. Have Claude Code run the targeted test bundle from v182:

```powershell
npx vitest run lib/__tests__/loans.test.ts lib/__tests__/loan-pages.test.tsx lib/__tests__/profiles-14a.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/middleware.test.ts
```

4. Optionally ask Claude Code to do the small saved-place hardening:
   - add `.eq('user_id', user.id)` to saved-place DELETE
   - add/update a regression test for cross-user delete not succeeding

## Localhost Checks For Stebbi

Security checks Stebbi can do locally without touching Supabase production:

1. Two-user loan isolation:
   - Log in as User A.
   - Create or open a `lánað og skilað` item.
   - Copy the detail URL.
   - Log out or switch to User B who is not lender, borrower, or invited recipient.
   - Paste the User A detail URL.
   - Expected: User B should not see item name, note, history, chat, counterpart display name, or controls. It should 404/redirect/block.

2. Pending invitation boundary:
   - User A invites User B's exact email.
   - User B should see only the invited loan, not User A's unrelated loans.
   - If User B changes URL to another guessed loan ID, it should not reveal data.

3. Recent events boundary:
   - User A and User B should only see their own `Nýlegt` events.
   - Marking User B's event as read should not affect User A's event.

4. Weather saved places:
   - Save a weather place as User A.
   - As User B, confirm it does not show in saved/recent places.
   - Do not test destructive cross-user deletes against production data casually.

5. Veðurstofan provider flag:
   - User with `weather-provider-vedurstofan` access and env enabled should see Veðurstofan controls.
   - User without the feature row should not see those controls.
   - With env disabled, everyone should get MET/Yr-only behavior.

Production caution:
- Do not run SQL migrations, mutate production rows, rotate secrets, or test with real private user data without explicit approval.
- The Supabase checks above are read-only but still production-adjacent. Treat them as an explicit approved step.

