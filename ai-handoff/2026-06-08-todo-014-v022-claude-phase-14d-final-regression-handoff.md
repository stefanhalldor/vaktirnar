# Handoff v022 — Claude Code: Phase 14D complete — TODO #14 done

**Date:** 2026-06-08
**Author:** Claude Code
**Phase:** 14D — Final regression tests and TODO/DONE update
**For:** Codex final review / Stebbi deployment sign-off

---

## Files changed

| File | Change |
|---|---|
| `lib/auth/ip-rate-limit.ts` | Fixed dynamic `console.error` (removed `, error.code`) |
| `lib/__tests__/ip-rate-limit.test.ts` | sql/42 static contract tests added (16 new tests) |
| `lib/__tests__/log-safety.test.ts` | `lib/auth/ip-rate-limit.ts` and `lib/loans/guard.ts` added to scan scope |
| `TODO.md` | #14 removed from priority table, marked `Lokið — 2026-06-08` |
| `DONE.md` | #14 entry added |

No SQL was run.

---

## Log safety fix

`lib/auth/ip-rate-limit.ts` had one dynamic `console.error`:

```typescript
// Before:
console.error('[ip-rate-limit] RPC error:', error.code)

// After:
console.error('[ip-rate-limit] RPC error — fail open')
```

`error.code` was removed. The static message is sufficient for operational diagnosis without leaking any DB error detail. This now passes the log-safety AST scan.

---

## New log-safety scope coverage

`lib/auth/ip-rate-limit.ts` and `lib/loans/guard.ts` added to `SERVER_HELPERS` in `log-safety.test.ts`. Both now fail the build if a future change introduces a dynamic console.error/warn argument.

---

## sql/42 static contract (16 new tests in `ip-rate-limit.test.ts`)

Mirrors the contract test pattern from `sql/38` in `otp-verification.test.ts`:

| Test | Invariant |
|---|---|
| defines `check_and_increment_ip_rate_limit` | function name correct |
| declares `SECURITY DEFINER` | runs as owner |
| sets `search_path = public` | no search_path injection |
| creates `otp_ip_rate_limit` table | table present |
| enables RLS | no anon/authenticated access via client |
| creates `window_date` index | bounded cleanup scan is indexed |
| bounded DELETE uses `LIMIT 100` | no unbounded scan |
| REVOKEs EXECUTE from PUBLIC | default grant removed |
| REVOKEs EXECUTE from anon | explicit |
| REVOKEs EXECUTE from authenticated | explicit |
| GRANTs EXECUTE to service_role | only path to call the RPC |
| does not GRANT to PUBLIC/anon/authenticated | grant lines clean |
| REVOKEs table access from PUBLIC/anon/authenticated | table locked down |
| GRANTs table access to service_role | service_role can write |
| wrapped in transaction (BEGIN/COMMIT) | atomic migration |
| stores `ip_hash`, not `ip` | no raw IP column |

---

## Final status of all six TODO #14 launch-blockers

| Blocker | Status | Test coverage |
|---|---|---|
| 1. Isolate Teskeid from legacy app surfaces | Done — `LEGACY_ENABLED` flag, middleware | `legacy-guard.test.ts` (38 tests) |
| 2. Harden `profiles` access | Done — sql/41 applied in production | `profiles-14a.test.ts` (10 tests) |
| 3. IP/abuse rate-limit on `request-code` | Done — `lib/auth/ip-rate-limit.ts` + `sql/42` written | `ip-rate-limit.test.ts` (43 tests) + `request-code.test.ts` |
| 4. Atomic OTP verification | Done — sql/38 applied in production | `otp-verification.test.ts` (30+ tests) |
| 5. Session/feature access split | Done — `guardTeskeidSession`, `checkFeatureAccess` | `guard.test.ts`, `home-page.test.tsx`, `teskeid-profile-route.test.ts` |
| 6. PII out of production logs | Done — AST scanner + manual tests | `log-safety.test.ts` (50+ files), `auth-log.test.ts` |

---

## TODO.md and DONE.md

- Priority table: #14 row removed, rows renumbered 1–15.
- `#9 Opin innskráning` dependency updated: "eftir #14, #16 og #4" → "eftir #16 og #4" (since #14 is done).
- `#14` section in TODO.md: status changed from `Bíður` to `Lokið — 2026-06-08`.
- DONE.md: full #14 entry added with per-blocker summary, file list, and remaining deployment steps.

---

## Final test results

```
Test Files  28 passed (28)
Tests       813 passed | 22 skipped | 8 todo (843)
```

Up from 795 before Phase 14D.

---

## `git status --short`

```
 M DONE.md
 M TODO.md
 M app/api/auth-mvp/request-code/route.ts
 M app/api/teskeid/profile/route.ts
 M app/auth-mvp/heim/page.tsx
 M lib/__tests__/guard.test.ts
 M lib/__tests__/home-page.test.tsx
 M lib/__tests__/log-safety.test.ts
 M lib/__tests__/request-code.test.ts
 M lib/auth/guard.ts
 M lib/loans/guard.ts
?? .obsidian/
?? ai-handoff/ (v012–v021)
?? app/auth-mvp/minn-profill/layout.tsx
?? app/preview/favicons/
?? app/preview/teskeid-logo/
?? lib/__tests__/ip-rate-limit.test.ts
?? lib/__tests__/teskeid-profile-route.test.ts
?? lib/auth/ip-rate-limit.ts
?? public/favicon-options/
?? scripts/
?? sql/42_ip_rate_limit.sql
?? sql/preflight/
```

Untracked `.obsidian/`, `app/preview/`, `public/favicon-options/`, `scripts/`, `sql/preflight/` are local-only and unrelated to TODO #14.

---

## Remaining deployment steps before open beta

The following must be done before removing the allowlist or opening login generally:

1. **Run `sql/42_ip_rate_limit.sql` in Supabase production** — until this is applied, `checkIpRateLimit()` fails open on every call.
2. **Verify `AUTH_CODE_SECRET` is at least 32 bytes in production** — if not set or too short, both OTP hashing and IP rate-limit hashing fail open.
3. **Verify Vercel/proxy supplies `x-forwarded-for` or `x-real-ip`** — IP rate-limit fails open when no header is present.

Items 2 and 3 are expected to already be in place; item 1 is new for this release.

---

## Production config checks still required

| Check | Consequence if missing |
|---|---|
| `AUTH_MVP_ENABLED=true` | All Teskeid routes return 404/redirect |
| `LOANS_ENABLED=true` | Loan UI hidden, `checkFeatureAccess` returns false |
| `AUTH_CODE_SECRET` >= 32 bytes | OTP hashing throws; IP hashing fails open |
| `RESEND_API_KEY` set | OTP emails not sent (logged, not thrown) |
| `sql/42` applied | IP rate-limit fails open silently |
| Trusted IP header from proxy | IP rate-limit fails open silently |
