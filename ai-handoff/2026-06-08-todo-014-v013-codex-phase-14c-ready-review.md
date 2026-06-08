# TODO #14 - Codex Review Of v012 Phase 14C Readiness

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v013  
**Reviews:** `2026-06-08-todo-014-v012-claude-phase-14c-ready.md`

## Findings

### Medium - Profile API route should be covered by the session/flag boundary

V012 protects `/auth-mvp/minn-profill` by adding a server-side layout guard, but
it does not include `app/api/teskeid/profile/route.ts` in the 14C scope.

Keeping `/api/teskeid/profile` in `PUBLIC_PATHS` is acceptable and was already
accepted in v007/v008. That only means middleware should not redirect API calls
to a page. It does not mean the route itself should skip the Teskeið
session/flag boundary.

Current route behavior:

- `GET /api/teskeid/profile` requires a Supabase user and returns that user's
  own `display_name` and email.
- `PATCH /api/teskeid/profile` requires a Supabase user and can update that
  user's own `profiles.display_name`.
- The route does not check `AUTH_MVP_ENABLED`.

Risk:

- If `AUTH_MVP_ENABLED=false`, the new profile page layout would redirect, but
  a direct authenticated API call could still read/update the user's own
  Teskeið profile data.
- This is not cross-user data leakage, but it weakens the kill-switch story in
  TODO #14 because a Teskeið API can still mutate data while the feature is
  disabled.

Required adjustment before implementation:

- Include `app/api/teskeid/profile/route.ts` in Phase 14C.
- Add a route-safe session helper or local route check that enforces:
  `AUTH_MVP_ENABLED === 'true'`, valid Supabase session, and user email present.
- Do not use `redirect()` inside the API route. Return a generic JSON error,
  preferably `404` when the feature flag is off and `401` when no session is
  present.
- Keep own-profile scoping exactly as-is: `.eq('id', user.id)` for reads and
  upsert with `id: user.id`.

Suggested tests:

- `GET /api/teskeid/profile` returns `404` or another agreed generic closed
  response when `AUTH_MVP_ENABLED` is not `true`.
- `PATCH /api/teskeid/profile` does not upsert when `AUTH_MVP_ENABLED` is not
  `true`.
- Existing unauthenticated behavior still returns `401`.
- Existing own-profile read/update behavior still works when the flag is on.

### Low - V012 file list omits home-page tests that must change

V012 changes `/auth-mvp/heim` from `LOANS_ENABLED`-only visibility to
`checkFeatureAccess()`. Existing `home-page.test.tsx` mocks
`guardTeskeidAccess()` and asserts behavior using `process.env.LOANS_ENABLED`.

Those tests will need to change or be extended. This is not a design blocker,
but it should be part of the implementation scope so the new behavior is not
only covered in `guard.test.ts`.

Required coverage:

- `/heim` imports/uses `guardTeskeidSession()`, not `guardTeskeidAccess()`.
- If `checkFeatureAccess()` returns `false`, `/heim` renders the home shell but
  does not call loan RPCs and does not render loan UI or `Nýlegt`.
- If `checkFeatureAccess()` throws internally or fails closed through an
  allowlist lookup error, `/heim` still does not call loan RPCs.
- If `checkFeatureAccess()` returns `true`, existing allowlisted loan behavior
  stays unchanged.

### Low - V012 overstates the safety reason for non-allowlisted sessions

V012 says the non-allowlisted `/heim` case is safe because `verify-code/route.ts`
still gates session creation on the allowlist.

That is mostly true for current Teskeið login, but the stronger statement is:
Phase 14C should be safe because non-allowlisted authenticated sessions only get
the session-level surface (`/heim` and own profile) while feature surfaces are
server-side gated.

There may be existing Supabase sessions from older auth flows, tests, or admin
work. The implementation should not rely only on "new sessions cannot be
created" as the safety property.

## What Codex Accepts

Codex accepts the Phase 14C direction:

- Add `guardTeskeidSession()` for `AUTH_MVP_ENABLED` + session + email.
- Keep `guardTeskeidAccess()` intact and preferably compose it from the new
  session guard plus allowlist check.
- Add `checkFeatureAccess()` as a non-redirecting boolean helper.
- Add `guardFeatureAccess()` as the redirecting companion.
- Update `guardLoanAccess()` so all loan pages and server actions still fail
  closed server-side.
- Update `/auth-mvp/heim` so loan RPCs and loan UI are controlled by
  `checkFeatureAccess()`, not `LOANS_ENABLED` alone.
- Add the `/auth-mvp/minn-profill` layout guard.

## Approval

Codex approves starting Phase 14C only with the Medium finding above folded into
the implementation scope.

Claude Code should include `app/api/teskeid/profile/route.ts` in 14C and keep
`/api/teskeid/profile` in `PUBLIC_PATHS`.

No SQL is needed for Phase 14C. Claude Code should not run SQL, commit, push, or
deploy unless Stebbi explicitly asks.

## Expected 14C Handoff From Claude Code

After implementation, Claude Code should create:

`2026-06-08-todo-014-v014-claude-phase-14c-session-feature-handoff.md`

The handoff should include:

1. Exact files changed.
2. Confirmation that no SQL was written or run.
3. How `AUTH_MVP_ENABLED`, sessions, allowlist, and `LOANS_ENABLED` are enforced
   after the split.
4. Whether `/api/teskeid/profile` now fails closed when `AUTH_MVP_ENABLED` is
   not `true`.
5. Tests run and full results.
6. Any remaining behavior changes for current allowlisted users.
7. `git status --short`.

