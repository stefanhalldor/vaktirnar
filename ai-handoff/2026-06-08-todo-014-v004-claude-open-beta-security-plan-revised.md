# TODO #14 - Open Beta Security Plan (Revised)

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v004
**Revises:** 2026-06-08-todo-014-v002-claude-open-beta-security-plan.md
**Addresses:** 2026-06-08-todo-014-v003-codex-open-beta-security-plan-review.md

---

## Corrections from v002

Codex found four issues in v002. Claude Code accepts all four.

**High - 14.3 cannot be deferred:**
Codex is right. Stebbi wants to finish TODO #14 completely, and the TODO launch rule says
all six subitems must be solved before #9. Option C (defer) was wrong. 14.3 is required.
Additionally, non-allowlisted emails still cause a `login_waitlist` DB write on every
request, which a single IP can trigger at unlimited volume today. 14.3 must be implemented.

**High - 14C must be behavioral, not additive only:**
Codex is right. Adding `guardTeskeidSession()` without actually using it for `/auth-mvp/heim`
does not satisfy TODO #14.5. The phase must wire the new helpers at real call sites.
This is safe now because `verify-code/route.ts` lines 25-28 still prevents non-allowlisted
emails from creating sessions - only allowlisted users can reach `/heim` regardless.

**Medium - 14A co-parent profile claim was wrong:**
`app/(app)/children/[id]/page.tsx` lines 29-32 selects `parent:profiles(id, display_name)`
for all parents of a child via the authenticated client. Tightening `profiles_select` to
`USING (id = auth.uid())` will return null/empty display_name for co-parents if
`LEGACY_ENABLED=true`. The v002 claim "No Krakkavaktin flow breaks" was incorrect.
An explicit decision from Stebbi is required before 14A proceeds.

**Medium - PUBLIC_PATHS for `/api/teskeid/profile`:**
Codex is right. Removing the route from `PUBLIC_PATHS` would cause middleware to redirect
unauthenticated callers to `/login` (HTML redirect), not return JSON 401. The client in
`minn-profill/page.tsx` checks `res.status === 401` to redirect to `/innskraning`. That
check would stop working. Do not touch `PUBLIC_PATHS` in this plan. Mitigate by adding a
server-side layout guard for `/auth-mvp/minn-profill` instead.

---

## 1. What is already done

| Done | Evidence |
|------|----------|
| **14.1 Legacy isolation** | `LEGACY_ENABLED` env var + middleware blocks all legacy routes. `guardLegacyAccess()` adds entitlement check server-side for all 13 legacy API routes and layouts. `legacy_access` table is service_role-only. **Commit 6837467, sql/39 + sql/40.** |
| **14.4 Atomic OTP** | `verify_user_otp_code` and `verify_admin_otp_code` RPCs with `FOR UPDATE` locking. 32-byte secret enforced. **Commit 6837467, sql/38.** |
| **14.6 Log safety** | No dynamic values in any `console.error/warn` in `app/api/**` or server helpers. AST regression test. **Commit 6837467.** |

Remaining: **14.2** (profiles hardening), **14.3** (IP/abuse rate-limit), **14.5** (session
vs feature access).

---

## 2. Phase 14A: Profiles hardening

### Decision required from Stebbi BEFORE implementation

`app/(app)/children/[id]/page.tsx` lines 29-32 reads co-parent display names via the
authenticated Supabase client:

```typescript
const { data: parentRows } = await supabase
  .from('parent_child')
  .select('role, parent:profiles(id, display_name)')
  .eq('child_id', id)
```

This is a cross-user profile read. Changing `profiles_select` to `USING (id = auth.uid())`
will cause this join to return `null` for the `parent` column for all co-parents (not the
calling user). The page renders `row.parent.display_name || '-'` so it will show `-` for
every co-parent. No error, no crash, but the names disappear.

**Two paths. Stebbi must choose one.**

**Path A (recommended):** Accept the breakage for `LEGACY_ENABLED=true`.
`LEGACY_ENABLED=false` is the production setting and the legacy app is not a live public
product. Document that co-parent display in `/children/[id]` is intentionally not
preserved under the hardened policy. The Krakkavaktin SQL loan RPCs that join profiles
are all service_role (BYPASSRLS) and are unaffected.

**Path B (more work):** Before tightening `profiles_select`, add a narrow service_role
RPC or database view for co-parent display names in the children page. Replace the
authenticated client join with a server-side call to the RPC. Then tighten the policy.
This adds a separate preparatory step before sql/41 and requires changes to the legacy
children page.

Claude Code recommends Path A. Codex review may have a view on this too.

### Migration (once path is confirmed)

**Files to inspect:**
- `sql/01_schema.sql` line 184
- `sql/26_profiles_auth_mvp.sql`
- `sql/32_loan_functions.sql` (all profile JOINs confirmed in service_role RPCs)
- `app/auth-mvp/heim/page.tsx`
- `app/api/teskeid/profile/route.ts`
- `app/(app)/children/[id]/page.tsx` (the affected legacy page)

**Files likely to change:**
- New: `sql/41_profiles_select_own.sql`
- If Path B: also `app/(app)/children/[id]/page.tsx` + new RPC

**sql/41 (schema change only, no data mutation):**

```sql
-- sql/41_profiles_select_own.sql
-- RLS policy change: authenticated users may only read their own profile row.
-- Service_role RPCs (loan functions, legacy RPCs) are unaffected - BYPASSRLS.
-- If LEGACY_ENABLED=true, /children/[id] co-parent display will show blank (Path A).
-- See ai-handoff/2026-06-08-todo-014-v004 for decision context.
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

**Preflight (read-only, run in Supabase SQL Editor before applying sql/41):**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```
Confirms current `profiles_select` state. If `qual` already says `(id = auth.uid())`,
the migration is already done.

**Effects:**
- `authenticated`: loses cross-user profile reads.
- `service_role` (BYPASSRLS): no change. All loan RPCs, legacy RPCs unaffected.
- `anon`: already no access.

**Tests:**
- Authenticated user cannot read another user's profile row (empty result, no error).
- Own-profile reads on `heim/page` and profile API still work correctly.
- If Path A: assert that `children/[id]` page renders `-` for co-parent names when
  `LEGACY_ENABLED=false` (page is blocked entirely by middleware anyway).

**Deploy order:**
1. Stebbi confirms Path A or B.
2. Run preflight SQL (read-only).
3. Apply sql/41.
4. No app code change needed for Path A.

**Judgment:** Small. Do not split further.

---

## 3. Phase 14B: IP/abuse rate-limit

This is required for TODO #14 to be complete. It cannot be deferred.

### Concrete choice for Stebbi

**Option A: Upstash Redis**

- Add `@upstash/ratelimit` and `@upstash/redis` packages.
- Two new env vars: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- No SQL migration.
- Sliding window algorithm built in.
- Automatic TTL. No cleanup needed.
- Fail-closed: if Upstash is unreachable, deny the request and return `{ success: true }`.

The existing TODO comment in `request-code/route.ts` already references Upstash by name.

**Option B: Supabase table (Codex preference)**

- New table `public.auth_ip_rate_limit` in sql/42.
- IP is never stored raw. Key is `HMAC(ip, daily_salt)` where `daily_salt = HMAC(today_date, AUTH_CODE_SECRET)`. Salt rotates automatically each day without any secret rotation.
- Sliding window implemented via upsert RPC.
- Periodic cleanup needed (add to existing 24h code cleanup in `createUserCode`, or a
  separate cron).
- No external dependency.
- Adds one DB roundtrip to every `request-code` call.
- Fail-closed: if DB upsert fails, deny the request and return `{ success: true }`.

**Comparison:**

| | Option A (Upstash) | Option B (Supabase) |
|---|---|---|
| External dependency | Yes | No |
| New env vars | 2 | 0 |
| SQL migration | No | Yes (sql/42) |
| Cleanup | Automatic | Manual / cron |
| Latency | ~10ms (edge) | ~20-30ms (DB) |
| Operational complexity | New service to manage | Single system |
| Fail-closed possible | Yes | Yes |

Claude Code can implement either. Codex prefers Option B. Stebbi decides.

### Implementation sketch (Option B)

**sql/42 (schema + RPC):**
```sql
CREATE TABLE IF NOT EXISTS public.auth_ip_rate_limit (
  key_hash      text        NOT NULL,
  window_bucket timestamptz NOT NULL,  -- truncated to 15-min window
  request_count int         NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_hash, window_bucket)
);
REVOKE ALL ON public.auth_ip_rate_limit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_ip_rate_limit TO service_role;
-- RPC: atomic upsert; returns true if allowed, false if over limit
```

**lib/auth/ip-rate-limit.ts:**
```typescript
// HMAC(ip, HMAC(today, AUTH_CODE_SECRET)) — no raw IP stored
// Window: 15 minutes, max 10 requests
// Fail-closed: any DB error -> return false (deny)
export async function checkIpRateLimit(ip: string): Promise<boolean>
```

**request-code/route.ts change:**
```typescript
// Before allowlist check and before createUserCode:
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
const allowed = await checkIpRateLimit(ip)
if (!allowed) {
  return NextResponse.json({ success: true })  // generic response, no leak
}
```

**Tests:**
- Same IP, 10+ requests in window: 11th request gets generic success but no code/email.
- DB error: no code created, generic success returned (fail-closed).
- Response for rate-limited request is byte-identical to success response (no leak).
- Different IPs: each has independent counter.

**Deploy order:**
1. Apply sql/42 (schema + RPC).
2. Deploy app with `checkIpRateLimit` added.

**Judgment:** Medium complexity. The implementation is clear regardless of which option
is chosen. Can be done after 14A and 14C independently.

---

## 4. Phase 14C: Session vs feature access (behavioral)

This phase must wire the new helpers at real call sites, not just define them.

### What changes

**`lib/auth/guard.ts` - add `guardTeskeidSession()`:**

New function: `AUTH_MVP_ENABLED` flag + session + email present. No allowlist check.

`guardTeskeidAccess()` remains exactly as-is. It is not deleted. It is not called from
`heim/page.tsx` anymore.

**`app/auth-mvp/heim/page.tsx` - use `guardTeskeidSession()`:**

Line 52 changes from `guardTeskeidAccess()` to `guardTeskeidSession()`. This is safe
because `verify-code/route.ts` lines 25-28 still gate session creation on the allowlist.
Only allowlisted users can create a session and reach this page. The behavior is identical
today, but the page now expresses "session only" intent clearly, which is correct for
when #9 removes the allowlist check from verify-code.

**`lib/loans/guard.ts` - add `guardFeatureAccess()`, update `guardLoanAccess()`:**

`guardFeatureAccess('lanad-og-skilad')`: checks `LOANS_ENABLED` env var + allowlist.
`guardLoanAccess()`: calls `guardTeskeidSession()` then `guardFeatureAccess('lanad-og-skilad')`.
Old behavior is preserved because the composition is equivalent to the old function.

**`app/auth-mvp/minn-profill/` - add server-side layout:**

New file: `app/auth-mvp/minn-profill/layout.tsx`
Calls `guardTeskeidSession()`. If no session, redirects to `/innskraning`. The page
itself stays as `'use client'`. The layout is a server component that wraps it.
This gives explicit, testable server-side protection.

Note: `/api/teskeid/profile` stays in `PUBLIC_PATHS` as-is. The API returns JSON 401
correctly via its own auth check. Removing it from `PUBLIC_PATHS` is not part of this
plan (see Codex review finding).

### Files to inspect

- `lib/auth/guard.ts`
- `lib/loans/guard.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/lanad-og-skilad/layout.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `lib/__tests__/guard.test.ts`

### Files likely to change

- `lib/auth/guard.ts` (add `guardTeskeidSession()`)
- `lib/loans/guard.ts` (add `guardFeatureAccess()`, update `guardLoanAccess()`)
- `app/auth-mvp/heim/page.tsx` (use `guardTeskeidSession()` instead of `guardTeskeidAccess()`)
- New: `app/auth-mvp/minn-profill/layout.tsx`
- `lib/__tests__/guard.test.ts` (new tests)

No SQL migration needed.

### Tests

- `guardTeskeidSession()`: redirects when `AUTH_MVP_ENABLED` is false.
- `guardTeskeidSession()`: redirects when session is missing.
- `guardTeskeidSession()`: returns user when session is valid regardless of allowlist.
- `guardFeatureAccess('lanad-og-skilad')`: redirects when `LOANS_ENABLED` is false.
- `guardFeatureAccess('lanad-og-skilad')`: redirects when email not on allowlist.
- `guardLoanAccess()`: behavior identical to current `guardLoanAccess()`.
- `guardTeskeidAccess()`: all existing tests still pass (function unchanged).
- Static: `heim/page.tsx` calls `guardTeskeidSession()`, not `guardTeskeidAccess()`.
- Static: `minn-profill/layout.tsx` calls `guardTeskeidSession()`.

### Deploy order

1. Deploy (additive + call-site changes). No SQL needed.

### Judgment

Medium complexity, low risk. The behavioral change at `heim/page.tsx` is safe because
session creation is still allowlist-gated. `guardTeskeidAccess()` is kept intact.

---

## 5. Phase 14D: Final tests and TODO/DONE update

**This phase only runs after 14.2, 14.3, and 14.5 are all implemented, tested, and
accepted. TODO #14 does not move to DONE while any required subitem is deferred or
incomplete.**

**Regression test checklist:**
- Unauthenticated user: redirected from `/auth-mvp/heim` and `/auth-mvp/minn-profill`
  to `/innskraning`.
- Unauthenticated user: redirected from `/auth-mvp/lanad-og-skilad` to `/innskraning`.
- Non-allowlisted user: gets `{ success: true }` from `request-code`, cannot proceed
  through `verify-code` (returns `invalid_code`).
- Allowlisted user: full access to all Teskeid surfaces.
- Direct URL to any loan page: layout guard fires server-side.
- Server actions: `guardLoanAccess()` called in every action (`lib/loans/actions.ts`,
  all exported functions).
- `p_actor_id` in all RPCs comes from server-side `user.id` only.
- IP rate-limit: same IP gets `{ success: true }` after threshold with no code created.
- Rate-limit fail-closed: DB error causes no code creation, generic response.
- Production logs: no emails, codes, or tokens in any `console.error/warn`.
- `profiles_select`: authenticated user cannot read another user's profile row.

**Documentation:**
- Stebbi moves completed TODO #14 items to DONE.md after reviewing and accepting results.
- Claude Code does not move TODO/DONE.md unless Stebbi asks.

---

## 6. Phase order

Recommended:

1. **14A** (profiles) - smallest, safest, needs Stebbi path decision first
2. **14C** (session/feature split) - no SQL, additive + behavioral wiring, independent
3. **14B** (rate-limit) - needs Stebbi option decision (Upstash vs Supabase)
4. **14D** (regression + DONE) - only after 14.2, 14.3, 14.5 all accepted

14B and 14C can be done in either order if Stebbi prefers. They do not depend on each other.

---

## 7. Questions Stebbi must answer before any implementation begins

1. **14A Path A or B**: Accept that co-parent display in `/children/[id]` breaks if
   `LEGACY_ENABLED=true` (Path A, recommended), or add a narrow RPC first (Path B)?

2. **14B Upstash vs Supabase**: Option A (Upstash, external dependency, simpler) or
   Option B (Supabase table, no external dep, Codex preference)?

3. **Phase order**: 14A, 14C, 14B, 14D as proposed, or different?

Once Stebbi gives go-ahead on these three points, Claude Code can begin with Phase 14A.
No implementation starts until Stebbi confirms.
