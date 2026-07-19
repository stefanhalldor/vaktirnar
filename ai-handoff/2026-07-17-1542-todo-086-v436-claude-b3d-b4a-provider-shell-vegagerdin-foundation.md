# 2026-07-17 15:42 - TODO-086 v436 - Claude: B3D + B4A provider shell hardening + Vegagerðin foundation

Created: 2026-07-17 15:42
Timezone: Atlantic/Reykjavik
Source handoffs:
- `2026-07-17-1500-todo-086-v433-claude-b3c-provider-neutral-shell-prerelease.md`
- `2026-07-17-1523-todo-086-v434-codex-v433-provider-neutral-shell-review.md`
- `2026-07-17-1527-todo-086-v435-codex-big-next-step-provider-shell-and-vegagerdin-foundation.md`

## What was done

### B3D: Provider-neutral shell hardening

#### 1. Extended `WeatherOverviewProviderConfig` contract

`components/weather/WeatherOverviewShell.tsx` now requires:

```ts
export interface WeatherOverviewProviderConfig {
  providerId: string
  label: string            // NEW: human-readable provider name
  shortLabel?: string      // NEW: optional compact label for narrow contexts
  loading: boolean
  loadError: boolean
  providerRestricted: boolean
  unavailableReason?: 'restricted' | 'disabled' | 'upcoming' | 'error' | 'empty'  // NEW
  canToggle: boolean       // NEW: whether shell should render a toggle
  isVisible: boolean       // NEW: whether this provider's content/layer is shown
  onToggle?: (nextVisible: boolean) => void  // NEW: called on toggle
  mapLayer: ProviderMapLayer | null
  renderPreMap?: (ctx: ProviderContentCtx) => React.ReactNode
  renderPostMap?: (ctx: ProviderContentCtx) => React.ReactNode
}
```

#### 2. Generic provider strip

When `providers.length > 1`, the shell now renders a compact provider strip above the pre-map content. It shows each provider's name, a status dot (green/grey/red/upcoming), and a status label (`providerUpcoming`, `providerRestricted`, `providerError`).

Toggle buttons (aria-pressed) appear when `canToggle=true` and the provider is not unavailable. No providers use `canToggle=true` yet — the infrastructure is wired.

#### 3. Fixed URL restoration for multi-provider scenarios

Old behavior: set `restoredFromUrl.current = true` as soon as `hasMapData` was first true, even if the target marker was in a not-yet-loaded provider.

New behavior:
- Effect depends on `[layerCount, allSettled]` (not `[hasMapData]`).
- Re-runs each time a new provider layer becomes available.
- Only marks done when either:
  (a) The requested marker is found across all current layers, OR
  (b) All providers have settled (no longer loading) and no match was found.
- If `?stationId=` is absent, marks done immediately on first run.

```tsx
const allSettled = providers.every(p => !p.loading)
const layerCount = mapLayers.length

useEffect(() => {
  if (restoredFromUrl.current) return
  const urlMarkerId = searchParams.get('stationId')
  if (!urlMarkerId) { restoredFromUrl.current = true; return }
  for (const layer of mapLayers) {
    if (layer.markers.some(m => m.id === urlMarkerId)) {
      setSelectedProvider({ layerId: layer.layerId, markerId: urlMarkerId })
      restoredFromUrl.current = true
      return
    }
  }
  if (allSettled) restoredFromUrl.current = true
}, [layerCount, allSettled])
```

#### 4. Moved generic copy from `eltaVedrid` to `overview` namespace

`WeatherOverviewShell` now uses `useTranslations('teskeid.vedrid.overview')` instead of `teskeid.vedrid.eltaVedrid`. Keys added to both `messages/is.json` and `messages/en.json`:

```json
"overview": {
  "back",
  "tripCta",
  "loading",
  "loadError",
  "mapUnavailable",
  "providerUpcoming",
  "providerRestricted",
  "providerError",
  "vegagerdinProviderLabel",
  "vegagerdinUpcomingHelperText",
  "vegagerdinMeasuredAt",
  "vegagerdinMeanWind",
  "vegagerdinGust",
  "vegagerdinCurrentLabel"
}
```

`WeatherOverviewClient` continues to use `teskeid.vedrid.eltaVedrid` for all adapter-specific strings.

#### 5. Graceful degraded state

When all providers have `providerRestricted=true` or `unavailableReason != null`, the shell shows a quiet `loadError` message rather than a blank screen.

Only active providers (`isVisible=true && !unavailableReason`) get their `renderPreMap`/`renderPostMap` called, and only their map layers go to `IcelandOverviewMap`.

#### 6. `WeatherOverviewClient` updated

- Added `label: 'Veðurstofan'`, `canToggle: false`, `isVisible: true` to `vedurstofanProvider`.
- `unavailableReason` is now derived: `'restricted'` when `providerRestricted`, `'error'` when `loadError`, undefined otherwise.
- Added a second `useTranslations('teskeid.vedrid.overview')` call for Vegagerðin label.

### B4A: Vegagerðin current-measurement provider foundation

#### 7. Vegagerðin types (`lib/weather/providers/vegagerdinCurrentTypes.ts`)

New file with three exported types:

- `VegagerdinRawItem` — raw shape from `gagnaveita.vegagerdin.is/api/vedur2014_1` (documented; not yet verified against live response).
- `VegagerdinCurrentMeasurement` — normalized measurement:
  - `meanWindMs` ← `Vindhradi` (sustained/mean wind, current measurement)
  - `gustLast10MinMs` ← `Vindhvida` (max gust last 10 min, NOT forecast gust)
  - All null fields stay null — never coerced to 0.
  - `dataQuality: 'complete' | 'partial'`
- `VegagerdinCachePayload` — cache record stored in `weather_cache`.

#### 8. Parser/cache server module (`lib/weather/providers/vegagerdinCurrent.server.ts`)

Server-only (`import 'server-only'`). Three public exports:

**`parseVegagerdinResponse(body, fetchedAtIso)`** — pure parser:
- Accepts raw JSON string.
- Handles both array and `{ results: [...] }` / `{ data: [...] }` shapes.
- Parses `Dags` as `'YYYY-MM-DD HH:mm:ss'` → UTC ISO (Iceland = UTC+0).
- Falls back to `fetchedAtIso` if `Dags` is absent/blank/unparseable.
- Skips rows missing station ID or coordinates.
- Never throws.

**`readVegagerdinCurrentFromCache()`** — reads `weather_cache` only, never contacts upstream:
- Returns `{ status: 'fresh' | 'stale' | 'unavailable', payload }`.
- Fresh TTL: 2 minutes. Stale window: 30 minutes.

**`fetchVegagerdinCurrent()`** — live HTTP fetch (REQUIRES STEBBI APPROVAL BEFORE CALLING):
- Fetches `https://gagnaveita.vegagerdin.is/api/vedur2014_1`.
- Timeout: 8 seconds.
- Parses and writes to `weather_cache` key `vegagerdin:vedur2014_1:latest`.
- NOT called anywhere in this step.

#### 9. SQL migration (`sql/80_feature_access_weather_provider_vegagerdin.sql`)

Adds `'weather-provider-vegagerdin'` to the `feature_access_feature_key_check` constraint. NOT run. Idempotent (drops and recreates). Rollback in file.

#### 10. Feature access wiring

- `lib/loans/guard.ts`: added `'weather-provider-vegagerdin'` branch following exact same graduation pattern as `'weather-provider-vedurstofan'`.
- `app/api/admin/feature-access/route.ts`: added `'weather-provider-vegagerdin'` to `ALLOWED_FEATURES`.
- `app/(admin)/admin/page.tsx`: added `FeatureAccessSection` for `weather-provider-vegagerdin` + widened `featureKey` type union.
- `.env.example`: documented `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED`.

#### 11. Overview provider seam

`WeatherOverviewClient.tsx` now includes a `vegagerdinProvider` in the `providers` array passed to `WeatherOverviewShell`:

```tsx
const vegagerdinProvider: WeatherOverviewProviderConfig = {
  providerId: 'vegagerdin',
  label: tOv('vegagerdinProviderLabel'),  // "Vegagerðin"
  loading: false,
  loadError: false,
  providerRestricted: false,
  unavailableReason: 'upcoming',
  canToggle: false,
  isVisible: false,
  mapLayer: null,
}
```

This makes the provider strip appear on `/vedrid` with two entries:
- `● Veðurstofan` (green dot when data is available)
- `○ Vegagerðin  Í undirbúningi`

No Vegagerðin data is fetched or displayed. The live fetch (`fetchVegagerdinCurrent`) is never called.

Vegagerðin does NOT affect: departure scrubber, worst forecast point, `selectDecisiveProvider`, or any travel status logic.

#### 12. Tests (`lib/__tests__/weather-vegagerdin-current.test.ts`)

31 tests across 9 suites covering:
- Basic parsing (array, wrapped in `results`/`data`, invalid JSON)
- Vindhradi/Vindhvida semantics (correct field mapping)
- Null handling (null stays null, never 0, row skipping)
- String-number coercion
- Dags time parsing (local → UTC ISO, fallback cases)
- Multi-row behavior (independent parsing, invalid-row skip)
- Cache fresh/stale/unavailable/expired/wrong-source behavior

## Commands run and exit codes

```bash
npm run type-check     # exit 0 (clean)
npm run test:run -- lib/__tests__/middleware.test.ts \
                    lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts \
                    lib/__tests__/pulseBack.test.ts \
                    lib/__tests__/weather-vegagerdin-current.test.ts
# 4 files, 113 tests passed, exit 0
```

## Files inspected

- `components/weather/WeatherOverviewShell.tsx` (current state post-B3C)
- `components/weather/WeatherOverviewClient.tsx`
- `lib/loans/guard.ts` (feature access pattern)
- `lib/weather/providers/vedurstofan.server.ts` (cache pattern)
- `app/api/admin/feature-access/route.ts` (ALLOWED_FEATURES pattern)
- `app/(admin)/admin/page.tsx` (FeatureAccessSection pattern)
- `sql/76_feature_access_weather_provider_vedurstofan.sql` (migration pattern)
- `sql/79_feature_access_weather_pulse.sql` (latest constraint state)
- `messages/is.json` and `messages/en.json`
- `.env.example`
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts` (test pattern)
- `ai-handoff/2026-07-15-0709-todo-086-v197-codex-vegagerdin-current-measurements-handoff.md`
- `ai-handoff/2026-07-16-1431-todo-086-v330-codex-v197-vegagerdin-structure-review.md`

## Files changed

```
components/weather/WeatherOverviewShell.tsx   (B3D: extended contract, provider strip, URL fix, overview namespace)
components/weather/WeatherOverviewClient.tsx  (B3D: new required fields; B4A: vegagerdin seam)
lib/weather/providers/vegagerdinCurrentTypes.ts  (NEW: types)
lib/weather/providers/vegagerdinCurrent.server.ts  (NEW: parser + cache)
lib/__tests__/weather-vegagerdin-current.test.ts  (NEW: 31 tests)
sql/80_feature_access_weather_provider_vegagerdin.sql  (NEW: not run)
lib/loans/guard.ts  (added weather-provider-vegagerdin branch)
app/api/admin/feature-access/route.ts  (added to ALLOWED_FEATURES)
app/(admin)/admin/page.tsx  (added FeatureAccessSection + type union)
.env.example  (documented WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED)
messages/is.json  (added teskeid.vedrid.overview.* namespace)
messages/en.json  (added teskeid.vedrid.overview.* namespace)
```

## Risks and notes

### Vegagerðin live response shape is unverified

The parser (`parseVegagerdinResponse`) is built against the documented API structure from handoffs v197 and v330. The following must be verified against a real response before `fetchVegagerdinCurrent` is called:

1. Field casing (`Maelir_nr`, `Nafn`, `Vindhradi`, `Vindhvida`, `Dags`, etc.)
2. Whether numeric values come as numbers or strings (parser handles both)
3. `Dags` format and timezone (parser assumes `'YYYY-MM-DD HH:mm:ss'` UTC)
4. Whether the top-level shape is a bare array or wrapped (`{ results: [...] }`)
5. Whether null fields appear as JSON `null`, missing keys, or empty strings (parser handles all three)

### `fetchVegagerdinCurrent` is not called anywhere

The upstream fetch function exists but is not wired to any route, cron, or API handler. Stebbi must explicitly approve the external fetch before it is connected.

### SQL migration 80 not run

`sql/80_feature_access_weather_provider_vegagerdin.sql` must be run by Stebbi before any `feature_access` row with `feature_key = 'weather-provider-vegagerdin'` can be inserted. The guard and admin API are ready.

### Provider strip now visible on `/vedrid`

With two providers registered (Veðurstofan + Vegagerðin as upcoming), the provider strip is now rendered. This is a new visual element. Stebbi should check it on both public and auth overview pages.

### `canToggle` is false for both providers

The toggle infrastructure is wired (type, shell rendering, aria-pressed) but no provider uses it yet. No toggle UI appears. This is intentional.

### `WeatherOverviewShell` does not re-export `eltaVedrid` keys

The shell now uses `teskeid.vedrid.overview.*` for its 5 generic keys. The `eltaVedrid` namespace is unchanged and still used by `WeatherOverviewClient` for adapter-specific strings. No `eltaVedrid` keys were removed.

## SQL / RLS / auth notes

### sql/80 analysis

```sql
ALTER TABLE public.feature_access
  ADD CONSTRAINT feature_access_feature_key_check
  CHECK (feature_key IN (
    ..., 'weather-provider-vegagerdin'
  ));
```

- No new table created.
- No RLS policy change.
- No grant change.
- Idempotent (drops constraint before recreating).
- Must be run on the production database by Stebbi before any Vegagerðin access rows can be inserted.

### Vegagerðin access model

Same graduation pattern as Veðurstofan:

- `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` → per-user gate via `feature_access` table.
- Unset/false → open to all weather users (graduation path).
- Currently unset in `.env.example`, defaulting to open.

## Skipped items

- Route matching for Vegagerðin (extract `projectToPolyline` etc.) — out of scope for this step.
- Product tables for Vegagerðin measurements — not needed before parser/cache is proven.
- `weather_fetch_runs.source` extension for Vegagerðin — not needed until cron is added.
- DATEX II, road closures, road condition/færð, cameras — explicitly out of scope.
- Any Vegagerðin data influence on scrubber, worst-point, or travel status — out of scope.
- Provider toggles (canToggle=true) — infrastructure ready, not activated yet.
- Live fetch approval — requires separate Stebbi sign-off.

## Localhost checks for Stebbi

1. **Public `/vedrid`**
   - Expected: overview loads, provider strip shows "Veðurstofan" (green dot) + "Vegagerðin Í undirbúningi" (grey dot).
   - Veðurstofan stations visible on map and in list.
   - "Reikna ferðaveðrið" CTA visible.

2. **Auth `/auth-mvp/vedrid`**
   - Expected: same overview with auth hamburger, provider strip appears.

3. **Provider strip**
   - No toggle buttons visible (canToggle=false for all).
   - Veðurstofan dot is green when data is loaded.
   - Vegagerðin says "Í undirbúningi".
   - Strip is compact and doesn't dominate the layout.

4. **URL restore (multi-provider ready)**
   - Select a Veðurstofan station, open its pulse, return with `?stationId=...`.
   - Expected: correct marker selected even though Vegagerðin also registers a provider slot.

5. **Restricted provider**
   - Set `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` for a user without access.
   - Expected: overview still renders, provider strip shows "Veðurstofan Takmarkaður aðgangur", Vegagerðin still shows "Í undirbúningi".

6. **Mobile widths (390px and 546px)**
   - Expected: provider strip wraps naturally if needed, no horizontal overflow.

7. **No Vegagerðin data in trip results**
   - Open a ferðaveðrið route calculation.
   - Expected: no Vegagerðin measurements appear in forecast points, scrubber, or status.

Do not test production, SQL, Vercel, live Vegagerðin fetch, or cron.
