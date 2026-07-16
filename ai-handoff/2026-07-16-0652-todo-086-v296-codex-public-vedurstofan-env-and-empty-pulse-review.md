# 2026-07-16 06:52 - Codex review: public Veðurstofan env + empty Veðurpúls preview

Created: 2026-07-16 06:52  
Timezone: Atlantic/Reykjavik  
Related TODO: todo-086  
Source prompt: Stebbi production-tested public weather and asked how to open Veðurstofan fully, plus noted empty public Veðurpúls preview should be hidden.

## Findings

### Medium - Empty public Veðurpúls preview should be hidden, not rendered as an empty prompt

Current `components/weather/VedurstofanPulseInline.tsx` always renders the inline wrapper and `ChatPreviewList`, even when:

- the viewer is public / not signed in,
- preview has loaded,
- `messages.length === 0`,
- no compose box is available.

That creates the production text Stebbi saw:

> Nýjast af staðnum frá notendum Teskeið.is  
> Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum.

For public users with no messages, this component should return `null`. The empty invitation is useful only when an authenticated user can actually post.

Recommended behavior:

- Public / `needs-login` + no messages after preview load: hide the whole inline pulse component.
- Authenticated `allowed` + no messages: show the composer and empty prompt, because the user can contribute.
- Public / `needs-login` + messages exist: show the 3-message preview and link/login affordance as designed.
- `postingAccess === 'unknown'`: avoid flashing the empty state before access and preview are known.

Design note: this follows `Design.md` by reducing visual noise inside compact cards and keeping repeated card content useful. Any input shown on mobile still needs 16px text and about 40px touch target.

### High - Deleting `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` does not open Veðurstofan

Current guard in `lib/loans/guard.ts:93-101` says:

```ts
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'
if (!vedurstofanAccessRequired) return true
return checkPerUserAccess(email, 'weather-provider-vedurstofan')
```

That means:

- unset / missing = restricted / per-user gate ON
- `true` = restricted / per-user gate ON
- `false` = open, but only for code paths that call `checkFeatureAccess(...)` with a signed-in user/email

So deleting the env var in Vercel correctly keeps Veðurstofan restricted. To graduate the provider, the value must explicitly be:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false
```

### High - Current travel API cannot open Veðurstofan to public users by env alone

Even with `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false`, the current travel route only checks Veðurstofan provider access for signed-in users:

`app/api/teskeid/weather/travel/route.ts:335-342`

```ts
const [routeForecastResults, destForecastRaw, layerEnabled] = await Promise.all([
  Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))),
  fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null),
  user?.id && user?.email
    ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
    : Promise.resolve(false),
])
```

So:

- signed-out public user always gets `layerEnabled=false`
- no Vercel env setting can currently make public users receive the Veðurstofan layer
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` can only open this layer to signed-in users, unless the route is changed

This is likely why Stebbi did not see Veðurstofan as public after changing Vercel env.

## Correct env interpretation

For current production behavior:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Means:

- MET/Yr base weather is available to public and signed-in users.
- Private signed-in weather shell access is still tracked/gated by `vedrid` where relevant.
- Veðurstofan provider is only visible to users with `weather-provider-vedurstofan` feature access.

To open Veðurstofan to all signed-in weather users in current code:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false
```

To open Veðurstofan to public users too:

- Env alone is not enough in the current code.
- Claude Code needs to change the provider-access resolver / travel route so `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` allows any allowed base weather request, including `access.mode === 'public'`.

Important Vercel note: changing env vars in Vercel generally requires a new deployment/redeploy before the currently served deployment sees the new values. Also, deleting the variable is not the open state; explicit `false` is the open state.

## Recommended next implementation plan for Claude Code

### 1. Hide empty public pulse preview

In `VedurstofanPulseInline`, add a derived state around preview/access:

- If preview loaded, messages are empty, and `postingAccess` is `needs-login` or `denied`, return `null`.
- If `postingAccess` is `unknown`, avoid rendering the empty prompt until access is known.
- Keep authenticated allowed users seeing the composer by default.

Do not reduce input text below 16px on mobile.

### 2. Extract provider access logic instead of hardcoding `user?.id && user?.email`

Create or reuse a small server helper, conceptually:

```ts
async function resolveVedurstofanProviderAccess({
  user,
  baseAccess,
}: {
  user: { id: string; email?: string | null } | null
  baseAccess: WeatherBaseAccess
}): Promise<boolean> {
  if (baseAccess.mode === 'blocked') return false

  const accessRequired =
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'

  if (!accessRequired) return true

  if (!user?.id || !user.email) return false
  return checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
}
```

Then `app/api/teskeid/weather/travel/route.ts` should use this helper instead of the current signed-in-only ternary.

This preserves the desired model:

- `WEATHER_ENABLED=All` opens base weather to public and authenticated.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` keeps Veðurstofan per-user.
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` graduates Veðurstofan to everyone who can access base weather, including public.

### 3. Check other Veðurstofan endpoints before claiming "public open"

The travel route is the obvious blocker. Claude Code should also check:

- `/api/teskeid/weather/vedurstofan/stations`
- `/api/teskeid/weather/vedurpuls/stations/[stationId]/preview`
- `/api/auth-mvp/vedurpuls/*`

The expected rule should be:

- forecast/station/pulse preview can be public if the provider is globally open,
- posting/manual refresh/full pulse route still requires login where already intended,
- no service-role-only product tables are exposed directly to clients.

## Localhost checks for Stebbi

After Claude Code changes this:

1. Set local env:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Open `/vedrid` signed out. Expected: MET/Yr works, Veðurstofan does not appear.

2. Change only:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false
```

Restart localhost. Open `/vedrid` signed out. Expected: Veðurstofan appears in route result.

3. Find a Veðurstofan station with no pulse messages while signed out. Expected: no "Nýjast af staðnum..." component appears at all.

4. Find a Veðurstofan station with messages while signed out. Expected: latest 3 messages/preview appear, but sending is not available without login.

5. Sign in as a normal user without `weather-provider-vedurstofan` row while provider access is `false`. Expected: Veðurstofan visible and composer available only if chat access rules allow it.

6. Set `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` again. Expected: only per-user allowlisted users see Veðurstofan.

7. Regression: public MET/Yr-only route must still work when Veðurstofan is restricted or unavailable.

## Production / Vercel checks

For current deployed code, to test if signed-in graduation works:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false
```

Then redeploy. Do not merely delete the variable.

For public Veðurstofan, do not expect env-only rollout to work until the travel API is changed and redeployed.

## Óvissa / þarf að staðfesta

- I reviewed local source, not production build output. If production differs from local main, verify the deployed commit.
- I did not run tests.
- The public Veðurstofan opening may need matching changes in tests to lock the new provider-access contract.
