# 2026-07-18 10:25 - TODO 086 v478 - Claude v477 done, prerelease

Created: 2026-07-18 10:25
Timezone: Atlantic/Reykjavik

Sources reviewed:
- `ai-handoff/2026-07-18-1005-todo-086-v477-codex-v476-review-and-pulse-map-next.md`

## What was implemented

### 1. HIGH / security: Scoped provider access — scope before access response

`lib/chat/repository.server.ts`:
- Updated `getThreadProvider(threadId, scope)` to take `scope: { domain: string; targetTypes: string[] }` and apply `.eq('domain', ...)` + `.in('target_type', ...)` in the query. Returns null for missing threads AND for threads outside the allowed scope (wrong domain or target type). Out-of-scope IDs now return 404 BEFORE any access response.
- Updated `getMessageProvider(messageId, scope)` similarly — fetches thread_id then delegates to `getThreadProvider` with the same scope.

`app/api/auth-mvp/vedurpuls/messages/route.ts` (both GET and POST):
- Removed `assertThreadScope` (now redundant — scope validated inside `getThreadProvider`).
- GET: scope check → 404 if null → `checkChatAccess` → `listMessages`.
- POST: same pattern using `PRIMARY_TARGET_TYPES`.

`app/api/auth-mvp/vedurpuls/read/route.ts`:
- Removed `assertThreadScope`. Pattern: scope → 404 → access → `markThreadRead`.

`app/api/auth-mvp/vedurpuls/report/route.ts`:
- Removed `assertMessageScope`. Pattern: validate inputs → scope via `getMessageProvider` → 404 → access → `reportMessage`.

### 2. HIGH: Fix thread route comment

`app/api/auth-mvp/vedurpuls/thread/route.ts`:
- Comment updated: `provider` is now documented as required (not optional/default).

### 3. MEDIUM / UX: Progressive provider loading in pills

`components/weather/WeatherOverviewShell.tsx`:
- Added `loadingLabel?: string` to `WeatherOverviewProviderConfig`.
- Removed global `{anyLoading && <p>Hleð...</p>}` text — loading state is now communicated per-provider in pills.
- Pills no longer grey-out when loading (only grey when `isUnavailable`). While loading, pill shows `loadingLabel` (e.g. "Sæki Vegagerðargögn…") and is non-interactable but not visually disabled.
- `canInteract` now includes `!p.loading` so clicking a loading pill has no effect.
- Map renders as soon as any provider has data (`hasMapData` was already correct; removing the global loader makes this obvious to the user).

`components/weather/WeatherOverviewClient.tsx`:
- `vedurstofanProvider.loadingLabel = 'Sæki Veðurstofugögn…'`
- `vegagerdinProvider.loadingLabel = 'Sæki Vegagerðargögn…'`

### 4. MEDIUM: Station context map on full Vegagerðin pulse page

`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`:
- Added `lat` and `lon` to `NearbyVedurstofanStation` type.
- Populated `lat: s.lat, lon: s.lon` when building nearbyStations from `nearest`.
- Imported `sortStationsForContext` and applied it to nearbyStations after building them.

`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`:
- Added `StationContextMap` component (local, reuses `IcelandOverviewMap`).
- Layers: Vegagerðin selected station (`tone: 'ok'`) + nearby Veðurstofan stations (`tone: 'muted'`).
- Read-only: `onSelect={() => {}}`, `selected={null}`.
- Compact size: `h-[160px] sm:h-[200px] w-full`.
- Placed between the chat panel and nearby forecast cards.

### 5. MEDIUM: Logical spatial ordering of nearby Veðurstofan stations

`lib/weather/spatialOrder.ts` (new):
- `sortStationsForContext<T extends { lat: number; lon: number }>(stations: T[]): T[]`
- Computes latitude spread and cosine-adjusted longitude spread.
- If lat spread >= adjusted lon spread → sorts north-to-south (descending lat).
- Otherwise → sorts west-to-east (ascending lon).
- Returns new array; does not mutate input.

## Tests

`lib/__tests__/vedurpuls-api.test.ts`:
- Updated messages GET and POST out-of-scope tests to mock `getThreadProvider` returning null (not `assertThreadScope` throwing).
- Added "returns 404 before access check for out-of-scope thread" tests for GET messages and read POST — verifies `checkChatAccess` is NOT called when scope fails.
- Added same for report POST via `getMessageProvider`.
- Updated the report 404 test to mock `getMessageProvider` returning null.
- Updated messages POST "vedurstofan thread returns 404" to use `mockGetThreadProvider.mockResolvedValue(null)`.

`lib/__tests__/spatialOrder.test.ts` (new):
- 5 tests: empty array, single station, no mutation, north-to-south dominant, west-to-east dominant, extra fields preserved.

## Commands run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts
```
Exit 0. 3 test files, 88 tests passed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## SQL 81 status

SQL 81 has NOT been run by Claude Code. Vegagerðin thread creation (compose) will fail at the DB CHECK constraint unless SQL 81 has been applied in the local/production database. Message read, mark-read, and report work for existing Vegagerðin threads once SQL 81 creates the thread. Do not run SQL without Stebbi's explicit approval.

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid`.
2. On load: pills should show "Sæki Vegagerðargögn…" / "Sæki Veðurstofugögn…" while data is loading — not grey/disabled.
3. As soon as one provider is ready, map appears; other pill still shows loading copy.
4. Both providers loaded: pills show "Vegagerðin (núna)" and "Veðurstofan (spá)"; both toggleable.
5. Click a Vegagerðin station. Open its full pulse page.
6. Context map should appear below the chat panel and above the Veðurstofan forecast cards.
7. Map should show the selected Vegagerðin station in green + nearby Veðurstofan stations in grey.
8. Nearby forecast cards should be ordered north-to-south or west-to-east (not nearest-first jumble).
9. Forecast window should show 2 past/current + 2 future rows around current time.
10. If SQL 81 is not yet applied: compose will fail at DB constraint; error message says "Náði ekki að opna skilaboðaþráðinn." not "Veðurstofugögn".
11. Sign in as a user without `weather-provider-vedurstofan` access. Confirm Vegagerðin pulse page loads messages without Veðurstofan access error.
