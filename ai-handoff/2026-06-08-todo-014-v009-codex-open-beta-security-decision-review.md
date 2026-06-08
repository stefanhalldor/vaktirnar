# TODO #14 - Codex Review And Decision Record For v008

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v009  
**Reviews:** `2026-06-08-todo-014-v008-claude-open-beta-security-plan-corrections.md`

## Findings

No blocking findings in V008.

V008 addresses the remaining V007 concerns well enough for implementation to
begin in small phases. Codex accepts V006 + V008 as the current implementation
plan for TODO #14, with the Stebbi decisions recorded below.

## Stebbi Decisions

Stebbi has confirmed:

1. **Phase 14A:** Use Path A.
   - Tighten `profiles_select`.
   - Add defensive optional chaining to the legacy child page.
   - Accept that co-parent names are not preserved if `LEGACY_ENABLED=true`.
   - Production expectation remains `LEGACY_ENABLED=false`.

2. **Phase 14B:** Use Supabase Option B.
   - Create a Supabase-backed `auth_ip_rate_limit` table and service-role-only
     RPC in `sql/42`.
   - No Upstash dependency.
   - No new external service or billing surface.

3. **Phase 14B secret choice:** Reuse `AUTH_CODE_SECRET`.
   - Stebbi accepts that rotating `AUTH_CODE_SECRET` also resets IP rate-limit
     buckets.
   - No separate `RATE_LIMIT_SECRET` is needed for this beta.

4. **Phase order:** Use the proposed order:
   - 14A: profiles hardening.
   - 14C: session vs feature access.
   - 14B: IP/abuse rate-limit.
   - 14D: final regression and TODO/DONE update.

## Accepted Implementation Constraints

Claude Code may begin **Phase 14A only** after this review. Phase 14A scope:

- Add `sql/41_profiles_select_own.sql`.
- Add defensive optional chaining to
  `app/(app)/children/[id]/page.tsx`.
- Add focused tests/static assertions for the profile policy and defensive
  legacy rendering behavior where practical.

Claude Code must not:

- Run SQL.
- Deploy.
- Push.
- Commit unless Stebbi separately asks.
- Touch TODO.md or DONE.md in Phase 14A unless Stebbi explicitly asks.
- Start Phase 14C or 14B before Codex reviews the Phase 14A handoff.

## SQL Handling For Phase 14A

`sql/41_profiles_select_own.sql` changes RLS policy behavior. It is not
read-only. It changes schema/policy, not existing data rows.

Expected behavior:

- `authenticated` users can read only their own `profiles` row.
- Cross-user profile reads return no related profile row.
- `service_role` flows remain unaffected.
- `anon` remains without profile access.

Stebbi runs SQL manually after Codex review. Claude Code should only write the
migration and handoff it for review.

## Required Phase 14A Handoff From Claude Code

After implementing Phase 14A locally, Claude Code should create the next
handoff file:

`2026-06-08-todo-014-v010-claude-phase-14a-profiles-handoff.md`

The handoff should include:

1. Exact files changed.
2. Full SQL effects of `sql/41`.
3. Whether SQL was run. Expected answer: no.
4. RLS/grants/auth impact.
5. Legacy Path A impact and how optional chaining handles null parents.
6. Tests run and results.
7. `git status --short`.
8. Any remaining risk or question for Codex.

## Codex Position

Codex approves starting Phase 14A with Path A.

Codex does not yet approve starting Phase 14C or Phase 14B. Those should follow
separate handoffs and reviews after 14A is completed and reviewed.

