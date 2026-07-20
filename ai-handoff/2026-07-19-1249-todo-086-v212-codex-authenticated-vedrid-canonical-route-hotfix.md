# TODO 086 / v212 - Codex handoff - Authenticated `/vedrid` renders public hamburger

## Status

Post-release hotfix candidate.

Stebbi corrected the earlier diagnosis: threshold values do save, but the hamburger menu still thinks the user is logged out while the user is on `/vedrid`. When Stebbi goes to login, the app detects the existing session and the `/vedrid` UI becomes correct after landing in the authenticated route.

## Main finding

This is a canonical route/auth-shell mismatch, not primarily a preferences persistence bug.

Relevant code:

- `app/vedrid/page.tsx`
  - Always renders:
    - `menuVariant="public"`
    - `tripHref="/vedrid/ferdalagid"`
    - `stationPulseReturnBase="/vedrid"`
- `app/auth-mvp/vedrid/page.tsx`
  - Guards session and renders:
    - `menuVariant="authenticated"`
    - `tripHref="/auth-mvp/vedrid/ferdalagid"`
    - `stationPulseReturnBase="/auth-mvp/vedrid"`
- `components/teskeid/TeskeidMenu.tsx`
  - Does not independently decide auth state.
  - It trusts the `variant` prop:
    - `variant="public"` -> public menu, login item
    - `variant="authenticated"` -> app menu, profile/sign-out

So an authenticated user who remains on public `/vedrid` has a real auth session, but the page shell is still public. Visiting `/innskraning` triggers the auth/session flow and eventually lands the user in authenticated UI, which is why it then appears fixed.

## Recommended fix

Canonicalize authenticated weather users away from public `/vedrid` into `/auth-mvp/vedrid`.

Preferred option:

1. In middleware, after `supabase.auth.getUser()` has resolved and before returning public pages, redirect authenticated users from public weather routes to the authenticated weather routes.
2. Preserve query string exactly.
3. Keep guests on public `/vedrid`.

Suggested route mapping:

- `/vedrid` -> `/auth-mvp/vedrid`
- `/vedrid/ferdalagid` -> `/auth-mvp/vedrid/ferdalagid`

Be careful with station pulse URLs:

- Public station pulse routes under `/vedrid` may not exist the same way as authenticated pulse routes.
- Do not broad-prefix redirect all `/vedrid/*` until every subpath is verified.
- Start with exact `/vedrid` and exact `/vedrid/ferdalagid`, plus query/hash-safe preservation where applicable.

Alternative option:

- Make `app/vedrid/page.tsx` read the Supabase session server-side and render authenticated props when a user exists.

Codex prefers middleware canonicalization because it avoids maintaining two valid shells for the same signed-in user and keeps links/return paths consistently authenticated.

## Important edge cases

- Preserve `?saveDefaults=10,13` if present:
  - `/vedrid?saveDefaults=10%2C13` should become `/auth-mvp/vedrid?saveDefaults=10%2C13`.
- Preserve route memory/selection params if any are introduced later.
- Avoid redirect loops:
  - `/auth-mvp/vedrid` must not redirect back to `/vedrid`.
  - Unauthenticated users must still be able to use public `/vedrid` when weather mode allows public access.
- Do not make `/api/teskeid/weather/preferences/thresholds` public.
- Do not change SQL82, RLS, or preference storage for this fix.

## Why this explains Stebbi's symptoms

1. Stebbi has a valid session cookie.
2. Stebbi opens `/vedrid`, which is public by design.
3. The page renders `WeatherOverviewClient` with `menuVariant="public"`.
4. `TeskeidMenu` therefore shows public menu/login, even though the session exists.
5. Clicking login sends Stebbi through a route that detects the existing session.
6. The app lands in `/auth-mvp/vedrid` or another authenticated route.
7. Now `menuVariant="authenticated"` and the hamburger is correct.

## Tests to add/update

Recommended:

- `lib/__tests__/middleware.test.ts`
  - authenticated `/vedrid` redirects to `/auth-mvp/vedrid`
  - authenticated `/vedrid?saveDefaults=10%2C13` redirects to `/auth-mvp/vedrid?saveDefaults=10%2C13`
  - unauthenticated `/vedrid` remains public
  - authenticated `/vedrid/ferdalagid` redirects to `/auth-mvp/vedrid/ferdalagid`
  - unauthenticated `/vedrid/ferdalagid` behavior remains as intended by current access model

If middleware tests are too coupled to Supabase mocks, add a small helper for canonical weather-route mapping and test that helper directly.

## Localhost checks for Stebbi

1. Start logged out.
2. Open `/vedrid`.
3. Confirm the hamburger shows public/login behavior.
4. Set wind thresholds to `10` and `13`.
5. Click `Vista sem sjálfgefin vindmörk`.
6. Complete login.
7. Confirm the app lands on authenticated weather UI, not a public shell.
8. Confirm hamburger shows authenticated menu items and sign-out.
9. Confirm thresholds still show `10` and `13`.
10. Refresh `/auth-mvp/vedrid` and confirm the values persist.
11. Manually type `/vedrid` while still logged in.
12. Expected: redirect/canonicalize to `/auth-mvp/vedrid`, with authenticated hamburger.

Regression checks:

- Logged-out `/vedrid` must still work if public weather is enabled.
- Logged-in `/auth-mvp/vedrid` must not redirect loop.
- `Ferðalagið` CTA from authenticated weather must use `/auth-mvp/vedrid/ferdalagid`.
- Existing route-memory filters and safnpuls should be unchanged.

No SQL, migration, production data, auth table mutation, secrets, billing, commit, push, or deploy is part of this handoff.

## Route intelligence check

- This does not change route-memory station matching or route intelligence data.
- It only changes which shell an authenticated user sees for the existing `/vedrid` overview.
- No new canonical route family, control point, caution rule, or station matching rule is needed.
- Preserve all route query state while canonicalizing URLs so route-memory UI can keep working.

## Commands Codex ran

Read-only inspection only:

- `Get-Content` on v209 and v211 handoff files.
- `rg` for threshold preference and route/menu references.
- Targeted reads of:
  - `components/weather/WeatherOverviewClient.tsx`
  - `app/api/teskeid/weather/preferences/thresholds/route.ts`
  - `app/vedrid/page.tsx`
  - `app/auth-mvp/vedrid/page.tsx`
  - `components/weather/WeatherThresholdBar.tsx`
  - `components/weather/WeatherOverviewShell.tsx`
  - `components/teskeid/TeskeidMenu.tsx`
  - `middleware.ts`
  - `lib/weather/useWeatherThresholds.ts`
  - `lib/weather/thresholds.ts`

Codex made no product-code, SQL, migration, production, commit, push, or deploy changes.
