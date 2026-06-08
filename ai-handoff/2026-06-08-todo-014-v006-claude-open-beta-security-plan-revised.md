# TODO #14 - Open Beta Security Plan (v006)

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v006
**Revises:** 2026-06-08-todo-014-v004-claude-open-beta-security-plan-revised.md
**Addresses:** 2026-06-08-todo-014-v005-codex-open-beta-security-plan-review.md

---

## Corrections from v004

**High - `/heim` feature access:**
Accepted. After 14C, `/heim` must not call loan RPCs or render loan UI based only on
`LOANS_ENABLED`. It must check server-side feature access per user. A non-redirecting
helper `checkFeatureAccess(userId, email, featureKey)` is needed alongside the
redirecting `guardFeatureAccess()`. Both are part of Phase 14C.

**Medium - 14A crash mode:**
Accepted. `app/(app)/children/[id]/page.tsx` line 52 uses `row.parent.id` - this crashes
with a null dereference if `parent` relation returns null after tightening
`profiles_select`. The plan must state: "crash, not blank names". Path A is still
recommended but requires 3 lines of defensive optional chaining in the legacy page.
The confused test from v004 is removed.

**Medium - sql/42 design:**
Accepted. The sketch in v004 was missing RLS enable, REVOKE grants, RPC privilege
grants, and a cleanup retention window. All four are included below.

**Medium - IP trust model:**
Accepted. The project already has a precedent in `app/api/votes/route.ts` lines 66-70
using `x-forwarded-for` first IP with `x-real-ip` fallback. That same pattern is used
here with one addition: `unknown` bucket is rate-limited as a shared bucket.

**Low - AUTH_CODE_SECRET reuse for rate-limit HMAC:**
Accepted explicitly. See Section 3.

---

## 1. What is already done (unchanged)

| Done | Evidence |
|------|----------|
| **14.1 Legacy isolation** | Commit 6837467, sql/39 + sql/40. |
| **14.4 Atomic OTP** | Commit 6837467, sql/38. |
| **14.6 Log safety** | Commit 6837467. |

Remaining: 14.2 (profiles), 14.3 (IP rate-limit), 14.5 (session/feature split).

---

## 2. Phase 14A: Profiles hardening

### Decision required from Stebbi

**The real failure mode for Path A:**
After tightening `profiles_select` to `USING (id = auth.uid())`, the embedded relation
`parent:profiles(id, display_name)` in `app/(app)/children/[id]/page.tsx` returns `null`
for any co-parent who is not the calling user. Line 52 then does `row.parent.id` which
**crashes with a null-dereference runtime error**, not just shows blank names.

**Path A (recommended):** Accept the behavior. Add 3 lines of defensive optional chaining
to `app/(app)/children/[id]/page.tsx` so the page degrades gracefully instead of crashing.
`LEGACY_ENABLED=false` is the production setting so the page is middleware-blocked in
production. The optional chaining is defensive and protects local dev and any future
`LEGACY_ENABLED=true` scenario.

**Path B:** Add a narrow service_role RPC for co-parent display names before tightening
`profiles_select`. More work, preserves legacy behavior fully.

Claude Code recommends Path A with defensive optional chaining. Stebbi must confirm.

### Changes for Path A

**Files to change:**
- New: `sql/41_profiles_select_own.sql`
- Modified: `app/(app)/children/[id]/page.tsx` (optional chaining on `row.parent`)

**sql/41:**
```sql
-- sql/41_profiles_select_own.sql
-- Schema change only. No data mutation. No INSERT, UPDATE, DELETE, DROP TABLE.
-- Effects: authenticated users can only read their own profile row.
-- Service_role (BYPASSRLS) and all loan RPCs: unaffected.
-- Legacy page /children/[id]: co-parent names disappear (Path A accepted).
-- Rollback: see bottom of this file.
BEGIN;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Rollback (paste into Supabase SQL Editor if needed):
-- DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
-- CREATE POLICY "profiles_select" ON public.profiles
--   FOR SELECT TO authenticated USING (true);

COMMIT;
```

**Defensive optional chaining in `children/[id]/page.tsx`:**
```typescript
// Before:
<div key={row.parent.id} ...>
  <Avatar name={row.parent.display_name || '?'} size="sm" />
  <p>{row.parent.display_name || '-'}</p>

// After:
<div key={row.parent?.id ?? 'unknown'} ...>
  <Avatar name={row.parent?.display_name || '?'} size="sm" />
  <p>{row.parent?.display_name || '-'}</p>
```

**Preflight (read-only, run in Supabase before sql/41):**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public';
```

**Tests:**
- Authenticated user cannot read another user's profile row (returns empty, not error).
- Own-profile reads on `heim/page` and profile API still work.
- `children/[id]/page.tsx` renders `-` for co-parent names without crashing
  (relevant in local dev only; middleware blocks in production when `LEGACY_ENABLED=false`).

**Deploy order:**
1. Stebbi confirms Path A.
2. Run preflight SQL.
3. Apply sql/41.
4. Deploy app with optional chaining fix.

---

## 3. Phase 14B: IP/abuse rate-limit (required)

### AUTH_CODE_SECRET reuse - explicit acceptance

Option B derives the IP-HMAC daily salt from `AUTH_CODE_SECRET`:
```
daily_salt = HMAC(today_date, AUTH_CODE_SECRET)
key_hash   = HMAC(raw_ip, daily_salt)
```

**Consequence of rotating `AUTH_CODE_SECRET`:**
1. All active OTP codes become invalid within their 10-minute TTL (already documented
   and accepted by Stebbi on 8. júní 2026).
2. All current IP rate-limit buckets also reset because the HMAC key changes. Attackers
   who were approaching the per-IP limit get a fresh window. This is a minor side effect
   and acceptable for a small beta.

**Decision: Claude Code recommends accepting `AUTH_CODE_SECRET` reuse.** No separate
`RATE_LIMIT_SECRET` env var is needed for this beta. The coupling is documented here.
If this becomes a concern at larger scale, a separate secret can be added later.

Stebbi must confirm this is acceptable, or ask for a separate `RATE_LIMIT_SECRET`.

### Option choice

**Option A (Upstash Redis):** External dependency. The existing TODO comment in
`request-code/route.ts` mentions it by name. Two new env vars.

**Option B (Supabase table):** No external dependency. One new sql/42 migration.
Codex preference. One extra DB roundtrip per request-code call (~20-30ms).

Claude Code can implement either. Codex prefers Option B. Decision from Stebbi needed.

### Vercel IP trust model

The project already uses this pattern in `app/api/votes/route.ts` lines 66-70:
```typescript
const forwarded = request.headers.get('x-forwarded-for')
const rawIp = forwarded
  ? forwarded.split(',')[0].trim()
  : request.headers.get('x-real-ip')
```

The rate-limit implementation follows the same convention:
- **Primary:** `x-forwarded-for`, first IP. On Vercel, this header is set by Vercel's
  edge infrastructure to the client IP. Clients cannot prepend a fake IP before Vercel's
  edge sees and overwrites the header.
- **Fallback:** `x-real-ip`.
- **Unknown:** If both headers are absent or empty, use the literal string `'unknown'`.
  This is not a bypass - `'unknown'` is rate-limited as a shared bucket with the same
  per-window limit. Any request that cannot be attributed to a real IP is treated as a
  single pool that can be exhausted.
- **IPv6:** Handled naturally. HMAC accepts any string. No special normalization needed.
- **Malformed values:** If `split(',')[0].trim()` produces an empty string, fall through
  to `'unknown'`. No further validation needed because HMAC handles arbitrary input.
- **Raw IP is never stored or logged anywhere.** Only `key_hash = HMAC(ip, daily_salt)`
  is written to the database.

### sql/42 (Option B, complete design)

```sql
-- sql/42_ip_rate_limit.sql
-- Feature: privacy-preserving per-IP sliding window rate limit for request-code.
-- No raw IPs stored. Key is HMAC(ip, daily_salt) computed in application layer.
-- Retention: rows older than 1 hour are deleted during createUserCode cleanup.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, idempotent grants.
-- No INSERT, UPDATE, DELETE, DROP TABLE on any other table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_ip_rate_limit (
  key_hash      text        NOT NULL,
  window_bucket timestamptz NOT NULL,  -- truncated to 15-minute window
  request_count int         NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_hash, window_bucket)
);

ALTER TABLE public.auth_ip_rate_limit ENABLE ROW LEVEL SECURITY;
-- No policies: all access is service_role-only. RLS enabled as hard default.

REVOKE ALL ON public.auth_ip_rate_limit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_ip_rate_limit TO service_role;

-- Atomic upsert-and-check RPC.
-- Returns TRUE if the request is allowed (count <= p_max).
-- Returns FALSE if over limit or on any internal error (fail-closed).
CREATE OR REPLACE FUNCTION public.check_and_increment_ip_rate_limit(
  p_key_hash     text,
  p_window_start timestamptz,
  p_max_requests int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.auth_ip_rate_limit (key_hash, window_bucket, request_count)
  VALUES (p_key_hash, p_window_start, 1)
  ON CONFLICT (key_hash, window_bucket)
  DO UPDATE SET request_count = auth_ip_rate_limit.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- fail closed
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(text, timestamptz, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(text, timestamptz, int)
  TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.check_and_increment_ip_rate_limit(text, timestamptz, int);
-- DROP TABLE IF EXISTS public.auth_ip_rate_limit;

COMMIT;
```

**Cleanup strategy:**
Rows older than 1 hour are deleted inside the existing `createUserCode()` cleanup pass
in `lib/auth/user-codes.ts`. The existing cleanup deletes `auth_email_codes` rows older
than 24 hours. A parallel delete of `auth_ip_rate_limit` rows older than 1 hour (four
15-minute windows) is added to the same function. No new cron needed.

### lib/auth/ip-rate-limit.ts sketch

```typescript
import 'server-only'
import { createHmac } from 'crypto'
import { getAdmin } from '@/lib/supabase/admin'

const WINDOW_MINUTES = 15
const MAX_REQUESTS   = 10  // per IP per 15-minute window
const UNKNOWN_MAX    = 20  // shared bucket for unidentifiable IPs (more generous)

// Returns true = request allowed, false = deny (rate limited or fail-closed).
// Raw IP is never stored or logged.
export async function checkIpRateLimit(rawIp: string | null): Promise<boolean> {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret) {
    console.error('[auth/ip-rate-limit] AUTH_CODE_SECRET not configured')
    return false  // fail closed
  }

  // Daily salt: rotates at midnight UTC without manual rotation.
  // Side effect: rotating AUTH_CODE_SECRET also resets rate-limit buckets.
  // See ai-handoff/v006 for explicit acceptance of this coupling.
  const today     = new Date().toISOString().slice(0, 10)  // 'YYYY-MM-DD'
  const dailySalt = createHmac('sha256', secret).update(today).digest('hex')
  const ip        = rawIp?.trim() || 'unknown'
  const keyHash   = createHmac('sha256', dailySalt).update(ip).digest('hex')

  // Truncate to 15-minute window
  const now       = Date.now()
  const bucket    = new Date(
    Math.floor(now / (WINDOW_MINUTES * 60 * 1000)) * (WINDOW_MINUTES * 60 * 1000)
  ).toISOString()

  const max = ip === 'unknown' ? UNKNOWN_MAX : MAX_REQUESTS

  const { data, error } = await getAdmin()
    .rpc('check_and_increment_ip_rate_limit', {
      p_key_hash:     keyHash,
      p_window_start: bucket,
      p_max_requests: max,
    })

  if (error) {
    console.error('[auth/ip-rate-limit] RPC failed')
    return false  // fail closed
  }

  return data === true
}
```

**request-code/route.ts change (added before allowlist check):**
```typescript
// Extract IP using same pattern as votes/route.ts
const forwarded = request.headers.get('x-forwarded-for')
const rawIp     = forwarded
  ? forwarded.split(',')[0].trim()
  : request.headers.get('x-real-ip')

// IP rate limit: fail-closed (false = deny). Generic response regardless.
const ipAllowed = await checkIpRateLimit(rawIp)
if (!ipAllowed) {
  return NextResponse.json({ success: true })
}
```

### Files to change

- New: `sql/42_ip_rate_limit.sql`
- New: `lib/auth/ip-rate-limit.ts`
- Modified: `lib/auth/user-codes.ts` (add cleanup of old rate-limit rows)
- Modified: `app/api/auth-mvp/request-code/route.ts` (add IP check before allowlist)
- New: `lib/__tests__/ip-rate-limit.test.ts`

### Tests

- Same IP, 10 requests in window: allowed. 11th: generic success, no code created.
- `unknown` IP, 20 requests: allowed. 21st: denied.
- DB RPC error: no code created, returns generic `{ success: true }`.
- Rate-limited response is byte-identical to a normal success response.
- Static: no `rawIp` value appears in any `console.error/warn` call.

### Deploy order

1. Apply sql/42.
2. Deploy app with `checkIpRateLimit` added.

---

## 4. Phase 14C: Session vs feature access (behavioral)

### `checkFeatureAccess` - new non-redirecting helper

The home page must decide whether to call loan RPCs and render loan UI based on
server-side feature access, not only on `LOANS_ENABLED`. It cannot redirect on failure
(that would block the home page entirely). It needs a boolean check.

**New: `lib/loans/guard.ts` exports `checkFeatureAccess(userId, email, featureKey)`:**
- Returns `true` if `LOANS_ENABLED=true` AND email is on `auth_mvp_allowlist`.
- Returns `false` otherwise. Never throws, never redirects.
- This is the non-redirecting companion to `guardFeatureAccess()`.

**New: `lib/auth/guard.ts` exports `guardTeskeidSession()`:**
- `AUTH_MVP_ENABLED` flag + session + email. No allowlist. Redirects on failure.

### `/auth-mvp/heim/page.tsx` changes

After `guardTeskeidSession()` returns `user`:
```typescript
// Replace: const loansEnabled = process.env.LOANS_ENABLED === 'true'
// With:
const loansEnabled = await checkFeatureAccess(user.id, user.email!, 'lanad-og-skilad')
```

RPCs are only called if `loansEnabled === true`. Loan UI is only rendered if
`loansEnabled === true`. Behavior is identical for current allowlisted users. When #9
opens sessions to all users, non-allowlisted users see `/heim` with no loan section.

### `guardLoanAccess()` composition

```typescript
// lib/loans/guard.ts
export async function guardLoanAccess(): Promise<LoanAccess> {
  const { user } = await guardTeskeidSession()               // session only
  await guardFeatureAccess(user.email!, 'lanad-og-skilad')   // feature only
  return { user }
}
```

`guardTeskeidAccess()` in `lib/auth/guard.ts` is kept exactly as-is. It is not called
from `/auth-mvp/heim` anymore. It is not deleted.

### `minn-profill` layout guard

New file: `app/auth-mvp/minn-profill/layout.tsx`
```typescript
import { guardTeskeidSession } from '@/lib/auth/guard'

export default async function MinnProfilLayout({ children }: { children: React.ReactNode }) {
  await guardTeskeidSession()
  return <>{children}</>
}
```

`/api/teskeid/profile` stays in `PUBLIC_PATHS` unchanged.

### Files to change

- `lib/auth/guard.ts` (add `guardTeskeidSession()`)
- `lib/loans/guard.ts` (add `checkFeatureAccess()`, add `guardFeatureAccess()`,
  update `guardLoanAccess()`)
- `app/auth-mvp/heim/page.tsx` (use `guardTeskeidSession()` + `checkFeatureAccess()`)
- New: `app/auth-mvp/minn-profill/layout.tsx`
- `lib/__tests__/guard.test.ts` (new tests for split functions)

No SQL migration needed.

### Tests

- `guardTeskeidSession()`: redirects when `AUTH_MVP_ENABLED` is false.
- `guardTeskeidSession()`: redirects when session missing.
- `guardTeskeidSession()`: returns user when session valid, regardless of allowlist.
- `checkFeatureAccess(...)`: returns `false` when `LOANS_ENABLED=false`.
- `checkFeatureAccess(...)`: returns `false` when email not on allowlist.
- `checkFeatureAccess(...)`: returns `true` when both conditions met.
- `guardFeatureAccess(...)`: redirects when `LOANS_ENABLED=false`.
- `guardFeatureAccess(...)`: redirects when email not on allowlist.
- `guardLoanAccess()`: equivalent behavior to current `guardLoanAccess()`.
- Static: `heim/page.tsx` imports `guardTeskeidSession`, not `guardTeskeidAccess`.
- Static: `minn-profill/layout.tsx` calls `guardTeskeidSession`.
- Functional: session-valid user NOT on allowlist can load `/heim` without loan section
  (loan RPCs not called, loan UI not rendered).
- All existing `guard.test.ts` tests still pass.

### Deploy order

1. Deploy (additive + call-site changes). No SQL needed.

---

## 5. Phase 14D: Final regression and TODO/DONE update

**Only runs after 14.2, 14.3, and 14.5 are all implemented, tested, and accepted.**

**Final regression checklist:**
- Unauthenticated user: redirected from `/auth-mvp/heim` and `/auth-mvp/minn-profill`.
- Unauthenticated user: redirected from `/auth-mvp/lanad-og-skilad`.
- Session-valid, non-allowlisted user: sees `/heim` with no loan section. Cannot access
  `/auth-mvp/lanad-og-skilad` (redirected). Cannot call loan actions or loan API.
- Allowlisted user: full access to all Teskeid surfaces.
- Direct URL to loan page: server-side layout guard fires.
- Loan server actions: `guardLoanAccess()` called in every action.
- IP rate-limit: same IP hits threshold, subsequent requests get generic success, no code.
- Rate-limit fail-closed: DB error causes no code generation, generic response.
- `profiles_select`: authenticated user cannot read another user's profile row.
- Production logs: no emails, codes, tokens, or raw IPs in any log output.

**TODO/DONE movement:** Stebbi moves TODO #14 items to DONE.md after reviewing results.
Claude Code does not touch TODO.md or DONE.md unless asked.

---

## 6. Phase order

1. **14A** (profiles + optional chaining) - needs Stebbi path confirmation first
2. **14C** (session/feature split + `/heim` feature check) - no SQL, independent of 14B
3. **14B** (IP rate-limit) - needs Stebbi option confirmation first (Upstash vs Supabase)
4. **14D** (regression + DONE) - only when 14.2, 14.3, 14.5 all accepted

14B and 14C can be done in either order if Stebbi prefers.

---

## 7. Questions for Stebbi before implementation starts

1. **14A Path A or B:** Accept crash risk + optional chaining fix (Path A, recommended),
   or add narrow RPC for co-parent names first (Path B)?

2. **14B Upstash vs Supabase:** Option A (Upstash, no SQL), or Option B (Supabase table,
   sql/42, Codex preference)?

3. **AUTH_CODE_SECRET reuse:** Accepted that rotating `AUTH_CODE_SECRET` also resets
   IP rate-limit buckets? Or should Claude Code add a separate `RATE_LIMIT_SECRET`?

4. **Phase order:** 14A, 14C, 14B, 14D as proposed, or different?

Claude Code does not begin implementation until Stebbi confirms these points and gives
explicit go-ahead.
