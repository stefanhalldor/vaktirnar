# TODO #095 v025 — Tengsl entry point and reliable Teskeið menu localhost testing

## Plan

Verify two small localhost changes together:

1. `Minn prófíll` exposes a single entry point to `Tengsl` only when the signed-in user passes the canonical Tengsl feature gate.
2. The shared Teskeið hamburger remains immediately usable during slow localhost compilation or hydration and keeps its existing keyboard, outside-click, navigation and sign-out behavior.

This handoff describes product checks that work on localhost and, after the requested flagged rollout, on production. It does not authorize SQL or direct production-data changes.

## What was implemented

- `/api/teskeid/profile` now resolves Tengsl availability through `checkFeatureAccess(user.id, user.email, 'tengsl')` and returns only the boolean `tengsl_allowed` to the client.
- `Minn prófíll` defaults Tengsl visibility to false and renders no Tengsl text or link unless `tengsl_allowed` is true.
- An allowed user sees a mobile-sized `Tengsl` entry point linking to `/stillingar/tengsl`.
- The shared `TeskeidMenu` now uses native `<details>/<summary>` disclosure. Its core links can therefore open even before React hydration has completed.
- The menu preserves explicit button semantics, `aria-expanded`, screen-reader hiding while closed, Escape close, outside-click close, link close, unread state and sign-out.
- The trigger has a 44 px target, `touch-manipulation`, a raised stacking level and the existing focus treatment.

## Files inspected

- `WORKFLOW.md`
- `Design.md`, especially inputs, mobile behavior, navigation and loading feedback
- `components/teskeid/TeskeidMenu.tsx`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `app/api/teskeid/profile/route.ts`
- `lib/loans/guard.ts`
- existing profile, profile-route and Teskeið-menu tests

## Files changed

- `app/api/teskeid/profile/route.ts`
- `app/auth-mvp/minn-profill/page.tsx`
- `components/teskeid/TeskeidMenu.tsx`
- `lib/__tests__/profile-page.test.tsx`
- `lib/__tests__/teskeid-profile-route.test.ts`
- `lib/__tests__/teskeid-menu.test.tsx`
- `messages/is.json`
- `messages/en.json`

## Commands and results

- `npm.cmd run test:run -- lib/__tests__/profile-page.test.tsx lib/__tests__/teskeid-profile-route.test.ts`
  - 2 files passed, 31 tests passed, exit 0.
- The first two native-menu test runs exposed test/accessibility-contract differences. These were corrected before handoff; no known failure was left unresolved.
- Final `npm.cmd run test:run -- lib/__tests__/teskeid-menu.test.tsx`
  - 1 file passed, 34 tests passed, exit 0.
- Final `npm.cmd run type-check`
  - passed, exit 0.
- Full `npm.cmd run test:run`
  - 299 files passed, 1 skipped; 5,343 tests passed, 28 skipped and 8 todo; exit 0.
- `npm.cmd run lint`
  - passed, exit 0; only pre-existing warnings in unrelated session, landing and weather files.
- `npm.cmd run build`
  - production build compiled successfully and generated 128 static pages; exit 0.
- Scoped `git diff --check`
  - passed; only existing Windows LF/CRLF notices, exit 0.

## What was deliberately not done

- No SQL or migration was written or run.
- No Supabase row, RLS policy, auth state or production data was changed.
- No dev server was started, restarted or stopped.
- Unrelated working-tree changes were preserved.

## Decisions

- The profile does not duplicate Tengsl data or settings. It is only the expected personal-settings entry point.
- Visibility uses the same canonical gate as the destination route. With local private-beta settings this means `TENGSL_ENABLED=true`, `TENGSL_FLAG=true` and an explicit `feature_access` row for `tengsl`.
- Visibility is fail-closed during loading and on API/gate failure, so an unentitled user gets no preview of the feature.
- Native disclosure was chosen because a React-only hamburger can look interactive before localhost hydration is ready. The native control removes that dead interval while retaining enhanced behavior after hydration.

## Remaining risk and next step

- The original screenshot showed one browser-console error. The menu no longer depends on hydration for its core opening behavior, but that console error may represent a separate runtime issue. Capture the first red console message and stack if it remains after refresh.
- Native disclosure behavior should be smoke-tested in both Chromium responsive mode and a real mobile browser before production rollout.
- Full release verification is still required before commit/push/deployment.

## Questions for review

- Does the `Tengsl` entry point feel correctly placed within `Minn prófíll`, or should later personal settings use a separate labelled section?
- Is the short description useful, or should the profile show only the single-line `Tengsl` row?
- Does the native menu open reliably during initial localhost compilation and repeated navigation?

## Supabase and access impact

- No SQL file is involved and no SQL was run.
- No RLS, grants, auth, schema, function or data behavior changed.
- The existing server-only feature-access lookup is reused. The client receives only `tengsl_allowed: boolean`; it never receives the access row or another user's data.
- Do not remove the production entitlement from the only active production user merely to test the hidden state. Use a designated unflagged test identity if available.

## Localhost checks for Stebbi

### Required state

- Keep your existing localhost server running; Codex did not start or restart it.
- Use a signed-in test user with `tengsl` access for checks 1–5.
- Local private-beta configuration should have `AUTH_MVP_ENABLED=true`, `TENGSL_ENABLED=true` and `TENGSL_FLAG=true`.
- For the hidden-state check, use a separate authenticated test identity without a `feature_access` row for `tengsl`. Do not casually remove your own production entitlement.

### 1. Immediate hamburger opening

1. Open `/auth-mvp/heim` and perform a hard refresh.
2. While localhost is initially compiling, click the hamburger as soon as it appears.
3. Expect the menu to open immediately and the icon to change from hamburger to X.
4. Close and reopen it at least ten times with ordinary clicks/taps.
5. Expect every interaction to produce exactly one open/close transition; the control must never look dead.

### 2. Menu close and navigation behavior

1. Open the menu and press Escape. Expect it to close.
2. Open it and click outside. Expect it to close.
3. Open it and choose `Minn prófíll`. Expect navigation to `/auth-mvp/minn-profill` with no horizontal overflow or mobile zoom.
4. Return to the home page, open the menu and test `Teskeiðar` and `Ný hugmynd`.
5. Do not test `Skrá út` unless you are comfortable signing the localhost session out.

### 3. Keyboard and responsive behavior

1. At widths around 320, 390 and 530 CSS px, use Tab to focus the menu trigger.
2. Press Enter and Space. Expect the menu to open and close with a visible focus ring.
3. Expect the menu panel to remain inside the viewport, above page cards and without horizontal page scrolling.

### 4. Flagged profile entry point

1. As the Tengsl-enabled user, open `/auth-mvp/minn-profill`.
2. Expect one `Tengsl` row beneath the profile form with the description `Flokkaðu tengda aðila og haltu utan um tengslahringi.`
3. Click it. Expect the existing canonical Teskeið loader if navigation waits, followed by `/stillingar/tengsl`.
4. Expect existing Tengsl labels, people and circles to load unchanged.

### 5. Unflagged hidden state

1. Sign in with a designated user who does not have the per-user `tengsl` entitlement.
2. Open `/auth-mvp/minn-profill`.
3. Search the visible page for `Tengsl`; expect no row, description, placeholder or disabled control.
4. Directly open `/stillingar/tengsl`; expect the existing route guard to reject/redirect the user.
5. This check is about visibility and access only. Do not grant/revoke production access or change Supabase directly as part of casual UI testing.

### 6. Console regression check

1. Keep DevTools Console open during the tests above.
2. Expect no hydration mismatch or `TeskeidMenu` runtime error.
3. If the existing red error count remains, expand the first error and send Codex the exact message, first application stack frame and the action that triggered it. Do not include tokens, cookies, environment values or other secrets.
