# TODO #29 / #32 / #20 - Codex next execution package

## Relevant TODO

- #29 Sýnilegri innskráning og context-aware nav
- #32 Skýrari texti fyrir nýskráningu/innskráningu
- #20 Bottom bar innskráning þarf stundum tvísmell á mobile

## Current TODO Status

Top open TODO items are now:

1. #29 - hamburger/context-aware nav follow-up
2. #32 - clearer registration/sign-in wording
3. #12 - clearer vote button
4. #20 - bottom bar login sometimes needs two taps on mobile
5. #30 - larger `10,5` and favicon proposal

Codex recommends finishing #29/#32/#20 as one small navigation polish package
before moving to #12 or visual/logo work. This keeps auth/navigation behavior
coherent and avoids leaving two different `Innskráning` concepts in the UI.

## Background

Claude Code implemented v005:

`ai-handoff/2026-06-09-2020-todo-029-032-020-v005-claude-auth-aware-menu-post-implementation.md`

Codex reviewed it in v006:

`ai-handoff/2026-06-09-2026-todo-029-032-020-v006-codex-auth-aware-menu-review.md`

Codex conclusion:

- The core #29 hamburger fix is reasonable.
- Full tests were green.
- #32 is not fully complete because bottom nav still says hardcoded
  `Innskráning`.
- #20 should stay open until bottom nav behavior is tested or fixed.

## Goal Of This Package

Finish the navigation polish safely:

1. Remove the remaining confusing `Innskráning` wording where the same flow is
   both registration and sign-in.
2. Decide the smallest safe bottom-nav behavior for logged-in users on public
   pages.
3. Add targeted tests for the actual regression class: public page/shell wiring
   and bottom-nav copy/behavior.
4. Produce a post-implementation handoff to Codex before Stebbi moves TODO items
   to DONE.

## Important Constraints

- Do not change OTP, Supabase auth mechanics, auth guards, RLS, grants, RPCs,
  migrations or production data.
- Do not add a broad client-side session system unless it is clearly necessary.
- Keep this small. This is navigation/copy polish, not a route migration or
  full auth architecture refactor.
- Use `messages/is.json` and `messages/en.json` for user-facing text where
  practical.
- Avoid long labels causing horizontal overflow in the fixed mobile bottom nav.

## Recommended Implementation Plan

### Step 1 - Re-read current state

Claude Code should inspect:

- `components/teskeid/NavBar.tsx`
- `components/teskeid/TeskeidMenu.tsx`
- `app/page.tsx`
- `app/senda-hugmynd/page.tsx`
- `app/innskraning/page.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/teskeid-menu.test.tsx`

Also check whether any relevant tests already cover `NavBar` or public page
variant wiring.

### Step 2 - Fix bottom-nav copy for #32

Current issue from Codex v006:

`components/teskeid/NavBar.tsx` still hardcodes:

```tsx
{ href: '/innskraning', label: 'Innskráning', icon: User }
```

This should not remain as-is.

Recommended copy:

- Hamburger / larger menu: `Nýskráning / innskráning`
- Bottom nav compact mobile label: `Nýskrá / inn`
- English compact bottom nav: `Join / sign in` or `Register / sign in` if it
  fits without overflow.

If Claude Code thinks `Nýskrá / inn` is too cryptic, propose a better compact
label in the post-implementation handoff. Do not silently leave `Innskráning`.

### Step 3 - Decide bottom-nav auth behavior

There are two acceptable paths. Prefer Path A unless implementation context
shows it is not enough.

#### Path A - Minimal copy-only fix

Keep public bottom nav public, but:

- move labels to translated keys or at least align them with the messages
  pattern;
- change the public auth label to compact registration/sign-in copy;
- add tests that prevent regression back to plain `Innskráning`.

This is lowest risk and avoids a new client-side session/hydration path.

#### Path B - Auth-aware bottom nav

Only choose this if Claude Code can do it cleanly without a broad refactor.

Options:

- split `BottomNav` into a prop-driven client component and pass `variant` from
  server pages, similar to `NavBar`; or
- create a very small wrapper used only on public server pages.

Avoid a new global client-side session hook unless existing repo patterns
already support it.

For logged-in users on public pages, authenticated bottom nav could show compact
items such as:

- `Heim`
- `Lánað`
- `Prófíll`

But this is a UX expansion. If it gets even slightly broad, stop at Path A and
leave a clear follow-up.

## Required Tests

At minimum, add or update tests for:

- Public `TeskeidMenu` label is `Nýskráning / innskráning`.
- Public bottom nav no longer renders plain `Innskráning`.
- Bottom nav label fits a compact mobile wording.
- `NavBar` default variant remains public.
- `NavBar variant="authenticated"` renders authenticated menu items and not
  the public login/register item.

If practical, add page-level tests for:

- `/` gets `authenticated` variant when `supabase.auth.getUser()` returns user.
- `/` gets `public` variant when `getUser()` returns null.
- `/senda-hugmynd` does the same.

Do not overbuild test infrastructure if current test setup makes page-level
tests expensive. A focused `NavBar` component test plus existing
`TeskeidMenu` tests may be enough for this small follow-up.

## Manual Localhost Checks For Stebbi

Claude Code should ask Stebbi to test:

1. Logged out on `/`: hamburger shows public items with clear
   registration/sign-in wording.
2. Logged out on `/`: bottom nav does not say only `Innskráning`.
3. Logged in on `/`: hamburger shows `Heim`, `Minn prófíll`, `Lánað og skilað`,
   `Hugmyndabankinn`, `Ný hugmynd`.
4. Logged in on `/senda-hugmynd`: same hamburger behavior.
5. Mobile 360-460 px: no horizontal scroll, no overlap, labels fit.
6. Tap the bottom auth nav item once on mobile while logged out: it should open
   the login/register page on the first tap.

## Commands Claude Code Should Run

- `npm run type-check`
- `npm run test:run -- lib/__tests__/teskeid-menu.test.tsx`
- Any new/updated targeted test file for `NavBar` or public page wiring
- `npm run test:run` if changes touch shared navigation or messages broadly

## DONE Criteria

#29 can move to DONE when:

- Stebbi confirms authenticated hamburger works from public idea pages.
- Tests pass.

#32 can move to DONE when:

- Hamburger/menu and bottom nav no longer use confusing plain `Innskráning`
  for the combined registration/sign-in flow.
- Labels fit on mobile.

#20 can move to DONE only when:

- Stebbi confirms the original mobile double-tap issue is gone; or
- Claude Code reproduces and fixes it directly.

If #20 cannot be reproduced, keep it open with explicit reproduction notes.

## Post-Implementation Handoff Required

After execution, Claude Code should create:

`ai-handoff/YYYY-MM-DD-HHMM-todo-029-032-020-v008-claude-bottom-nav-auth-copy-post-implementation.md`

Include:

- what changed;
- files inspected;
- files modified;
- commands and exit codes;
- whether Path A or Path B was chosen and why;
- whether #20 was reproduced or only left for Stebbi manual testing;
- remaining risks;
- explicit recommendation on whether #29/#32/#20 can move to DONE.
