# v213 — Env cleanup handoff for weather flags

Created: 2026-07-15 13:27  
Timezone: Atlantic/Reykjavik  
TODO: 086 — Veðurstofan / ferðaveður provider work

## Goal

Make `.env.local` and Vercel env easier to understand before release:

- everyone, signed in and public, should see base MET/Yr weather
- only selected per-user users should see Veðurstofan
- Vegagerðin remains visible only as upcoming/disabled where the UI supports it
- remove legacy/dead env vars that make the state ambiguous

This is an env-cleanup handoff only. Codex did not edit `.env.local`, Vercel, Supabase, code, or migrations.

## Current Conclusion

Claude Code and Codex agree on the core cleanup:

1. Remove dead/legacy weather vars:
   - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
2. Rename:
   - remove `WEATHER_FLAG`
   - add `WEATHER_AUTH_ACCESS_REQUIRED=true`
3. Keep the rest of the active weather vars unless Stebbi intentionally wants to disable a specific hidden/prototype flow.

## Exact `.env.local` Weather Block Recommended

Use this as the target local weather block:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
CRON_SECRET=...
```

Remove these from `.env.local`:

```env
WEATHER_FLAG=true
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
```

Important: do **not** remove `WEATHER_FLAG=true` until `WEATHER_AUTH_ACCESS_REQUIRED=true` is present. If both are absent, authenticated `/auth-mvp/vedrid` access graduates open to all logged-in users.

## Meaning of Each Kept Weather Var

### `WEATHER_ENABLED=true`

Global weather master switch.

If false/missing:

- `/vedrid` public page is unavailable
- weather travel APIs return unavailable/not found
- place search now also closes because of the v211 fix
- Veðurstofan cron/refresh/freshness routes are blocked

Keep.

### `WEATHER_PUBLIC_ENABLED=true`

Allows public/signed-out users and signed-in users without `vedrid` to use base MET/Yr weather.

This is what Stebbi wants for release: everyone can see current MET/Yr.

Keep.

### `WEATHER_AUTH_ACCESS_REQUIRED=true`

New descriptive replacement for legacy `WEATHER_FLAG=true`.

Meaning:

- `/auth-mvp/vedrid` authenticated/private weather app remains per-user gated by `feature_access.feature_key = 'vedrid'`
- signed-in users without `vedrid` can still use the public `/vedrid` base MET/Yr flow when `WEATHER_PUBLIC_ENABLED=true`

Keep and use instead of `WEATHER_FLAG`.

### `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`

Controls Veðurstofan provider access.

Meaning:

- `true` or unset = Veðurstofan requires per-user access with `feature_key = 'weather-provider-vedurstofan'`
- `false` = Veðurstofan provider graduates to all weather users

For now Stebbi wants Veðurstofan **per-user only**, so keep this as:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

Note: default is restricted if absent, but setting it explicitly avoids ambiguity.

### `WEATHER_ELTA_VEDRID_FLAG=true`

Enables the hidden/validation `Elta veðrið` station explorer feature through per-user access.

Keep locally if Stebbi still wants to test station validation. In production, only keep if the feature should exist behind per-user access.

### `WEATHER_TRIP_FLAG=true`

Enables the hidden/prototype `ferdalagid` feature access path.

Keep locally if Stebbi/Claude Code are still testing the future trip flow. If not actively needed in production, this can remain absent there.

### `WEATHER_AI_ENABLED=false`

AI weather answers are off unless exactly `true`.

This can be removed with same effect as false, but keeping it explicitly false is useful because it documents “no AI cost”.

### `METNO_USER_AGENT`

Required good citizenship for MET Norway/met.no calls.

Keep.

### `WEATHER_MAP_PROVIDER=google`

Selects Google as route/geocode provider.

Keep if using Google Maps.

### `GOOGLE_MAPS_SERVER_KEY`

Server-side Google route/geocode key.

Keep.

### `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

Browser-side Google Maps key for map display/client features.

Keep.

### `CRON_SECRET`

Protects cron endpoints such as `/api/cron/warm-vedurstofan`.

Keep in local and Vercel. Do not expose publicly.

## Removed / Replaced Vars

### `WEATHER_FLAG`

Legacy alias only.

Still read by `lib/loans/guard.ts` only when `WEATHER_AUTH_ACCESS_REQUIRED` is absent, but the new var wins when present.

Replace with:

```env
WEATHER_AUTH_ACCESS_REQUIRED=true
```

Then remove:

```env
WEATHER_FLAG=true
```

### `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`

No longer read by code for behavior.

`lib/loans/guard.ts` explicitly documents that this legacy var is no longer read and should be removed after deploy verification.

Remove.

### `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

No active source-code references found.

Remove.

## Non-Weather Vars from Stebbi’s List

Do not remove these unless intentionally disabling the underlying feature/service:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VOTE_SECRET
AUTH_CODE_SECRET
UNSUBSCRIBE_SECRET
RESEND_API_KEY
NEXT_PUBLIC_SITE_URL
ADMIN_EMAILS
EMAIL_FROM
REPLY_TO
AUTH_MVP_ENABLED
LOANS_ENABLED
UMONNUN_ENABLED
TENGSL_ENABLED
TENGSL_FLAG
```

`UMONNUN_FLAG=false` is optional: removing it behaves like false in current code, meaning Umönnun is open to all logged-in users when `UMONNUN_ENABLED=true`. Keeping it explicit is okay if Stebbi finds it clearer.

## Suggested Vercel Env Target

For the first production release state Stebbi described:

```env
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_AI_ENABLED=false
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
CRON_SECRET=...
```

Optional in production, depending on whether Stebbi wants hidden testing affordances available:

```env
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
```

Remove from Vercel after deploy verification:

```env
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

## Expected Behavior After Cleanup

### Public / signed-out users

- Can open `/vedrid`
- Can search places
- Can get base MET/Yr travel weather
- Cannot see Veðurstofan
- Cannot access private `/auth-mvp/vedrid` app

### Signed-in user without `vedrid`

- Can use public/base MET/Yr behavior
- Is treated as public tier for base weather APIs
- Cannot see Veðurstofan
- Cannot access `/auth-mvp/vedrid` private app

### Signed-in user with `vedrid`

- Can access `/auth-mvp/vedrid`
- Can use base weather authenticated mode
- Still cannot see Veðurstofan unless also has `weather-provider-vedurstofan`

### Signed-in user with `vedrid` + `weather-provider-vedurstofan`

- Can access private weather
- Can see/test Veðurstofan provider layer

## Safety Notes

- Do not paste real secret values into handoff files, Git, screenshots, or chat logs.
- Env changes in Vercel affect production immediately after redeploy/runtime pickup, depending on Vercel behavior and route type.
- Changing `WEATHER_AUTH_ACCESS_REQUIRED` or `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` can change who sees private weather or Veðurstofan.
- Removing `WEATHER_FLAG` is safe only after `WEATHER_AUTH_ACCESS_REQUIRED=true` is present.

## Localhost Checks for Stebbi

After changing `.env.local`, restart localhost and verify:

1. Logged out:
   - Open `/vedrid`.
   - Search for a route.
   - Expected: MET/Yr weather works, no Veðurstofan controls or Veðurstofan points.
2. Logged in as a user without `vedrid`:
   - Open `/vedrid`.
   - Expected: same as public/base MET/Yr; no Veðurstofan.
   - Open `/auth-mvp/vedrid`.
   - Expected: blocked/redirected because `WEATHER_AUTH_ACCESS_REQUIRED=true`.
3. Logged in as Stebbi or another user with `vedrid`:
   - Open `/auth-mvp/vedrid`.
   - Expected: private weather app works.
4. Logged in as user with both `vedrid` and `weather-provider-vedurstofan`:
   - Expected: Veðurstofan provider appears and can be toggled/tested.
5. Temporarily set `WEATHER_PUBLIC_ENABLED=false` locally:
   - Expected: public/signed-out base weather is blocked.
6. Temporarily set `WEATHER_ENABLED=false` locally:
   - Expected: weather route, place search fallback, and Veðurstofan refresh/freshness endpoints are unavailable.

Do not do Vercel env cleanup during casual localhost testing unless Stebbi is explicitly ready to affect production configuration.

## Recommended Next Step

Stebbi can update `.env.local` first:

1. Add `WEATHER_AUTH_ACCESS_REQUIRED=true`.
2. Add or keep `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
3. Remove `WEATHER_FLAG`.
4. Remove `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.
5. Remove `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`.
6. Restart localhost.
7. Run the localhost checks above.

After localhost matches the expected behavior, mirror the cleanup in Vercel carefully.
