# TODO 086 / v217 - Codex handoff - Stora-Borg route-memory hotfix

Created: 2026-07-19 13:20
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported that after setting up the first step in `/ferdalagid` for Reykjavik -> Stora-Borg, he expected to see `Stora-Borg` immediately as a selectable route-memory place on `/vedrid`, but it did not appear.

Stebbi asked Codex to hotfix this ASAP. Codex interpreted that as explicit, scoped permission to make a small code/test hotfix in the repo only.

This did not include permission for:

- commit
- push
- deploy
- SQL or migration execution
- production data changes
- Supabase console/API changes
- cron execution

## Diagnosis

The problem did not appear to be the generic place normalizer. The existing self-registering normalization can normalize a new public locality from name/address without adding a manual whitelist entry.

The likely runtime failure was in route-memory writes when `sql/87` has not yet been applied in the target environment.

Before this hotfix:

- `lookupRouteMemory()` already had a fallback when `route_caution_ids` was missing:
  - on Postgres `42703`, it re-queries without `route_caution_ids`
- `recordRouteMemory()` did not have the same fallback:
  - it always attempted to upsert `route_caution_ids`
  - if the DB did not have `route_caution_ids`, the upsert failed with `42703`
  - the helper returned before station rows were written
  - therefore the route-memory row never existed
  - `/api/teskeid/weather/route-memory/places` had no `Stora-Borg` row to return

This matches the symptom: `/ferdalagid` can calculate the route, but `/vedrid` cannot see the new place because route-memory self-registration failed.

## What Codex changed

### 1. Runtime fallback in route-memory writer

File:

- `lib/iceland-routes/routeMemory.server.ts`

Change:

- Extracted a `routePayloadBase` object without `route_caution_ids`.
- First upsert still tries to write `route_caution_ids` when available.
- If that upsert returns Postgres error code `42703`, writer retries the same route upsert without `route_caution_ids`.
- If fallback succeeds, station rows are deleted/reinserted as before.

Effect:

- Environments without `sql/87` can still self-register route-memory routes and provider stations.
- Only caution metadata is omitted in those environments.
- Once `sql/87` exists, the first write path continues storing `route_caution_ids`.

Important:

- This is a compatibility fallback, not a replacement for running `sql/87`.
- The log message says `route_caution_ids column missing on write, falling back (run sql/87)`.

### 2. Normalization regression test for Stora-Borg

File:

- `lib/__tests__/route-place-normalization.test.ts`

Change:

- Added a test that `normalizePlaceForMemory('Stora-Borg')` self-registers to:
  - key: `storaborg`
  - label: `Stora-Borg`

Note:

- The source file uses Icelandic characters in the actual test string: `Stóra-Borg`.

### 3. New route-memory writer fallback test

File:

- `lib/__tests__/route-memory-record.test.ts`

Change:

- Added a server-helper unit test for `recordRouteMemory()`.
- Mocks Supabase admin client.
- First route upsert returns `{ code: '42703' }`.
- Second route upsert succeeds without `route_caution_ids`.
- Test verifies:
  - two upsert attempts
  - first payload includes `route_caution_ids`
  - fallback payload omits `route_caution_ids`
  - station delete/insert still proceeds after fallback success

## Files changed by Codex

Runtime:

- `lib/iceland-routes/routeMemory.server.ts`

Tests:

- `lib/__tests__/route-place-normalization.test.ts`
- `lib/__tests__/route-memory-record.test.ts`

No message files changed.

No SQL files changed.

No migrations were written or run.

No production services were touched.

## Commands run by Codex

```bash
npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/route-memory-record.test.ts
```

Result:

- exit 0
- 2 test files passed
- 30 tests passed

```bash
npm run type-check
```

Result:

- exit 0

```bash
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/vegagerdin-history.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts
```

Result:

- exit 0
- 3 test files passed
- 72 tests passed

```bash
npm run build
```

Result:

- exit 0
- Build completed with warnings only
- Warnings appear to be the same known warnings as before, including hook dependency warnings in weather components and unrelated existing lint warnings.

## Current working tree notes

At handoff time, `git status --short` showed:

- Modified, unrelated:
  - `.obsidian/workspace.json`
- Modified by this hotfix:
  - `lib/__tests__/route-place-normalization.test.ts`
  - `lib/iceland-routes/routeMemory.server.ts`
- New by this hotfix:
  - `lib/__tests__/route-memory-record.test.ts`
- Untracked handoff docs from the ongoing release chain:
  - several `ai-handoff/2026-07-19-*` files, including this one

Claude Code should not include `.obsidian/workspace.json` in the hotfix commit unless Stebbi explicitly asks for that.

## Review request for Claude Code

Please review with production eyes:

1. Confirm the root-cause reasoning is valid:
   - missing `route_caution_ids` in environments without `sql/87` could prevent all new route-memory writes.
2. Confirm the fallback implementation is safe:
   - it retries only on `42703`
   - it omits only `route_caution_ids`
   - it still writes station rows after successful fallback
3. Confirm no RLS/security issue is introduced:
   - this uses existing service-role route-memory writer
   - no public writes are added
   - no raw Google geometry, place IDs, or user IDs are stored
4. Confirm the test is not over-mocked in a way that hides real Supabase chain behavior.
5. Confirm whether the hotfix should be committed/pushed/deployed as a separate small patch.

## Suggested commit scope if Claude Code approves

Commit only:

- `lib/iceland-routes/routeMemory.server.ts`
- `lib/__tests__/route-place-normalization.test.ts`
- `lib/__tests__/route-memory-record.test.ts`
- optionally this handoff file, if Stebbi wants release-history docs committed

Do not commit:

- `.obsidian/workspace.json`
- unrelated untracked handoff docs unless Stebbi explicitly wants the docs history included

Suggested commit message:

```text
fix: keep route-memory writes working before sql87
```

## Deployment note

If this is deployed before `sql/87` is present in production:

- new routes should still appear in `/vedrid`
- route caution IDs will not be stored until `sql/87` is applied
- route/weather filtering remains more important than caution metadata for this hotfix

After deploy, Stebbi likely needs to calculate Reykjavik -> Stora-Borg again because the previous failed attempt probably did not insert a route-memory row.

## Route intelligence check

Route family/place touched:

- Reykjavik -> Stora-Borg
- Generic self-registering public locality route-memory flow

Does this add manual route knowledge?

- No.
- It deliberately does not add `Stora-Borg` to a manual alias/coordinate whitelist.
- It preserves the self-registering route-memory approach.

Provider neutrality:

- The fix is provider-neutral at route-memory route row level.
- Provider station rows continue to be written for whichever providers were evaluated.

Privacy:

- No user ID stored.
- No raw street address stored.
- No raw Google geometry stored.
- No Google place ID stored.
- Only normalized public place labels/keys and provider station IDs are written, matching `sql/86` privacy contract.

IcelandRoadmap:

- No new canonical route segment/control point is required.
- This is infrastructure hardening for route-memory self-registration.
- No `IcelandRoadmap.md` update required.

## Localhost checks for Stebbi

Stebbi runs localhost/dev server.

### Main check: Stora-Borg appears after route calculation

Setup:

- Use an environment where route-memory tables exist.
- It is okay if `sql/87` is not applied. This hotfix is specifically meant to tolerate that.

Steps:

1. Open `/vedrid`.
2. Note that `Stora-Borg` is not visible yet if the route has not been successfully stored.
3. Open `/vedrid/ferdalagid`.
4. Set route: `Reykjavik` -> `Stora-Borg`.
5. Let the first route-options step complete.
6. Return to `/vedrid`.
7. If `/vedrid` was already open in another tab, focus it or reload it.

Expected:

- `Stora-Borg` appears as a route-memory place pill.
- Selecting `Reykjavik` should show `Stora-Borg` as a destination, or selecting `Stora-Borg` should show `Reykjavik`.
- Selecting both should filter the map to route-memory stations.

### Regression check: existing known route still works

Steps:

1. Open `/vedrid`.
2. Select `Reykjavik`.
3. Select an existing known destination such as `Akureyri`, `Egilsstadir`, or `Siglufjordur`.

Expected:

- Existing route-memory places still appear.
- Destination pills still load bidirectionally.
- Route filter still applies.
- No blank map when route has stations.

### Multi-variant check

Steps:

1. Open `/vedrid`.
2. Select a pair with known multiple variants, e.g. `Reykjavik` -> `Egilsstadir`.
3. Toggle `Allar leidir` and individual route pills.

Expected:

- Route pills still work.
- Individual route selection still filters the map.
- Caution labels may be absent if `sql/87` is missing, but the route itself should not disappear.

### What not to test casually

- Do not run production SQL or migrations as part of this hotfix check unless Stebbi explicitly decides to do so.
- Do not delete route-memory rows in production just to retest.
- Do not commit or push `.obsidian/workspace.json`.

## Production smoke after deploy

1. Deploy the hotfix.
2. In production, run/calculate Reykjavik -> Stora-Borg again in `/vedrid/ferdalagid`.
3. Open `https://www.teskeid.is/vedrid`.
4. Confirm `Stora-Borg` appears in the route-memory picker.
5. Select it with Reykjavik and confirm route filtering works.
6. Watch server logs for:
   - `[route-memory] route_caution_ids column missing on write, falling back (run sql/87)`
   - this log is acceptable if `sql/87` is not applied
   - unexpected `[route-memory] upsert failed:` after fallback would be a blocker

## Remaining risk

Low to medium.

The hotfix is intentionally narrow and verified locally, but Codex did not query production DB state. If Stora-Borg still does not appear after deploy and recalculation, the next likely causes are:

- route options endpoint did not call `warmRouteMemoryFromOptions`
- normalizer received only a bare street-like name without locality context
- service-role write failed for another DB reason
- route-memory places endpoint is cached somewhere unexpectedly
- route-memory table/migration `sql/86` is missing or grants are wrong

If that happens, inspect production logs around `/api/teskeid/weather/travel/routes` and `[route-memory]`.
