# TODO 069 - Count public weather route calculations in admin usage metrics

Created: 2026-07-10 23:44  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Handoff / implementation plan for Claude Code  
Related TODO: #69 Virkni per Teskeið í admin sýn  
Related recent work:

- `2026-07-10-1348-todo-046-v003-codex-open-weather-care-auth-friction-handoff.md`
- `2026-07-10-1403-todo-046-v006-codex-stebbi-decisions-public-weather-go.md`
- `2026-07-10-1425-todo-046-v007-claude-v006-done-prerelease.md`

Status: Planning/handoff only. No implementation approval implied by this file.

## Context

Public Veðrið is now enabled behind `WEATHER_PUBLIC_ENABLED`. In Phase 1 we deliberately skipped guest usage events. That was fine for launch speed, but Stebbi now wants the admin dashboard to show how many route calculations public users are doing.

This matters because:

- public route option calls are the Google-costly part of the public weather flow;
- Stebbi needs to know if opening Veðrið is working as acquisition/funnel;
- route calculation volume should be visible even when users are not logged in;
- admin needs a split between authenticated and public usage, not one blended number that hides adoption.

## Findings

### P1 - Public route option calculations are not currently counted

In `app/api/teskeid/weather/travel/routes/route.ts`, usage events are only recorded inside `if (user)` blocks.

Current behavior:

- authenticated success records `weather_route_options_calculated`;
- authenticated provider failure/no-routes records `weather_route_options_failed`;
- guest success/failure records nothing;
- guest rate limit also records nothing.

This means the admin dashboard undercounts Veðrið as soon as unauthenticated/public users start using it.

### P2 - The existing usage table already supports anonymous events

`sql/71_teskeid_usage_events.sql` defines:

```sql
user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
```

There is no `NOT NULL`, so `user_id = null` is already allowed. The service-role insert grant also already covers insert/select.

Therefore this likely does **not** need a new SQL migration.

The likely code-level blocker is just TypeScript:

```ts
type UsageEventInput = {
  userId: string
  ...
}
```

in `lib/teskeid/usage.server.ts`.

### P2 - Admin currently treats unique users as authenticated users only

`app/api/admin/teskeid-usage/route.ts` computes:

```ts
const uniqueUsers = new Set(events.map(e => e.user_id).filter(Boolean)).size
```

That is still correct for "Virkir notendur" if we want it to mean logged-in users only. But once guest events are added, admin needs explicit guest/public counts so Stebbi does not misread the totals.

### P2 - Distinct route pairs can still be counted privacy-safely

`routePairFingerprint()` creates an HMAC of rounded coordinates using `USAGE_EVENT_SECRET` and returns `null` if the secret is missing.

That is acceptable for guest route pair aggregation as long as:

- raw coordinates are never stored;
- raw place IDs are never stored;
- names, addresses, place IDs, polylines and forecast payloads remain blocked by `sanitizeUsageMetadata`;
- admin does not expose hashes.

If `USAGE_EVENT_SECRET` is missing, distinct route-pair count should continue to degrade calmly with the existing note.

## Product Decision

Count public route calculations in admin.

Recommended framing:

- Keep existing high-level "Leiðarútreikningar" as total route calculations.
- Add clear split:
  - `Innskráðir`
  - `Public / óinnskráðir`
- Consider a separate "Public rate limit" count so Stebbi can see how often users hit the 5 trips/IP/day ceiling.

Do **not** store IP address, IP hash, user agent, email, names, place names, addresses, place IDs, raw coordinates, polylines or forecast payloads in usage events.

## Recommended Event Model

Reuse existing feature key:

```ts
featureKey: 'vedrid'
```

Use existing event names for route calculations:

```ts
weather_route_options_calculated
weather_route_options_failed
```

For guest/public events:

```ts
userId: null
metadata: {
  actor: 'guest',
  provider: 'google',
  routeCount,
  routePairHash, // only when available
  originIdPresent,
  destinationIdPresent,
  curatedRouteLabels,
}
```

For authenticated events, add equivalent actor metadata:

```ts
metadata: {
  actor: 'authenticated',
  ...
}
```

This makes the admin split robust without inferring guest/auth solely from `user_id`.

Optional but recommended:

```ts
weather_route_options_rate_limited
```

Record this when guest route options hit the IP/day limit. Metadata should be minimal:

```ts
{
  actor: 'guest'
}
```

Do not store IP or hashed IP in usage events. The rate-limit storage can stay wherever `checkWeatherGuestRateLimit` already keeps it.

## Implementation Plan

### 1. Update usage helper type only as much as needed

File:

- `lib/teskeid/usage.server.ts`

Change:

```ts
userId: string
```

to:

```ts
userId: string | null
```

Keep `recordTeskeidUsageEvent()` non-throwing.

Do not loosen `sanitizeUsageMetadata`. If anything, add tests that prove `actor` survives and sensitive keys are still stripped.

### 2. Record guest route option events

File:

- `app/api/teskeid/weather/travel/routes/route.ts`

After validation and after `routePairHash` is calculated, record:

- success for all users, with `userId: user?.id ?? null`;
- provider throw failure for all users, with `userId: user?.id ?? null`;
- provider returns zero routes failure for all users, with `userId: user?.id ?? null`.

Important: do not record usage events before auth/feature/public flag checks. A rejected unauthenticated request when `WEATHER_PUBLIC_ENABLED !== 'true'` should not become an event.

Suggested local helper inside the route handler to avoid duplicated object construction:

```ts
const actor = user ? 'authenticated' : 'guest'
const userId = user?.id ?? null
```

Then pass metadata through existing sanitizer.

### 3. Record guest rate-limited attempts separately

File:

- `app/api/teskeid/weather/travel/routes/route.ts`

When:

```ts
if (!withinLimit) return 429
```

Consider recording:

```ts
weather_route_options_rate_limited
```

with:

```ts
userId: null,
featureKey: 'vedrid',
path: '/api/teskeid/weather/travel/routes',
metadata: { actor: 'guest' }
```

This is useful because otherwise a public user hitting the limit looks invisible. It is not a Google route calculation, so do not include it in `weather_route_calculations`.

### 4. Update admin aggregation

File:

- `app/api/admin/teskeid-usage/route.ts`

Add counts:

```ts
weather_route_calculations_authenticated
weather_route_calculations_public
weather_route_options_failed_authenticated
weather_route_options_failed_public
weather_route_options_rate_limited_public
```

Derive with:

- authenticated: `event.user_id` truthy, or `metadata.actor === 'authenticated'`;
- public: `event.user_id === null`, or `metadata.actor === 'guest'`;

Prefer using `metadata.actor` when present, but keep null-user fallback for compatibility.

Keep:

```ts
weather_route_calculations
```

as total count to avoid breaking the existing UI/tests.

Also add:

```ts
public_route_to_result_conversion
authenticated_route_to_result_conversion
```

only if final forecast events are also recorded for guests. If final forecast events remain authenticated-only, do **not** present split conversion yet; it will mislead Stebbi.

### 5. Decide whether to count public final forecast results now

File:

- `app/api/teskeid/weather/travel/route.ts`

This route also records `weather_final_forecast_completed` and `weather_final_forecast_failed`, but currently only for authenticated users.

Recommendation:

- In this handoff, the primary task is route calculation count.
- But for a truthful funnel, Claude Code should either:
  - also record public final forecast completed/failed with `userId: null`, or
  - explicitly keep conversion as authenticated-only in the UI label.

Codex preference: record public final forecast completed/failed too, using the same privacy-safe metadata rules, because public users can now complete the flow and Stebbi should see route-options -> final-result conversion for guests later.

Do not add extra rate limit increments to final forecast. The existing product decision was that only `/travel/routes` is the Google-cost path for guest limit.

### 6. Update admin UI

File:

- `app/(admin)/admin/page.tsx`

Add a small breakdown inside "Veðrið - leiðarútreikningar":

- `Alls`
- `Innskráðir`
- `Public`
- `Mistókst`
- `Public stoppaðir af rate limit` if implemented

Do not make this visually loud. This is an admin dashboard, so clarity matters more than decoration.

Suggested wording:

- `Leiðir reiknaðar alls`
- `Innskráðir`
- `Óinnskráðir`
- `Mistókst`
- `Stoppað af public takmörkun`

If top summary cards are updated, avoid making five or six cards wrap awkwardly on mobile. Admin UI still needs to be readable on mobile per `Design.md`.

### 7. Tests

Update/add tests:

- `lib/__tests__/teskeid-usage.test.ts`
  - accepts `userId: null`;
  - metadata sanitizer keeps `actor`;
  - sensitive keys remain stripped.

- `lib/__tests__/weather-routes-api.test.ts`
  - guest success records `weather_route_options_calculated` with `userId: null`;
  - guest provider failure records `weather_route_options_failed` with `userId: null`;
  - guest rate limited records `weather_route_options_rate_limited` if implemented;
  - request blocked because `WEATHER_PUBLIC_ENABLED !== 'true'` does not record usage;
  - event metadata does not contain names, coords, place IDs, addresses or polylines.

- `lib/__tests__/teskeid-usage-api.test.ts`
  - admin response splits route calculations between authenticated and public;
  - total still equals sum;
  - unique_users remains authenticated user count;
  - no raw `user_id`, route hashes or event rows are exposed;
  - missing migration zero-state includes new fields set to 0.

- `lib/__tests__/admin-page.test.tsx`
  - admin UI renders public/auth split without crashing.

If final forecast guest events are added:

- `lib/__tests__/weather-travel-api.test.ts`
  - guest final forecast completed/failed events are recorded with `userId: null`.

## Privacy / RLS / Supabase Notes

No SQL migration should be required if the existing table remains unchanged.

Confirm before implementation:

- `user_id` in `sql/71_teskeid_usage_events.sql` is nullable.
- `service_role` already has INSERT/SELECT.
- RLS remains enabled.
- No grants are added for `anon` or `authenticated`.

Do not store:

- IP address or hashed IP;
- email;
- place name;
- formatted address;
- place ID;
- lat/lon;
- polyline;
- forecast payload;
- user-agent or device fingerprint.

Allowed metadata:

- `actor: 'guest' | 'authenticated'`
- `provider: 'google'`
- `routeCount`
- `routePairHash` from `routePairFingerprint()` only
- booleans such as `originIdPresent`, `destinationIdPresent`
- generic curated labels such as `CURATED_VIA_HELLISHEIDI` and `CURATED_RING_ROAD`

## Risks / Edge Cases

1. **Admin totals may jump after release.**  
   That is expected because public traffic will finally be counted.

2. **Conversion can become misleading.**  
   If public route calculations are counted but public final forecast completions are not, route-to-result conversion will drop artificially. Either split conversion by actor or record public final forecast completions too.

3. **Route-pair hash requires `USAGE_EVENT_SECRET`.**  
   If missing, distinct route-pair count stays incomplete. Existing admin warning can remain.

4. **Rate-limited events must not count as route calculations.**  
   They do not incur provider route calculation and should be a separate metric.

5. **Do not let usage tracking throw user-facing errors.**  
   `recordTeskeidUsageEvent()` must remain non-throwing so weather flow does not fail because analytics failed.

## Suggested Message For Claude Code

```md
Claude Code, vinsamlegast útfærðu þetta sem afmarkaða breytingu fyrir TODO #69:

Við viljum að admin dashboard telji líka hversu margar leiðir public/óinnskráðir notendur reikna í Veðrinu.

Nú er `/api/teskeid/weather/travel/routes` að recorda usage events bara þegar `user` er til. Bættu við guest usage events með `user_id = null`, án þess að geyma IP, netfang, staðanöfn, placeId, hnit, polylines eða forecast payload.

Markmið:
- nota áfram `teskeid_usage_events`
- líklega engin SQL migration, því `user_id` er nullable
- breyta `recordTeskeidUsageEvent` þannig að `userId: string | null` sé leyfilegt
- recorda `weather_route_options_calculated` og `weather_route_options_failed` fyrir guest
- helst recorda `weather_route_options_rate_limited` þegar public 5-ferða/IP takmörkun stoppar request
- bæta admin API aggregation við public/auth split
- bæta admin UI þannig að Stebbi sjái `Innskráðir` vs `Óinnskráðir`
- passa að conversion sé ekki villandi ef public final forecast completion er ekki líka talin
- bæta við testum fyrir API, admin aggregation, privacy og `userId: null`

Ekki veikja RLS, ekki bæta anon/authenticated grants, ekki logga viðkvæm gögn.

Skilaðu handoff með skrám, prófum og `Localhost checks for Stebbi`.
```

## Localhost Checks For Stebbi

After Claude Code implements:

### Setup

- `.env.local`:
  - `AUTH_MVP_ENABLED=true`
  - `WEATHER_ENABLED=true`
  - `WEATHER_PUBLIC_ENABLED=true`
  - `USAGE_EVENT_SECRET` should be set if distinct route-pair count is expected.
- SQL 71 must already be run in the target Supabase environment.
- Do not test broad route sweeps casually; each public route calculation can use Google Routes.

### Guest/public route calculation

1. Open `/vedrid` in an incognito/private window or logged-out browser.
2. Choose origin and destination.
3. Wait until route options appear.
4. Expected:
   - route options still work;
   - no saved places are shown beyond guest-safe empty/default behavior;
   - no login wall appears.

### Admin metric

1. Log in as admin.
2. Open `/admin`.
3. Select a short period such as `5min` or `10min`.
4. Expected:
   - "Veðrið - leiðarútreikningar" shows a public/óinnskráðir count incrementing by 1 for the guest route-options request;
   - authenticated count does not increment for that guest request;
   - total route calculations equals authenticated + public;
   - no raw route pair hash, user id, IP, names or coordinates appear in UI.

### Authenticated route calculation regression

1. Open `/auth-mvp/vedrid` as a logged-in user.
2. Calculate a route.
3. Expected:
   - existing weather flow works;
   - authenticated usage count increments;
   - public count does not increment.

### Rate limit check

Do not burn production quota casually.

On localhost, if rate limit can be safely simulated/mocked:

1. Trigger guest rate limit.
2. Expected:
   - user sees the existing public rate limit behavior;
   - admin rate-limited count increments separately;
   - route calculation count does **not** increment for the blocked request.

## Bottom Line

Yes, we should count public route calculations now.

The safe version is not to invent a separate public analytics table. Use the existing service-role-only `teskeid_usage_events` table with `user_id = null`, add an explicit `actor` metadata field, keep metadata sanitized, and show an admin split between authenticated and public usage.

