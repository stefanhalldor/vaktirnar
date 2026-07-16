# TODO 086 v133 - Codex addendum: Veðurstofan map markers need status colors

Created: 2026-07-14 06:55
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on:
- `2026-07-14-0652-todo-086-v131-codex-v130-prerelease-review.md`
- `2026-07-14-0654-todo-086-v132-codex-v131-addendum-vedurstofan-active-model.md`
User evidence: Stebbi screenshot showing Veðurstofan-only map with all station markers as the same purple dots.

## Finding

### High - Veðurstofan map markers are provider-colored, not status-colored

References:
- `components/weather/TravelAuditMap.tsx:81`
- `components/weather/TravelAuditMap.tsx:277-285`
- `components/weather/TravelAuditMap.tsx:384`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1303`

The Veðurstofan station markers are currently hard-coded as purple:

```ts
fillColor: '#7c3aed'
```

That only communicates "this is Veðurstofan". It does not communicate whether each station is within limits, approaching discomfort, uncomfortable, dangerous, or missing data.

This is why Stebbi sees "enginn litur heldur á kortinu": in Veðurstofan-only mode the map has station dots, but no weather status signal.

## Product requirement

If Veðurstofan is the active provider, the map must show weather severity for Veðurstofan stations, not only provider identity.

For each Veðurstofan station marker:

- color should be derived from the active Veðurstofan assessment row for that station;
- the row should be the same decisive row used by the summary/selected point model, ideally nearest ETA;
- marker should also include non-color status signal where possible, because `Design.md` says status colors must not be the only meaning.

## Recommended implementation

Do not pass only `{ lat, lon, stationId, stationName }` to `TravelAuditMap`.

Pass status-bearing station marker data instead, for example:

```ts
type VedurstofanMapPoint = {
  lat: number
  lon: number
  stationId: string
  stationName: string
  status: WindDisplayStatus | 'no_data'
  windMs: number | null
  forecastTimeIso: string | null
  etaIso: string | null
}
```

Then `TravelAuditMap` can map that status to the same visual language as MET/Yr markers:

- green/check for within limits,
- amber/orange for approaching/uncomfortable,
- red/exclamation for dangerous,
- gray for no data.

Use the existing marker color constants/patterns where possible:

- `WIND_STATUS_MARKER_COLOR`
- `WIND_STATUS_UI_META`
- existing route marker label conventions (`✓`, `!`) as a starting point.

## Important distinction

Provider identity and weather status are separate concepts:

- Provider identity: `Veðurstofan (í prófun)` label, legend, tooltip, or badge.
- Weather status: marker color/icon/label based on the active forecast row.

Do not make all Veðurstofan stations purple in Veðurstofan-only mode. Purple can be used as a provider outline/border/legend color if needed, but the fill/status should communicate weather risk.

## Expected UI behavior

### `met.no` only

- Existing MET/Yr marker colors remain unchanged.

### `Veðurstofan` only

- Map shows only Veðurstofan station markers.
- Each station marker color reflects Veðurstofan status at the station's ETA-nearest forecast row.
- Sandskeið should be orange/red/yellow if it is the station driving the route risk.
- Station tooltip/title can include station name and status, e.g. `Sandskeið · 12 m/s · spá kl. 06:00`.

### Both providers

- If both layers are shown, make status and provider identity distinguishable:
  - MET/Yr route dots keep their existing style.
  - Veðurstofan station dots get status color plus provider-specific outline/shape/tooltip.
  - Consider a tiny legend if visual ambiguity remains.

## Localhost checks for Stebbi

Preconditions:
- Stebbi runs localhost himself.
- `elta-vedrid` access is enabled.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan product table has been warmed.
- No migrations, Supabase changes, production cron, deploy, push or commit for these checks unless Stebbi gives explicit separate approval.

After Claude Code patches this:

1. Select only `Veðurstofan`.
   - Map shows only Veðurstofan stations.
   - Markers are not all identical purple.
   - Markers show green/amber/orange/red/gray status according to Veðurstofan station values.
2. Confirm the worst station:
   - The station shown as worst in the summary should visually stand out on the map with the corresponding status.
   - Tooltip/title should help identify station name and forecast row/time.
3. Select both `met.no` and `Veðurstofan`.
   - MET/Yr and Veðurstofan points are visually distinguishable.
   - Weather severity still reads clearly.
4. Check mobile widths 360, 390, 460 px.
   - Any legend or map chips wrap without overflow.

## Send to Claude Code

Send this v133 together with v131 and v132. The key instruction:

> Veðurstofan station markers must carry and display weather status, not just provider identity. Purple-only station dots are not enough.

## Óvissa / þarf að staðfesta

- I did not run the browser. This addendum is based on Stebbi's screenshot and code inspection showing hard-coded purple marker fill.
