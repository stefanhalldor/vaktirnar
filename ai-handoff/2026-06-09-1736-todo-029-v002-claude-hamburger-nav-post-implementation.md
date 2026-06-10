# TODO #29 - Hamburger nav post-implementation handoff

Produced by Claude Code after implementing. Send to Codex while Stebbi tests on localhost.

## 1. What was implemented

A reusable client component `TeskeidMenu` with two variants:

- `variant="public"` — shows Hugmyndabankinn (`/`), Ný hugmynd (`/senda-hugmynd`), Innskráning (`/innskraning`)
- `variant="authenticated"` — shows Heim (`/auth-mvp/heim`), Minn prófíll (`/auth-mvp/minn-profill`), Lánað og skilað (`/auth-mvp/lanad-og-skilad`)

Behavior:
- Hamburger button (44x44 px) opens a right-aligned compact dropdown panel.
- Current route is highlighted (green active state).
- Escape key and click-outside both close the menu.
- All menu items close the panel on tap/click.
- Button switches between Menu and X icons, with `aria-label` and `aria-expanded`.
- i18n via `useTranslations('teskeid.nav')`.

Placement:
- **NavBar** (public): 3-column grid `grid-cols-[44px_1fr_44px]`. Spacer on left keeps logo centered. TeskeidMenu floats at right.
- **heim** (`/auth-mvp/heim`): added alongside existing UserCircle profile icon in a `flex gap-1` wrapper.
- **minn-profill** (`/auth-mvp/minn-profill`): added alongside existing Home icon link in a `flex gap-1` wrapper.
- **LoanShell**: wraps `{nav}` in a `flex items-start justify-between gap-2` container with TeskeidMenu at the right.

Public `BottomNav` was not removed (conservative first iteration as specified).

## 2. Files changed

| File | Change |
|------|--------|
| `components/teskeid/TeskeidMenu.tsx` | **New** — reusable hamburger menu component |
| `components/teskeid/NavBar.tsx` | 3-col grid, TeskeidMenu public on right; removed `'use client'` directive removal was corrected (kept because BottomNav uses usePathname) |
| `components/loans/LoanShell.tsx` | Wraps `{nav}` with TeskeidMenu authenticated on right |
| `app/auth-mvp/heim/page.tsx` | TeskeidMenu added alongside UserCircle icon |
| `app/auth-mvp/minn-profill/page.tsx` | TeskeidMenu added alongside Home icon |
| `messages/is.json` | Added `menu`, `closeMenu`, `ideas`, `login`, `home`, `profile`, `loans` to `teskeid.nav` |
| `messages/en.json` | Same keys in English |
| `lib/__tests__/loan-pages.test.tsx` | Added TeskeidMenu stub mock + `usePathname` to next/navigation mock |
| `lib/__tests__/home-page.test.tsx` | Added TeskeidMenu stub mock |
| `lib/__tests__/profile-page.test.tsx` | Added TeskeidMenu stub mock + `usePathname` to next/navigation mock |

## 3. Files inspected (read-only)

- `app/page.tsx` — public landing, confirmed NavBar + BottomNav usage
- `app/auth-mvp/heim/page.tsx` — confirmed UserCircle link pattern
- `app/auth-mvp/minn-profill/page.tsx` — confirmed Home icon link pattern
- `app/senda-hugmynd/page.tsx` — uses NavBar, no BottomNav
- `app/auth-mvp/lanad-og-skilad/page.tsx` — confirmed nav slot pattern (title + Home icon)
- `app/auth-mvp/lanad-og-skilad/ny/page.tsx` — nav is back link only
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` — nav is back link only
- `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx` — nav is back link only
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx` — nav is back link only
- `components/loans/LoanShell.tsx` — confirmed `{nav}` slot structure
- `lib/__tests__/loan-pages.test.tsx` — confirmed existing test assertions
- `lib/__tests__/home-page.test.tsx` — confirmed mock patterns
- `lib/__tests__/profile-page.test.tsx` — confirmed mock patterns

## 4. Commands run and exit codes

```
npm run type-check   # exit 0 — no type errors
npm run test:run     # exit 0 — 30 files, 859 passed, 22 skipped, 8 todo
git push             # exit 0 — commit c356eb6 pushed to main
```

## 5. Tests skipped / not added

No new dedicated unit tests were added for TeskeidMenu itself. The existing tests were updated to stub TeskeidMenu out so they do not fail from missing `useTranslations`/`usePathname` mocks. The Codex plan requested "targeted tests" for the menu button and menu items — those are open for Codex to spec or Claude Code to add in a follow-up.

## 6. Localhost routes Stebbi should test

Mobile 360-460 px (and desktop for comparison):

| Route | Variant shown | Notes |
|-------|---------------|-------|
| `/` | Public (in NavBar) | Hamburger top-right; BottomNav still visible at bottom |
| `/senda-hugmynd` | Public (in NavBar) | No BottomNav on this page |
| `/innskraning` | Public (in NavBar) | Login page, no BottomNav |
| `/auth-mvp/heim` | Authenticated (alongside UserCircle) | Two icons at right: profile + hamburger |
| `/auth-mvp/minn-profill` | Authenticated (alongside Home icon) | Two icons at right: home + hamburger |
| `/auth-mvp/lanad-og-skilad` | Authenticated (in LoanShell) | Nav row has title + home icon + TeskeidMenu |
| `/auth-mvp/lanad-og-skilad/ny` | Authenticated (in LoanShell) | Back link on left, TeskeidMenu on right |
| `/auth-mvp/lanad-og-skilad/breyta/[id]` | Authenticated (in LoanShell) | Back link on left, TeskeidMenu on right |

Manual checks per the plan:
- Tap hamburger to open, tap again (or Escape, or outside) to close.
- Confirm no horizontal scrolling at narrow widths.
- Confirm dropdown does not overlap bottom nav or safe-area.
- Confirm current route is highlighted (green active state) in menu.

## 7. Known UX tradeoffs

- **Public BottomNav is kept.** There is now some redundancy between BottomNav (Hugmyndir, Ný hugmynd, Innskráning) and the hamburger menu on `/`. This matches the plan's conservative first-iteration guidance. Stebbi can decide to remove BottomNav after testing.
- **LoanShell main list page has two right-side elements.** The main `/auth-mvp/lanad-og-skilad` nav row already has a Home icon link at the right, and LoanShell now adds TeskeidMenu to the right of that. The visual result is: `[title + Home icon] [TeskeidMenu]`. The Home icon is technically redundant since TeskeidMenu has "Heim". Stebbi can confirm whether to remove the individual Home icons from loan page nav slots.
- **heim page has two right-side icons.** The UserCircle link (to minn-profill) and TeskeidMenu (which has "Minn prófíll") sit side by side. Similarly, minn-profill has both a Home link and TeskeidMenu. This is redundant but safe. Can be cleaned up after Stebbi confirms.
- **No active state on the main loan page row Home icon** — TeskeidMenu marks `/auth-mvp/lanad-og-skilad` as active when on that route.

## 8. Auth/session behavior

No changes. Nav items are rendered based solely on the `variant` prop. No session state is read by TeskeidMenu. Server-side auth guards remain unchanged.

The public variant always shows Innskráning. Since `/innskraning` already server-redirects signed-in users to `/auth-mvp/heim`, no user can accidentally use it incorrectly.

## 9. Confirmation: no SQL/Supabase/RLS/migration changes

No SQL files were touched. No Supabase client code changed. No RLS policies changed. No migrations added for this task.

## 10. Questions for Codex review

1. Should the redundant individual nav icons (UserCircle on heim, Home on minn-profill, Home icon on the main loan list page) be removed now that TeskeidMenu covers those routes? If yes, Claude Code can do a follow-up pass.
2. Should the public BottomNav be removed now, or after more localhost testing? The plan said to keep it for this iteration.
3. Should a dedicated `TeskeidMenu.test.tsx` be added to verify the accessible button label, open/close behavior, and active state? Codex can spec the exact assertions.
4. The `senda-hugmynd` page uses NavBar but has no explicit tests — no change needed there, but worth noting.
5. Authenticated variant currently hardcodes `/auth-mvp/*` routes (TODO #22 canonical URL cleanup not done yet). This is intentional per the plan.
