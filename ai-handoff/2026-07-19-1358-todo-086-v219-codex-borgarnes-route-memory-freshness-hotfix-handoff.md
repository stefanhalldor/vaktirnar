# TODO 086 / v219 - Codex handoff - Borgarnes route-memory freshness hotfix

Created: 2026-07-19 13:58
Timezone: Atlantic/Reykjavik

## Status

Codex implemented a scoped repo-only hotfix after Stebbi reported that `Borgarnes` still was not appearing as a route-memory place, including after trying `Akranes -> Borgarnes`.

Codex did not commit, push, deploy, run SQL, run migrations, touch Supabase, run cron, or change production data.

## Skilningur á samþykki

Stebbi explicitly approved direct implementation for this hotfix and requested a handoff for Claude Code to review before release.

This included:

- Code changes in the repo.
- Tests.
- A handoff file.

This did not include:

- Commit.
- Push.
- Deploy.
- SQL/migration execution.
- Production data cleanup or inspection.

## Root-cause assessment

`Borgarnes` itself is not a normalizer problem in current code:

- `Borgarnes` is explicitly present in `PLACE_NORM_ENTRIES`.
- `Akranes` self-registers through the generic public-locality parser.
- Existing normalizer tests pass for `Akranes`.

The more likely failure mode is stale route-memory read data after a route was written:

- `/api/teskeid/weather/route-memory/places` had no explicit `force-dynamic`, `revalidate = 0`, or `Cache-Control: no-store`.
- `/api/teskeid/weather/route-memory/destinations`, `/lookup`, and `/place-focus` had the same freshness gap.
- `RouteMemoryPicker` used plain browser `fetch(...)` without `cache: 'no-store'`.

That means a new route row could be present in Supabase while `/vedrid` still sees an older places/destinations response. This fits the symptom: "Borgarnes is still not coming as a place" even though clean names should normalize.

Important caveat:

- Codex did not inspect production DB.
- If `Akranes -> Borgarnes` did not write any row at all, this hotfix will not create historical rows retroactively. Stebbi must recalculate the route after deploy.
- If the place still does not appear after deploy and recalculation, the next suspect is route-memory write failure or missing DB schema/grants, not the picker freshness path.

## What changed

### Route-memory read API is now uncached

Changed:

- `app/api/teskeid/weather/route-memory/places/route.ts`
- `app/api/teskeid/weather/route-memory/destinations/route.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `app/api/teskeid/weather/route-memory/place-focus/route.ts`

Each now has:

```ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

Each JSON response now includes:

```http
Cache-Control: no-store, no-cache, max-age=0, must-revalidate
```

Why:

- Route-memory is mutable user-facing app state.
- The `/vedrid` picker must reflect newly calculated routes immediately.
- Places, destinations, lookup, and single-place focus all depend on the freshest route-memory rows.

### Client picker bypasses browser cache

Changed:

- `components/weather/RouteMemoryPicker.tsx`

The picker now fetches both route-memory place lists with `cache: 'no-store'`:

- `/api/teskeid/weather/route-memory/places`
- `/api/teskeid/weather/route-memory/destinations?from=...`

Why:

- Even if the server route is dynamic, the client should not reuse an old browser/intermediate cached response when returning from `/vedrid/ferdalagid` to `/vedrid`.

### Tests added

Added:

- `lib/__tests__/route-memory-api.test.ts`

Coverage:

- Route-memory read endpoints export `dynamic = 'force-dynamic'`.
- Route-memory read endpoints export `revalidate = 0`.
- `/route-memory/places` returns `Akranes` and `Borgarnes` from mocked route rows and includes no-store cache headers.
- `/route-memory/destinations?from=akranes` returns `Borgarnes` with no-store cache headers.
- `/lookup` miss fast-path and `/place-focus` empty fast-path also include no-store cache headers.
- `RouteMemoryPicker.tsx` has explicit `cache: 'no-store'` for route-memory reads.

## Files changed

Runtime:

- `app/api/teskeid/weather/route-memory/places/route.ts`
- `app/api/teskeid/weather/route-memory/destinations/route.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `app/api/teskeid/weather/route-memory/place-focus/route.ts`
- `components/weather/RouteMemoryPicker.tsx`

Tests:

- `lib/__tests__/route-memory-api.test.ts`

Handoff:

- `ai-handoff/2026-07-19-1358-todo-086-v219-codex-borgarnes-route-memory-freshness-hotfix-handoff.md`

No SQL files changed.

## Commands run

```bash
npm run test:run -- lib/__tests__/route-memory-api.test.ts lib/__tests__/route-place-normalization.test.ts lib/__tests__/route-memory-record.test.ts
```

Result:

- exit 0
- 3 test files passed
- 38 tests passed

```bash
npm run type-check
```

Result:

- exit 0

```bash
npm run test:run -- lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/weather-routes-api.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result:

- exit 0
- 3 test files passed
- 90 tests passed

```bash
npm run build
```

Result:

- exit 0
- Build completed.
- Same known warnings remain:
  - `app/s/[sessionId]/page.tsx` hook deps.
  - `components/landing/Avatar.tsx` `<img>`.
  - `components/weather/IcelandOverviewMap.tsx` ref cleanup warning.
  - `components/weather/TravelAuditMap.tsx` hook deps.
  - `components/weather/WeatherOverviewClient.tsx` route filter hook dependency warnings.

## Current working tree notes

At handoff time, `git status --short` included:

- Modified unrelated:
  - `.obsidian/workspace.json`
- Modified by this v219 hotfix:
  - `app/api/teskeid/weather/route-memory/destinations/route.ts`
  - `app/api/teskeid/weather/route-memory/lookup/route.ts`
  - `app/api/teskeid/weather/route-memory/place-focus/route.ts`
  - `app/api/teskeid/weather/route-memory/places/route.ts`
  - `components/weather/RouteMemoryPicker.tsx`
- Added by this v219 hotfix:
  - `lib/__tests__/route-memory-api.test.ts`
  - this handoff file
- Existing untracked handoff files from earlier release-chain work.

Claude Code should avoid committing `.obsidian/workspace.json`.

## Review request for Claude Code

Please review before release:

1. Confirm route-memory read endpoints should all be `force-dynamic` and `revalidate = 0`.
2. Confirm `Cache-Control: no-store, no-cache, max-age=0, must-revalidate` is acceptable for public route-memory labels and station-id lookup responses.
3. Confirm `RouteMemoryPicker` client fetches should use `cache: 'no-store'`.
4. Confirm no auth/RLS/security risk is introduced:
   - These endpoints already used admin/service-role reads.
   - Response data remains only normalized place labels/keys and provider station IDs.
   - No raw addresses, Google place IDs, user IDs, or route geometry are exposed.
5. Confirm whether this is enough for the observed `Borgarnes` symptom, or whether Claude Code sees evidence of a write-side failure too.

## Suggested commit scope

Commit:

- `app/api/teskeid/weather/route-memory/places/route.ts`
- `app/api/teskeid/weather/route-memory/destinations/route.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `app/api/teskeid/weather/route-memory/place-focus/route.ts`
- `components/weather/RouteMemoryPicker.tsx`
- `lib/__tests__/route-memory-api.test.ts`

Optional if Stebbi wants handoff history in git:

- this handoff file

Do not commit:

- `.obsidian/workspace.json`
- unrelated previous untracked handoff files unless Stebbi explicitly wants them.

Suggested commit message:

```text
fix: prevent stale route-memory place lists
```

## Route intelligence check

Route/place families touched:

- Route-memory place list and destination lookup for `/vedrid`.
- Specifically observed:
  - `Akranes -> Borgarnes`
  - prior related case `Reykjavik -> Stora-Borg`

Does this add route knowledge?

- No.
- No manual route, station, or place whitelist added.
- `Borgarnes` was already known in the normalizer.
- `Akranes` is covered by generic self-registration.

Provider neutrality:

- Yes.
- The fix is on route-memory API freshness, not Veðurstofan/Vegagerðin matching logic.

Privacy:

- No new data stored.
- No new data exposed beyond existing route-memory place keys/labels and provider station IDs.
- No raw street addresses, Google geometry, Google place IDs, user IDs, or user-specific trip rows.

IcelandRoadmap:

- No `IcelandRoadmap.md` update required.
- This is not new route intelligence; it is a freshness/read-path hotfix.

## Localhost checks for Stebbi

Stebbi runs localhost/dev server.

### 1. Akranes -> Borgarnes appears immediately

Setup:

- Use localhost with this hotfix.
- If there is no existing route-memory row for `Akranes -> Borgarnes`, calculate it fresh.

Steps:

1. Open `/vedrid/ferdalagid`.
2. Select `Akranes` as origin.
3. Select `Borgarnes` as destination.
4. Wait for route options.
5. Open `/vedrid` or return to it.
6. If the page was already open, focus the tab or reload once.

Expected:

- `Akranes` appears as a first-step place.
- Selecting `Akranes` shows `Borgarnes` as a destination.
- Selecting both filters the map by route-memory.

Regression to watch:

- `Borgarnes` should not require a deploy/reload cycle after the route is calculated.
- Destination list should not show an old cached list.

### 2. Reverse direction

Steps:

1. On `/vedrid`, select `Borgarnes` first.
2. Check destination pills.

Expected:

- `Akranes` appears as the counterpart destination.
- Lookup/filter works bidirectionally.

### 3. Stora-Borg prior regression

Steps:

1. Recalculate `Reykjavik -> Stora-Borg`.
2. Open `/vedrid`.

Expected:

- `Stora-Borg` / `Stóra-Borg` appears after recalculation.
- `Biskupstungnabraut` does not appear as a public place pill.

### 4. Header smoke check, optional

In browser DevTools Network on localhost:

1. Request `/api/teskeid/weather/route-memory/places`.
2. Request `/api/teskeid/weather/route-memory/destinations?from=akranes`.

Expected response header:

```http
Cache-Control: no-store, no-cache, max-age=0, must-revalidate
```

### What not to test casually

- Do not delete production route-memory rows.
- Do not run SQL cleanup or migrations for this hotfix.
- Do not inspect production DB with write-capable SQL unless Stebbi separately approves.

## Production smoke after deploy

After Claude Code reviews and deploys:

1. Recalculate `Akranes -> Borgarnes` on production.
2. Open `https://www.teskeid.is/vedrid`.
3. Confirm `Borgarnes` appears through the route-memory picker.
4. Select `Akranes -> Borgarnes` and confirm the map filters.
5. Check response headers for:
   - `/api/teskeid/weather/route-memory/places`
   - `/api/teskeid/weather/route-memory/destinations?from=akranes`
6. If `Borgarnes` still does not appear after recalculation, check Vercel logs for:
   - `[route-memory] upsert failed`
   - `[route-memory] station insert failed`
   - `[route-memory] options warm failed`
   - fallback log for missing `route_caution_ids`

## Remaining risk

Confidence: medium-high for stale read/cache being at least part of the issue.

Remaining uncertainty:

- Codex did not inspect production DB, so Codex cannot confirm whether `Akranes -> Borgarnes` route rows were written.
- If no route row exists after recalculation, this hotfix will not solve that by itself.
- If the issue persists after this deploy, the next step should be read-only production inspection of `weather_route_memory_routes` for keys `akranes` and `borgarnes`, plus Vercel route-memory write logs. That requires separate Stebbi approval.
