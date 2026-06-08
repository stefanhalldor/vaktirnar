# TODO #14 - Open Beta Security Plan Request

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Purpose:** Request an audit-first plan from Claude Code before any remaining
TODO #14 implementation begins.

## Context

Stebbi wants to finish TODO #14 completely before advertising Teskeid more
openly. Codex should not perform code changes unless Stebbi explicitly asks.
Claude Code may inspect the codebase, provide technical analysis, and write
plans, but should not start large implementation work until Stebbi gives a
clear go-ahead after Codex review.

Recent relevant state:

- Commit `6837467 Harden OTP and legacy access gates` exists.
- `sql/38_atomic_otp_verification.sql` has been run in Supabase production by
  Stebbi.
- `sql/39_legacy_access.sql` has been run in Supabase production by Stebbi.
- Production preflight Q1-Q4 for legacy access was run and confirmed by Stebbi.
- `sql/40_legacy_access_backfill.sql` has been run in Supabase production by
  Stebbi.
- The production `legacy_access` row for Stebbi's user was confirmed.
- Localhost reportedly works after the security/legacy package.
- `LEGACY_ENABLED=false` is likely the correct production setting because the
  old Krakkavaktin surface is not a real public product surface right now.

Known working-tree caveat:

- `TODO.md` and `DONE.md` currently have uncommitted local changes.
- Claude Code should not edit `TODO.md` or `DONE.md` during this audit/plan
  step unless Stebbi explicitly asks.

## Required Next Step For Claude Code

Claude Code should create an audit + implementation plan for TODO #14. This is
not an implementation request.

Claude Code must not:

- Change app code.
- Run SQL.
- Deploy.
- Push.
- Commit.
- Edit `TODO.md` or `DONE.md` in this step.
- Overwrite this file or older handoff/review files.

Claude Code should write one new file in `ai-handoff/` using the next filename
version for TODO #14, for example:

`2026-06-08-todo-014-v002-claude-open-beta-security-plan.md`

## Audit Scope

Claude Code should review TODO #14 with production-review strictness. The plan
should be critical, not merely agreeable. It should look for hidden risk,
unnecessary complexity, bad sequencing, and ways to solve the problem more
simply.

Focus areas:

- Auth/login behavior.
- RLS policies.
- Supabase grants, policies, functions, and migrations.
- Production data exposure.
- Current users and regressions.
- Edge cases.
- Deployment ordering.
- API responses and information leaks.
- Email abuse, Resend cost risk, and rate-limit failure behavior.

## Remaining TODO #14 Areas

### 14.2 Harden `profiles` Access

Claude Code should:

- Identify every UI, API, server action, RPC, and SQL function that reads
  `public.profiles`.
- Identify where `profiles_select` or equivalent broad access currently exists.
- Propose a migration, likely `sql/41_...`, that removes broad profile read
  access for ordinary authenticated users.
- Preserve necessary Teskeid flows.
- If old Krakkavaktin co-parent display-name behavior must be preserved, prefer
  a narrow RPC/view over broad `profiles_select`.
- Explain effects on RLS, grants, auth, policies, functions, production data,
  and rollback/recovery.

### 14.3 Add IP And Abuse Rate-Limit To Login Codes

Claude Code should:

- Review `/api/auth-mvp/request-code` and related helpers.
- Propose server-side abuse protection before OTP generation and email sending.
- Preserve generic API responses so the endpoint does not reveal allowlist,
  email existence, or rate-limit state.
- Avoid raw IP storage where practical. Prefer privacy-preserving hashing/HMAC
  or another scoped strategy.
- Define safe behavior if rate-limit storage or service is unavailable. Default
  preference: fail closed for sending/generating codes while returning the same
  generic response to the client.
- Explain whether this needs a SQL migration, external service, or local
  database table, and why.
- Include tests for per-email, per-IP, distributed-ish abuse, failure mode, and
  no-enumeration behavior.

### 14.5 Separate Session Access From Feature Access

Claude Code should:

- Review `guardTeskeidAccess()`, `/auth-mvp/heim`,
  `/auth-mvp/minn-profill`, `Laanad og skilad` pages, actions, APIs, and RPCs.
- Propose clear helper layers:
  - `guardTeskeidSession()` for active login/session.
  - `guardFeatureAccess(featureKey)` for a specific Teskeid feature.
  - Possibly `getAvailableFeatures(userId)` for the home screen.
- Ensure `/auth-mvp/heim` and `/auth-mvp/minn-profill` use session protection.
- Ensure `Laanad og skilad`, direct URLs, server actions, APIs, and RPC paths
  use server-side feature protection.
- Since TODO #4 and TODO #9 are not complete, propose whether
  `auth_mvp_allowlist` should temporarily act as the beta allowlist for
  `lanad-og-skilad`.
- Clearly call out whether open login for all users belongs in TODO #14 or must
  wait for TODO #9.

### Phase 14D Finalization

Claude Code should propose final tests and documentation movement:

- Regression tests for unknown users, allowed users, unauthenticated users,
  direct URLs, server actions, APIs, and RPC behavior.
- Static or unit tests for log safety if new logging appears.
- A final production/deploy order.
- A suggested point at which TODO #14 can move to DONE.md.

## Required Output From Claude Code

Claude Code's handoff file should include:

1. What is already done for TODO #14 and which commits/migrations support it.
2. Exact remaining work.
3. Proposed small phases:
   - Phase 14A: profiles hardening.
   - Phase 14B: auth abuse/rate-limit.
   - Phase 14C: session vs feature access.
   - Phase 14D: final #14 tests and TODO/DONE update.
4. For each phase:
   - Files to inspect.
   - Files likely to change.
   - SQL migrations, if any.
   - Whether SQL is read-only or changes schema/data.
   - Effects on RLS, auth, grants, policies, functions, and production data.
   - Rollback or recovery plan.
   - Tests.
   - Production/deploy order.
   - Risks and edge cases.
5. Questions Stebbi and Codex must approve before implementation starts.
6. A judgment on whether any phase is too large and should be split further.

## Codex Review Notes

Codex expects to review Claude Code's plan before implementation begins. Codex
will be especially skeptical of:

- Any broad authenticated grants on `profiles`.
- Any feature access enforced only in UI/client code.
- Any rate-limit design that leaks allowlist or email existence.
- Any migration that changes production data without a preflight or recovery
  plan.
- Any plan that bundles too much into one deploy.

