# TODO 086 - v031 Codex review and product direction

Created: 2026-07-12 19:40  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Type: Review / architecture direction  
Input reviewed: `ai-handoff/2026-07-12-1934-todo-086-v031-claude-v030-review-response.md`  
Current HEAD reviewed: `0252a74 feat: wire Veðurstofan station data into route weather points (#86)`  
Scope: Review and planning only. No source code changes, no commit, no push, no deploy, no migration.

## Findings

1. **High - v031 still frames fail-open too narrowly if the product rule is "return something even when either provider is down."**

   v031 correctly accepts the v030 finding that Veðurstofan must not block `/api/teskeid/weather/travel`. But Stebbi's product rule is broader:

   - return a result if Veðurstofan is down;
   - return a result if met.no is down;
   - if both are down, use old data when old data exists and label it clearly.

   Current code already has some stale fallback:

   - `lib/weather/metno.server.ts` returns cached met.no data on fetch errors when cache exists.
   - `lib/weather/providers/vedurstofan.server.ts` returns stale Veðurstofan data on fetch failure when stale cache exists.

   But both providers still lack a hard latency budget in the request path, and "both down" can only work when cached/stored rows already exist. If there is no old data, the app must say weather is unavailable; it must not invent a weather assessment.

   Direction for Claude Code: treat "fail-open" as a provider contract, not just a `.catch(() => null)` in the route. Providers should have bounded waits, stale fallback when stale data exists, and explicit freshness metadata in the API result.

2. **High - Stebbi has chosen Leið A for ETA correctness.**

   v031 asks Stebbi to choose between:

   - Leið A: API returns all relevant Veðurstofan forecast rows per station/route point; UI picks nearest row dynamically for active ETA.
   - Leið B: pin one row to `summaryForWindow` and show `ftimeIso`.

   Stebbi has now clarified the product principle: choose the better user experience even if it costs more code, as long as it does not create direct external cost. That means Codex recommends Leið A.

   Direction for Claude Code: do not implement Leið B unless Stebbi later reverses this. The Phase 2A patch should carry enough Veðurstofan rows to support active-candidate ETA selection in the UI, and the detail UI should show the matched `ftimeIso`/freshness so the comparison is auditable.

3. **Medium-high - Do not mix the quick Phase 2A patch with a new Supabase canonical store/migration unless Stebbi explicitly grants that separate scope.**

   Stebbi's idea to store Veðurstofan values in Supabase and build from our stored data is directionally right. There is already a server-only `public.weather_cache` table in `sql/67_weather_cache.sql`, and both met.no and Veðurstofan wrappers already use it.

   But that table is currently a generic cache table:

   - `cache_key text primary key`
   - `response_body jsonb`
   - `expires_at`
   - `last_modified`
   - `fetched_at`
   - `updated_at`

   It is not yet a fully designed product-facing weather data store with normalized station rows, source status, update runs, provider freshness, coverage reporting, or scheduled warming. Turning it into "our weather source of truth" may require SQL/migration, cron/job design, RLS review, observability, and provider terms review. That must be a separate explicitly approved implementation phase.

   Direction for Claude Code: immediate patch should use existing cache behavior and response types. For the larger "our stored weather data" architecture, write a separate Phase 2B/Phase 3 plan before any SQL.

4. **Medium - "Free data" should not be encoded as an unverified legal assumption.**

   Stebbi's product assumption is that Veðurstofan data is free and suitable to store. Codex agrees this is likely the intended path for this app architecture, but this review did not verify current official reuse/license terms. Before a production design stores, republishes, or exposes bulk-ish Veðurstofan data from our own database, Claude Code should either cite the official terms in a handoff or flag the exact attribution/terms requirement for Stebbi to confirm.

   Practical minimum: keep provider attribution in stored payloads and UI/API metadata, and do not strip downloaded/generated timestamps.

## Direction From Stebbi

Codex interprets Stebbi's latest message as these product decisions:

- Weather results should be resilient to provider outages.
- Old cached/stored weather data is acceptable when fresh provider data is unavailable, but it must be clearly labeled as old/stale.
- Veðurstofan data should move toward being stored in Supabase and reused from our own backend rather than fetched per user request.
- For ETA mismatch, choose Leið A: more complete API response + dynamic UI selection, because it is better for the user and does not create direct external provider cost.

This is still not implementation permission by itself. Claude Code needs explicit "framkvæmdu" permission before code, SQL, commits, push, deploy, or migrations.

## Recommended Next Phase Split

### Phase 2A patch - small, no SQL

Goal: make current committed Phase 2A safe enough to continue reviewing.

Claude Code should patch only the current route/UI integration:

1. Add bounded Veðurstofan enrichment behavior.
   - Prefer provider-level support for `timeoutMs`/`AbortSignal`, not only a route-level `Promise.race`.
   - If a live Veðurstofan fetch times out and stale cache exists, return stale station data.
   - If no cached data exists, omit Veðurstofan for that point and continue with MET/Yr.

2. Implement Leið A for Veðurstofan rows.
   - Extend `RouteWeatherPoint['vedurstofanStation']` to include a small `forecastRows`/`forecasts` array with the needed fields:
     - `ftimeIso`
     - `windSpeedMs`
     - `windDirectionText`
     - `temperatureC`
     - `precipitationMmPerHour`
     - `weatherText`
   - Keep station/provider metadata:
     - `stationId`
     - `stationName`
     - `distanceM`
     - `confidence`
     - `status` (`ok`/`stale`)
     - `atimeIso`
     - provider attribution if practical
   - UI selects the nearest Veðurstofan row from that array using the same active ETA concept already used for MET/Yr forecast rows.
   - Detail UI displays the selected Veðurstofan forecast time and stale/age state.

3. Add tests before another handoff.
   - Veðurstofan success enriches route points with forecast rows.
   - Veðurstofan reject still returns MET/Yr result.
   - Veðurstofan timeout still returns MET/Yr result.
   - Veðurstofan timeout with stale cache returns stale data if feasible at provider-test level.
   - UI/helper selection picks the nearest Veðurstofan row for active ETA.

4. Run:
   - targeted travel API tests;
   - Veðurstofan provider tests;
   - relevant UI/helper tests;
   - `npm run type-check`;
   - `npm run lint`;
   - `npm run build`.

No commit/push/deploy/migration in this phase unless Stebbi separately says so.

### Phase 2B / Phase 3 architecture - separate plan before implementation

Goal: move from per-user live provider fetches toward our own stored weather data.

Claude Code should prepare a separate architecture plan covering:

1. Whether to keep using `weather_cache` or add normalized tables.
   - Existing `weather_cache` may be enough for provider response caching.
   - A normalized table may be better for product logic and auditability, for example:
     - provider;
     - station/location key;
     - forecast time;
     - generated time;
     - fetched time;
     - expires time;
     - wind/temp/precip/weather fields;
     - source status/freshness;
     - raw payload reference or JSONB.

2. Cache warming.
   - A scheduled job can refresh Veðurstofan stations every X minutes.
   - It must be idempotent and safe to rerun.
   - It should not depend on a user waiting in the UI.
   - It needs a protected route/job secret if implemented through app routes or Vercel Cron.

3. Failure modes.
   - Fresh data path.
   - Stale-but-usable path.
   - Very stale path with stronger UI warning.
   - No data path.
   - Provider down but cache available.
   - Provider down and cache empty.

4. RLS/auth/Supabase risk.
   - Keep weather provider cache/store server-only unless there is a strong reason to expose it.
   - Service role writes only from trusted server code.
   - No user-specific data should be mixed into provider weather rows.
   - If public read is ever needed, it needs explicit review.

5. Provider terms/attribution.
   - Confirm official Veðurstofan reuse/storage terms before production rollout.
   - Preserve attribution and timestamps.

This phase likely involves SQL/migration and must not be implemented without a separate explicit permission from Stebbi.

## Review of v031 Proposed Patch Scope

Codex agrees with v031 on:

- adding timeout/fail-open behavior before push;
- adding tests around route enrichment;
- showing `ftimeIso`;
- no commit/push/deploy without separate permission.

Codex changes v031's recommendation in two ways:

- Leið A is now selected by Stebbi's stated product principle.
- The timeout work should be seen as provider-contract work with stale fallback, not merely a route-level race that drops Veðurstofan data when stale cache might exist.

Codex also adds:

- met.no needs the same long-term fail-open/timeout treatment if the product rule is "result even when either provider is down";
- Supabase stored-data architecture should be planned separately from the immediate patch.

## Files Inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-12-1934-todo-086-v031-claude-v030-review-response.md`
- `sql/67_weather_cache.sql`
- `lib/weather/metno.server.ts`
- `lib/weather/providers/vedurstofan.server.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/RouteWeatherPointDetailCard.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/types.ts`

## Commands Run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Exit code: 0

- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Exit code: 0

- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-1934-todo-086-v031-claude-v030-review-response.md'`
  - Exit code: 0

- `git status --short`
  - Exit code: 0
  - Result: worktree still has unrelated existing modified/untracked files and many handoff files. Codex did not touch source files.

- `rg -n "weather_cache|vedurstofan|forecastRows|RouteWeatherPoint|checkTravelWeather|fetchVedurstofanForecastsForStations" app components lib sql supa 2>$null`
  - Exit code: 1 because `supa` path does not exist / no full match set for all requested paths, but useful matches were returned for `app`, `components`, `lib`, and `sql`.

- `Get-ChildItem -File 'sql' | Select-Object Name,Length | Sort-Object Name`
  - Exit code: 0

- `Get-ChildItem -File 'supa/m' | Select-Object Name,Length | Sort-Object Name`
  - Exit code: 1 because `supa/m` does not exist in this repo.

- `Get-Content` snippets from:
  - `sql/67_weather_cache.sql`
  - `lib/weather/providers/vedurstofan.server.ts`
  - `lib/weather/metno.server.ts`
  - `app/api/teskeid/weather/travel/route.ts`
  - Exit code: 0

- `git log -3 --oneline --decorate`
  - Exit code: 0
  - Result: `0252a74` is still `HEAD -> main`; `origin/main` is still `8fea8e0`.

No tests were run in this review turn because no source code was changed.

## Supabase / RLS / Production

No Supabase change was made.
No SQL was written.
No migration was run.
No RLS, grants, auth, production data, billing, GitHub, push, or deploy was touched.

Important future risk: the proposed stored-weather architecture will be a Supabase/server-data design and must get its own review for SQL, RLS, service-role access, scheduled jobs, provider terms, stale-data UI, and production rollout.

## Localhost checks for Stebbi

For current v031/v032, there is nothing new to manually test because this is a review/plan only.

After Claude Code patches Phase 2A with Stebbi's explicit permission, Stebbi should test:

1. Open the local app at Stebbi's current localhost URL and go to the weather travel flow, likely `/auth-mvp/vedrid` or the current route for Veðrið.
2. Create a route such as Reykjavík to Akureyri or another route with several route weather points.
3. Open a route point detail panel.
4. Confirm MET/Yr and Veðurstofan values are visible with source, station name, distance, stale/fresh state, and matched forecast time.
5. Change departure/heatmap slot.
6. Confirm the Veðurstofan row changes to match the active ETA, not the original `summaryForWindow` ETA.
7. Confirm the UI still works on mobile width: no horizontal overflow, no overlap, no tiny unreadable timestamp.
8. If Claude adds a dev-only/mock way to simulate provider timeout, confirm the route result still appears and stale/old data is labeled.

Do not casually test production Supabase, scheduled jobs, or migrations. Those need separate explicit approval.

## Suggested Next Message To Claude Code

Stebbi can send Claude Code this direction, with explicit execution permission only if Stebbi is ready for code changes:

```text
Claude Code, rýndu v032 frá Codex og framkvæmdu Phase 2A patch, en ekki Phase 2B/Supabase architecture ennþá.

Samþykktur framkvæmdarrammi:
- Má breyta current Phase 2A kóða til að laga Veðurstofan timeout/fail-open og ETA-mismatch.
- Nota Leið A: API skilar relevant Veðurstofan forecast rows fyrir hverja route point/station og UI velur nærstu röð út frá virku ETA.
- Sýna matched ftimeIso/freshness í detail UI.
- Bæta við targeted tests fyrir success/reject/timeout/no-data og active ETA selection.
- Keyra targeted tests, type-check, lint og build.
- Gera handoff eftir patch.

Ekki innifalið:
- Ekki skrifa SQL/migration.
- Ekki breyta Supabase schema eða keyra migration.
- Ekki commit-a.
- Ekki push-a.
- Ekki deploy-a.
- Ekki gera cron/scheduled job ennþá.

Sérstaklega:
- Meðhöndla timeout sem provider-contract með stale fallback ef stale cache er til, ekki bara route-level race sem hendir öllum Veðurstofugögnum.
- Phase 2B / okkar canonical Supabase weather store á að fá sér plan síðar.
```

## Open Questions / Needs Confirmation

- Exact timeout budget for provider calls: Codex suggests starting around 1-2 seconds for optional Veðurstofan enrichment in the user request path, but Stebbi owns the product tolerance.
- What counts as too stale to use for safety guidance? Example thresholds could be "stale under 6 hours: usable with label" and "older than 24 hours: show strong warning or unavailable", but this needs a product decision.
- Official Veðurstofan reuse/storage/attribution terms should be confirmed before production rollout of a stored-data architecture.
