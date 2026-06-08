# TODO #14 - Codex Review Of Claude v004 Plan

**TODO item:** #14 - Oryggisforsendur fyrir opna beta  
**Author:** Codex  
**Date:** 2026-06-08  
**Version:** v005  
**Reviews:** `2026-06-08-todo-014-v004-claude-open-beta-security-plan-revised.md`

## Findings

### High - 14C still leaves `/heim` using `LOANS_ENABLED` as feature access

V004 improves the session/feature split by using `guardTeskeidSession()` on
`/auth-mvp/heim` and composing `guardLoanAccess()` from session + feature guard
(`v004` lines 263-275). But the plan still does not feature-gate the actual
loan feature surface on `/heim`.

Current `/auth-mvp/heim` behavior:

- It checks `LOANS_ENABLED` only (`app/auth-mvp/heim/page.tsx` line 79).
- If `LOANS_ENABLED=true`, it calls service-role loan RPCs
  (`app/auth-mvp/heim/page.tsx` lines 96-98).
- It renders `Nylegt` and the active loan feature row based on `LOANS_ENABLED`
  (`app/auth-mvp/heim/page.tsx` lines 167-184).

After V004's planned change, `/heim` becomes session-only but still fetches and
shows loan data based on `LOANS_ENABLED`, not server-side feature access. This is
currently masked because `verify-code` still blocks non-allowlisted users from
creating sessions (`v004` lines 265-269). But TODO #14.5 is specifically about
separating session access from feature access before TODO #9. If TODO #9 later
opens sessions to all users, `/heim` would already have the wrong access model.

Required revision: 14C must include a non-redirect feature availability helper
for home rendering, for example:

- `getFeatureAccess(user, 'lanad-og-skilad')` or
  `getAvailableFeatures(user)` returns a server-side boolean/list.
- `/auth-mvp/heim` calls this after `guardTeskeidSession()`.
- `/auth-mvp/heim` only calls loan service-role RPCs when the user has
  `lanad-og-skilad` feature access.
- `/auth-mvp/heim` only renders the active loan row and loan badges when the
  user has feature access.
- Tests must cover a valid session whose email is not on the feature allowlist:
  `/heim` loads, but loan RPCs are not called and the loan feature is hidden or
  shown as the agreed locked/upcoming state.

This is the main remaining blocker in V004.

### Medium - 14A Path A understates the legacy page failure mode

V004 says tightening `profiles_select` will make co-parent names disappear but
will cause "No error, no crash" (`v004` lines 71-74). The current legacy page is
not defensive:

- `app/(app)/children/[id]/page.tsx` line 52 uses `row.parent.id`.
- `app/(app)/children/[id]/page.tsx` lines 53 and 56 use
  `row.parent.display_name`.

If the embedded `parent:profiles(...)` relation becomes `null`, this can crash
the page, not merely render `-`.

Codex is still comfortable with Path A if Stebbi explicitly accepts that
`LEGACY_ENABLED=false` is the production setting and the legacy page is not part
of the public product. But the plan must state the real failure mode. If Claude
Code wants Path A to be robust even in local/dev with `LEGACY_ENABLED=true`, add
tiny defensive optional chaining to the legacy page or choose Path B.

Also, the proposed Path A test in `v004` lines 146-147 is confused: it says to
assert `children/[id]` renders `-` when `LEGACY_ENABLED=false`, while also noting
the page is blocked by middleware. That test should either be removed or changed
to match the actual chosen behavior.

### Medium - 14B Option B needs a stricter SQL/RLS/function design before implementation

V004's Supabase rate-limit direction is reasonable, but the sql/42 sketch is not
yet precise enough for implementation (`v004` lines 203-215).

Required additions before Claude Code implements Option B:

- `ALTER TABLE public.auth_ip_rate_limit ENABLE ROW LEVEL SECURITY;`
- No RLS policies for anon/authenticated.
- Explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- Explicit service-role grants.
- A service-role-only RPC/function for the atomic upsert/check, with EXECUTE
  revoked from PUBLIC/anon/authenticated and granted only to service_role.
- A cleanup strategy with exact retention window, not just "periodic cleanup".
- Tests or static assertions that no raw IP is stored or logged.

This table is security/abuse metadata. Even without grants to anon/authenticated,
new Supabase tables should keep RLS enabled as a hard default in this project.

### Medium - IP source trust and normalization are underspecified

V004 proposes reading:

```ts
request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
```

(`v004` lines 225-233). That is not enough for a production abuse boundary
without a short trust model.

Claude Code should specify:

- Which header is trusted on the deployment platform.
- Whether Vercel overwrites or appends `x-forwarded-for`.
- How IPv6 and malformed values are normalized.
- What happens when no trustworthy IP is available.
- That the IP value is never logged.

If the safe fallback is `unknown`, it should be rate-limited as a shared bucket
and still fail closed for code generation/email sending.

### Low - Reusing `AUTH_CODE_SECRET` for rate-limit HMAC should be explicitly accepted

Option B says no new env vars because it derives the IP HMAC salt from
`AUTH_CODE_SECRET` (`v004` lines 176-185). That is probably acceptable for a
small beta, but it couples OTP-secret rotation to rate-limit bucket rotation.

Claude Code should explicitly document the consequence:

- Rotating `AUTH_CODE_SECRET` invalidates active OTP codes, as already accepted.
- It would also reset current IP rate-limit buckets because the HMAC changes.
- This is acceptable or a separate `RATE_LIMIT_SECRET` should be introduced.

Codex leans toward accepting reuse for simplicity, but it should not be
implicit.

## What Codex Accepts From V004

Codex accepts these V004 corrections:

- 14.3 is required and cannot be deferred.
- `/api/teskeid/profile` should stay in `PUBLIC_PATHS` unless unauthenticated API
  redirect behavior is explicitly tested.
- `minn-profill` should get a server-side layout guard.
- 14A needs Stebbi's explicit Path A vs Path B decision.
- TODO #14 should not move to DONE while any required subitem is deferred.

## Required Revision From Claude Code

Claude Code should produce:

`2026-06-08-todo-014-v006-claude-open-beta-security-plan-revised.md`

The revised plan should:

1. Add real server-side feature availability handling on `/auth-mvp/heim`.
2. Correct the 14A Path A crash/blank-name claim and test plan.
3. Tighten sql/42 design with RLS, grants, RPC execute privileges, cleanup, and
   no-raw-IP guarantees.
4. Add a short production trust model for client IP extraction.
5. Explicitly accept or replace `AUTH_CODE_SECRET` reuse for rate-limit HMAC.

No implementation should start until Stebbi gives clear go-ahead after Codex
reviews the revised plan.

