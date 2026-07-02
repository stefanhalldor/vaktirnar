# TODO #51 - Codex v012 - Review of Claude v011 Option A Phase 1 plan

Created: 2026-07-02 22:11
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review handoff for Claude Code

Relevant prior handoff:

- `ai-handoff/2026-07-02-2201-todo-051-v011-claude-option-a-phase1-plan.md`
- `ai-handoff/2026-07-02-2151-todo-051-v010-codex-option-a-mvp-handoff.md`

No code, SQL, Supabase settings, Facebook settings, deployment, commit, or
production change has been made by Codex in this review. This file only records
review findings so the planning loop can continue.

## Review summary

v011 is much closer to the correct MVP scope.

Codex agrees with the main scope:

- Phase 1 is Option A only.
- No SQL.
- No SQL 66.
- No loan badge.
- No `get_my_loans` or `get_invitation_for_claim` changes.
- No Supabase Dashboard or Facebook Developer App changes by agents.

However, v011 should not move directly into implementation until the findings
below are resolved. The most important issue is callback routing: the current
middleware can block `/auth/callback` before the callback route runs.

## Findings

### High - `/auth/callback` is currently blocked by legacy middleware

v011 uses `/auth/callback` as the Facebook return route.

Current middleware includes `/auth/callback` in `LEGACY_UI_PREFIXES`. When
`LEGACY_ENABLED !== 'true'`, middleware redirects matching legacy UI routes to
`/`. That means a Facebook OAuth return to `/auth/callback?...` may never reach
`app/auth/callback/route.ts`.

Relevant repo context:

- `middleware.ts` has `/auth/callback` in legacy UI prefixes.
- `app/auth/callback/route.ts` is the route v011 plans to harden.

Required correction:

Claude must choose one of these before implementation:

1. Make `/auth/callback` explicitly allowed even when legacy routes are off,
   with tests proving the callback route is reachable.
2. Or create/use a Teskeid-specific callback route that middleware allows,
   for example a route under the Auth MVP surface, and configure/link to that
   route safely.

Do not assume the current `/auth/callback` route is reachable in the deployed
Auth MVP setup.

Tests to add/update:

- Middleware test: `/auth/callback?next=/auth-mvp/minn-profill%3Ffacebook%3Dlinked`
  must not redirect to `/` when `LEGACY_ENABLED` is not true.
- Callback route test or equivalent: safe `next` redirects to the intended
  relative path after successful exchange.

### Medium - new unlink endpoint needs the same AUTH_MVP guard as profile API

v011 adds `POST /api/teskeid/profile/facebook` for unlink.

Current `app/api/teskeid/profile/route.ts` returns 404 when
`AUTH_MVP_ENABLED !== 'true'`. The v011 unlink snippet starts directly with
`createClient()` / `getUser()`, so the endpoint could remain live while the Auth
MVP surface is disabled.

Required correction:

- Add the same `AUTH_MVP_ENABLED` 404 guard at the top of the new route.
- Keep the existing user/session guard.
- Keep the `facebook-oauth` feature guard.

Also note:

- `middleware.ts` has `/api/teskeid/profile` in `PUBLIC_PATHS`, and the prefix
  match likely makes `/api/teskeid/profile/facebook` public at middleware level.
  That is acceptable only if the route handler itself fully enforces auth,
  Auth MVP flag, and feature flag.

### Medium - `load()` must be refactored before reuse in profile page effects

v011 says the OAuth return effect should call `load()` after
`?facebook=linked`.

Current `app/auth-mvp/minn-profill/page.tsx` defines `load()` inside the initial
`useEffect`, so a second effect cannot call it.

Required correction:

- Refactor the profile loader into a stable function, likely `loadProfile`
  with `useCallback`, or another simple pattern that avoids stale state and
  compile errors.
- Keep the initial load behavior unchanged.
- On `facebook=linked`, clear the URL param and reload profile status without
  causing an infinite effect loop.
- Preserve 401 redirect to `/innskraning`.

Tests to add/update:

- Existing `lib/__tests__/profile-page.test.tsx` should keep passing.
- Add or update tests for:
  - feature off: no Facebook section.
  - feature on + disconnected: link button visible.
  - feature on + connected: unlink button visible.
  - `facebook=error`: error text appears and URL param is cleared if practical
    to test.

### Medium - Meta permissions statement is too firm without official verification

v011 says Supabase defaults are `public_profile,email` and both are basic
permissions that do not need Meta App Review.

Codex could not verify current Meta docs with available web tooling in this
session, so this should not be treated as a current official rule.

Required correction:

- Keep the practical implementation note that Supabase may default to
  `public_profile,email`.
- Before any real Meta submission, Stebbi/Claude must verify official current
  Meta/Facebook Login requirements directly in Meta for Developers.
- If `email` is requested by Supabase, the privacy/disclosure text must account
  for the fact that Facebook email may be requested by the provider, even if
  Teskeid does not display or use it.
- Do not claim that no review is required unless confirmed from official Meta
  docs at submission time.

Product preference remains:

- Phase 1 should not use Facebook profile URL, avatar, friends, provider email,
  provider tokens, or raw identity metadata.
- Phase 1 should only use presence of a linked Facebook identity as a boolean
  for the logged-in user's own profile view.

## Other notes

### `/login` fallback is legacy but not necessarily part of this fix

The current callback route falls back to `/login`. Earlier Codex reviews noted
that Auth MVP canonical login is `/innskraning`, while legacy auth still uses
`/login` for older flows.

For Phase 1, the critical requirement is:

- Facebook-linking failures should return to `/auth-mvp/minn-profill` with a
  safe error state when the callback was clearly initiated by profile linking.
- Non-Facebook legacy/auth callback behavior should not be broken accidentally.

Claude should avoid broad fallback rewrites unless tests cover both legacy and
Auth MVP flows.

### Endpoint naming is acceptable

`/api/teskeid/profile/facebook` is a reasonable route name for unlink. It should
remain a narrow endpoint and should not expose Facebook metadata.

### Phase 2 remains out of scope

v011 correctly parks Phase 2. Keep it parked:

- No `profiles.facebook_verified_at`.
- No SQL.
- No loan RPC changes.
- No badge UI.

## Recommended next step for Claude

Claude should either:

1. Produce a short v013 correction handoff resolving the findings above, or
2. If Stebbi grants implementation permission, implement Phase 1 while
   explicitly incorporating these corrections.

If Claude writes a correction plan first, suggested filename:

`YYYY-MM-DD-HHMM-todo-051-v013-claude-v012-corrections.md`

That correction should include:

- Exact callback route decision and middleware test impact.
- AUTH_MVP guard in the new unlink route.
- Profile page loader refactor approach.
- Updated Meta permissions wording.
- Updated test list.

## Localhost checks for Stebbi

This v012 file is review-only, so there is no new localhost behavior to test
from Codex's work.

When Claude later implements Phase 1, Stebbi should test:

1. With `FACEBOOK_OAUTH_ENABLED` unset/false, open `/auth-mvp/minn-profill` and
   confirm no Facebook section is shown.
2. With `FACEBOOK_OAUTH_ENABLED=true` and access allowed, open
   `/auth-mvp/minn-profill` and confirm a compact Facebook section is shown.
3. Confirm the section says the account is not connected before linking.
4. Start Facebook linking and confirm the OAuth flow begins from the profile
   page only.
5. Complete OAuth as a Facebook test user and confirm the return reaches the
   profile page, not `/`, `/login`, or a dead callback route.
6. Confirm the profile page shows connected status after return and after
   refresh.
7. Cancel OAuth and confirm the user returns to the profile page with a clear,
   non-blocking error state.
8. Click `Aftengja Facebook` and confirm the status changes back to disconnected.
9. Confirm `/innskraning` still has no Facebook login option.
10. Confirm normal email-code login still works after callback changes.
11. Log in as a user outside the feature flag and confirm no Facebook section is
    shown.
12. Send `POST /api/teskeid/profile/facebook` as a user outside the feature flag
    and confirm it returns 404.
13. With `AUTH_MVP_ENABLED` off in a safe local environment, confirm the new
    unlink route returns 404.
14. Test mobile widths around 360, 390, and 460 px: no zoom, no horizontal
    overflow, no overlap, and stable button width during pending states.

Do not use production Supabase secrets, production Facebook app settings, real
user accounts, live Meta review settings, or production redirect URLs without
explicit Stebbi approval.

## Bottom line

v011 has the right MVP scope, but callback reachability through middleware must
be fixed before implementation. The rest are contained corrections. After these
are addressed, Phase 1 is in good shape for a small, reviewable implementation.
