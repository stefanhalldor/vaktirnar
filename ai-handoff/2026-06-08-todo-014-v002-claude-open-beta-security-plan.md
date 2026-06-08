# TODO #14 - Open Beta Security Plan

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v002
**Response to:** 2026-06-08-todo-014-v001-codex-open-beta-security-plan-request.md

---

## 1. What is already done

| Done | Evidence |
|------|----------|
| **14.1 Legacy isolation** | `LEGACY_ENABLED` env var blocks all `/home`, `/children`, `/chat`, `/contacts`, `/settings`, `/dashboard`, `/s`, and all legacy API prefixes at middleware level. `guardLegacyAccess(userId)` adds entitlement-table check server-side for all 13 legacy API routes + layouts. `legacy_access` table has service_role-only grants, RLS enabled, no policies. **Commit 6837467, sql/39 + sql/40.** |
| **14.4 Atomic OTP** | `verify_user_otp_code` and `verify_admin_otp_code` Postgres RPCs with `FOR UPDATE` row locking. `hashCode()` enforces 32-byte secret minimum. **Commit 6837467, sql/38.** |
| **14.6 Log safety** | Dynamic values removed from all `console.error/warn` in `app/api/**` and server helpers. Auto-discovery AST check in `lib/__tests__/log-safety.test.ts`. **Commit 6837467.** |

Remaining: **14.2** (profiles hardening), **14.3** (IP/abuse rate-limit), **14.5** (session vs feature access).

---

## 2. Remaining work - exact scope

### 14.2 Profiles hardening

**Current state (the problem):**

`sql/01_schema.sql` line 184 has:

```sql
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
```

Every `authenticated` user can read every row in `public.profiles`, including display names of
all users. `sql/26` explicitly notes it was NOT changed because Krakkavaktin co-parent
display-name joins needed it.

**What actually reads profiles today:**

- `app/auth-mvp/heim/page.tsx` lines 65-70: reads own profile via authenticated client
  (`.eq('id', user.id)`).
- `app/api/teskeid/profile/route.ts` lines 18-21: reads and writes own profile via
  authenticated client.
- `sql/32_loan_functions.sql` lines 301-302, 357, 409: `get_my_loans`,
  `get_my_pending_invitations`, `get_invitation_for_claim` all do `LEFT JOIN public.profiles`
  inside service_role RPCs.

**The key finding:**

All four loan RPCs that join `profiles` run as service_role, which has BYPASSRLS. The
`authenticated` client in the app only reads the calling user's own row. The broad
`USING (true)` policy currently serves no Teskeid use case and no Krakkavaktin use case
either - the legacy joins all go through service_role RPCs that bypass RLS anyway.

**Proposed fix:**

Replace `USING (true)` with `USING (id = auth.uid())` so authenticated users can only read
their own profile row. Service_role RPCs are unaffected. No Teskeid flow breaks. No
Krakkavaktin flow breaks.

**Risk:**

Any code calling `supabase.from('profiles').select()` without `.eq('id', user.id)` that
Claude Code did not find will silently return empty results after the migration (no error,
just 0 rows). This is better than an information leak but must be tested before deploy.
The `profiles_update` and `profiles_insert_own` policies from sql/26 already use
`id = auth.uid()` - this change makes SELECT consistent with them.

---

### 14.3 IP/abuse rate-limit on login codes

**Current state:**

`/api/auth-mvp/request-code` has a TODO comment at lines 19-21 acknowledging that only
per-email rate limiting (5/hr via `createUserCode`) exists. A single IP can spam codes to
unlimited distinct email addresses.

**Why urgency is low right now:**

The allowlist check at line 27 means only allowlisted emails trigger Resend sends. An
attacker cannot burn Resend budget by spamming non-allowlisted emails. This changes the
moment TODO #9 removes the allowlist from session validation.

**Proposed approach options (decision needed from Stebbi):**

- **Option A (Upstash Redis):** External dependency, no SQL migration, fail-closed on
  unreachable. The TODO comment in the code already references Upstash.
- **Option B (Supabase table):** New `auth_ip_rate_limit` table with HMAC(ip, daily_salt)
  keyed rows. Adds sql/42. No external dependency. Needs cleanup cron or TTL column.
- **Option C (defer):** Ship 14.3 just before TODO #9 removes the allowlist. Acceptable
  because the allowlist is the current practical defense.

Claude Code recommends **Option C** unless Codex has a strong reason to do it now.

---

### 14.5 Session vs feature access

**Current state:**

`guardTeskeidAccess()` in `lib/auth/guard.ts` conflates four concerns in one function:

1. `AUTH_MVP_ENABLED` flag check
2. Supabase session check
3. Email present on session
4. Email on `auth_mvp_allowlist`

`guardLoanAccess()` in `lib/loans/guard.ts` wraps `guardTeskeidAccess()` and adds
`LOANS_ENABLED` flag.

**The problem:**

"Are you logged in?" and "are you allowed to use this feature?" are conflated. When TODO #9
opens login to all emails, the allowlist check must be removed from session validation but
must remain as a feature guard for `lanad-og-skilad`. If we remove the allowlist check from
`guardTeskeidAccess()` without this refactor, `/auth-mvp/heim` and `/auth-mvp/minn-profill`
open to anyone - which is the goal of #9, but the guard layer is not ready for it.

**Additional finding - `minn-profill` has no server-side page guard:**

`app/auth-mvp/minn-profill/page.tsx` is `'use client'`. Session protection relies entirely
on middleware redirect (line 138-142 of `middleware.ts`) plus the API returning 401.
This works correctly for the current world. But it means the page cannot have server-side
feature-access logic added later without converting it to a server component or adding a
layout. Noting this now so it does not become a surprise during #9.

**Proposed layer split:**

```
// New: lib/auth/guard.ts
guardTeskeidSession()  -- AUTH_MVP_ENABLED + session + email, no allowlist check

// Existing: unchanged for now
guardTeskeidAccess()   -- keeps allowlist check, used by heim/page.tsx until #9

// New: lib/loans/guard.ts
guardFeatureAccess('lanad-og-skilad')  -- LOANS_ENABLED + allowlist check
guardLoanAccess()  -- delegates to guardTeskeidSession() + guardFeatureAccess()
```

This is additive. Existing callers keep working. `guardTeskeidAccess()` is not removed
until TODO #9 is ready.

**One concern about the profile API:**

`/api/teskeid/profile` is in `PUBLIC_PATHS` in `middleware.ts` (line 23). This means the
middleware auth session refresh does not run for this route. The route itself checks auth
via `createClient()` and returns 401 correctly, but the session cookie will not be
refreshed by this request. This is a minor issue but worth noting before open beta.

---

## 3. Proposed phases

### Phase 14A: Profiles hardening

**Files to inspect:**
- `sql/01_schema.sql` (line 184)
- `sql/26_profiles_auth_mvp.sql`
- `sql/32_loan_functions.sql` (confirm profile JOINs are all inside service_role RPCs)
- `app/auth-mvp/heim/page.tsx`
- `app/api/teskeid/profile/route.ts`

**Files likely to change:**
- New: `sql/41_profiles_select_own.sql`
- Possibly: new test in `lib/__tests__/` for static or integration regression

**Migration (schema change only, no data mutation):**

```sql
-- sql/41_profiles_select_own.sql
BEGIN;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
COMMIT;
```

**Rollback:**
```sql
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);
```

**Effects:**
- `authenticated` role: loses cross-user profile reads.
- `service_role` (BYPASSRLS): unaffected. All loan RPCs unaffected.
- `anon`: already has no access.

**Preflight (read-only, before migration):**
Run in Supabase SQL Editor to confirm current state:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```
Expected: `profiles_select` with `qual = true`. If it already says `(id = auth.uid())`
then this phase is already done.

**Tests:**
- After migration, authenticated user cannot read another user's profile row (empty result,
  not error).
- Own-profile reads on heim/page and profile API still work.

**Deploy order:**
1. Run preflight SQL (read-only).
2. Apply sql/41.
3. Deploy app (no app code change needed unless a cross-user read is discovered).

**Judgment:** Small and safe. Do not split further.

---

### Phase 14B: IP/abuse rate-limit

Decision from Stebbi required first (see Section 4, question 2).

If Option A (Upstash):
- New: `lib/auth/ip-rate-limit.ts`
- Modified: `app/api/auth-mvp/request-code/route.ts`
- New: `lib/__tests__/ip-rate-limit.test.ts`
- No SQL migration.

If Option B (Supabase table):
- New: `sql/42_ip_rate_limit.sql`
- New: `lib/auth/ip-rate-limit.ts`
- Modified: `app/api/auth-mvp/request-code/route.ts`
- New: `lib/__tests__/ip-rate-limit.test.ts`

If Option C (defer):
- No work now. Revisit when TODO #9 is in scope.

**Tests needed regardless of option:**
- Same IP, multiple emails, hits per-IP limit.
- Rate-limit store unavailable: fail closed, no code generated, generic response returned.
- Rate-limited response is identical to success response (no enumeration leak).

**Judgment:** Medium complexity. Option C (defer) is recommended. This phase is
independent and can be done later without affecting 14A or 14C.

---

### Phase 14C: Session vs feature access split

**Files to inspect:**
- `lib/auth/guard.ts`
- `lib/loans/guard.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/lanad-og-skilad/layout.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `lib/__tests__/guard.test.ts`

**Files likely to change:**
- `lib/auth/guard.ts` (add `guardTeskeidSession()`)
- `lib/loans/guard.ts` (add `guardFeatureAccess()`, update `guardLoanAccess()`)
- `lib/__tests__/guard.test.ts` (new tests for split functions)

**No SQL migration needed.**

**Core approach:** Additive only. New functions added alongside existing ones.
`guardTeskeidAccess()` is not modified or removed. Existing callers are not touched.

**Tests:**
- `guardTeskeidSession()`: redirects when `AUTH_MVP_ENABLED` is false.
- `guardTeskeidSession()`: redirects when session is missing.
- `guardTeskeidSession()`: returns user when session is valid (any email).
- `guardFeatureAccess('lanad-og-skilad')`: redirects when `LOANS_ENABLED` is false.
- `guardFeatureAccess('lanad-og-skilad')`: redirects when email not on allowlist.
- `guardLoanAccess()`: composed behavior unchanged from current `guardLoanAccess()`.
- All existing `guard.test.ts` tests must still pass.

**Deploy order:**
1. Deploy new functions (additive, no behavior change for existing callers).
2. No SQL needed.

**Judgment:** Medium complexity, low risk because it is additive. Should come after 14A
so the change set stays small per deploy. Do not split further.

---

### Phase 14D: Final tests and TODO/DONE update

**After 14A, 14B (or confirmed deferred), and 14C:**

**Regression test checklist:**
- Unauthenticated user: redirected from all `/auth-mvp/*` pages to `/innskraning`.
- Non-allowlisted user: gets generic response from `request-code`, cannot access
  `/auth-mvp/heim` (redirected to `/`).
- Allowlisted user: full access to all Teskeid surfaces.
- Direct URL to loan page: server-side guard fires (layout guard catches it).
- Loan server actions: `guardLoanAccess()` called in every action (already done, verify
  with test or static check).
- Loan RPCs: `p_actor_id` always comes from server-side `user.id`, never from client input.
- Production logs: no emails, codes, or tokens in any `console.error/warn`.

**Documentation:**
- Move completed items in TODO #14 to DONE.md.
- This should be done by Stebbi, not automated.

---

## 4. Questions for Stebbi and Codex to answer before implementation starts

1. **Phase 14A preflight**: Is Stebbi willing to run the read-only preflight SQL in
   Supabase before sql/41 is applied? Claude Code recommends yes to confirm current
   `profiles_select` state.

2. **Phase 14B timing and dependency**: Should 14.3 be done now or deferred until just
   before TODO #9? If now, is Upstash Redis acceptable as a dependency?

3. **`minn-profill` server guard**: Should Claude Code add a server-side layout guard for
   `/auth-mvp/minn-profill` as part of 14C? Five lines of code. Makes protection explicit
   and testable. Claude Code recommends yes.

4. **Phase order**: Claude Code proposes 14A, then 14C, then 14B (or deferred), then 14D.
   Does Stebbi agree?

5. **`guardTeskeidAccess()` deprecation note**: When 14C adds `guardTeskeidSession()`,
   should Claude Code add a comment to `guardTeskeidAccess()` noting it will be replaced
   in TODO #9? Or leave it clean until then?

6. **`/api/teskeid/profile` in PUBLIC_PATHS**: Should this route be removed from
   `PUBLIC_PATHS` so the middleware session refresh runs for it? Low severity but easy
   to fix in 14C. Needs Stebbi's call.

---

## 5. Phase size judgment

- **14A** (profiles migration): Small. One SQL file, no app code change likely. Safe to
  deploy alone.
- **14B** (rate-limit): Medium. Decision needed. Recommended to defer.
- **14C** (session/feature split): Medium. Additive changes, low risk. Safe to deploy
  alone after 14A.
- **14D** (tests/docs): Small. Should follow each phase, not be batched.

Claude Code does not recommend combining any two phases into one deploy. Each phase is
independently verifiable and independently reversible. Combined deploys increase blast
radius with no benefit.

---

## 6. Open risks not addressed in any phase

- **`minn-profill` client-side logout** calls `supabase.auth.signOut()` and redirects to
  `/innskraning`. Correct behavior. The server-side session cookie is invalidated on the
  next Supabase middleware refresh. Standard Supabase behavior, acceptable for beta.

- **`auth_mvp_allowlist` timing**: The allowlist is currently doing double duty as both
  "who can log in" and "who can use lanad-og-skilad". Phase 14C starts to separate these
  concerns, but the full separation does not land until TODO #9. This is understood and
  intentional.

- **Loan RPCs are service_role-only** (confirmed in sql/32 and sql/34). No RLS exposure
  risk from the loan feature.
