# TODO 086 v171 - Claude Code done, pre-release

Created: 2026-07-14 21:30:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-1952-todo-086-v170-codex-v169-prerelease-review.md`

Mode:
- Execution (three High/Medium items from v170 with clear Codex recommendations, no disagreement on my end).
- No SQL executed. No commit. No push. No Supabase action.

## What Was Done

### Item 1 — Fix `stillStale` refetch leaving old displayed layer in state (High)

`app/auth-mvp/vedrid/FerdalagidClient.tsx` — `handleRefreshVedurstofan`:

Before: `setVedurstofanLayer(newLayer)` was only called inside the `isVedurstofanCycleFresh(...)` branch. In the `stillStale` branch, the displayed layer stayed as the old state even though the server had returned newer data.

After: always call `setVedurstofanLayer(newLayer)` when `travelRes.ok` and `newLayer` is non-null, then set `vedurstofanRefreshState` based on freshness:

```ts
if (travelRes.ok) {
  const newLayer = travelData.vedurstofanLayer ?? null
  // Always update the displayed layer with the freshest route data we have.
  if (newLayer) setVedurstofanLayer(newLayer)
  const newAtimeIso = newLayer?.layerAtimeIso ?? null
  setVedurstofanRefreshState(
    isVedurstofanCycleFresh(newAtimeIso, new Date()) ? 'fresh' : 'stillStale'
  )
}
```

### Item 2 — Extra-provider gate `extra-weather-providers` (High)

Replaces the two-gate split (`VEDURSTOFAN_TRAVEL_LAYER_ENABLED` + `elta-vedrid`) with one per-user feature key for all non-MET/Yr providers. `elta-vedrid` is kept for the station validator/explorer route only.

**`lib/loans/guard.ts`**: Added `extra-weather-providers` block:
```ts
if (featureKey === 'extra-weather-providers') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_EXTRA_PROVIDERS_FLAG !== 'true') return false
  return checkPerUserAccess(email, 'extra-weather-providers')
}
```

**`app/api/teskeid/weather/travel/route.ts`**: Changed layer gate from
```ts
process.env.VEDURSTOFAN_TRAVEL_LAYER_ENABLED === 'true' && user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'elta-vedrid').catch(() => false)
  : Promise.resolve(false),
```
to:
```ts
user?.id && user?.email
  ? checkFeatureAccess(user.id, user.email, 'extra-weather-providers').catch(() => false)
  : Promise.resolve(false),
```

**`app/api/teskeid/weather/vedurstofan/refresh/route.ts`**: Changed feature key from `elta-vedrid` to `extra-weather-providers`.

**`app/api/admin/feature-access/route.ts`**: Added `extra-weather-providers` to `ALLOWED_FEATURES`.

**`sql/76_feature_access_extra_weather_providers.sql`**: New migration — widens `feature_access_feature_key_check` to include `extra-weather-providers`. NOT to be run until Stebbi explicitly approves Supabase execution.

### Item 3 — Shared Veðurstofan display model (Medium)

`components/weather/VedurstofanPointCard.tsx`:

Added `VedurstofanPointDisplayModel` type and `buildVedurstofanPointDisplayModel(station, etaIso, ftimeIso)` exported helper — one source of truth for:
- `distFromOriginKm` (rounded km from origin)
- `distFromRoadM` (rounded m from road)
- `etaTimeLabel` (formatted clock string)
- `ftimeLabel` (formatted clock string)
- `prev`, `used`, `next` forecast rows (via `selectPrevUsedNext`)

Both `VedurstofanJourneySummary` and `VedurstofanPointCard` now call `buildVedurstofanPointDisplayModel` and destructure what they need — same data selection logic, no duplication.

### Tests

- `lib/__tests__/guard.test.ts`: added 8 tests for `extra-weather-providers` (kill-switch, FLAG=true per-user, fail-closed on DB error, invalid email)
- `lib/__tests__/feature-access-api.test.ts`: added 4 tests for `extra-weather-providers` API (GET, POST, DELETE, key isolation)
- `lib/__tests__/weather-travel-api.test.ts`: updated to remove `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` references; both "lacks access" tests now assert against `extra-weather-providers` semantics
- `lib/__tests__/sql-migration.test.ts`: added 5 tests for `sql/76`

All 386 affected tests pass (311 + 75).

## Files Changed

Application code:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — item 1: always update layer on successful refetch
- `lib/loans/guard.ts` — item 2: extra-weather-providers gate
- `app/api/teskeid/weather/travel/route.ts` — item 2: gate via extra-weather-providers
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts` — item 2: gate via extra-weather-providers
- `app/api/admin/feature-access/route.ts` — item 2: ALLOWED_FEATURES
- `components/weather/VedurstofanPointCard.tsx` — item 3: shared display model

SQL (not to be run):
- `sql/76_feature_access_extra_weather_providers.sql` — new migration file

Tests:
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/feature-access-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/__tests__/sql-migration.test.ts`

## What Was NOT Done

- `elta-vedrid` is still in `guard.ts` and the admin API for the station validator/explorer route. No decision was made to remove it.
- SQL migration 76 is not executed. Requires Stebbi's explicit Supabase approval.
- No env var `WEATHER_EXTRA_PROVIDERS_FLAG` was added to `.env` or Vercel — that is Stebbi's action.

## Localhost Checks For Stebbi

Per v170 spec:

1. Add `WEATHER_EXTRA_PROVIDERS_FLAG=true` to local `.env`.
2. Grant `extra-weather-providers` access to your test user via the admin API or directly in `feature_access` (after running migration 76 on Supabase).
3. Open `/auth-mvp/vedrid` as that user; choose Reykjavík to Stóra-Borg.
4. Toggle Veðurstofan on. If stale banner shows, click "Sækja ný gögn".
5. Expected: the displayed layer updates even if global warm response is `stillStale`; stale banner clears only if route stations are now fresh.

6. As an unflagged user (no `extra-weather-providers` row):
   - Provider selector should not expose Veðurstofan.
   - Travel API should return MET/Yr-only result.
   - Manual refresh endpoint should return 403.

7. Compare same station in "Á leiðinni", selected map point, "Allir spápunktar":
   - Same station name, ETA, distance context, issue time, wind value.
   - Full card shows prev/used/next rows; compact summary does not — but values must agree.

## Supabase / SQL Notes

- Run `sql/76_feature_access_extra_weather_providers.sql` only after Stebbi explicitly approves.
- Until then, `extra-weather-providers` is not in the DB constraint and cannot be inserted into `feature_access`.
- The `WEATHER_EXTRA_PROVIDERS_FLAG` env var in `.env` / Vercel is also Stebbi's action.
