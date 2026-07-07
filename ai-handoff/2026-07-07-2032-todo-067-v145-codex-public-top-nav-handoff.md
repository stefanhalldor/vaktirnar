# TODO 067 - v145 Codex handoff: public sticky top nav instead of hamburger

Created: 2026-07-07 20:32  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi / Claude Code  
Purpose: Add Stebbi's public navigation requirement to the current TODO 067 item list.

## Requirement from Stebbi

For unauthenticated/public users:

1. Remove the hamburger menu.
2. Reuse the public bottom-bar navigation concept as a top bar instead.
3. Make that top bar sticky.
4. Show it not only on the front page, but also on:
   - `Ný hugmynd` (`/senda-hugmynd`)
   - `Innskráning` (`/innskraning`)

The public top bar should contain the same practical navigation items as the public bottom bar:

- `Hugmyndir`
- `Ný hugmynd`
- `Innskráning`

## Current state observed by Codex

Relevant files:

```text
components/teskeid/NavBar.tsx
components/teskeid/TeskeidMenu.tsx
app/page.tsx
app/senda-hugmynd/page.tsx
app/innskraning/page.tsx
messages/is.json
messages/en.json
lib/__tests__/teskeid-menu.test.tsx
lib/__tests__/login-form.test.tsx
```

Current behavior:

- `components/teskeid/NavBar.tsx` shows `TeskeidMenu variant="public"` in the header, so public users get hamburger menu.
- `components/teskeid/NavBar.tsx` also defines `BottomNav`, but `app/page.tsx` is currently the only inspected page that renders `<BottomNav />`.
- `/senda-hugmynd` renders `NavBar variant={user ? 'authenticated' : 'public'}`, so public users still see hamburger there.
- `/innskraning` renders a fixed public `TeskeidMenu`, so public users see hamburger there too.

## Design.md guidance

This is a navigation/layout change, so Claude Code must follow `Design.md`:

- Mobile-first.
- Sticky/fixed controls must respect mobile browser chrome and safe areas.
- Touch targets should generally be at least `40x40px`.
- No horizontal overflow at 360px, 390px, or 460px.
- Navigation must have clear active state and focus-visible state.
- Use Teskeið tokens/style direction, not old Krakkavaktin gray/violet patterns.
- Do not create a heavy marketing-style navbar; this should feel app-like and practical.

## Recommended implementation plan

### 1. Create a reusable public top navigation component

Prefer replacing `BottomNav` with a more general component rather than duplicating arrays/styles.

Possible shape:

```tsx
export function PublicPrimaryNav({ placement = 'top' }: { placement?: 'top' | 'bottom' })
```

But simpler is also fine:

```tsx
export function PublicTopNav()
```

Use shared item data:

```ts
const PUBLIC_NAV_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: User },
]
```

Do not hardcode visible labels if existing `messages/is.json` and `messages/en.json` already have suitable keys under `teskeid.nav`.

### 2. Public NavBar should not show hamburger

Update `components/teskeid/NavBar.tsx`:

- For `variant="authenticated"`, keep authenticated `TeskeidMenu`.
- For `variant="public"`, do not render `TeskeidMenu`.
- Render the public sticky top nav instead.

Suggested structure:

- Header contains logo/brand.
- Sticky public top nav sits under the logo header, or as a compact top row depending on visual fit.
- Avoid giant header height on mobile if the nav is now sticky.

The goal is not two navs. Public users should not see both hamburger and public top nav.

### 3. Apply public top nav to required pages

Update:

- `app/page.tsx`
  - remove bottom public nav if top nav replaces it
  - reduce extra bottom padding if it only existed for bottom nav
- `app/senda-hugmynd/page.tsx`
  - public user gets sticky top nav
  - authenticated user behavior should remain as-is unless Stebbi says otherwise
- `app/innskraning/page.tsx`
  - replace fixed public hamburger with the same public top nav/header
  - ensure login form still has enough top spacing and no overlap with sticky nav

Important: if authenticated users visit `/senda-hugmynd`, current authenticated menu can remain. This handoff is specifically for unauthenticated/public users.

### 4. Active state behavior

Expected active matching:

- `/` active -> `Hugmyndir`
- `/hugmyndir/[slug]` should probably also keep `Hugmyndir` active if public nav appears there later
- `/senda-hugmynd` active -> `Ný hugmynd`
- `/innskraning` active -> `Innskráning`

Avoid marking `/` active for every path. Existing tests already cover this kind of bug for `TeskeidMenu`.

### 5. Accessibility

Each nav link should:

- have visible text
- have an icon only as support
- have `aria-current="page"` when active
- have focus-visible ring
- remain usable with keyboard

If the sticky nav overlays content, add top padding/margin in page layout instead of letting controls cover headings or form fields.

## Suggested tests

Add or update tests around public navigation.

Possible tests:

1. Public `NavBar` does not render hamburger/menu button.
2. Public top nav renders links:
   - `/`
   - `/senda-hugmynd`
   - `/innskraning`
3. Public top nav marks `/senda-hugmynd` active only on that route.
4. Public top nav does not mark `/` active when pathname is `/senda-hugmynd`.
5. `/innskraning` page no longer renders `TeskeidMenu variant="public"` hamburger.
6. Existing authenticated `TeskeidMenu` tests must still pass.

Run:

```text
npm run type-check
npm run test:run
git diff --check
```

## Localhost checks for Stebbi

After Claude Code implements this:

1. Open `/` logged out.
2. Expected:
   - no hamburger menu
   - sticky top navigation is visible
   - `Hugmyndir`, `Ný hugmynd`, `Innskráning` are visible
   - `Hugmyndir` is active
3. Scroll the front page.
4. Expected: public top nav stays available and does not cover important content awkwardly.
5. Tap `Ný hugmynd`.
6. Expected:
   - `/senda-hugmynd` opens
   - sticky public top nav is still visible
   - `Ný hugmynd` is active
   - no hamburger menu
7. Tap `Innskráning`.
8. Expected:
   - `/innskraning` opens
   - sticky public top nav is still visible
   - `Innskráning` is active
   - login form is not hidden under the sticky nav
   - no hamburger menu
9. Test at mobile widths:
   - 360px
   - 390px
   - 460px
10. Expected:
   - no horizontal overflow
   - labels fit or wrap gracefully
   - touch targets feel easy
11. Log in and open authenticated areas.
12. Expected: authenticated menu behavior is unchanged unless intentionally adjusted in a separate phase.

## Risks / guardrails

- Do not remove authenticated hamburger/menu behavior as part of this unless Stebbi explicitly asks.
- Do not duplicate bottom and top public nav on the same screen.
- Do not leave extra `pb-32` from bottom nav if it creates weird whitespace after removing bottom nav.
- Do not hardcode new public nav text if suitable message keys exist.
- Be careful on `/innskraning`: sticky header must not interfere with email/code inputs, mobile keyboard, or Safari zoom behavior.

## Suggested sequencing

This is a small public shell/polish phase. It can be done independently of route alternatives.

Recommended order:

1. Finish/review current route alternatives work if Claude Code is already in the middle of it.
2. Then implement this public top nav as a separate small diff.

Do not combine this with Supabase, saved places, ferry fallback, or auth-token changes.

## What Codex did

Codex created this handoff only. No app code was changed. No SQL was run. No migrations were created. No commit, push, deploy, or production action was performed.
