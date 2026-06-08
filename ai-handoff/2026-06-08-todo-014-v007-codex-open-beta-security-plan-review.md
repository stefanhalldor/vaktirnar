# TODO #14 - Codex Review Of Claude v006 Plan

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v007  
**Reviews:** `2026-06-08-todo-014-v006-claude-open-beta-security-plan-revised.md`

## Findings

### Medium - Rate-limit cleanup cannot live only in `createUserCode()`

V006 says old `auth_ip_rate_limit` rows will be deleted inside the existing
`createUserCode()` cleanup path (`v006` lines 260-264). That is the wrong place
for the abuse path.

The proposed request order is:

1. Parse request.
2. Check IP rate limit.
3. If over limit, return generic success.
4. Check allowlist.
5. If not allowlisted, write `login_waitlist` and return generic success.
6. Only allowlisted, IP-allowed requests call `createUserCode()`.

So the requests most likely to create rate-limit rows without creating codes are
also the requests that never reach `createUserCode()`: non-allowlisted traffic
and rate-limited traffic. If cleanup only happens in `createUserCode()`, the new
rate-limit table can grow indefinitely under the exact abuse pattern it is meant
to handle.

Required fix before Phase 14B implementation:

- Move cleanup into the rate-limit path itself, preferably inside
  `check_and_increment_ip_rate_limit()` in `sql/42`, before or after the upsert:
  delete rows older than the agreed retention window.
- Or add a dedicated cleanup mechanism that is guaranteed to run independently
  of successful code creation.
- Keep the cleanup scoped only to `public.auth_ip_rate_limit`.

Codex preference: perform bounded cleanup inside the RPC, e.g. rows older than
1 hour or 2 hours. That keeps the lifecycle attached to the table and avoids a
new cron.

### Medium - `checkFeatureAccess()` must fail closed and not throw on lookup errors

V006 says `checkFeatureAccess(...)` returns `false` otherwise and never throws
(`v006` lines 364-367). That behavior is correct, but the implementation plan
must explicitly catch failures from `getAdmin()` or `isAuthMvpAllowedEmail()`.

If `/heim` uses `checkFeatureAccess()` as the non-redirecting feature boundary,
an allowlist lookup failure should not crash `/heim` and should not call loan
RPCs. It should return `false`, hide the loan feature, and log only safe static
metadata if logging is needed.

Required tests:

- Allowlist lookup failure returns `false`.
- `/heim` with a valid session and failed feature lookup does not call loan RPCs.
- No email/user id appears in logs.

### Low - Unknown IP bucket limit contradicts the stated trust model

V006 says the `unknown` bucket is rate-limited "with the same per-window limit"
(`v006` lines 185-188), but the sketch sets:

```ts
const MAX_REQUESTS = 10
const UNKNOWN_MAX = 20
```

(`v006` lines 273-275).

This is not a major issue, but the plan should be internally consistent. Codex
prefers `unknown` to use the same or stricter limit than normal IPs, because
unidentifiable traffic is less trustworthy, not more trustworthy.

### Low - Feature-key helpers should fail closed for unknown feature keys

V006 introduces `checkFeatureAccess(userId, email, featureKey)` and
`guardFeatureAccess(...)` (`v006` lines 358-367, 385-394), but the plan should
explicitly state that unsupported feature keys return false/redirect.

Required test:

- `checkFeatureAccess(..., 'unknown-feature')` returns `false`.
- `guardFeatureAccess(..., 'unknown-feature')` redirects/fails closed.

This keeps the future release-stage work in TODO #4 from inheriting an implicit
allow-by-default helper.

### Low - Optional chaining fallback key should avoid duplicate React keys

V006 suggests:

```tsx
<div key={row.parent?.id ?? 'unknown'} ...>
```

(`v006` lines 103-114). If more than one related profile is hidden by RLS, the
page can render multiple rows with `key="unknown"`.

This is a small local/dev robustness issue, not a blocker. Use an index fallback
or another stable-ish composite fallback in the map if Path A is implemented.

## What Codex Accepts From V006

Codex accepts V006 as a good revised architecture with conditions:

- 14.3 is now correctly treated as required.
- `/heim` now gets real server-side feature availability before loan RPC calls.
- `minn-profill` gets a server-side layout guard.
- `/api/teskeid/profile` stays in `PUBLIC_PATHS`.
- 14A correctly acknowledges the legacy co-parent page failure mode.
- Supabase Option B is a reasonable rate-limit direction if Stebbi chooses it.
- Reusing `AUTH_CODE_SECRET` for rate-limit HMAC is acceptable for beta if
  Stebbi explicitly accepts the documented bucket-reset consequence.

## Implementation Gate

Codex does not require another full plan rewrite before Phase 14A or 14C.

However, before Phase 14B implementation begins, Claude Code must incorporate
the fixes above into the implementation handoff or code plan, especially:

1. Rate-limit cleanup must run in the rate-limit path, not only in
   `createUserCode()`.
2. `checkFeatureAccess()` must fail closed on allowlist/Supabase errors.
3. Unknown feature keys must fail closed.
4. Unknown IP bucket limit must be consistent with the stated trust model.

## Stebbi Decisions Still Needed

Before implementation starts, Stebbi still needs to decide:

1. **14A:** Path A or Path B. Codex is comfortable with Path A because
   `LEGACY_ENABLED=false` is the production setting, as long as the page is made
   defensive and the lost co-parent display is explicitly accepted.
2. **14B:** Upstash or Supabase table. Codex still prefers Supabase Option B,
   with the cleanup correction above.
3. **AUTH_CODE_SECRET reuse:** Accept rate-limit bucket reset on secret rotation,
   or introduce `RATE_LIMIT_SECRET`. Codex prefers reuse for beta simplicity.
4. **Phase order:** Codex accepts 14A, then 14C, then 14B, then 14D.

## Recommended Next Step

Stebbi can give Claude Code go-ahead for **Phase 14A only** after choosing Path
A or Path B. That keeps the first implementation small.

No SQL should be run by Claude Code. Stebbi runs SQL migrations manually after
Codex review, as established.

