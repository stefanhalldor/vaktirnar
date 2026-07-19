# 2026-07-17 16:13 - TODO-086 v438 - Claude: B4B + B4C Vegagerðin freshness split + cache-only adapter

Created: 2026-07-17 16:13
Timezone: Atlantic/Reykjavik
Source handoffs:
- `2026-07-17-1542-todo-086-v436-claude-b3d-b4a-provider-shell-vegagerdin-foundation.md`
- `2026-07-17-1555-todo-086-v437-codex-v436-review-and-next-big-step.md`

## What was done

### B4B: Harden Vegagerðin foundation

#### 1. Fixed `.env.example` Veðurstofan provider docs

Old (incorrect):
```
# default (unset or true): per-user gate
```
New (correct):
```
# default (unset/false/anything else): open to all weather users — the graduation path
```

References code behavior exactly: only `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` gates.

#### 2. Split Vegagerðin cache freshness from measurement freshness

**`lib/weather/providers/vegagerdinCurrentTypes.ts`:**
Added `MeasurementFreshness` type (was already present from prior session):
```ts
export type MeasurementFreshness = 'fresh' | 'aging' | 'stale' | 'unknown'
// fresh: < 15 min, aging: 15-30 min, stale: > 30 min, unknown: no timestamp
```

**`lib/weather/providers/vegagerdinCurrent.server.ts`:**
- Added constants: `MEASUREMENT_FRESH_MS = 15 min`, `MEASUREMENT_AGING_MS = 30 min`
- Added exported `getMeasurementFreshness(oldestMeasuredAtIso: string | null): MeasurementFreshness`
- Updated `VegagerdinCurrentResult` discriminated union to include both `cacheStatus` and `measurementFreshness`:
  ```ts
  export type VegagerdinCurrentResult =
    | { status: 'fresh'; cacheStatus: 'fresh'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
    | { status: 'stale'; cacheStatus: 'stale'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
    | { status: 'unavailable' }
  ```
- Updated `readVegagerdinCurrentFromCache()` to compute and return both fields
- Doc comment explains: "A 'fresh' cache can still have 'stale' measurements if stations stopped reporting."

#### 3. Added targeted tests

**`lib/__tests__/weather-vegagerdin-current.test.ts`:**
- Updated cache tests to assert `cacheStatus` and `measurementFreshness` fields
- Added new test: "fresh cache with old measurements returns fresh cacheStatus but stale measurementFreshness"
- Added `getMeasurementFreshness` test suite (6 tests): null, unparseable, fresh, aging, stale, and a conceptual separation test

**`lib/__tests__/guard.test.ts`:**
- Added `checkFeatureAccess — weather-provider-vegagerdin (kill-switch and graduation pattern)` suite (5 tests)
- Added `checkFeatureAccess — weather-provider-vegagerdin (per-user gate, ACCESS_REQUIRED=true)` suite (4 tests)
- Matches exact same pattern as `weather-provider-vedurstofan` tests

**`lib/__tests__/feature-access-api.test.ts`:**
- Added `feature-access API — weather-provider-vegagerdin key` suite (5 tests)
- GET/POST/DELETE coverage + feature_key isolation test + unknown variation returns 400

**`lib/__tests__/sql-migration.test.ts`:**
- Added `sql/80_feature_access_weather_provider_vegagerdin.sql — static checks` suite (4 tests)
- Checks: transaction wrapping, idempotent drop/recreate, new key present, all prior keys retained, rollback excludes new key

#### 4. Replaced all-provider-unavailable copy

**`messages/is.json`** and **`messages/en.json`**:
- Added `teskeid.vedrid.overview.allProvidersUnavailable`
- IS: `"Engar veðurupplýsingar tiltækar."`
- EN: `"No weather data available."`

**`components/weather/WeatherOverviewShell.tsx`:**
- Degraded state now uses `t('allProvidersUnavailable')` instead of `t('loadError')`
- `loadError` copy remains valid for actual network errors in the `anyLoadError` banner

#### 5. Fixed URL station restoration when stationId changes

Replaced boolean `restoredFromUrl` ref with `lastRestoredIdRef` string ref:
- `lastRestoredIdRef.current` tracks the last `urlMarkerId` that was restored
- Effect deps now include `urlMarkerId` — re-runs when URL changes (browser back/forward)
- If `urlMarkerId` changes, ref is no longer equal → restoration runs again for the new ID
- Correctly handles: initial load, provider layer race, browser navigation, same-mount stationId change

### B4C: Cache-only Vegagerðin overview adapter

#### 6. New API route: `app/api/teskeid/weather/vegagerdin/current/route.ts`

Cache-only read — never calls `https://gagnaveita.vegagerdin.is/api/vedur2014_1`.

Access control:
- `AUTH_MVP_ENABLED !== 'true'` → 404
- `getWeatherEnabledMode() === 'off'` → 404
- `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true'` → require `vedrid` + `weather-provider-vegagerdin` feature_access rows

Response shapes:
```ts
// unavailable (no cache data):
{ "status": "unavailable", "stations": [] }

// cache data present:
{
  "status": "ok",
  "cacheStatus": "fresh" | "stale",
  "measurementFreshness": "fresh" | "aging" | "stale" | "unknown",
  "fetchedAtIso": "...",
  "oldestMeasuredAtIso": "...",
  "stations": VegagerdinCurrentMeasurement[]
}
```

Cache-Control: `private, max-age=60, stale-while-revalidate=120` (same pattern as Veðurstofan).

#### 7. Added to middleware `EXACT_PUBLIC_PATHS`

`middleware.ts`: Added `/api/teskeid/weather/vegagerdin/current` to `EXACT_PUBLIC_PATHS`.

Access guard semantics (identical to Veðurstofan stations):
- Exact match only — `/current/foo` and `/current-extra` are NOT public
- Route handler itself enforces per-user access when `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`

Middleware regression tests added (3 tests):
- Exact path passes for unauthenticated
- Sub-path `/current/foo` gets 401
- Prefix variant `/current-extra` gets 401

#### 8. Updated `WeatherOverviewClient.tsx` — Vegagerðin adapter

Replaced static `upcoming` seam with full fetch + adapter:

```tsx
// New state:
const [vegagerdinData, setVegagerdinData] = useState<VegagerdinCurrentApiData | null>(null)
const [vegagerdinLoading, setVegagerdinLoading] = useState(true)
const [vegagerdinLoadError, setVegagerdinLoadError] = useState(false)
const [vegagerdinRestricted, setVegagerdinRestricted] = useState(false)

// Fetches /api/teskeid/weather/vegagerdin/current on mount
// 401/403/404 → restricted (silent, no error)
// Network error → loadError
// status='unavailable' → vegagerdinLayer=null, unavailableReason='empty'
```

`VegagerdinCurrentApiData` type (discriminated by `status`):
```ts
| { status: 'ok'; cacheStatus: ...; measurementFreshness: ...; fetchedAtIso: ...; oldestMeasuredAtIso: ...; stations: VegagerdinCurrentMeasurement[] }
| { status: 'unavailable'; stations: [] }
```

Map layer built from `payload.stations` when `status === 'ok'` and stations exist.

`unavailableReason` logic:
- `restricted` when 401/403/404
- `error` when network error
- `empty` when status='unavailable' or stations=[]
- `undefined` when data is ready

`renderPostMap` shows `VegagerdinStationDetail` for the selected station.

#### 9. New `VegagerdinStationDetail` component

Provider-neutral current-measurement preview card. Uses `ProviderStationPreviewCard`.

Copy is explicitly NOT forecast:
- `providerLabel = tOv('vegagerdinProviderLabel')` — "Vegagerðin"
- `contextLine = tOv('vegagerdinCurrentLabel')` — "Núverandi mæling frá Vegagerðinni"
- Shows: measured time, mean wind (m/s), gust last 10 min (m/s), wind direction, air temp, road temp, fetched time
- Shows `measurementFreshness` label when not 'unknown'
- Does not show forecast rows, doesn't link to pulse, doesn't affect scrubber or trip risk

## Commands run and exit codes

```bash
npm run type-check
# exit 0

npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/sql-migration.test.ts
# 5 files, 447 tests passed, exit 0
```

## Files changed

```
.env.example                                                (B4B: fix Veðurstofan provider docs)
lib/weather/providers/vegagerdinCurrentTypes.ts             (B4B: MeasurementFreshness already present)
lib/weather/providers/vegagerdinCurrent.server.ts           (B4B: getMeasurementFreshness, split result type)
messages/is.json                                            (B4B: allProvidersUnavailable key)
messages/en.json                                            (B4B: allProvidersUnavailable key)
components/weather/WeatherOverviewShell.tsx                 (B4B: allProvidersUnavailable copy + lastRestoredIdRef URL fix)
lib/__tests__/weather-vegagerdin-current.test.ts            (B4B: freshness tests + getMeasurementFreshness suite)
lib/__tests__/guard.test.ts                                 (B4B: weather-provider-vegagerdin guard suites)
lib/__tests__/feature-access-api.test.ts                    (B4B: weather-provider-vegagerdin API tests)
lib/__tests__/sql-migration.test.ts                         (B4B: sql/80 static checks)
middleware.ts                                               (B4C: add /api/teskeid/weather/vegagerdin/current to EXACT_PUBLIC_PATHS)
lib/__tests__/middleware.test.ts                            (B4C: 3 middleware tests for vegagerdin/current)
app/api/teskeid/weather/vegagerdin/current/route.ts         (B4C: NEW — cache-only GET route)
components/weather/WeatherOverviewClient.tsx                (B4C: Vegagerðin fetch state + adapter + VegagerdinStationDetail)
```

## Risks and notes

### Vegagerðin live response shape still unverified

`fetchVegagerdinCurrent()` is still not called anywhere. The parser exists but the field casing, Dags format, and response shape have not been verified against a live response. Do not wire the live fetch without Stebbi approval.

### No cache data yet in production/dev

Until `fetchVegagerdinCurrent()` is called by a cron job or a manual trigger, the cache will be empty. The Vegagerðin provider will show `unavailableReason: 'empty'` — silent, no broken UI. Provider strip will show the empty/upcoming state (no dot label for 'empty' is needed; it's not shown).

Wait — actually `unavailableReason: 'empty'` will show in the provider strip. The shell doesn't currently have a label for `'empty'`. Let me check what the strip shows for `'empty'`...

Looking at WeatherOverviewShell.tsx provider strip logic:
```tsx
const statusLabel =
  p.unavailableReason === 'upcoming' ? t('providerUpcoming')
  : p.unavailableReason === 'restricted' || p.providerRestricted ? t('providerRestricted')
  : p.unavailableReason === 'error' || p.loadError ? t('providerError')
  : null
```

For `unavailableReason === 'empty'`, `statusLabel` will be `null` — no label shown. The provider strip still renders the dot (grey/loading). This is acceptable behavior for the empty state.

**RISK**: The empty state dot color branch in `WeatherOverviewShell.tsx`:
```tsx
const dotColor = p.loading
  ? 'bg-muted-foreground/40'
  : p.loadError ? 'bg-destructive'
  : p.unavailableReason === 'upcoming' ? 'bg-muted-foreground/25'
  : isUnavailable ? 'bg-muted-foreground'
  : 'bg-green-600'
```

For `unavailableReason === 'empty'`, `isUnavailable` is true → `bg-muted-foreground` (grey dot, no label). This is correct and intentional — Vegagerðin hasn't fetched data yet, so it appears as a grey unnamed entry. Stebbi should check this on localhost.

### SQL 80 still not run

No change from v436. `sql/80` must be run by Stebbi before `feature_access` rows with `weather-provider-vegagerdin` can be inserted.

### `fetchVegagerdinCurrent` is not called

The cron fetch is not wired. Vegagerðin will always show 'empty' until:
1. A cron is added that calls `fetchVegagerdinCurrent()`
2. Stebbi approves the live upstream fetch

### vegagerdinLayer markers use tone='ok' always

There's no measurement-based tone logic yet — all Vegagerðin markers show green. This can be improved once we have freshness-aware tone logic (e.g., 'warning' for aging, 'unavailable' for stale). For B4C this is acceptable.

### URL restoration for Vegagerðin

The B4B URL fix (`lastRestoredIdRef`) ensures that when a Vegagerðin marker is selected and the user navigates, the shell will re-attempt restoration when `urlMarkerId` changes. Since Vegagerðin uses layerId='vegagerdin', the marker lookup will work once the provider is loaded.

## SQL / RLS / auth notes

No new SQL in this step. `sql/80` from v436 is still the pending migration.

No RLS changes. No grant changes. No new tables.

The new API route follows the same auth model as `vedurstofan/stations`:
- Access control is in the route handler, not middleware
- Middleware only bypasses session redirect for the exact path

## Localhost checks for Stebbi

1. **Public `/vedrid` — empty Vegagerðin state (expected with no cache data)**
   - Open `http://localhost:3004/vedrid`
   - Expected: overview loads, provider strip shows "Veðurstofan" (green dot) + "Vegagerðin" (grey dot, no label)
   - No broken UI, no error messages for Vegagerðin
   - Veðurstofan stations load normally

2. **Auth `/auth-mvp/vedrid`**
   - Same as above with auth hamburger

3. **All-providers-unavailable copy**
   - Temporarily set `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` for a user without access
   - Expected: if both Veðurstofan is restricted and Vegagerðin is empty, degraded state shows "Engar veðurupplýsingar tiltækar." (NOT the old "Náði ekki...")

4. **URL restoration with browser back/forward**
   - Select a station on `/vedrid`
   - Open `http://localhost:3004/vedrid?stationId=<known-station-id>`
   - Use browser back/forward between two different stationId values
   - Expected: selected marker updates on each navigation (B4B fix)

5. **Vegagerðin API route (no cache data)**
   - Call `http://localhost:3004/api/teskeid/weather/vegagerdin/current`
   - Expected: `{ "status": "unavailable", "stations": [] }`
   - No error, no 500

6. **Provider strip with two providers**
   - Expected: strip shows both rows, compact, no overflow
   - No toggle buttons (canToggle=false)

7. **No Vegagerðin in trip results**
   - Open a ferðaveðrið route calculation
   - Expected: no Vegagerðin measurements in forecast, scrubber, or trip status

Do not test:
- SQL 80 execution
- Live Vegagerðin fetch
- Production
- Vercel/env changes
- Cron

## Skipped items

- Route matching for Vegagerðin (B4D) — out of scope
- DATEX II, cameras, road conditions — explicitly out of scope
- Provider toggles (canToggle=true) — infrastructure ready, not activated
- Vegagerðin map marker tone logic — always 'ok' for now (acceptable for B4C)
- `vegagerdinUpcomingHelperText` — was used for a helper line; not shown in provider strip currently
- Icelandic copy for "Átt", "Lofttemp.", "Vegatemp.", "Mælingarferskleiki" in `VegagerdinStationDetail` — inline Icelandic strings used for now; can be moved to messages later
