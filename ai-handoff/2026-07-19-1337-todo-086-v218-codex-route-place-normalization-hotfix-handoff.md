# TODO 086 / v218 - Codex handoff - route-place normalization hotfix

Created: 2026-07-19 13:37
Timezone: Atlantic/Reykjavik

## Status

Codex implemented a scoped hotfix for route-memory place normalization.

Stebbi reported two related failures:

- Reykjavik -> Stora-Borg did not appear as a `/vedrid` route-memory pill, even after going to the final travel step.
- Akranes -> Borgarnes also did not save as a route-memory pill.

Codex made repo-only code/test changes. Codex did not commit, push, deploy, run SQL, run migrations, touch Supabase, run cron, or change production data.

## Root-cause assessment

There appear to be two failure modes in this area:

1. Route-memory writer fallback for environments without `sql/87`.
   - `recordRouteMemory()` now contains the 42703 fallback that retries route upsert without `route_caution_ids`.
   - `lib/__tests__/route-memory-record.test.ts` exists and covers that fallback.
   - At the time of this v218 handoff, this writer fallback was already present in the working tree/tracked state and was not part of the latest diff.

2. Route-place normalizer choosing a road name before a valid selected place name.
   - In the screenshot, selected destination name was `Stora-borg` / `Stóra-borg`.
   - The formatted address/subtitle was `Biskupstungnabraut, 805`.
   - The old normalizer checked generic `formattedAddress` before using the selected `name`.
   - It could therefore normalize to:
     - key: `biskupstungnabraut`
     - label: `Biskupstungnabraut`
   - That means `/vedrid` would never show a `Stora-Borg` pill, because the route-memory row would either be written under the wrong place key or skipped/missed in the expected lookup.

Akranes -> Borgarnes matters because those names are not road-like and should self-register cleanly. If that pair still failed before this fix, the likely cause was writer failure rather than normalizer. The current state covers both protections:

- writer fallback for missing `route_caution_ids`
- normalizer hardening for road-like formatted addresses

## What Codex changed in v218

### `lib/iceland-routes/routePlaceNormalization.ts`

Changed route-memory generic normalization:

- Added `ROAD_LIKE_SUFFIX` so road labels such as `Biskupstungnabraut`, `Hringvegur`, `...vegur`, `...gata`, `...braut`, `...stigur`, and `...leid` are not treated as public localities.
- Added `formatGenericPlaceLabel()` to normalize generic display labels into title-ish casing:
  - `Stóra-borg` -> `Stóra-Borg`
- Added `normalizeGenericCandidate()` as a shared candidate validator for both selected `name` and formatted-address parts.
- Changed resolution order:
  1. Alias table still wins first.
  2. Clean selected place `name` is preferred next.
  3. Generic formatted-address parser runs last.

Why this is important:

- A valid selected Google place name should win over a road-only formatted address.
- Street addresses such as `Melás 8, Garðabær` still work because `Melás 8` is rejected by digits, then `Garðabær` is found in the address.
- Road names such as `Biskupstungnabraut` are rejected as route-memory place labels.

### `lib/__tests__/route-place-normalization.test.ts`

Added regression tests:

- `normalizePlaceForMemory('Stóra-borg', 'Biskupstungnabraut, 805')`
  - returns `{ key: 'storaborg', label: 'Stóra-Borg' }`
- `normalizePlaceForMemory('Biskupstungnabraut', 'Biskupstungnabraut, 805')`
  - returns `null`
- `normalizePlaceForMemory('Akranes')`
  - returns `{ key: 'akranes', label: 'Akranes' }`

## Related writer fallback already present

Claude Code should confirm this is included before deploy:

- `lib/iceland-routes/routeMemory.server.ts`
  - `recordRouteMemory()` has `routePayloadBase`
  - first upsert includes `route_caution_ids`
  - on Postgres `42703`, it retries without `route_caution_ids`
  - after fallback success, station delete/insert proceeds

Covered by:

- `lib/__tests__/route-memory-record.test.ts`

This matters because if production has not run `sql/87`, route-memory writes must still succeed without caution metadata.

## Files changed by Codex in this v218 hotfix

Runtime:

- `lib/iceland-routes/routePlaceNormalization.ts`

Tests:

- `lib/__tests__/route-place-normalization.test.ts`

Already-present related files to review:

- `lib/iceland-routes/routeMemory.server.ts`
- `lib/__tests__/route-memory-record.test.ts`

No SQL files changed.

No message files changed.

No UI files changed.

## Commands run by Codex

```bash
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/route-memory-record.test.ts
```

Result:

- exit 0
- 2 test files passed
- 33 tests passed

```bash
npm run type-check
```

Result:

- exit 0

```bash
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/middleware.test.ts
```

Result:

- exit 0
- 4 test files passed
- 126 tests passed

```bash
npm run build
```

Result:

- exit 0
- Next build completed with warnings only
- Warnings appear to be the same known warnings as before, including weather hook dependency warnings

## Current working tree notes

At handoff time, `git status --short` showed:

- Modified unrelated:
  - `.obsidian/workspace.json`
- Modified by v218:
  - `lib/__tests__/route-place-normalization.test.ts`
  - `lib/iceland-routes/routePlaceNormalization.ts`
- Untracked handoff/review docs from this release chain:
  - multiple `ai-handoff/2026-07-19-*` files

Claude Code should avoid committing `.obsidian/workspace.json`.

Claude Code should decide with Stebbi whether to commit the handoff docs or only the code/test hotfix.

## Review request for Claude Code

Please review before push/deploy:

1. Confirm the new normalizer ordering is correct:
   - alias table first
   - clean selected name second
   - formatted address fallback third
2. Confirm `ROAD_LIKE_SUFFIX` is not too broad for expected public localities.
   - It intentionally rejects labels ending in `vegur`, `gata`, `braut`, `stigur`, `leid`.
   - This is meant for route-memory public-locality storage, not arbitrary place search.
3. Confirm `formatGenericPlaceLabel()` is acceptable for generic self-registered place labels.
4. Confirm street-address cases still pass:
   - `Melás 8, Garðabær`
   - `Strandvegur 4, Sandgerði`
5. Confirm the writer fallback for missing `route_caution_ids` is present and tested.
6. Confirm no SQL/RLS/auth/security change is introduced.

## Suggested commit scope

Commit only code/test files needed for hotfix:

- `lib/iceland-routes/routePlaceNormalization.ts`
- `lib/__tests__/route-place-normalization.test.ts`
- `lib/iceland-routes/routeMemory.server.ts` if not already committed in Claude's current branch
- `lib/__tests__/route-memory-record.test.ts` if not already committed in Claude's current branch

Optional if Stebbi wants history docs committed:

- this handoff file
- relevant previous v217 handoff

Do not commit:

- `.obsidian/workspace.json`
- unrelated untracked handoff files unless Stebbi explicitly wants them included

Suggested commit message:

```text
fix: prefer selected route-memory place names over road labels
```

## Deployment note

After deploy, old failed route attempts probably did not write the expected route-memory rows. Stebbi should recalculate affected routes after the hotfix is live:

- Reykjavik -> Stora-Borg
- Akranes -> Borgarnes

If route rows were previously written under wrong key `biskupstungnabraut`, they may remain in the DB. This hotfix does not clean old route-memory rows. Cleanup should be separate and only after read-only inspection confirms the exact bad keys.

## Route intelligence check

Route/place families touched:

- Generic public-locality self-registration in route memory.
- Reykjavik -> Stora-Borg.
- Akranes -> Borgarnes.

Does this add manual route knowledge?

- No.
- It does not whitelist Stora-Borg manually.
- It improves the generic parser so selected public place names win over road-only formatted addresses.

Provider neutrality:

- This is provider-neutral normalization before route-memory station matching.
- Station matching remains provider-specific only where provider station IDs are stored.

Privacy:

- No user ID stored.
- No raw street address stored.
- No raw Google route geometry stored.
- No Google place ID stored.
- Only normalized public place key/label and provider station IDs are used downstream.

IcelandRoadmap:

- No new canonical segment/control point needed.
- No `IcelandRoadmap.md` update required for this hotfix.
- This is a route-memory intake hardening fix.

## Localhost checks for Stebbi

Stebbi runs localhost/dev server.

### 1. Stora-Borg route-memory save

Setup:

- Start from a state where Stora-Borg is not visible as a `/vedrid` route-memory pill.

Steps:

1. Open `/vedrid/ferdalagid`.
2. Select `Reykjavik` as origin.
3. Select `Stora-borg` / `Stóra-borg` as destination, with subtitle like `Biskupstungnabraut, 805`.
4. Let route options load.
5. Continue to final step if desired.
6. Open or reload `/vedrid`.

Expected:

- `Stóra-Borg` appears as a place pill.
- Selecting `Reykjavik` shows `Stóra-Borg` as destination, or selecting `Stóra-Borg` shows `Reykjavik`.
- Selecting both filters the map to route-memory stations.

Regression to watch:

- `Biskupstungnabraut` should not appear as a route-memory pill.
- Route should not be missing just because Google returned two route options.

### 2. Akranes -> Borgarnes

Steps:

1. Open `/vedrid/ferdalagid`.
2. Calculate route options for `Akranes` -> `Borgarnes`.
3. Return to `/vedrid`.

Expected:

- `Akranes` and `Borgarnes` are available through route-memory picker.
- The route can be selected bidirectionally.
- Map filters to the route.

If this still fails after deploy, check server logs for `[route-memory] upsert failed` or route-memory write errors. Since both names are clean, a remaining failure would point away from normalization and toward route-memory write, DB schema/grants, or route-options warming.

### 3. Existing street/locality behavior

Steps:

1. Test an address-style route where the selected display name is street-like but formatted address has a municipality, e.g. `Melás 8, Garðabær`.
2. Calculate route.

Expected:

- Route-memory stores/looks up `Garðabær`, not `Melás`.
- Existing capital-area aliases still work.

### 4. Multi-route options

Steps:

1. Pick a route pair that returns two Google route options.
2. Let options load.
3. Return to `/vedrid`.

Expected:

- The place endpoints appear.
- Multiple route options do not prevent route-memory place registration.
- Dedupe/variant dominance may affect route pills later, but it should not remove endpoints from `/route-memory/places`.

### What not to test casually

- Do not delete route-memory rows in production just to retest.
- Do not run SQL cleanup without explicit Stebbi approval.
- Do not run migrations as part of this hotfix unless Stebbi separately asks for it.

## Production smoke after deploy

1. Deploy the hotfix.
2. Recalculate Reykjavik -> Stora-Borg on production.
3. Open `https://www.teskeid.is/vedrid`.
4. Confirm `Stóra-Borg` appears.
5. Recalculate Akranes -> Borgarnes on production.
6. Confirm both endpoints appear and can filter the map.
7. Watch logs for:
   - acceptable if `sql/87` missing: `route_caution_ids column missing on write, falling back`
   - not acceptable: persistent `[route-memory] upsert failed`

## Remaining risk

Low to medium.

The normalizer and writer fallback are covered by unit tests and build is green. Codex did not inspect production DB rows. If bad rows under `biskupstungnabraut` already exist, they may still appear until cleaned. Cleanup should be planned separately with read-only SQL first.
