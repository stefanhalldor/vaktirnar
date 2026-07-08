# TODO-069 v001 - Codex handoff - Admin Teskeið usage metrics

Created: 2026-07-08 13:56  
Timezone: Atlantic/Reykjavik  
Relevant TODO: #69 - Virkni per Teskeið í admin sýn

## Context

Stebbi asked to add a TODO and handoff for an upcoming implementation that puts activity per Teskeið into the admin view. First version should be as detailed as practical. For Veðrið/Ferðalagið, Stebbi specifically wants to measure how often new routes are calculated.

Codex created TODO #69 for this. This handoff is the implementation starting point for Claude Code when Stebbi later gives explicit execution approval.

Important boundary: this is a new analytics/usage package. It likely needs SQL, RLS, server helpers, admin API, admin UI, and tests. Do not implement it as a quick client-side counter.

## Current State

Existing analytics:

- `sql/24_analytics.sql`
- `app/api/analytics/route.ts`
- `app/api/admin/analytics/route.ts`
- `lib/teskeid/analytics.ts`
- `app/(admin)/admin/page.tsx`

This existing analytics is mostly public idea-bank tracking:

- event types: `page_view`, `vote`, `follow`, `submit`
- visitor identity: anonymous `visitor_hash`
- related object: optional `idea_id`
- admin stats: visitors, page views, votes, follows, submissions, top ideas, paths, devices, browsers, countries, referrers

That does not answer product-health questions for authenticated Teskeiðar:

- which Teskeiðs are used,
- how many authenticated users use each Teskeið,
- which product actions happen inside each Teskeið,
- how often Veðrið calculates route options,
- how many route-option calculations become final weather results,
- whether provider failures or route-fidelity features are affecting usage.

## Product Goal

Add an admin stats section for "Virkni per Teskeið".

The first version should make Veðrið/Ferðalagið especially measurable, while using a general event model that can later cover Minnið, Tengsl and Umönnun.

The admin view should answer, for a selected period:

- How many usage events happened per Teskeið?
- How many unique users used each Teskeið?
- For Veðrið, how many route option calculations happened?
- For Veðrið, how many distinct route pairs were calculated, without exposing locations?
- For Veðrið, how many final forecasts were requested and completed?
- How often does route selection turn into a completed final result?
- How often do provider/forecast failures happen?
- How often do curated route labels appear or get selected?

## Strong Privacy Rule

Do not store or expose raw:

- email,
- display name,
- phone number,
- formatted address,
- place name,
- Google Place ID,
- lat/lon,
- polyline,
- route points,
- full forecast payload,
- API keys or secrets.

This feature is for aggregated operational insight, not user surveillance.

## Recommended Architecture

Do not widen the public `analytics_events` table for this. Create a separate authenticated-app usage event table.

Suggested table name:

- `public.teskeid_usage_events`

Suggested migration number:

- likely `sql/71_teskeid_usage_events.sql`, because `sql/70_update_ready_card_descriptions.sql` already exists.

Do not run the migration unless Stebbi explicitly asks to run it.

## Suggested SQL Shape

Use an append-only event table with service-role writes/reads only.

Suggested columns:

```sql
CREATE TABLE IF NOT EXISTS public.teskeid_usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  event_name  text NOT NULL,
  path        text NOT NULL DEFAULT '',
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT teskeid_usage_events_feature_key_check CHECK (
    feature_key = lower(trim(feature_key))
    AND feature_key <> ''
    AND char_length(feature_key) <= 80
  ),
  CONSTRAINT teskeid_usage_events_event_name_check CHECK (
    event_name = lower(trim(event_name))
    AND event_name <> ''
    AND char_length(event_name) <= 120
  ),
  CONSTRAINT teskeid_usage_events_path_check CHECK (char_length(path) <= 500),
  CONSTRAINT teskeid_usage_events_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS teskeid_usage_events_created_idx
  ON public.teskeid_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_feature_created_idx
  ON public.teskeid_usage_events (feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_event_created_idx
  ON public.teskeid_usage_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS teskeid_usage_events_user_created_idx
  ON public.teskeid_usage_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
```

RLS/grants:

```sql
ALTER TABLE public.teskeid_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.teskeid_usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.teskeid_usage_events TO service_role;
```

Do not add authenticated policies. App routes should record events through server-side service-role helper after normal auth/feature access has passed.

## Feature Keys

Use stable product keys:

- `vedrid`
- `minnid`
- `tengsl`
- `umonnun`

Do not use display names as keys. Display labels can be mapped in admin UI.

## Server Helper

Add a server-only helper, likely:

- `lib/teskeid/usage.server.ts`

Suggested API:

```ts
type UsageFeatureKey = 'vedrid' | 'minnid' | 'tengsl' | 'umonnun'

type UsageEventInput = {
  userId: string
  featureKey: UsageFeatureKey
  eventName: string
  path?: string
  metadata?: Record<string, unknown>
}

export async function recordTeskeidUsageEvent(input: UsageEventInput): Promise<void>
```

Rules:

- `server-only`
- use `getAdmin()`
- sanitize metadata before insert
- silently fail, with only generic server log text such as `[usage] insert failed`
- never throw into user-facing flow
- do not log metadata
- do not accept arbitrary client-provided metadata without whitelisting

Metadata sanitizer should reject or strip:

- keys containing `email`, `name`, `address`, `lat`, `lon`, `place`, `polyline`, `forecast`, `secret`, `token`
- string values longer than a conservative cap, e.g. 200 chars
- nested arrays/objects unless intentionally whitelisted

Prefer explicit per-event metadata builders instead of a generic "pass body into metadata".

## Route Pair Fingerprint

For Veðrið, Stebbi wants to know how often new routes are calculated. There are two useful counts:

1. Total route calculation attempts.
2. Distinct route pairs calculated.

To count distinct route pairs without storing raw locations, add a helper:

- use HMAC with a server secret, e.g. `USAGE_EVENT_SECRET` or existing `VOTE_SECRET` only if no new secret is desired
- input should be a normalized origin/destination key
- never store origin/destination names, raw lat/lon, address or placeId

Possible normalization:

```ts
const originKey = `${origin.lat.toFixed(3)}:${origin.lon.toFixed(3)}`
const destKey = `${destination.lat.toFixed(3)}:${destination.lon.toFixed(3)}`
const pairKey = `${originKey}->${destKey}`
const routePairHash = hmac(pairKey)
```

`toFixed(3)` is roughly 100m precision in latitude and is still sensitive if exposed, so only store the HMAC, never the source key. If Claude Code thinks `toFixed(2)` is better for privacy, propose that tradeoff before implementation.

Admin should display only distinct count, not hashes.

## Veðrið Event Names

Instrument Veðrið first.

Recommended event names:

- `weather_route_options_requested`
- `weather_route_options_calculated`
- `weather_route_options_failed`
- `weather_final_forecast_requested`
- `weather_final_forecast_completed`
- `weather_final_forecast_failed`
- `weather_saved_place_created`
- `weather_saved_place_reused`
- `weather_saved_place_deleted`

Minimum v1 if scope needs to be smaller:

- `weather_route_options_calculated`
- `weather_route_options_failed`
- `weather_final_forecast_completed`
- `weather_final_forecast_failed`

But since Stebbi asked for a detailed first version, the full set above is preferable if tests stay manageable.

## Where to Instrument Veðrið

Route options endpoint:

- `app/api/teskeid/weather/travel/routes/route.ts`

Record:

- after auth + feature access + validation
- `weather_route_options_requested` before provider call, or only if the provider call is actually attempted
- `weather_route_options_calculated` when provider returns at least one route
- `weather_route_options_failed` when provider throws or returns zero routes

Safe metadata:

```ts
{
  routePairHash,
  provider: 'google',
  routeCount,
  usedOriginPlaceId: boolean,
  usedDestinationPlaceId: boolean,
  curatedRouteLabels: ['CURATED_VIA_THRENGSLAVEGUR'] // labels only, no location
}
```

Final travel endpoint:

- `app/api/teskeid/weather/travel/route.ts`

Record:

- `weather_final_forecast_requested` when selected/fallback route calculation starts
- `weather_final_forecast_completed` after `checkTravelWeather` returns
- `weather_final_forecast_failed` for route unavailable, selected route unavailable, forecast unavailable or unexpected provider/fetch failure

Safe metadata:

```ts
{
  routePairHash,
  selectedRouteProvided: boolean,
  selectedRouteMatched: boolean,
  routeDistanceBucketKm,
  routeDurationBucketMinutes,
  resultStatus: 'green' | 'caution' | 'red' // use actual result model if different
}
```

Saved places endpoints:

- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`

Record only if `sql/69_weather_saved_places.sql` has been run in the target environment. If the feature is still migration-pending, keep saved-place usage instrumentation behind the same safe code path as the endpoints and do not force production assumptions.

Do not store place names, addresses, lat/lon or place keys in usage metadata.

## Other Teskeið Event Names

Do not implement every feature immediately if it bloats the first pass, but design the table and admin aggregation to support these.

Minnið:

- `minnid_item_created`
- `minnid_item_returned`
- `minnid_return_undone`
- `minnid_invitation_sent`
- `minnid_invitation_accepted`
- `minnid_invitation_declined`
- `minnid_party_added`
- `minnid_role_switched`
- `minnid_chat_message_created`

Tengsl:

- `tengsl_relationship_created`
- `tengsl_relationship_updated`
- `tengsl_relationship_deleted`

Umönnun:

- keep key support, but show empty/unavailable state until there is actual web functionality to instrument.

## Admin API

Add a new admin endpoint instead of overloading the public idea analytics endpoint:

- `app/api/admin/teskeid-usage/route.ts`

Auth:

- `createClient()`
- `requireAdmin(supabase)`
- `getAdmin()` for querying usage table

Query params:

- `period`: reuse the same allowed periods as `/api/admin/analytics`
- `feature`: optional, one of supported feature keys
- maybe `event_name`: optional later

Response should be aggregated:

```ts
{
  summary: {
    total_events: number,
    unique_users: number,
    active_features: number,
    weather_route_calculations: number,
    weather_distinct_route_pairs: number,
    weather_final_forecasts: number,
    weather_route_to_result_conversion: number
  },
  features: [
    {
      feature_key: 'vedrid',
      label: 'Veðrið',
      total_events: number,
      unique_users: number,
      top_events: Record<string, number>
    }
  ],
  weather: {
    route_options_requested: number,
    route_options_calculated: number,
    route_options_failed: number,
    distinct_route_pairs: number,
    final_forecast_requested: number,
    final_forecast_completed: number,
    final_forecast_failed: number,
    route_to_result_conversion: number,
    route_count_buckets: Record<string, number>,
    curated_route_labels: Record<string, number>
  },
  events_over_time: Array<{ date: string, count: number }>
}
```

Do not return `user_id`, route pair hashes, metadata rows or raw event rows in v1.

## Admin UI

File:

- `app/(admin)/admin/page.tsx`

Existing admin page has tabs:

- ideas
- submissions
- stats

Recommended v1:

- Keep using the existing `stats` tab.
- Add a section below current summary cards called `Virkni per Teskeið`.
- Reuse existing period filter.
- Fetch `/api/admin/teskeid-usage?period=...` in parallel with `/api/admin/analytics?period=...` when stats tab is active.
- Add a loading state that does not block existing public analytics from loading.
- If usage table/API is empty, show a calm empty state.

UI content:

- Summary cards:
  - `Virkir notendur`
  - `Atburðir`
  - `Leiðarútreikningar`
  - `Niðurstöður í Veðrinu`
  - `Route -> niðurstaða`
- Feature breakdown:
  - `Veðrið`
  - `Minnið`
  - `Tengsl`
  - `Umönnun`
- Veðrið detail card:
  - `Leiðarmöguleikar sóttir`
  - `Leiðir reiknaðar`
  - `Distinct leiðapör`
  - `Mistókst`
  - `Lokaniðurstöður`
  - curated route label counts

Design notes from `Design.md`:

- Admin UI can be dense, but still needs mobile-first behavior.
- Avoid horizontal overflow in tables/cards at 360-460px.
- Use short labels and stable card heights.
- Status/color cannot be the only meaning.
- Loading/error states should be calm and not cause layout jump.
- Do not make this a marketing dashboard; it is an operational admin tool.

## Tests

SQL static tests:

- extend `lib/__tests__/sql-migration.test.ts` or create a focused usage SQL test
- table exists
- RLS enabled
- no anon/authenticated grants
- service_role has only needed grants
- metadata object check exists
- indexes exist
- user_id FK behavior is intentional

Server helper tests:

- successful insert uses `getAdmin().from('teskeid_usage_events').insert(...)`
- helper swallows insert failures
- helper strips disallowed metadata keys
- helper does not throw if metadata is undefined
- route pair fingerprint is deterministic
- route pair fingerprint changes when destination changes
- raw lat/lon/place names are not returned from helper

Admin API tests:

- 401 unauthenticated
- 403 non-admin
- 400 invalid period/feature
- 200 empty state
- aggregates by feature
- counts unique users
- computes weather route calculations
- computes distinct route pairs without returning hashes
- does not include raw metadata or user_id in response

Weather API tests:

- `POST /api/teskeid/weather/travel/routes` records calculated event on success
- records failed event when provider returns no routes
- records failed event when provider throws
- metadata includes route count and safe labels, not place names or coords
- `POST /api/teskeid/weather/travel` records final completed event on success
- records selected-route-unavailable/failure event safely
- usage helper failure does not change endpoint response

Admin page tests:

- stats tab fetches `/api/admin/teskeid-usage` once period is ready
- existing `/api/admin/analytics` behavior does not regress
- usage section renders empty state
- usage section renders Veðrið route calculation count
- period change refetches both analytics and usage data

Run:

- `npm run type-check`
- `npm run test:run`

Do not start dev server unless Stebbi explicitly asks.

## Rollout Plan

Recommended phases:

1. Schema + helper + tests.
2. Instrument Veðrið route options and final travel endpoint.
3. Add admin usage API with aggregate response.
4. Add admin stats UI section.
5. Optionally instrument saved-place endpoints only if migration 69 is active in target environment.
6. Later: instrument Minnið/Tengsl events after the Veðrið path is validated.

Do not try to instrument every existing action across the app in the first code pass if it makes the migration/review too broad. The key is to get the event table, helper, admin API and Veðrið metrics right.

## Security Review Checklist

Before implementation is considered ready:

- RLS enabled on usage table.
- No `anon` or `authenticated` access to usage table.
- Usage helper uses service role server-side only.
- Admin API uses `requireAdmin`.
- Client does not post arbitrary usage events directly in v1.
- Admin response does not expose user_id, emails, names, locations, route pair hashes, raw metadata or raw event rows.
- Weather metadata contains no address/place/coordinate/polyline/forecast fields.
- Usage insert failure cannot break user-facing Veðrið flow.
- No secrets in logs.
- No migration run without Stebbi's explicit approval.

## Localhost checks for Stebbi

After Claude Code implements this and the migration exists locally/test environment:

1. Open `/admin` as an admin user.
2. Open the stats tab.
3. Expected: current public analytics still appears.
4. Expected: new `Virkni per Teskeið` section appears.
5. If no usage events exist, expected: calm zero/empty state.
6. Open `/auth-mvp/vedrid` as a user with Veðrið access.
7. Select origin and destination so route options are calculated.
8. Return to `/admin`, choose `5 mín`.
9. Expected: Veðrið route calculation count increased.
10. Click `Nota þessa leið` in Veðrið and wait for final result.
11. Return to `/admin`, refresh/select `5 mín`.
12. Expected: final forecast completed count increased and route -> result conversion updates.
13. Repeat the same origin/destination.
14. Expected: total route calculations increases; distinct route pair count should not increase for the same pair.
15. Try a different origin/destination.
16. Expected: distinct route pair count increases.
17. Open browser devtools/network for `/api/admin/teskeid-usage`.
18. Expected: response contains aggregate counts only; no email, names, raw user IDs, place names, addresses, place IDs, lat/lon, polyline, route points or full metadata rows.
19. Test `/api/admin/teskeid-usage` as non-admin or signed-out.
20. Expected: no access.

Do not casually test this against production data until the migration, RLS, admin API and payload shape have been reviewed. Running the SQL migration or deploying it requires a separate explicit approval from Stebbi.

## Files to Inspect During Implementation

- `TODO.md`
- `Design.md`
- `sql/24_analytics.sql`
- `app/api/analytics/route.ts`
- `app/api/admin/analytics/route.ts`
- `app/(admin)/admin/page.tsx`
- `lib/teskeid/analytics.ts`
- `lib/teskeid/admin-auth.ts`
- `lib/supabase/admin.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/weather/saved-places/[id]/route.ts`
- `lib/__tests__/admin-page.test.tsx`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/sql-migration.test.ts`

## Commands Codex Ran While Preparing This Handoff

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 TODO.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Content -Encoding UTF8 Design.md`
- `rg -n "^#([0-9]+)|admin|stjórn|tölfræði|stats|analytics|event|usage|feature" TODO.md app components lib sql messages`
- `rg --files app components lib sql messages | rg "admin|stats|analytics|usage|feature|vedrid|weather"`
- `Get-ChildItem -Force ai-handoff | Sort-Object Name | Select-Object Name,Length`
- `Get-Content -Encoding UTF8 app/api/admin/analytics/route.ts`
- `Get-Content -Encoding UTF8 lib/teskeid/analytics.ts`
- `Get-Content -Encoding UTF8 sql/24_analytics.sql`
- `Get-Content -Encoding UTF8 app/api/analytics/route.ts`
- `Get-Content -Encoding UTF8 lib/teskeid/admin-auth.ts`
- `$p='app/(admin)/admin/page.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[115..165]; $c[235..335]; $c[1230..1405]`
- `Get-Content -Encoding UTF8 app/api/admin/feature-access/route.ts`
- `Get-Content -Encoding UTF8 sql/52_feature_access.sql; Get-Content -Encoding UTF8 sql/68_feature_access_vedrid.sql`
- `$p='app/(admin)/admin/page.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[0..120]`
- `rg -n "weather/travel|travel/routes|saved-places|trackEvent\\(|analytics" app components lib | Select-Object -First 200`
- `Get-ChildItem -File sql | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 12`
- `$c=Get-Content -Encoding UTF8 TODO.md; $c[800..910]`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Codex changed only:

- `TODO.md`
- this handoff file

Codex did not change app code, SQL migrations, tests, commits, push, deploy or production state.

## Open Questions

- Should v1 instrument only Veðrið, or should it also add Minnið event recording in the same pass? Codex recommends Veðrið first plus schema support for all Teskeiðar.
- Should route pair fingerprint use coordinate rounding at `toFixed(2)` or `toFixed(3)` before HMAC? More precision improves distinct-pair accuracy; less precision improves privacy.
- Should a new secret `USAGE_EVENT_SECRET` be introduced, or reuse `VOTE_SECRET`? A dedicated secret is cleaner but adds env/deploy coordination.
- Should admin UI show all Teskeiðar in the current stats tab, or get a fourth top-level tab later? Codex recommends current stats tab for v1.

Confidence: high on the overall architecture; medium on exact schema details until Claude Code checks current Supabase migration conventions and test helpers.
