# TODO 086 v121 - Codex addendum after Stebbi screenshot

Created: 2026-07-13 22:37
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on: `2026-07-13-2235-todo-086-v120-codex-v119-station-layer-review.md`
User evidence: Stebbi's localhost screenshot after v119

## Bottom line

Stebbi's screenshot proves that v119 is still not presenting Veðurstofan as independent provider points in the user-facing all-points UI.

The current UI still shows the 72 MET/Yr route sample cards and labels them as `met.no + Veðurstofan`. That is the wrong product model for validation:

- MET/Yr route samples are 72 points.
- Veðurstofan stations must be separate station/provider points.
- Turning on Veðurstofan should not relabel each MET/Yr point as if it now represents both providers.
- The user-facing count/list must not make it look like Veðurstofan only added data into the same 72 cards.

This is separate from the backend station-based `vedurstofanLayer.points` correction. Even if the API now builds station points correctly, the UI is still foregrounding the old 72 MET/Yr card set as the primary all-points list.

## Concrete screenshot symptoms

Stebbi sees:

- Status chips still sum to 72 points even with Veðurstofan enabled.
- The card says `Punktur 1/72`.
- The provider label on that card says `met.no + Veðurstofan`.
- The content is still the MET/Yr route point content:
  - `Spápunktur um 20 m frá veginum`
  - `Yr`
  - `Hrá met.no gögn`
  - route index 1/72
- Veðurstofan is still being visually attached to the same MET/Yr card instead of appearing as its own station point/card set.

That is not acceptable for the validation phase because it reintroduces the misunderstanding Stebbi was trying to eliminate.

## Code reference

The issue is visible here:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1281-1311`

Current behavior:

```tsx
{showMetno && result.travelPlan!.routeWeatherPoints!.map((pt) => (
  <RoutePointRow
    ...
    providerLabel={vedurstofanLayer && showVedurstofan ? tf('metnoBlendedLabel') : tf('providerMetnoLabel')}
    ...
  />
))}
```

This means every MET/Yr route point is relabelled as blended whenever Veðurstofan is toggled on.

## Required correction for Claude Code

### 1. Do not label MET/Yr point cards as `met.no + Veðurstofan`

For now, `RoutePointRow` should stay `met.no` unless/until the card truly represents a blended calculation and the UI explicitly explains that it is a blended result.

In this validation UI, prefer:

- MET/Yr route sample cards: `met.no`
- Veðurstofan station cards: `Veðurstofan (í prófun)`
- Vegagerðin: disabled/not included yet

If the underlying result uses blended values for the final assessment, that should be disclosed separately in the summary, not by making each MET/Yr point card look like a dual-provider point.

### 2. The all-points UI must show provider groups/counts separately

Recommended structure under "Allir spápunktarnir á leiðinni":

1. Provider filter/toggles near summary:
   - `Met.no`
   - `Veðurstofan (í prófun)`
   - `Vegagerðin (í vinnslu)` disabled
2. When `Met.no` is on:
   - show MET/Yr group heading, e.g. `MET/Yr punktar (72)`
   - list `Punktur 1/72`, `Punktur 2/72`, etc.
3. When `Veðurstofan` is on:
   - show Veðurstofan group heading, e.g. `Veðurstofustöðvar við leiðina (N)`
   - list one card per station from `vedurstofanLayer.points`
   - these cards must not say `Punktur 1/72`
   - they should say station name/ID and distance from route.

The total product should make it obvious that `72` is only MET/Yr. Veðurstofan should add its own count, not disappear inside the 72.

### 3. Counts/chips must not imply Veðurstofan is part of the 72

The current top chips (`Innan marka`, `Nálægt óþægindi`, `Óþægilegt`) are MET/Yr/result-status counts. They can remain, but with Veðurstofan enabled they should not be read as "all shown provider points".

Options:

- Add provider group counts below/near the all-points heading.
- Or label status chips as route assessment/MET-derived counts.
- Or keep status chips unchanged but make section headings very explicit: `MET/Yr punktar (72)` and `Veðurstofustöðvar (N)`.

### 4. Veðurstofan station cards must be independent cards, not nested into RoutePointRow

Use or evolve `VedurstofanPointRow` as the station card, but make sure it is what Stebbi actually sees when Veðurstofan is enabled.

Minimum station card fields for validation:

- Station name
- Provider badge: `Veðurstofan (í prófun)`
- Station ID
- Distance from route (after v120 distance fix)
- Fresh/stale/unavailable status
- Forecast/observation time if available
- Wind speed and direction
- Precipitation
- Temperature
- Weather text
- `vedur.is` link when available

Do not show `Yr`, `Hrá met.no gögn`, or `Punktur 1/72` on Veðurstofan station cards.

## Relationship to v120 findings

v120 remains valid and should still be addressed:

1. Fix station-to-route distance to use point-to-segment distance, not nearest vertex.
2. Add regression tests for station-based dedupe.
3. Update stale comments/type language.

This v121 addendum adds one higher-priority UI correction:

4. Stop visually blending Veðurstofan into each MET/Yr route point. Show station provider points as their own list/cards with their own count.

## Suggested next patch scope

Ask Claude Code for one focused patch:

- Keep backend station-based `vedurstofanLayer.points`.
- Fix `distanceToPolylineM` from v120.
- Change `RoutePointRow` provider label back to `met.no` for MET/Yr cards.
- Render Veðurstofan stations in a clearly separate group with count.
- Add tests for API/model behavior where practical.
- No SQL, no migration, no cron, no Supabase, no deploy.

Do not start the larger shared-card refactor until the displayed provider model is correct.

## Localhost checks for Stebbi

After the next patch:

1. Open the same route as in Stebbi's screenshot.
2. Turn on both `Met.no` and `Veðurstofan`.
3. Under "Allir spápunktarnir á leiðinni", confirm MET/Yr cards still say only `met.no`.
4. Confirm there is a separate Veðurstofan section/card list with its own count.
5. Confirm Veðurstofan cards do not show:
   - `Punktur 1/72`
   - `Yr`
   - `Hrá met.no gögn`
   - `Spápunktur um 20 m frá veginum`
6. Turn `Met.no` off and leave `Veðurstofan` on.
7. Confirm the list no longer shows 72 MET/Yr cards; it should show only Veðurstofan station cards.
8. Turn `Veðurstofan` off and leave `Met.no` on.
9. Confirm the old 72 MET/Yr cards appear and the normal route assessment still works.
10. Check 360, 390, and 460 px widths for wrapping/overflow.

Do not test migrations, production cron, Supabase changes, deploy, or real production data casually for this step.
