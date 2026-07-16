# TODO-068 v001 - Codex handoff - public top nav after sign-out

Created: 2026-07-08 17:49
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Ready for Claude Code investigation and implementation after Stebbi approval.

## Why this is the next important TODO

I chose TODO #68 because it is first in the current TODO priority table and is an auth/navigation regression:

- An authenticated user signs out.
- The public top nav appears or should appear.
- `Hugmyndir` and `Ny hugmynd` do not work reliably without refresh/new window.

This is more release-critical than many later product-polish items because it can make the public beta feel broken immediately after logout, and it sits on the boundary between public pages, auth cookies, middleware redirects and route cache state.

## Current TODO summary

Relevant TODO item:

- `#68 Public top nav virkar ekki rett eftir utskraningu`

Expected behavior after sign-out:

- `Hugmyndir` goes to `/`
- `Ny hugmynd` goes to `/senda-hugmynd`
- `Innskraning` goes to `/innskraning`
- No refresh, new tab or manual session cleanup required

## Files inspected by Codex

- `TODO.md`
- `ai-handoff/README.md`
- `Design.md`
- `middleware.ts`
- `app/page.tsx`
- `app/innskraning/page.tsx`
- `components/teskeid/PublicTopNav.tsx`
- `components/teskeid/NavBar.tsx`
- `components/teskeid/TeskeidMenu.tsx`
- `lib/__tests__/middleware.test.ts`
- `lib/__tests__/teskeid-menu.test.tsx`

## Observations from current code

### Public nav links are simple links

`components/teskeid/PublicTopNav.tsx` has the expected hrefs:

- `/`
- `/senda-hugmynd`
- `/innskraning`

So the bug is probably not the literal hrefs.

### Authenticated menu signs out client-side and pushes to login

`components/teskeid/TeskeidMenu.tsx`:

```ts
async function handleSignOut() {
  setOpen(false)
  await createClient().auth.signOut()
  router.push('/innskraning')
}
```

Risk:

- `router.push('/innskraning')` after client-side sign-out may not force a server refresh/cache invalidation.
- If middleware/server components still observe an old Supabase cookie/session, `app/innskraning/page.tsx` redirects authenticated sessions to `/auth-mvp/heim`.
- The user may appear stuck in authenticated/public state mismatch until refresh.

### Root route redirects authenticated users

`middleware.ts` redirects authenticated users from `/` to `/auth-mvp/heim` when `AUTH_MVP_ENABLED=true`.

That behavior may be correct for actually authenticated users, but after sign-out it becomes a good diagnostic:

- If clicking `Hugmyndir` after logout still redirects to `/auth-mvp/heim`, the server/middleware still sees the user as authenticated.
- If it goes to `/` but the nav is wrong, the issue is more likely client state/rendering.

### Home page hides public top nav for authenticated server user

`app/page.tsx`:

```tsx
{!user && <PublicTopNav />}
<NavBar variant={user ? 'authenticated' : 'public'} />
```

If server-side user state is stale after logout, `/` can render authenticated nav or redirect before public nav is usable.

### Login page redirects authenticated server user

`app/innskraning/page.tsx` redirects to `/auth-mvp/heim` when server `getUser()` still sees a session.

This could explain "I logged out but public navigation does not work" if the client sign-out did not fully clear/refetch cookie state for server navigation.

## Important constraints

Do not weaken these:

- authenticated guards for `/auth-mvp/heim`
- authenticated guards for `/auth-mvp/minn-profill`
- authenticated guards for `/auth-mvp/lanad-og-skilad`
- feature flags (`AUTH_MVP_ENABLED`, `LOANS_ENABLED`, `TENGSL_ENABLED`, `LEGACY_ENABLED`)
- admin login behavior
- API behavior: unauthenticated private API routes must return JSON 401/404 as appropriate, not HTML redirects

Do not do broad nav redesign. This is a small auth/nav state regression.

## Recommended investigation path for Claude Code

### 1. Reproduce and classify the failure

Manual pre-check on localhost before code changes:

1. Start logged in.
2. Open `/auth-mvp/heim`.
3. Open authenticated menu and click `Utskra`.
4. Record final URL.
5. Without refreshing, click:
   - `Hugmyndir`
   - `Ny hugmynd`
   - `Innskraning`
6. In the browser Network tab, note whether any request redirects:
   - `/` -> `/auth-mvp/heim`
   - `/senda-hugmynd` -> something unexpected
   - `/innskraning` -> `/auth-mvp/heim`
7. In console/network, note whether Supabase cookies remain or whether route cache seems stale.

Classify:

- Server still authenticated after sign-out.
- Client route/cache not refreshed after sign-out.
- Public page itself redirects incorrectly.
- Public top nav is hidden or covered, rather than links failing.

### 2. Fix the smallest confirmed cause

Likely fix candidates, in preferred order:

1. After `signOut()`, use `router.replace('/innskraning')` plus `router.refresh()` or refresh-before/after navigation if needed, so server components see cleared auth state.
2. Consider adding pending state to sign-out button while sign-out/navigation is in progress, per `Design.md` navigation feedback guidance.
3. If client sign-out alone does not reliably clear server cookies, consider a small server route/action for sign-out that clears Supabase auth cookies and redirects to `/innskraning`. Only do this if confirmed necessary.
4. Avoid changing middleware root redirect unless the reproduction proves the root redirect itself is wrong after cookies are actually cleared.

### 3. Add tests

Likely tests:

- Update `lib/__tests__/teskeid-menu.test.tsx` if sign-out changes from `router.push` to `router.replace`, `router.refresh`, pending state, or server sign-out route.
- Add middleware regression tests only if middleware behavior changes.
- Add page-level tests only if `app/innskraning/page.tsx` or `app/page.tsx` behavior changes.

Current relevant tests:

- `lib/__tests__/teskeid-menu.test.tsx` already expects sign-out to call Supabase `signOut` and `router.push('/innskraning')`.
- `lib/__tests__/middleware.test.ts` already covers:
  - unauthenticated `/auth-mvp/heim` -> `/innskraning`
  - authenticated `/` -> `/auth-mvp/heim`
  - unauthenticated `/` passes through
  - canonical `/innskraning` passes through middleware

If the fix changes `router.push` to `router.replace`, update tests to match intentional behavior.

## Design.md notes

Relevant design requirements:

- Mobile-first at 360-460 px.
- Controls/text/page wrapper must not cause horizontal overflow.
- Navigation actions should not feel dead while waiting.
- Client navigation via `router.push`, `router.replace`, `router.back` or similar should show pending state or shared loader if the user waits.
- Touch targets should generally be at least 40x40 px.

If sign-out can take visible time, add a simple pending state to the sign-out button:

- disable the button while signing out
- avoid double-click sign-out
- keep text stable or use existing loader pattern if available
- do not introduce layout shift

## Non-goals

- Do not change SQL.
- Do not change Supabase RLS.
- Do not change auth allowlist semantics.
- Do not change admin login.
- Do not redesign public nav.
- Do not change route provider/weather code.
- Do not commit, push or deploy without explicit Stebbi approval.

## Commands Claude Code should run

Recommended after implementation:

```bash
npm run type-check
npm run test:run
git diff --check
```

No dev server start/stop; Stebbi runs localhost.

## Localhost checks for Stebbi

Before fix, reproduce once and note what happens. After fix:

1. Log in normally.
2. Open `/auth-mvp/heim`.
3. Open the authenticated menu.
4. Click `Utskra`.
5. Expected: user lands on `/innskraning` or another intentional public page, and does not bounce back to `/auth-mvp/heim`.
6. Without refreshing, click `Hugmyndir`.
7. Expected: user lands on `/`, sees public idea bank, and is not redirected to `/auth-mvp/heim`.
8. Click `Ny hugmynd`.
9. Expected: user lands on `/senda-hugmynd` and can see the public submission flow.
10. Click `Innskraning`.
11. Expected: user lands on `/innskraning`; no redirect loop or stale authenticated state.
12. Log in again.
13. Expected: authenticated menu, `/auth-mvp/heim`, `Lánað og skilað`, `Umönnun`/`Veðrið` links that are enabled still work as before.
14. Repeat at mobile widths 360, 390 and 460 px.
15. Expected: menu/sign-out button has clear pending/disabled behavior if sign-out takes time, no horizontal overflow, no overlap.

Do not test this by changing Supabase settings, auth policies, RLS, migrations, Vercel env vars, production data, commit, push or deploy.

## Open questions for Claude Code

1. Does the bug reproduce because server cookies remain after `createClient().auth.signOut()`, or because Next client router cache needs refresh?
2. Does replacing `router.push('/innskraning')` with a refresh-aware navigation fully solve it?
3. If a server sign-out route/action is required, what is the smallest safe implementation that clears cookies without affecting admin auth or legacy auth?
