# TODO 086 / v222 - Claude pre-release handoff - v221 modification done

Created: 2026-07-20 08:51
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi samþykkti með `workflow`: þegar smellt er á Veðurstofastöð á `/vedrid` opnast detail spjald Veðurstofustöðvarinnar (eins og í dag), og á því spjaldi birtast 2 nálægustu Vegagerðarstöðvar með raunmælingum og einni athugasemd, smellanleg til að opna púls þeirrar stöðvar.

Þetta felur EKKI í sér: map overlay eins og Codex v221 lagði til, commit, push, deploy.

## Hvað var gert

### Breyting frá Codex v221 plan

Codex v221 lagði til overlay á kortið sjálft með `renderSelectedOverlay` render prop í `IcelandOverviewMap`. Stebbi bað um einfaldar lausn: halda núverandi detail spjaldi Veðurstofustöðvarinnar og bæta Vegagerðarhluta við neðst.

Ekkert var gert af v221 plan (engar breytingar á `IcelandOverviewMap`, `WeatherOverviewShell`, eða overlay props).

### components/weather/WeatherOverviewClient.tsx

1. **Import** bætt við: `findNearestStations` frá `@/lib/weather/nearestStations`

2. **`NearbyVegagerdinEntry` type** skilgreindur (local type)

3. **`NearbyVegagerdinRow` component** bætt við (rétt fyrir `StationDetail`):
   - Sýnir stöðvarheiti + fjarlægð (km)
   - Sýnir vindur/hviða úr vegagerdinData (þegar til)
   - Sækir eina athugasemd frá `/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview` með `useEffect` + `AbortController`
   - Hleðsluástand: sýnir ekkert meðan hleðst (engin snúningur)
   - Tómt ástand: "Engar athugasemdir"
   - Smellanlegt "Opna stöð" (vegagerdinPulseHref)

4. **`StationDetail`** fær `nearbyVegagerdin?: NearbyVegagerdinEntry[]` prop og `tOv` translation
   - Nýr hluti neðst í spjaldinu (fyrir `</ProviderStationPreviewCard>`)
   - Titill + NearbyVegagerdinRow fyrir hverja stöð

5. **`renderPostMap` í Veðurstofan layer** reiknar nearbyVegagerdin:
   - Krefst `selectedStation.lat/lon` og `vegagerdinData.status === 'ok'`
   - `findNearestStations` finnur 2 nálægustu Vegagerðarstöðvar (haversine)
   - `pulseHref` notar `stationPulseReturnBase?stationId=<vedurstofanId>` sem returnTo

### messages/is.json + messages/en.json

Nýir lyklar undir `teskeid.vedrid.overview`:
- `nearbyVegagerdinTitle` — "Nálægar Vegagerðarstöðvar"
- `nearbyVegagerdinDistance` — "{km} km"
- `nearbyVegagerdinGust` — "hviða {value} m/s" (compact, not the long version)
- `nearbyVegagerdinNoWind` — "Engar vindmælingar"
- `nearbyVegagerdinNoNote` — "Engar athugasemdir"

Endurnýtir `conditionsFeedOpenStation` ("Opna stöð") og `vegagerdinMeanWind` sem eru þegar til.

## Type-check

Exit 0 — hrein.

## Skrár breyttar

- `components/weather/WeatherOverviewClient.tsx`
- `messages/is.json`
- `messages/en.json`

## Ekki gert

- Engar breytingar á `IcelandOverviewMap`, `WeatherOverviewShell`, `VegagerdinStationDetail`
- Engin overlay á kortið
- Engin commit, push, deploy

## Localhost checks

1. Opna `/auth-mvp/vedrid` sem innskráður notandi
2. Ganga úr skugga um að Vegagerðin "Núna" lag sé virkt
3. Smella á Veðurstofastöð
4. Gáa hvort detail spjald Veðurstofustöðvarinnar opnist
5. Neðst í spjaldinu: "Nálægar Vegagerðarstöðvar" með 2 stöðvum
6. Hverja stöð á að sýna: heiti, fjarlægð (km), vindur/hviða, og athugasemd eða "Engar athugasemdir"
7. "Opna stöð" hlekkur á að fara á /auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]
8. Ef Vegagerðin gögn eru ekki tiltæk (t.d. í spáham eingöngu): "Nálægar Vegagerðarstöðvar" hlutinn á ekki að birtast (0 stöðvar → ekki sýnt)
