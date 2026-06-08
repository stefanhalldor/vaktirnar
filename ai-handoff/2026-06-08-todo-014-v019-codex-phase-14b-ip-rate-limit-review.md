# TODO #14 - Codex Review Of v018 Phase 14B IP Rate Limit

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v019  
**Reviews:** `2026-06-08-todo-014-v018-claude-phase-14b-ip-rate-limit-handoff.md`

## Findings

### Medium - IP hashing silently uses an empty or weak `AUTH_CODE_SECRET`

`lib/auth/ip-rate-limit.ts:18` uses:

```ts
const secret = process.env.AUTH_CODE_SECRET ?? ''
```

That means the IP rate-limit can store HMAC-derived IP hashes using an empty key
when `AUTH_CODE_SECRET` is missing. It also accepts short secrets.

V018 says this matches the existing pattern in `lib/auth/codes.ts`, but it does
not. Existing OTP hashing in `lib/auth/codes.ts:13-21` fails if
`AUTH_CODE_SECRET` is missing or shorter than 32 bytes.

Risk:

- If `AUTH_CODE_SECRET` is missing or weak, `otp_ip_rate_limit.ip_hash` becomes
  much easier to brute-force for common IP addresses if the table is ever
  exposed through a future bug, support query, backup, or dashboard access.
- The route performs this rate-limit check before body parsing, so weak IP
  hashes could be written even for invalid requests.
- This weakens the privacy claim that only non-reversible HMAC-derived IP
  hashes are stored.

Required fix before Phase 14B is accepted:

- Reuse the same secret validation rule as `hashCode()`:
  - missing `AUTH_CODE_SECRET` fails the IP rate-limit check open
  - secret shorter than 32 bytes fails open
  - no RPC call is made and no weak IP hash is stored
  - log only a static operational message, no IP or user data
- Add tests in `lib/__tests__/ip-rate-limit.test.ts`:
  - missing `AUTH_CODE_SECRET` returns `true` and does not call RPC
  - short `AUTH_CODE_SECRET` returns `true` and does not call RPC
  - valid secret still hashes and calls RPC as now

Fail-open is consistent with the chosen availability model. The important part
is that fail-open must happen before writing weakly keyed IP hashes.

### Low - Missing/empty IP header can become a global login throttle

`app/api/auth-mvp/request-code/route.ts:19-21` falls back to `'unknown'`, and
V018 states that `'unknown'` is subject to the same 10-per-day limit.

Risk:

- If the deployment platform, proxy, preview environment, or a future routing
  layer stops providing `x-forwarded-for` or `x-real-ip`, all users share the
  same `'unknown'` bucket.
- After 10 OTP requests in that environment, every later login request is
  silently dropped with the generic `{ success: true }` response.
- Because the response is intentionally indistinguishable, this can look like
  email delivery or auth failure rather than rate-limit misconfiguration.

Recommended adjustment:

- Treat missing or empty IP as a rate-limit unavailable condition and fail open,
  with a static operational log.
- Alternatively, explicitly document why shared `'unknown'` throttling is
  acceptable and add an operational check that production always receives a
  trusted forwarded IP header.
- Add tests for:
  - `x-forwarded-for` first-IP extraction
  - `x-real-ip` fallback
  - missing/empty IP behavior

### Low - SQL grants should explicitly revoke direct client roles

`sql/42_ip_rate_limit.sql:70` revokes function execution only from `PUBLIC`.
For a newly created function that usually removes the default inherited execute
grant, but the project has a stronger pattern in `sql/38_atomic_otp_verification.sql`
where functions explicitly revoke from `PUBLIC, anon, authenticated`.

Recommended hardening before the SQL is applied:

- Change function revoke to:

```sql
REVOKE EXECUTE ON FUNCTION public.check_and_increment_ip_rate_limit(TEXT, DATE, INT)
  FROM PUBLIC, anon, authenticated;
```

- Add explicit table grants/revokes matching the auth table pattern:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_ip_rate_limit TO service_role;
REVOKE ALL ON public.otp_ip_rate_limit FROM PUBLIC, anon, authenticated;
```

The current design is probably not directly exploitable as written because the
function is only granted to `service_role` and RLS has no client policies, but
explicit revokes make the migration more robust and easier to audit.

### Low - Hash date and window date are computed separately

`lib/auth/ip-rate-limit.ts:31-32` calls `hashIp(ip)` and then separately calls
`getWindowDate()`. `hashIp()` also calls `getWindowDate()` internally.

At the Reykjavik midnight boundary, a request could theoretically hash with one
date and write to the next date window.

Recommended cleanup:

- Compute `windowDate` once in `checkIpRateLimit()`.
- Pass that date into the hash function or a private helper so `p_ip_hash` and
  `p_window_date` always describe the same window.

This is not a major production risk, but the fix is small and makes the rate
limit easier to reason about.

## Accepted Parts

Codex accepts these parts of the Phase 14B direction:

- No SQL has been run.
- The new route response remains generic: `200 { success: true }`.
- Rate-limited requests avoid allowlist lookup, code creation, waitlist insert,
  and email sending.
- RPC errors and `getAdmin()` failures fail open, which is consistent with
  Phase 14B being best-effort abuse mitigation rather than the primary auth
  gate.
- Raw IP addresses are not logged by the new code.
- The migration is numbered correctly as `sql/42_ip_rate_limit.sql`.
- The upsert-based counter is atomic for the `(ip_hash, window_date)` primary
  key.

## Verification Run By Codex

Codex ran:

```txt
npm run test:run
```

Result:

```txt
Test Files  28 passed (28)
Tests       785 passed | 22 skipped | 8 todo (815)
Exit code   0
```

Codex also ran:

```txt
npm run type-check
```

Result:

```txt
tsc --noEmit
Exit code 0
```

## Approval Status

Codex does not approve Phase 14B as complete yet.

Claude Code should fix the `AUTH_CODE_SECRET` handling before Phase 14D starts.
The SQL grant hardening and missing-IP behavior are lower severity, but Codex
recommends addressing them in the same follow-up because `sql/42_ip_rate_limit.sql`
has not been applied yet.

No SQL should be run unless Stebbi explicitly asks.

## Expected Next Handoff

After fixes, Claude Code should create:

`2026-06-08-todo-014-v020-claude-phase-14b-ip-rate-limit-followup.md`

That handoff should include:

1. Exact files changed.
2. Confirmation that no SQL was run.
3. How missing or short `AUTH_CODE_SECRET` behaves.
4. Whether missing/empty IP now fails open or remains a shared `'unknown'`
   bucket, and why.
5. Final SQL grants/revokes for table and RPC.
6. Tests added and full results.
7. `git status --short`.
