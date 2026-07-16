# v226 Codex handoff: `WEATHER_ENABLED=Authenticated` blocks signed-in base weather

Created: 2026-07-15 15:36
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Context: Stebbi localhost-tested v224/v225 and found that everything worked except `WEATHER_ENABLED=Authenticated`; the Veðrið card did not show for a signed-in user on `/auth-mvp/heim`.

## Finding

Blocker for the new flag contract: current code treats `WEATHER_ENABLED=Authenticated` as "signed-in users need private `vedrid` access when `WEATHER_AUTH_ACCESS_REQUIRED=true`", but Stebbi's clarified product contract is:

- `WEATHER_ENABLED=All` → base MET/Yr weather for signed-out and signed-in users.
- `WEATHER_ENABLED=Authenticated` → base MET/Yr weather for all signed-in users.
- Any other/missing value → weather closed.
- `WEATHER_AUTH_ACCESS_REQUIRED=true` should not hide the base weather card from signed-in users in `Authenticated` mode. It should only preserve the private/per-user `vedrid` distinction if some hidden or private weather affordance still depends on it.

In other words: `Authenticated` means "innskráðir", not "only users with a `feature_access.vedrid` row".

## Root Cause

`resolveAuthenticatedWeatherShellAccess()` blocks signed-in users without private `vedrid` unless `mode === 'all'`.

Current code in `lib/weather/weatherBaseAccess.server.ts`:

```ts
const hasPrivateVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
if (hasPrivateVedrid) {
  return { mode: 'authenticated', userId: user.id, hasPrivateVedrid: true }
}

if (mode === 'all') return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
return { mode: 'blocked' }
```

So with:

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
```

a signed-in user without `feature_access(feature_key='vedrid')` gets `blocked`, which hides the home card and blocks `/auth-mvp/vedrid`.

Same issue likely exists in `resolveWeatherBaseAccess()` for API routes:

```ts
if (user?.email) {
  const hasVedrid = await checkFeatureAccess(...)
  if (hasVedrid) return authenticated
}
if (mode === 'all') return public
return blocked
```

That means signed-in base-weather API calls are also blocked in `Authenticated` mode unless the user has private `vedrid`.

## Required Fix

Claude Code should adjust the base weather access helpers so `Authenticated` mode allows all signed-in users to use base MET/Yr weather.

Recommended behavior:

### `resolveAuthenticatedWeatherShellAccess(user)`

- `off` → blocked.
- no email/user → blocked.
- if `checkFeatureAccess('vedrid')` true → `{ mode: 'authenticated', userId, hasPrivateVedrid: true }`.
- if mode is `all` or `authenticated` → allow signed-in shell access with `hasPrivateVedrid: false`.
- only block signed-in users without private `vedrid` when mode is `off`.

The existing `authenticated-public` mode name is slightly awkward for `Authenticated` mode. Two acceptable implementation options:

1. Minimal change:
   - Keep the union member named `authenticated-public`.
   - Return it for both `mode === 'all'` and `mode === 'authenticated'`.
   - Update comments so it means "signed-in user with base weather access but no private `vedrid`".

2. Cleaner change:
   - Rename `authenticated-public` to `authenticated-base`.
   - Update tests/usages.
   - This is more precise but slightly broader.

Codex recommendation: option 1 now, because current consumers only check `mode !== 'blocked'` and `hasPrivateVedrid`. Rename later if it becomes confusing.

### `resolveWeatherBaseAccess(user)`

Recommended behavior:

- `off` → blocked.
- signed-in user with private `vedrid` → `{ mode: 'authenticated', userId, actor: 'authenticated' }`.
- signed-in user without private `vedrid` and `mode === 'authenticated'` → `{ mode: 'authenticated', userId, actor: 'authenticated' }`.
- signed-in user without private `vedrid` and `mode === 'all'`:
  - Either keep current public-tier semantics (`userId: null`) if that was intentional for analytics/rate limiting.
  - Or use authenticated actor for signed-in users if we want signed-in identity preserved for all base API calls.

Given the prior product decision "signed-in users should keep authenticated shell and saved places", Codex prefers:

- shell/saved-place helpers keep user identity.
- public-capable stateless API routes may still use public-tier `userId: null` in `All` if existing tests expect that.
- but in `Authenticated`, signed-in users must not be blocked.

Minimal safe patch:

```ts
if (user?.email) {
  const hasVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
  if (hasVedrid || mode === 'authenticated') {
    return { mode: 'authenticated', userId: user.id, actor: 'authenticated' }
  }
}
if (mode === 'all') return { mode: 'public', userId: null, actor: 'public' }
return { mode: 'blocked' }
```

And for shell:

```ts
if (mode === 'all' || mode === 'authenticated') {
  return { mode: 'authenticated-public', userId: user.id, hasPrivateVedrid: false }
}
```

## Tests To Add Or Update

Add/adjust tests for this exact contract:

1. `resolveAuthenticatedWeatherShellAccess`
   - `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=true`, no `vedrid` row → allowed, `hasPrivateVedrid: false`.
   - `WEATHER_ENABLED=Authenticated`, user has `vedrid` row → allowed, `hasPrivateVedrid: true`.
   - `WEATHER_ENABLED=Authenticated`, signed out/no email → blocked.

2. Home page card
   - signed-in user without `vedrid`, `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=true` → Veðrið card visible and links to `/auth-mvp/vedrid`.

3. API access
   - signed-in user without `vedrid`, `WEATHER_ENABLED=Authenticated`, `WEATHER_AUTH_ACCESS_REQUIRED=true` → place search/routes/travel endpoints are allowed.
   - signed-out user, `WEATHER_ENABLED=Authenticated` → `/vedrid` and public APIs are blocked.

4. Provider separation
   - signed-in user without `weather-provider-vedurstofan`, `WEATHER_ENABLED=Authenticated` → no Veðurstofan.
   - signed-in user with `weather-provider-vedurstofan`, `WEATHER_ENABLED=Authenticated` → Veðurstofan appears.

## Do Not Change

Do not weaken the Veðurstofan provider gate.

Keep:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

and continue to require:

```text
feature_access.feature_key = 'weather-provider-vedurstofan'
```

for the Veðurstofan layer.

Also keep:

```env
WEATHER_ENABLED=All
```

as the intended production/default open mode for now if Stebbi wants public + authenticated base weather.

`WEATHER_ENABLED=Authenticated` is still useful as a future "signed-in only" base-weather mode, but it must mean all signed-in users, not private `vedrid` only.

## Localhost checks for Stebbi

After Claude Code fixes this, test with:

```env
WEATHER_ENABLED=Authenticated
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
```

Restart localhost.

Checks:

1. Signed out:
   - `/vedrid` should not be available.
   - Public place search/travel APIs should not work for guests.

2. Signed in as `stebbishj@gmail.com` without private `vedrid`:
   - `/auth-mvp/heim` should show Veðrið.
   - Clicking Veðrið should open `/auth-mvp/vedrid`.
   - Base MET/Yr weather should work.
   - Veðurstofan should not show.

3. Signed in as `teskeid@gottvibe.is` with `weather-provider-vedurstofan`:
   - `/auth-mvp/vedrid` should work.
   - Base MET/Yr weather should work.
   - Veðurstofan should show.

4. Signed in as `stefanhalldor@gmail.com`:
   - Existing full behavior should remain.

Then switch back to intended production-like mode:

```env
WEATHER_ENABLED=All
```

and re-check:

- signed-out `/vedrid` works with base MET/Yr only.
- signed-in users use `/auth-mvp/vedrid`.
- Veðurstofan still only appears for provider-flagged users.

## Recommendation

Send this to Claude Code as a small targeted fix. It should be handled before deploy because it changes the agreed flag semantics, and Stebbi's localhost test already caught the mismatch.

