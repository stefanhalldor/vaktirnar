# 2026-07-16 07:07 - Codex review: v297 production test follow-up

Created: 2026-07-16 07:07  
Timezone: Atlantic/Reykjavik  
Related TODO: todo-086  
Reviewed handoff: `2026-07-16-0659-todo-086-v297-claude-v296-done-released.md`

## Findings

### High - Public users can see "Sækja ný gögn" even though refresh endpoint requires auth

Observed in production: public user sees the stale Veðurstofan banner and can click `Sækja ný gögn`, then gets an error.

Code confirms the UI only checks freshness/refresh state:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:989-997` calculates `showVedurstofanRefreshButton`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1090-1097` renders the button

The API is correctly protected:

- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:37-43` requires a signed-in user and `weather-provider-vedurstofan` access

So this is a UI gate bug, not a backend data-security issue. The button should only render for signed-in users who can actually call the refresh endpoint. Public users may see stale-data status, but not a dead/manual action.

Recommended fix:

- Add an explicit client-side capability flag for manual refresh.
- Minimum: include `!isGuest` in `showVedurstofanRefreshButton`.
- Better: derive `canManualRefreshVedurstofan` from authenticated/provider access, because signed-in users may still lack refresh access depending on provider gating.
- The endpoint remains the source of truth.

### Medium - `/vedrid` route-selection map zoom was not the same map as `/elta-vedrid`

Stebbi's production screenshot shows the map on the first/route-selection step of `/vedrid`, not the station explorer map in `/auth-mvp/vedrid/elta-vedrid`.

Relevant code:

- `components/weather/RouteSelectionStep.tsx:126-129` initializes Google map with `zoom: 6`
- `components/weather/RouteSelectionStep.tsx:247-251` fits selected origin/destination bounds or zooms to single point

Prior zoom polish seems to have hit `/elta-vedrid`, not this route-selection component. Apply the same "one zoom level out / see all Iceland" intent here too.

Recommended fix:

- For initial map in `RouteSelectionStep`, use the same Iceland overview defaults that made `/elta-vedrid` look right.
- Also review the `fitBounds(..., { top: 48, bottom: 48, left: 48, right: 48 })` padding on mobile. It may still over-focus the route after origin+destination are selected.
- Test route-selection step separately from result map.

### Medium - Deleting `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is not enough to see Veðurpúls

Current v297 code changed Veðurstofan provider access so:

- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` = provider is per-user gated
- unset/deleted = provider open to all weather users

This part is visible in:

- `lib/loans/guard.ts:93-101`
- `app/api/teskeid/weather/travel/route.ts:335-348`

But Veðurpúls has additional gates in `lib/chat/access.server.ts:29-46`:

1. signed-in user with email
2. `TESKEID_CHAT_ENABLED=true`
3. weather base access
4. Veðurstofan provider access
5. `weather-pulse` access unless `WEATHER_PULSE_ACCESS_REQUIRED=false`

So if Stebbi is signed in and still does not see Veðurpúls, likely causes are:

- Vercel env deletion happened after deployment and needs redeploy.
- `TESKEID_CHAT_ENABLED` is missing or not `true` in Vercel.
- `WEATHER_PULSE_ACCESS_REQUIRED` is unset/`true`, and the signed-in user does not have a `weather-pulse` feature_access row.

To open Veðurpúls composer for all signed-in users who can see Veðurstofan:

```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=false
```

Then redeploy.

If the intent is "Veðurpúls is only for selected testers", keep `WEATHER_PULSE_ACCESS_REQUIRED=true` or unset, and add the user to the `weather-pulse` feature access list.

### Low - v297 shipped despite noting push happened without explicit permission

The handoff says:

> Claude pushed without explicit permission. Stebbi allowed it to stand this time.

Since this already shipped and Stebbi allowed it to stand, this is not a technical rollback recommendation. But for next turns, keep the hard-stop rule strict: handoff/review and "flott" are not deploy permission.

## Direct answers for Stebbi

### Why did public see the refresh button?

Because the UI currently renders the button based on stale-data state, not auth/refresh capability. The endpoint rejects public users correctly, but the UI should not show the action.

### Why does signed-in user not see Veðurpúls after deleting `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`?

Because Veðurpúls is not controlled only by that variable. It also needs:

```env
TESKEID_CHAT_ENABLED=true
```

and either:

```env
WEATHER_PULSE_ACCESS_REQUIRED=false
```

or a per-user `weather-pulse` feature_access row.

Also, Vercel env changes require redeploy before the active deployment sees them.

### What env should be used if Veðurstofan is open but Veðurpúls posting is only signed-in and open?

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
# WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED absent/deleted
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=false
```

Public users:

- can see Veðurstofan layer
- can see existing pulse previews
- cannot post
- should not see the empty pulse component
- should not see manual refresh button

Signed-in users:

- can see Veðurstofan layer
- can see and post Veðurpúls
- can manually refresh only if that is intentionally allowed by backend access rules

## Recommended next Claude Code task

1. Hide manual Veðurstofan refresh action for public users.
2. Make route-selection map on `/vedrid` use the same zoom/overview intent as `/elta-vedrid`.
3. Confirm/document the Veðurpúls Vercel env contract:
   - `TESKEID_CHAT_ENABLED=true`
   - `WEATHER_PULSE_ACCESS_REQUIRED=false` for open-to-signed-in
   - or per-user `weather-pulse` rows for tester-only
4. Add/adjust tests:
   - public stale banner does not render refresh button
   - public Veðurstofan open env returns layer but no manual refresh affordance
   - signed-in with provider open + pulse open sees composer
   - signed-in with provider open but pulse gated/missing does not see composer

## Localhost checks for Stebbi

After Claude Code fixes:

1. Run with Veðurstofan open:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=false
```

and no `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`.

2. Open `/vedrid` signed out. Expected:
   - Veðurstofan can appear.
   - Stale banner may appear.
   - `Sækja ný gögn` is not visible.
   - Empty Veðurpúls preview is hidden.

3. Open `/vedrid` signed in. Expected:
   - Veðurstofan can appear.
   - Veðurpúls composer appears on Veðurstofan station cards.
   - Existing previews show latest messages.

4. On `/vedrid` first route-selection step, check the map before selecting route and after selecting origin/destination. Expected:
   - map is zoomed out enough to see Iceland/useful context,
   - no horizontal overflow,
   - controls remain usable on mobile width.

5. Regression: set `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` and redeploy/restart locally. Public users should not see Veðurstofan.

## Óvissa / þarf að staðfesta

- I reviewed local code and the v297 handoff, not Vercel runtime env values.
- If Stebbi changed Vercel env after the current deployment, redeploy is required before diagnosing behavior as code failure.
- I did not run tests.
