# TODO #14 - Codex Review Of Claude v002 Plan

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v003  
**Reviews:** `2026-06-08-todo-014-v002-claude-open-beta-security-plan.md`

## Findings

### High - 14.3 cannot be deferred if TODO #14 is being completed

Claude Code recommends Option C, deferring IP/abuse rate limiting until just
before TODO #9 (`v002` lines 92-95, 234-243, 287). That conflicts with the
current goal: Stebbi asked to finish TODO #14 completely. TODO #14.3 explicitly
requires IP-/abuse protection before open beta, and TODO #14's launch rule says
all six items must be solved, tested, and reviewed before open login or TODO #9.

The allowlist does reduce Resend cost today, but it does not make 14.3 done:

- `/api/auth-mvp/request-code` still allows one IP to submit unlimited distinct
  non-allowlisted emails.
- Non-allowlisted emails still hit service-role code and can insert into
  `login_waitlist` (`app/api/auth-mvp/request-code/route.ts` lines 29-32).
- If TODO #14 is moved to DONE with 14.3 deferred, the project loses the clear
  launch blocker that currently protects TODO #9.

Codex recommendation: Claude Code must revise 14B so it is implemented now, or
explicitly state that TODO #14 remains open and cannot be considered complete.
For the current Stebbi request ("klara #14 alveg"), Option C should not be
accepted.

### High - The proposed 14C is additive only and does not actually satisfy 14.5

Claude Code proposes adding `guardTeskeidSession()` and
`guardFeatureAccess('lanad-og-skilad')`, while leaving existing callers
untouched (`v002` lines 129-144, 264-278). That is useful prep work, but it does
not complete TODO #14.5.

TODO #14.5 requires the actual access boundary to be split:

- `/auth-mvp/heim` and `/auth-mvp/minn-profill` should use session protection.
- `Laanad og skilad`, direct URLs, server actions, APIs, and RPC-backed flows
  should use feature protection.

With the v002 plan, `/auth-mvp/heim` remains guarded by `guardTeskeidAccess()`
(`app/auth-mvp/heim/page.tsx` line 52), which still includes the allowlist. That
means session access and feature access remain conflated in the product
behavior. Tests can pass while the TODO item remains incomplete.

Codex recommendation: revise 14C to use the new helpers at real call sites:

- Add `guardTeskeidSession()`.
- Use it for `/auth-mvp/heim`.
- Add a server-side guard for `/auth-mvp/minn-profill`, preferably via a small
  layout rather than relying only on middleware + client fetch.
- Change `guardLoanAccess()` to compose session + `guardFeatureAccess`.
- Ensure `/auth-mvp/heim` only shows active feature rows based on server-side
  feature availability, not only `LOANS_ENABLED`.

This can still be safe before TODO #9 because verify-code currently only creates
sessions for allowlisted emails (`app/api/auth-mvp/verify-code/route.ts` lines
23-28). But the structure must actually be used.

### Medium - 14A says no Krakkavaktin flow breaks, but one legacy page still reads co-parent profiles client-side

The profiles hardening direction is right, but v002 overstates safety when it
says the broad `profiles_select` serves no Krakkavaktin use case and "No
Krakkavaktin flow breaks" (`v002` lines 51-60).

There is still a legacy authenticated page that reads related profile rows
through the normal Supabase client:

- `app/(app)/children/[id]/page.tsx` lines 28-32 selects
  `parent:profiles(id, display_name)` for all parents of a child.

Changing `profiles_select` to `USING (id = auth.uid())` will likely hide
co-parent display names in that view if `LEGACY_ENABLED=true`. This may be
acceptable because Stebbi has said Krakkavaktin is not a real public surface and
`LEGACY_ENABLED=false` is likely the correct production setting. But the plan
must not claim the flow is unaffected.

Codex recommendation: Claude Code should revise 14A with an explicit choice:

- If legacy remains off, document that the old co-parent display-name view is
  intentionally not preserved when `LEGACY_ENABLED=true`.
- If legacy must remain usable, add a narrow service-role RPC/view for co-parent
  display names before tightening `profiles_select`.

### Medium - Removing `/api/teskeid/profile` from `PUBLIC_PATHS` is not "easy" without API redirect tests

V002 flags `/api/teskeid/profile` in `PUBLIC_PATHS` as a minor issue and asks
whether to remove it (`v002` lines 146-151, 326-328). This needs more care.

Right now the route itself returns JSON 401 for unauthenticated callers
(`app/api/teskeid/profile/route.ts` lines 10-16). The client page depends on
that behavior and redirects to `/innskraning` on 401
(`app/auth-mvp/minn-profill/page.tsx` lines 25-28).

If the route is removed from `PUBLIC_PATHS`, unauthenticated API requests may be
caught by middleware and redirected to `/login` (`middleware.ts` lines 148-151)
instead of returning JSON 401. That can break the profile page's client-side
error handling.

Codex recommendation: do not remove `/api/teskeid/profile` from `PUBLIC_PATHS`
as a casual 14C change. Prefer adding a server-side page/layout guard for
`/auth-mvp/minn-profill`. If Claude Code still wants to remove the API route
from `PUBLIC_PATHS`, it must include tests proving unauthenticated API behavior
stays acceptable.

### Low - Phase 14D should not move TODO #14 to DONE while any required subitem is deferred

V002 says DONE movement should happen after 14A, 14B "or confirmed deferred",
and 14C (`v002` lines 285-302). This is too loose.

If 14.3 is deferred, TODO #14 remains open. It can be documented as blocked or
waiting on TODO #9 timing, but it should not be moved to DONE.

Codex recommendation: Phase 14D should only move TODO #14 to DONE after 14.2,
14.3, 14.5, and the already completed 14.1/14.4/14.6 have all been implemented,
tested, reviewed, and Stebbi has accepted the result.

## What Codex Accepts From V002

Codex agrees with these directions:

- Tightening `profiles_select` away from `USING (true)` is the right security
  direction.
- A read-only policy preflight before sql/41 is appropriate.
- A small SQL migration for profiles hardening is the right shape.
- Splitting session and feature access into separate helpers is the right
  architecture.
- `minn-profill` should get explicit server-side protection.
- Phases should remain small and separately reviewed.

## Required Revision From Claude Code

Claude Code should produce a revised plan file:

`2026-06-08-todo-014-v004-claude-open-beta-security-plan-revised.md`

The revised plan should:

1. Treat 14.3 as required for completing TODO #14, not as optional deferral.
2. Choose a concrete 14B direction or present a clear decision with enough
   detail for Stebbi and Codex to choose. Codex's current preference is a
   Supabase-backed, privacy-preserving rate-limit table unless Claude Code can
   justify Upstash operationally.
3. Make 14C behavioral, not only additive. New helpers must be used at real
   access boundaries.
4. Correct the 14A legacy/co-parent profile-read claim.
5. Avoid changing `/api/teskeid/profile` middleware classification unless tests
   cover unauthenticated API behavior.
6. Keep SQL execution, deploy, commit, push, TODO/DONE movement, and large code
   changes out of the plan step.

## Suggested Phase Order After Revision

Codex recommends:

1. Phase 14A: profiles hardening, with explicit legacy-off vs legacy-preserved
   decision.
2. Phase 14C: actual session/feature boundary split at call sites.
3. Phase 14B: rate-limit implementation.
4. Phase 14D: final cross-checks and TODO/DONE update only when no required
   #14 subitem is deferred.

No phase should start implementation until Stebbi gives a clear go-ahead after
Codex reviews the revised plan.

