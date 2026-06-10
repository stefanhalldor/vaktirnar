# TODO #29 - Hamburger / context-aware navigation implementation plan

Relevant TODO: #29 - `Sýnilegri innskráning og context-aware nav`

Stebbi has explicitly asked Claude Code to implement this now and then produce a post-implementation/post-release handoff back to Codex. Stebbi will test on localhost while Codex reviews that handoff.

## Goal

Make Teskeið navigation clearer, especially login visibility.

Stebbi's idea:

- Add a hamburger/menu in the top corner.
- Include routes such as:
  - `Innskráning`
  - `Hugmyndabankinn`
  - `Ný hugmynd`
  - `Heim`
  - `Minn prófíll`
- The menu should adapt to where the user is and whether the user is signed in.

## Current implementation facts

Based on Codex read-only review on 2026-06-09:

- Public landing page `app/page.tsx` renders:
  - `components/teskeid/NavBar`
  - public `BottomNav`
- `components/teskeid/NavBar.tsx` is a client component.
  - `NavBar` currently only shows centered logo.
  - `BottomNav` is a fixed bottom nav with hardcoded links:
    - `/` - `Hugmyndir`
    - `/senda-hugmynd` - `Ný hugmynd`
    - `/innskraning` - `Innskráning`
- `app/senda-hugmynd/page.tsx` renders `NavBar`, but not public `BottomNav`.
- `app/innskraning/page.tsx` is server-side and redirects signed-in users to `/auth-mvp/heim`.
- `/auth-mvp/heim` has a profile icon link to `/auth-mvp/minn-profill`.
- `/auth-mvp/minn-profill` has a home icon and a separate logout button.
- Loan pages use `components/loans/LoanShell` plus per-page `nav` nodes.
- Current visible authenticated user routes still use `/auth-mvp/*`; TODO #22 will clean canonical URLs later.

## Scope for this implementation

Claude Code should implement a first usable version of #29.

Recommended scope:

1. Add a reusable top-corner hamburger menu component.
2. Use it on public Teskeið pages where `NavBar` appears.
3. Use it on key authenticated Teskeið pages:
   - `/auth-mvp/heim`
   - `/auth-mvp/minn-profill`
   - `Lánað og skilað` pages via `LoanShell` or the per-page nav row.
4. Keep routing behavior compatible with current routes.
5. Do not implement TODO #22 canonical route cleanup in this task.
6. Do not remove existing bottom nav unless it is clearly redundant and Stebbi can verify the replacement easily.

Conservative first iteration:

- Keep public `BottomNav` on `/` for now.
- Add hamburger in the top-right corner of `NavBar`.
- If the UI feels duplicated, hide/remove bottom nav only after Stebbi confirms in localhost testing or if Claude Code can show the hamburger fully replaces it without regressions.

## Suggested architecture

Use a small shared client component, for example:

- `components/teskeid/TeskeidMenu.tsx`

Possible props:

```ts
type TeskeidMenuItem = {
  href: string
  label: string
  icon?: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

type TeskeidMenuProps = {
  items: TeskeidMenuItem[]
  currentPath?: string
  label: string
  closeLabel: string
}
```

Use `lucide-react` icons where helpful:

- `Menu`
- `X`
- `LogIn`
- `Lightbulb`
- `Send`
- `Home`
- `UserCircle`
- maybe `Archive` or a neutral icon for `Lánað og skilað` only if it fits.

Avoid overengineering:

- No command palette.
- No drawer library unless already present and simple.
- No new auth system.
- No route rewrite/canonicalization.
- No server mutation.

## Auth/context behavior

Preferred implementation:

- For public pages, derive signed-in state server-side where practical and pass it to nav/menu.
- If adding server-side session state to the public `NavBar` would be too invasive, implement safe public defaults first:
  - public pages show `Innskráning`, `Hugmyndabankinn`, `Ný hugmynd`
  - authenticated pages show `Heim`, `Minn prófíll`, `Lánað og skilað`
- Do not make client-only Supabase auth fetches just to decide nav items if that causes flicker or hydration mismatch.
- Do not expose any private data in the menu. A boolean signed-in state is enough.

Concrete route rules:

Public / unknown session menu:

- `/` - `Hugmyndabankinn`
- `/senda-hugmynd` - `Ný hugmynd`
- `/innskraning` - `Innskráning`

Authenticated menu:

- `/auth-mvp/heim` - `Heim`
- `/auth-mvp/minn-profill` - `Minn prófíll`
- `/auth-mvp/lanad-og-skilad` - `Lánað og skilað`
- Optionally `/senda-hugmynd` - `Ný hugmynd`

Current page handling:

- Keep current route visible but marked active, or omit it. Pick one behavior and keep it consistent.
- Codex recommendation: keep it visible and mark active. That avoids menu items disappearing while user navigates.

Login handling:

- If signed-in state is known, do not show `Innskráning` on authenticated pages.
- If signed-in state is unknown on public pages, showing `Innskráning` is acceptable because `/innskraning` already redirects signed-in users to `/auth-mvp/heim`.

## UI guidance

Design should be mobile-first and quiet.

- The hamburger button should be top-right, at least 44x44 px.
- It must not push or distort the centered Teskeið logo.
- Use an icon button, not text inside a rounded rectangle.
- Add `aria-label`.
- Use focus-visible ring.
- Menu panel can be a compact popover/dropdown aligned right.
- Do not use decorative gradient/orb backgrounds.
- Avoid horizontal overflow at 360-460 px.
- Do not overlap with bottom nav or mobile safe-area.
- Ensure tap targets are large and easy.

Recommended visual pattern:

- Header stays `bg-[#fbf9f4]`.
- Logo remains centered.
- Hamburger is absolutely positioned or placed in a three-column grid so logo remains centered.
- Menu opens under the button as a small right-aligned panel with plain rows.
- Rows use icon + label + active state.

## Text/i18n

Move hardcoded nav labels out of components where touched.

Add or reuse keys under `teskeid.nav` in both:

- `messages/is.json`
- `messages/en.json`

Suggested Icelandic labels:

- `menu`: `Valmynd`
- `closeMenu`: `Loka valmynd`
- `ideas`: `Hugmyndabankinn`
- `submitIdea`: `Ný hugmynd`
- `login`: `Innskráning`
- `home`: `Heim`
- `profile`: `Minn prófíll`
- `loans`: `Lánað og skilað`

English labels can be plain:

- `Menu`
- `Close menu`
- `Ideas`
- `New idea`
- `Sign in`
- `Home`
- `My profile`
- `Loaned and returned`

## Files likely to edit

Likely:

- `components/teskeid/NavBar.tsx`
- new `components/teskeid/TeskeidMenu.tsx` if cleaner
- `messages/is.json`
- `messages/en.json`
- relevant tests under `lib/__tests__/`

Possibly:

- `app/page.tsx` if `NavBar` needs auth/session props
- `app/senda-hugmynd/page.tsx`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `components/loans/LoanShell.tsx`
- loan page tests if `LoanShell` changes
- home/profile tests if header/link structure changes

Avoid unless necessary:

- `middleware.ts`
- auth guards
- Supabase SQL
- route rewrites / canonical URL work for TODO #22

## Tests and verification

Claude Code should update/add tests where practical.

Recommended automated checks:

- `npm run type-check`
- `npm run test:run`

Targeted tests should verify:

- Public `NavBar` includes a menu button with accessible label.
- Public menu includes `Hugmyndabankinn`, `Ný hugmynd`, and `Innskráning`.
- Current public route is marked active or handled consistently.
- Authenticated `/heim` has access to menu items for `Heim`, `Minn prófíll`, and `Lánað og skilað`.
- Authenticated pages do not show a misleading login item if signed-in state is known.
- Existing login redirect behavior remains unchanged.
- Existing bottom logo links and important page links still point where tests expect, unless intentionally updated.

Manual localhost checks for Stebbi:

- Mobile 360-460 px:
  - `/`
  - `/senda-hugmynd`
  - `/innskraning`
  - `/auth-mvp/heim`
  - `/auth-mvp/minn-profill`
  - `/auth-mvp/lanad-og-skilad`
- Open/close menu by tap.
- Tap outside or use Escape if implemented.
- Confirm no horizontal scrolling.
- Confirm no overlap with bottom nav/safe-area.
- Confirm login is easy to find when logged out.
- Confirm authenticated routes are easy to find when logged in.

## Risks / guardrails

- Do not make nav a security boundary. Server-side guards remain authoritative.
- Do not weaken auth/session behavior.
- Do not introduce client-side auth flicker if avoidable.
- Do not conflate with TODO #22 canonical URL cleanup.
- Do not remove public bottom nav unless the replacement has been verified enough for Stebbi to test comfortably.
- Do not alter Supabase, RLS, policies, functions, or migrations.
- Do not expose user email or profile data in nav unless Stebbi explicitly asks.

## Required post-implementation handoff from Claude Code

After implementing, Claude Code should create a new handoff file in `ai-handoff/` with the next version number for TODO #29, for example:

`2026-06-09-HHMM-todo-029-v002-claude-hamburger-nav-post-implementation.md`

The handoff must include:

1. What was implemented.
2. Files changed.
3. Files inspected.
4. Tests/commands run and exit codes.
5. Any tests skipped and why.
6. Exact localhost routes Stebbi should test.
7. Known UX tradeoffs, especially whether public bottom nav was kept or changed.
8. Whether any auth/session behavior changed.
9. Confirmation that no SQL/Supabase/RLS/migration changes were made.
10. Questions for Codex review.

Stebbi will send that handoff to Codex while testing locally.
