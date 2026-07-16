# TODO 086 v221 - Codex review of v220 env mode contract

Created: 2026-07-15 15:02  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Prerelease review / env guidance  
Reviewed handoff: `2026-07-15-1500-todo-086-v220-claude-v218-v219-done-prerelease.md`

## Findings

### Blocking: do not switch Vercel/local env to `WEATHER_ENABLED=All` yet

`v220` handoff says the new `WEATHER_ENABLED=All` mode contract is ready, but the current workspace still has old boolean checks inside `lib/loans/guard.ts`.

Current code in `lib/loans/guard.ts` still does:

```ts
if (featureKey === 'vedrid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  ...
}
if (featureKey === 'ferdalagid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  ...
}
if (featureKey === 'elta-vedrid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  ...
}
if (featureKey === 'weather-provider-vedurstofan') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  ...
}
```

That means if Stebbi sets:

```env
WEATHER_ENABLED=All
```

then `checkFeatureAccess()` will return `false` for:

- `vedrid`
- `ferdalagid`
- `elta-vedrid`
- `weather-provider-vedurstofan`

Most importantly, the Veðurstofan provider layer will fail closed even if the user is correctly listed in `feature_access`.

So the new mode helper is partly implemented, but the shared feature-access guard is not yet updated.

## What Looks Correct

`lib/weather/weatherBaseAccess.server.ts` now has:

```ts
export function getWeatherEnabledMode(): WeatherEnabledMode {
  switch (process.env.WEATHER_ENABLED) {
    case 'All':
      return 'all'
    case 'Authenticated':
      return 'authenticated'
    case 'true':
      return process.env.WEATHER_PUBLIC_ENABLED === 'true' ? 'all' : 'authenticated'
    default:
      return 'off'
  }
}
```

And several API routes now use `getWeatherEnabledMode()`.

`app/api/teskeid/weather/travel/route.ts` also appears to include the v218 fix:

```ts
user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
  : Promise.resolve(false)
```

That fixes the provider-check dependency on `access.mode`, but it still depends on `checkFeatureAccess()` understanding `WEATHER_ENABLED=All`.

## Required Fix Before Switching Env

Claude Code should update `lib/loans/guard.ts` to use `getWeatherEnabledMode()` or an equivalent central helper for all weather-related feature keys.

Expected semantics:

- weather-related keys should be globally enabled when `getWeatherEnabledMode() !== 'off'`
- `vedrid`:
  - in `All` mode, private `vedrid` access should not be required for base weather
  - but `checkFeatureAccess('vedrid')` may still represent private/auth tier if the code needs it; this must be clearly defined
- `ferdalagid`, `elta-vedrid`, and `weather-provider-vedurstofan`:
  - should not fail merely because `WEATHER_ENABLED=All`
  - should still respect their own per-feature flags/access rows

At minimum, replace checks like:

```ts
process.env.WEATHER_ENABLED !== 'true'
```

with:

```ts
getWeatherEnabledMode() === 'off'
```

for weather feature keys.

Avoid circular imports: if `lib/loans/guard.ts` cannot safely import from `lib/weather/weatherBaseAccess.server.ts`, move `getWeatherEnabledMode()` to a tiny neutral module, for example:

```ts
lib/weather/weatherEnabledMode.server.ts
```

and import that from both files.

## Env Guidance For Stebbi

### Safe env right now, before guard fix

Keep the legacy transition env until `lib/loans/guard.ts` is fixed:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Delete these legacy/dead vars now or after localhost verification:

```env
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

Do not set `WEATHER_ENABLED=All` yet in this workspace.

### Target env after guard fix is confirmed

After Claude Code fixes `lib/loans/guard.ts` and tests pass, use:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Then remove:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

## Commands Run By Codex

Read-only:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-1500-todo-086-v220-claude-v218-v219-done-prerelease.md'
rg -n "WEATHER_ENABLED|WEATHER_PUBLIC_ENABLED|WEATHER_AUTH_ACCESS_REQUIRED|WEATHER_FLAG|WEATHER_PROVIDER_VEDURSTOFAN|VEDURSTOFAN_TRAVEL_LAYER|resolveWeatherBaseAccess|weather enabled|WeatherEnabled" app lib .env.example messages
$p='lib/loans/guard.ts'; $c=Get-Content -Encoding UTF8 $p; $c[60..105]
Get-Content -Encoding UTF8 'lib/weather/weatherBaseAccess.server.ts'
$p='app/api/teskeid/weather/travel/route.ts'; $c=Get-Content -Encoding UTF8 $p; $c[172..190]; $c[332..344]
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

No code changes, tests, migrations, commits, pushes, deploys, or env changes were run by Codex.

## Localhost checks for Stebbi

Before guard fix:

1. Keep:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

2. Restart localhost manually.
3. Test:
   - signed-out user: `/vedrid` works with met.no/Yr only
   - `stebbishj@gmail.com`: `/auth-mvp/vedrid` works, no Veðurstofan
   - `teskeid@gottvibe.is`: `/auth-mvp/vedrid` works and Veðurstofan appears if provider access row exists
   - `stefanhalldor@gmail.com`: full access unchanged

After guard fix:

1. Change local env to:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

2. Remove/comment local:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
```

3. Restart localhost manually.
4. Repeat the same four-user matrix above.
5. Also test:

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
```

Expected:

- signed-out blocked
- signed-in without `vedrid` blocked
- signed-in with `vedrid` works

Do not change Vercel production env until localhost confirms the guard fix.

## Óvissa / þarf að staðfesta

High confidence that `WEATHER_ENABLED=All` currently breaks weather feature checks because `lib/loans/guard.ts` still expects `WEATHER_ENABLED === 'true'`.

This is probably a small fix, but it must happen before Stebbi removes `WEATHER_PUBLIC_ENABLED` or changes `WEATHER_ENABLED` from `true` to `All` in Vercel.
