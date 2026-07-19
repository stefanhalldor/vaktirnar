# 2026-07-19 10:15 - TODO 086 v190 - Codex review of Claude v189 and route-variant pill plan

Created: 2026-07-19 10:15
Timezone: Atlantic/Reykjavik

## Context

Review of:

- `ai-handoff/2026-07-19-1015-todo-086-v189-claude-v189-done-prerelease.md`

Stebbi added a product direction after v189:

- default should still show all route variants for a selected exact `Frá`/`Til`
  pair
- when more than one route variant exists, `/vedrid` should offer route-variant
  pills in the same general style as the current `Frá`/`Til` pills
- individual route pills should be sorted so the best weather outlook is first
- route pills should also indicate dangerous/cautious route variants, e.g.
  `Varasöm leið`

## Findings

### 1. v189 fixes the immediate station-loss bug

Severity: resolved.

`components/weather/WeatherOverviewClient.tsx:147-154` now unions station IDs
across every returned route-memory variant:

- `vedurstofanStationIds`
- `vegagerdinStationIds`

`lib/iceland-routes/routeMemory.server.ts:191-197` also raises the lookup cap
from 5 to 20 and updates the JSDoc away from `variants[0]`.

This should fix the bug where `/vedrid` showed only one Reykjavík -> Egilsstaðir
route station set while `/ferdalagid` had more than one route option.

### 2. Product gap: union-all is correct as default, but multi-variant routes now need a selector

Severity: medium, product/UX.

The v189 behavior is technically correct for the first safe implementation:
show all known station IDs for an exact pair. But Stebbi is right that on some
pairs this can feel like "the whole ring" rather than a clear route choice.

Recommended next behavior:

- Show `Allt` / `Allar leiðir` as the default active pill.
- If `variants.length > 1`, show one pill per route-memory variant after
  `Allt`.
- Selecting a variant pill filters the map to only that variant's station IDs.
- Clearing or selecting `Allt` returns to the current v189 union behavior.
- The variant pills should not open station cards.

This is a better product shape than reverting to one variant, because it keeps
the overview honest while giving users control.

### 3. "Varasöm leið" cannot be accurate unless route-memory stores caution metadata

Severity: medium if this is required before release.

Current route-memory stores:

- `route_variant_key`
- `route_variant_label`
- station IDs

`app/api/teskeid/weather/travel/routes/route.ts:218-219` only persists the first
curated `CURATED_*` label as `routeVariantLabel`.

But `/ferdalagid` route options can also contain `cautions`:

- `lib/weather/provider.types.ts:39-47`
- `components/weather/RouteSelectionStep.tsx:598-610`

If `/vedrid` must show `Varasöm leið`, route-memory needs a small persisted
variant-level caution field. Otherwise `/vedrid` will have to guess from
curated labels, which is brittle and could mark the wrong route.

Recommended data shape:

- Add a new migration, do not edit already-run `sql/86_weather_route_memory.sql`
  if it has been run anywhere.
- Add nullable/default-safe metadata to `weather_route_memory_routes`, for
  example:
  - `route_caution_ids text[] not null default '{}'`
- In `recordRouteMemory`, upsert the caution IDs from
  `routeOption.cautions?.map(c => c.id)`.
- In lookup API, return `routeCautionIds` per variant.
- In `/vedrid`, show a compact `Varasöm leið` chip/pill state when
  `routeCautionIds.length > 0`.

No raw Google geometry, addresses, user IDs, durations, or route steps should be
stored for this.

### 4. Weather ranking must reuse the same status logic as the map/pills

Severity: medium, consistency risk.

The route-variant pills should not invent a separate risk algorithm. They should
rank variants using the same status model already used for `/vedrid` map points
and wind-status pills:

- `Innan marka`
- `Nálgast óþægindi`
- `Óþægilegt`
- `Nálgast hættumörk`
- `Hættulegt`
- no wind / insufficient data states

Suggested rule:

- For the currently selected source/time in the scrubber, compute the worst
  station status per route variant.
- Sort variants by that severity, best first.
- Tie-break by route-memory `usageCount` or `lastSeenAt`, then label.
- Keep `Allt` first and active by default even if a single variant currently
  ranks best.

This keeps `/vedrid` aligned with `/ferdalagid` and avoids a third weather-risk
language.

## Recommended Next Handoff For Claude Code

Implement a small-to-medium pre-release enhancement only if Stebbi wants this
before release. Otherwise ship v189 and schedule this next.

Scope:

1. Preserve v189 default:
   - exact `Frá`/`Til` pair
   - all variants unioned by default
   - no Google call from `/vedrid`
2. Extend route-memory state in `WeatherOverviewClient`:
   - keep `variants` in state instead of immediately flattening and discarding
     them
   - add `selectedRouteVariantKey: string | 'all'`
   - derive visible `vedurstofanIds` and `vegagerdinIds` from the active variant
     or from all variants
3. Add route-variant pills near the route-memory picker:
   - `Allar leiðir` first, active by default
   - one pill per variant when `variants.length > 1`
   - same visual language as current place pills
   - pills must not open station cards
4. Label variants:
   - map `CURATED_*` labels to existing route-option copy where possible
   - fallback to `Leið 1`, `Leið 2` or similarly short translated labels
   - all new user text in `messages/is.json` and `messages/en.json`
5. Weather sort:
   - sort individual variant pills by the same status/severity logic as the map
   - best weather first
   - keep `Allar leiðir` first regardless
6. Caution metadata:
   - if `Varasöm leið` is required now, add a new migration for
     `route_caution_ids`
   - wire writer -> lookup API -> UI
   - if no migration before release, do not fake `Varasöm leið`; leave it for
     the next migration-backed iteration
7. Tests:
   - variant union default still includes both routes
   - selecting variant A filters to A only
   - selecting variant B filters to B only
   - pill order follows severity helper
   - caution metadata renders only when present

## Commands Run By Codex

- `Get-Content -Encoding UTF8 ai-handoff/2026-07-19-1015-todo-086-v189-claude-v189-done-prerelease.md`
  - exit 0
- `git status --short`
  - exit 0
  - showed unrelated `.obsidian/workspace.json` modified and untracked handoff
    files
- `rg -n "variants\\[0\\]|flatMap|routeMemory|variantCount|routeVariant|routeVariantLabel|Varas|warning|caution" components/weather app/api/teskeid/weather lib/iceland-routes messages`
  - exit 0
- `npm run type-check`
  - exit 0
- `npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-observation.test.ts`
  - exit 0
  - 3 files, 69 tests passed

## Design Check

Read `Design.md` for this review.

The recommended route-variant pills should follow the current mobile-first
route-memory picker style:

- compact pills, not extra map(s)
- stable touch targets
- no horizontal overflow on mobile
- no input zoom or keyboard-specific state changes
- no hardcoded user text
- status colors must not be the only meaning; use short text such as
  `Varasöm leið` where relevant

Do not add another map for this release. Stebbi's pill idea is cleaner and keeps
the page focused.

## Route Intelligence Check

Read `IcelandRoadmap.md` for this review.

- Route family touched: multi-option known route pairs, especially Reykjavík ->
  Egilsstaðir and other routes where route alternatives can cover very different
  station sets.
- New route knowledge: if `Varasöm leið` is required, caution IDs belong in
  route-memory or `lib/iceland-routes/`, not as component-only heuristics.
- Provider neutrality: variant filtering must filter both Veðurstofan and
  Vegagerðin station IDs through the same active variant.
- Cache key: use existing route-memory `routeVariantKey`.
- Privacy: still safe if only caution IDs and station IDs are stored. Do not
  store raw Google geometry, raw addresses, user IDs, duration, distance, or
  steps.
- `IcelandRoadmap.md` does not need a doc update for pure UI variant pills, but
  should be updated if a new caution metadata contract is introduced.

## Localhost Checks For Stebbi

For v189 as-is:

1. Open `/ferdalagid`.
2. Calculate Reykjavík -> Egilsstaðir and let all route options load.
3. Return to `/vedrid`.
4. Select Reykjavík and Egilsstaðir.
5. Expected:
   - map shows station sets from all known variants, not only one route
   - no station card opens when selecting route-memory places
   - route filter does not call Google from `/vedrid`

For the proposed route-variant pill enhancement:

1. Repeat the same Reykjavík -> Egilsstaðir setup.
2. On `/vedrid`, select Reykjavík and Egilsstaðir.
3. Expected:
   - `Allar leiðir` is active by default
   - individual route pills appear if more than one variant exists
   - selecting one route pill narrows the map to that exact variant
   - selecting `Allar leiðir` restores the full union
   - variant pills are ordered by best weather for the selected source/time
   - caution variants show `Varasöm leið` only when the data actually contains
     caution metadata

Do not casually test migrations or production data. If a new caution metadata
migration is added, Stebbi needs a separate migration-running decision.

## Release Stance

v189 is acceptable for the original bugfix: it stops `/vedrid` from losing
stations from alternate known routes.

Stebbi's new route-variant pill idea is the right next product step. It is not
required to prove the v189 bugfix, but it may be worth doing before release if
the current union-all map feels too broad for common multi-option routes.

If `Varasöm leið` is required in the first release, do it with a migration-backed
field. Do not fake it from UI guesses.

## Uncertainty / Needs Confirmation

- I did not inspect live Supabase route-memory rows.
- I did not verify whether `sql/86_weather_route_memory.sql` has already been
  run in every environment. If it has, caution metadata must be a new migration,
  not an edit to sql86.
