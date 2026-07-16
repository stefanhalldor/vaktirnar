# TODO 086 v216 - Correct authenticated weather shell access

Created: 2026-07-15 14:05  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Handoff / correction to v214 target behavior, no code changes made by Codex

## Context

Stebbi tested the v214 direction and clarified an important product requirement:

> Sem innskráður opnast `/vedrid` en ekki `/auth-mvp/vedrid` og þá detta út vistanir hjá innskráðum... við viljum að innskráður notandi opni `/auth-mvp/vedrid` og haldi sínum t.d. vistuðum stöðum en sjái svo ekki veðurstofuna nema vera á per user flag listanum.

This means v214 fixed the visibility problem but used the wrong destination for signed-in users without private `vedrid`.

The correct model:

- Signed-out users use public `/vedrid`.
- Signed-in users use authenticated `/auth-mvp/vedrid` whenever base weather is available to them.
- Private/provider layers inside authenticated weather remain separately gated.
- Veðurstofan must remain per-user gated via `weather-provider-vedurstofan`.
- Saved places should work for signed-in users even if they only have base/public MET/Yr access.

## Finding

**Severity: High - v214 sends authenticated public-tier users to guest/public weather and loses signed-in features**

Current v214 behavior:

- `app/auth-mvp/heim/page.tsx`
  - signed-in user without private `vedrid` but with `WEATHER_PUBLIC_ENABLED=true` gets the card
  - href becomes `/vedrid`

That is not the desired product behavior. `/vedrid` renders:

- `app/vedrid/page.tsx`
  - `<FerdalagidClient isGuest />`

`isGuest` intentionally disables signed-in features in `FerdalagidClient`, including saving/deleting recent weather places:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - saved places fetch and mutation paths are tied to non-guest behavior
  - `handleSavePlacesFromResult` returns early when `isGuest`
  - `handleDeleteSavedPlace` returns early when `isGuest`

Also, `/auth-mvp/vedrid` is still blocked for the same public-tier signed-in user:

- `app/auth-mvp/vedrid/page.tsx:5-9`
  - `guardTeskeidSession()`
  - `guardFeatureAccess(user.email!, 'vedrid')`

The saved-places APIs have the same old private gate:

- `app/api/teskeid/weather/saved-places/route.ts:30-38`
  - `authGuard()` requires `checkFeatureAccess(user.id, user.email, 'vedrid')`
- `app/api/teskeid/weather/saved-places/[id]/route.ts:19-22`
  - DELETE also requires `checkFeatureAccess(..., 'vedrid')`

So simply changing the card href to `/auth-mvp/vedrid` is not enough. The authenticated shell route and saved-places API must understand "signed-in base weather access".

## Product Decision

Use this access split:

1. **Base weather availability**
   - controlled by `WEATHER_ENABLED`
   - public access controlled by `WEATHER_PUBLIC_ENABLED`
   - determines whether MET/Yr weather is usable at all

2. **Authenticated weather shell**
   - signed-in users should be allowed into `/auth-mvp/vedrid` if either:
     - they have private `vedrid`, or
     - public base weather is enabled
   - this keeps saved places and signed-in UI available

3. **Private/advanced weather features**
   - `ferdalagid`, trip persistence, etc. remain separately gated

4. **Veðurstofan provider**
   - remains separately gated by `weather-provider-vedurstofan`
   - a user can be in `/auth-mvp/vedrid` and still not see Veðurstofan

## Recommended implementation for Claude Code

### 1. Add or refactor a server helper for authenticated weather shell access

Do **not** casually change `resolveWeatherBaseAccess` semantics unless every caller is reviewed.

Reason: existing weather APIs use `resolveWeatherBaseAccess` and interpret `mode: 'public'` as `userId: null`, public actor/rate-limit behavior. If we mutate that helper to return a real `userId` for signed-in public-tier users, we may accidentally change analytics, rate limiting, or event behavior for API routes.

Preferred approach:

Add a new helper in `lib/weather/weatherBaseAccess.server.ts` or a sibling file, for example:

```ts
export type AuthenticatedWeatherShellAccess =
  | { mode: 'authenticated'; userId: string; hasPrivateVedrid: true }
  | { mode: 'authenticated-public'; userId: string; hasPrivateVedrid: false }
  | { mode: 'blocked' }

export async function resolveAuthenticatedWeatherShellAccess(
  user: { id: string; email?: string | null },
): Promise<AuthenticatedWeatherShellAccess> {
  if (process.env.WEATHER_ENABLED !== 'true') return { mode: 'blocked' }
  if (!user.email) return { mode: 'blocked' }

  const hasPrivateVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
  if (hasPrivateVedrid) {
    return { mode: 'authenticated', userId: user.id, hasPrivateVedrid: true }
  }

  if (process.env.WEATHER_PUBLIC_ENABLED === 'true') {
    return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
  }

  return { mode: 'blocked' }
}
```

Naming can vary, but the concept must be explicit: this is for signed-in UI/API features that should retain the user identity even when access is via public base weather.

### 2. Update authenticated home card

In `app/auth-mvp/heim/page.tsx`:

- use the new authenticated-shell access helper
- if access is not blocked, show `Veðrið`
- for every signed-in allowed mode, link to `/auth-mvp/vedrid`
- do not link signed-in users to `/vedrid` from the authenticated home card

Expected rule:

```ts
const weatherShellAccess = await resolveAuthenticatedWeatherShellAccess(user)
const weatherCardEnabled = weatherShellAccess.mode !== 'blocked'
const weatherCardHref = '/auth-mvp/vedrid'
```

Do not use `/vedrid` for signed-in users from `/auth-mvp/heim`.

### 3. Update `/auth-mvp/vedrid`

In `app/auth-mvp/vedrid/page.tsx`:

- keep `guardTeskeidSession()`
- replace `guardFeatureAccess(user.email!, 'vedrid')` with the new authenticated weather shell access check
- if blocked, redirect or not-found consistently with existing guard behavior
- keep `tripEnabled = checkFeatureAccess(..., 'ferdalagid')`
- render `<FerdalagidClient tripEnabled={tripEnabled} />` as non-guest

Important:

- Do not give `tripEnabled` to everyone.
- Do not give Veðurstofan to everyone.
- Do not turn public `/vedrid` into signed-in UI. Public `/vedrid` remains guest path.

### 4. Update saved places APIs

In `app/api/teskeid/weather/saved-places/route.ts`:

- update `authGuard()` so signed-in users with authenticated shell access can use saved places
- still require:
  - `AUTH_MVP_ENABLED=true`
  - `WEATHER_ENABLED=true`
  - authenticated user
  - either private `vedrid` OR `WEATHER_PUBLIC_ENABLED=true`
- keep guest GET behavior returning `{ places: [] }` when public weather is enabled
- keep guest POST unauthorized

In `app/api/teskeid/weather/saved-places/[id]/route.ts`:

- update DELETE guard the same way
- a signed-in public-tier base weather user should be able to delete their own saved places
- RLS still protects row ownership, so do not weaken RLS or use service_role

### 5. Keep provider gates separate

Do not change:

- `weather-provider-vedurstofan` access semantics
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
  - it should remain behind both base weather and `elta-vedrid` / relevant gates
- `app/api/teskeid/weather/vedurstofan/*` provider endpoints unless a separate provider-gate bug is found

## Acceptance Criteria

With:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

1. Signed-out user:
   - sees public `Veðrið` on `/`
   - opens `/vedrid`
   - has guest UI and no saved places

2. Signed-in user without private `vedrid`, e.g. `stebbishj`:
   - sees `Veðrið` on `/auth-mvp/heim`
   - opens `/auth-mvp/vedrid`
   - gets non-guest/authenticated weather UI
   - can load saved places
   - can save new places from a route result
   - can delete their own saved places
   - does **not** see Veðurstofan provider unless separately flagged

3. Signed-in user with private `vedrid`:
   - sees `Veðrið` on `/auth-mvp/heim`
   - opens `/auth-mvp/vedrid`
   - behavior remains at least as capable as before

4. Signed-in user without private `vedrid` and `WEATHER_PUBLIC_ENABLED=false`:
   - does not see weather card
   - cannot open `/auth-mvp/vedrid`
   - saved-places APIs are blocked

5. `WEATHER_ENABLED=false`:
   - weather is globally disabled
   - `/vedrid`, `/auth-mvp/vedrid`, and saved-places APIs are blocked/hidden as appropriate

## Test Plan for Claude Code

Update tests from v214 because the expected href changed.

Likely files:

- `lib/__tests__/home-page.test.tsx`
- tests for `app/auth-mvp/vedrid/page.tsx` if existing, or add targeted coverage if practical
- saved places API tests, if existing; otherwise add focused tests for the guard logic

Required home page test changes:

- Change the "signed-in user without vedrid + public enabled" expectation:
  - was: link `/vedrid`
  - should be: link `/auth-mvp/vedrid`

Add or update tests for `/auth-mvp/vedrid/page.tsx`:

- no private `vedrid`, `WEATHER_PUBLIC_ENABLED=true` -> renders authenticated `FerdalagidClient`
- no private `vedrid`, `WEATHER_PUBLIC_ENABLED=false` -> blocked/redirected
- private `vedrid` -> renders authenticated `FerdalagidClient`
- global `WEATHER_ENABLED=false` -> blocked

Add or update saved-places API tests:

- signed-in user without private `vedrid`, `WEATHER_PUBLIC_ENABLED=true`:
  - GET can read own saved places
  - POST can upsert saved place
  - DELETE can delete own saved place
- signed-in user without private `vedrid`, `WEATHER_PUBLIC_ENABLED=false`:
  - GET/POST/DELETE blocked
- guest with `WEATHER_PUBLIC_ENABLED=true`:
  - GET returns empty list
  - POST/DELETE unauthorized

Important: tests should verify saved places preserve user identity and still rely on RLS/auth client, not service_role.

## Commands Codex Ran

Read-only only:

```powershell
Get-Content -Encoding UTF8 'WORKFLOW.md'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Get-Content slices of 'app/auth-mvp/vedrid/page.tsx'
Get-Content slices of 'lib/weather/weatherBaseAccess.server.ts'
Get-Content slices of 'app/api/teskeid/weather/saved-places/route.ts'
Get-Content -LiteralPath 'app/api/teskeid/weather/saved-places/[id]/route.ts'
rg -n "guardFeatureAccess\\(|checkFeatureAccess\\([^\\n]+vedrid|resolveWeatherBaseAccess|WEATHER_PUBLIC_ENABLED" app/auth-mvp/vedrid app/api/teskeid/weather lib/__tests__
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Codex did not edit app code, did not run tests for this correction, did not touch SQL/Supabase/env, and did not commit/push/deploy.

## Localhost checks for Stebbi

After Claude Code implements the correction:

1. **Signed out**
   - Open `/`.
   - Click `Veðrið`.
   - Expected: opens `/vedrid`.
   - Expected: guest/public UI, no saved-place behavior.

2. **Signed in as `stebbishj`, no private `vedrid`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` card visible.
   - Click it.
   - Expected: opens `/auth-mvp/vedrid`, not `/vedrid`.
   - Search a route and generate a forecast.
   - Expected: saved/recent places are visible on the next search.
   - Expected: deleting a saved place works for that user's own place.
   - Expected: Veðurstofan controls/data are not visible unless `stebbishj` has `weather-provider-vedurstofan`.

3. **Signed in as Stebbi / user with private weather provider access**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` opens `/auth-mvp/vedrid`.
   - Expected: Veðurstofan follows the separate provider flag/access exactly as before.

4. **Block regression**
   - Temporarily set `WEATHER_PUBLIC_ENABLED=false` locally.
   - Use a signed-in user without private `vedrid`.
   - Expected: no weather card and `/auth-mvp/vedrid` blocked.
   - Restore `WEATHER_PUBLIC_ENABLED=true`.

5. **Global weather off**
   - Temporarily set `WEATHER_ENABLED=false` locally.
   - Expected: weather card hidden and weather routes blocked.
   - Restore `WEATHER_ENABLED=true`.

Do not change production Vercel env vars casually for this test. This can and should be verified locally first.

## Óvissa / þarf að staðfesta

Confidence: high on the product correction and affected files.

One implementation detail for Claude Code to confirm: whether to add the new authenticated-shell helper beside `resolveWeatherBaseAccess` or refactor the existing helper into two explicit helpers. Codex recommends adding a separate helper to avoid accidental changes to API route analytics/rate-limit semantics.

