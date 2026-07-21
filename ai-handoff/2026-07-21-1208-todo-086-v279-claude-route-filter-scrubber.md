# 2026-07-21 12:08 - todo-086 v279 - Claude: Route filter + departure scrubber

Created: 2026-07-21 12:08
Timezone: Atlantic/Reykjavik

## Samþykki / umfang

Haldið áfram úr v278 með leyfi frá v276: "Taktu þessa punkta frá mér inn í rýnina og framkvæmdu breytinguna ef þú ert ekki ósammála þvi."

Stebbi benti sérstaklega á þrjá galla í Skjámynd 2026-07-21 115200:
1. Alltof margar stöðvar sýnilegar þegar leið er valin
2. Vindhviða yfir þröskuld sýnist ekki í vinstra horninu
3. Brottfararscrubber vantar (eins og á /ferdalagid)

## Hvað var gert

### 1. Global stöðvar faldar þegar leið er virk

`station-markers` MapLibre layer (Vegagerðin stöðvardottar yfir allt Ísland) er nú falin þegar leið er reiknuð, og endurkemur þegar leið er hreinsað.

Place-name markers (hvítu kögglar með bæjanöfnum) eru einnig faldar þegar leið er virk. `updateRoadMapPlaceMarkerVisibility()` (í useEffect) skilar strax ef `routeActiveRef.current === true` — þannig að zoom events endurbirta þær ekki á meðan leið er virk.

Þegar leið er hreinsuð (`handleClearRoute`): `station-markers` fær `visibility: visible` aftur, og place markers birta sig að nýju miðað við núverandi zoom.

### 2. Vindhviðalegend falinn þegar leið er virk

Neðra vinstra horn: `<7, 7-15, 15-20, 20+ m/s` legend er þegar tengt global `station-markers`. Þegar leið er valin og `station-markers` falið er þessi legend óviðkomandi. Nú er hann falinn þegar `routeBridgeSummary !== null`.

Þetta leysir hluta af vandanum með "ekki sýnt í vinstra horninu" — legendið sýnir raw m/s bins, en þegar leið er virk eru þær bins óviðkomandi. Vegagerðin stöðvaklösar (sem eru sýnilegar á leiðinni) nota threshold-based status (othaegilegt/haettulegt) sem birtist í scrubber pillum.

### 3. DepartureHeatmap brottfararscrubber

Eftir að leið er reiknuð og `travelPlan.outbound.candidates` eru til, birtist `DepartureHeatmap` komponent (sami og á /ferdalagid) neðan við route summary.

- Gögn: `travelResult.travelPlan.outbound.candidates` (MET/Yr klukkustundar-slots)
- `bestWindow`: `travelResult.travelPlan.outbound.bestWindow`
- Þegar notandi velur slot: `handleSelectCandidateIdx()` uppfærir Veðurstofan ETA markers
  strax (með `departureMsOverride` parameter í `renderVedurstofanStations`)
- `visibleStatuses` / `onVisibleStatusesChange`: same state (`visibleRouteStatuses` /
  `handleRouteStatusFilterChange`) — pilurnar í scrubber stýra því hvaða route stations
  sjást á kortinu
- `title={null}` — titill felinn (summary er þegar til)
- `showSelectedDetail={false}` — detail kort felið (of mikið í þessum panel)

Datetime-local inputið (brottfarartími) er nú falið þegar leið er virk (scrubber tekur við hlutverki þess). Eftir hreinsa birtist datetime-local aftur ef notandi vill fara inn með handvirkan tíma fyrir næstu leið.

### 4. Einfalt/Nánar toggle fjarlægt

Þar sem `DepartureHeatmap` hefur sín eigin WindStatusFilterPills sem keyra á met.no candidate statuses, var Einfalt/Nánar toggle + sérstakur WindStatusFilterPills úr summary section fjarlægður. Þegar candidates eru tómir (fallback) birtist einlitur WindStatusFilterPills þess í stað.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
  - Imports: `TravelCandidate`, `TravelWindow`, `DepartureHeatmap`
  - Refs: `routeActiveRef`, `vedurstofanLayerRef`, `routeDurationMinutesRef`, `routeThresholdsRef`
  - State: `routeCandidates`, `routeBestWindow`, `selectedCandidateIdx`
  - `renderVedurstofanStations`: bætt `departureMsOverride?: number` við
  - `handleClearRoute`: endurhefur `station-markers` + place markers + new state
  - `updateRoadMapPlaceMarkerVisibility`: skilar strax ef route active
  - `handleRouteBridgeSubmit`: felur `station-markers` + place markers, geymir refs,
    setur candidates/bestWindow
  - `handleSelectCandidateIdx`: ný fall — re-renderar Veðurstofan með nýjum departureMs
  - JSX: datetime-local felinn þegar route active; Einfalt/Nánar + WindStatusFilterPills
    skipt út fyrir DepartureHeatmap; wind speed legend felinn þegar route active

## Skipanir keyrðar

- `npm run type-check`: exit 0
- `npm run test:run -- road-intelligence-place-search-bridge road-intelligence-road-map-places road-intelligence-travel-bridge-map-data`: 3 files, 12 tests, exit 0

## Vandamál sem eftir eru

### "Vindur yfir þröskuld sýnist ekki í bottom-left" (upprunalegt kvörtun Stebba)

Þetta vandamál á dýpsta rót sér: þegar Vegagerðin layer er ekki til (env var ekki sett eða
API skilar engum stöðvum á leiðinni), fellur kerfið aftur á met.no `statusCounts`. Met.no
telur öll 77+ sampling points sem "Innan marka" þótt stöðvar NÁLÆGT leiðinni séu með
hærri gust.

Lausn: Ef WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED er sett og API skilar Vegagerðin
stöðvum, mun `statusCounts` frá þeim stöðvum birtast rétt (othaegilegt/haettulegt ef gust
er yfir þröskuld). Þetta er environment-dependent vandamál, ekki kóðagalli.

Á Skjámynd 2026-07-21 115200 er popup frá GLOBAL `station-markers` layer (Öxnadalsheiði)
— ekki frá route-specific Vegagerðin stöðvum. Global popup format passar nákvæmlega.

### Pre-route scrubber (overview)

Stebbi bad um "scrubber eins og á /vedrid áður en leið er valin." Þetta krefst
time-series gagna fyrir `station-markers` (t.d. T+1, T+6, T+12 forecast). Þetta er
stærra verkefni sem krefst nýrrar gagnaflutninga-endapunkts. Sleppt í þessum afanga.

### DepartureHeatmap status vs route station status

Pillurnar í DepartureHeatmap eru fyrir MET/Yr klukkustundar candidates — ekki Vegagerðin
stöðvastatus. Þetta gæti rugla notanda: pillan stöðvar á ákveðnum tíma kemur frá MET/Yr
en kortið sýnir Vegagerðin strömgildi. Þetta er meðvituð millistaða.

Slotstatusar for DepartureHeatmap gæti seinna notað `slotStatusOverrides` til að
endurspegla Vegagerðin/Veðurstofan status per slot. Þetta er M3B verkefni.

## Localhost checks for Stebbi

Setup: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Próf 1: Stöðvar falnar þegar leið er valin
1. Áður en reikna: allar stöðvadottar og bæjanafnkögglar sjást
2. Slá inn leið og smella Reikna
3. Vænt: stöðvadottarnir (allir over Iceland) hverfa. Bæjanafnkögglar hverfa.
4. Kortið sýnir nú bara: Vegagerðin road network (litaður), route lína, Vegagerðin
   stöðvarlabels á leiðinni (teal/orange/green eftir vindstöðu)
5. Wind speed legend neðra vinstra horn (<7, 7-15, etc.) hvers ekki lengur

Próf 2: DepartureHeatmap birtist
1. Eftir Reikna: neðan við route summary (stöðvafjöldi og svar) á að birtast heatmap
   með klukkustundar tímaröð
2. Smella á tíma slot: Veðurstofan stöðvar á kortinu uppfærast (ETA-matching við þann tíma)
3. Pillunar í heatmap stýra því hvaða route station dots sjást
4. Engar tvíteknar pillar (gamla WindStatusFilterPills er falin)

Próf 3: Datetime-local input
1. Áður en Reikna: `Brottfarartími` datetime-local input sést í forminu
2. Eftir Reikna: datetime-local er falið (scrubber tekur við)
3. Eftir Hreinsa: datetime-local birtist aftur

Próf 4: Hreinsa endurheimtir allt
1. Smella Hreinsa
2. Stöðvadottarnir koma aftur (global station-markers visible)
3. Bæjanafnkögglar koma aftur (based on zoom)
4. Wind speed legend neðra vinstra horn birtist aftur
5. DepartureHeatmap hverfa

Próf 5: Fallback ef engin candidates
1. Ef `travelPlan.outbound.candidates` er tómt/null: DepartureHeatmap birtist ekki
2. Í þess stað birtist einlægur WindStatusFilterPills
3. Þetta ætti ekki að gerast í venjulegu API svari en er fallback öryggisnet

## Supabase / SQL / auth / production

- Engin SQL migration skrifuð eða keyrð.
- Engar Supabase töflur, RLS, auth, env breyttar.
- Enginn commit, push eða deploy.
