# TODO 086 v375 - Claude handoff: v374 Phase B done, prerelease

Created: 2026-07-16 23:52
Timezone: Atlantic/Reykjavik
Author: Claude

Related handoffs:
- `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md` (Phase B spec)
- `2026-07-16-2317-todo-086-v374-codex-v373-phase-b-revised-review.md` (Codex review)

## Status

Phase B implemented. All 4 Codex v374 findings addressed. File changes only — not committed or pushed per workflow.

49/49 tests pass. Type-check clean.

---

## Changes in this pass

### `lib/weather/providerRouteMatching.ts`

Added `ProviderStationPoint` export type after `ProviderRouteMatch`. Holds the station fields returned by the new endpoint and consumed by `RouteStationPreviewCard`:
- `stationId`, `stationName`, `lat`, `lon`
- `distanceM`, `distanceFromOriginM`, `routeFraction`
- `atimeIso`, `sourceUrl`
- `forecastRows` (same shape as `ForecastRowData` — structurally compatible, no cross-layer import needed)

### `app/api/teskeid/weather/travel/provider-stations/route.ts` (NEW)

POST endpoint. Access model matches final route handler:
- Gate 1: `resolveWeatherBaseAccess` — 401 if blocked
- Gate 2: `checkFeatureAccess('weather-provider-vedurstofan')` when `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` — 403 if denied
- Validates `routePoints`: non-empty, max 1000 entries, all finite lat/lon
- Matches stations via `matchProviderPointsToRoute` against route geometry
- Fetches Veðurstofan forecasts via `readVedurstofanProductForStations` with 1500ms budget
- Returns `{ stations: ProviderStationPoint[], status: 'available' | 'unavailable' }`

### `lib/__tests__/weather-provider-stations.test.ts` (NEW)

16 tests covering:
- 401 when base access blocked (signed-out in Authenticated mode)
- 403 when provider access required and user lacks it
- 200 for open access (requirement not set)
- 200 for signed-out user in `WEATHER_ENABLED=All` mode
- 400 for missing/empty/oversized routePoints and invalid coordinates
- Empty result when no stations match
- Does not call product table when no stations matched
- Station fields present in response (stationId, stationName, lat, lon, distanceM, distanceFromOriginM, sourceUrl, forecastRows)
- Excludes `unavailable` status stations
- Returns unavailable (not 503) when product fetch fails/rejects
- Sorts by distanceFromOriginM ascending

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Import:** `ProviderStationPoint` from `@/lib/weather/providerRouteMatching`

**Module-level helper:** `downsampleRoutePoints(points, maxPoints)` — stride-samples route geometry so the endpoint never receives more than 500 points regardless of route length. Preserves first and last points.

**New state:**
```ts
const [routeStationLayerAllowed, setRouteStationLayerAllowed] = useState(true)
const [showRouteStationLayer, setShowRouteStationLayer] = useState(true)
const [routeSelectionStations, setRouteSelectionStations] = useState<ProviderStationPoint[] | null>(null)
const [routeSelectionStationsLoading, setRouteSelectionStationsLoading] = useState(false)
```

**New effect — fetch on selected route change:**
- Runs only when `step === 'route'`
- Downsamples to 500 points before POSTing
- On 403: sets `routeStationLayerAllowed(false)` — prevents 403-loop from user toggling
- On success: sets `routeSelectionStations`
- On error: silently clears stations (fail-open)

**New effect — clear on step change:**
- Clears `routeSelectionStations` and `routeSelectionStationsLoading` when leaving the route step

**RouteSelectionStep props added:**
```tsx
locale={locale}
showVedurstofanLayer={routeStationLayerAllowed ? showRouteStationLayer : undefined}
onToggleVedurstofanLayer={routeStationLayerAllowed ? () => setShowRouteStationLayer(v => !v) : undefined}
vedurstofanStations={routeStationLayerAllowed && showRouteStationLayer ? (routeSelectionStations ?? undefined) : undefined}
vedurstofanStationsLoading={routeStationLayerAllowed ? routeSelectionStationsLoading : undefined}
```

When `routeStationLayerAllowed=false`, all four props are `undefined` — toggle is not rendered and markers are not drawn. Addresses v374 finding 1.

### `components/weather/RouteSelectionStep.tsx`

**New imports:**
```ts
import { ForecastRowLine, selectUpcomingRows } from './VedurstofanForecastRows'
import { VedurstofanPulseInline } from './VedurstofanPulseInline'
import type { ProviderStationPoint } from '@/lib/weather/providerRouteMatching'
```

**New props on `RouteSelectionStepProps`:**
```ts
locale: string
showVedurstofanLayer?: boolean
onToggleVedurstofanLayer?: () => void
vedurstofanStations?: ProviderStationPoint[]
vedurstofanStationsLoading?: boolean
```

All provider props optional — component usable without layer.

**New state and ref:**
```ts
const stationMarkersRef = useRef<google.maps.Marker[]>([])
const [selectedStation, setSelectedStation] = useState<ProviderStationPoint | null>(null)
```

**Effect 5 — station markers:**
- Clears all markers and `selectedStation` whenever `vedurstofanStations` changes (including `undefined` = layer off)
- Draws gray circle markers for each station via `loadMarkerLibrary()`
- `zIndex: 3` above route polylines
- Click → `setSelectedStation(station)`

**Toggle pill** (above map, before ferry picker section):
- Condition: `(showVedurstofanLayer !== undefined || onToggleVedurstofanLayer)` — hidden when 403
- Animated pulse dot while `vedurstofanStationsLoading=true`
- `aria-pressed` for accessibility

**Preview card** (below map, before ferry picker):
- Renders `RouteStationPreviewCard` when `selectedStation` is set

**`makeStationMarkerIcon()`** — gray circle `#9ca3af` (same as `WIND_STATUS_MARKER_COLOR['no_data']`), scale 7, opacity 0.85. No wind classification at route-selection step.

**`RouteStationPreviewCard`** (file-private, at bottom of file):
- Station name + "Veðurstofan" badge + distance
- `selectUpcomingRows(station.forecastRows, 3)` → `ForecastRowLine` × up to 3 (shared formatting, no drift)
- `VedurstofanPulseInline` with `returnTo='/auth-mvp/vedrid'` (Phase B limitation noted in comment)
- Close button: `h-10 w-10 flex items-center justify-center` — meets 40px touch target (v374 finding 4)

### `messages/is.json` + `messages/en.json`

Under `teskeid.vedrid.ferdalagid`:

| Key | Icelandic | English |
|---|---|---|
| `stationDistanceFromRoute` | `{km} km frá veginum` | `{km} km from road` |
| `layerToggleVedurstofan` | `Veðurstofan` | `Veðurstofan` |
| `stationPreviewClose` | `Loka forskoðun` | `Close preview` |
| `stationPreviewNoData` | `Engin gögn tiltæk` | `No data available` |

`stationDistanceFromRoute` previously existed as `"frá leið"` / `"from route"` (unused in code) — updated to parameterized form.

---

## v374 findings addressed

1. **403 felur toggle** — `routeStationLayerAllowed` state, default `true`. On 403 → `false`. Provider props only passed to `RouteSelectionStep` when `routeStationLayerAllowed=true`. Toggle render condition naturally hides when all props are `undefined`.

2. **routePoints cap** — `downsampleRoutePoints(points, 500)` in FerdalagidClient before POST. Server cap remains 1000 but client never sends more than ~501 points. Long routes (Reykjavík → Egilsstaðir) are handled safely.

3. **returnTo** — `/auth-mvp/vedrid` (wizard home). Comment in code explains Phase B limitation: route-selection state not serializable to URL yet. Post-Púls return lands on wizard home, not exact selection state. Acknowledged known gap.

4. **40px close button** — `h-10 w-10 flex items-center justify-center` on close button in `RouteStationPreviewCard`.

---

## Test results

```
npm run type-check → passed

npm run test:run -- lib/__tests__/weather-provider-stations.test.ts
→ 1 file, 16/16 passed

npm run test:run -- lib/__tests__/weather-travel-api.test.ts lib/__tests__/providerRouteMatching.test.ts
→ 2 files, 33/33 passed
```

Total: 49/49 tests pass.

---

## Pending localhost verification (Stebbi)

1. Opna `/vedrid` á mobile-breidd (360 px).
2. Staðfesta að "Veðurstofan" toggle pill birtist yfir kortið — ON by default.
3. Velja Reykjavík → Selfoss. Gráar hringmerkjur eiga að birtast á kortinu.
4. Kveikja/slökkva á toggle — merkjur hverfa/birtast, preview lokar ef opinn.
5. Smella á stöðvarmerkju — preview opnast undir kortinu:
   - Stöðvaheiti + "Veðurstofan" badge + "X km frá veginum"
   - Allt að 3 upcoming forecast raðir í `ForecastRowLine` stíl
   - `VedurstofanPulseInline` section (Púls preview/compose/login CTA)
6. Smella X — preview lokar. Touch target ≥ 40px.
7. Skipta um leiðarvalkost — preview lokar og merkjur uppfærast.
8. Fara á result step — staðfesta að Veðurstofan útreikninar og result-spjöld eru óbreytt.
9. Velja langa leið (t.d. Reykjavík → Egilsstaðir) — staðfesta að stöðvar birtist (downsampling virkar).
10. Prófa notanda með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` án aðgangs — toggle á ekki að birtast.

Engin SQL, RLS, Vercel env, migration, deployment, secrets eða production-data prófun í þessum pasa.

---

## Not changed

- `app/api/teskeid/weather/travel/route.ts` — óbreytt
- `lib/weather/providerRouteMatching.ts` (matching logic) — óbreytt
- SQL, env, migrations, Vercel
