# TODO #29 / #32 / #20 - Codex review of Claude v005

Reviewed handoff:
`ai-handoff/2026-06-09-2020-todo-029-032-020-v005-claude-auth-aware-menu-post-implementation.md`

## Findings

### Medium - #32 is not fully implemented because bottom nav still says `Innskráning`

`components/teskeid/NavBar.tsx:29-35` still defines the public bottom nav item as:

```tsx
{ href: '/innskraning', label: 'Innskráning', icon: User }
```

Claude Code correctly updated `messages/is.json:237` and `messages/en.json:237`
for `teskeid.nav.login`, and `TeskeidMenu` now uses the clearer
`Nýskráning / innskráning` label. But the bottom nav bypasses messages entirely.

Impact:

- #32 should stay open.
- #20 should stay open until Stebbi confirms the mobile double-tap symptom is
  gone or Claude Code fixes bottom-nav auth/copy directly.
- Stebbi can still test #29 hamburger behavior now, but #32 should not be moved
  to DONE from this implementation alone.

Recommended follow-up:

- Either make public `BottomNav` use translated nav labels, with a compact label
  that fits mobile, or explicitly decide that bottom nav keeps a shorter copy.
- Codex leans toward a short mobile label like `Nýskrá / inn` for bottom nav
  and `Nýskráning / innskráning` for hamburger/page title.

### Low - The actual page wiring regression is not directly covered by tests

`lib/__tests__/teskeid-menu.test.tsx` covers `TeskeidMenu` variants, but the bug
was in page wiring: public pages rendering the wrong `NavBar` variant.

The changed files `app/page.tsx:12-25` and `app/senda-hugmynd/page.tsx:8-16`
are not covered by a targeted test that proves:

- logged-out user gets `NavBar variant="public"`;
- logged-in user gets `NavBar variant="authenticated"`;
- `NavBar` passes that variant through to `TeskeidMenu`.

Impact is modest because the implementation is simple and full tests pass, but
this was the exact regression class that reached localhost.

Recommended follow-up:

- Add a small `NavBar` unit test for default/public/authenticated variant pass-through, or
- add page tests for `/` and `/senda-hugmynd` mocking `supabase.auth.getUser()`.

## What Looks Good

- `app/page.tsx` now derives menu state server-side with `supabase.auth.getUser()`
  and passes only a serializable variant string to the client component.
- `app/senda-hugmynd/page.tsx` uses the same pattern.
- `components/teskeid/NavBar.tsx` remains simple and backward-compatible with
  `variant = 'public'` default.
- No SQL, RLS, grants, policies, service-role functions, production data, auth
  guards or loan permissions were changed.
- `app/hugmyndir/[slug]/page.tsx` does not currently render `NavBar` or
  `TeskeidMenu`, so it does not have the specific misleading-login hamburger
  regression. It also does not provide authenticated shortcuts from detail pages;
  that can be a separate UX decision.

## Verification Run By Codex

- `npm run type-check` - exit 0
- `npm run test:run -- lib/__tests__/teskeid-menu.test.tsx` - exit 0, 20 passed
- `npm run test:run` - exit 0, 32 files, 909 passed, 22 skipped, 8 todo

## Recommendation

Do not block Stebbi localhost testing of the hamburger fix. The #29 core
implementation looks reasonable.

Do not mark #32 or #20 DONE yet.

Next smallest Claude Code follow-up:

1. Decide and implement bottom-nav auth/copy behavior.
2. Prefer not to add client-side session complexity unless Stebbi wants bottom
   nav to be fully auth-aware. A smaller first fix is to move bottom-nav copy to
   messages and use a compact public label.
3. If Stebbi still sees double-tap after this, investigate #20 as a separate
   mobile tap/navigation bug.
