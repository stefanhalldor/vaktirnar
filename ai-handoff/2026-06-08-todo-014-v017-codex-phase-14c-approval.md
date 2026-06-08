# TODO #14 - Codex Review Of v016 Phase 14C Email Boundary

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v017  
**Reviews:** `2026-06-08-todo-014-v016-claude-phase-14c-email-boundary-handoff.md`

## Findings

No blocking findings.

The v015 Medium finding is resolved:

- `app/api/teskeid/profile/route.ts:18` now rejects missing email in `GET`.
- `app/api/teskeid/profile/route.ts:42` now rejects missing email in `PATCH`.
- `app/api/teskeid/profile/route.ts:30` and `app/api/teskeid/profile/route.ts:64`
  now return `user.email` without an empty-string fallback after the guard.
- `lib/__tests__/teskeid-profile-route.test.ts:84` and
  `lib/__tests__/teskeid-profile-route.test.ts:92` cover `GET` with null and
  undefined email.
- `lib/__tests__/teskeid-profile-route.test.ts:146` and
  `lib/__tests__/teskeid-profile-route.test.ts:154` cover `PATCH` with null and
  undefined email, including no `upsert`.

## Verification Run By Codex

Codex ran:

```txt
npm run test:run
```

Result:

```txt
Test Files  27 passed (27)
Tests       764 passed | 22 skipped | 8 todo (794)
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

## Phase 14C Approval

Codex approves Phase 14C as complete.

Accepted state:

- `/auth-mvp/heim` uses `guardTeskeidSession()` for session-level access.
- Loan UI and loan RPC calls on `/auth-mvp/heim` are gated by
  `checkFeatureAccess()`.
- `guardLoanAccess()` still protects loan pages and server actions server-side.
- `/auth-mvp/minn-profill` uses a server-side session layout guard.
- `/api/teskeid/profile` remains in `PUBLIC_PATHS`, but the route handler now
  enforces `AUTH_MVP_ENABLED`, valid session, and email presence itself.
- No SQL was needed for Phase 14C.

## Approval For Next Phase

Codex approves Claude Code starting Phase 14B implementation.

Important constraints for Phase 14B:

- SQL may be written in the appropriate migration file, but Claude Code must not
  run SQL against Supabase or production unless Stebbi explicitly asks.
- The new IP/abuse rate-limit RPC must be callable only through the intended
  server/admin path. Avoid broad grants and avoid exposing useful abuse or
  allowlist information in client responses.
- Cleanup inside the RPC must be bounded and indexed so login requests cannot
  trigger unbounded table scans or deletes.
- `request-code` behavior must stay generic: do not reveal whether an email is
  allowlisted, exists, rate-limited, or deliverable.
- Failure behavior must be explicit. If the rate-limit check fails, Claude Code
  should document whether the route fails closed or uses a safer degraded path,
  and why.
- Tests should cover allowed, blocked, repeated-IP, RPC-error, and generic
  response behavior.

## Commit Hygiene

Before any commit, stage only intentional TODO #14 / Phase 14C files and the
handoff files Stebbi wants included. Current local status includes unrelated
untracked paths such as `.obsidian/`, `app/preview/`, `public/favicon-options/`,
`scripts/`, and `sql/preflight/`; those should not be swept into a TODO #14
commit by accident.

## Expected Next Handoff

After Phase 14B implementation, Claude Code should create the next handoff as:

`2026-06-08-todo-014-v018-claude-phase-14b-ip-rate-limit-handoff.md`

That handoff should include:

1. Exact files changed.
2. SQL file name and whether SQL was written only or also run.
3. Effects on data, RLS, auth, grants, functions, and production.
4. Rollback or recovery plan for the migration.
5. How the RPC is granted and why it cannot be called from the client.
6. How `request-code` behaves for allowed, blocked, unknown, and error cases.
7. Tests run and full results.
8. `git status --short`.
