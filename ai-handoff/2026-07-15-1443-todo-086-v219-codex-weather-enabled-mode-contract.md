# TODO 086 v219 - Codex handoff: simplify base weather access with WEATHER_ENABLED mode

Created: 2026-07-15 14:43  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Flag contract / implementation handoff  
Related:
- `2026-07-15-1432-todo-086-v218-codex-provider-access-public-tier-bug.md`

## Stebbi Decision

Stebbi wants the weather base-access flags simplified and made consistent with the existing feature naming style:

- keep using `WEATHER_ENABLED`
- make it a mode string, not a boolean
- allowed values:
  - `All`
  - `Authenticated`
- any other value, missing var, or empty var means closed/off

Target semantics:

```env
WEATHER_ENABLED=All
```

means:

- base met.no/Yr weather is open to everyone
- signed-out users can use public `/vedrid`
- signed-in users can use `/auth-mvp/vedrid`
- signed-in users keep authenticated shell and saved places
- `WEATHER_AUTH_ACCESS_REQUIRED` must not block base weather in this mode

```env
WEATHER_ENABLED=Authenticated
```

means:

- signed-out users cannot use weather
- signed-in users may use `/auth-mvp/vedrid`
- if `WEATHER_AUTH_ACCESS_REQUIRED=true`, signed-in users must also have `feature_access.feature_key='vedrid'`
- if `WEATHER_AUTH_ACCESS_REQUIRED` is false/missing, all signed-in users may use base weather

Any other value means:

- weather is closed
- no public weather
- no authenticated weather
- weather UI cards/routes should be hidden or blocked

## Important Product Rule

Do not reintroduce the bug where signed-in users have less access than signed-out users.

When `WEATHER_ENABLED=All`, a signed-in user without `vedrid` must still be able to use base weather through `/auth-mvp/vedrid`.

Provider layers remain separate:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

means only users in `feature_access` for `weather-provider-vedurstofan` get Veðurstofan.

Later Vegagerðin should follow the same model:

```env
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```

## Why This Is Better Than Current Flags

Current local state has:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
```

That is confusing because:

- `WEATHER_ENABLED=true` sounds like all weather is on
- `WEATHER_PUBLIC_ENABLED=true` is the real public switch
- `WEATHER_AUTH_ACCESS_REQUIRED=true` sounds like it might block signed-in public-tier users, even though it should only mean private/auth `vedrid` gate

New target contract:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

This reads naturally:

- weather base is open to all
- `vedrid` remains a per-user/private access concept only when authenticated-only mode needs it
- Veðurstofan is still provider-gated

## Implementation Recommendation

Do not scatter string comparisons everywhere.

Create a small central helper, for example in `lib/weather/weatherBaseAccess.server.ts` or a new `lib/weather/weatherAccessMode.ts`:

```ts
export type WeatherEnabledMode = 'all' | 'authenticated' | 'off'

export function getWeatherEnabledMode(): WeatherEnabledMode {
  switch (process.env.WEATHER_ENABLED) {
    case 'All':
      return 'all'
    case 'Authenticated':
      return 'authenticated'
    default:
      return 'off'
  }
}
```

Then use that helper in all routes/guards instead of:

```ts
process.env.WEATHER_ENABLED !== 'true'
process.env.WEATHER_PUBLIC_ENABLED === 'true'
```

### Suggested Access Helper Semantics

`resolveWeatherBaseAccess(user)` should become:

- `mode=off` -> blocked
- `mode=all`:
  - if user signed in: return authenticated/public-tier identity in a way callers can preserve user where needed
  - if user signed out: return public
- `mode=authenticated`:
  - signed out -> blocked
  - signed in + `WEATHER_AUTH_ACCESS_REQUIRED=true` -> require `vedrid`
  - signed in + no auth requirement -> allow

The current split between:

- `resolveWeatherBaseAccess`
- `resolveAuthenticatedWeatherShellAccess`

is useful, but Claude Code should review whether they can share one internal evaluator so behavior cannot diverge again.

## Migration Path / Backward Compatibility

Because many tests and envs still use `WEATHER_ENABLED=true`, use a short transition plan:

1. Add the new mode interpretation.
2. During transition, optionally treat legacy `WEATHER_ENABLED=true` + `WEATHER_PUBLIC_ENABLED=true` as equivalent to `All`.
3. Treat legacy `WEATHER_ENABLED=true` + no public flag as equivalent to `Authenticated`.
4. Update `.env.example` and handoff docs to the new model.
5. Update local `.env.local` only after code supports it:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

6. After localhost + production verification, remove `WEATHER_PUBLIC_ENABLED` from Vercel.
7. Eventually remove legacy fallback and tests for `WEATHER_ENABLED=true` / `WEATHER_PUBLIC_ENABLED`.

Do not remove legacy fallback in the same risky step unless Stebbi explicitly approves a hard cutover.

## Files Likely Affected

Read-only scan showed these areas use old flags:

- `app/vedrid/page.tsx`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/api/place/search/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `app/api/teskeid/weather/vedurstofan/*`
- `app/api/cron/warm-vedurstofan/route.ts`
- `lib/loans/guard.ts`
- `lib/weather/weatherBaseAccess.server.ts`
- tests under `lib/__tests__/`
- `.env.example`
- admin UI copy that references `WEATHER_AUTH_ACCESS_REQUIRED` or weather flags

## Specific Bug To Avoid

This handoff should be done together with or after v218:

`app/api/teskeid/weather/travel/route.ts` must not require private `vedrid` before checking provider access.

Correct rule:

- base access mode decides whether route calculation may run
- signed-in `user.email` + provider feature decides whether Veðurstofan may be included

## Test Plan For Claude Code

Update or add tests for these matrix cases:

### Public page `/vedrid`

- `WEATHER_ENABLED=All` -> public `/vedrid` works
- `WEATHER_ENABLED=Authenticated` -> public `/vedrid` blocked/notFound
- `WEATHER_ENABLED=''` or missing -> public `/vedrid` blocked/notFound

### Auth shell `/auth-mvp/vedrid`

- `WEATHER_ENABLED=All`, signed-in no `vedrid` -> allowed
- `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=false`, signed-in no `vedrid` -> allowed
- `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=true`, signed-in no `vedrid` -> blocked
- `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=true`, signed-in with `vedrid` -> allowed
- `WEATHER_ENABLED=off/unknown/missing` -> blocked

### API routes

- place search follows same base access mode
- route options follow same base access mode and keep guest rate-limit only for signed-out/public callers
- final travel endpoint follows same base access mode
- saved places:
  - signed-out never writes
  - signed-in in `All` may read/write own saved places
  - signed-in in `Authenticated` may read/write only if base access allows them
  - RLS/user ownership remains unchanged

### Provider layer

- `WEATHER_ENABLED=All`, signed-in no `vedrid`, but with `weather-provider-vedurstofan` -> receives `vedurstofanLayer`
- `WEATHER_ENABLED=All`, signed-out user -> no `vedurstofanLayer`
- `WEATHER_ENABLED=Authenticated`, signed-in with base access + provider access -> receives `vedurstofanLayer`
- signed-in without provider access -> no `vedurstofanLayer`

## Vercel / Env Target After Implementation

For the current desired production behavior:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
```

Remove after verification:

```env
WEATHER_PUBLIC_ENABLED
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

Do not remove `WEATHER_PUBLIC_ENABLED` before the new code is deployed and verified.

## Commands Run By Codex

Read-only:

```powershell
rg -n "WEATHER_ENABLED|WEATHER_PUBLIC_ENABLED|WEATHER_AUTH_ACCESS_REQUIRED|WEATHER_FLAG|resolveWeatherBaseAccess|resolveAuthenticatedWeatherShellAccess" app lib components messages .env.example vercel.json
Get-Date -Format 'yyyy-MM-dd HH:mm'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
```

No code changes, tests, migrations, commits, pushes, or deploys were run by Codex.

## Localhost checks for Stebbi

After Claude Code implements the new mode contract:

1. Set locally:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

2. Signed out:
   - open `/`
   - click `Veðrið`
   - expected: `/vedrid` works with met.no/Yr only
   - expected: no saved places, no Veðurstofan

3. Signed in as `stebbishj@gmail.com` without `vedrid` and without Veðurstofan provider:
   - open `/auth-mvp/heim`
   - expected: `Veðrið` visible
   - click `Veðrið`
   - expected: `/auth-mvp/vedrid`
   - expected: met.no/Yr works
   - expected: saved places work
   - expected: no Veðurstofan

4. Signed in as `teskeid@gottvibe.is` with `weather-provider-vedurstofan` but no private `vedrid`:
   - open `/auth-mvp/vedrid`
   - calculate route
   - expected: met.no/Yr works
   - expected: Veðurstofan provider appears and can be toggled on

5. Signed in as `stefanhalldor@gmail.com`:
   - expected: no regression, Veðurstofan still works

6. Temporarily test:

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
```

   - signed out: no weather
   - signed-in without `vedrid`: no weather
   - signed-in with `vedrid`: weather works

7. Temporarily test:

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=false
```

   - signed out: no weather
   - signed-in users: base weather works

8. Temporarily test:

```env
WEATHER_ENABLED=
```

   - expected: weather closed everywhere

Do not change Supabase, production Vercel env vars, migrations, or deployment as part of localhost testing unless Stebbi explicitly approves.

## Óvissa / þarf að staðfesta

Medium implementation risk because `WEATHER_ENABLED` is currently used as a boolean in many places and many tests assert current names.

The safest approach is a central helper plus temporary legacy fallback, not scattered ad hoc edits.
