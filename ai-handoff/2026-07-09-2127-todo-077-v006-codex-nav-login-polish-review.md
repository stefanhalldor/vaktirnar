# Review: TODO #77 v006 - Nav/login polish prerelease

Created: 2026-07-09 21:27
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-09-2130-todo-077-v005-claude-nav-login-polish-prerelease.md`
Status: Review + Stebbi additions - not implemented by Codex

## Findings

### 1. Blocking before release: `/innskraning` still has too much empty space above the form

Stebbi's screenshot shows a large empty area between `PublicTopNav` and the login content.

The likely cause is still present in the current implementation:

- `app/innskraning/page.tsx:24` wraps the page in `min-h-screen flex flex-col`.
- `components/teskeid/TeskeidLoginForm.tsx:127` uses `grow ... flex items-center justify-center ...`.

That means the login form is vertically centered in all remaining height below the nav. On taller viewports this intentionally creates a big top gap. This directly conflicts with Stebbi's requested polish.

Recommended fix:

- Do not vertically center the login form in the remaining viewport when `PublicTopNav` is present.
- Change the wrapper toward top-aligned layout, for example:
  - `grow bg-[#fbf9f4] flex justify-center px-4 pt-8 pb-10`
  - or `items-start justify-center`
- Keep sensible bottom padding for mobile browser chrome.
- Re-check desktop and mobile so the form does not feel glued to the nav, but the red-box blank space is gone.

### 2. Blocking before release: `/senda-hugmynd` background is inconsistent with the public pages

Stebbi noticed `senda-hugmynd` does not use the same warm public background.

Current code:

- `app/senda-hugmynd/page.tsx:16` uses `bg-[#FAFAFA]`.

Public home and login use the warmer Teskeið background:

- `app/page.tsx:24` uses `bg-[#fbf9f4]`.
- `components/teskeid/PublicTopNav.tsx:19` uses `bg-[#fbf9f4]`.
- `components/teskeid/TeskeidLoginForm.tsx:127` uses `bg-[#fbf9f4]`.

Recommended fix:

- Change `/senda-hugmynd` main background to `bg-[#fbf9f4]`, or the project theme background token if preferred.
- Quick audit: `app/hugmyndir/[slug]/page.tsx` also uses `bg-[#FAFAFA]`; if Stebbi wants all public pages unified, include that too. For this specific request, at minimum fix `app/senda-hugmynd/page.tsx`.

### 3. Medium: v005 handoff says type-check is clean but does not show command details

The v005 handoff says "type-check hreinn" but does not include exact command output / exit code. Before release, Claude Code should confirm:

```bash
npm run type-check
npm run build
```

This matters because the change touches route rendering/layout and a shared nav component.

### 4. Low: home logo link has no active visual state

`components/teskeid/PublicTopNav.tsx:26` sets `aria-current` for `/`, but the home-logo link always uses the non-active visual class.

This may be intentional because the logo is brand/navigation rather than a tab. It is not blocking. If Claude Code wants exact consistency, it can add a subtle active state for pathname `/`, but avoid making the logo button visually heavier than the other nav items.

## Stebbi additions to carry into Claude Code handoff

Add these requirements explicitly:

1. Remove the large empty space on `/innskraning` between the public nav and the login content.
2. Make `/senda-hugmynd` use the same warm public background as the other public pages.
3. Keep the free-access label, but make sure it sits naturally in the tightened login layout.

## Suggested revised implementation

### Login layout

In `components/teskeid/TeskeidLoginForm.tsx`, change the outer wrapper from vertically centered to top-aligned.

Current:

```tsx
<div className="grow bg-[#fbf9f4] flex items-center justify-center px-4 py-8">
```

Direction:

```tsx
<div className="grow bg-[#fbf9f4] flex justify-center px-4 pt-8 pb-10">
```

or similar. The exact spacing can be tuned, but the large red-box gap should disappear.

### Public submit background

In `app/senda-hugmynd/page.tsx`:

```tsx
<main className="min-h-screen bg-[#fbf9f4]">
```

If Claude Code also sees the same mismatch on `app/hugmyndir/[slug]/page.tsx`, either include it in this polish pass or explicitly call it out as a follow-up so it does not get lost.

## Design.md notes

This is a public UI/layout change:

- Public pages are covered by the mobile app rules.
- Avoid excess empty space that pushes the primary form below the first viewport.
- Keep `input` text at 16px on mobile to prevent iOS zoom; current `text-base sm:text-sm` should remain.
- No horizontal overflow at 360-390 px.
- Navigation should remain visible and stable.
- Reuse warm Teskeið background consistently.

## Localhost checks for Stebbi

Unauthenticated/private browser:

1. Open `http://localhost:3004/innskraning`.
2. Confirm there is no large empty block between the public nav and the login content.
3. Confirm the page still has breathing room and does not feel cramped against the nav.
4. Confirm `Aðgangurinn er ókeypis` / free-access label still appears naturally.
5. Confirm email input and code input still work and do not zoom awkwardly on mobile.
6. Open `http://localhost:3004/senda-hugmynd`.
7. Confirm the background matches the public home/login warmth, not the cooler `#FAFAFA` look.
8. Confirm public nav/logo still looks right and the submit form has no layout regressions.
9. Open `http://localhost:3004/` and confirm the public nav logo still works and the home page did not regress.

Authenticated browser:

1. Open `http://localhost:3004/`.
2. Confirm authenticated nav behavior is unchanged.
3. Open `http://localhost:3004/senda-hugmynd`.
4. Confirm authenticated `NavBar` still appears and the page background is still acceptable.

## Commands before release

```bash
npm run type-check
npm run build
```

Run `npm run test:run` if Claude Code changes tests or if existing affected tests are expected to cover these pages.

No SQL, RLS, Supabase schema, secrets, production data, billing, commit, push or deploy is part of this review.
