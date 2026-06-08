# TODO #14 - Codex Review Of v014 Phase 14C Handoff

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v015  
**Reviews:** `2026-06-08-todo-014-v014-claude-phase-14c-session-feature-handoff.md`

## Findings

### Medium - Profile API route does not enforce the email-present session boundary

`app/api/teskeid/profile/route.ts:18` and
`app/api/teskeid/profile/route.ts:42` only check `if (!user)`, but v013
required the profile API boundary to enforce:

- `AUTH_MVP_ENABLED === 'true'`
- valid Supabase session
- user email present

Current effect:

- A Supabase-authenticated user object without `email` can still call
  `GET /api/teskeid/profile`.
- The same user can call `PATCH /api/teskeid/profile` and upsert their own
  `profiles.display_name`.
- The page/layout guard rejects that session via `guardTeskeidSession()`, so
  the API route is looser than the page boundary.

This is not cross-user data leakage because `.eq('id', user.id)` and
`upsert({ id: user.id })` are preserved, but it violates the agreed Phase 14C
boundary and weakens the consistency of the Teskeid session surface.

Required fix before Phase 14B:

- In both `GET` and `PATCH`, require email:
  `if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
- Return `email: user.email` after that, with no `?? ''` fallback.
- Add tests in `lib/__tests__/teskeid-profile-route.test.ts` for:
  - `GET` returns `401` when `user` exists but `email` is missing or null.
  - `PATCH` returns `401` when `user` exists but `email` is missing or null.
  - `PATCH` does not call `upsert` in that missing-email case.

### Low - Commit hygiene risk from unrelated and untracked files

`git status --short` shows the Phase 14C files plus unrelated or untracked local
paths such as:

- `.obsidian/`
- `app/preview/`
- `public/favicon-options/`
- `scripts/`
- `sql/preflight/`
- modified `TODO.md` and `DONE.md`

Before any commit, Claude Code should stage only the intentional Phase 14C files.
Do not use broad `git add .` unless Stebbi has explicitly confirmed that all
unrelated local files belong in the same commit.

## Accepted

Codex accepts the main Phase 14C direction:

- `guardTeskeidSession()` split is correct.
- `guardTeskeidAccess()` remains intact and composes from the session guard.
- `/auth-mvp/heim` now uses session-only access and gates loan RPC/UI behind
  `checkFeatureAccess()`.
- `guardLoanAccess()` still fails closed server-side for loan pages and server
  actions.
- `/auth-mvp/minn-profill/layout.tsx` using session-only access is the right
  guard for own-profile pages.
- Keeping `/api/teskeid/profile` in `PUBLIC_PATHS` is still acceptable because
  the handler owns the JSON auth and flag response.

## Answers To Claude Code Questions

1. `guardTeskeidAccess()` composing from `guardTeskeidSession()` is fine. There
   is no meaningful double-session-check concern in the current structure.
2. `minn-profill` should use `guardTeskeidSession()`, not the allowlist guard.
   Own-profile access is a session-level surface after Phase 14C.
3. Keeping `/api/teskeid/profile` in `PUBLIC_PATHS` remains acceptable, provided
   the handler itself enforces `AUTH_MVP_ENABLED`, session, and email.
4. The `_userId` parameter in `checkFeatureAccess()` is acceptable as a
   forward-compatible call shape, though it should remain unused intentionally
   until there is a real per-user feature rule.
5. `user.email!` in `/auth-mvp/heim` and `guardLoanAccess()` is acceptable
   because `guardTeskeidSession()` has already enforced email presence.

## Approval Status

Codex does not approve starting Phase 14B yet.

Claude Code should make the small profile API email-boundary fix above, add the
missing tests, rerun the relevant tests or full suite, and send the next handoff
as:

`2026-06-08-todo-014-v016-claude-phase-14c-email-boundary-handoff.md`

## What v016 Should Include

1. Exact files changed.
2. Confirmation that no SQL was written or run.
3. Confirmation that `GET /api/teskeid/profile` and
   `PATCH /api/teskeid/profile` now return `401` when the Supabase user has no
   email.
4. Confirmation that `PATCH` does not upsert when email is missing.
5. Tests run and full results.
6. Remaining risk, if any.
7. `git status --short`.
