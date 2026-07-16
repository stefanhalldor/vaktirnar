# TODO 086 v330 - Codex review: v197 Vegagerdin handoff against current structure

Created: 2026-07-16 14:31
Timezone: Atlantic/Reykjavik

Mode:
- Codex review / handoff only.
- No product code changed.
- No SQL written or run.
- No commit, push, deploy, Supabase or Vercel action.

Source handoff reviewed:
- `ai-handoff/2026-07-15-0709-todo-086-v197-codex-vegagerdin-current-measurements-handoff.md`

Related current context:
- Weather access model has changed since v197.
- Veðurpuls/chat core now exists and is reusable, but first concrete target is still `vedurstofan_station`.
- Veðurstofan provider layer is now more mature than it was when v197 was written.
- A separate route/pulse/Holmavik handoff exists in v329, but this handoff is specifically about starting Vegagerdin provider work safely.

## High-level conclusion

The v197 Vegagerdin handoff is still directionally good, especially on the most important product rule:

> Vegagerdin data is current/live measurement data, not forecast data.

Keep that rule.

But v197 is now outdated in three important areas:

1. Feature flag / access model.
2. Data persistence strategy.
3. Chat/Puls target model.

Claude Code should not implement v197 literally. It should implement an updated Vegagerdin provider plan that matches the current Teskeid weather architecture.

## Findings

### 1. v197 uses outdated provider flag naming

Severity: High

v197 suggests:

```text
WEATHER_PROVIDER_VEGAGERDIN_ENABLED=true
```

That no longer matches the current provider access model.

Current pattern should be:

```text
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
feature_access.feature_key = 'weather-provider-vegagerdin'
```

Expected semantics should match the current Veðurstofan graduation model:

- `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`
  - provider is restricted to users with `feature_access` row.
- unset / false / any other value
  - provider is open to all weather users.

This is important because we recently moved away from ambiguous global provider enable flags.

Files that need to be updated when Vegagerdin provider access is added:

- `lib/loans/guard.ts`
  - add `weather-provider-vegagerdin` branch.
- `app/api/admin/feature-access/route.ts`
  - add `weather-provider-vegagerdin` to `ALLOWED_FEATURES`.
- `app/(admin)/admin/page.tsx`
  - add admin section and type union entry.
- `sql/80_...`
  - widen `feature_access_feature_key_check`.
- `.env.example`
  - document `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED`.
- tests for guard/admin feature access.

Do not reintroduce `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`.

### 2. The new SQL migration should be explicit and provider-specific

Severity: High

Current `feature_access_feature_key_check` includes:

```text
umonnun
tengsl
facebook-oauth
vedrid
ferdalagid
elta-vedrid
weather-provider-vedurstofan
weather-pulse
```

It does not include:

```text
weather-provider-vegagerdin
```

So if Vegagerdin is controlled by per-user access, SQL is required before admin UI/API can grant access.

Migration should be idempotent and similar to SQL 79, but add `weather-provider-vegagerdin`.

Important:
- Do not run migration without Stebbi's explicit Supabase approval.
- RLS must not be weakened.
- This is only feature access metadata, not provider data exposure.

### 3. v197 says no product table initially; current architecture suggests product layer now

Severity: Medium

v197 recommended starting with only `weather_cache`:

```text
vegagerdin:vedur2014_1:latest
```

That was reasonable then. But the system is now more mature:

- Veðurstofan has raw cache + queryable product tables.
- Travel API reads product-layer data.
- Púls needs stable target IDs.
- Vegagerdin live points should become canonical entities for later chat and route association.

Updated recommendation:

- Keep `weather_cache` for raw upstream response / shared fetch cache.
- Add Vegagerdin product tables early, likely:
  - `vegagerdin_stations` or `vegagerdin_live_points`
  - `vegagerdin_measurements_latest`
  - optional history later, if needed
- Keep all provider tables service-role only.
- Client/public/authenticated access should go through server API, not direct Supabase grants.

This avoids repeating the early Veðurstofan problem where UI/workflow had to grow around unstable raw data.

### 4. Do not extend `weather_fetch_runs` casually

Severity: Medium

`weather_fetch_runs.source` was created with:

```sql
CHECK (source IN ('vedurstofan'))
```

If Vegagerdin uses `weather_fetch_runs`, a migration must widen that check.

Do not insert `source='vegagerdin'` before that migration.

Options:

1. Add a migration widening `weather_fetch_runs.source` to include `vegagerdin`.
2. Or keep first Vegagerdin run metadata in a provider-specific table / payload until run history is generalized.

Recommendation:

Prefer a small migration that intentionally generalizes run history, if Claude Code needs run metadata for cron/freshness.

### 5. Vegagerdin is current measurement data, not forecast data

Severity: High

This is the most important product/logic constraint from v197 and should remain unchanged.

Do not feed Vegagerdin current measurements directly into:

- forecast scrubber statuses
- `worst` forecast point
- future departure candidate calculations
- `selectDecisiveProvider`
- met.no / Veðurstofan provider forecast aggregation

Unless Stebbi separately approves a designed rule for how current conditions affect future travel decisions.

Reason:

Vegagerdin hviður and current wind describe recent/current conditions. They do not say what the wind will be when the user reaches the point later.

Correct initial UI language:

```text
Núverandi mæling
Mælt kl. 14:10
Vindur 13 m/s
Hviða síðustu 10 mín. 20 m/s
```

Avoid:

```text
Vegagerðin spáir...
Hviður verða...
```

### 6. Route matching must create independent Vegagerdin points

Severity: High

Do not attach Vegagerdin measurements to met.no points.

Correct pattern:

- one Vegagerdin live point/station appears once
- match it to the route polyline by projection/distance
- compute:
  - distance from route
  - distance along route
  - route order
  - match quality/freshness

This mirrors the lesson from Veðurstofan: provider points are their own layer. They are not duplicates of MET/Yr forecast points.

### 7. Extract route projection helpers before reusing them

Severity: Medium

v197 correctly noted that route projection helpers live inside:

```text
app/api/teskeid/weather/travel/route.ts
```

Before Vegagerdin route matching, extract reusable geometry helpers into something like:

```text
lib/weather/routeProjection.ts
```

Use it for:

- Veðurstofan station projection
- Vegagerdin live point projection
- later route-level Safnpuls grouping

Avoid copy/paste geometry.

### 8. Chat/Puls must remain reusable chat core, with Vegagerdin-specific target type

Severity: Medium

SQL 78 currently restricts chat thread targets to:

```text
target_type IN ('vedurstofan_station')
```

When Vegagerdin live points get Puls, do not fake them as `vedurstofan_station`.

Add a new target type with a migration, for example:

```text
vegagerdin_live_point
```

Keep reusable chat core intact:

- same core tables
- same API patterns where possible
- different target type / provider context

This keeps us on the intended track: reusable Teskeid chat core, first used as Veðurpuls, later reusable elsewhere.

### 9. Admin UI and feature access must be updated together

Severity: Medium

If `weather-provider-vegagerdin` is added, the following must ship together:

- SQL constraint allows key.
- Admin API allowlist allows key.
- Admin page can grant/revoke key.
- `checkFeatureAccess()` understands key.
- `.env.example` documents exact behavior.
- Tests cover restricted/open behavior.

Do not add only the env var and forget admin tooling.

### 10. `.env.example` should be cleaned up before copying provider pattern

Severity: Low/Medium

The code currently treats provider access as:

- `*_ACCESS_REQUIRED === 'true'` means restricted.
- unset/false means open/graduated.

Before adding Vegagerdin docs, verify `.env.example` says the same thing consistently. Avoid wording like "default unset or true" if code says only explicit `true` restricts.

This matters because Stebbi uses env docs operationally in Vercel.

## Updated implementation direction

### Phase A - Source discovery, no UI

Goal:
- confirm endpoint shape and field semantics.

Actions:
- Read the Vegagerdin endpoint contract from the existing ChatGPT handoff.
- If external fetch is needed, Claude Code must ask Stebbi for approval because it requires network access.
- Save a tiny fixture only if Stebbi approves file write.

Do not:
- change UI
- add route integration
- run SQL
- deploy

### Phase B - Feature access foundation

Goal:
- make provider access model ready before data appears in UI.

Add:

```text
weather-provider-vegagerdin
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED
```

Required updates:
- SQL feature access constraint migration.
- `checkFeatureAccess`.
- admin feature access route.
- admin page section.
- `.env.example`.
- tests.

Initial Vercel production setting should probably be:

```text
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```

That keeps Vegagerdin restricted per user while being tested.

### Phase C - Provider parser/cache/product layer

Goal:
- server-only normalized current measurements.

Recommended files:

```text
lib/weather/providers/vegagerdinCurrent.server.ts
lib/weather/providers/vegagerdinCurrentTypes.ts
lib/weather/providers/vegagerdinCurrentSchema.ts
lib/weather/providers/vegagerdinCurrentTime.ts
lib/__tests__/weather-vegagerdin-current.test.ts
lib/__tests__/weather-vegagerdin-current-time.test.ts
```

Recommended normalized fields:

```ts
type VegagerdinCurrentMeasurement = {
  source: 'vegagerdin'
  stationId: string
  stationName: string
  lat: number
  lon: number
  measuredAtIso: string
  fetchedAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  dataQuality: 'complete' | 'partial'
}
```

Rules:
- `Vindhradi` -> mean wind.
- `Vindhvida` -> last/recent gust, not forecast gust.
- Null remains null.
- Missing numeric fields must not become 0.
- Parse time explicitly and test timezone behavior.

### Phase D - Route layer

Goal:
- match Vegagerdin live points to a route as their own provider layer.

Do:
- use extracted route projection helper
- sort by route order
- include freshness
- include distance from route
- cap or filter by route corridor

Do not:
- attach to met.no point IDs
- change forecast cards yet
- change departure scrubber yet

### Phase E - UI display

Goal:
- visible but clearly separate current-measurement layer.

Potential UI placement:
- below "Mest krefjandi á leiðinni" / near provider details
- on map as independent live markers
- in "all provider points" section

Suggested copy:

```text
Núverandi mæling frá Vegagerðinni
Mælt kl. 14:10
Vindur 13 m/s · hviða síðustu 10 mín. 20 m/s
0,8 km frá leiðinni
```

Use Design.md before UI changes:
- mobile-first
- no nested cards
- compact text sizing
- clear loading/pending states for navigation
- no overflow/zoom issues

### Phase F - Puls after stable live points

Goal:
- move community reports toward Vegagerdin current/live points.

Do:
- add chat target type `vegagerdin_live_point`
- use same reusable chat panel/core
- show newest route-relevant pulse entries grouped by route order
- preserve current Veðurstofan Puls until Vegagerdin live points are stable

Do not:
- duplicate chat implementations
- create special one-off Vegagerdin chat tables
- expose raw route/user location in chat metadata

## Suggested Claude Code instruction

```text
Claude Code, please review v197 and v330 before implementing Vegagerdin.

Treat v197 as useful but outdated in feature flag and persistence details.

Please start with a short updated plan before editing.

Key requirements:
- Vegagerdin is current/live measurement data, not forecast.
- Use `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` and `weather-provider-vegagerdin`, not `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`.
- Add the feature access migration/admin/API/guard/docs/tests together.
- Prefer raw `weather_cache` plus queryable Vegagerdin product tables.
- Do not feed Vegagerdin current measurements into scrubber/worst-point/future forecast aggregation in the first implementation.
- Match Vegagerdin live points to route independently, not via met.no points.
- Keep reusable Teskeid chat core; later Vegagerdin Puls should use a new target type such as `vegagerdin_live_point`.
- Include SQL/RLS/security notes and Localhost checks for Stebbi in your handoff.
```

## SQL / RLS / auth notes

Expected SQL work:

- New feature access migration:
  - add `weather-provider-vegagerdin` to `feature_access_feature_key_check`.
- If using provider product tables:
  - create service-role-only tables.
  - enable RLS.
  - no anon/authenticated grants.
- If using `weather_fetch_runs`:
  - widen `source` check to include `vegagerdin`.

Security constraints:

- Do not expose raw Vegagerdin upstream payload to clients.
- Do not log user route geometry or origin/destination in detail.
- Public/authenticated clients should receive only sanitized provider fields through API.
- Service role remains server-only.
- Any manual refresh endpoint must not be public unless intentionally designed with rate limiting and auth.

## Env expectations for first test rollout

Base weather:

```text
WEATHER_ENABLED=All
```

If Vegagerdin should be restricted to selected users:

```text
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```

If Vegagerdin is later opened to all weather users:

```text
# delete WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED
# or set it to anything other than true
```

Do not use:

```text
WEATHER_PROVIDER_VEGAGERDIN_ENABLED
```

## Localhost checks for Stebbi

After Phase B access work:

1. Log in as admin and open admin feature-access page.
2. Confirm there is a Vegagerdin provider access section.
3. Add one test email to `weather-provider-vegagerdin`.
4. Confirm the email appears and can be removed.
5. Confirm no existing Veðurstofan/weather-pulse access rows changed.
6. Confirm public `/vedrid` still works with MET/Yr when `WEATHER_ENABLED=All`.
7. Confirm a logged-in user without Vegagerdin access still sees normal weather.

After Phase C provider/parser:

1. Run targeted parser/provider tests.
2. Confirm fixture is small and contains no unnecessary payload.
3. Confirm null wind/gust fields stay null.
4. Confirm measured time is parsed correctly.
5. Confirm no client/browser fetch is used.
6. Confirm repeated test calls do not hammer Vegagerdin upstream.

After Phase D/E route/UI:

1. Open `/auth-mvp/vedrid`.
2. Reikna route likely to pass known Vegagerdin live points.
3. Confirm Vegagerdin points appear as independent current-measurement points.
4. Confirm one Vegagerdin live point appears once, not duplicated per met.no point.
5. Confirm map markers/list order follow route order.
6. Confirm labels say current measurement / measured time / gust last 10 minutes.
7. Confirm scrubber/worst-point forecast status does not change just because Vegagerdin current layer is visible.
8. Toggle met.no/Veðurstofan and confirm Vegagerdin does not accidentally disappear or alter forecast aggregation unless deliberately selected/designed.
9. Test mobile width 360-460 px for no overflow, no zoom, no overlapping provider cards.

After Phase F Puls:

1. Confirm reusable chat panel is still shared.
2. Confirm Vegagerdin Puls uses `vegagerdin_live_point` or equivalent target type.
3. Confirm a message posted on one live point does not appear on unrelated points.
4. Confirm public users can see only the intended preview if that remains product decision.
5. Confirm posting requires authenticated user.
6. Confirm no precise user GPS/location is stored or shown.

## Open questions for Stebbi / Claude Code

1. Should first Vegagerdin implementation include product tables immediately?
   - Codex recommendation: yes, now that the weather architecture is mature enough.
2. Should `weather_fetch_runs` be generalized in the same migration set?
   - Codex recommendation: yes if cron/freshness is part of the first provider phase.
3. Should current Vegagerdin measurements influence route status later?
   - Codex recommendation: not until we design exact semantics for current vs future travel.
4. Should Vegagerdin Puls replace Veðurstofan Puls or coexist?
   - Codex recommendation: coexist first; Vegagerdin becomes primary where available, Veðurstofan remains fallback/viðbót.

