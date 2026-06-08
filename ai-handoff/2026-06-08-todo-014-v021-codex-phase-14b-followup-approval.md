# TODO #14 - Codex Review Of v020 Phase 14B Follow-Up

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v021  
**Reviews:** `2026-06-08-todo-014-v020-claude-phase-14b-ip-rate-limit-followup.md`

## Findings

No blocking findings.

The v019 findings are resolved:

- `lib/auth/ip-rate-limit.ts:45-49` now rejects missing or shorter-than-32-byte
  `AUTH_CODE_SECRET` before hashing or calling the RPC.
- `lib/auth/ip-rate-limit.ts:37-40` now fails open for missing IP instead of
  using a shared `unknown` bucket.
- `lib/auth/ip-rate-limit.ts:51-58` now computes `windowDate` once and derives
  both `p_ip_hash` and `p_window_date` from that same value.
- `sql/42_ip_rate_limit.sql:70-77` now explicitly revokes function/table access
  from `PUBLIC`, `anon`, and `authenticated`, and grants only to `service_role`.

### Low - Phase 14B remains best-effort until production config and SQL are applied

This is expected, not a code blocker:

- `sql/42_ip_rate_limit.sql` has not been run.
- If the RPC is missing, `checkIpRateLimit()` fails open.
- If `AUTH_CODE_SECRET` is missing or too short, `checkIpRateLimit()` fails open.
- If production does not provide `x-forwarded-for` or `x-real-ip`, IP limiting
  fails open.

Before production rollout, Stebbi or Claude Code should confirm:

- `AUTH_CODE_SECRET` is set and at least 32 bytes in production.
- The deployment path supplies a trusted IP header.
- `sql/42_ip_rate_limit.sql` is applied before expecting IP throttling to work.

## Accepted Parts

Codex accepts the Phase 14B implementation and follow-up:

- Raw IPs are not stored or logged by the new code.
- Weak or missing HMAC secret no longer writes weak IP hashes.
- Missing IP no longer creates a shared global throttle bucket.
- Rate-limited requests return the same generic response as normal requests.
- Rate-limited requests do not parse the body, check allowlist, create codes,
  insert waitlist rows, or send email.
- SQL grants and revokes are explicit and service-role scoped.
- No SQL was run by Claude Code or Codex during this review phase.

## Verification Run By Codex

Codex ran:

```txt
npm run test:run
```

Result:

```txt
Test Files  28 passed (28)
Tests       795 passed | 22 skipped | 8 todo (825)
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

Codex approves Phase 14B as complete.

Codex approves Claude Code starting Phase 14D: final regression tests and
TODO/DONE update.

No SQL should be run unless Stebbi explicitly asks.

## Expected Next Handoff

After Phase 14D, Claude Code should create:

`2026-06-08-todo-014-v022-claude-phase-14d-final-regression-handoff.md`

That handoff should include:

1. Exact files changed.
2. Confirmation that no SQL was run, unless Stebbi explicitly asked for it.
3. Full final test/type-check/build results.
4. Final status of all six TODO #14 launch-blockers.
5. Whether `TODO.md` and `DONE.md` were updated, and how.
6. Remaining deployment steps, especially `sql/42_ip_rate_limit.sql`.
7. Production config checks still required before open beta.
8. `git status --short`.
