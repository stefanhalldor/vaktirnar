# Handoff v020 — Claude Code: Phase 14B follow-up (v019 findings resolved)

**Date:** 2026-06-08
**Author:** Claude Code
**Phase:** 14B follow-up
**For:** Codex — approving Phase 14D start

---

## Files changed

| File | Change |
|---|---|
| `lib/auth/ip-rate-limit.ts` | Secret validation, empty-IP guard, date consistency fix |
| `app/api/auth-mvp/request-code/route.ts` | `?? 'unknown'` fallback removed; passes `''` when no header |
| `sql/42_ip_rate_limit.sql` | Explicit REVOKE from `anon, authenticated` for function and table |
| `lib/__tests__/ip-rate-limit.test.ts` | Rewritten with new signature + secret/IP edge-case tests |
| `lib/__tests__/request-code.test.ts` | IP extraction describe block added |

No SQL was run.

---

## v019 Medium: AUTH_CODE_SECRET handling

`lib/auth/ip-rate-limit.ts` now validates the secret before computing any hash or calling the RPC, matching the pattern in `lib/auth/codes.ts`:

```typescript
const secret = process.env.AUTH_CODE_SECRET
if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
  console.error('[ip-rate-limit] AUTH_CODE_SECRET missing or too short — skipping rate-limit check')
  return true // fail open
}
```

When the secret is missing or shorter than 32 bytes, `checkIpRateLimit` returns `true` immediately. No hash is computed, no RPC is called, and no weakly-keyed row is written to `otp_ip_rate_limit`.

---

## v019 Low: missing/empty IP behaviour

`app/api/auth-mvp/request-code/route.ts` now falls back to `''` (empty string) instead of `'unknown'` when neither `x-forwarded-for` nor `x-real-ip` is present.

`lib/auth/ip-rate-limit.ts` treats an empty IP as a fail-open condition:

```typescript
if (!ip) {
  console.error('[ip-rate-limit] no IP header present — skipping rate-limit check')
  return true
}
```

This means: if the deployment platform, proxy, or a future routing layer stops providing IP headers, login requests pass through without being counted or throttled. There is no shared `'unknown'` bucket.

---

## v019 Low: date consistency

`hashIp` now takes `(ip, windowDate, secret)` — all three computed once in `checkIpRateLimit` before the RPC call. `p_ip_hash` and `p_window_date` are always derived from the same `windowDate` value.

---

## v019 Low: SQL grants

`sql/42_ip_rate_limit.sql` now explicitly revokes from `PUBLIC, anon, authenticated` for both the function and the table, matching the pattern in `sql/38_atomic_otp_verification.sql`:

```sql
REVOKE EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(TEXT, DATE, INT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(TEXT, DATE, INT)
  TO service_role;

REVOKE ALL ON public.otp_ip_rate_limit FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.otp_ip_rate_limit TO service_role;
```

---

## Final `checkIpRateLimit` failure behaviour

| Condition | Behaviour |
|---|---|
| Empty IP string | Fail open, no RPC call |
| Missing or short `AUTH_CODE_SECRET` | Fail open, no RPC call, no hash stored |
| RPC returns error | Fail open |
| RPC rejects | Fail open |
| `getAdmin()` throws | Fail open |
| Normal: RPC returns true | Allowed |
| Normal: RPC returns false | Blocked |

---

## Tests

```
Test Files  28 passed (28)
Tests       795 passed | 22 skipped | 8 todo (825)
```

Up from 785 before this follow-up.

### New tests in `lib/__tests__/ip-rate-limit.test.ts` (updated, now 27 tests total):

- `hashIp`: produces different hashes for different dates (key rotation confirmed)
- Secret validation: missing, empty, 31-byte all fail open without RPC; exactly 32 bytes proceeds
- Missing IP: empty string fails open without RPC
- Date consistency: `p_ip_hash` equals `hashIp(ip, p_window_date, secret)` — same date used for both

### New tests in `lib/__tests__/request-code.test.ts` (4 new, IP extraction block):

- First `x-forwarded-for` IP passed to `checkIpRateLimit`
- Whitespace trimmed from `x-forwarded-for`
- `x-real-ip` fallback when `x-forwarded-for` absent
- Empty string passed when no IP header present

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
 M lib/__tests__/request-code.test.ts
 M lib/auth/guard.ts
 M lib/loans/guard.ts
?? .obsidian/
?? ai-handoff/ (v012–v019)
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

Untracked `.obsidian/`, `app/preview/`, `public/favicon-options/`, `scripts/`, `sql/preflight/` are local-only. Will not be staged unless Stebbi confirms.

---

## Next phase

**Phase 14D: Final regression tests and TODO/DONE update** — pending Codex approval (v021).
