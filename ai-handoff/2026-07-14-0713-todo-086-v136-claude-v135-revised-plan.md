# TODO 086 v136 - Claude revised plan: v135 corrections + Veðurstofan scrubber

Created: 2026-07-14 07:13 Atlantic/Reykjavik
Agent: Claude Code
Builds on:
- `2026-07-14-0704-todo-086-v135-codex-v134-plan-review.md`
- `2026-07-14-0700-todo-086-v134-claude-v133-plan.md`
Stebbi addition: Ég vil hafa scrubberinn inni með Veðurstofugögnum (scrubber must include Veðurstofan data, not hidden)

## v135 corrections applied

All three High findings from Codex v135 are incorporated below. v134 pseudo-code is not
used literally. v136 is the implementation target.

---

## Confirmed from code inspection

Before writing the plan I inspected:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:641-683`
- `components/weather/TravelAuditMap.tsx` imports
- `lib/weather/providers/vedurstofan.server.ts`, `vedurstofanBlend.ts`

### Field names (v135 HIGH fix)

Veðurstofan forecast rows use `ftimeIso` (NOT `forecastTimeIso`):
```ts
// lib/weather/providers/vedurstofanBlend.ts:5
ftimeIso: string
```

Station-level analysis time is `atimeIso` (already used in provenance display: `vpt.atimeIso`).

All plan pseudo-code below uses `ftimeIso` and `atimeIso` — never `forecastTimeIso` for
Veðurstofan rows.

### Status type (v135 HIGH fix)

`classifyPointWindDisplayStatus()` and `WIND_STATUS_MARKER_COLOR` are already imported in
`TravelAuditMap.tsx`. Both are from `lib/weather/windDisplayStatus.ts`.

Do NOT use `WeatherStatus` string values (`rautt`, `gult`, `graent`) for Veðurstofan status.
Use `WindDisplayStatus` from `classifyPointWindDisplayStatus(windMs, hasData, thresholds)`.

The current `vedurstofanOnlyStatus` in `FerdalagidClient.tsx:679-683` uses `WeatherStatus`
literals. This must also be fixed.

### Provider architecture (v135 HIGH fix)

Introduce `WeatherProviderKey` and `ProviderMapPoint` so the map prop is not
Veðurstofan-specific and Vegagerðin can be added later without another one-off prop.

### Neutral departure reference (v135 MEDIUM fix)

`activeOutboundCandidate` comes from `result.travelPlan.outbound.leavingAt` in the
no-selection case, which is an MET/Yr-derived candidate (best window or fixed slot).

For Veðurstofan-only ETA computation, use a provider-neutral departure:
```ts
const referenceDepartureIso =
  (selectedHeatmapIdx !== null ? outboundDisplayCandidates[selectedHeatmapIdx]?.departureIso : null)
  ?? outboundDisplayCandidates[0]?.departureIso
  ?? result?.travelPlan?.outbound.leavingAt?.departureIso

const referenceDurationMs =
  (selectedHeatmapIdx !== null ? outboundDisplayCandidates[selectedHeatmapIdx] : null)?.arrivalIso
    ? new Date(outboundDisplayCandidates[selectedHeatmapIdx!].arrivalIso!).getTime()
      - new Date(outboundDisplayCandidates[selectedHeatmapIdx!].departureIso).getTime()
    : result?.travelPlan?.outbound.leavingAt
      ? new Date(result.travelPlan.outbound.leavingAt.arrivalIso!).getTime()
        - new Date(result.travelPlan.outbound.leavingAt.departureIso).getTime()
      : null
```

Route geometry (duration, routeFraction) is provider-neutral and comes from Google Maps.
Only the departure timestamp itself must not be MET/Yr-selected best-window when
`isVedurstofanOnly`.

In practice: when `isVedurstofanOnly` and no heatmap slot is selected, use candidates[0]
(the user's requested departure time), not `leavingAt` (MET/Yr best slot).

---

## Implementation plan

### Step 1 — Provider types (new local types, not a separate file)

In `FerdalagidClient.tsx` before the component, add:

```ts
type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

type ProviderMapPoint = {
  provider: WeatherProviderKey
  lat: number
  lon: number
  id: string          // stationId for Veðurstofan, pointId for MET/Yr
  label: string       // stationName for Veðurstofan
  status: WindDisplayStatus
  windMs: number | null
  ftimeIso: string | null   // forecast row time (ftimeIso for Veðurstofan)
  etaIso: string | null
}
```

`ProviderMapPoint` is the single shape TravelAuditMap will receive for non-MET/Yr overlays.
The existing `weatherPoints` prop (MET/Yr route points) stays as-is.

### Step 2 — Provider mode booleans

In computed-values block (after `effectiveThresholds`):

```ts
const activeProviderCount = Number(showMetno) + Number(showVedurstofan)
const isMetnoOnly = showMetno && !showVedurstofan
const isVedurstofanOnly = !showMetno && showVedurstofan
const hasNoActiveProvider = activeProviderCount === 0
```

### Step 3 — referenceDepartureIso (provider-neutral)

```ts
const referenceDepartureIso: string | null =
  (selectedHeatmapIdx !== null
    ? outboundDisplayCandidates[selectedHeatmapIdx]?.departureIso
    : null)
  ?? outboundDisplayCandidates[0]?.departureIso
  ?? result?.travelPlan?.outbound.leavingAt?.departureIso
  ?? null

const referenceArrivalIso: string | null =
  (selectedHeatmapIdx !== null
    ? outboundDisplayCandidates[selectedHeatmapIdx]?.arrivalIso ?? null
    : null)
  ?? outboundDisplayCandidates[0]?.arrivalIso
  ?? result?.travelPlan?.outbound.leavingAt?.arrivalIso
  ?? null
```

### Step 4 — Veðurstofan assessment helper

Extract a small helper (inline function or useMemo) that takes a departure/arrival pair and
returns ETA-aware assessment for all Veðurstofan stations:

```ts
function computeVedurstofanAssessments(
  depIso: string,
  arrIso: string,
  points: VedurstofanTravelLayer['points'],
  thresholds: ResolvedThresholds,
): Array<{
  station: VedurstofanTravelLayer['points'][number]
  row: VedurstofanTravelLayer['points'][number]['forecastRows'][number] | null
  windMs: number | null
  etaIso: string | null
  ftimeIso: string | null    // from row.ftimeIso
  status: WindDisplayStatus
}> {
  const depMs = new Date(depIso).getTime()
  const durMs = new Date(arrIso).getTime() - depMs
  return points
    .filter(p => p.lat !== null && p.lon !== null)
    .map(p => {
      let row: typeof p.forecastRows[0] | null = null
      let windMs: number | null = null
      let etaIso: string | null = null
      if (p.routeFraction !== null && durMs > 0) {
        const etaMs = depMs + p.routeFraction * durMs
        etaIso = new Date(etaMs).toISOString()
        row = p.forecastRows.reduce<typeof p.forecastRows[0] | null>((b, r) => {
          if (!b) return r
          return Math.abs(new Date(r.ftimeIso).getTime() - etaMs)
            < Math.abs(new Date(b.ftimeIso).getTime() - etaMs) ? r : b
        }, null)
        windMs = row?.windSpeedMs ?? null
      } else {
        // No route projection — use max row as fallback
        const maxRow = p.forecastRows.reduce<typeof p.forecastRows[0] | null>((b, r) => {
          if (!b) return r
          return (r.windSpeedMs ?? 0) > (b.windSpeedMs ?? 0) ? r : b
        }, null)
        row = maxRow
        windMs = maxRow?.windSpeedMs ?? null
      }
      const status = classifyPointWindDisplayStatus(windMs ?? undefined, windMs !== null, thresholds)
      return { station: p, row, windMs, etaIso, ftimeIso: row?.ftimeIso ?? null, status }
    })
}
```

### Step 5 — worstVedurstofanData (expanded type)

Replace the current `worstVedurstofanData` IIFE with a call to the helper:

```ts
const vedurstofanAssessments =
  (showVedurstofan && vedurstofanLayer && referenceDepartureIso && referenceArrivalIso)
    ? computeVedurstofanAssessments(
        referenceDepartureIso, referenceArrivalIso,
        vedurstofanLayer.points, effectiveThresholds,
      )
    : []

const worstVedurstofanData = vedurstofanAssessments.reduce<typeof vedurstofanAssessments[0] | null>(
  (b, a) => (!b || (a.windMs ?? 0) > (b.windMs ?? 0)) ? a : b,
  null,
)
```

Remove `worstVedurstofanStation`, `worstVedurstofanMaxWind`, and `vedurstofanOnlyStatus` computed
from `WeatherStatus` literals. Replace with:

```ts
const worstVedurstofanStatus: WindDisplayStatus | null = worstVedurstofanData?.status ?? null
```

(Use `WindDisplayStatus`, not `WeatherStatus`.)

### Step 6 — Veðurstofan scrubber slot statuses

Stebbi explicitly wants Veðurstofan data in the scrubber.

For each slot in `outboundDisplayCandidates`, compute the worst Veðurstofan station status
at that slot's departure time:

```ts
const vedurstofanSlotStatuses: WindDisplayStatus[] | null =
  (isVedurstofanOnly && showVedurstofan && vedurstofanLayer && outboundDisplayCandidates.length > 0)
    ? outboundDisplayCandidates.map(slot => {
        if (!slot.arrivalIso) return 'no_data' as WindDisplayStatus
        const assessments = computeVedurstofanAssessments(
          slot.departureIso, slot.arrivalIso,
          vedurstofanLayer!.points, effectiveThresholds,
        )
        return assessments.reduce<WindDisplayStatus>((worst, a) => {
          const aIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(a.status)
          const wIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(worst)
          return aIdx < wIdx ? a.status : worst
        }, 'no_data')
      })
    : null
```

Pass `vedurstofanSlotStatuses` to `DepartureHeatmap` as a new optional prop
`slotStatusOverrides?: WindDisplayStatus[]`.

`DepartureHeatmap` uses `slotStatusOverrides[i]` instead of `classifyCandidateWindDisplayStatus(candidates[i])` when the override array is provided. The rest of the heatmap logic (selection, filter chips, colors) stays the same.

### Step 7 — ProviderMapPoint for TravelAuditMap

Build `providerOverlayPoints` from Veðurstofan assessments:

```ts
const providerOverlayPoints: ProviderMapPoint[] = vedurstofanAssessments.map(a => ({
  provider: 'vedurstofan',
  lat: a.station.lat!,
  lon: a.station.lon!,
  id: a.station.stationId,
  label: a.station.stationName,
  status: a.status,
  windMs: a.windMs,
  ftimeIso: a.ftimeIso,
  etaIso: a.etaIso,
}))
```

Replace `vedurstofanStationPoints` prop on `TravelAuditMap` with `providerOverlayPoints`.

### Step 8 — TravelAuditMap: status-colored provider markers

In `TravelAuditMap.tsx`:

1. Rename prop `vedurstofanStationPoints` → `providerOverlayPoints?: ProviderMapPoint[]`.
   Import or inline `ProviderMapPoint` type (or accept a locally-defined equivalent).

2. In the marker creation effect, for each `providerOverlayPoints` item:

```ts
const markerColor = WIND_STATUS_MARKER_COLOR[pt.status]
const meta = WIND_STATUS_META[pt.status]  // already imported as WIND_STATUS_META

new google.maps.Marker({
  position: { lat: pt.lat, lng: pt.lon },
  map,
  title: [
    pt.label,
    pt.windMs !== null ? `${pt.windMs} m/s` : null,
    pt.ftimeIso ? `spá kl. ${formatKlTime(pt.ftimeIso)}` : null,
  ].filter(Boolean).join(' · '),
  icon: {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: markerColor,
    fillOpacity: 0.9,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  },
  label: {
    text: meta.icon,
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 'bold',
  },
})
```

`WIND_STATUS_MARKER_COLOR` and `classifyPointWindDisplayStatus` are already imported.
`WIND_STATUS_META` is already imported as `WIND_STATUS_META` in TravelAuditMap.

3. The `meta.icon` values in `WIND_STATUS_META` should provide the right symbol per status.
   If `icon` is emoji-heavy, use a shorter label like `✓` / `!` / `!!` / `?` directly.
   Check `WIND_STATUS_UI_META` for the actual `icon` field values before choosing.

### Step 9 — No-provider state

When `hasNoActiveProvider`, render a short message instead of the result card:

```tsx
{hasNoActiveProvider ? (
  <p className="text-sm text-muted-foreground text-center py-4">
    {tf('chooseWeatherProvider')}
  </p>
) : (
  // ... existing result card
)}
```

Add to `messages/is.json`:
```json
"chooseWeatherProvider": "Veldu að minnsta kosti eina gagnaveitu til að sýna veðurmat."
```

Add to `messages/en.json`:
```json
"chooseWeatherProvider": "Select at least one data source to show the weather assessment."
```

### Step 10 — Veðurstofan-only summary cleanup

When `isVedurstofanOnly`:

1. Hide MET/Yr best-window text:
   ```tsx
   {!isVedurstofanOnly && result.travelPlan?.outbound.windowMode && result.travelPlan.outbound.bestWindow && (
     ...
   )}
   ```

2. Departure label: show `referenceDepartureIso` directly with a neutral prefix:
   ```tsx
   {isVedurstofanOnly
     ? <span>{tf('vedurstofanReferenceTime')}: {formatCompactDateTime(referenceDepartureIso, locale)}</span>
     : <span>{formatCompactDateTime(activeOutboundCandidate.departureIso, locale)}</span>
   }
   ```

   Add to messages:
   - IS: `"vedurstofanReferenceTime": "Miðað við brottfarartíma"`
   - EN: `"vedurstofanReferenceTime": "Based on departure time"`

3. Worst-point display: show decisive row time and ETA:
   ```
   {worstVedurstofanData?.station.stationName} · vindur {worstVedurstofanData?.windMs} m/s
   Spá kl. {formatKlTime(worstVedurstofanData?.ftimeIso)}
   Áætlað við stöð kl. {formatKlTime(worstVedurstofanData?.etaIso)}
   ```

### Step 11 — augmentedResult quarantine

In `app/api/teskeid/weather/travel/route.ts`, add a clear comment above `augmentedResult`:

```ts
// INTERNAL SHADOW COMPARISON ONLY — do not use for user-facing assessment.
// This is a max-blended MET/Yr + Veðurstofan result kept for debugging.
// Remove before full provider release or when provider model is stable.
```

If the route handler response object includes `augmentedResult` as a client payload key,
remove it from the response (keep the internal variable if needed for logging, but strip it
from the JSON response body).

---

## Files to change

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` (Steps 1-6, 9-10)
- `components/weather/TravelAuditMap.tsx` (Step 7-8)
- `components/weather/DepartureHeatmap.tsx` (Step 6 — new `slotStatusOverrides` prop)
- `app/api/teskeid/weather/travel/route.ts` (Step 11)
- `messages/is.json` (Steps 9, 10)
- `messages/en.json` (Steps 9, 10)

---

## Tests to run

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
npm run type-check
```

---

## Localhost checks for Stebbi

Preconditions: Stebbi runs localhost. `elta-vedrid` access on. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
`WEATHER_ELTA_VEDRID_FLAG=true`. Veðurstofan product table warmed.
No migrations, Supabase, cron, deploy, push or commit unless Stebbi approves separately.

1. `met.no` only:
   - Existing MET/Yr scrubber, map, worst point unchanged.

2. `Veðurstofan` only:
   - Map shows only Veðurstofan station markers with severity colors (not all purple).
   - Scrubber shows Veðurstofan-derived slot status for each departure hour.
   - Worst point = Veðurstofan station with `stationName · XX m/s · spá kl. HH:MM`.
   - Estimated ETA at station is shown.
   - No `Yr`, `Hrá met.no gögn`, `Punktur X/Y`, MET/Yr best-window copy.
   - Departure label says "Miðað við brottfarartíma", not MET/Yr optimization text.

3. Both providers:
   - MET/Yr assessment is baseline.
   - Veðurstofan markers appear with severity colors.
   - Both layer types are visually distinguishable.

4. No providers:
   - "Veldu að minnsta kosti eina gagnaveitu" is shown.
   - No MET/Yr assessment remains visible.

5. Toggle providers repeatedly:
   - No stale markers.
   - No duplicate map layers.
   - Bounds stay sane.

6. Mobile 360/390/460 px:
   - Scrubber and station rows wrap cleanly.
   - No horizontal overflow.
   - Provider toggles remain tappable.

---

## Notes

- `computeVedurstofanAssessments` can be a module-level pure function or an inline helper.
  Do not put it in a useEffect or useCallback — it is a pure computation on stable data.
- `WIND_DISPLAY_STATUS_PRIORITY_ORDER` is needed for worst-status comparison in Step 6.
  It is exported from `lib/weather/windDisplayStatus.ts`.
- Keep the map remount key from v130: `key={${result.id}-${showMetno?'m':''}-${showVedurstofan?'v':''}}`.
- Vegagerðin can be added later by extending `providerOverlayPoints` without touching
  TravelAuditMap prop signature again.
- `DepartureHeatmap.slotStatusOverrides`: when `isVedurstofanOnly` and array provided,
  use override status for color/filter pill. When not provided (MET/Yr mode), use existing logic.
  This keeps heatmap generic.
