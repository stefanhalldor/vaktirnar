# TODO 086 - Codex station-list expansion handoff

Created: 2026-07-12 11:25
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Implementation handoff for Claude Code

## Scope Stebbi Approved

Stebbi asked Codex to continue TODO 086 station list expansion after the previous Codex thread compacted mid-execution.

Approved scope:

- Change `lib/weather/providers/vedurstofanStations.ts`.
- Likely change `lib/__tests__/weather-vedurstofan-stations.test.ts`.
- Preserve existing uncommitted work.
- Finish station-list expansion.
- Run relevant tests and type-check/lint.

Explicitly out of scope:

- No commit.
- No push.
- No deploy.
- No migration or Supabase.
- No unrelated file changes.
- No route integration, UI, feature flag, fetch/cache, or production behavior change.

## Starting State Codex Found

`git status --short` showed a very dirty worktree with many unrelated modified/untracked files. Codex did not touch unrelated files.

The two TODO 086 station files were untracked:

- `lib/weather/providers/vedurstofanStations.ts`
- `lib/__tests__/weather-vedurstofan-stations.test.ts`

`git diff -- lib/weather/providers/vedurstofanStations.ts lib/__tests__/weather-vedurstofan-stations.test.ts` showed no output because both files were untracked, not because they were empty or unchanged.

Existing Phase 1B state in `vedurstofanStations.ts`:

- Mapping helpers were already implemented:
  - `mapRoutePointToVedurstofanStation()`
  - `getUniqueStationIdsForRoute()`
- Haversine distance and confidence thresholds were already implemented:
  - `good`: `<= 5 km`
  - `ok`: `<= 15 km`
  - `weak`: `<= 50 km`
  - `unavailable`: `> 50 km`
- Default station list had only 3 stations:
  - Hellisheiði `31392`, verified coordinates
  - Egilsstaðaflugvöllur `571`, approximate coordinates, `coordinatesVerified: false`
  - Höfn í Hornafirði `5544`, approximate coordinates, `coordinatesVerified: false`

Existing Phase 1B state in `weather-vedurstofan-stations.test.ts`:

- 19 tests existed.
- Covered longitude sign guard, Iceland latitude bounds, non-empty station IDs, no duplicates, Hellisheiði coordinate assertion, confidence bands, nearest-station selection, dedupe, unavailable filtering, and a small multi-station route.

## What Codex Changed

### `lib/weather/providers/vedurstofanStations.ts`

Expanded `VEDURSTOFAN_STATIONS` from 3 stations to 29 route-focused stations.

Coverage focus:

- Capital area / Reykjanes / routes 41, 48 and 51
- Hellisheiði and Suðurland
- South coast Route 1
- Southeast and East Iceland Route 1
- Northeast / North / west Route 1
- Common road-risk or road-relevant Vegagerðin stations where official station pages confirmed IDs and coordinates

Important data-quality change:

- The default list now only contains stations with verified station ID and verified official coordinates.
- `coordinatesVerified` is `true` for every default-list station.
- Egilsstaðaflugvöllur and Höfn were updated from approximate coordinates to official station-page coordinates.
- The old `coordinatesVerified: false` default entries were removed/replaced with verified values.

Comment cleanup:

- Updated coverage comment from "initial seed" to verified curated road-route seed.
- Aligned confidence comment for `GOOD_MAX_M` with implementation: `<= 5 km`.

### `lib/__tests__/weather-vedurstofan-stations.test.ts`

Added/updated tests:

- Default station list only contains verified coordinates.
- Expanded list includes representative route coverage station IDs for routes 1, 41, 48 and 51.
- Known official coordinate assertions now include:
  - Garðabær - Kauptún `31475`
  - Hellisheiði `31392`
  - Egilsstaðaflugvöllur `571`
  - Höfn í Hornafirði `5544`
- Representative route point mapping checks now assert expected nearest stations for:
  - Reykjanesbraut
  - Akrafjall
  - Selfoss
  - Reynisfjall
  - Akureyri - Krossanesbraut
  - Holtavörðuheiði

Test count changed from 19 to 21.

## Station List After Expansion

All longitudes below are WGS84 negative longitudes for Iceland. Veðurstofan pages display west longitudes as positive-looking values, so Codex negated the longitude before adding to code.

| Area | Station | ID | Lat | Lon | Owner | Source URL |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Capital / routes 41, 48, 51 | Garðabær - Kauptún | 31475 | 64.0797 | -21.9029 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=kaupt |
| Route 41 | Keflavíkurflugvöllur | 990 | 63.9802 | -22.5953 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=kvk |
| Route 41 | Reykjanesbraut | 31363 | 64.0027 | -22.2296 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=rbrau |
| Route 48 approach | Kjalarnes | 31579 | 64.2106 | -21.7667 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=kjaln |
| Route 51 / Akranes | Akrafjall | 31572 | 64.3105 | -21.9660 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=akrfj |
| Route 1 / west | Hafnarfjall | 31674 | 64.4755 | -21.9603 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=hfnfj |
| Route 1 / SW | Sandskeið | 31488 | 64.0624 | -21.5577 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=sansk |
| South routes | Þrengsli | 31387 | 63.9876 | -21.4633 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=treng |
| Route 1 / Hellisheiði | Hellisheiði | 31392 | 64.0188 | -21.3424 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=hellh |
| Route 1 / Selfoss approach | Ingólfsfjall | 31399 | 63.9574 | -21.0633 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=ingfj |
| Route 1 / Suðurland | Selfoss | 6300 | 63.9355 | -20.9707 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=sfoss |
| Route 1 / Suðurland | Þjórsárbrú | 36308 | 63.9306 | -20.6653 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=tjors |
| Route 1 / Suðurland | Hella | 6315 | 63.8257 | -20.3654 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=hella |
| Route 1 / South coast | Reynisfjall | 36049 | 63.4521 | -19.0378 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=reyni |
| Route 1 / South coast | Kirkjubæjarklaustur Stjórnarsandur | 6272 | 63.7930 | -18.0119 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=klaus |
| Route 1 / Southeast | Skaftafell | 6499 | 64.0144 | -16.9721 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=skaft |
| Route 1 / Southeast | Fagurhólsmýri | 5309 | 63.8743 | -16.6364 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=fagho |
| Route 1 / Southeast | Höfn í Hornafirði | 5544 | 64.2691 | -15.2135 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=hofnh |
| Route 1 / Southeast-East | Hvalnes | 35666 | 64.4074 | -14.5393 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=hvaln |
| Eastfjords | Teigarhorn | 5872 | 64.6757 | -14.3444 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=teiga |
| East / Route 1 | Egilsstaðaflugvöllur | 571 | 65.2830 | -14.4025 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=egflu |
| Route 1 / Northeast highland edge | Möðrudalur | 4830 | 65.3754 | -15.8833 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=modal |
| Route 1 / Northeast | Grímsstaðir á Fjöllum | 4323 | 65.6422 | -16.1284 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=grist |
| Route 1 / Northeast | Mývatn | 4300 | 65.6193 | -16.9768 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=myvtn |
| Route 1 / North | Akureyri - Krossanesbraut | 3471 | 65.6961 | -18.1113 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=akurk |
| Route 1 / Northwest | Blönduós | 3317 | 65.6580 | -20.2925 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=bldos |
| Route 1 / Northwest | Reykir í Hrútafirði | 2197 | 65.2543 | -21.0978 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=rhrut |
| Route 1 / Holtavörðuheiði | Holtavörðuheiði | 32097 | 64.9899 | -21.0576 | Vegagerðin | https://www.vedur.is/vedur/stodvar/?s=holta |
| Route 1 / Borgarfjörður | Stafholtsey | 1781 | 64.6430 | -21.5893 | Veðurstofa Íslands | https://www.vedur.is/vedur/stodvar/?s=stfey |

## Commands Codex Ran

Before changing files:

```text
git status --short
git diff -- lib/weather/providers/vedurstofanStations.ts lib/__tests__/weather-vedurstofan-stations.test.ts
Get-Content -Encoding UTF8 WORKFLOW.md
Get-Content -Encoding UTF8 lib/weather/providers/vedurstofanStations.ts
Get-Content -Encoding UTF8 lib/__tests__/weather-vedurstofan-stations.test.ts
```

Context/handoff reads:

```text
Select-String -Path TODO.md -Pattern '086|Veðurstof|vedur|station|stöð' -Context 4,10 -Encoding UTF8
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-0950-todo-086-v001-codex-vedurstofan-source-review.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1000-todo-086-v002-claude-v001-phase1-plan.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1003-todo-086-v003-codex-v002-phase0-review.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1030-todo-086-v005-codex-vedurstofan-webservice-findings.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1111-todo-086-v015-codex-v014-review.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1103-todo-086-v012-claude-phase1b-done.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1106-todo-086-v013-codex-v012-phase1b-review.md
Get-Content -Encoding UTF8 ai-handoff/2026-07-12-1109-todo-086-v014-claude-v013-review.md
```

Official web research:

```text
Opened https://www.vedur.is/vedur/stodvar/
Opened official station pages listed in the table above.
```

Edits:

```text
apply_patch edits to lib/weather/providers/vedurstofanStations.ts
apply_patch edits to lib/__tests__/weather-vedurstofan-stations.test.ts
```

Verification:

```text
npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts
npm run type-check
npm run lint
npm.cmd run lint
git status --short -- lib/weather/providers/vedurstofanStations.ts lib/__tests__/weather-vedurstofan-stations.test.ts ai-handoff
```

Handoff creation:

```text
Get-Content -Encoding UTF8 ai-handoff/README.md
[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'Greenwich Standard Time').ToString('yyyy-MM-dd HH:mm')
```

## Verification Results

Station tests:

```text
npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts
Test Files  1 passed (1)
Tests       21 passed (21)
Exit code   0
```

Type-check:

```text
npm run type-check
tsc --noEmit
Exit code 0
```

Lint:

```text
npm run lint
Exit code 1
```

This first lint command failed because PowerShell blocked `npm.ps1` under the local execution policy. It was not a lint failure.

Codex reran via `npm.cmd`:

```text
npm.cmd run lint
next lint
Exit code 0
```

Lint passed with existing warnings in unrelated files:

- `app/s/[sessionId]/page.tsx`: missing hook dependencies
- `components/landing/Avatar.tsx`: `<img>` warning
- `components/weather/TravelAuditMap.tsx`: missing hook dependencies

Codex did not change those files.

## What Was Not Done

- No commit.
- No push.
- No deploy.
- No migration.
- No Supabase access.
- No SQL.
- No env or feature flag changes.
- No UI changes.
- No `/vedrid` route integration.
- No fetch/cache wrapper.
- No live calls to `xmlweather.vedur.is` from app code or tests.
- No change to `route.ts`, `assessment.ts`, `travel.ts`, `metno.server.ts`, parser code, or public API behavior.

## Current Git Caveat

The two edited station files are still untracked:

```text
?? lib/__tests__/weather-vedurstofan-stations.test.ts
?? lib/weather/providers/vedurstofanStations.ts
```

This is expected because Phase 1A/1B files appear to be untracked in the worktree. Claude Code should preserve all uncommitted/untracked work and should not assume `git diff` shows these changes unless using `git diff --no-index` or reading the files directly.

The new handoff file is also untracked:

```text
?? ai-handoff/2026-07-12-1125-todo-086-v016-codex-station-list-expansion-handoff.md
```

## Risks / Notes For Claude Code

No blockers found in this station-list expansion.

Remaining considerations:

- The station mapping is still nearest-station only. It does not know about road segments, terrain barriers, fjords, mountain passes, or microclimates.
- The expanded list is better but still curated, not exhaustive. Later shadow comparison should still surface `distanceFromRoutePointM` and confidence.
- All default-list coordinates are now verified, so `coordinatesVerified` can remain metadata for now. If future unverified candidate stations are added, do not put them in the default mapper without either filtering or confidence downgrade logic.
- This expansion does not prove all station IDs return usable `type=forec` data at runtime. Previous live probes verified several sample IDs and the XML service pattern, but Phase 1C should still handle missing/invalid station responses fail-open.
- `owner` for Egilsstaðaflugvöllur was changed to `Veðurstofa Íslands` to match the official station page.

## Suggested Next Step

Claude Code can proceed to review this station expansion first.

If Stebbi then gives explicit implementation permission, the next technical slice can be Phase 1C:

- fetch/cache/batch wrapper for explicit station IDs;
- cache-first behavior;
- parsed JSONB per station;
- small stable station batches;
- timeout/fail-open behavior;
- server-only flag;
- no user-facing route behavior change by default.

Do not wire broad route-level shadow comparison into `/vedrid` until Phase 1C is reviewed and Stebbi explicitly approves that integration.

## Questions For Claude Code To Review

1. Is the station set broad enough for first shadow comparison coverage, or should Phase 1C remain explicit-station-only until more regions are added?
2. Should `VEDURSTOFAN_STATIONS` stay in TypeScript, or should it move to JSON later if the list grows materially?
3. Should Phase 1C filter to `coordinatesVerified === true` defensively even though the current default list is all verified?
4. Should fetch batching use a hard max station count per request, e.g. 10, even if XML supports more?
5. Do any selected stations look too coastal/town-specific for Route 1 road conditions and need later road-segment overrides?

## Supabase / SQL / Auth / Production

No Supabase, SQL, auth, RLS, production data, user data, secrets, billing, deployment, GitHub push, or external production service was changed.

Only public official Veðurstofa station information pages were read for station metadata.

## Localhost checks for Stebbi

This station-list expansion should not change anything user-visible yet because it is not integrated into `/vedrid` route calculation.

Recommended checks before any release or next phase:

1. Run `npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts`.
2. Expected: 21 tests pass.
3. Run `npm run type-check`.
4. Expected: TypeScript passes.
5. Optional browser smoke check: open `/vedrid` or `/auth-mvp/vedrid` on localhost and calculate one familiar route.
6. Expected: current MET/Yr behavior is unchanged, no Veðurstofan text appears, and no live calls to `xmlweather.vedur.is` happen during normal navigation.

Do not test this by repeatedly hammering Veðurstofa endpoints. Phase 1C should use fixtures/cache and conservative batching before any live fetch behavior is introduced.

No Supabase, auth, RLS, SQL, deployment, billing, secrets or user-data behavior should be tested for this station-list expansion because none of those systems were touched.
