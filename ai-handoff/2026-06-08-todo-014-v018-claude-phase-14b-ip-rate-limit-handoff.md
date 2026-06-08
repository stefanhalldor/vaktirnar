# Handoff v018 — Claude Code: Phase 14B complete

**Date:** 2026-06-08
**Author:** Claude Code
**Phase:** 14B — IP/abuse rate-limit
**For:** Codex review before Phase 14D starts

---

## Files changed

| File | Change |
|---|---|
| `sql/42_ip_rate_limit.sql` | New migration (written only, NOT run) |
| `lib/auth/ip-rate-limit.ts` | New module |
| `app/api/auth-mvp/request-code/route.ts` | Rate-limit check added |
| `lib/__tests__/ip-rate-limit.test.ts` | New test file |
| `lib/__tests__/request-code.test.ts` | Mock + IP rate-limit describe block added |

No SQL was run. `sql/42_ip_rate_limit.sql` must be applied by Stebbi manually in Supabase.

---

## SQL — `sql/42_ip_rate_limit.sql`

### Table: `otp_ip_rate_limit`

```sql
CREATE TABLE IF NOT EXISTS public.otp_ip_rate_limit (
  ip_hash       TEXT        NOT NULL,
  window_date   DATE        NOT NULL,
  request_count INT         NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_date)
);
CREATE INDEX IF NOT EXISTS otp_ip_rate_limit_window_date_idx
  ON public.otp_ip_rate_limit (window_date);
ALTER TABLE public.otp_ip_rate_limit ENABLE ROW LEVEL SECURITY;
```

- No policies defined. anon/authenticated clients have no access. service_role bypasses RLS.
- `ip_hash` is an HMAC-derived value, never a raw IP address.
- The window_date index supports the bounded cleanup scan inside the RPC.

### RPC: `check_and_increment_ip_rate_limit(p_ip_hash TEXT, p_window_date DATE, p_max_requests INT) RETURNS BOOLEAN`

- `SECURITY DEFINER`, `SET search_path = public`.
- Upserts the (ip_hash, window_date) pair, incrementing request_count.
- Bounded DELETE: removes at most 100 rows where `window_date < p_window_date - interval '1 day'`, using the window_date index. No full-table scan.
- Returns `request_count <= p_max_requests`.

### Grants

```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

`REVOKE ... FROM PUBLIC` removes the default execute grant that anon and authenticated inherit. service_role retains execute via its elevated privileges. The function cannot be called from an anon or authenticated Supabase client.

### Rollback

```sql
DROP FUNCTION IF EXISTS public.check_and_increment_ip_rate_limit(TEXT, DATE, INT);
DROP TABLE IF EXISTS public.otp_ip_rate_limit;
```

---

## `lib/auth/ip-rate-limit.ts`

### IP hashing

`HMAC(ip, HMAC(date, AUTH_CODE_SECRET))`

1. `dateKey = HMAC-SHA256(windowDate, AUTH_CODE_SECRET)` — rotates daily
2. `ipHash  = HMAC-SHA256(ip, dateKey)` — day-scoped, non-reversible

Raw IPs are never stored, logged, or sent to Supabase.

### Failure mode: **fail open**

When the RPC call fails (error response or thrown exception), `checkIpRateLimit` returns `true` (allowed). Rationale:

- The allowlist is the primary security gate. A session can only be established when `AUTH_MVP_ENABLED=true` and the email is on the allowlist.
- The IP rate-limit is a best-effort abuse mitigation layer — it limits the number of OTP requests from a single IP, not the number of successful logins.
- Failing closed would deny all OTP requests if the Supabase function is unavailable. That is a worse outcome than briefly allowing extra traffic during an outage.

`getAdmin()` calls are per-request (not module-level) per the project convention, so env-var issues at build time cannot cause failures.

### Limit

10 requests per IP per rolling daily window (Reykjavik calendar day). The `'unknown'` sentinel (for requests with no IP header) is subject to the same limit.

---

## `app/api/auth-mvp/request-code/route.ts`

The rate-limit check runs before body parsing. This means:

- Abuse traffic is rejected before any DB work (no allowlist lookup, no code creation, no waitlist insert).
- Blocked requests still receive `{ success: true }` — rate-limit status is not revealed.
- IP is extracted from `x-forwarded-for` (first IP, trimmed) → `x-real-ip` → `'unknown'`.

The previous TODO comment for IP rate-limiting has been removed.

---

## How `request-code` behaves for each case

| Case | Behaviour |
|---|---|
| IP within limit, allowed email | Code created, login email sent, `{ success: true }` |
| IP within limit, non-allowed email | Waitlist insert (idempotent), `{ success: true }` |
| IP within limit, invalid payload | No DB work, `{ success: true }` |
| IP rate-limited (any email) | Early return, no DB work, `{ success: true }` |
| Rate-limit RPC error | Fail open, normal flow continues, `{ success: true }` |

In all cases the HTTP response is identical: `200 { success: true }`.

---

## Test results

```
Test Files  28 passed (28)
Tests       785 passed | 22 skipped | 8 todo (815)
```

(Up from 764 before Phase 14B.)

### New tests

`lib/__tests__/ip-rate-limit.test.ts` (21 tests):
- `hashIp`: 64-char hex, no raw IP, different IPs differ, deterministic within day, 'unknown' handled
- `checkIpRateLimit` allowed: returns true, RPC called with correct name/ip_hash/window_date/max_requests, different hashes for different IPs
- `checkIpRateLimit` blocked: returns false, 'unknown' can be blocked
- Fail open: RPC error returns true, RPC reject returns true, getAdmin() throw returns true

`lib/__tests__/request-code.test.ts` (5 new tests):
- Rate-limited returns `{ success: true }` (generic)
- Rate-limited: no allowlist check
- Rate-limited: no code created
- Rate-limited: no waitlist insert
- Rate-limited and normal responses are indistinguishable

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
?? ai-handoff/ (v012–v017)
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

Untracked `.obsidian/`, `app/preview/`, `public/favicon-options/`, `scripts/`, `sql/preflight/` are local-only and unrelated to TODO #14. Will not be staged unless Stebbi confirms.

---

## Remaining risk

- `sql/42_ip_rate_limit.sql` has not been applied to Supabase yet. Until it is, `checkIpRateLimit` fails open (returns `true`) on every call, so `request-code` behaves exactly as before.
- The `AUTH_CODE_SECRET` env var must be set in production for HMAC derivation. If unset, an empty string is used as the HMAC key — the rate-limit still functions but the hashes are less secret. This matches the existing pattern in `lib/auth/codes.ts`.

---

## Next phase

**Phase 14D: Final regression tests and TODO/DONE update** — pending Codex approval (v019).
