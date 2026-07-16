# TODO 086 v118 - Codex correction: Veðurstofan points must be station-based, not met.no-mapped

Created: 2026-07-13 22:22
Timezone: Atlantic/Reykjavik

Context:

- Stebbi has not sent v117 to Claude Code yet.
- This addendum should be sent instead of, or together with, v117.
- It supersedes the v117 suggested next-step copy/paste instruction.

## Stebbi's localhost finding

When `met.no` is toggled off and only `Veðurstofan` is visible, the current model problem becomes obvious:

- there are still effectively the same 72 route/met.no sample positions;
- each route/met.no point maps to its nearest Veðurstofan station;
- the same Veðurstofan station appears repeatedly, for example `Garðabær - Kauptún` multiple times;
- the UI is treating Veðurstofan as an attachment to each met.no route point.

That is not the intended product model.

## Correct product model

Veðurstofan points must be independent provider/station points.

They must not be derived as:

> one nearest Veðurstofan station per met.no forecast point

Instead, the route weather UI should have:

- MET/Yr route/sample points from met.no;
- Veðurstofan station points from Veðurstofan;
- later Vegagerðin points from Vegagerðin.

These are separate provider layers. They can be shown together, but they must not pretend to be the same point set.

## Required correction

For the route weather Veðurstofan layer, create one Veðurstofan point per unique Veðurstofan station.

Use `stationId` as the stable identity.

For each Veðurstofan station point:

- use the station's own coordinates;
- calculate the station's distance to the actual route/road polyline;
- do not calculate or display distance to a met.no/Yr point;
- show that distance as the station's distance from the route/road;
- render the station once, not once per met.no route sample.

The Veðurstofan station point can still be route-relevant, for example only stations within a sensible corridor around the route, but it must be selected/deduped by station identity, not by route sample count.

Important nuance:

- For `Elta veðrið`, showing all national Veðurstofan stations makes sense.
- For route weather, showing all 280 national stations in the route point list would probably be too much. A route-relevant corridor is better.
- But whichever corridor rule is used, the output must be `unique stations near this route`, not `nearest station for each met.no point`.

## Technical guidance

Current problematic shape:

- `getUniqueStationIdsForRoute(weatherPoints)` dedupes station IDs for fetch.
- But later `layerPoints` is rebuilt by looping over every `pointForecasts` route sample and calling `mapRoutePointToVedurstofanStation(...)` again.
- That makes the UI list route-point based, not station based.

Recommended shape:

1. Build a route polyline distance helper:
   - input: station lat/lon + `routeGeometry.points` or audit polyline;
   - output:
     - `distanceFromRouteM`
     - optional nearest route coordinate
     - optional route fraction / distance from origin.
2. Build station candidates from the Veðurstofan station registry/product data.
3. Filter to stations with coordinates and usable product-table data.
4. Filter to a route corridor if needed, e.g. a conservative distance threshold.
5. Dedupe by `stationId`.
6. Return `vedurstofanLayer.points` as unique station points.
7. Keep per-route-point mapping only for the augmented/blended MET/Yr calculation if still needed.

Do not use `routePointId: rwp_${routeIndex}` for Veðurstofan station cards. Use a station-based id, for example:

```ts
routePointId: `vedurstofan_${stationId}`
```

or rename the field to `id` / `pointId` if that is cleaner.

## Card data requirement

Stebbi wants every Veðurstofan station card to show all useful information we have for that station.

Include as much as is already available without new live calls:

- station name;
- station ID;
- provider label `Veðurstofan (í prófun)`;
- owner if available, but do not confuse owner with provider;
- coordinates if useful for debugging/validation;
- distance from route/road;
- source/station URL (`vedur.is`) when available;
- freshness/status (`ný gögn`, `gömul gögn`, `vantar gögn`);
- forecast/observation time if available;
- wind speed;
- wind direction;
- precipitation;
- temperature;
- weather text.

If observations/gusts are not yet in this route payload, do not fake them. Label the gap clearly in the handoff and make it a follow-up.

## Shared component direction

Stebbi wants the same provider-aware point/card concept to be reusable in three places:

1. worst/most demanding point, where applicable;
2. selected point on the map;
3. "Allir spápunktarnir".

That does not mean all three must be fully refactored in the next patch, but the next patch must not deepen the wrong coupling between Veðurstofan stations and met.no sample points.

If the full shared component refactor is too large, do this in phases:

1. First fix the data model so Veðurstofan layer points are unique station points.
2. Render those station points correctly in "Allir spápunktarnir".
3. Then bring the same card model into selected map point and worst point surfaces.

## Map expectation

If Veðurstofan is the only active provider:

- the UI should not still show 72 MET/Yr markers/cards as the visible point layer;
- it should show Veðurstofan station points if map support for them exists;
- if map support does not exist yet, the UI must make that limitation clear and not pretend met.no has been hidden everywhere.

## Suggested instruction to Claude Code

```text
Claude Code, ekki senda v117 einn og sér í framkvæmd. Rýndu v118 og gerðu v119 patch sem leiðréttir data/product modelið fyrir Veðurstofan punkta.

Kjarni:
- Veðurstofan-punktar mega ekki vera nearest-station-per-met.no-route-point.
- Veðurstofan-punktar eiga að vera sjálfstæðir station/provider points, einn punktur per unique stationId.
- Reiknaðu fjarlægð hverrar Veðurstofustöðvar að raunverulegri route/road polyline, ekki að met.no/Yr spápunkti.
- Birta skal Veðurstofustöðina einu sinni í "Allir spápunktarnir", með stationId/sourceUrl/status/freshness/forecast values og öðrum station metadata sem við höfum.
- Ef við þurfum route corridor threshold, notaðu skýrt og conservative threshold og skráðu það í handoff.
- Per-route-point mapping má áfram vera til fyrir experimental blended calculation, en UI-provider-punktarnir mega ekki byggja á því.
- Taktu líka með v117 atriðið að `met.no` toggle má ekki vera villandi: annaðhvort er hann alvöru provider visibility filter eða UI segir skýrt að hann filteri bara listann.

Ekki breyta SQL, migrations, Supabase config, cron, commit-a, push-a eða deploya.
Keyrðu targeted tests og type-check og skilaðu prerelease handoff með Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

After Claude Code implements the correction:

1. Open route weather with the experimental Veðurstofan layer enabled.
2. Turn `met.no` off and `Veðurstofan` on.
3. Open "Allir spápunktarnir".
4. Confirm the list does not show 72 repeated route/met.no-derived rows.
5. Confirm each Veðurstofan station appears at most once.
6. Confirm `Garðabær - Kauptún` or any other station is not repeated multiple times unless there is a clearly intentional grouping.
7. Confirm each Veðurstofan card shows station identity and useful metadata:
   - station name;
   - station ID;
   - provider badge;
   - freshness/status;
   - weather values;
   - distance from route/road;
   - vedur.is link if available.
8. Confirm no Veðurstofan card says or implies that its distance is from a met.no/Yr point.
9. Toggle `met.no` back on and confirm MET/Yr points and Veðurstofan station points are visually separate provider layers.
10. Check the selected/worst point surfaces:
    - if Veðurstofan provider cards are not implemented there yet, confirm the UI does not misleadingly show met.no cards as Veðurstofan;
    - if they are implemented, confirm they use the same station-based model.
11. Test at 360, 390, and 460 px widths for no overflow and readable station cards.

Do not run production cron, migrations, Supabase changes, push, deploy, or commit as part of this check unless Stebbi separately approves that.

## Uncertainty / needs confirmation

The main open product question is the route corridor threshold:

- Should route weather show every Veðurstofan station in Iceland, or only stations near the selected route?

Codex recommendation:

- For route weather, show unique Veðurstofan stations near the route.
- For `Elta veðrið`, keep the all-national-stations validation map/list.

That keeps the route product usable while still preserving the broader station validation workflow elsewhere.
