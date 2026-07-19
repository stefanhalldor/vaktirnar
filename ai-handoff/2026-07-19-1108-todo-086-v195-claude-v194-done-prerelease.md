# 2026-07-19 11:08 - TODO 086 v195 - Claude done: v194 hotfixes, pre-release

Created: 2026-07-19 11:08
Timezone: Atlantic/Reykjavik

## What Was Fixed (from v194 blockers)

### 1. Blocker fixed: route_caution_ids removed from upsert payload

File: `lib/iceland-routes/routeMemory.server.ts`

`route_caution_ids` removed from the `recordRouteMemory()` upsert payload.
It is now a comment only. This means deploying without sql/87 will NOT break
route-memory warming. The full caution feature (write + lookup + UI) is
deferred to a later atomic step once sql/87 is confirmed run everywhere.

`RouteMemoryWriteInput.routeCautionIds` type field and `warmRouteMemoryFromOptions`
pass are left in place (they are no-ops until the upsert includes the column).

### 2. Blocker fixed: threshold save side effect removed

Files: `components/weather/WeatherThresholdBar.tsx`, `components/weather/WeatherOverviewClient.tsx`

`WeatherThresholdBar` now has an optional `onSaveDefault` prop:
- In `alwaysOpen` mode, the button calls `onSaveDefault` when provided,
  or falls back to `onApply` when not provided (backward compat).
- `onChange` handlers still call `onApply` on valid values (local apply, no save).

`WeatherOverviewClient`:
- `onApply` now only calls `setOverrides` (no save, no redirect).
- `onSaveDefault` calls `handleSaveAsDefault` (redirect or API write, explicit only).

Result:
- Typing valid values updates the map immediately.
- Typing never calls `/api/teskeid/weather/preferences/thresholds`.
- Typing never redirects a public user.
- Only clicking "Vista sem sjálfgefin vindmörk" / "Uppfæra sjálfgefin vindmörk" saves or redirects.

### 3. Hardened: route-memory refetch stale-response guard

File: `components/weather/WeatherOverviewClient.tsx`

`fetchRouteMemoryForPair` now captures `from.key` and `to.key` at request start.
Before applying the response, it checks that the refs still match. If the pair
changed while the request was in-flight, the response is silently discarded.

## Answers to v194 Questions

1. Was the threshold save side effect fully removed?
   YES. `onApply` only applies locally. `onSaveDefault` is the only path to save/redirect.

2. Do saved authenticated thresholds auto-apply on `/vedrid` page load?
   YES. This was already fixed in the previous pass (setOverrides called alongside
   setSavedDefaultThresholds in the preferences load effect).

3. Does route-memory lookup refetch for the same selected pair after focus/visibility/pageshow?
   YES. `fetchRouteMemoryForPair` is called from `focus`, `visibilitychange` (visible only),
   and `pageshow` listeners. The stale-response guard now also ensures pair changes
   cannot overwrite newer pair data.

4. Was `warm-vegagerdin` added to `vercel.json` only, with no deploy?
   YES. Added in previous pass, no deploy.

5. Which migrations are required before Stebbi can safely test in production?
   - sql/82: required for saved wind thresholds to persist (weather_user_preferences).
   - sql/83: required for Vegagerðin history fallback.
   - sql/86: required for route-memory picker/filtering and variant pills.
   - sql/87: NOT required for this release. Caution IDs deferred.
   - sql/85: do not run (previously marked draft/not ready).

6. What exact tests were run?
   - `npm run type-check`: exit 0
   - `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts`
     3 files, 69 tests, exit 0

## Release Checklist (Stebbi)

### Before commit/push

- [ ] Confirm sql/82, sql/83, sql/86 have been run in the target environment
- [ ] Confirm vercel.json `*/3 * * * *` cron is supported by Vercel plan (Pro/team)
- [ ] Confirm `CRON_SECRET` is set in production Vercel env
- [ ] Confirm `WEATHER_ENABLED` is not `off` in production

### sql/87 (caution metadata) — deferred

- sql/87 is prepared but NOT required for this release.
- Do not include `route_caution_ids` in the SELECT or upsert until sql/87 is
  confirmed run everywhere. A separate follow-up pass will do the full atomic wiring.

### Localhost checks before approving commit

1. `/vedrid` — threshold behavior:
   - Public user: type values, map updates, no redirect; click save button, redirects
   - Logged-in: type values, map updates, no API calls; click save button, saves once; reload, values auto-apply
2. `/vedrid` — variant pills:
   - Select pair with multiple stored variants; pills appear
   - Go to /ferdalagid, calculate route, return; pills refresh without hard reload
   - Selected variant stays selected after focus refetch if it still exists
3. `/vedrid` — Vegagerðin: should not be gray (after warm-vegagerdin cron activates on deploy)

### After production deploy

1. Vercel dashboard -> Settings -> Cron Jobs:
   - `/api/cron/warm-vegagerdin` on `*/3 * * * *`
2. Runtime logs after 3+ minutes:
   - `requestPath:/api/cron/warm-vegagerdin` — expect 200 responses
3. Production `/vedrid`: Vegagerðin pill active, not gray

## Files Changed in This Pass (v194 hotfixes)

- `lib/iceland-routes/routeMemory.server.ts` — removed route_caution_ids from upsert
- `components/weather/WeatherThresholdBar.tsx` — added onSaveDefault prop, button split
- `components/weather/WeatherOverviewClient.tsx` — split onApply/onSaveDefault, stale guard

## All Files Changed Across This Session (v191-v195)

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherThresholdBar.tsx`
- `lib/iceland-routes/routeMemory.server.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `vercel.json`
- `messages/is.json`
- `messages/en.json`
- `sql/87_weather_route_memory_route_cautions.sql` (new, do not run without approval)
