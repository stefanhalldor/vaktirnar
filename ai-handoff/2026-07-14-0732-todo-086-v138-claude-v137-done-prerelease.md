# TODO 086 v138 - Claude done: v137 corrections implemented, prerelease

Created: 2026-07-14 07:32 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0720-todo-086-v137-codex-v136-revised-plan-review.md`
Builds on: `2026-07-14-0713-todo-086-v136-claude-v135-revised-plan.md`

## Result

Type-check: exit 0
Tests: 31 passed (26 existing + 5 new `worstWindDisplayStatus` tests)

## Changes made

### `lib/weather/windDisplayStatus.ts`

Added `worstWindDisplayStatus(a, b): WindDisplayStatus` — returns the more severe of two
statuses using `WIND_DISPLAY_STATUS_PRIORITY_ORDER` (haettulegt = index 0 = worst).

### `lib/__tests__/weather-vedurstofan-blend.test.ts`

Added `describe('worstWindDisplayStatus')` with 5 focused tests:
- haettulegt beats all
- othaegilegt beats innan-marka
- real status beats no_data
- all no_data stays no_data
- equal inputs return same status

### `lib/weather/providers/vedurstofanBlend.ts`

Removed `augmentedResult: DeterministicResult` from `VedurstofanTravelLayer` type.
Removed unused `DeterministicResult` import.

### `app/api/teskeid/weather/travel/route.ts`

Removed `augmentedPointForecasts` blending block and `augmentedResult` computation entirely.
Removed `blendHoursWithVedurstofan` import (now unused in route handler).
Removed `augmentedResult` from the layer object.

### `lib/__tests__/weather-travel-api.test.ts`

Updated test: renamed to "includes vedurstofanLayer with points when layer is enabled".
Now asserts `augmentedResult` is `undefined` (was `toBeDefined`).

### `components/weather/TravelAuditMap.tsx`

Exported `ProviderMapPoint` type with generic shape:
```ts
export type ProviderMapPoint = {
  provider: 'metno' | 'vedurstofan' | 'vegagerdin'
  lat: number; lon: number
  id: string; label: string
  status: WindDisplayStatus
  windMs: number | null
  forecastTimeIso: string | null  // provider-independent name; ftimeIso mapped at boundary
  etaIso: string | null
}
```

Renamed `vedurstofanStationPoints` prop → `providerOverlayPoints?: ProviderMapPoint[]`.

Replaced purple hard-coded markers with status-colored markers using `WIND_STATUS_MARKER_COLOR[pt.status]`:
- ✓ label for `innan-marka`
- ! label for `haettulegt` / `nalgast-haettumork`
- no label for middle statuses (color alone carries meaning)
- marker title: `{label} · {windMs} m/s · spá kl. {forecastTimeIso}`

Updated: `hasAnyPoints` guard, bounds extension, early-return check.

### `components/weather/DepartureHeatmap.tsx`

Added `slotStatusOverrides?: WindDisplayStatus[]` prop.

Replaced `getWindStatus(c)` with `getSlotStatus(c, idx)` — single resolver that:
- returns `slotStatusOverrides[idx]` when provided and in range,
- falls back to `classifyCandidateWindDisplayStatus(c, thresholds)` otherwise.

All status paths now go through `getSlotStatus`:
- statusCounts loop (now uses index)
- filteredWithIdx reduce
- toggleStatus deselection check
- slot dot rendering
- `SlotDetail` receives `statusOverride` prop

`SlotDetail` updated with `statusOverride?: WindDisplayStatus` parameter — uses override if
provided, else MET/Yr classification.

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**New types** (module-level, before component):
- `WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'`
- `VedurstofanAssessment` — full ETA-aware assessment per station
- `computeVedurstofanAssessments(depIso, arrIso, points, thresholds)` — pure function,
  uses `ftimeIso` for row time comparison, returns `VedurstofanAssessment[]`

**Imports**: added `worstWindDisplayStatus`, `ProviderMapPoint`

**New computed values** (in place of old provider block):

```ts
selectedWeatherProviders: Record<WeatherProviderKey, boolean>
  = { metno: showMetno, vedurstofan: showVedurstofan, vegagerdin: false }
activeProviderKeys = ...filter(k => selectedWeatherProviders[k])
hasNoActiveProvider, isMetnoOnly, isVedurstofanOnly
```

```ts
referenceDepartureIso  // neutral: selected slot ?? candidates[0] ?? leavingAt (not best-window)
referenceArrivalIso
```

```ts
vedurstofanAssessments: VedurstofanAssessment[]   // all stations for reference departure
worstVedurstofanData: VedurstofanAssessment | null  // station with highest windMs
vedurstofanSlotStatuses: WindDisplayStatus[] | null  // per slot, for scrubber
providerOverlayPoints: ProviderMapPoint[]            // for TravelAuditMap
vedurstofanOnlyDisplayStatus: WindDisplayStatus | null  // not WeatherStatus
```

**Combined card changes**:

- `derivedStatus` now maps `vedurstofanOnlyDisplayStatus` → `WeatherStatus` for style,
  is `null` when `hasNoActiveProvider`
- No-provider message shown inside card (after toggles): "Veldu að minnsta kosti eina
  gagnaveitu til að sýna veðurmat." -- toggles stay visible above it
- Coverage text hidden when `isVedurstofanOnly`
- Scrubber: always shown when `!hasNoActiveProvider && outboundDisplayCandidates.length > 1`,
  passes `slotStatusOverrides={vedurstofanSlotStatuses}` in Veðurstofan-only mode,
  hides best-window when `isVedurstofanOnly`
- Journey grid gated on `!hasNoActiveProvider && (isVedurstofanOnly ? referenceDepartureIso : activeOutboundCandidate)`
- Departure row: shows `referenceDepartureIso` + `vedurstofanReferenceTime` copy when
  `isVedurstofanOnly`; best-window copy hidden when `isVedurstofanOnly`
- "Á leiðinni" Veðurstofan branch: now uses `worstVedurstofanData` with `ftimeIso`,
  `etaIso`, `status` — shows `{stationName} · vindur {windMs} m/s · spá kl. {ftimeLabel}`
  and `vedurstofanForecastFrom` key
- `activeOutboundCandidate` guard added before MET/Yr dp block
- Áfangastaður: changed `.` access to `?.` and `!.` to satisfy TS when `isVedurstofanOnly`

**TravelAuditMap call**: `vedurstofanStationPoints` → `providerOverlayPoints`,
map guard checks `providerOverlayPoints.length > 0` not `activeVedurstofanStationPoints`.

### `messages/is.json` + `messages/en.json`

Added:
- `chooseWeatherProvider` — shown in no-provider state
- `vedurstofanReferenceTime` — shown instead of MET/Yr best-departure text

## What was NOT changed

- `blendHoursWithVedurstofan` function itself (kept, still exported, tested in blend test)
- Vegagerðin UI (disabled placeholder stays as-is; provider model is ready for it)
- SQL, Supabase, cron, Vercel, migrations, feature access
- No commit, no push

## Open items (not in scope for this prerelease)

- Combined-provider candidate model (both providers as co-equal assessment baseline)
- Vegagerðin data layer (waiting for data)
- Veðurstofan station click/selection on map (currently no click handler on overlay markers)

## Localhost checks for Stebbi

Preconditions: Stebbi runs localhost. `elta-vedrid` access on.
`VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`. `WEATHER_ELTA_VEDRID_FLAG=true`.
Veðurstofan product table warmed. No migrations, Supabase, cron, push, commit.

1. `met.no` only (Veðurstofan off):
   - Existing MET/Yr scrubber, map, worst point unchanged.

2. `Veðurstofan` only:
   - Map: only Veðurstofan station markers, status-colored (not all purple).
     - Green circle with ✓ for `innan-marka`
     - Orange/red circle with ! for `haettulegt`/`nalgast-haettumork`
     - Amber for middle statuses
     - Gray for `no_data`
   - Marker title: `{stationName} · {windMs} m/s · spá kl. HH:MM`
   - Scrubber: Veðurstofan-derived slot colors, not MET/Yr.
   - Worst point: stationName · vindur XX m/s · Spá frá kl. HH:MM
   - Departure: shows reference time with "Miðað við brottfarartíma" sub-label
   - No `Yr`, `Hrá met.no gögn`, `Punktur X/72`, MET/Yr best-window copy.

3. Both providers:
   - MET/Yr assessment baseline.
   - Veðurstofan markers overlay with status colors.
   - Scrubber uses MET/Yr classification (no override).

4. No providers:
   - "Veldu að minnsta kosti eina gagnaveitu..." shown inside card.
   - Provider toggles remain visible and tappable above the message.
   - No MET/Yr assessment remains.

5. Toggle stress:
   - No stale markers (map remounts via key).
   - No stale scrubber status from off provider.

6. Mobile 360/390/460 px:
   - Scrubber, station rows, provider toggles wrap cleanly, no overflow.
