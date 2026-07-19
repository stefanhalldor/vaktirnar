# 2026-07-19 09:30 - TODO 086 v183 - Claude v182: Vegagerðin/Núna filter consistency

Created: 2026-07-19 09:30
Timezone: Atlantic/Reykjavik

## Hvað var gert

v182 Codex fann eitt medium vandamál: map-layerinn á Vegagerðinni var filteraður á valinn stað en `Núna` selector (dot/status/timestamp) notaði enn global Vegagerðin gögn. Leystu það + optional mode-aware requestedSelection.

### Breyting 1 — filteredVegagerdinStations (medium fix)

Fluttum `nearestVegagerdinStationId` og Vegagerðin filter ID reikning (singlePlaceVegagerdinIds, vegagerdinRouteFilterIds) upp FYRIR `vegagerdinNewestMeasuredAtIso` og `vegagerdinWorstStatus`. Bætti við:

```ts
const filteredVegagerdinStations = useMemo(() => {
  if (!vegagerdinData || vegagerdinData.status !== 'ok') return []
  if (vegagerdinRouteFilterIds === null) return vegagerdinData.stations
  return vegagerdinData.stations.filter(s => vegagerdinRouteFilterIds.has(s.stationId))
}, [vegagerdinData, vegagerdinRouteFilterIds])
```

Báðar memos nota nú `filteredVegagerdinStations` í stað `vegagerdinData.stations`:

- `vegagerdinNewestMeasuredAtIso` → "Mælt hh:mm" í selector
- `vegagerdinWorstStatus` → Núna dot/status litur

`overviewStatusCounts` notaði þegar `vegagerdinRouteFilterIds` filter — óbreytt, rétt.

### Breyting 2 — mode-aware requestedSelection (optional, gert)

`requestedSelection` í WeatherOverviewShell var alltaf `nearestStationRequest` (Veðurstofan), jafnvel þegar Núna/Vegagerðin mode var virkt.

```ts
const nearestVegagerdinRequest: SelectedProviderMarker | null = nearestVegagerdinStationId
  ? { layerId: 'vegagerdin', markerId: nearestVegagerdinStationId }
  : null
const activeRequestedSelection: SelectedProviderMarker | null =
  activeMode === 'now' ? nearestVegagerdinRequest : nearestStationRequest
```

Þegar `Egilsstaðir` er valin í Núna mode: Vegagerðin stöðin opnar sig.
Þegar forecast mode: Veðurstofan stöðin opnar sig.

## Verification

```
npm run type-check           → exit 0
npm run test:run (8 targeted, 207 tests) → exit 0
npm run test:run (full, 116 files, 3376 tests) → exit 0
```

## Breytar skrár

- `components/weather/WeatherOverviewClient.tsx` — filteredVegagerdinStations, activeRequestedSelection

## Localhost checks fyrir Stebbi

1. Opna `/vedrid`.
2. Halda active mode á `Vegagerðin / Núna`.
3. Velja `Egilsstaðir` sem `Frá`.
4. Vænst: kortið sýnir aðeins Egilsstaðir Vegagerðarstöð.
5. Vænst: `Núna` dot/status og `Mælt hh:mm` koma frá þeirri sömu stöð.
6. Vænst: detail card opnar Vegagerðarstöð Egilsstaða (ekki Veðurstofan).
7. Skipta yfir í forecast mode (Veðurstofan spá).
8. Vænst: kortið filterar á næstu Veðurstofustöð hjá Egilsstöðum.
9. Vænst: scrubber punktar endurspegla þá stöð eingöngu.
10. Velja `Reykjavík` sem `Til`.
11. Vænst: exact route-memory filter tekur yfir.
12. Hreinsa leið → fullt yfirlitskort.
13. Network tab: engin Google kall.

## Release status

Allt v180+v182 polish lokið. Tilbúið til release candidate.
