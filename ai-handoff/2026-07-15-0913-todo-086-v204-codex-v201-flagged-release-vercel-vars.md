# TODO 086 v204 - Codex handoff: flagged release and Vercel variables

Created: 2026-07-15 09:13 Atlantic/Reykjavik  
Author: Codex  
Source context: review after `2026-07-15-0900-todo-086-v201-claude-prerelease`

## Purpose

This handoff confirms how to release the current Veðrið / Veðurstofan work safely under flags, and lists the Vercel environment variables that must be present so the production behavior is predictable.

No code, SQL, migration, commit, push, deploy, or production change was performed by Codex in this step. This is a handoff/release-readiness note only.

## Codex recommendation

It is okay to release the v201 fix under flags, as long as production stays gated exactly as described below.

Do not release this as a public or fully global weather launch yet. Veðurstofan should remain available only to users who have the per-user feature access row for the provider.

The intended production posture right now should be:

- Weather feature exists in production, but is gated per user.
- MET/Yr can be tested by users with `vedrid` access.
- Veðurstofan provider can be tested only by users with both `vedrid` and `weather-provider-vedurstofan` access.
- Public/guest weather should remain off unless Stebbi intentionally decides otherwise.
- Vegagerðin is still not live as a provider.

## v201 review summary

Claude v201 appears to fix the immediate bug where selected/worst met.no cards could show `Ófullnægjandi gögn` while the same point was correctly classified in the all-points list.

Codex noted one follow-up risk:

- The selected/worst card and all-points rows now use a better `hasData` concept, but the map marker and status-count paths still appear to have separate status logic. This is acceptable for this release if the visible bug is fixed, but before adding Vegagerðin the next cleanup should centralize provider status/card classification so all contexts agree:
  - worst point
  - selected point
  - all-points list
  - map marker colors
  - status-count chips under the map

## Feature flag contract

### Weather master switch

`WEATHER_ENABLED=true`

This is the master kill switch for the weather feature. If this is false or missing, weather endpoints/pages should be off or skipped.

### Per-user gate for Veðrið

`WEATHER_FLAG=true`

This must be true in production if Veðrið should be per-user gated.

With current guard logic:

- `WEATHER_ENABLED=true` and `WEATHER_FLAG=true`: user must have `feature_access.feature_key = 'vedrid'`.
- `WEATHER_ENABLED=true` and `WEATHER_FLAG` false/missing: weather is open to all authenticated users.

So for a safe release, production should have:

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
```

And Supabase should contain `feature_access` rows only for the intended testers:

```text
feature_key = vedrid
```

### Public/guest weather

`WEATHER_PUBLIC_ENABLED` should be false or absent for this release.

Important: if `WEATHER_PUBLIC_ENABLED=true`, the public `/vedrid` route and guest travel-weather API path are opened. That is not the desired "under flag" release.

Recommended production value:

```env
WEATHER_PUBLIC_ENABLED=false
```

or remove it from Vercel entirely if the code treats missing as false.

### Veðurstofan provider gate

`WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`

This is the global provider switch for Veðurstofan. It does not by itself make Veðurstofan visible to everyone, because the provider route also checks per-user access.

For an allowed user to see/use Veðurstofan, both must be true:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
```

and the user must have:

```text
feature_key = weather-provider-vedurstofan
```

This is the right current model: Veðurstofan remains under a provider-specific per-user flag while it is still being validated.

### Elta veðrið validation view

`WEATHER_ELTA_VEDRID_FLAG=true`

This gates the separate Elta veðrið validation/explorer view together with:

```text
feature_key = elta-vedrid
```

This is not required for the main travel-weather result page, but should be set if Stebbi still needs the validation view in production.

### Ferðalagið / trip affordance

`WEATHER_TRIP_FLAG=true`

This gates the trip-related feature key:

```text
feature_key = ferdalagid
```

This is separate from plain weather access. Keep it true only if the current product flow expects the trip affordance to be available for selected users.

### Obsolete/no-op variable

`VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

Codex found no current code references to this variable. It should not be relied on as a real production flag.

Recommendation:

- Remove it from Vercel to avoid false confidence.
- Do not document it as a control switch unless code intentionally reintroduces it.

### AI cost switch

`WEATHER_AI_ENABLED=false`

Keep this false or absent unless Stebbi explicitly wants AI weather behavior and accepts possible cost.

## Vercel environment variables checklist

### Required app/auth variables

These must exist for normal auth/app operation:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://teskeid.is
AUTH_MVP_ENABLED=true
ADMIN_EMAILS=...
AUTH_CODE_SECRET=...
UNSUBSCRIBE_SECRET=...
RESEND_API_KEY=...
EMAIL_FROM=...
REPLY_TO=...
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed client-side.
- `NEXT_PUBLIC_SITE_URL` should be the production URL in production, not localhost.
- Email/auth secrets are outside the weather feature, but login and admin workflows depend on them.

### Required for MET/Yr weather

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
```

Optional:

```env
ENABLE_REVERSE_GEOCODE=false
WEATHER_AI_ENABLED=false
```

### Required for Veðurstofan provider

```env
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
CRON_SECRET=...
```

Plus the same:

```env
SUPABASE_SERVICE_ROLE_KEY=...
WEATHER_ENABLED=true
```

Supabase prerequisites:

- SQL 74 product tables have been applied.
- SQL 75 fetch-run metadata has been applied.
- SQL 76 feature key migration has been applied.
- SQL 77 history table has been applied.
- `vedurstofan_stations` has been seeded.
- Intended testers have `feature_access.feature_key = 'weather-provider-vedurstofan'`.

Do not rerun SQL 77 if `select to_regclass('public.vedurstofan_forecasts_history')` already returns the table name, unless a later migration explicitly requires it.

### Optional validation/trip flags

Only set these if the corresponding per-user access rows are intentionally managed:

```env
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
```

Expected Supabase feature keys:

```text
elta-vedrid
ferdalagid
```

### Recommended disabled/absent for this release

```env
WEATHER_PUBLIC_ENABLED=false
WEATHER_AI_ENABLED=false
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=
```

`VEDURSTOFAN_TRAVEL_LAYER_ENABLED` can simply be deleted from Vercel because current code does not use it.

## Feature access rows needed

For Stebbi/test users who should see the full current weather work:

```text
vedrid
weather-provider-vedurstofan
```

If they should also see the validation/explorer page:

```text
elta-vedrid
```

If they should see trip-related affordances:

```text
ferdalagid
```

Future chat feature:

```text
weather-station-chat
```

Only add this once the chat migration/API/UI is implemented. It should not be required for the current release.

## Cron behavior to verify

`vercel.json` currently schedules:

```text
/api/cron/warm-vedurstofan  */10 * * * *
```

The route requires:

```http
Authorization: Bearer <CRON_SECRET>
```

Production verification must include Vercel Cron logs after deploy:

- Expected success: `200` with a JSON response containing counts like `fresh`, `unavailable`, `projected`, `errors`, `projectionRunId`.
- Expected failure if auth is wrong: `401`.

If Vercel cron does not send the bearer token as expected, the job will not warm data even though the schedule exists. In that case the route/auth strategy needs to be adjusted before trusting production freshness.

Manual refresh can still work for authorized users, but cron should be healthy before this is opened wider.

## Release order

1. Set/confirm Vercel Production env vars from this checklist.
2. Remove or explicitly set false for `WEATHER_PUBLIC_ENABLED`.
3. Remove `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` from Vercel, or at minimum do not treat it as a real flag.
4. Confirm Supabase migrations 74-77 are applied.
5. Confirm `feature_access` rows for Stebbi/testers:
   - `vedrid`
   - `weather-provider-vedurstofan`
   - optional `elta-vedrid`
   - optional `ferdalagid`
6. Deploy.
7. Check Vercel Cron logs for `/api/cron/warm-vedurstofan`.
8. Run the localhost/production smoke checks below.

## Localhost checks for Stebbi

Use a user that has `vedrid` and `weather-provider-vedurstofan`.

1. Open `/auth-mvp/vedrid`.
2. Confirm the weather page loads.
3. Toggle MET/Yr only.
   - Expected: met.no points/cards classify consistently under the map, worst point, selected point, and all-points list.
   - Regression to watch: selected/worst card should not show `Ófullnægjandi gögn` when all-points and map chips say `Nálgast óþægindi` or `Óþægilegt`.
4. Toggle Veðurstofan on.
   - Expected: Veðurstofan appears as its own provider/layer, not merged into met.no points.
   - Expected: Veðurstofan remains labeled as in testing.
5. Log in as a user with `vedrid` but without `weather-provider-vedurstofan`.
   - Expected: the user can use MET/Yr weather but should not see/use Veðurstofan.
6. Log in as a user without `vedrid` while `WEATHER_FLAG=true`.
   - Expected: no weather access.
7. Test public `/vedrid` only if `WEATHER_PUBLIC_ENABLED=false`.
   - Expected: public/guest access should not be open.
8. In Vercel after deploy, open Cron logs for `/api/cron/warm-vedurstofan`.
   - Expected: `200`, not `401`.
   - Do not expose `CRON_SECRET` in screenshots or handoffs.

## Risks still open

- Map/status-count provider classification should still be centralized before Vegagerðin, even if v201 fixed the selected/worst met.no label bug.
- Cron bearer-token behavior must be confirmed in Vercel logs after deploy.
- Veðurstofan remains under validation. Keep `weather-provider-vedurstofan` per-user until Stebbi explicitly decides it is ready for broader release.
- Public guest weather should stay off for now to avoid unintentionally opening the feature to everyone.

## Commands run by Codex for this handoff

Read-only inspection only:

- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- Read snippets from:
  - `lib/loans/guard.ts`
  - `.env.example`
  - `app/auth-mvp/vedrid/page.tsx`
  - `app/vedrid/page.tsx`
  - `app/api/teskeid/weather/travel/route.ts`
  - `app/api/teskeid/weather/vedurstofan/freshness/route.ts`
  - `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
  - `app/api/cron/warm-vedurstofan/route.ts`
  - `vercel.json`

No tests were run for this handoff because it is release guidance and env/flag verification, not an implementation change.
