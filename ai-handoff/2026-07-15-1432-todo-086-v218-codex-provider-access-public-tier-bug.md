# TODO 086 v218 - Codex handoff: Veðurstofan provider missing for public-tier signed-in user

Created: 2026-07-15 14:32  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Bug handoff / prerelease follow-up  
Related handoffs:
- `2026-07-15-1420-todo-086-v216-claude-auth-shell-correction-prerelease.md`
- `2026-07-15-1420-todo-086-v217-codex-v216-auth-shell-prerelease-review.md`

## Findings

Blocking for release of the current flag model:

`teskeid@gottvibe.is` can be granted `weather-provider-vedurstofan` in the admin UI but still not receive the Veðurstofan layer unless the user also has private/base `vedrid` access.

Stebbi tested:

- signed-out user: base met.no weather works
- `stefanhalldor@gmail.com`: base weather + Veðurstofan layer works
- `stebbishj@gmail.com`: base weather works, no Veðurstofan as expected
- `teskeid@gottvibe.is`: admin UI shows granted Veðurstofan provider access, but Veðurstofan layer does not appear

The likely root cause is in `app/api/teskeid/weather/travel/route.ts`.

Current code gates provider lookup on base access mode:

```ts
access.mode === 'authenticated' && user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  : Promise.resolve(false)
```

But after v216, signed-in users without private `vedrid` access can legitimately use `/auth-mvp/vedrid` through public base weather. For those users, `resolveWeatherBaseAccess(user)` returns `mode: 'public'`, even though the Supabase session user is real and available.

So provider access is never checked for exactly the new valid case:

- signed-in user
- no private `vedrid`
- `WEATHER_PUBLIC_ENABLED=true`
- has `weather-provider-vedurstofan`

That explains why `stefanhalldor@gmail.com` works: Stebbi likely has private `vedrid`, so `access.mode === 'authenticated'`. `teskeid@gottvibe.is` likely only has the provider flag, so the provider check is skipped.

## Correct Product Rule

Base met.no weather access and provider-layer access are separate concepts.

- Base met.no can be public for everyone when `WEATHER_PUBLIC_ENABLED=true`.
- Signed-in public-tier users still have a real `user.id` and `user.email`.
- Provider layers must be allowed when the signed-in user has that provider feature key, regardless of whether base weather access came through private `vedrid` or public base weather.
- Signed-out users must never get Veðurstofan provider data unless we explicitly decide to make that provider public later.

## Recommended Fix

In `app/api/teskeid/weather/travel/route.ts`, change the Veðurstofan provider gate to depend on the real session user, not `access.mode`.

Conceptually:

```ts
const canReadVedurstofanLayer =
  user?.id && user?.email
    ? await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
    : false
```

Then use that boolean where `layerEnabled` is currently used.

Keep `resolveWeatherBaseAccess(user)` as-is for base route authorization and public/guest rate-limit semantics. Do not make public base access become authenticated access just to solve this.

Why this is safer:

- no expansion for guests
- no change to base met.no access
- no change to saved places
- no need to grant private `vedrid` just to see provider layers
- future provider keys can follow the same model, e.g. `weather-provider-vegagerdin`

## Tests To Add / Update

Add a regression test in `lib/__tests__/weather-travel-api.test.ts`:

1. `WEATHER_ENABLED=true`
2. `WEATHER_PUBLIC_ENABLED=true`
3. signed-in user exists: `{ id: 'u-public-provider', email: 'provider@example.com' }`
4. `checkFeatureAccess` call for `vedrid` returns `false`
5. `checkFeatureAccess` call for `weather-provider-vedurstofan` returns `true`
6. product table read returns a valid station payload
7. expected response includes `vedurstofanLayer`

Also keep/confirm existing tests:

- signed-out public user does not receive `vedurstofanLayer`
- signed-in user without `weather-provider-vedurstofan` does not receive `vedurstofanLayer`
- signed-in user with private `vedrid` and provider access still receives `vedurstofanLayer`

Potential test naming:

```ts
it('includes vedurstofanLayer for signed-in public-tier user with weather-provider-vedurstofan access', async () => {
  ...
})
```

## Files To Inspect / Change

Expected code change:

- `app/api/teskeid/weather/travel/route.ts`

Expected test change:

- `lib/__tests__/weather-travel-api.test.ts`

Maybe useful to inspect:

- `lib/weather/weatherBaseAccess.server.ts`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`

Do not change SQL for this bug. The admin UI appears to insert the correct `feature_key`, and `checkFeatureAccess` appears to check the same key.

## Notes On Admin UI / Database

The screenshot shows the admin UI lists:

- `teskeid@gottvibe.is`
- `stefanhalldor@gmail.com`

under Veðurstofan-veðurlagalayer.

`app/api/admin/feature-access/route.ts` allows `weather-provider-vedurstofan`, normalizes email, and inserts that exact `feature_key`.

`lib/loans/guard.ts` checks the same key:

```ts
return checkPerUserAccess(email, 'weather-provider-vedurstofan')
```

So this does not look like an admin write bug.

## Commands Run By Codex

Read-only inspection only:

```powershell
rg -n "weather-provider-vedurstofan|WEATHER_PROVIDER_VEDURSTOFAN|feature_access|checkFeatureAccess" lib app components sql
git status --short
Get-Content -Encoding UTF8 'lib/loans/guard.ts'
Get-Content -Encoding UTF8 'app/api/admin/feature-access/route.ts'
Get-Content -Encoding UTF8 'lib/weather/weatherBaseAccess.server.ts'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Targeted source reads:

```powershell
$p='app/api/teskeid/weather/travel/route.ts'; $c=Get-Content -Encoding UTF8 $p; $c[175..195]; $c[332..345]
$p='lib/__tests__/weather-travel-api.test.ts'; $c=Get-Content -Encoding UTF8 $p; $c[250..320]; $c[380..420]
```

No tests were run by Codex for this handoff because no code was changed.

## Localhost checks for Stebbi

After Claude Code fixes this:

1. Keep the relevant local env:
   - `WEATHER_ENABLED=true`
   - `WEATHER_PUBLIC_ENABLED=true`
   - `WEATHER_AUTH_ACCESS_REQUIRED=true`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`
2. Confirm `teskeid@gottvibe.is` is listed in admin under Veðurstofan-veðurlagalayer.
3. Log in as `teskeid@gottvibe.is`.
4. Open `/auth-mvp/vedrid`.
5. Run the same route as Stebbi used for `stefanhalldor@gmail.com`, e.g. Reykjavík -> Stóra-borg.
6. Expected:
   - page stays in authenticated `/auth-mvp/vedrid`
   - saved places still behave like signed-in user state
   - provider selector shows Veðurstofan
   - enabling Veðurstofan adds Veðurstofan points/layer
7. Log in as `stebbishj@gmail.com` without provider access.
8. Expected:
   - base met.no weather still works
   - Veðurstofan provider is not visible/available
9. Sign out and test public `/vedrid`.
10. Expected:
    - base met.no weather works
    - Veðurstofan provider is not visible/available

Do not change Vercel or Supabase production settings for this localhost check.

## Óvissa / þarf að staðfesta

High confidence on root cause from code inspection.

One thing to verify after the fix: if the client already has an old route result loaded, Stebbi may need to re-run the route calculation after granting provider access. The provider layer is returned from `/api/teskeid/weather/travel`, so an old in-memory result will not magically gain `vedurstofanLayer`.
