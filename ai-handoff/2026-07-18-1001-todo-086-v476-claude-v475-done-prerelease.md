# 2026-07-18 10:01 - TODO 086 v476 - Claude v475 done, prerelease

Created: 2026-07-18 10:01
Timezone: Atlantic/Reykjavik

Sources reviewed:
- `ai-handoff/2026-07-18-0948-todo-086-v475-codex-v474-followup-vegagerdin-pulse-ui.md`
- `ai-handoff/2026-07-18-0944-todo-086-v474-codex-v473-review-and-next-step.md`

## What was implemented

### 1. HIGH (blocking): Provider-aware access for messages GET, read, report

Added two helpers to `lib/chat/repository.server.ts`:
- `getThreadProvider(threadId)` — queries `target_type` from the thread row, returns `'vegagerdin'` for `vegagerdin_station`, `'vedurstofan'` for anything else, `null` if thread not found.
- `getMessageProvider(messageId)` — fetches `thread_id` from the message, then delegates to `getThreadProvider`.

Updated three routes to resolve provider before calling `checkChatAccess`:

**`app/api/auth-mvp/vedurpuls/messages/route.ts` (GET)**:
- Parse and validate `threadId` first
- `getThreadProvider(threadId)` → 404 if null
- `checkChatAccess(user, { provider })` — vegagerdin threads no longer require `weather-provider-vedurstofan`

**`app/api/auth-mvp/vedurpuls/read/route.ts` (POST)**:
- Parse body first, validate `threadId`
- `getThreadProvider(threadId)` → 404 if null
- `checkChatAccess(user, { provider })`

**`app/api/auth-mvp/vedurpuls/report/route.ts` (POST)**:
- Parse body first, validate `messageId`
- `getMessageProvider(messageId)` → 404 if null
- `checkChatAccess(user, { provider })`

Note: `access/route.ts` (GET) is only used by `VedurstofanPulseInline` and still defaults to vedurstofan. Not changed.

### 2. HIGH: Fix VegagerdinPulsClient thread error message

`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`:
- Changed `{t('loadError')}` (was "Náði ekki að sækja Veðurstofugögn. Reyndu aftur.") to `{t('pulseThreadError')}`

Added new translation key `pulseThreadError` to both locale files:
- IS: "Náði ekki að opna skilaboðaþráðinn. Reyndu aftur."
- EN: "Could not open the message thread. Please try again."

### 3. Stebbi's direct request: Pill labels and order

`components/weather/WeatherOverviewClient.tsx`:
- `vegagerdinProvider.shortLabel = 'Vegagerðin (núna)'`
- `vedurstofanProvider.shortLabel = 'Veðurstofan (spá)'`
- `providers` order changed to `[vegagerdinProvider, vedurstofanProvider]` — Vegagerðin is now first (left)

### 4. MEDIUM: Nearby Veðurstofan forecast window around current time

`components/weather/VedurstofanForecastRows.tsx`:
- Added `selectForecastWindow(rows, nBefore, nAfter, anchor = Date.now())` — returns up to nBefore rows at/before anchor, plus up to nAfter rows strictly after anchor, sorted ascending.

`VegagerdinPulsClient.tsx`:
- Changed `selectUpcomingRows(station.forecastRows, 3)` to `selectForecastWindow(station.forecastRows, 2, 2)` — now shows 2 past/current + 2 future rows around current time.

## Tests

`lib/__tests__/vedurpuls-api.test.ts`:
- Added `mockGetThreadProvider` and `mockGetMessageProvider` to vi.hoisted and repository mock
- Both default to `'vedurstofan'` in beforeEach (preserves all 64 existing test behaviors)
- Added 11 new tests in 3 describe blocks:
  - `GET messages — provider-aware access`: vegagerdin thread uses vegagerdin provider, succeeds without vedurstofan access, vedurstofan thread rejected correctly, null provider → 404
  - `POST read — provider-aware access`: same pattern
  - `POST report — provider-aware access`: same pattern via getMessageProvider

## Commands run

```
npm run type-check
```
Exit 0.

```
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts
```
Exit 0. 2 test files, 79 tests passed.

No SQL was run. No commit, push, deploy, Vercel change, or production change was made.

## What remains from v475

- **Progressive loading**: `/vedrid` map should unlock as soon as either provider is ready; other provider loads in background with pill-level indicator. Not implemented.
- **Vegagerðin pill with stale data**: Current logic already keeps pill active when `measurementFreshness === 'stale'` (unavailableReason stays `undefined`). Marker tone is 'unavailable' for stale data. May still need review.
- **Remove `VedurstofanPulseInline` from Veðurstofan station detail card** in overview. Not implemented (needs explicit confirmation from Stebbi).
- **Fix pill loading interaction**: `canInteract = p.canToggle && !isUnavailable && !p.loading` (v474 low). Not implemented.
- **Fix thread route comment**: Provider is required (not optional/default), comment still says `provider?`. Not updated.
- **SQL 81**: Still not run. `vegagerdin_station` thread creation at the DB CHECK constraint may fail without it. Thread creation works if SQL 81 was applied.

## Localhost checks for Stebbi

1. Open `http://localhost:3004/vedrid` — confirm pills show `Vegagerðin (núna)` first (left), `Veðurstofan (spá)` second.
2. Confirm both pills are active/toggleable.
3. Sign in as a user without `weather-provider-vedurstofan` but with base weather access.
4. Open a Vegagerðin station on `/vedrid`, click through to the full pulse page.
5. Confirm the chat panel loads (or shows access denied, not a Veðurstofan error).
6. If thread creation fails (SQL 81 not run), the error should now say "Náði ekki að opna skilaboðaþráðinn. Reyndu aftur." not "Náði ekki að sækja Veðurstofugögn."
7. On the Vegagerðin pulse page, check that nearby Veðurstofan forecast rows show 2 past/current and 2 future rows, e.g. 06:00, 09:00, 12:00, 15:00 at 09:43.
8. Confirm that if only the forecast context section fails (not the chat), only that section shows an error.
