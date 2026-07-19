# TODO-086 v458 - Claude Code - v457 implemented, prerelease

Created: 2026-07-17 20:15
Timezone: Atlantic/Reykjavik
From: Claude Code
To: Stebbi (localhost review) / Codex (prerelease review)
Status: Implementation complete. Type-check clean. 104 test files pass, 3092 tests passed.

## What was implemented

Handoff v457 — Vegagerðin-first Veðurpúls. Moves the road-condition reporting surface from Vedurstofan station cards to dedicated Vegagerðin station pages. Full 7-phase implementation.

---

## Phase 0: SQL migration rollback warning

**`sql/81_teskeid_chat_target_type_vegagerdin_station.sql`**

Added a `WARNING` comment before the rollback `ADD CONSTRAINT` block explaining that the rollback will fail with a CHECK violation if any rows with `target_type = vegagerdin_station` exist. The operator must delete or migrate those rows first.

---

## Phase 1: vegagerdinPulseHref + weatherPulseTargetHref dispatch

**`lib/weather/pulseTarget.ts`**

Added:
- `vegagerdinPulseHref(stationId, returnTo?)` — builds `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]`
- Updated `weatherPulseTargetHref()` to dispatch on both providers (was returning `'#'` for vegagerdin)

---

## Phase 2: buildWeatherPulseTarget in adapters

**`lib/chat/adapters/weather.server.ts`**

Added `buildWeatherPulseTarget(provider, targetId)`:
- `'vedurstofan'`: delegates to existing `buildWeatherStationTarget`
- `'vegagerdin'`: reads from `readVegagerdinCurrentFromCache()`, finds station by ID, returns `ChatThreadTarget` with `targetType: 'vegagerdin_station'`
- Returns `null` if cache unavailable or station not found

---

## Phase 3: Provider-neutral API routes

**`lib/chat/repository.server.ts`**

`assertThreadScope` and `assertMessageScope` now accept `targetType: string | string[]`. Uses `.in()` for arrays, `.eq()` for single value. Backward compatible.

**`lib/chat/api.server.ts`**

Replaced `WEATHER_PULSE_SCOPE` with three exports:
- `WEATHER_PULSE_DOMAIN = 'weather'`
- `WEATHER_PULSE_ALL_TARGET_TYPES = ['vedurstofan_station', 'vegagerdin_station']`
- `WEATHER_PULSE_PRIMARY_TARGET_TYPES = ['vegagerdin_station']`

**`app/api/auth-mvp/vedurpuls/thread/route.ts`**

Now reads optional `provider` from request body (defaults to `'vedurstofan'`). Calls `buildWeatherPulseTarget(provider, targetId)` (async).

**`app/api/auth-mvp/vedurpuls/messages/route.ts`**
**`app/api/auth-mvp/vedurpuls/read/route.ts`**
**`app/api/auth-mvp/vedurpuls/report/route.ts`**

All use `WEATHER_PULSE_ALL_TARGET_TYPES` for scope assertions.

**`app/api/auth-mvp/vedurpuls/feed/route.ts`**

Uses `WEATHER_PULSE_PRIMARY_TARGET_TYPES` (`['vegagerdin_station']`) — feed shows Vegagerðin reports only.

---

## Phase 4: Public Vegagerðin preview API + middleware

**`app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts`** (new)

Public GET endpoint. Validates station from live cache. Returns `[]` if cache unavailable (fail-open). Returns `400` if station not found. Returns preview messages scoped to `vegagerdin_station`.

**`middleware.ts`**

Added `/api/teskeid/weather/vedurpuls/vegagerdin/stations/` to `PUBLIC_PATHS`.

**`app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`**

Changed scope from `['vedurstofan_station']` to `['vegagerdin_station']`.

---

## Phase 5: Nearest-station helper + Vegagerðin pulse page

**`lib/weather/nearestStations.ts`** (new)

- `haversineDistanceM(from, to)` — great-circle distance in metres
- `NearestStation` type — stationId, name, lat, lon, distanceM
- `findNearestStations(ref, candidates, n)` — returns N nearest, sorted ascending; ties broken by stationId

**`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`** (new)

Server component: auth guard → cache lookup → 3 nearest Vedurstofan stations → forecast load → render `VegagerdinPulsClient`.

**`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`** (new)

Client component: on mount POSTs `{ provider: 'vegagerdin', targetId }` → ScopedChatPanel. Shows:
- Current Vegagerðin measurement card (wind, gust, air temp, road temp, measured time)
- 3 nearest Vedurstofan forecast cards with distance

**`app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/loading.tsx`** (new)

TeskeidLoader loading state.

---

## Phase 6: Simplify VedurstofanPulseInline

**`components/weather/VedurstofanPulseInline.tsx`**

Stripped the compose area entirely. Removed: access check `useEffect`, `handleSend`, `postingAccess`/`pendingFull`/`composeBody`/`sending`/`sendError`/`threadIdRef` state, `ScopedChatComposer`, login CTA link, `useRef`/`useEffect` imports.

Now read-only: shows `ChatPreviewList` with `pulseEmptyPublic` empty label, and a "Sjá fleiri" link when `returnTo` is provided. No auth check, no compose.

---

## Phase 7: Tests

Updated:
- `lib/__tests__/pulseTarget.test.ts` — added `vegagerdinPulseHref` tests; fixed `weatherPulseTargetHref` vegagerdin cases to expect real hrefs
- `lib/__tests__/vedurpuls-api.test.ts` — mock renamed from `buildWeatherStationTarget` to `buildWeatherPulseTarget` (async, `mockResolvedValue`); added provider dispatch tests
- `lib/__tests__/vedurpuls-feed.test.ts` — updated scope assertion to `['vegagerdin_station']`
- `lib/__tests__/weather-conditions-feed-preview-api.test.ts` — updated scope assertions to `['vegagerdin_station']`

Created:
- `lib/__tests__/nearestStations.test.ts` — haversine correctness, nearest-3 selection, tie-breaking, null exclusion
- `lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts` — cache unavailable → [], unknown station → 400, known station → 200, repository error → []

---

## Translation keys added

In both `messages/is.json` and `messages/en.json` under `teskeid.vedrid.eltaVedrid`:

| Key | IS | EN |
|---|---|---|
| `vegagerdinPulseOpen` | Vegaaðstæður | Road-weather reports |
| `vegagerdinMeasurementAt` | Mælt | Measured |
| `vegagerdinMeanWind` | Vindur | Wind |
| `vegagerdinGust` | Gust (10 mín) | Gust (10 min) |
| `vegagerdinAirTemp` | Loft | Air |
| `vegagerdinRoadTemp` | Vegur | Road |
| `vegagerdinNearbyTitle` | Veðurspá frá Veðurstofu | Nearest Veðurstofan forecast |
| `vegagerdinNearbyKm` | km | km |

---

## Files changed

- `sql/81_teskeid_chat_target_type_vegagerdin_station.sql`
- `lib/weather/pulseTarget.ts`
- `lib/chat/adapters/weather.server.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/api.server.ts`
- `lib/weather/nearestStations.ts` (new)
- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/read/route.ts`
- `app/api/auth-mvp/vedurpuls/report/route.ts`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts` (new)
- `middleware.ts`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx` (new)
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx` (new)
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/loading.tsx` (new)
- `components/weather/VedurstofanPulseInline.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/pulseTarget.test.ts`
- `lib/__tests__/vedurpuls-api.test.ts`
- `lib/__tests__/vedurpuls-feed.test.ts`
- `lib/__tests__/weather-conditions-feed-preview-api.test.ts`
- `lib/__tests__/nearestStations.test.ts` (new)
- `lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts` (new)

## Not changed

- No SQL executed. SQL 81 is written but must be run by Stebbi before Vegagerðin write-side works.
- Feed and feed-preview will return `[]` until SQL 81 is run and Vegagerðin content is posted.
- No new Supabase functions, RLS policies, or auth changes.
- Existing Vedurstofan pulse pages unchanged.
- No entry points in the UI yet link to `/auth-mvp/vedrid/puls/vegagerdin/stod/[id]` — Vegagerðin station cards still need to be wired up separately.

---

## Test results

```
Test Files  104 passed (104)
Tests  3092 passed | 27 skipped | 8 todo (3127)
```

TypeScript: clean (no errors).

---

## Localhost checks for Stebbi

**Before SQL 81 is run (current state):**

1. **VedurstofanPulseInline is read-only**
   - Open any station card in `/auth-mvp/vedrid/elta-vedrid` or a travel result card.
   - Expected: no compose box, no login CTA, no "send" button.
   - Expected: preview messages (if any) still shown.
   - Expected: "Sjá fleiri skilaboð" link shown when station has a returnTo context.

2. **Vegagerðin pulse page accessible**
   - Navigate to `/auth-mvp/vedrid/puls/vegagerdin/stod/[any-valid-stationId]`.
   - Expected: page loads with station name in heading.
   - Expected: current measurement card shows wind/gust/air temp/road temp.
   - Expected: 3 nearest Vedurstofan forecast cards shown below chat panel.
   - Expected: chat panel shows "loading..." then empty state (no threads yet since SQL 81 not run).

3. **Thread endpoint returns 400 for vegagerdin provider (pre-SQL-81)**
   - Vegagerðin pulse client POSTs `{ provider: 'vegagerdin', targetId }`.
   - Expected: DB returns a constraint error → thread endpoint returns 500 (thread unavailable) or 400.
   - The chat panel will show the error state gracefully.

**After SQL 81 is run:**

4. **Thread creation works for vegagerdin_station**
   - Open the Vegagerðin pulse page.
   - Expected: thread created, ScopedChatPanel renders and is interactive.
   - Post a message. Expected: message appears in the thread.

5. **Feed shows Vegagerðin messages**
   - After posting, the feed at `/api/auth-mvp/vedurpuls/feed` should return `vegagerdin_station` messages.
   - The feed-preview widget (homepage) should update to show Vegagerðin station reports.
