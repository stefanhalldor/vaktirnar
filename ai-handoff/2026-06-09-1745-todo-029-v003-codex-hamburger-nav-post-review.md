# TODO #29 - Codex post-implementation review

Reviewed handoff:

- `ai-handoff/2026-06-09-1736-todo-029-v002-claude-hamburger-nav-post-implementation.md`

Reviewed commit:

- `c356eb6 feat: add hamburger context-aware nav (TODO #29)`

## Status

Needs follow-up before TODO #29 is considered cleanly done.

The implementation is generally small and appropriately scoped, and Codex found
no SQL, Supabase, RLS, grant, auth-guard, migration, or production-data
weakening. However, there are release/process and test issues that should be
fixed before relying on this as shipped.

## Findings

### 1. Pushed commit does not include the current `/innskraning` menu change

Severity: Medium

Current workspace has an uncommitted change in:

- `app/innskraning/page.tsx:4`
- `app/innskraning/page.tsx:23`

The change imports and renders `TeskeidMenu` on the login page, but it is not in
commit `c356eb6`, even though the handoff says `git push` succeeded and lists
`/innskraning` as a route Stebbi should test.

Impact:

- Stebbi may test localhost and see a login-page menu that is not actually in
  pushed `main`/deployment.
- The handoff's changed-files list is incomplete.
- The reported `npm run test:run` result may not cover the exact current tree.

Recommended fix:

- Claude Code should either commit/push this login-page menu change with the
  rest of TODO #29, or intentionally remove it from the local tree and update
  the handoff/testing notes.
- Do not leave localhost and pushed `main` divergent for the exact route where
  Stebbi is checking login visibility.

### 2. Targeted tests fail in the current tree

Severity: Medium

Codex ran:

```bash
npm run test:run -- lib/__tests__/innskraning-page.test.tsx lib/__tests__/login-form.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/home-page.test.tsx lib/__tests__/profile-page.test.tsx
```

Result:

- Exit code: `1`
- `99` passed
- `1` failed

Failed test:

- `lib/__tests__/home-page.test.tsx:773`
- Test: `profile link points to /auth-mvp/minn-profill`
- Error: unable to find label `Minn aðgangur`

Impact:

- The handoff says `npm run test:run` passed, but Codex could not reproduce a
  green targeted run on the current tree.
- This may be a test-mock issue rather than a runtime bug, but it still means
  the current review surface is not clean.

Recommended fix:

- Claude Code should rerun the same targeted command and fix the test or mock.
- Preserve the assertion that the profile link remains available on `/heim`;
  do not simply delete the regression test.

### 3. Active state does not cover loan subroutes

Severity: Low/Medium

In `components/teskeid/TeskeidMenu.tsx:64` active state is:

```ts
const active = pathname === href
```

This works for exact routes, but not for important authenticated child routes:

- `/auth-mvp/lanad-og-skilad/ny`
- `/auth-mvp/lanad-og-skilad/breyta/[id]`
- `/auth-mvp/lanad-og-skilad/claim/[id]`
- `/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]`

Impact:

- On loan subroutes, `Lánað og skilað` will not be highlighted in the menu even
  though the user is still inside that feature.
- This contradicts the handoff's manual check: "Confirm current route is
  highlighted".

Recommended fix:

- Use a small helper for active matching:
  - exact match for `/`, `/senda-hugmynd`, `/innskraning`, `/auth-mvp/heim`,
    `/auth-mvp/minn-profill`
  - exact or descendant match for `/auth-mvp/lanad-og-skilad`
- Add a test for at least `/auth-mvp/lanad-og-skilad/ny`.

### 4. Menu behavior is stubbed out in page tests and has no direct coverage

Severity: Low

The page tests now stub `TeskeidMenu`, and no dedicated `TeskeidMenu` test was
added.

Impact:

- Existing tests no longer verify the actual menu button, labels, active state,
  Escape close, outside-click close, or menu links.
- This is not a blocker by itself, but it weakens confidence in the feature's
  main behavior.

Recommended fix:

- Add a focused `TeskeidMenu` test covering:
  - accessible button label,
  - public items,
  - authenticated items,
  - open/close by click,
  - Escape close,
  - active state,
  - descendant active state for loan subroutes.

## Checks run by Codex

Read-only inspection:

- Read Claude handoff `v002`.
- Checked `git log`, `git show`, `git status`, and `git diff`.
- Reviewed:
  - `components/teskeid/TeskeidMenu.tsx`
  - `components/teskeid/NavBar.tsx`
  - `components/loans/LoanShell.tsx`
  - `app/auth-mvp/heim/page.tsx`
  - `app/auth-mvp/minn-profill/page.tsx`
  - `app/innskraning/page.tsx`
  - `components/teskeid/TeskeidLoginForm.tsx`
  - relevant message keys
  - relevant test snippets

Commands:

```bash
npm run type-check
```

Result:

- Exit code: `0`

```bash
npm run test:run -- lib/__tests__/innskraning-page.test.tsx lib/__tests__/login-form.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/home-page.test.tsx lib/__tests__/profile-page.test.tsx
```

Result:

- Exit code: `1`
- One failing `home-page.test.tsx` test as described above.

## Open UX questions

These are not blockers:

- Keeping the public `BottomNav` alongside hamburger is acceptable for this
  iteration, per Codex's original conservative plan.
- Keeping redundant individual icons (`UserCircle`, `Home`) beside the hamburger
  is acceptable for localhost testing. Stebbi can decide after seeing it.

## Recommendation

Claude Code should do a small follow-up before Stebbi treats TODO #29 as done:

1. Resolve the uncommitted `/innskraning` change mismatch.
2. Fix the failing `home-page.test.tsx` regression.
3. Improve active-state matching for loan subroutes.
4. Preferably add direct `TeskeidMenu` tests.

No Supabase, RLS, migration, or auth-boundary changes are needed for this
follow-up.
