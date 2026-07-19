# TODO 086 v373 - Phase B revised: Veðurstofan station layer on route-selection map

Created: 2026-07-16 23:15
Timezone: Atlantic/Reykjavik
Author: Claude

Related handoffs:
- `2026-07-16-2255-todo-086-v371-claude-phase-b-route-selection-vedurstofan-layer.md` (original plan)
- `2026-07-16-2248-todo-086-v372-codex-v371-phase-b-plan-review.md` (Codex review)

Addresses all 6 Codex v372 findings. Product decisions confirmed by Stebbi:
- Toggle: YES, default ON when user opens /vedrid with empty search
- Púls: YES, include in Phase B using existing VedurstofanPulseInline component

## Workflow framing for Claude Code

If Stebbi sends this with `Workflow`, Claude Code may:

1. Review this critically first, devil's advocate style.
2. Stop and write a handoff/review if there are blocking questions.
3. If scope is clear, implement only the scoped local code/test changes below.
4. After implementation, write a new handoff immediately.

This does not permit commit, push, deploy, Vercel changes, SQL execution, migration execution, production work, or env/secrets changes.

## Goal

Show Veðurstofan weather station markers on the route-selection map in `/vedrid`. User can toggle the layer on/off. Clicking a station marker opens an inline preview card with:

- Station name + "Veðurstofan" badge + distance from road
- 3 upcoming forecast rows (using existing `ForecastRowLine` component)
- Full `VedurstofanPulseInline` Púls section (preview, compose, login CTA — reusing existing component)

## Scope — Phase B only

**Include:**
- New API endpoint for route-selection provider station weather data
- Veðurstofan layer toggle on route-selection step (default ON)
- Station markers on `RouteSelectionStep` map (neutral gray, no wind classification)
- Inline station preview card with forecast rows + Púls (below the map)
- i18n strings (Icelandic + English)
- Endpoint tests

**Do NOT include:**
- Wind/threshold marker coloring (Phase C — no thresholds at route-selection step yet)
- Time scrubber (Phase C)
- Vegagerðin layer (Phase E)
- Yr-at-station comparison (Phase D)
- Extra Google Maps route calls
- Changes to MET/Yr sampling or final route calculation
- SQL migrations, env changes, deploy

## Architecture

```
FerdalagidClient
  showRouteStationLayer: boolean (default true)
  routeSelectionStations: ProviderStationPoint[] | null

  effect: selectedRouteId + showRouteStationLayer + routeOptions
    → POST /api/teskeid/weather/travel/provider-stations
    → 403: setShowRouteStationLayer(false), clear stations
    → ok: setRouteSelectionStations(data.stations)

RouteSelectionStep (receives showRouteStationLayer, onToggleStationLayer, vedurstofanStations)
  → toggle pill near map
  → station marker effect (gray circles)
  → selectedStation state
  → RouteStationPreviewCard (inline, below map)
      → ForecastRowLine × 3 (from VedurstofanForecastRows)
      → VedurstofanPulseInline (existing component, lazy loads)
```

## New API endpoint

### Location

`app/api/teskeid/weather/travel/provider-stations/route.ts`

### Request

```
POST /api/teskeid/weather/travel/provider-stations
Content-Type: application/json

{
  "routePoints": [{ "lat": 64.09, "lon": -21.93 }, ...]
}
```

Validation:
- `routePoints` must be a non-empty array, max 1000 entries
- Each entry must have finite `lat` and `lon` numbers
- Return 400 for missing/invalid body

### Access model

Two-gate check, same pattern as final route handler:

```ts
// Gate 1: base weather access
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
const access = await resolveWeatherBaseAccess(user)
if (access.mode === 'blocked') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Gate 2: Vedurstofan provider access
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'
const layerEnabled = !vedurstofanAccessRequired
  ? true
  : user?.id && user?.email
    ? await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
    : false

if (!layerEnabled) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

### Station matching

```ts
const PROVIDER_STATIONS_MAX_DISTANCE_M = 15_000

const matches = matchProviderPointsToRoute({
  points: VEDURSTOFAN_STATIONS_REGISTRY
    .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
    .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
  routePolyline: routePoints,
  maxDistanceM: PROVIDER_STATIONS_MAX_DISTANCE_M,
})

if (matches.length === 0) {
  return NextResponse.json({ stations: [], status: 'unavailable' })
}
```

### Forecast fetch

No departure ETA available at route-selection time. Use a default window spanning now ± buffer so upcoming rows are included:

```ts
const nowMs = Date.now()
const etaWindowFromIso = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString()
const etaWindowToIso   = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString()
```

Use same 1500ms budget as final route handler:

```ts
const stationIds = matches.map(m => m.point.id)
const vedurstofanResults = await withLayerTimeout(
  readVedurstofanProductForStations(stationIds, { etaWindowFromIso, etaWindowToIso }),
  null,
).catch(() => null)

if (!vedurstofanResults) {
  return NextResponse.json({ stations: [], status: 'unavailable' })
}
```

`withLayerTimeout` helper: copy or re-export from final route handler if needed. If moving to a shared location is cleaner, do it — otherwise inline it here.

### Build response

```ts
const registryByStationId = new Map(
  VEDURSTOFAN_STATIONS_REGISTRY
    .filter(s => s.stationId !== null)
    .map(s => [s.stationId!, s]),
)
const stationMatchById = new Map(matches.map(m => [m.point.id, m]))

const stations: ProviderStationPoint[] = []

for (const [stationId, stationResult] of vedurstofanResults) {
  if (stationResult.status === 'unavailable') continue
  const registryEntry = registryByStationId.get(stationId)
  const match = stationMatchById.get(stationId)
  if (!match) continue
  const lat = registryEntry?.lat ?? null
  const lon = registryEntry?.lon ?? null
  if (lat === null || lon === null) continue  // skip stations without coordinates

  stations.push({
    stationId,
    stationName: registryEntry?.name ?? stationId,
    lat,
    lon,
    distanceM: match.distanceM,
    distanceFromOriginM: match.distanceFromOriginM,
    routeFraction: match.routeFraction,
    atimeIso: stationResult.payload.atimeIso,
    sourceUrl: registryEntry?.sourceUrl ?? null,
    forecastRows: stationResult.payload.forecasts,
  })
}

// Sort by route order (matches already sorted, but DB map may reorder)
stations.sort((a, b) =>
  a.distanceFromOriginM !== b.distanceFromOriginM
    ? a.distanceFromOriginM - b.distanceFromOriginM
    : a.stationId.localeCompare(b.stationId),
)

return NextResponse.json({
  stations,
  status: stations.length > 0 ? 'available' : 'unavailable',
})
```

### Response type

Define in `lib/weather/providerRouteMatching.ts` (already the home for provider-neutral types):

```ts
export type ProviderStationPoint = {
  stationId: string
  stationName: string
  lat: number
  lon: number
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  atimeIso: string | null
  sourceUrl: string | null
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

No usage event needed for this endpoint.

## `FerdalagidClient.tsx` changes

### New state

```ts
const [showRouteStationLayer, setShowRouteStationLayer] = useState(true)
const [routeSelectionStations, setRouteSelectionStations] = useState<ProviderStationPoint[] | null>(null)
const [routeSelectionStationsLoading, setRouteSelectionStationsLoading] = useState(false)
```

### New effect: fetch on selected route change

```ts
useEffect(() => {
  if (step !== 'route') return
  if (!showRouteStationLayer) {
    setRouteSelectionStations(null)
    return
  }
  if (!selectedRouteId || !routeOptions) return

  const selectedRoute = routeOptions.find(r => r.id === selectedRouteId)
  if (!selectedRoute || selectedRoute.points.length < 2) return

  let cancelled = false
  setRouteSelectionStations(null)
  setRouteSelectionStationsLoading(true)

  fetch('/api/teskeid/weather/travel/provider-stations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routePoints: selectedRoute.points }),
  })
    .then(async r => {
      if (r.status === 403) {
        // User lacks provider access — hide the toggle entirely
        if (!cancelled) setShowRouteStationLayer(false)
        return null
      }
      return r.ok ? r.json() : null
    })
    .then((data: { stations: ProviderStationPoint[] } | null) => {
      if (!cancelled) setRouteSelectionStations(data?.stations ?? null)
    })
    .catch(() => { if (!cancelled) setRouteSelectionStations(null) })
    .finally(() => { if (!cancelled) setRouteSelectionStationsLoading(false) })

  return () => { cancelled = true }
}, [step, selectedRouteId, routeOptions, showRouteStationLayer])
```

Clear stations when leaving route step:

```ts
useEffect(() => {
  if (step !== 'route') {
    setRouteSelectionStations(null)
    setRouteSelectionStationsLoading(false)
  }
}, [step])
```

### Pass to RouteSelectionStep

Add three props to the existing `<RouteSelectionStep ... />` render:

```tsx
showVedurstofanLayer={showRouteStationLayer}
onToggleVedurstofanLayer={() => setShowRouteStationLayer(v => !v)}
vedurstofanStations={showRouteStationLayer ? (routeSelectionStations ?? undefined) : undefined}
vedurstofanStationsLoading={routeSelectionStationsLoading}
```

Note: only pass `vedurstofanStations` when `showRouteStationLayer=true` so the marker effect in the child component sees `undefined` when toggled off and clears its markers.

## `RouteSelectionStep.tsx` changes

### New props

```ts
showVedurstofanLayer?: boolean
onToggleVedurstofanLayer?: () => void
vedurstofanStations?: ProviderStationPoint[]
vedurstofanStationsLoading?: boolean
```

All optional — RouteSelectionStep is usable without provider layer.

### New state and refs

```ts
const [selectedStation, setSelectedStation] = useState<ProviderStationPoint | null>(null)
const stationMarkersRef = useRef<google.maps.Marker[]>([])
```

### Effect: draw/clear station markers

```ts
useEffect(() => {
  stationMarkersRef.current.forEach(m => m.setMap(null))
  stationMarkersRef.current = []
  setSelectedStation(null)

  if (!mapRef.current || !mapLoaded || !vedurstofanStations || vedurstofanStations.length === 0) return

  let cancelled = false
  loadMarkerLibrary().then(markerLib => {
    if (cancelled || !mapRef.current) return
    const newMarkers: google.maps.Marker[] = []
    for (const station of vedurstofanStations) {
      const marker = new markerLib.Marker({
        position: { lat: station.lat, lng: station.lon },
        map: mapRef.current!,
        icon: makeStationMarkerIcon(),
        title: station.stationName,
        zIndex: 3,
      })
      marker.addListener('click', () => setSelectedStation(station))
      newMarkers.push(marker)
    }
    stationMarkersRef.current = newMarkers
  })

  return () => { cancelled = true }
}, [vedurstofanStations, mapLoaded])
```

Station marker icon — neutral gray (no wind classification at route-selection step):

```ts
function makeStationMarkerIcon(): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: 7,
    fillColor: '#9ca3af',   // no_data gray — same as WIND_STATUS_MARKER_COLOR['no_data']
    fillOpacity: 0.85,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  }
}
```

This reuses the existing `no_data` color from `WIND_STATUS_MARKER_COLOR` — honest (no wind classification) and consistent with the marker color system.

### Provider layer toggle pill

Place immediately above the map div (before `<div ref={mapDivRef} ...>`):

```tsx
{(showVedurstofanLayer !== undefined || onToggleVedurstofanLayer) && (
  <div className="flex items-center gap-2 flex-wrap">
    <button
      type="button"
      onClick={onToggleVedurstofanLayer}
      aria-pressed={showVedurstofanLayer}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        showVedurstofanLayer
          ? 'border-primary/30 bg-primary/5 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/20'
      }`}
    >
      {vedurstofanStationsLoading
        ? <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden />
        : <span className="w-2 h-2 rounded-full bg-current opacity-60" aria-hidden />
      }
      {tf('layerToggleVedurstofan')}
    </button>
  </div>
)}
```

The small dot with `animate-pulse` provides subtle loading feedback without blocking interaction.

### Station preview card placement

After the closing `</div>` of the map container div and before the ferry picker section:

```tsx
{selectedStation && (
  <RouteStationPreviewCard
    station={selectedStation}
    locale={locale}
    onClose={() => setSelectedStation(null)}
  />
)}
```

`locale` should be passed as a new prop to `RouteSelectionStep` since `ForecastRowLine` needs it. Add:

```ts
locale: string
```

to `RouteSelectionStepProps` and pass `locale` from `FerdalagidClient` (already available via `useLocale()`).

### `RouteStationPreviewCard` component

Add as a file-private component at the bottom of `RouteSelectionStep.tsx`:

```tsx
function RouteStationPreviewCard({
  station,
  locale,
  onClose,
}: {
  station: ProviderStationPoint
  locale: string
  onClose: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const rows = selectUpcomingRows(station.forecastRows, 3)
  const distanceKm = (station.distanceM / 1000).toFixed(1)

  // returnTo: current page path so Púlssíðan can send user back
  const returnTo = '/auth-mvp/vedrid'

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{station.stationName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
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

      {/* Forecast rows — reuses existing ForecastRowLine */}
      {rows.length > 0 ? (
        <div className="flex flex-col divide-y divide-border/40">
          {rows.map(row => (
            <ForecastRowLine
              key={row.ftimeIso}
              row={row}
              isUsed={false}
              locale={locale}
              usedMarker=""
              showDate={true}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{tf('stationPreviewNoData')}</p>
      )}

      {/* Veðurpúls — reuses existing VedurstofanPulseInline */}
      <VedurstofanPulseInline stationId={station.stationId} returnTo={returnTo} />
    </div>
  )
}
```

Imports needed at the top of `RouteSelectionStep.tsx`:

```ts
import { ForecastRowLine, selectUpcomingRows } from './VedurstofanForecastRows'
import { VedurstofanPulseInline } from './VedurstofanPulseInline'
import type { ProviderStationPoint } from '@/lib/weather/providerRouteMatching'
```

The "Veðurstofan" badge uses `bg-muted/border-border` (neutral) rather than cyan, consistent with Design.md avoiding new brand colors. The badge is a label, not a status indicator.

## i18n keys

Add under `teskeid.vedrid.ferdalagid` in both `messages/is.json` and `messages/en.json`:

**Icelandic:**
```json
"layerToggleVedurstofan": "Veðurstofan",
"stationDistanceFromRoute": "{km} km frá veginum",
"stationPreviewClose": "Loka forskoðun",
"stationPreviewNoData": "Engin gögn tiltæk"
```

**English:**
```json
"layerToggleVedurstofan": "Veðurstofan",
"stationDistanceFromRoute": "{km} km from road",
"stationPreviewClose": "Close preview",
"stationPreviewNoData": "No data available"
```

## Tests

### New file: `lib/__tests__/weather-provider-stations.test.ts`

Mock pattern follows `weather-travel-api.test.ts`. Use hoisted mocks for:
- `mockGetUser`
- `mockCheckFeatureAccess`
- `mockMatchProviderPoints`
- `mockFetchVedurstofan`

Required tests:

1. Returns 401 when base weather access is blocked (signed-out + Authenticated mode).
2. Returns 403 when `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` and user lacks access.
3. Returns 200 with open access (access required not set), signed-in user, stations matched.
4. Returns 400 when `routePoints` is missing.
5. Returns 400 when `routePoints` is empty array.
6. Returns 400 when `routePoints` exceeds 1000 entries.
7. Returns 400 when a route point has non-finite lat/lon.
8. Returns `{ stations: [], status: 'unavailable' }` when no stations match the route.
9. Returns station list with `stationId`, `stationName`, `lat`, `lon`, `distanceM`, `distanceFromOriginM`, `forecastRows` when stations match.
10. Excludes `unavailable` status stations.
11. Returns `{ stations: [], status: 'unavailable' }` (not 503) when product fetch times out.
12. Does not call `readVedurstofanProductForStations` when no stations matched.
13. `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` absent + `WEATHER_ENABLED=All` + signed-out user: resolves based on public mode (base access depends on `resolveWeatherBaseAccess` behavior with `all` mode).
14. Sorted by `distanceFromOriginM` ascending when multiple stations returned.

## Suggested file changes

New:
- `app/api/teskeid/weather/travel/provider-stations/route.ts`
- `lib/__tests__/weather-provider-stations.test.ts`

Modified:
- `lib/weather/providerRouteMatching.ts` — add `ProviderStationPoint` type export
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — new state + effect + pass props
- `components/weather/RouteSelectionStep.tsx` — new props, toggle, markers, preview
- `messages/is.json`
- `messages/en.json`

Not changing:
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/providerRouteMatching.ts` (logic only)
- `lib/weather/providers/vedurstofanBlend.ts`
- SQL, env, migrations, Vercel

## Commands

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-provider-stations.test.ts
```

If FerdalagidClient / RouteSelectionStep changes affect other tests:
```bash
npm run test:run -- lib/__tests__/weather-travel-api.test.ts
```

Do not start dev server unless Stebbi asks.

## Localhost checks for Stebbi

1. Open `/vedrid` on mobile-width viewport (360 px).
2. Confirm "Veðurstofan" toggle pill appears above the map area — toggled ON by default.
3. Select Reykjavík → Selfoss.
4. Confirm gray station marker circles appear on the map along the route.
5. Click the "Veðurstofan" toggle — markers disappear, preview closes if open.
6. Click again — markers reappear for the current route.
7. Click a station marker — inline preview opens below the map:
   - Station name + "Veðurstofan" badge + "X km frá veginum"
   - 3 upcoming forecast rows in existing `ForecastRowLine` style
   - Veðurpúls section (existing `VedurstofanPulseInline` component)
8. Click X — preview closes.
9. Switch to another route option — confirm preview closes and markers refresh for the new route.
10. Continue to result step — confirm existing Veðurstofan calculation and result cards are unchanged.
11. Test with a very short route that has no nearby stations — confirm no markers, no crash.
12. Test mobile: preview card must not overflow horizontally, touch targets at least 40px.

No SQL, RLS, Vercel env, migration, deployment, secrets, or production data testing in this pass.

## Risks for Claude Code

### locale prop on RouteSelectionStep

Adding `locale` to `RouteSelectionStepProps` is a non-breaking addition (optional with a sensible fallback or required — pick required since FerdalagidClient always has it). Avoid defaulting to a hardcoded locale string.

### VedurstofanPulseInline fetch on mount

`VedurstofanPulseInline` fetches preview messages each time it mounts (on each station click). This is one fetch per station preview. Acceptable — the existing result-step cards do the same. No batch fetch needed.

### returnTo for Púls link

Use `/auth-mvp/vedrid` as `returnTo`. This is the same base path the result step uses. It does not include query params or wizard state, which means post-Púls return lands on the route wizard home — that is correct behavior at route-selection time (user hasn't submitted yet, no state to restore).

### toggleing off clears selected station

When `vedurstofanStations` becomes `undefined` (because `showVedurstofanLayer=false`), the marker effect clears markers and calls `setSelectedStation(null)`. This is handled naturally by the effect dependency on `vedurstofanStations`.

### No loading indicator for Púls inside the preview card

`VedurstofanPulseInline` handles its own loading state internally (via `useChatPreview`). No extra loading indicator needed in `RouteStationPreviewCard`.

## Acceptance criteria

- Route-selection map has a "Veðurstofan" toggle above the map, ON by default.
- Toggling off removes markers and closes preview.
- Changing selected route refreshes markers for that route.
- Station matching uses `matchProviderPointsToRoute` against selected route geometry.
- Station markers are gray circles (no wind classification at this step).
- Preview card uses `ForecastRowLine` and `selectUpcomingRows` — no custom row formatting.
- Preview card includes `VedurstofanPulseInline` with correct `returnTo`.
- Server enforces base weather access (401) and Vedurstofan provider access (403).
- 403 hides the toggle client-side.
- MET/Yr route sampling and final calculation unchanged.
- No SQL/env/deploy/production changes.
- Mobile-first: no horizontal overflow, touch targets ≥ 40 px, no layout shift from loading.
