# TODO 086 v214 - Authenticated home must show public weather card

Created: 2026-07-15 13:51  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Handoff / implementation plan, no code changes made by Codex

## Context

Stebbi reported that an authenticated user without special Veðurstofan/weather access (`stebbishj`) does **not** see the `Veðrið` card on the authenticated home screen, while a signed-out public user does see `Veðrið` on `/`.

Stebbi's expected product rule is clear:

- Everyone, signed-in and signed-out, should be able to access current public MET/Yr weather when public weather is enabled.
- Only selected users should see Veðurstofan and the "Vegagerðin væntanleg" provider work while those provider layers are still gated.
- A logged-in user without special `vedrid`/Veðurstofan access should still see and open public `/vedrid`.

## Finding

**Severity: High - authenticated users can lose access to public weather**

The authenticated home page currently uses the private/authenticated `vedrid` feature gate to decide whether to show the weather card at all.

Relevant code:

- `app/auth-mvp/heim/page.tsx:61-65`
  - calls `checkFeatureAccess(user.id, user.email!, 'vedrid')`
- `app/auth-mvp/heim/page.tsx:69-73`
  - maps `vedrid` to `{ href: '/auth-mvp/vedrid', enabled: weatherEnabled }`
- `lib/loans/guard.ts:70-80`
  - `vedrid` respects `WEATHER_AUTH_ACCESS_REQUIRED`
  - if `WEATHER_AUTH_ACCESS_REQUIRED=true`, only users with per-user `feature_access('vedrid')` pass

That is correct for the **private** `/auth-mvp/vedrid` route, but wrong for deciding whether a logged-in user can see the **public** weather entry point.

The public route already has separate semantics:

- `app/page.tsx:10-14`
  - public `vedrid` card links to `/vedrid`
- `app/vedrid/page.tsx:5-13`
  - public page is available when:
    - `AUTH_MVP_ENABLED=true`
    - `WEATHER_ENABLED=true`
    - `WEATHER_PUBLIC_ENABLED=true`

There is already a good shared helper for this product distinction:

- `lib/weather/weatherBaseAccess.server.ts:9-19`
  - authenticated user with `vedrid` -> authenticated mode
  - authenticated user without `vedrid`, or unauthenticated user -> public mode if `WEATHER_PUBLIC_ENABLED=true`
  - otherwise blocked

Important detail: `resolveWeatherBaseAccess` documents that callers must check `WEATHER_ENABLED` before invoking it.

## Desired behavior

For the authenticated home card:

| User state | Flags | Card visible? | Card href |
| --- | --- | --- | --- |
| Signed out | `WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true` | yes on `/` | `/vedrid` |
| Signed in without `vedrid` | `WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true` | yes on `/auth-mvp/heim` | `/vedrid` |
| Signed in with `vedrid` | `WEATHER_ENABLED=true` | yes on `/auth-mvp/heim` | `/auth-mvp/vedrid` |
| Signed in without `vedrid` | `WEATHER_PUBLIC_ENABLED=false` | no | n/a |
| Any user | `WEATHER_ENABLED=false` | no usable weather | n/a |

Veðurstofan provider access is **not** part of this decision. It must remain governed separately by `weather-provider-vedurstofan` / `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`.

## Recommended implementation for Claude Code

1. Update `app/auth-mvp/heim/page.tsx` so the weather card uses base weather access, not only private `vedrid` access.

   Recommended shape:

   ```ts
   import { resolveWeatherBaseAccess } from '@/lib/weather/weatherBaseAccess.server'
   ```

   Then split the current `weatherEnabled` concept into something like:

   ```ts
   const weatherBaseAccess =
     process.env.WEATHER_ENABLED === 'true'
       ? await resolveWeatherBaseAccess({ id: user.id, email: user.email })
       : { mode: 'blocked' as const }

   const weatherCardEnabled = weatherBaseAccess.mode !== 'blocked'
   const weatherCardHref =
     weatherBaseAccess.mode === 'authenticated' ? '/auth-mvp/vedrid' : '/vedrid'
   ```

   Keep loans and Umönnun as they are.

2. Update `READY_TESKEID_ROUTES['vedrid']` to use:

   - `enabled: weatherCardEnabled`
   - `href: weatherCardHref`

3. Do **not** loosen `app/auth-mvp/vedrid/page.tsx`.

   Direct private route access should still require private `vedrid` access. A user without private `vedrid` should go through `/vedrid`.

4. Do **not** change provider gates.

   This bug is about the base MET/Yr card visibility for signed-in users. It is not a Veðurstofan provider rollout.

## Test plan for Claude Code

Add focused tests in `lib/__tests__/home-page.test.tsx`.

Existing context:

- `setupGuard` currently only models `lanad-og-skilad` and `umonnun` and returns `false` for all other feature keys.
- Default mocked ideas currently include loan and Umönnun. For these tests, make sure launched ideas also include a `vedrid` idea row, or reuse an existing fixture if one exists elsewhere in the test file.

Suggested test cases:

1. **Signed-in user without private `vedrid` sees public weather when public weather is enabled**

   Setup:
   - `WEATHER_ENABLED=true`
   - `WEATHER_PUBLIC_ENABLED=true`
   - `checkFeatureAccess(..., 'vedrid')` returns `false`
   - launched ideas include `vedrid`

   Assert:
   - `Veðrið` card is visible
   - card link is `/vedrid`
   - no `/auth-mvp/vedrid` link for that card

2. **Signed-in user with private `vedrid` gets private weather link**

   Setup:
   - `WEATHER_ENABLED=true`
   - `checkFeatureAccess(..., 'vedrid')` returns `true`
   - launched ideas include `vedrid`

   Assert:
   - `Veðrið` card is visible
   - card link is `/auth-mvp/vedrid`

3. **Signed-in user without private `vedrid` does not see weather when public weather is disabled**

   Setup:
   - `WEATHER_ENABLED=true`
   - `WEATHER_PUBLIC_ENABLED` unset or false
   - `checkFeatureAccess(..., 'vedrid')` returns `false`
   - launched ideas include `vedrid`

   Assert:
   - `Veðrið` card is not visible

4. **Weather disabled wins over public flag**

   Setup:
   - `WEATHER_ENABLED=false`
   - `WEATHER_PUBLIC_ENABLED=true`
   - `checkFeatureAccess(..., 'vedrid')` returns `false`
   - launched ideas include `vedrid`

   Assert:
   - `Veðrið` card is not visible

5. Optional but useful:

   Confirm that provider flag/access (`weather-provider-vedurstofan`) is not consulted for home-card visibility. It should only affect provider UI/API availability inside the weather flow.

## Commands Codex ran

Read-only only:

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `Get-ChildItem -File 'ai-handoff' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 30`
- Read relevant slices of:
  - `app/auth-mvp/heim/page.tsx`
  - `app/page.tsx`
  - `app/vedrid/page.tsx`
  - `lib/loans/guard.ts`
  - `lib/weather/weatherBaseAccess.server.ts`
  - `lib/__tests__/home-page.test.tsx`
- `rg` search for related weather/home flag usage

Codex did not run tests, did not edit app code, did not run SQL, did not touch Supabase, and did not change `.env.local`.

## Files likely touched by Claude Code

Expected:

- `app/auth-mvp/heim/page.tsx`
- `lib/__tests__/home-page.test.tsx`

Possibly not needed:

- `lib/weather/weatherBaseAccess.server.ts`

Do not change unless a genuine issue is found:

- `app/auth-mvp/vedrid/page.tsx`
- `app/vedrid/page.tsx`
- provider/Veðurstofan gates
- Supabase migrations
- Vercel env vars
- `.env.local`

## Risks / edge cases

- If Claude Code calls `resolveWeatherBaseAccess` without first checking `WEATHER_ENABLED`, `WEATHER_PUBLIC_ENABLED=true` could incorrectly show public weather while global weather is disabled. The helper explicitly says the caller must check `WEATHER_ENABLED`.
- If Claude Code simply changes `checkFeatureAccess('vedrid')` semantics, it may accidentally open private `/auth-mvp/vedrid` to users who should only get public `/vedrid`. Do not do that.
- If the `vedrid` launched idea is missing from the test fixture, tests may pass without actually testing the card. Make sure the fixture includes the weather idea.
- Provider access must stay separate. A user seeing public MET/Yr must not automatically see Veðurstofan.

## Localhost checks for Stebbi

After Claude Code implements and tests:

1. **Signed-out public user**
   - Open `/`.
   - Expected: `Veðrið` is visible under `Tilbúnar Teskeiðar`.
   - Click it.
   - Expected: opens `/vedrid` and shows base MET/Yr weather.

2. **Signed-in user without private weather access, e.g. `stebbishj`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` is visible alongside other ready Teskeiðar.
   - Click it.
   - Expected: opens `/vedrid`, not `/auth-mvp/vedrid`.
   - Expected: base MET/Yr weather works.
   - Expected: Veðurstofan provider is not visible unless that user has `weather-provider-vedurstofan` access.

3. **Signed-in Stebbi/admin with private `vedrid` access**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` is visible.
   - Click it.
   - Expected: opens `/auth-mvp/vedrid`.
   - Expected: provider UI follows the per-user Veðurstofan flag as before.

4. **Manual private-route guard regression**
   - As a user without private `vedrid`, manually open `/auth-mvp/vedrid`.
   - Expected: still blocked or redirected.

5. **Flag regression checks**
   - With `WEATHER_PUBLIC_ENABLED=false` and no private `vedrid`, the logged-in user should not see the weather card.
   - With `WEATHER_ENABLED=false`, weather should not be accessible through either public or authenticated routes.

Do not casually change production Vercel env vars while testing this. This fix should be testable locally through `.env.local` and mocked tests first.

## Óvissa / þarf að staðfesta

Confidence is high on the root cause.

The only implementation detail Claude Code should confirm is the cleanest way to add a weather idea fixture in `lib/__tests__/home-page.test.tsx`, because the current default fixture shown in the inspected slice only includes loan and Umönnun ideas.

