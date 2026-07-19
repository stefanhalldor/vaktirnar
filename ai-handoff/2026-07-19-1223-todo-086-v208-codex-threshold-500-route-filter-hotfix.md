# 2026-07-19 12:23 - TODO 086 v208 - Codex threshold 500 and route filter hotfix

Created: 2026-07-19 12:23
Timezone: Atlantic/Reykjavik

## Context

Stebbi reports after release/hotfix testing:

- Public user set default wind thresholds to `10` and `13`, entered the login flow, but the defaults did not persist.
- As an authenticated user, browser console shows `Failed to load resource: the server responded with a status of 500`.
- `/auth-mvp/vedrid` shows route picker selected `Reykjavík -> Siglufjörður`, but the map is not filtered to the selected route.

Codex inspected code read-only. No code, SQL, commit, push, deploy, or production action was performed.

## Findings

1. **Likely root cause of threshold 500: `/api/teskeid/weather/preferences/thresholds` is failing server-side.**
   `WeatherOverviewClient` fetches this endpoint on authenticated `/auth-mvp/vedrid` load and uses `PUT` when saving defaults. The route returns `500` only on DB error.

   The likely DB causes are:
   - SQL82 has not been run in production (`public.weather_user_preferences` missing).
   - Or the logged-in user has no `public.profiles` row, and SQL82's FK fails:
     `weather_user_preferences.user_id references public.profiles(id)`.

   This second case is plausible because `createUserSession()` creates/authenticates Supabase Auth users but does not create a `profiles` row. `profiles` is only upserted by `/api/teskeid/profile` PATCH when the user saves profile data.

2. **Public-login threshold persistence is fragile.**
   Public `/vedrid` save constructs:

   `next=/vedrid?saveDefaults={caution},{red}`

   After auth, the app must return to exactly that URL for the client effect to save the values. If auth/profile flow lands on `/auth-mvp/vedrid` without `saveDefaults`, the values are lost.

   Even if the URL survives, the save still fails if SQL82/table/profile FK is broken.

3. **Likely root cause of route map not filtering: route-memory lookup is missing or failing while places/destinations still work.**
   The picker can show `Frá` and `Til` from:

   - `/api/teskeid/weather/route-memory/places`
   - `/api/teskeid/weather/route-memory/destinations`

   But the map only filters after:

   - `/api/teskeid/weather/route-memory/lookup`

   returns `status: 'resolved'` with station IDs.

   If lookup returns `miss`, or returns variants with empty `vedurstofanStationIds` and `vegagerdinStationIds`, the map shows all stations.

4. **SQL87 missing can explain route picker works but map filter does not.**
   `places` and `destinations` endpoints do not read `route_caution_ids`.
   `lookupRouteMemory()` does read `route_caution_ids`.

   If SQL87 has not been applied in production, lookup can fail and return `miss`, while the picker still shows places/destinations. This exactly matches Stebbi's screenshot.

## Immediate diagnostics for Stebbi / Claude Code

In browser DevTools Network, identify which request returns 500:

- If it is `/api/teskeid/weather/preferences/thresholds`, fix/check SQL82 + profile FK.
- If it is `/api/teskeid/weather/route-memory/lookup`, fix/check SQL87 or lookup query fallback.

Read-only SQL checks:

```sql
-- SQL82 exists?
select to_regclass('public.weather_user_preferences') as weather_user_preferences_table;

-- SQL87 exists?
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'weather_route_memory_routes'
  and column_name = 'route_caution_ids';

-- Does a specific authenticated test user have a profile row and saved prefs?
-- Replace the email manually before running.
select
  u.id,
  u.email,
  p.id is not null as has_profile,
  w.caution_wind_ms,
  w.red_wind_ms,
  w.updated_at as prefs_updated_at
from auth.users u
left join public.profiles p on p.id = u.id
left join public.weather_user_preferences w on w.user_id = u.id
where lower(u.email) = lower('REPLACE_WITH_TEST_EMAIL');
```

API check for route-memory lookup:

```powershell
curl.exe -i -X POST -H "Content-Type: application/json" -d "{\"fromName\":\"Reykjavík\",\"toName\":\"Siglufjörður\"}" "https://www.teskeid.is/api/teskeid/weather/route-memory/lookup"
```

Expected if filtering can work:

- HTTP 200
- JSON `status` is `resolved`
- `variants` contains non-empty `vedurstofanStationIds` and/or `vegagerdinStationIds`

If it returns `miss`, route picker can still show the places, but map filtering cannot work.

## Recommended hotfix

### A. Fix threshold defaults

1. Confirm SQL82 is applied.
2. Make the preferences API robust against missing profile rows:
   - Before upserting `weather_user_preferences`, ensure `public.profiles` has a row for `user.id`.
   - Either upsert minimal profile in `PUT /preferences/thresholds`, or create profile during `createUserSession()`.
   - Keep this service-role-side or RLS-safe. Do not weaken RLS.
3. Make public-login save robust:
   - Prefer saving pending threshold values in `sessionStorage` before redirect to login.
   - On authenticated `/auth-mvp/vedrid` mount, consume pending values and call the same PUT endpoint.
   - Keep `saveDefaults` URL param support as a fallback, but do not rely on it as the only state carrier across auth/profile redirects.
4. Only remove pending sessionStorage after PUT succeeds.

### B. Fix route filtering

1. Confirm SQL87 is applied before treating route filtering as broken.
2. Add debug-safe handling in `lookupRouteMemory()`:
   - Log route lookup DB error code with context-free message.
   - Consider a defensive fallback select without `route_caution_ids` if the column is missing, so station filtering is not broken by the caution-label migration. This should be temporary if SQL87 is a hard release requirement.
3. Add UI/debug state for route memory misses during prerelease only:
   - If both `Frá/Til` selected and lookup returns `miss`, show a small non-scary text or console debug in dev, not production noise.
4. Verify `/api/teskeid/weather/route-memory/lookup` returns non-empty station IDs for `Reykjavík -> Siglufjörður`.

## Route intelligence check

- Affected route: `Reykjavík -> Siglufjörður` and any route-memory selected pair on `/vedrid`.
- The route picker itself reads aggregate public place labels; the map filter depends on exact provider station IDs from route memory.
- Privacy remains safe if fixed as planned: no raw Google geometry, raw addresses, user IDs, or Google place IDs needed.
- If route lookup fails because SQL87 is missing, that confirms why route-memory station filtering should not depend on optional migration columns without fallback during rollout.
- No `IcelandRoadmap.md` update is required for this bugfix unless Claude Code changes canonical route/station matching rules.

## Localhost checks for Stebbi

1. Logged-out `/vedrid`:
   - Change thresholds to `10` and `13`.
   - Click `Vista sem sjálfgefin vindmörk`.
   - Complete login/profile flow if needed.
   - Expected: authenticated `/auth-mvp/vedrid` shows `10` and `13`, and refresh keeps them.

2. Logged-in `/auth-mvp/vedrid`:
   - Change thresholds directly and save.
   - Expected: no 500 in Network, refresh keeps values.

3. Route filter:
   - Select `Reykjavík` and `Siglufjörður`.
   - Expected: `/route-memory/lookup` returns `resolved`.
   - Expected: map station counts drop from all-Iceland counts to route station counts.
   - Expected: route variant pills appear if multiple variants exist.

4. Regression:
   - Clear route and confirm full map returns.
   - Safnpuls stays visible.
   - Clicking route/place pills does not open station detail cards.

## Release guidance

Treat this as a release hotfix, not feature work. If production is already deployed, prioritize:

1. Confirm/run required SQL82 and SQL87.
2. Fix the preferences/profile robustness if 500 is caused by profile FK.
3. Fix route lookup if SQL87 is already present but lookup still returns `miss`.
