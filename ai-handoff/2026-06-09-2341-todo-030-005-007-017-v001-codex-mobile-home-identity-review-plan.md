# TODO #30 / #5 / #7 / #17 - Review-first execution package

## Relevant TODO items

- TODO #30: Stærra `10,5` og ný favicon-tillaga
- TODO #5: Samræmd mobile app-upplifun á öllu Teskeið.is
- TODO #7: Langlíf innskráning með app-líkri mobile-upplifun
- TODO #17: Hugmyndir úr hugmyndabankanum á `/heim`

## Purpose

This is not an implementation green light.

Codex is asking Claude Code for a critical technical review of this proposed
execution package. Claude Code should inspect the codebase, challenge the order,
identify hidden risk, and return a review/implementation proposal to Stebbi.
Stebbi should then send Claude Code's response back to Codex for review before
Claude Code performs the actual implementation.

The goal is to package several low-to-medium risk user-facing improvements
without accidentally mixing them with the larger #19/#27 `Nýlegt` event-feed
work currently in flight.

## High-level recommendation

Do not implement all four TODOs as one code change unless Claude Code can keep
the phases small, independently testable, and easy to revert.

Recommended sequencing:

1. Phase A: #30 visual identity proposal only.
2. Phase B: #5 mobile baseline audit and safe global fixes.
3. Phase C: #7 session-lifetime investigation, with implementation only if
   Supabase/auth settings and current cookie behavior are understood.
4. Phase D: #17 `/heim` idea-bank module, after #19 event-feed work is not
   actively changing the same `/heim` surface.

Phases A and B may be candidates for one implementation round if the diffs stay
small. Phases C and D should not be rushed unless Claude Code confirms they do
not touch risky auth or the same files as active #19 work.

## Critical concurrency warning

Stebbi said Claude Code is currently executing another task. Claude Code must
avoid editing the same files concurrently with that work.

Expected collision areas:

- `/auth-mvp/heim` and `RecentSection` may be touched by #19/#27 event-feed work.
- Global navigation/layout files may have recent changes from #29/#32/#20.
- Auth/session helpers may be sensitive if #7 is investigated.

If #19 event-feed implementation is still active, Claude Code should not start
#17 implementation on `/heim` yet. Claude Code may still review #17 and propose
the safest integration point.

## Phase A - TODO #30: `10,5` identity and favicon proposal

### Goal

Make `10,5` more visible on the cap in the canonical Teskeið logo and prepare a
separate favicon proposal that shows only `10,5`.

### Review tasks for Claude Code

- Locate the current logo implementation, likely `TeskeidLogo`, `app/icon.svg`,
  app icons, favicon metadata, and any preview tooling already present.
- Identify whether the logo is SVG/code-native or bitmap.
- Confirm whether existing favicon/app icon assets are generated from one
  source or hand-maintained separately.
- Check whether there is already a safe preview route or static preview folder.

### Recommended implementation shape

- Create preview assets/options first; do not replace production favicon without
  Stebbi approval.
- Keep the canonical logo character intact. Only increase the readability of
  `10,5` enough that it is visible at common header/logo sizes.
- Create a favicon candidate where the whole mark is just `10,5`, optimized for
  16x16, 32x32, 192x192, and 512x512 contexts.
- Prefer SVG/vector or existing icon pipeline if the current project already
  uses it.
- If a bitmap is needed, generate preview assets separately and document them;
  do not quietly replace production assets.

### Acceptance criteria

- Stebbi can compare current and proposed logo/favicon.
- `10,5` is visibly clearer on the cap.
- Favicon proposal remains readable at tiny sizes.
- No production icon replacement happens without a clear approval step.

## Phase B - TODO #5: Mobile app baseline

### Goal

Make Teskeið feel consistently app-like on mobile, especially around inputs,
keyboard behavior, layout width, safe areas, and auth screens.

### Review tasks for Claude Code

- Search for all input, textarea, select, date, search, OTP/code, and email
  controls across the public app and authenticated Teskeið surfaces.
- Check global CSS and component-level text sizes. On iOS Safari, inputs below
  16px commonly trigger automatic zoom.
- Identify any containers that can cause horizontal page overflow, especially
  fixed-width controls, date inputs, sheets/dialogs, bottom nav, and forms.
- Inspect `/innskraning`, `/auth-mvp/heim`, `/auth-mvp/lanad-og-skilad`,
  profile, idea-bank, and any canonical aliases if present.
- Check whether current viewport meta allows user zoom. Do not disable user
  zoom globally.
- Confirm whether `Design.md` exists and what canonical colors, spacing,
  typography, and focus-visible rules it defines.

### Recommended implementation shape

Keep this as a baseline pass, not a redesign of every screen.

Safe likely changes:

- Ensure form controls use accessible mobile-safe font sizes, typically 16px or
  larger.
- Normalize common input/control classes through existing UI primitives instead
  of one-off page fixes.
- Add `max-width: 100%`, `min-width: 0`, and responsive constraints where
  current controls overflow.
- Ensure fixed/sticky controls respect safe-area insets.
- Make `/innskraning` visually consistent with the current Teskeið brand and
  not legacy Krakkavaktir styling.
- Keep the logo link behavior server-auth aware:
  - authenticated user goes to `/heim`,
  - unauthenticated user goes to `/`,
  - no hydration mismatch.

Avoid:

- `user-scalable=no`.
- broad CSS resets that may break Radix/dialog behavior.
- touching auth logic while only solving layout.
- redesigning `/heim` if #19 is actively changing it.

### Acceptance criteria

- No unwanted zoom when focusing inputs on common mobile widths.
- No horizontal page scroll at 360-460 px.
- Forms remain accessible and readable.
- Keyboard opening/closing does not hide primary actions in a broken way.
- Existing auth and loan flows still work.

## Phase C - TODO #7: Long-lived login

### Goal

Make login feel app-like and persistent without weakening auth, Supabase
session validation, or logout.

### Important caution

This phase must start with investigation, not code changes.

Long-lived login can affect auth, cookies, refresh-token behavior, logout,
revocation, middleware, and user trust. Claude Code should not tweak expiry
values or cookie behavior until it has mapped the current Supabase setup.

### Review tasks for Claude Code

- Map current Supabase auth clients:
  - browser client,
  - server client,
  - middleware/session refresh,
  - route guards,
  - logout implementation.
- Identify where session cookies are created, refreshed, expired, and cleared.
- Determine current Supabase project/session settings if they are represented in
  code or docs. Do not require Stebbi to expose secrets.
- Check whether current behavior is actually a code issue, a Supabase dashboard
  setting, a middleware refresh issue, or a browser storage/cookie issue.
- Identify redirect-loop risks for expired sessions.
- Check intended return-path behavior after re-login.

### Recommended implementation shape

Codex recommends Claude Code return an investigation report first, with one of
these routes:

- Route 1: no code change, Supabase settings/documentation recommendation only.
- Route 2: small middleware/session-refresh fix if refresh is not happening
  reliably.
- Route 3: explicit "Haltu mer innskradum" style UX if the current auth model
  needs user-facing choice.
- Route 4: defer because risk is too high for the current release train.

Do not:

- disable expiry,
- make access tokens extremely long-lived,
- store custom long-lived secrets in localStorage,
- weaken server-side guards,
- make logout cosmetic only.

### Acceptance criteria

- Auth remains server-verified.
- Refresh-token behavior is understood.
- Logout actually ends the session.
- Expired/revoked sessions do not loop.
- Mobile browser close/app-switch does not unnecessarily force login if the
  intended session is still valid.

## Phase D - TODO #17: Ideas from idea bank on `/heim`

### Goal

Replace disabled `Væntanlegt` rows on `/heim` with real published ideas from
the public idea bank, including voting from the home screen.

### Dependency warning

Do not implement this while #19 event-feed changes are actively modifying
`/auth-mvp/heim` unless Claude Code can prove the files and components are not
colliding.

### Review tasks for Claude Code

- Locate canonical idea-bank data source, published/draft visibility rules,
  voting action/API, duplicate-vote protection, and idea detail route.
- Identify whether votes are public, authenticated-only, cookie-based, or tied
  to user/session state.
- Confirm how hidden/draft/admin-only ideas are excluded.
- Check current `/heim` structure and where the disabled `Væntanlegt` rows live.
- Decide whether the UI should be:
  - horizontal scroll-snap cards,
  - compact stacked list,
  - one highlighted idea plus smaller items,
  - or another mobile-first pattern.

### Recommended implementation shape

- Reuse canonical idea queries and voting logic.
- Do not create a second voting system for `/heim`.
- Show only published public ideas.
- Keep active Teskeiðar like `Lánað og skilað` visually distinct from ideas.
- Make idea title/card click through to the canonical idea route.
- Allow voting directly from `/heim` if existing voting logic can be reused
  safely.
- Use a quiet fallback if no published ideas exist or data fetch fails.
- Avoid auto-playing carousel behavior.
- Respect `prefers-reduced-motion`.
- Avoid horizontal page overflow.

### Acceptance criteria

- Published ideas render on `/heim`.
- Draft/hidden/admin-only ideas do not render.
- Voting from `/heim` updates count/state consistently with canonical idea page.
- Duplicate-vote protection still works.
- Empty/failure state does not break `/heim`.
- Mobile viewport remains stable at 360-460 px.

## Suggested combined package boundaries

Codex recommends Claude Code review whether to split the actual implementation
like this:

### Package 1: #30 + low-risk #5 baseline

Good candidate for one implementation if diffs are small:

- logo/favicon preview proposal,
- mobile input font-size/overflow baseline,
- `/innskraning` visual consistency if not too broad.

### Package 2: #7 investigation only

Return an auth/session report before code changes.

### Package 3: #17 home ideas

Implement after #19 event-feed work is stable or after Claude Code confirms no
file collisions.

## Required response from Claude Code

Claude Code should create a new handoff/review file, for example:

`2026-06-09-HHMM-todo-030-005-007-017-v002-claude-review.md`

It should include:

1. Whether Claude Code agrees with the proposed phase order.
2. Any file collision risk with current #19/#27 work.
3. Which files Claude Code inspected.
4. Which phase Claude Code recommends implementing first.
5. Whether #30 and #5 can safely be done together.
6. Whether #7 should be investigation-only.
7. Whether #17 should wait for #19 to settle.
8. Specific implementation plan for the first package only.
9. Risks around auth, Supabase, RLS, user data, and mobile regressions.
10. Tests Claude Code would run.
11. Explicit statement that no implementation has started unless Stebbi gave a
    separate green light.

After that, Stebbi should send Claude Code's v002 handoff to Codex for review
before Claude Code implements.
