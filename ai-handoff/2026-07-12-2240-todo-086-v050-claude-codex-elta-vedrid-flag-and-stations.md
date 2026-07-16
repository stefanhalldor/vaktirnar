# TODO 086 - v050 Codex task: elta-vedrid feature flag + station source discovery

Created: 2026-07-12 23:50
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Codex task handoff
Inputs reviewed:
- `ai-handoff/2026-07-12-2240-todo-086-v049-codex-feature-flag-station-source-handoff.md`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `sql/68_feature_access_vedrid.sql`
- `lib/weather/providers/vedurstofanStations.ts`

## Scope for Codex

Two tasks, both planning/research. No commit, push, deploy, or migration.

---

## Task 1: feature flag for `elta-vedrid`

### Current state

The per-user feature flag pattern is well-established in this codebase. Every
feature follows the same three-layer model:

1. Global env kill-switch.
2. Per-feature env flag that lifts per-user gating (graduation path).
3. Per-user `feature_access` DB row if the flag is still on.

Example from `ferdalagid` in `lib/loans/guard.ts`:

```ts
if (featureKey === 'ferdalagid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_TRIP_FLAG !== 'true') return false
  return checkPerUserAccess(email, 'ferdalagid')
}
```

Note: `ferdalagid` has no graduation path (second condition returns false, not
true). `elta-vedrid` should follow the same model - it is a validation tool,
not a general product.

### What is needed

**`lib/loans/guard.ts`**: add `elta-vedrid` case:

```ts
if (featureKey === 'elta-vedrid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_ELTA_VEDRID_FLAG !== 'true') return false
  return checkPerUserAccess(email, 'elta-vedrid')
}
```

**`app/api/admin/feature-access/route.ts`**: add `'elta-vedrid'` to
`ALLOWED_FEATURES`:

```ts
const ALLOWED_FEATURES = ['umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid'] as const
```

**`app/auth-mvp/vedrid/elta-vedrid/page.tsx`**: change guard call from
`'vedrid'` to `'elta-vedrid'`:

```ts
await guardFeatureAccess(user.email!, 'elta-vedrid')
```

**`app/api/teskeid/weather/vedurstofan/stations/route.ts`**: change
`checkFeatureAccess` from `'vedrid'` to `'elta-vedrid'`, and add a check for
`WEATHER_ELTA_VEDRID_FLAG` alongside existing `WEATHER_ENABLED` check.

**SQL migration `sql/70_feature_access_elta_vedrid.sql`**: widen the
`feature_access_feature_key_check` constraint. STOP - do not write or run this
migration until Stebbi gives explicit migration approval. State the requirement
clearly and wait.

The rollback pattern (from sql/68) is:

```sql
ALTER TABLE public.feature_access
  DROP CONSTRAINT IF EXISTS feature_access_feature_key_check;
ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'elta-vedrid'));
```

Note: `ferdalagid` is in `ALLOWED_FEATURES` in the admin API but not in the SQL
migration 68 constraint. Check whether this gap is intentional or an oversight
before deciding whether to include `ferdalagid` in migration 70's constraint.

**Tests to update/add:**

- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`: change
  `checkFeatureAccess` mock from `'vedrid'` to `'elta-vedrid'`, add tests for
  `WEATHER_ELTA_VEDRID_FLAG` gate.
- `lib/__tests__/guard.test.ts`: add `elta-vedrid` test cases covering the three
  layers (WEATHER_ENABLED, WEATHER_ELTA_VEDRID_FLAG, per-user).
- `lib/__tests__/feature-access-api.test.ts`: verify `elta-vedrid` is accepted
  and granted/revoked correctly.

### Admin UI

Check `app/(admin)/admin/page.tsx` to see how the feature selector works. If it
is a hardcoded list, add `elta-vedrid` to that list. If it is driven by
`ALLOWED_FEATURES`, no change needed.

### What to deliver

A plan document listing every file change, the migration SQL (not run), and the
exact env var name (`WEATHER_ELTA_VEDRID_FLAG`). Do not implement until Stebbi
approves the migration scope.

---

## Task 2: station source discovery

### Current state

`lib/weather/providers/vedurstofanStations.ts` says:

```
Coverage status: verified curated road-route seed. Covers routes 1, 41, 48,
51 and common ring-road sections.
```

29 stations. Station IDs were manually curated for road-route coverage, not
extracted from a full station list.

The current fetch URL is:

```
https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W
```

With `ids=<semicolon-separated list>`. There is no known "return all stations"
endpoint in current code.

### Questions to answer

1. Does `xmlweather.vedur.is` support fetching without `ids=` to return all
   available stations?
2. How many stations are available for `type=forec`? Is there an official station
   list or docs page at vedur.is?
3. Is there a `type=obs` endpoint for current observations? What params does it
   accept?
4. How many stations are available for current observations?
5. Which fields are present in current observations? Especially: wind speed,
   wind direction, gusts (`FG`/`FX`), temperature, road conditions.
6. What is `umferðin.is` using? Veðurstofan XML, Vegagerðin road-weather, or
   another service? (Read-only probe only, no scraping internals unless Stebbi
   approves.)
7. Are Vegagerðin-owned stations in the current 29 list the same IDs as stations
   shown on `umferðin.is`?

### How to investigate (read-only)

Official docs first:

- vedur.is has a data/API section. Check for a station registry page or docs
  listing all available station IDs.
- The XML service URL pattern may support omitting `ids=` or using `ids=*` for
  a full list.

If a targeted live HTTP probe is needed to determine the station count:

- Do NOT batch-request all station IDs or hammer the service.
- A single `GET` to the base URL without `ids=` param (or with a known no-id
  response) is sufficient to see if a station list is returned.
- Preserve a small sample of the response in the handoff (first few stations,
  not the full dump).
- Ask Stebbi explicitly before making any live network call, per WORKFLOW.md.

### What to deliver

A handoff document with:

1. The total station count for `type=forec`, sourced from official docs or a
   single read-only probe, clearly attributed.
2. Whether `type=obs` or equivalent exists, what params it takes, and a sample
   of the field set.
3. A statement on `umferðin.is` data source (best-effort, no scraping).
4. A recommendation: should the 29-station seed be expanded immediately, or
   wait until the source is better understood?
5. Suggested language for the `VedurstofanStationExplorerClient` subtitle and
   station list that accurately describes what is being shown (e.g. "curated
   road-weather stations" vs "all weather stations").

---

## Files for Codex to read

- `lib/loans/guard.ts` (full file - understand the pattern)
- `app/api/admin/feature-access/route.ts` (full file)
- `sql/68_feature_access_vedrid.sql` (understand constraint pattern)
- `sql/66_feature_access_facebook_oauth.sql` (compare how new keys were added)
- `app/(admin)/admin/page.tsx` (check feature selector)
- `lib/__tests__/guard.test.ts` (understand existing test patterns)
- `lib/__tests__/feature-access-api.test.ts` (understand existing test patterns)
- `lib/weather/providers/vedurstofanStations.ts` (understand current station list)
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx` (current guard call)
- `app/api/teskeid/weather/vedurstofan/stations/route.ts` (current gate)

## What Codex must NOT do

- Do not write or run a SQL migration without Stebbi's explicit approval.
- Do not expand `VEDURSTOFAN_STATIONS` with unverified stations.
- Do not call live Veðurstofan or Vegagerðin APIs from tests.
- Do not hammer external services. One read-only probe maximum if approved.
- Do not commit, push, deploy, or modify Supabase.
- Do not call `umferðin.is` or scrape its internals without Stebbi approval.

## Open questions for Stebbi (to answer before implementation)

1. Migration approval: adding `elta-vedrid` to `feature_access_feature_key_check`
   requires a SQL migration (sql/70). Do you approve writing and running it?
2. Should `ferdalagid` also be added to the CHECK constraint in migration 70, or
   is the current gap (allowed in admin API but not in constraint) intentional?
3. Do you approve a single read-only HTTP probe to `xmlweather.vedur.is` to
   determine the full station count?
4. Is `umferðin.is` source worth investigating, or is Veðurstofan XML sufficient?
