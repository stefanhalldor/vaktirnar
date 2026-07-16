# TODO 086 v130 - Claude v129 done, prerelease

Created: 2026-07-14 07:50 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0636-todo-086-v129-codex-v128-prerelease-review.md` findings

## Fixes from v129 review

### 1. HIGH — Map markers now update reliably on provider toggle

**Root cause (v129)**: `TravelAuditMap` used `key={result.id}` only. Toggling `showMetno`/`showVedurstofan` changed props but not the key, so the init effect (empty dep array) never re-ran. Old MET/Yr markers stayed on the map.

**Fix**: Changed key to include provider selection:
```tsx
key={`${result.id}-${showMetno ? 'm' : ''}-${showVedurstofan ? 'v' : ''}`}
```

Each provider toggle now forces a full remount of `TravelAuditMap`, so the init effect runs with the correct `weatherPoints` and `vedurstofanStationPoints`. Old markers from the previous provider selection cannot survive.

### 2. HIGH — Worst Veðurstofan station is now ETA-aware

**Root cause (v129)**: `worstVedurstofanStation` was computed by `max(forecastRows[*].windSpeedMs)` — a static worst across all forecast times, which could pick a 3am forecast row during a midday journey.

**Fix**: Replaced with ETA-aware computation. For each station:
- `etaMs = departure + routeFraction * duration` (using `activeOutboundCandidate` departure/arrival as reference timing)
- Find the forecast row nearest to `etaMs`
- Use that row's wind for ranking

If `routeFraction` is null (station has no route projection) or `activeOutboundCandidate` is undefined, falls back to static max wind for that station.

The departure reference time is from `activeOutboundCandidate.departureIso` — this represents user intent (when they plan to leave) and is provider-independent. `routeFraction` is now computed server-side for each Veðurstofan station, so the ETA estimate is meaningful.

### 3. MEDIUM — Provenance timestamps on station cards

**Root cause (v129)**: `atimeIso` was in the type but not displayed. `fetchedAtIso` and `expiresAtIso` were not in the layer type at all and were dropped server-side.

**Fixes**:

`lib/weather/providers/vedurstofanBlend.ts` — added to point type:
```ts
fetchedAtIso: string   // when our warmer fetched the data
expiresAtIso: string   // when it transitions to stale
```

`app/api/teskeid/weather/travel/route.ts` — now passes:
```ts
fetchedAtIso: payload.fetchedAtIso,
expiresAtIso: payload.expiresAtIso,
```

`app/auth-mvp/vedrid/FerdalagidClient.tsx` — `VedurstofanPointRow` now shows:
```
Spá frá kl. HH:MM   (from atimeIso, when Veðurstofan generated the forecast)
Sótt kl. HH:MM       (from fetchedAtIso, when our warmer pulled it)
```

New message keys added to `messages/is.json` and `messages/en.json`:
- `vedurstofanForecastFrom` — `"Spá frá kl. {time}"` / `"Forecast from {time}"`
- `vedurstofanFetchedAt` — `"Sótt kl. {time}"` / `"Fetched {time}"`

### 4. MEDIUM — Map filter chips hidden in Veðurstofan-only mode

**Root cause (v129)**: `mapStatusCounts` is derived from `weatherPoints`. When `weatherPoints=[]`, all counts are 0, but the chip container still rendered (empty space).

**Fix**: Added `weatherPoints.length > 0` guard:
```tsx
{onVisibleStatusesChange && mapLoaded && weatherPoints.length > 0 && (
  <div className="flex flex-wrap gap-1.5"> ...
```

Filter chips do not appear when only Veðurstofan station markers are shown on the map.

## Files changed

- `lib/weather/providers/vedurstofanBlend.ts` — `fetchedAtIso` and `expiresAtIso` in point type
- `app/api/teskeid/weather/travel/route.ts` — pass `fetchedAtIso`/`expiresAtIso` to layer point
- `messages/is.json` — `vedurstofanForecastFrom`, `vedurstofanFetchedAt`
- `messages/en.json` — same
- `components/weather/TravelAuditMap.tsx` — hide filter chips when `weatherPoints.length === 0`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — map key includes provider state, ETA-aware worst station, provenance display

## Tests

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
# 2 files passed, 26 tests passed

npm run type-check
# exit 0
```

## Open gaps (still pending)

- **Departure slot coloring for Veðurstofan**: The departure heatmap (per-slot green/yellow/red) remains MET/Yr-only. A server-side Veðurstofan assessment run producing departure candidates is needed. Deferred.
- **`metnoBlendedLabel`**: Unused message key. Low priority.
- **`augmentedResult`**: Still computed server-side but unused in UI (see v129 Low finding). Left for now.
- **`distanceToPolylineM`**: Now redundant since `projectToPolyline` subsumes it. Can be cleaned up later.

## Localhost checks for Stebbi

Preconditions: `elta-vedrid` access, `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`, product table warmed.

1. **Default**: `met.no` on, `Veðurstofan` off.
   - Map shows 72 MET/Yr route circles, filter chips (green/yellow/red) visible.
   - Assessment, status, worst point, departure scrubber all as before.

2. **Enable Veðurstofan** (both on):
   - Map remounts briefly, then shows 72 MET/Yr circles + Veðurstofan purple circles.
   - Filter chips remain (they count MET/Yr points).
   - Assessment still from MET/Yr baseline.

3. **Disable met.no** (only Veðurstofan on):
   - Map remounts, shows only purple Veðurstofan station circles.
   - No MET/Yr route dots on the map.
   - Filter chips gone (no MET/Yr points to filter).
   - Overall status dot reflects worst Veðurstofan station wind at estimated travel ETA.
   - "Á leiðinni" shows worst station name, X km frá origin, estimated arrival time, wind value, Veðurstofan badge.
   - No "Punktur 26/72", no "Yr", no "Hrá met.no gögn".
   - Departure scrubber hidden.
   - "Áfangastaður" section hidden.

4. **Toggle back and forth several times**:
   - Each toggle: map remounts correctly with the right markers.
   - Markers do not accumulate or ghost from previous selection.

5. **Inspect a station card in "Allir spápunktarnir"**:
   - Shows station name, distance from route, stale warning if applicable.
   - Shows `Spá frá kl. HH:MM` (when Veðurstofan generated the forecast).
   - Shows `Sótt kl. HH:MM` (when the warmer fetched it).
   - Shows all forecast rows with times and values.
   - Freshness: after a fresh warmer run, `Sótt` time should be recent. No stale warning if fetched within 4h.

6. Check 360, 390, 460 px widths — no horizontal overflow, toggles tappable.

Do not run migrations, Supabase changes, production cron, deploy, push, or commit unless Stebbi gives explicit separate approval.
