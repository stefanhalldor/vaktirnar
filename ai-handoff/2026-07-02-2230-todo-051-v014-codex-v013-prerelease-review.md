# TODO #51 - Codex v014 - Review of Claude Code v013 pre-release

Created: 2026-07-02 22:30
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review handoff for Claude Code

Refs:
- `ai-handoff/2026-07-02-2221-todo-051-v013-claude-phase1-prerelease.md`
- `ai-handoff/2026-07-02-2211-todo-051-v012-codex-v011-review-handoff.md`
- `ai-handoff/2026-07-02-2201-todo-051-v011-claude-option-a-phase1-plan.md`

---

## Scope of this review

Codex reviewed Claude Code v013 and the current local diff for TODO #51
Facebook OAuth linking Phase 1 Option A.

Codex did not change code, SQL, Supabase settings, Facebook settings, commits,
pushes, deployments, or production state. This file is the only Codex-created
artifact in this step.

---

## Findings

### 1. Blocker: per-user `facebook-oauth` flag cannot work with current DB/admin setup

Claude Code added `facebook-oauth` to `checkFeatureAccess`:

- `lib/loans/guard.ts`

But the current `feature_access` schema only allows:

- `umonnun`
- `tengsl`

Evidence:

- `sql/53_feature_access_tengsl.sql` has:
  `CHECK (feature_key IN ('umonnun', 'tengsl'))`
- `app/api/admin/feature-access/route.ts` has:
  `const ALLOWED_FEATURES = ['umonnun', 'tengsl'] as const`

Impact:

If `FACEBOOK_OAUTH_FLAG=true`, Stebbi cannot add a `feature_access` row for
`facebook-oauth` through the existing admin/API path, and the DB constraint
would reject such a row anyway.

Decision needed before release:

1. Make Phase 1 global-only while Facebook review is underway:
   - Use `FACEBOOK_OAUTH_ENABLED=true`
   - Do not use `FACEBOOK_OAUTH_FLAG=true`
   - Remove or clearly park the per-user flag promise from the Phase 1 release
     checklist.

2. Or make Phase 1 per-user gated:
   - Add a proper SQL migration widening `feature_access_feature_key_check` to
     include `facebook-oauth`.
   - Update admin feature access allow-list and tests.
   - Add explicit Supabase/RLS/migration review before applying.

Codex recommendation:

For the current MVP, choose option 1 unless Stebbi explicitly wants a SQL/admin
mini-phase now. This keeps Phase 1 smaller and avoids mixing OAuth linking with
a schema change.

---

### 2. Blocker: current legacy guard test suite fails

Claude Code intentionally removed `/auth/callback` from legacy UI blocking in:

- `middleware.ts`

That product direction is probably correct because `/auth/callback` is an
infrastructure route needed by Supabase Auth/OAuth callbacks. But the existing
test still asserts the old behavior:

- `lib/__tests__/legacy-guard.test.ts`
- test name: `/auth/callback -> /`

Codex ran:

```txt
npm run test:run -- lib/__tests__/legacy-guard.test.ts
```

Result:

```txt
Exit code: 1
49 passed, 1 failed
Failed: expected 307, received 200 for /auth/callback
```

Required before release:

- Update the legacy guard test to reflect the new intended callback behavior.
- Add/adjust a test proving `/auth/callback` is no longer blocked when
  `LEGACY_ENABLED !== 'true'`.
- Ideally add a callback route test for bad/missing OAuth code with
  `next=/auth-mvp/minn-profill?facebook=linked` returning
  `/auth-mvp/minn-profill?facebook=error`.

---

### 3. Important: missing automated coverage for the new Facebook flow

Codex did not find tests for:

- `checkFeatureAccess('facebook-oauth')`
- `FACEBOOK_OAUTH_ENABLED` / `FACEBOOK_OAUTH_FLAG` combinations
- profile GET returning `facebook_oauth_allowed` and `facebook_connected`
- unlink route guards in `app/api/teskeid/profile/facebook/route.ts`
- callback `safeNext` / Facebook fallback behavior
- profile page states for linked, not linked, linking, unlinking, error

This is auth/account-linking behavior and deserves at least focused unit/API
coverage before release.

Minimum test recommendation:

- Extend `lib/__tests__/guard.test.ts` for `facebook-oauth`.
- Add route-level tests for `app/auth/callback/route.ts` or equivalent route
  helper coverage for `safeNext` and Facebook fallback.
- Add API tests for profile GET/unlink guards if current test harness supports
  mocking Supabase user identities.
- Update existing profile page test to assert Facebook section visibility when
  allowed and absence when not allowed.

---

### 4. Process/packaging: handoff says ten files, but changed-file story is ambiguous

Claude Code v013 says "Tiu skrar breyttar eda baettar vid", but the listed
Phase 1 code/config/message files are nine concrete paths. Current `git diff
--stat` also includes `TODO.md`, which appears to contain earlier TODO #51/#66
planning edits.

This may be harmless dirty-worktree context, but Claude Code should clarify
before release:

- Which files are part of Phase 1 Option A.
- Whether `TODO.md` changes are unrelated and should be left alone, or intended
  to ship with the same commit.

Do not revert `TODO.md` blindly; just document ownership and release scope.

---

## Commands Codex ran

Read-only inspection:

```txt
git diff -- middleware.ts app/auth/callback/route.ts app/api/teskeid/profile/route.ts app/auth-mvp/minn-profill/page.tsx lib/loans/guard.ts .env.example messages/is.json messages/en.json
Get-Content app/api/teskeid/profile/facebook/route.ts
rg -n "auth/callback|LEGACY_UI_PREFIXES|facebook-oauth|FACEBOOK_OAUTH" ...
git diff -- TODO.md
rg -n "feature_access_feature_key_check|facebook-oauth|facebook_oauth" sql lib app messages TODO.md
```

Verification:

```txt
npm run test:run -- lib/__tests__/legacy-guard.test.ts
```

Result:

```txt
Exit code: 1
49 passed, 1 failed
Failure: lib/__tests__/legacy-guard.test.ts expects /auth/callback to redirect to /
```

```txt
npm run type-check
```

Result:

```txt
Exit code: 0
tsc --noEmit passed
```

---

## Suggested next step for Claude Code

Claude Code should produce a v015 fix plan, not immediately continue with more
implementation unless Stebbi gives explicit execution approval.

Recommended v015 plan:

1. Decide with Stebbi whether Phase 1 is global-only or per-user gated.
2. If global-only:
   - Keep no SQL migration.
   - Treat `FACEBOOK_OAUTH_FLAG` as not used in this MVP, or remove it from
     this phase to avoid false expectations.
   - Update localhost checks accordingly.
3. If per-user gated:
   - Write a small migration plan for `feature_access_feature_key_check`.
   - Update admin allow-list and tests.
   - Stop for Codex review before SQL is written/run.
4. Update the legacy guard test for `/auth/callback`.
5. Add focused tests for the new Facebook OAuth behavior.
6. Re-run at least:
   - `npm run test:run -- lib/__tests__/legacy-guard.test.ts`
   - relevant new/updated tests
   - `npm run type-check`

---

## Localhost checks for Stebbi

Do not treat v013 as release-ready yet.

Before Stebbi spends time on Supabase/Facebook dashboard setup, Claude Code
should resolve the two blockers above:

1. `facebook-oauth` feature flag strategy is decided and internally consistent.
2. Existing legacy guard tests are green again.

After Claude Code fixes those and provides a new handoff, Stebbi can test
locally:

1. Ensure `AUTH_MVP_ENABLED=true`.
2. If global-only MVP is chosen:
   - Set `FACEBOOK_OAUTH_ENABLED=true`.
   - Do not set `FACEBOOK_OAUTH_FLAG=true`.
3. If per-user gated MVP is chosen:
   - Only test after the reviewed SQL/admin changes are applied in a safe
     environment.
   - Do not insert `facebook-oauth` into `feature_access` casually before the
     DB constraint has been updated.
4. Open `/auth-mvp/minn-profill`.
5. Confirm Facebook section appears only under the chosen gating rule.
6. Confirm `/innskraning` still has no Facebook login option.
7. Confirm OTP login still works.
8. On mobile widths 360, 390, and 460 px, check the profile card for:
   - no horizontal scroll
   - no text overlap in the Facebook status row
   - no unexpected zoom after focusing name/email fields
   - stable button width while "Tengist..." / "Aftengist..." is visible

Do not test production Facebook OAuth, Supabase provider settings, secrets,
Meta App Review, deployment, or production data changes without separate
explicit approval from Stebbi.

---

## Uncertainty / needs confirmation

- Codex did not verify Supabase's exact `linkIdentity`/`unlinkIdentity`
  runtime behavior against a real configured Facebook provider.
- Codex did not inspect every profile-page test harness in depth; the listed
  test recommendations are based on current diff and targeted grep.
- The `TODO.md` diff appears related to earlier planning, but Claude Code
  should clarify whether it is part of this release scope.
