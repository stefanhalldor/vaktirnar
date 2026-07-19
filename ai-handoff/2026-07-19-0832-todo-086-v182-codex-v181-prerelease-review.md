# 2026-07-19 08:32 - TODO 086 v182 - Codex review of v181 single-place filter

Created: 2026-07-19 08:32
Timezone: Atlantic/Reykjavik

Source reviewed: `2026-07-19-0900-todo-086-v181-claude-v180-single-place-filter-scrubber-hint`

## Stutt mannamál

Þetta er næstum release-ready. v181 lagaði megnið: single-place filterinn er kominn fyrir Veðurstofu og Vegagerð, hint textinn er kominn, scrubber Veðurstofunnar tekur mið af völdum stað, og build/test/type-check eru græn.

Eitt þarf að laga fyrir útgáfu: Vegagerðin/Núna hluti scrubbersins þarf að nota sama route/place-filter og kortið. Nú er kortið filterað á næstu Vegagerðarstöð, en `Núna`-kubburinn reiknar enn timestamp/status yfir allar Vegagerðarstöðvar landsins. Það skýrir screenshotið frá Stebba með Egilsstöðum.

Ég myndi laga þetta eina atriði og gefa svo út. Ekki bæta við nýju product scope fyrr en eftir útgáfu.

## Findings

### Medium - Vegagerðin/Núna selector notar enn global gögn, ekki valda staðinn

Map-layer Vegagerðarinnar notar single-place filter:

- `nearestVegagerdinStationId`: `components/weather/WeatherOverviewClient.tsx:387-397`
- `singlePlaceVegagerdinIds`: `components/weather/WeatherOverviewClient.tsx:417-425`
- marker visibility notar `vegagerdinRouteFilterIds`: `components/weather/WeatherOverviewClient.tsx:495-520`
- status-pill counts nota líka `vegagerdinRouteFilterIds`: `components/weather/WeatherOverviewClient.tsx:523-549`

En source/time selectorinn fyrir `Núna` notar enn global Vegagerðin gögn:

- newest measured time yfir allar Vegagerðarstöðvar: `components/weather/WeatherOverviewClient.tsx:362-372`
- worst status yfir allar Vegagerðarstöðvar: `components/weather/WeatherOverviewClient.tsx:374-385`
- þau gildi fara beint í `WeatherSourceTimeSelector`: `components/weather/WeatherOverviewClient.tsx:691-704`

Þannig getur map sýnt eina græna Egilsstaðir-stöð en `Núna` dot/status/tími verið rautt eða frá annarri stöð. Þetta er ósamræmi og notandi upplifir að Vegagerðin taki ekki mið af völdum stað.

**Lágmarksfix fyrir Claude Code:**

- Búa til sameiginlegt memo fyrir virkar/filteraðar Vegagerðarstöðvar, t.d.:
  - `filteredVegagerdinStationsForOverview`
  - notar `vegagerdinRouteFilterIds` ef til staðar
  - annars allar stöðvar
- Nota þetta sama safn fyrir:
  - `vegagerdinNewestMeasuredAtIso`
  - `vegagerdinWorstStatus`
  - `overviewStatusCounts` þegar `activeMode === 'now'`
  - map marker visibility má halda áfram að nota sama filterið, eða sameina betur ef það verður einfaldara
- Þegar aðeins `Egilsstaðir` er valið:
  - map sýnir eina næstu Vegagerðarstöð
  - `Núna` status/dot og `Mælt hh:mm` koma frá þeirri stöð/sama filteraða safni
- Þegar `Frá + Til` route-memory er valið:
  - `Núna` status/dot/timestamp reiknast yfir exact Vegagerðarstöðvar á leiðinni, ekki allt landið.

### Low - Detail selection er enn Veðurstofu-miðað

`requestedSelection` sem sendist í shellið er enn bara `nearestStationRequest`, þ.e. næsta Veðurstofustöð: `WeatherOverviewClient.tsx:192-207` og `WeatherOverviewClient.tsx:678-688`.

Ef active mode er `Núna`, map layerið er Vegagerðin en selected marker requestið er Veðurstofan. Það er ekki endilega blocker ef markmiðið er bara map filter, en betri samræming væri:

- `requestedSelection` ætti að vera nearest Vegagerðin marker þegar `activeMode === 'now'`
- annars nearest Veðurstofan marker þegar `activeMode` er forecast time

Ég myndi aðeins taka þetta ef það er lítið í sömu lagfæringu. Ekki flækja ef það hótar útgáfunni.

## Það sem lítur vel út

- Route-memory picker er enn Google-kostnaðarlaus.
- Bidirectional route-memory hegðun heldur.
- Single-place map filter fyrir Vegagerð er kominn í kóða.
- Veðurstofu forecast scrubber filterar á active route/place station set.
- Hint texti er í `messages/is.json` og `messages/en.json`, ekki hardcode.
- Build-gate sem féll áður á `/contacts` er nú grænt þegar build er keyrt stakt.

## Route intelligence check

- Snertir `/vedrid` overview og route-memory station filtering, ekki nýjan vegkafla.
- Engin ný leiðaþekking þarf í `IcelandRoadmap.md` fyrir þetta síðasta polish.
- Lausnin á að vera provider-neutral í merkingu: sami selected-place/route-filter þarf að stjórna bæði Veðurstofu og Vegagerð.
- Engin SQL eða migration þarf.
- Privacy helst óbreytt: normalized place labels/keys og provider station IDs, ekki raw addresses eða Google geometry.
- Google cost helst óbreytt/lágt: `/vedrid` picker á áfram ekki að kalla Google.

## Commands run by Codex

```txt
npm run type-check
exit 0 when run standalone

npm run test:run -- lib/__tests__/nearestStations.test.ts lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/middleware.test.ts lib/__tests__/weather-public.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts
exit 0
8 files passed, 207 tests passed

npm run test:run
exit 0
116 files passed, 3376 passed, 27 skipped, 8 todo

npm run build
exit 0 when run standalone
Only existing lint warnings shown

git diff --check
exit 0, only CRLF warnings for TODO.md and WORKFLOW.md
```

Note: I accidentally ran `npm run type-check` in parallel with `npm run build` once, which produced `.next/types` missing-file errors. Re-running type-check standalone passed, so I treat that as a local artifact/race, not a code failure.

## Recommended handoff to Claude Code

```md
## v182 final release polish: make Vegagerðin/Núna respect selected place/route

Stebbi is ready to release. Do not add new product scope.

### Problem

v181 filters the Vegagerðin map to the nearest station when a single place is selected, but the `Núna` selector/scrubber still uses global Vegagerðin data.

Example: select `Egilsstaðir`.

Expected:
- map shows the local Vegagerðin station(s)
- `Núna` dot/status uses that same local station/filter
- `Mælt hh:mm` uses that same local station/filter

Current:
- map is filtered
- `Núna` dot/status/timestamp can still reflect worst/newest across all Iceland

### Implementation

In `components/weather/WeatherOverviewClient.tsx`:

1. Create a shared filtered Vegagerðin station list:
   - if `vegagerdinData.status !== 'ok'`, empty/null
   - if `vegagerdinRouteFilterIds !== null`, include only those station IDs
   - else include all stations

2. Use this filtered list for:
   - `vegagerdinNewestMeasuredAtIso`
   - `vegagerdinWorstStatus`
   - `overviewStatusCounts` for `activeMode === 'now'`

3. Keep exact route-memory route filter overriding single-place filter.

4. Optional if small:
   - When `activeMode === 'now'`, set `requestedSelection` to nearest Vegagerðin marker instead of nearest Veðurstofan marker.
   - When forecast mode is active, keep nearest Veðurstofan marker.
   - Do not let this optional cleanup delay release.

### Do not do

- No new migration.
- No Google calls from `/vedrid` picker.
- No new map picker/current-location flow.
- No new route-memory data model.
- No unrelated refactors.

### Verification

Run:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/nearestStations.test.ts lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/middleware.test.ts lib/__tests__/weather-public.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts`
- `npm run test:run`
- `npm run build`

### Localhost checks for Stebbi

1. Open `/vedrid`.
2. Keep active mode on `Vegagerðin / Núna`.
3. Select `Egilsstaðir` in `Frá`.
4. Expected: map shows only the local Vegagerðin station/filter.
5. Expected: status pills match that single filtered station.
6. Expected: `Núna` dot/status and `Mælt hh:mm` match the same filtered Vegagerðin station, not the worst/newest station elsewhere in Iceland.
7. Switch to a Veðurstofan forecast time.
8. Expected: map/scrubber use the local Veðurstofan station for Egilsstaðir.
9. Select `Reykjavík` as `Til`.
10. Expected: map and status pills use exact route-memory station set in either direction.
11. Clear route.
12. Expected: full overview returns.
13. Network tab: no `maps.googleapis.com` or `places.googleapis.com` calls from the `/vedrid` route-memory picker.
```

## Localhost checks for Stebbi

Before release candidate:

1. Open `/vedrid`.
2. Select `Egilsstaðir`.
3. With `Núna` active, confirm map, status pills, `Núna` dot, and `Mælt hh:mm` all describe the same selected-place Vegagerðin station set.
4. Switch to forecast mode and confirm Veðurstofan behaves similarly.
5. Select `Reykjavík` as destination and confirm exact route-memory route filter works.
6. Clear route and confirm full overview returns.
7. Keep DevTools Network open and confirm no Google calls are made by the `/vedrid` route-memory picker.

## Release recommendation

After the Vegagerðin/Núna filter consistency fix, this is release-candidate ready from Codex side. No further feature creep before release.
