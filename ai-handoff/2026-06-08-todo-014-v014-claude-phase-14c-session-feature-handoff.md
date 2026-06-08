# Handoff v014 — Claude Code: Phase 14C complete, ready for review

**Date:** 2026-06-08
**Author:** Claude Code
**Phase:** 14C — Session/feature guard split
**For:** Codex review before Phase 14B starts

---

## Summary

Phase 14C is fully implemented and all 760 tests pass (27 test files, 0 failures, 22 skipped/todo unchanged).

---

## Changes made

### `lib/auth/guard.ts`

- Added `guardTeskeidSession()`: checks `AUTH_MVP_ENABLED` flag + Supabase session. Redirects to `/` if flag is off; redirects to `/innskraning` if no session. Does NOT check allowlist.
- Refactored `guardTeskeidAccess()` to compose from `guardTeskeidSession()` + allowlist check. Behaviour unchanged for existing callers.
- Both return `{ user }` (same `TeskeidAccess` type).

### `lib/loans/guard.ts`

- Added `checkFeatureAccess(userId, email, featureKey)`: non-redirecting, fail-closed boolean.
  - Unknown `featureKey` returns `false` immediately.
  - Returns `false` if `LOANS_ENABLED !== 'true'`.
  - Calls `isAuthMvpAllowedEmail(email.toLowerCase().trim())`.
  - Catches allowlist errors and returns `false` (fail-closed).
- Added `guardFeatureAccess(email, featureKey)`: calls `checkFeatureAccess` and `redirect('/')` if false.
- Updated `guardLoanAccess()`: checks `LOANS_ENABLED` first (redirects `/` if off), then calls `guardTeskeidSession()`, then `guardFeatureAccess()`.

### `app/auth-mvp/heim/page.tsx`

- Switched from `guardTeskeidAccess()` to `guardTeskeidSession()`. The home page is accessible to all authenticated Teskeid users; loans section is conditionally shown.
- Replaced `process.env.LOANS_ENABLED === 'true'` with `await checkFeatureAccess(user.id, user.email!, 'lanad-og-skilad')`. Loans section is shown only when LOANS_ENABLED=true AND email is on allowlist.

### `app/auth-mvp/minn-profill/layout.tsx` (new)

- Server-side layout guard using `guardTeskeidSession()`. Profile pages require session but not allowlist membership.

### `app/api/teskeid/profile/route.ts`

- Added `AUTH_MVP_ENABLED !== 'true'` guard returning 404 to both GET and PATCH handlers.
- Route remains in `PUBLIC_PATHS` in middleware (session check is inside the handler, consistent with v007 decision).

### `lib/__tests__/guard.test.ts`

- Added describe blocks covering `guardTeskeidSession`, `checkFeatureAccess`, and `guardFeatureAccess`.
- Tests cover: flag redirect, session redirect, no allowlist check for session-only, unknown feature key returns false, LOANS_ENABLED=false returns false, allowlist error is fail-closed, redirect on access denied.

### `lib/__tests__/home-page.test.tsx`

- Updated mock: `mockGuardTeskeidAccess` replaced with `mockGuardTeskeidSession`.
- Added `mockCheckFeatureAccess` for `@/lib/loans/guard`.
- Updated `setupGuard(featureAccess = true)` helper.
- Updated all tests that referenced `process.env.LOANS_ENABLED = 'false'` to use `setupGuard(false)` instead.

### `lib/__tests__/teskeid-profile-route.test.ts` (new)

- Tests GET and PATCH returning 404 when `AUTH_MVP_ENABLED` is off (with or without flag).
- Tests 401 when flag is on but no session.
- Tests 400 for invalid body (PATCH).
- Tests 200 happy path for both methods.

---

## Invariants verified by tests

| Invariant | Test file |
|---|---|
| `guardTeskeidSession` redirects `/` when flag off | guard.test.ts |
| `guardTeskeidSession` redirects `/innskraning` when no session | guard.test.ts |
| `guardTeskeidSession` does NOT check allowlist | guard.test.ts |
| `guardTeskeidAccess` still redirects `/` for non-allowlisted | guard.test.ts |
| `checkFeatureAccess` unknown key returns false | guard.test.ts |
| `checkFeatureAccess` LOANS_ENABLED=false returns false | guard.test.ts |
| `checkFeatureAccess` allowlist error returns false (fail-closed) | guard.test.ts |
| `guardFeatureAccess` redirects `/` when denied | guard.test.ts |
| Home page hides Nýlegt and loans link when featureAccess=false | home-page.test.tsx |
| Profile route returns 404 when AUTH_MVP_ENABLED off | teskeid-profile-route.test.ts |

---

## Test results

```
Test Files  27 passed (27)
Tests       760 passed | 22 skipped | 8 todo (790)
```

---

## What Codex should review

1. **Guard composition correctness**: `guardTeskeidAccess` now calls `guardTeskeidSession` internally -- confirm no double-session-check overhead concern.
2. **`minn-profill` layout**: uses `guardTeskeidSession` (session-only, no allowlist). Is this the right guard for profile pages? Any allowlisted-only concern?
3. **Profile route PUBLIC_PATHS**: route is still in `PUBLIC_PATHS`; the 404 for disabled flag and 401 for no session are handled inside the handler. Confirm this is still acceptable.
4. **`checkFeatureAccess` signature**: takes `_userId` as first param but currently ignores it. This was intentional to allow future per-user overrides without changing call sites.
5. **Home page `user.email!` non-null assertion**: safe because `guardTeskeidSession` already confirmed `user.email` exists (`if (!user?.email) redirect`). Confirm no concern.

---

## Next phase

**Phase 14B: IP/abuse rate-limit**

- `sql/42_ip_rate_limit.sql`: new table `otp_ip_rate_limit`, service_role-only RPC `check_and_increment_ip_rate_limit` with bounded DELETE inside.
- `lib/auth/ip-rate-limit.ts`: thin wrapper calling the RPC via admin client.
- `app/api/auth/request-code/route.ts`: call rate-limit check before `createUserCode`.
- Tests in `lib/__tests__/ip-rate-limit.test.ts`.

Awaiting Codex approval (v015) before starting 14B.
