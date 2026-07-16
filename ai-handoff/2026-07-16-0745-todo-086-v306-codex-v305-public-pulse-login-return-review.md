# 2026-07-16 07:45 - TODO-086 v306 - Codex review of v305 + public pulse login return

Created: 2026-07-16 07:45  
Timezone: Atlantic/Reykjavik

Review target: `2026-07-16-0739-todo-086-v305-claude-v304-done-released`

Stebbi production observation after v305:

- Public user sees CTA text `Skráðu þig inn til að skrifa í Veðurpúlsinn`.
- Desired text: `Sjá fleiri skilaboð eða segja frá aðstæðum`.
- Clicking through login currently drops the user on the Teskeið home/start page.
- Desired flow: public user who has already calculated a route should be sent through login and land on the full pulse URL, with a way back/close that restores the exact route-result context they came from.

## Findings

### High - Public pulse CTA sends users to login without preserving intent or route context

Files:

- `components/weather/VedurstofanPulseInline.tsx:110-112`
- `components/weather/VedurstofanPulseInline.tsx:156-162`
- `components/weather/VedurstofanPointCard.tsx:288`

Current behavior:

```tsx
const fullHref = returnTo
  ? `/auth-mvp/vedrid/puls/stod/${stationId}?returnTo=${encodeURIComponent(returnTo)}`
  : null
...
href="/innskraning"
```

In `/vedrid` route-result station cards, `VedurstofanPointCard` calls:

```tsx
<VedurstofanPulseInline stationId={station.stationId} />
```

So route-result cards have no `returnTo`, no full-pulse href, and the public login CTA is just `/innskraning`. That loses both:

1. the target action: open full pulse for station X,
2. the route result state that the user had already calculated as public.

This matches Stebbi's production test.

Recommended product behavior:

- Public preview with messages should show one CTA:
  - `Sjá fleiri skilaboð eða segja frá aðstæðum`
- CTA should lead to login with a safe `next` value pointing to the full station pulse route.
- After login, the user should land on:
  - `/auth-mvp/vedrid/puls/stod/{stationId}?returnTo=...`
- The full pulse page `Til baka` / close behavior should return to the same calculated route-result context, not a fresh `/auth-mvp/vedrid`.

### High - `/innskraning` and `TeskeidLoginForm` currently ignore `next`

Files:

- `app/innskraning/page.tsx:11-27`
- `components/teskeid/TeskeidLoginForm.tsx:122-126`
- `lib/__tests__/innskraning-page.test.tsx:101-108`

Current authenticated session behavior:

```tsx
if (hasSession) redirect('/auth-mvp/heim')
```

Current OTP success behavior:

```tsx
router.push(hasName ? '/auth-mvp/heim' : '/auth-mvp/minn-profill')
router.refresh()
```

So even if `VedurstofanPulseInline` were changed to link to:

```txt
/innskraning?next=/auth-mvp/vedrid/puls/stod/31392...
```

the login page would still ignore it. This needs to be fixed as part of the same user-visible flow.

Recommended contract:

- `/innskraning?next=<internal path>` should preserve a safe internal destination.
- Already-authenticated users visiting `/innskraning?next=...` should redirect to safe `next`, not `/auth-mvp/heim`.
- New OTP login success should redirect to safe `next` when profile is complete.
- If profile is incomplete, send to profile first, but preserve the original `next` for after profile completion if feasible.
- Unsafe next values must be rejected:
  - `https://evil.example`
  - `//evil.example`
  - malformed encodings
  - paths outside the allowed app surface

Do not introduce an open redirect. Use a shared helper such as `resolveSafeLoginNext(...)` and cover it with tests.

### High - Route-result restoration probably needs a small state-preservation mechanism, not only `returnTo=/vedrid`

Files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:108-183`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:388-458`
- `app/auth-mvp/vedrid/page.tsx:7-12`
- `app/vedrid/page.tsx:19`

`FerdalagidClient` keeps route/result data in React state:

- `origin`
- `destination`
- `trailerKind`
- `thresholdOverrides`
- `selectedRouteId`
- `result`
- `vedurstofanLayer`
- selected heatmap/filter state

The current route result is not fully URL-backed. Therefore, simply using:

```txt
returnTo=/auth-mvp/vedrid
```

will reopen a fresh wizard, not the calculated result.

Recommended narrow first implementation:

1. When rendering pulse CTA on a route-result station card, build a `returnStateKey`.
2. Persist the current route-result context in `sessionStorage` under that key before navigation.
3. Include that key in the login/full-pulse return URL, for example:

```txt
/innskraning?next=/auth-mvp/vedrid/puls/stod/31392?returnTo=/auth-mvp/vedrid?restore=weather-route:{uuid}
```

or an equivalent safely encoded structure.

4. On `/auth-mvp/vedrid`, `FerdalagidClient` reads and validates the restore key, restores the result context, then removes or expires it.
5. Full pulse `returnTo` validation must allow only internal `/auth-mvp/vedrid...` return paths and must not accept arbitrary external URLs.

Important: The stored state should be short-lived and client-local. It should not include secrets or service-role data. It can include route result data already visible to that public user.

Longer-term better solution:

- Make route results URL-backed or server-backed saved trip/session state.
- That is bigger than this hotfix and should not be required just to fix the broken CTA/login loop.

### Medium - CTA copy should be positive action copy, not just "login"

File:

- `messages/is.json:960-962`

Current relevant text:

```json
"pulseNeedsLogin": "Skráðu þig inn til að skrifa í Veðurpúls",
"pulseViewMore": "Sjá fleiri skilaboð"
```

Recommended:

- Add a new specific label for public CTA:
  - Icelandic: `Sjá fleiri skilaboð eða segja frá aðstæðum`
  - English equivalent in `messages/en.json`
- Do not overload `pulseNeedsLogin` if it is still useful elsewhere as an access-denied/login explanation.
- In preview context, show the product action, not auth mechanics.

## Recommended next implementation plan for Claude Code

Keep this as one focused auth/navigation follow-up. Do not change chat schema, RLS, provider access, refresh logic, map behavior, or Veðurstofan calculations in the same pass.

1. Add a safe login-next helper.
   - Accept only internal paths.
   - Allow at least `/auth-mvp/vedrid...` and `/auth-mvp/vedrid/puls/stod/...`.
   - Reject external, protocol-relative, malformed, and unrelated paths.

2. Update `/innskraning`.
   - Read `searchParams.next`.
   - If user is already authenticated, redirect to safe next if present, else `/auth-mvp/heim`.
   - Pass safe next into `TeskeidLoginForm`.

3. Update `TeskeidLoginForm`.
   - Add optional `nextHref` prop.
   - After OTP verify and profile check:
     - if profile complete and `nextHref` exists, `router.push(nextHref)`;
     - otherwise current behavior.
   - If profile incomplete, consider `/auth-mvp/minn-profill?next=...` as a follow-up. If not done now, document that first-time/incomplete-profile users still land on profile before pulse.

4. Update `VedurstofanPulseInline`.
   - For public `needs-login`, show `Sjá fleiri skilaboð eða segja frá aðstæðum`.
   - Link to login with safe `next` to the full pulse route.
   - If `returnTo` is available, include it.
   - If route-result state is not restorable yet, do not pretend it is. Add the restore mechanism in the same pass if this CTA appears on `/vedrid` result cards.

5. Add route-result restore for `/vedrid` result cards.
   - Prefer a minimal `sessionStorage` restore key for now.
   - Restore enough state that returning from full pulse brings the user back to the same calculated result, selected route/departure context, and visible provider state.
   - Avoid storing sensitive data; this is browser-local and should contain only what the user already saw.

6. Tests.
   - Login page uses safe `next` for already-authenticated user.
   - Login form redirects to safe next after successful code verify when profile is complete.
   - Unsafe next values are ignored.
   - Public pulse CTA href contains `/innskraning?next=...` with encoded full pulse route.
   - Existing default login-to-home behavior still works with no `next`.

## Localhost checks for Stebbi

After Claude Code implements this:

1. Open `/vedrid` signed out as a public user.
2. Calculate a route that shows Veðurstofan station cards with existing pulse messages.
3. Confirm the public CTA says:
   - `Sjá fleiri skilaboð eða segja frá aðstæðum`
4. Click the CTA.
5. Expected: login page opens, not home.
6. Complete login with a user that has a complete profile.
7. Expected: user lands on the full pulse URL for the same station, not `/auth-mvp/heim`.
8. Click `Til baka` or close/back from the full pulse page.
9. Expected: the same route result is restored, not a fresh `/auth-mvp/vedrid` wizard.
10. Repeat while already signed in and hitting the login CTA URL manually.
11. Expected: `/innskraning?next=...` immediately redirects to the safe next target.
12. Try an unsafe next manually:
    - `/innskraning?next=https%3A%2F%2Fevil.example`
13. Expected: it does not redirect externally; it falls back to normal login/home behavior.

Do not run SQL, change Vercel env vars, or deploy for this localhost check. This is app routing, copy, and client-state restoration only.

## SQL / Supabase / RLS

No SQL should be needed.

No RLS, grants, policies, database functions, auth schema, or production data should be touched.

## Óvissa / þarf að staðfesta

- I did not browser-test the production flow myself; this is based on Stebbi's production observation and local source inspection.
- The exact restore payload needs Claude Code's implementation choice. My recommendation is a small sessionStorage key as a narrow bridge until route results become URL/server-backed.
- If the user has no completed profile, the ideal post-profile redirect path may need a second small pass unless `minn-profill` also gets safe `next` support now.
