# TODO 069 - Codex review of v011: final scope for public weather usage metrics

Created: 2026-07-11 07:28  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Review / implementation handoff for Claude Code  
Related TODO: #69 Virkni per Teskeið í admin sýn  
Builds on:

- `2026-07-10-2344-todo-069-v010-codex-public-weather-usage-admin-metric.md`
- `2026-07-11-0719-todo-069-v011-claude-v010-review.md`

Status: Planning/review only. No implementation approval implied by this file.

## Codex Summary

Claude Code's v011 review is broadly right:

- public/guest route calculations are currently not counted;
- `teskeid_usage_events.user_id` is nullable, so no SQL migration appears needed;
- `recordTeskeidUsageEvent` should allow `userId: string | null`;
- admin should show authenticated vs public usage clearly;
- usage metadata must remain sanitized and must not store IP, place names, place IDs, raw coordinates, polylines, forecast payloads or user agents.

Codex agrees with moving forward, but with a slightly tighter final scope so the admin numbers are not misleading.

## Findings

### P1 - Include public final forecast events in the same scope

Claude Code is right that counting public route options without counting public final results makes conversion misleading.

If `weather_route_options_calculated` includes public users but `weather_final_forecast_completed` stays authenticated-only, admin will show an artificially bad route-to-result conversion.

Therefore the implementation should cover both endpoints in one small PR:

- `app/api/teskeid/weather/travel/routes/route.ts`
  - route options calculated/failed/rate-limited
- `app/api/teskeid/weather/travel/route.ts`
  - final forecast completed/failed

Important correction to v011: this is not just a 2-3 line tweak in `/travel/route.ts`. There are several existing `if (user)` usage-event branches in that file. Claude Code should avoid copy/paste sprawl by adding a small local helper or shared event-input helper.

### P1 - Conversion must be actor-aware or explicitly labelled

Admin should not blend authenticated and public conversion in a way that hides behavior.

Recommended:

- keep existing total conversion if useful;
- add authenticated/public route-option counts;
- add authenticated/public final-result counts;
- compute authenticated/public conversion separately if both numerator and denominator exist.

If Claude Code chooses not to add public final forecast events, then public conversion must not be shown and the UI must clearly say conversion is authenticated-only. Codex preference is to add public final forecast events now.

### P2 - Actor split must be backward-compatible

New events can add:

```ts
metadata: {
  actor: 'authenticated' | 'guest'
}
```

But historic authenticated events already in the database do not have `metadata.actor`.

Admin aggregation must therefore use a compatibility helper like:

```ts
function getActor(event: UsageRow): 'authenticated' | 'guest' {
  if (event.metadata?.actor === 'authenticated') return 'authenticated'
  if (event.metadata?.actor === 'guest') return 'guest'
  return event.user_id ? 'authenticated' : 'guest'
}
```

Do not infer all missing-actor events as guest. That would rewrite history incorrectly.

### P2 - Keep event names stable; derive actor counts in admin

Do not create separate event names like:

- `weather_route_options_calculated_public`
- `weather_route_options_calculated_authenticated`

Keep stable existing event names:

- `weather_route_options_calculated`
- `weather_route_options_failed`
- `weather_final_forecast_completed`
- `weather_final_forecast_failed`

Add only one new event name if needed:

- `weather_route_options_rate_limited`

Then derive public/authenticated counts in `app/api/admin/teskeid-usage/route.ts`.

This keeps historical aggregation simpler and avoids multiplying event names.

### P2 - Rate-limited public requests are not route calculations

If guest hits the 5 trips/IP/day limit, record a separate event only after the public feature gate is passed:

```ts
eventName: 'weather_route_options_rate_limited'
userId: null
metadata: { actor: 'guest' }
```

This event must not increment:

- route calculations;
- distinct route pairs;
- final forecast conversion.

It is a useful acquisition/friction metric, not a Google route calculation.

### P2 - "Virkir notendur" label becomes ambiguous

Current admin summary uses `unique_users` from non-null `user_id`, which is still correct for authenticated users.

But once total events include guest events, the UI label should avoid implying that public users are counted as users.

Recommended label:

- `Innskráðir notendur`

Then add route-specific public counts near the Veðrið detail section.

## Final Recommended Scope

Claude Code should implement:

1. `lib/teskeid/usage.server.ts`
   - Change `userId: string` to `userId: string | null`.
   - Keep the helper non-throwing.
   - Keep metadata sanitizer strict.
   - Add tests that `actor` is allowed and sensitive keys are still stripped.

2. `app/api/teskeid/weather/travel/routes/route.ts`
   - Record route option success/failure for both authenticated and guest users.
   - Add `actor` metadata.
   - Record public rate-limited requests as a separate event.
   - Do not record anything before auth/feature/public access checks.
   - Do not store IP, names, place IDs, hnit, addresses, polylines or forecasts.

3. `app/api/teskeid/weather/travel/route.ts`
   - Record final forecast completed/failed for both authenticated and guest users.
   - Add `actor` metadata.
   - Use a helper to avoid repeated usage-event object construction.
   - Keep failure metadata generic and sanitized:
     - `failureReason`
     - `selectedRouteProvided`
     - existing bucketed distance/duration/result status on success.

4. `app/api/admin/teskeid-usage/route.ts`
   - Add actor-aware aggregation.
   - Keep historic rows compatible.
   - Add public/authenticated counts for route options and final forecasts.
   - Add public rate-limit count.
   - Keep distinct route-pair hashing private and never expose hashes.

5. `app/(admin)/admin/page.tsx`
   - Show total/auth/public split in the Veðrið detail section.
   - Rename ambiguous `Virkir notendur` to `Innskráðir notendur` if keeping that top summary card.
   - Do not overcomplicate the UI. This is an admin diagnostic section.

6. Tests
   - `lib/__tests__/teskeid-usage.test.ts`
   - `lib/__tests__/weather-routes-api.test.ts`
   - `lib/__tests__/weather-travel-api.test.ts`
   - `lib/__tests__/teskeid-usage-api.test.ts`
   - `lib/__tests__/admin-page.test.tsx`

## Privacy / Data Boundaries

No SQL migration expected.

Do not change:

- RLS;
- grants;
- Supabase schema;
- public table access;
- feature flags;
- auth guards beyond existing public-weather behavior.

Never store in usage metadata:

- IP or hashed IP;
- email;
- user agent;
- place name;
- formatted address;
- place ID;
- raw lat/lon;
- polyline;
- forecast payload;
- raw Google or met.no response.

Allowed:

- `actor: 'guest' | 'authenticated'`;
- `provider: 'google'`;
- `routeCount`;
- `routePairHash` only from `routePairFingerprint()` when `USAGE_EVENT_SECRET` exists;
- generic booleans like `originIdPresent`;
- generic curated labels like `CURATED_RING_ROAD`;
- bucketed distance/duration/result status already used in final forecast metadata.

## Suggested Message For Claude Code

```md
Claude Code, vinsamlegast framkvæmdu TODO #69 public weather usage metric samkvæmt v010/v011/v012.

Endanlegt scope:
- leyfa `recordTeskeidUsageEvent({ userId: null })`
- skrá guest/public usage events í `/api/teskeid/weather/travel/routes`
- skrá líka guest/public final forecast events í `/api/teskeid/weather/travel/route`, svo conversion verði ekki villandi
- bæta við sér event fyrir guest rate limit: `weather_route_options_rate_limited`
- halda event names stable og reikna auth/public split í admin aggregation
- bæta `actor: 'guest' | 'authenticated'` í metadata, en gera aggregation backward-compatible fyrir eldri events án actor
- sýna auth/public split í admin dashboard
- ekki geyma IP, placeId, staðanöfn, address, hnit, polylines, forecast payload eða user agent
- engin SQL migration, engar RLS/grant breytingar
- bæta við prófum fyrir usage helper, route options API, final forecast API, admin aggregation og admin UI

Sérstaklega: ekki láta route-to-result conversion blandast þannig að public route options séu taldar en public final results ekki. Annaðhvort telja bæði eða merkja conversion sem authenticated-only. Codex mælir með að telja bæði.

Skilaðu handoff með breyttum skrám, testum og Localhost checks for Stebbi.
```

## Localhost Checks for Stebbi

After implementation:

### Setup

- `AUTH_MVP_ENABLED=true`
- `WEATHER_ENABLED=true`
- `WEATHER_PUBLIC_ENABLED=true`
- `USAGE_EVENT_SECRET` set if distinct route-pair metrics are expected
- SQL 71 already applied

Do not run broad route sweeps casually. Guest route option calls can use Google Routes and count against public usage/rate limits.

### Public route options

1. Open `/vedrid` logged out or in private browsing.
2. Select a route, for example Reykjavík -> Akureyri.
3. Wait for route options.
4. Expected:
   - route options load;
   - admin usage later shows public/guest route option count incremented;
   - authenticated route count does not increment.

### Public final forecast

1. Continue from the public route options flow.
2. Select a route and complete weather calculation.
3. Expected:
   - final result loads;
   - admin usage later shows public/guest final forecast count incremented;
   - public route-to-result conversion is meaningful.

### Authenticated regression

1. Open `/auth-mvp/vedrid` as logged-in user.
2. Calculate a route and final forecast.
3. Expected:
   - existing behavior still works;
   - authenticated counts increment;
   - public counts do not increment.

### Admin UI

1. Open `/admin` as admin.
2. Use `5min` or `10min` period.
3. Expected:
   - Veðrið section shows total/auth/public route option counts;
   - final forecast counts are split or otherwise clearly labelled;
   - top `unique_users` label does not imply guest users are counted as people;
   - no raw user IDs, route hashes, IPs, places, hnit or provider payloads appear.

### Rate limit

Only simulate locally if it can be done without burning real route quota.

Expected:

- public rate-limit count increments separately;
- route calculations do not increment for blocked requests.

## Bottom Line

v011 is good. The only real adjustment is scope discipline:

- include public final forecast events now;
- keep actor split backward-compatible;
- derive counts in admin instead of multiplying event names;
- keep conversion honest.

