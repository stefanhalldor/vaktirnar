# TODO 086 - v058 Codex handoff: Elta veðrið must move from curated seed to all stations

Created: 2026-07-13 00:10  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Type: Product/implementation direction after Stebbi feedback  
Context: Stebbi reviewed the current Elta veðrið page showing 29 selected stations and clarified the target requirement.

## Stebbi's Clarified Requirement

Stebbi does not want Elta veðrið to stop at the 29 curated stations currently shown.

The target is:

- include all Veðurstofan stations that can be sourced from the official Veðurstofan data/service
- if a station cannot be mapped confidently, include it anyway and tag it as unmapped/needs verification
- expose all station data we know in the UI
- use this page as a durable collaborative mapping/verification tool, not a throwaway validation screen
- eventually reach a state where Stebbi + Claude Code + Codex have mapped and verified all stations together

This means the current 29-station view is acceptable only as an early hidden/feature-gated seed. It should not be treated as done for the Elta veðrið station-validation goal.

## Release Guidance

If Claude Code is releasing the current state to production:

- OK only if it remains hidden behind `WEATHER_ELTA_VEDRID_FLAG` and per-user `elta-vedrid` access.
- Do not describe it as "all Veðurstofan stations."
- Do not close TODO 086 station validation as complete.
- The UI copy saying "valdar ... spástöðvar" is important and should stay until all-station sourcing is implemented.

If the release is meant to satisfy Stebbi's all-stations requirement, pause. The current implementation does not satisfy that requirement.

## Current Gap

Current implementation uses:

- `lib/weather/providers/vedurstofanStations.ts`
- `VEDURSTOFAN_STATIONS`
- 29 curated stations in the UI

This is not an authoritative all-stations dataset. It is a hand-selected route-relevant seed.

Also, the current endpoint fetches forecast rows (`type=forec`), not live observations/gusts. That is fine as long as the UI stays explicit about the distinction.

## Next Implementation Direction

Claude Code should plan a new phase before treating Elta veðrið as complete:

1. Find the authoritative station source.
   - Prefer official Veðurstofan source/service/docs.
   - If the source contains both Veðurstofan and Vegagerðin stations, preserve owner/source metadata instead of flattening it away.
   - Do not guess the total count from the current 29-station seed.

2. Split station metadata from route-curation.
   - Keep an all-stations registry.
   - Keep route-relevant/verified subsets as tags or filters, not as the only dataset.
   - Suggested conceptual shape:
     - `stationId`
     - `stationName`
     - `owner`
     - `source`
     - `lat`
     - `lon`
     - `coordinatesVerified`
     - `mappingStatus`: `verified | source-provided | needs-verification | missing-coordinates | duplicate-or-ambiguous`
     - `availableDataTypes`: `forecast | observation | gust | unknown`
     - `lastSeenAt`
     - `notes`

3. UI should support data-quality verification.
   - Show all stations by default or have an obvious "Allar stöðvar" mode.
   - Add filters for:
     - verified
     - needs verification
     - missing coordinates
     - forecast data available
     - observations/gusts available if/when added
   - Show station detail with every known field.
   - Make it obvious when coordinates are source-provided but not manually verified.

4. Do not block inclusion on perfect mapping.
   - If coordinates are missing or suspect, include the station in the list.
   - If map placement is uncertain, do not hide the station; tag it and keep it visible in a "needs mapping" list.
   - This is the core of Stebbi's ask: use the product to help finish mapping, not wait until mapping is perfect.

5. Keep current/live observations as a separate data-source question.
   - The current forecast endpoint does not explain the hviður shown on umferðin.is.
   - Add a follow-up research task for official current-observation/gust source.
   - Do not merge forecast rows and live observations into one display without clear labels.

## Suggested Phase Naming

Phase 2B0 can remain: hidden station explorer seed.

Next phase should be something like:

- Phase 2B1: authoritative all-station registry
- Phase 2B2: station mapping/verification UI
- Phase 2B3: current observations/gust source research and display

## Suggested Copy Direction

Until all-station source is implemented:

- keep wording like `valdar spástöðvar`
- keep saying these are forecast rows, not live observations/gusts

After all-station source is implemented:

- change count label to something like `{count} stöðvar í gagnasafni`
- show a separate count for verified vs needs-verification
- avoid saying "allar stöðvar" unless the station source and import coverage are documented

## Review Questions For Claude Code

Claude Code should answer before implementing the all-stations phase:

1. What is the official source of the complete station registry?
2. Does that source include coordinates for every station?
3. Does the source distinguish Veðurstofan vs Vegagerðin ownership?
4. Which stations have forecast rows from `type=forec`?
5. Which official endpoint/source, if any, provides current observations and gusts?
6. Should this registry live as code, generated JSON, Supabase table, or a hybrid?
7. How will unknown/unmapped stations remain visible in UI?

## Supabase / Migration Note

This handoff does not approve any Supabase migration.

`sql/73_feature_access_elta_vedrid.sql` remains a separate operational step. It should not be run unless Stebbi explicitly approves the Supabase migration.

If the future all-station registry is stored in Supabase, that requires a new explicit plan and approval because it touches schema/data/storage.

## Localhost Checks For Stebbi

For the current released/hidden seed:

1. Open `/auth-mvp/vedrid/elta-vedrid` with both `vedrid` and `elta-vedrid` access.
2. Confirm the page says the stations are selected/curated, not all stations.
3. Confirm it says forecast rows, not live observations/gusts.
4. Confirm the page remains hidden for users without `elta-vedrid`.

For the next all-stations phase:

1. Confirm the total station count matches the documented official source.
2. Confirm stations with missing/uncertain coordinates still appear in a list.
3. Confirm map markers distinguish verified vs needs-verification.
4. Open several station detail cards and confirm all known fields are visible.
5. Confirm forecast rows and live/current observations are labeled separately if both exist.
6. Regression check `/auth-mvp/vedrid` route-weather flow remains unchanged.

## Codex Recommendation

Do not discard the current feature-gated explorer. It is a useful skeleton.

But the next real product step is to turn its station model from "curated route seed" into "authoritative all-station registry with mapping status." That directly matches Stebbi's goal of collaboratively verifying all stations over time.

