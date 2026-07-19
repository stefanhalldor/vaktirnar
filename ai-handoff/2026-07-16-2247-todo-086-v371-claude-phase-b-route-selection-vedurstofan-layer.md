# TODO 086 v371 - Phase B: Veðurstofan station layer on route-selection map

Created: 2026-07-16 22:55
Timezone: Atlantic/Reykjavik
Author: Claude

Related handoffs:
- `2026-07-16-2224-todo-086-v368-codex-v367-route-selection-provider-layers-review.md` (Codex direction)
- `2026-07-16-2237-todo-086-v370-codex-v369-prerelease-review.md` (Phase A accepted)

## Workflow framing for Claude Code

If Stebbi sends this with `Workflow`, Claude Code may:

1. Review this critically first, devil's advocate style.
2. Stop and write a handoff/review if there are blocking questions or a safer simpler path.
3. If scope is clear, implement only the scoped local code/test changes below.
4. After implementation, write a new handoff immediately.

This does not permit commit, push, deploy, Vercel changes, SQL execution, migration execution, production work, or env/secrets changes.

## Goal

Show Veðurstofan weather station markers on the route-selection map in `/vedrid`, so users can see which stations exist along their candidate route before confirming and running the full calculation.

Clicking a station marker shows a lightweight preview card with station name, provider badge, distance from road, and ~3 forecast rows around the current time.

## Scope — Phase B only

**Include:**
- New lightweight API endpoint for route-selection provider station data
- Veðurstofan station markers on the `RouteSelectionStep` map
- Inline station preview panel (click/tap to open, below the map)
- Fetch triggered in `FerdalagidClient` when selected route changes and user has Vedurstofan access
- i18n strings (Icelandic + English)
- Tests for the new endpoint

**Do NOT include in this pass:**
- Threshold coloring on markers (Phase C — no wind status colors yet)
- Time scrubber (Phase C)
- Veðurpúls message in preview (Phase D)
- Yr-at-station comparison (Phase D)
- Vegagerðin layer (Phase E)
- Any extra Google Maps route calls
- Changes to MET/Yr sampling or final route calculation
- SQL migrations, env changes, deploy

## Architecture overview

Currently:
- `/api/teskeid/weather/travel/routes` → returns `RouteOption[]` with polylines
- `RouteSelectionStep.tsx` shows the map with route polylines, no provider markers
- `FerdalagidClient.tsx` has `showVedurstofan` state but it only applies to the result step

After Phase B:
- New endpoint: `POST /api/teskeid/weather/travel/provider-stations`
- `FerdalagidClient.tsx` fetches from new endpoint when selected route changes (if user has Vedurstofan access)
- `RouteSelectionStep.tsx` receives station data as props, renders markers and inline preview

## New API endpoint

### Location

`app/api/teskeid/weather/travel/provider-stations/route.ts`

### Request

```ts
POST /api/teskeid/weather/travel/provider-stations
Content-Type: application/json

{
  "routePoints": [{ "lat": 64.09, "lon": -21.93 }, ...]  // selected route's .points
}
```

Validation:
- `routePoints` must be a non-empty array of `{ lat: number; lon: number }` objects
- Max 1000 points (safety guard against oversized bodies)
- Each point: `lat` and `lon` must be finite numbers
- Return 400 for invalid input

### Access model

Same gate as Vedurstofan in the final route handler:

```ts
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'
const layerEnabled = !vedurstofanAccessRequired
  ? true
  : user?.id && user?.email
    ? await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
    : false
```

If `!layerEnabled`, return 403.

Base weather access (`resolveWeatherBaseAccess`) must also pass (return 401 if blocked).

### Station matching

Reuse `matchProviderPointsToRoute` from `lib/weather/providerRouteMatching.ts`:

```ts
const PROVIDER_STATIONS_ROUTE_MAX_DISTANCE_M = 15_000

const matches = matchProviderPointsToRoute({
  points: VEDURSTOFAN_STATIONS_REGISTRY
    .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
    .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
  routePolyline: routePoints,
  maxDistanceM: PROVIDER_STATIONS_ROUTE_MAX_DISTANCE_M,
})
```

### Forecast fetch

Fetch Vedurstofan product for matched stations. No ETA window needed — use a default window around now (past 3h to future 12h) so the preview shows current/upcoming rows:

```ts
const nowMs = Date.now()
const etaWindowFromIso = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString()
const etaWindowToIso   = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString()
```

Use `withLayerTimeout` (same 1500ms budget as final route handler) around `readVedurstofanProductForStations`.

If no stations match or fetch times out, return `{ stations: [], status: 'unavailable' }` — never return 503 for Vedurstofan data absence.

### Response shape

```ts
type ProviderStationsResponse = {
  stations: ProviderStationPoint[]
  status: 'available' | 'unavailable'
}

type ProviderStationPoint = {
  stationId: string
  stationName: string
  lat: number
  lon: number
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  atimeIso: string | null
  forecastRows: Array<{
    ftimeIso: string
    windSpeedMs: number | null
    precipitationMmPerHour: number | null
    temperatureC: number | null
    windDirectionText: string | null
    weatherText: string | null
  }>
}
```

Only include stations where `lat` and `lon` are non-null. Include both `ok` and `stale` status stations. Skip `unavailable` status stations (same as final route handler).

Sort by `distanceFromOriginM` ascending, then `stationId` for stable output (already done by `matchProviderPointsToRoute`, but re-sort after DB merge).

Define `ProviderStationPoint` in `lib/weather/providerRouteMatching.ts` (it's a provider-neutral type). Or in a new small file `lib/weather/providers/providerStations.ts` — wherever feels cleanest given the existing structure. Do not put it in `vedurstofanBlend.ts`.

### No usage event needed for this endpoint

The route-selection preview is lightweight context, not a billable/tracked final calculation. Do not add `recordTeskeidUsageEvent`.

## `FerdalagidClient.tsx` changes

### New state

```ts
const [routeSelectionStations, setRouteSelectionStations] = useState<ProviderStationPoint[] | null>(null)
const [routeSelectionStationsLoading, setRouteSelectionStationsLoading] = useState(false)
```

No error state needed — station fetch is fail-open (silently skip on failure).

### New effect: fetch stations when selected route changes

```ts
useEffect(() => {
  if (step !== 'route') return
  if (!selectedRouteId || !routeOptions) return

  const selectedRoute = routeOptions.find(r => r.id === selectedRouteId)
  if (!selectedRoute || selectedRoute.points.length < 2) return

  // Only fetch if user has Vedurstofan access (checked server-side anyway, but skip the round trip)
  // For now: always attempt, let server gate access.
  // If 403 comes back, just clear stations silently.

  let cancelled = false
  setRouteSelectionStations(null)
  setRouteSelectionStationsLoading(true)

  fetch('/api/teskeid/weather/travel/provider-stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routePoints: selectedRoute.points }),
  })
    .then(r => r.ok ? r.json() : null)
    .then((data: ProviderStationsResponse | null) => {
      if (cancelled) return
      setRouteSelectionStations(data?.stations ?? null)
    })
    .catch(() => { if (!cancelled) setRouteSelectionStations(null) })
    .finally(() => { if (!cancelled) setRouteSelectionStationsLoading(false) })

  return () => { cancelled = true }
}, [step, selectedRouteId, routeOptions])
```

Clear `routeSelectionStations` when step changes away from 'route':

```ts
useEffect(() => {
  if (step !== 'route') setRouteSelectionStations(null)
}, [step])
```

### Pass to `RouteSelectionStep`

Add to the existing `<RouteSelectionStep ... />` render:

```tsx
vedurstofanStations={routeSelectionStations ?? undefined}
```

No need to pass `routeSelectionStationsLoading` — the map shows what it has, no loading indicator needed for the optional station layer.

## `RouteSelectionStep.tsx` changes

### New prop

```ts
vedurstofanStations?: ProviderStationPoint[]
```

### New state

```ts
const [selectedStation, setSelectedStation] = useState<ProviderStationPoint | null>(null)
const stationMarkersRef = useRef<google.maps.Marker[]>([])
```

Clear `selectedStation` when `vedurstofanStations` changes (new route selected).

### Effect: draw station markers

Add a new effect that depends on `vedurstofanStations` and `mapLoaded`:

```ts
useEffect(() => {
  // Clear previous station markers
  stationMarkersRef.current.forEach(m => m.setMap(null))
  stationMarkersRef.current = []
  setSelectedStation(null)

  if (!mapRef.current || !mapLoaded || !vedurstofanStations) return

  let cancelled = false
  loadMarkerLibrary().then(markerLib => {
    if (cancelled || !mapRef.current) return
    vedurstofanStations.forEach(station => {
      const marker = new markerLib.Marker({
        position: { lat: station.lat, lng: station.lon },
        map: mapRef.current!,
        icon: makeStationIcon(),
        title: station.stationName,
        zIndex: 3,
      })
      marker.addListener('click', () => setSelectedStation(station))
      stationMarkersRef.current.push(marker)
    })
  })
  return () => { cancelled = true }
}, [vedurstofanStations, mapLoaded])
```

Station icon: a small teal circle (distinct from origin/destination markers). Add:

```ts
function makeStationIcon(): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: 7,
    fillColor: '#0891b2',   // cyan-600 — distinct from green origin and blue destination
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  }
}
```

### Preview panel — rendered below the map

Add immediately after the `</div>` that wraps the map:

```tsx
{selectedStation && (
  <RouteStationPreviewCard
    station={selectedStation}
    onClose={() => setSelectedStation(null)}
  />
)}
```

### New component: `RouteStationPreviewCard`

Create as a small local component at the bottom of `RouteSelectionStep.tsx` (not a separate file — it's small and tightly coupled to this step):

```tsx
function RouteStationPreviewCard({
  station,
  onClose,
}: {
  station: ProviderStationPoint
  onClose: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  // Pick 3 forecast rows closest to now
  const nowMs = Date.now()
  const rows = [...station.forecastRows]
    .sort((a, b) => Math.abs(new Date(a.ftimeIso).getTime() - nowMs) - Math.abs(new Date(b.ftimeIso).getTime() - nowMs))
    .slice(0, 3)
    .sort((a, b) => new Date(a.ftimeIso).getTime() - new Date(b.ftimeIso).getTime())

  const distanceKm = (station.distanceM / 1000).toFixed(1)

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{station.stationName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
              Veðurstofan
            </span>
            <span className="text-[11px] text-muted-foreground">
              {tf('stationDistanceFromRoute', { km: distanceKm })}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tf('stationPreviewClose')}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map(row => (
            <div key={row.ftimeIso} className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground w-14 shrink-0">
                {formatStationRowTime(row.ftimeIso)}
              </span>
              <span className="text-xs font-medium text-foreground flex-1 truncate">
                {row.weatherText ?? '—'}
              </span>
              {row.windSpeedMs !== null && (
                <span className="text-xs text-foreground font-mono shrink-0">
                  {row.windSpeedMs.toFixed(0)} m/s
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{tf('stationPreviewNoData')}</p>
      )}
    </div>
  )
}
```

`formatStationRowTime` is a small helper in the same file:

```ts
function formatStationRowTime(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
```

Note: This only shows HH:mm — sufficient for "around now" preview. If the row spans to the next day, the date context is missing. Accept this limitation in Phase B; it can be addressed in Phase C with the scrubber.

## i18n keys

Add to `messages/is.json` and `messages/en.json` under `teskeid.vedrid.ferdalagid`:

```json
"stationDistanceFromRoute": "{km} km frá veginum",
"stationPreviewClose": "Loka forskoðun",
"stationPreviewNoData": "Engin gögn tiltæk"
```

English:
```json
"stationDistanceFromRoute": "{km} km from road",
"stationPreviewClose": "Close preview",
"stationPreviewNoData": "No data available"
```

## Tests

### New endpoint tests

Create `lib/__tests__/weather-provider-stations.test.ts`.

Mock pattern follows `weather-travel-api.test.ts`:

```ts
vi.mock('@/lib/weather/providerRouteMatching', () => ({
  haversineM: ..., // real implementation
  matchProviderPointsToRoute: mockMatchProviderPoints,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  readVedurstofanProductForStations: mockFetchVedurstofan,
  getLastVedurstofanWarmAttemptIso: vi.fn().mockResolvedValue(null),
}))
```

Required tests (minimum):

1. Returns 401 when base weather access is blocked.
2. Returns 403 when user lacks Vedurstofan access and `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
3. Returns 400 for invalid / empty `routePoints`.
4. Returns `{ stations: [], status: 'unavailable' }` when `matchProviderPointsToRoute` returns no matches.
5. Returns station list with forecast rows when stations are matched and product table has data.
6. Excludes `unavailable` status stations from the response.
7. Returns `{ stations: [], status: 'unavailable' }` (not 503) when product table fetch times out.
8. Does not call `readVedurstofanProductForStations` when no stations matched.

## Suggested file changes

New:
- `app/api/teskeid/weather/travel/provider-stations/route.ts`
- `lib/__tests__/weather-provider-stations.test.ts`

Modified:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — new state + fetch effect
- `components/weather/RouteSelectionStep.tsx` — new prop, markers, preview panel
- `messages/is.json`
- `messages/en.json`

Possibly:
- `lib/weather/providerRouteMatching.ts` — add `ProviderStationPoint` type export if scoped here
- Or a new `lib/weather/providers/providerStations.ts` for the shared type

Not changing:
- `app/api/teskeid/weather/travel/route.ts` (final route handler)
- `lib/weather/providers/vedurstofanBlend.ts`
- `lib/weather/providerRouteMatching.ts` (logic unchanged)
- SQL, RLS, Vercel env, migrations

## Commands to run

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-provider-stations.test.ts
```

If RouteSelectionStep changes affect other test suites:
```bash
npm run test:run -- lib/__tests__/weather-travel-api.test.ts
```

Do not start the dev server unless Stebbi explicitly asks.

## Localhost checks for Stebbi

After implementation:

1. Open `/vedrid`.
2. Select Reykjavík → Selfoss (or any route with Veðurstofan stations nearby).
3. Confirm teal station markers appear on the route-selection map.
4. Confirm markers are only for stations along the selected route, not all Iceland.
5. Click a marker — confirm preview card appears below the map with station name, badge, distance, and ~3 forecast rows.
6. Click X on preview — card disappears.
7. Click a different route option — confirm markers update to the new route.
8. Continue to result — confirm existing Veðurstofan result behavior is unchanged.
9. Toggle Veðurstofan off in result — confirm result behavior is unchanged.
10. Test with a route that has no nearby stations (e.g. short city route) — confirm no markers, no crash.

## Risks for Claude Code

### `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` not set in most local envs

When the env var is absent, `layerEnabled=true` for all authenticated users. The endpoint will attempt to fetch data for all users. This is the same behavior as the final route handler — intentional open-access default.

### Station marker Z-index with route polylines

Station markers (zIndex 3) must render above route polylines (zIndex 1-2) but below origin/destination markers. Test visually on localhost.

### `loadMarkerLibrary()` is already used

The existing `loadMarkerLibrary()` call in RouteSelectionStep creates origin and destination markers. Reuse the same import — do not load it twice or create a second effect.

### Large routePoints payload

Some routes (e.g. Reykjavík → Ísafjörður) may have 200+ geometry points. This is fine for a POST body. The server validates max 1000 points.

### Preview card during route switch

When `selectedRouteId` changes, clear `selectedStation` immediately (before the new station fetch completes) so the old station preview doesn't stay visible. This should be handled in the `vedurstofanStations` change effect via `setSelectedStation(null)`.

## Óvissa / þarf að staðfesta

- Whether `ProviderStationPoint` type should live in `providerRouteMatching.ts` or a new shared file. Either is fine; pick the cleaner location given the existing file structure.
- Whether to show a small loading indicator on the route-selection map while stations are being fetched. Recommended: no indicator — the optional layer appears when ready, silently. Do not block the Confirm button on station loading.
- Whether the preview card is "enough" for Phase B or if the user needs a direct link to the full Veðurpúls. Codex recommended including it; leave it for Phase D to keep Phase B focused.
