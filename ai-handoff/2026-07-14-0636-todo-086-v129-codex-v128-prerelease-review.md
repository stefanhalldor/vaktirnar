# TODO 086 v129 - Codex review of v128 prerelease

Created: 2026-07-14 06:36
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-14-0630-todo-086-v128-claude-v127-done-prerelease.md`
Reviewed implementation scope: provider selection for Ferðaveðrið / Veðurstofan layer

## Findings

### High - Map markers will not reliably change when provider toggles change

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1285-1292`
- `components/weather/TravelAuditMap.tsx:152-155`
- `components/weather/TravelAuditMap.tsx:210-295`
- `components/weather/TravelAuditMap.tsx:345-350`

`FerdalagidClient` passes `activeMetnoPoints` and `activeVedurstofanStationPoints` into `TravelAuditMap`, but the map component is keyed only by `result.id`. Toggling `met.no` or `Veðurstofan` changes props, not the key.

Inside `TravelAuditMap`, the Google map initialization effect has an empty dependency array and creates route markers and Veðurstofan markers only once, from the initial props. The later marker update effect iterates existing MET/Yr markers, but if `weatherPoints` becomes empty it just hits `if (!pt) return`; it does not hide or remove the old marker. It also does not add Veðurstofan markers if they were not present on initial mount.

Expected failure mode:
- Start with default `met.no on`, `Veðurstofan off`.
- Map mounts with 72 MET/Yr markers.
- Toggle `met.no off`, `Veðurstofan on`.
- JSX passes `weatherPoints=[]` and station points, but the old MET/Yr markers can remain on the Google map and station markers may not appear unless the whole component remounts.

This directly risks preserving the exact bug Stebbi reported: all 72 MET/Yr route markers still visible while only Veðurstofan is selected.

Recommended fix:
- Either remount the map when provider selection changes, for example include `showMetno`, `showVedurstofan`, and a stable station id signature in the `key`.
- Or better, split map initialization from marker reconciliation and add effects that remove/recreate MET/Yr markers and Veðurstofan markers whenever their corresponding prop arrays change.

The remount key is the smaller patch. Marker reconciliation is the future-proof map architecture.

### High - `met.no off + Veðurstofan on` still depends on MET/Yr candidates and timing

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:527-573`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:651-672`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1003-1010`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1033-1049`

v128 adds a Veðurstofan-only branch for the visible "Á leiðinni" summary, but the surrounding state is still MET/Yr-derived:

- `outboundDisplayCandidates` comes from `result.travelPlan.outbound...`, which is the MET/Yr baseline.
- `activeOutboundCandidate` is selected from those MET/Yr candidates.
- The departure time shown in the result card still comes from that MET/Yr candidate.
- The Veðurstofan station ETA is computed using `activeOutboundCandidate.departureIso` and `activeOutboundCandidate.arrivalIso`.
- `worstVedurstofanStation` is selected by max wind across all station forecast rows, not by row nearest the route ETA or by a provider-owned candidate.

So the implementation does not yet satisfy the requirement "fjarlægja öll met.no gögn úr öllum útreikningum þegar met.no er hakað út". It hides the MET/Yr scrubber and shows a Veðurstofan station branch, but the timing/candidate scaffold is still MET/Yr.

Recommended fix:
- Introduce an `activeAssessment` or `activeProviderAssessment` model derived from selected providers.
- When only Veðurstofan is selected, derive candidate(s) from Veðurstofan station projections and forecast rows, not from `result.travelPlan.outbound`.
- For each station, use `routeFraction`/`distanceFromOriginM` to estimate ETA and choose the nearest forecast row to that ETA. Use that row for status/worst-point calculation.
- If there is no true Veðurstofan candidate model yet, keep Veðurstofan explicitly display-only. Do not present it as the active calculated route assessment.

This is the main product correctness gap before release.

### Medium - Veðurstofan provenance timestamps are not shown and fetched/expiry data is not carried to the UI

References:
- `lib/weather/providers/vedurstofanBlend.ts:65-95`
- `app/api/teskeid/weather/travel/route.ts:462-466`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1917-1938`

Stebbi asked whether the UI should show when the Veðurstofan data is from. Yes, it should.

v128 still only displays:
- station id,
- distance,
- stale label,
- each forecast row time (`ftimeIso.slice(11, 16)`),
- row values.

The layer type carries `atimeIso`, but the UI does not display it. More importantly, `fetchedAtIso` and `expiresAtIso` from the product payload are dropped before the client layer, so the UI cannot show "Sótt" or "Gildir til" even though the source cache has that data.

Recommended fix:
- Add `fetchedAtIso` and `expiresAtIso` to `VedurstofanTravelLayer.points`.
- Display compact provenance on each station card:
  - `Spá frá kl. HH:MM` from `atimeIso` when available.
  - `Sótt kl. HH:MM` from `fetchedAtIso`.
  - optional `Gildir til kl. HH:MM` or freshness label from `expiresAtIso`.
- Keep row `ftimeIso` as the forecast valid time for each row.

This is not just polish. It is important for trust while the layer is in testing.

### Medium - Map status chips and selected-point panel are still MET/Yr-only

References:
- `components/weather/TravelAuditMap.tsx:408-410`
- `components/weather/TravelAuditMap.tsx:418-436`
- `components/weather/TravelAuditMap.tsx:509-544`
- `components/weather/TravelAuditMap.tsx:566-579`

When `weatherPoints=[]` and only `vedurstofanStationPoints` exist:

- `mapStatusCounts` is computed only from `weatherPoints`, so Veðurstofan-only map status/filter chips will be empty.
- `selectedPoint` / `selectedSummary` are also based only on `weatherPoints`, so station markers cannot drive the detail panel.
- Veðurstofan station markers are plain overlay markers with tooltip only, no selection state.

This is acceptable for a very narrow "show station dots" patch, but it does not meet the broader v127 goal that selected provider points should drive map, selected point, worst point and all-points consistently. It also weakens the localhost check in v128 that says "status dot/label reflects worst Veðurstofan station" because the map chips do not.

Recommended fix:
- Either make `TravelAuditMap` consume normalized provider points and build counts/details from all active providers.
- Or keep MET/Yr map controls disabled/hidden when `weatherPoints.length === 0`, and add explicit Veðurstofan station count/legend outside the map for this interim.

Do not show empty map filter UI in Veðurstofan-only mode.

### Low - `augmentedResult` is still built and returned even though the product decision moved away from silent blending

References:
- `app/api/teskeid/weather/travel/route.ts:364-386`
- `app/api/teskeid/weather/travel/route.ts:480`
- `lib/weather/providers/vedurstofanBlend.ts:13-23`
- `lib/weather/providers/vedurstofanBlend.ts:62-63`

The API still computes a max-blended MET/Yr + Veðurstofan `augmentedResult` and returns it inside `vedurstofanLayer`, even though the UI no longer uses it for active results.

This is not currently a visible regression, but it creates two risks:
- accidental future reintroduction of the same max-blend behavior Stebbi rejected,
- extra payload and server work for data that is not part of the approved product path.

Recommended fix:
- Either remove `augmentedResult` for now,
- or rename/mark it as internal shadow comparison and do not expose it to client UI until the product semantics are explicitly approved.

## What looks good

- v128 correctly stops mutating the baseline `travelPlan.routeWeatherPoints` with embedded `vedurstofanStation`.
- The API now returns one Veðurstofan layer point per station id instead of duplicating a station for every MET/Yr route sample.
- `distanceFromOriginM` and `routeFraction` are now available for stations, which is the right foundation for ETA-aware Veðurstofan assessment.
- Tests and typecheck are green locally.
- The 4h TTL is directionally better than 90 minutes for a 3h forecast cadence.

## Tests / commands run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 2 files passed, 26 tests passed.

```bash
npm run type-check
```

Result: exit 0.

Other commands were read-only inspections:
- `git status --short`
- `git diff --stat`
- targeted `git diff`
- targeted line reads with PowerShell
- `rg` searches

No code, SQL, env, Supabase, commit, push or deploy action was performed by Codex.

## Recommended next step for Claude Code

Do not release v128 as-is.

Smallest useful next patch:

1. Fix `TravelAuditMap` marker lifecycle so provider toggles actually remove/add markers after mount.
   - Fastest: remount the map on provider selection changes.
   - Better: reconcile marker arrays in effects keyed by `weatherPoints` and `vedurstofanStationPoints`.
2. For `met.no off + Veðurstofan on`, stop using MET/Yr `activeOutboundCandidate` as the source of active calculation.
   - Minimum honest version: clearly label Veðurstofan as display-only and do not show it as the computed route status.
   - Better product version: build a Veðurstofan-only assessment from station projection + forecast row nearest ETA.
3. Add `fetchedAtIso` / `expiresAtIso` to the Veðurstofan layer and show provenance timestamps on station cards.

The best future-proof direction remains a normalized provider point model:

```ts
type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

type ProviderWeatherPoint = {
  provider: WeatherProviderKey
  id: string
  label: string
  lat: number
  lon: number
  distanceFromRouteM: number | null
  distanceFromOriginM: number | null
  routeFraction: number | null
  forecastRows: unknown[]
  provenance: {
    forecastGeneratedAtIso?: string | null
    fetchedAtIso?: string | null
    expiresAtIso?: string | null
    sourceUrl?: string | null
  }
}
```

But Claude Code can safely patch the map lifecycle first before doing the full provider model.

## Localhost checks for Stebbi

Preconditions:
- Stebbi runs localhost himself.
- `elta-vedrid` access is enabled.
- Veðurstofan product table has been warmed.
- No migrations, production cron, deploy, push, commit or Supabase changes are needed for this check.

After Claude Code patches v128:

1. Open the same route used in Stebbi's screenshots.
2. Default state: `met.no` on, `Veðurstofan` off.
   - Map shows the 72 MET/Yr route points.
   - Worst point and scrubber are the existing MET/Yr behavior.
3. Toggle `Veðurstofan` on while keeping `met.no` on.
   - Map adds Veðurstofan station markers without duplicating or leaving stale markers.
   - MET/Yr markers remain visible.
4. Toggle `met.no` off, leaving only `Veðurstofan`.
   - Map shows only Veðurstofan station markers near the route, e.g. 6 in Stebbi's case.
   - No MET/Yr route dots remain after the toggle.
   - No `Punktur 26/72`, `Yr`, or `Hrá met.no gögn` appears in the active summary.
   - If the implementation claims Veðurstofan is driving assessment, the worst point should be the actual worst station at the relevant ETA, e.g. Sandskeið when its ETA-nearest row is worst.
5. Inspect a Veðurstofan station card.
   - It should show row times.
   - It should also show `Spá frá` and `Sótt` or equivalent provenance.
6. Toggle providers back and forth several times.
   - Markers should not accumulate.
   - Old provider markers should not remain.
   - Map bounds should stay sensible.
7. Check mobile widths around 360, 390 and 460 px.
   - No horizontal overflow.
   - Provider toggles remain easy to tap.
   - Station rows wrap cleanly.

## Release recommendation

Not ready for release yet.

The tests are green, but the two core product assertions are not guaranteed:

- toggling providers must actually remove/add map data after the map has mounted;
- `met.no off` must not keep using MET/Yr candidates/timing as the hidden assessment backbone.

Fix those before giving this to Stebbi as a prerelease to validate.

## Óvissa / þarf að staðfesta

- I did not control the browser or Google Maps runtime directly. The map marker finding is based on React effect dependencies and marker lifecycle code, so confidence is high, but Stebbi/Claude Code should still verify in localhost.
- I did not inspect every unrelated dirty file. This review focused on the files touched by v128 and the behavior in Stebbi's screenshots.
