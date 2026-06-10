# TODO #29 / #32 / #20 - Auth-aware menu post-implementation handoff

Produced by Claude Code. Send to Codex for review; Stebbi tests on localhost.

## 1. What was changed

| TODO | Status | Notes |
|------|--------|-------|
| #29 Context-aware nav | **Implemented** | Public pages now pass auth-derived variant to NavBar |
| #32 Skýrari texti | **Implemented** | `login` key updated to `"Nýskráning / innskráning"` / `"Register / sign in"` |
| #20 Bottom-bar double-tap | Not reproducible in code review | See section 6 |

## 2. Files inspected (read-only)

- `components/teskeid/NavBar.tsx`
- `components/teskeid/TeskeidMenu.tsx`
- `app/page.tsx`
- `app/senda-hugmynd/page.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/teskeid-menu.test.tsx`
- `lib/__tests__/home-page.test.tsx`

## 3. Files changed

| File | Change |
|------|--------|
| `components/teskeid/NavBar.tsx` | Added `NavBarProps` interface with `variant?: 'public' \| 'authenticated'` (default `'public'`); passes variant to `TeskeidMenu` |
| `app/page.tsx` | Added `supabase.auth.getUser()` via `Promise.all` alongside the ideas query; passes `variant={user ? 'authenticated' : 'public'}` to `<NavBar />` |
| `app/senda-hugmynd/page.tsx` | Added `createClient` import; fetches `getTranslations` and `createClient()` in parallel; calls `supabase.auth.getUser()`; passes derived variant to `<NavBar />` |
| `messages/is.json` | `teskeid.nav.login`: `"Innskráning"` -> `"Nýskráning / innskráning"` |
| `messages/en.json` | `teskeid.nav.login`: `"Sign in"` -> `"Register / sign in"` |
| `lib/__tests__/teskeid-menu.test.tsx` | Updated mock and all assertions to use `'Nýskráning / innskráning'` instead of `'Innskráning'` |

## 4. Commands run with exit codes

```
npm run type-check   # exit 0
npm run test:run -- lib/__tests__/teskeid-menu.test.tsx   # exit 0 — 20 passed
npm run test:run     # exit 0 — 32 files, 909 passed, 22 skipped, 8 todo
```

## 5. Architecture note

`NavBar` remains `'use client'` (required for `BottomNav` which uses `usePathname`). The `variant` prop is a serializable string, so server components can pass it to this client component without issues. No hydration concern.

The `getUser()` call is made via the Supabase server client, which reads the session cookie. It will return `null` for unauthenticated visitors and a user object for logged-in users. No user data is exposed to the client beyond the boolean-derived variant string.

## 6. #20 double-tap status

The double-tap issue on mobile was reported for the bottom bar `Innskráning` button. This PR does not change `BottomNav` at all. The bottom nav label remains `'Innskráning'` (hardcoded in `BottomNav` — it predates the messages pattern). Whether the double-tap was caused by the nav variant mismatch (tapping login, getting redirected, needing to tap again) is plausible but not confirmed. Stebbi should test after this change to see if the symptom disappears now that logged-in users see authenticated items in the hamburger. #20 stays open until confirmed.

## 7. Routes with hardcoded public menu — remaining

- `BottomNav` in `components/teskeid/NavBar.tsx`: hardcoded `href: '/innskraning'` item with label `'Innskráning'` (not from messages). This is a separate piece from the hamburger and was not in scope for this pass. If bottom nav also needs to be auth-aware, it requires a separate client-side session check (e.g., `useSession` hook or a context), since `BottomNav` is already a client component and cannot receive server-derived props without a wrapper.
- `app/innskraning/page.tsx`: has a `<TeskeidMenu variant="public" />` overlay. This is correct — the login page is only visited when logged out (the page itself redirects logged-in users to `/auth-mvp/heim`).

## 8. Manual localhost checks for Stebbi

1. **Logged out, open `/`**: open hamburger, confirm `Hugmyndabankinn`, `Ný hugmynd`, `Nýskráning / innskráning`.
2. **Logged in, open `/`**: open hamburger, confirm `Heim`, `Minn prófíll`, `Lánað og skilað`, `Hugmyndabankinn`, `Ný hugmynd`. No `Nýskráning / innskráning`.
3. **Logged in, open `/senda-hugmynd`**: open hamburger, confirm same authenticated items.
4. **Tap all menu links once on mobile**: no double-tap should be required. Report if #20 symptom persists.
5. **Horizontal scroll check at 360-460 px**: confirm no overflow.

## 9. No SQL/Supabase/RLS/grant/policy changes

Confirmed. No SQL was executed or modified. No Supabase client behavior changed. `auth.getUser()` is a read-only session check. No RLS policies or grants touched.

## 10. Questions for Codex review

1. **BottomNav auth-awareness**: `BottomNav` still shows `Innskráning` for all users. Should it be made auth-aware in a follow-up (would require client-side session), or is the hamburger sufficient coverage?

2. **#20 resolution**: If Stebbi confirms double-tap is gone after this change, #20 can be closed. Should it stay open until then?

3. **`getUser()` vs `getSession()`**: This implementation uses `supabase.auth.getUser()` (server-validated) rather than `getSession()` (cookie-only). This is the safer pattern per Supabase docs but does make a network call to the auth server. If performance is a concern, `getSession()` could be used instead for this non-security-critical variant selection.
