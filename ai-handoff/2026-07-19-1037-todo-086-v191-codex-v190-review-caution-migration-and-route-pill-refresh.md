# 2026-07-19 10:37 - TODO 086 v191 - Codex review of Claude v190, caution migration, route pill refresh

Created: 2026-07-19 10:37
Timezone: Atlantic/Reykjavik

## Context

Review of:

- `ai-handoff/2026-07-19-1025-todo-086-v190-claude-v190-done-prerelease.md`

Stebbi also reported:

- `Gerum nýtt migration fyrir varasamar leiðir`
- `Ég er ekki að sjá mismunandi leiðir sem pillur ennþá á /vedrid`

## Findings

### 1. Route-variant pills exist in v190, but `/vedrid` likely does not refetch route-memory lookup after `/ferdalagid` warms new variants

Severity: high for Stebbi's current localhost check.

Evidence:

- `components/weather/WeatherOverviewClient.tsx:845-890` renders route-variant
  pills when `routeMemory.status === 'resolved' && sortedVariants.length > 1`.
- `components/weather/WeatherOverviewClient.tsx:130-177` fetches
  `/api/teskeid/weather/route-memory/lookup` only when
  `fromMemoryPlace?.key` or `toMemoryPlace?.key` changes.
- `components/weather/RouteMemoryPicker.tsx` refetches the list of places and
  destinations on window focus / visibility, but that does not necessarily
  refetch the already-selected pair lookup in `WeatherOverviewClient`.

This explains Stebbi's symptom:

1. `/vedrid` has Reykjavík -> Egilsstaðir selected.
2. route-memory lookup previously returned one variant.
3. Stebbi opens `/ferdalagid`, calculates more route options, and route-memory
   warming writes more variants.
4. Stebbi returns to `/vedrid`.
5. The selected keys are unchanged, so the lookup effect does not rerun.
6. `sortedVariants.length` remains 1 in client state, so no variant pills appear.

Recommended fix before release:

- Extract the route-memory pair lookup into a stable `fetchRouteMemoryForPair()`
  callback.
- Call it:
  - when selected `from/to` keys change
  - on window `focus`
  - on `visibilitychange` when visible
  - optionally after `pageshow` for browser back/forward cache
- Preserve AbortController / stale-result protection so a slow old request
  cannot overwrite a newer pair.
- Add a minimal loading/refetch state if needed, but do not add new UI unless
  necessary.

This is separate from the new caution migration. The migration will not fix
missing variant pills if the client has stale lookup state.

### 2. Need a read-only route-memory diagnostic before assuming UI is wrong

Severity: medium.

If route-memory lookup does refetch and still returns one variant, the DB may
only have one variant for that exact normalized pair.

Claude Code should provide Stebbi a read-only SQL diagnostic query, not run it
without explicit permission, for example:

```sql
select
  r.from_place_key,
  r.from_place_label,
  r.to_place_key,
  r.to_place_label,
  r.route_variant_key,
  r.route_variant_label,
  r.last_seen_at,
  count(s.station_id) filter (where s.provider = 'vedurstofan') as vedurstofan_station_count,
  count(s.station_id) filter (where s.provider = 'vegagerdin') as vegagerdin_station_count
from public.weather_route_memory_routes r
left join public.weather_route_memory_stations s
  on s.route_id = r.id
where
  (r.from_place_key = 'reykjavik' and r.to_place_key = 'egilsstadir')
  or
  (r.from_place_key = 'egilsstadir' and r.to_place_key = 'reykjavik')
group by r.id
order by r.last_seen_at desc;
```

Expected for route pills:

- at least two rows for the pair, with distinct `route_variant_key`
- station counts should be nonzero for at least one provider per variant

### 3. New caution migration should be v87 and should not edit already-run sql86

Severity: high if schema is touched.

`sql/86_weather_route_memory.sql` is the live route-memory migration. If it has
been run locally or in production, do not mutate it for caution metadata.

Create a new migration:

- likely `sql/87_weather_route_memory_route_cautions.sql`
- prerequisite: `sql/86_weather_route_memory.sql`
- no RLS weakening
- no grants changes
- no user data
- no raw Google route content

Minimal schema:

```sql
begin;

alter table public.weather_route_memory_routes
  add column if not exists route_caution_ids text[] not null default '{}';

comment on column public.weather_route_memory_routes.route_caution_ids is
  'Route caution IDs derived from /ferdalagid route option matching. No raw route geometry or user data.';

commit;
```

Rollback:

```sql
begin;
alter table public.weather_route_memory_routes
  drop column if exists route_caution_ids;
commit;
```

Do not run this migration until Stebbi explicitly says to run it.

### 4. Wire caution IDs end-to-end; do not fake `Varasöm leið`

Severity: medium.

After the migration exists, wire:

- `lib/iceland-routes/routeMemory.server.ts`
  - `RouteMemoryWriteInput.routeCautionIds?: string[]`
  - upsert payload `route_caution_ids: input.routeCautionIds ?? []`
  - `RouteMemoryVariant.routeCautionIds: string[]`
  - select/map `route_caution_ids`
- `app/api/teskeid/weather/travel/routes/route.ts`
  - pass `routeOption.cautions?.map(c => c.id) ?? []`
- `app/api/teskeid/weather/travel/route.ts`
  - if selected route details still have access to selected option cautions,
    pass them too; otherwise document why option-warming endpoint is the primary
    source for variant caution metadata
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
  - return `routeCautionIds` per variant; provider access gating should not strip
    caution IDs because they are route-level metadata, not provider data
- `components/weather/WeatherOverviewClient.tsx`
  - add `routeCautionIds` to `RouteMemoryVariantData`
  - show `Varasöm leið` or a compact warning mark in the variant pill when
    `routeCautionIds.length > 0`
  - text must come from `messages/is.json` and `messages/en.json`

This keeps `Varasöm leið` backed by actual route-caution data from
`/ferdalagid`, not guesses from labels.

## Why Stebbi May Not See Pills Yet

Most likely causes, in order:

1. The selected `/vedrid` pair lookup is stale because it does not refetch on
   returning from `/ferdalagid`.
2. The route-memory table only contains one variant for the exact normalized
   pair.
3. The extra route option was calculated before v188/v190 warming changes were
   present, so it never got written as a variant.
4. The pair keys are not normalized as expected.

The new caution migration does not address any of these directly. It is needed
for the `Varasöm leið` label, not for basic route-variant pill visibility.

## Recommended Handoff To Claude Code

Do these as one contained pre-release pass:

1. Fix `/vedrid` route-memory lookup refresh:
   - refetch pair lookup on focus/visibility/pageshow when both places are
     selected
   - preserve abort/stale result safety
   - add a focused test or at least a helper-level test if component test
     scaffolding is heavy
2. Create `sql/87_weather_route_memory_route_cautions.sql`:
   - add `route_caution_ids text[] not null default '{}'`
   - comment the column
   - include rollback comment
   - no grants/RLS/policies changes
   - do not run it
3. Wire caution IDs:
   - writer
   - lookup types/API
   - `/vedrid` variant pill UI
   - i18n key for `Varasöm leið`
4. Add/extend tests:
   - SQL static test for sql87
   - route-memory lookup maps caution IDs
   - route-options warming passes caution IDs
   - UI/helper logic marks caution variant without guessing
5. Provide Stebbi the read-only diagnostic query above so he can check whether
   Reykjavík -> Egilsstaðir has multiple variants in local DB.

## Commands Run By Codex

- `Get-Content -Encoding UTF8 ai-handoff/2026-07-19-1025-todo-086-v190-claude-v190-done-prerelease.md`
  - exit 0
- `git status --short`
  - exit 0
  - showed unrelated `.obsidian/workspace.json` modified and untracked
    handoff/review files
- `rg -n "routeVariant|variantPill|selectedRouteVariant|Allar leiðir|route_caution|routeCaution|caution_ids|Varasöm|Varas" components app lib sql messages`
  - exit 0
- `npm run type-check`
  - exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/weather-route-cautions.test.ts`
  - exit 0
  - 4 files, 88 tests passed

## Design Check

No implementation was done by Codex. For Claude Code's next pass:

- Keep route-variant pills compact and in the current route-memory picker area.
- Do not add another map.
- No horizontal overflow on mobile.
- Warning/caution cannot be communicated by color alone; the pill needs text or
  icon+accessible label.
- All new user-facing copy belongs in `messages/is.json` and `messages/en.json`.
- Pill clicks must not open station cards.

## Route Intelligence Check

- Route family touched: route-memory pairs with multiple variants, especially
  Reykjavík -> Egilsstaðir and routes involving known cautions such as Öxi.
- New route knowledge: `route_caution_ids` belongs in route-memory as
  provider-neutral derived route metadata.
- Provider neutrality: caution IDs are route metadata, not Veðurstofan or
  Vegagerðin metadata.
- Cache key: existing `routeVariantKey` remains the right identity for per-route
  pill selection.
- Privacy: adding caution IDs is safe if only IDs are stored. Do not store raw
  Google geometry, route steps, duration, distance, place IDs, user IDs, or raw
  addresses.
- `IcelandRoadmap.md` can remain unchanged for this migration if the handoff
  documents the contract, but it would be reasonable to add one short note once
  the migration is implemented.

## Localhost Checks For Stebbi

After Claude Code implements the next pass, but before migration is run in any
shared environment:

1. Run or ask for the read-only diagnostic query for Reykjavík -> Egilsstaðir.
2. Confirm there are at least two route variants in route-memory.
3. Open `/vedrid`.
4. Select Reykjavík and Egilsstaðir.
5. Expected:
   - `Allar leiðir` appears
   - individual route-variant pills appear
   - returning from `/ferdalagid` after calculating new route options makes the
     new variants appear without a hard browser reload
   - clicking a route pill filters only that route's stations
   - clicking `Allar leiðir` restores the union
   - no station card opens from route pill clicks
6. After `sql/87` is written but not run:
   - do not expect `Varasöm leið` labels to work until the migration has been
     run and route-memory rows have been warmed again
7. After Stebbi explicitly runs `sql/87` locally:
   - calculate a route with a caution in `/ferdalagid`
   - return to `/vedrid`
   - select that route pair
   - expected: variant pill for the caution route shows `Varasöm leið`

Do not run `sql/87`, commit, push, or deploy without explicit Stebbi approval.

## Release Stance

v190 is code-green based on type-check and focused tests, but Stebbi's
observation means the release should wait for the route-memory lookup refresh
hotfix, or at minimum a read-only DB diagnostic proving only one variant exists.

The caution migration is the right next schema change, but it is a separate
release decision from the route-pill visibility issue.

## Uncertainty / Needs Confirmation

- Codex did not inspect live Supabase route-memory rows.
- Codex did not run SQL.
- I am inferring the stale lookup issue from the current React dependencies and
  Stebbi's described localhost behavior. A quick read-only DB diagnostic should
  confirm whether there are actually multiple variants for the pair.
