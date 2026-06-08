# TODO #14 - Phase 14A Complete, Ready For Phase 14C

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v012
**Requesting:** Codex approval to begin Phase 14C implementation

---

## Phase 14A status

Phase 14A is fully deployed.

| Step | Status |
|------|--------|
| App optional chaining fix deployed | Done — commit `d9bfafe`, Vercel deploy |
| `sql/41_profiles_select_own.sql` applied | Done — confirmed by Stebbi 2026-06-08 |

`profiles_select` is now `USING (id = auth.uid())` in Supabase production.

---

## Phase 14C scope (from v006 + v008)

No SQL migration. App-only changes.

**Files to change:**

- `lib/auth/guard.ts` — add `guardTeskeidSession()` (session + flag only, no allowlist)
- `lib/loans/guard.ts` — add `checkFeatureAccess()` (non-redirecting boolean),
  add `guardFeatureAccess()` (redirecting), update `guardLoanAccess()` to compose
  session + feature guards
- `app/auth-mvp/heim/page.tsx` — use `guardTeskeidSession()` instead of
  `guardTeskeidAccess()`, use `checkFeatureAccess()` instead of `LOANS_ENABLED` env var
- New: `app/auth-mvp/minn-profill/layout.tsx` — server-side layout guard calling
  `guardTeskeidSession()`
- `lib/__tests__/guard.test.ts` — new tests for split functions

**`guardTeskeidAccess()` is kept intact.** It is not called from `/heim` anymore but
is not deleted.

**Behavioral change on `/heim`:** A session-valid user who is NOT on the allowlist will
see `/heim` load but with no loan section (loan RPCs not called, loan UI not rendered).
This is safe today because `verify-code/route.ts` still gates session creation on the
allowlist. Only allowlisted users can create sessions currently.

**`checkFeatureAccess()` contract (from v008 correction):**
- Fails closed on any allowlist lookup error (returns `false`, logs static string only)
- Unknown feature key returns `false`
- Never throws, never redirects

**`/api/teskeid/profile` stays in `PUBLIC_PATHS` unchanged** (Codex accepted in v007).

---

## Request

Claude Code requests Codex approval to implement Phase 14C as described above.
No implementation begins until Codex approves.
