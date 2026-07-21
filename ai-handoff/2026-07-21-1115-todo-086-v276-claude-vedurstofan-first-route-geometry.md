# 2026-07-21 11:15 - todo-086 v276 - Claude: Veðurstofan-first + road-following geometry

Created: 2026-07-21 11:15
Timezone: Atlantic/Reykjavik

## Samþykki / umfang

Stebbi gaf opið framkvæmdarleyfi: "Taktu þessa punkta frá mér inn í rýnina á v275 og framkvæmdu
breytinguna ef þú ert ekki ósammála þvi að fara þessa leið."

Punktar Stebba:
1. Byggja kerfið í kringum Vegagerðin (nústöðu) og Veðurstofan (spágildi)
2. Fylgja vegum nákvæmlega — ekki grófa polyline
3. Sleppa met.no frá forgrunni, setja síðar sem öryggislag
4. Íslensku tölurnar (Vegagerðin + Veðurstofan) í forgrunn

Rýni á v275 og skjámynd (Skjámynd 2026-07-21 105910) staðfesti vandann.

Þetta fól í sér kóðabreytingar í travel API route og prototype component.
Ekki fól í sér commit, push, SQL, migration, Supabase eða production-breytingar.

## Rótarorsök vandanna í skjámyndinni

### Vandinn: zigzag route línan

Í `google.server.ts` er `MAX_ROUTE_POINTS = 80`. Þessi tala er notuð BÆÐI til:
1. Þynna polyline í 80 punkta til met.no API kalla (rétt)
2. Gera `routeGeometry.points` með 80 punkta sem fara LÍKA sem `auditPolylinePoints` til að teikna routelínuna

Þetta þýðir að routelínan tengdi 80 punkta yfir 635 km = ~8 km bil. Á MapLibre eru
milli-punktarnir beinar línur þvert yfir land, þar sem vegurinn sveigir.

### Lausnin: `providerMatchingPoints`

`providerMatchingPoints` var þegar til staðar í `RouteGeometry` type:
- Byggð úr FULLRI Google polyline (0 downsampling)
- RDP simplification með 10m epsilon (varðveitir sveigjur, fjörð og passa)
- Cap: ≤1000 punktar
- Notuð til Veðurstofan/Vegagerðin stöðvarsamsvörunar (station matching)
- Annotated: "Dense route geometry for fixed-provider station matching"

Þetta er nákvæmlega rétt geometry fyrir visuell display. Eitt lykyrðabreyting lagar vandann.

## Hvað var gert

### 1. Route fylgir nú vegum (1 lína)

`app/api/teskeid/weather/travel/route.ts`:

```typescript
// Áður:
auditPolylinePoints: routeGeometry.points,

// Eftir:
auditPolylinePoints: routeGeometry.providerMatchingPoints ?? routeGeometry.points,
```

`providerMatchingPoints` er RDP-simplified fulla Google polyline. Hún inniheldur:
- Öll fjörð og beygður með 10m nákvæmni
- Vegarnar á Suðurlandi, um Heiðar, um fjörðina
- Upp að 1000 punktar (600+ km leið fær ~300-500 punkta)

Met.no sampling (80 punktar) er óbreytt — einungis display geometry breyttist.

### 2. Veðurstofan stöðvar sem primary weather display

Nýr `renderVedurstofanStations(layer)` function í `RoadMapPrototypeMap.tsx`:
- Tekur `vedurstofanLayer` úr API svari (extra field í response)
- Síar stöðvar sem hafa gild lat/lon (curated + registry stöðvar)
- Bætir við `'vedurstofan-route-stations'` MapLibre source + layer
- **Teal/cyan lit** (`#0891b2`) — augljóst frávik frá met.no green/yellow/red
- **Radius 9px** — stærra en met.no dots (sem minnkuð, sjá neðar)
- Popup þegar smellt: stöðvaheiti, km frá upphafi, vindur (windSpeedMs frá forecastRows[0]),
  "(gömul gögn)" ef status='stale'

`renderVedurstofanStations` er kallað í `handleRouteBridgeSubmit` rétt á eftir
`renderTravelBridgeResult`. Skilar fjölda stöðva með gildum hnit.

Veðurstofan layer er removeð í `handleClearRoute`.

### 3. met.no dots minnkaðar og de-emphasized

`TRAVEL_POINT_RADIUS_EXPRESSION`:
- Venjulegir punktar: 5.5 → 3 px
- Origin/destination: 7 → 4.5 px
- Highlighted issue: 8 → 5 px

`circle-opacity`: 0.96 → 0.55

met.no dots eru enn sýnilegir (WindStatusFilterPills síar þá enn). Þeir eru nú
viðbótarlag, ekki aðallag. Veðurstofan teal stöðvar eru aðallagið.

### 4. Route summary sýnir Veðurstofan stöðvafjölda

`RouteBridgeSummary` type fékk `vedurstofanStationCount: number`.

Í summary display birtist nýr lína með teal dot og stöðvafjölda:
```
🔵 X Veðurstofan stöðvar á leiðinni
```

Lína birtist aðeins ef `vedurstofanStationCount > 0`.

### 5. Þýðingarlykill

Bætt við í `is.json` og `en.json`:
- `roadMapPrototypeVedurstofanStationCount`:
  "X Veðurstofan stöðvar á leiðinni" / "X Veðurstofan stations on route"

## Skrár breyttar

- `app/api/teskeid/weather/travel/route.ts`
  - `auditPolylinePoints` notar nú `providerMatchingPoints ?? points`

- `components/weather/RoadMapPrototypeMap.tsx`
  - Import: `VedurstofanTravelLayer`
  - `RouteBridgeSummary` type: `vedurstofanStationCount` bætt við
  - `TRAVEL_POINT_RADIUS_EXPRESSION`: minnkuð
  - `circle-opacity` met.no: 0.96 → 0.55
  - `renderVedurstofanStations()`: ný function
  - `handleClearRoute()`: eyðir Veðurstofan layer
  - `handleRouteBridgeSubmit()`: kallar `renderVedurstofanStations`, bætir count í summary
  - Summary: sýnir Veðurstofan stöðvafjölda

- `messages/is.json` + `messages/en.json`
  - `roadMapPrototypeVedurstofanStationCount`

## Skrár skoðaðar

- `Skjámynd 2026-07-21 105910` (route zigzag vandinn)
- `ai-handoff/2026-07-21-1056-todo-086-v275-codex-road-map-threshold-pills.md`
- `lib/road-intelligence/travelBridgeMapData.ts`
- `lib/weather/types.ts` (TravelPlan, DeterministicResult)
- `lib/weather/google.server.ts` (MAX_ROUTE_POINTS, providerMatchingPoints)
- `lib/weather/provider.types.ts` (RouteGeometry)
- `lib/weather/providers/vedurstofanBlend.ts` (VedurstofanTravelLayer type)
- `components/weather/RoadMapPrototypeMap.tsx`

## Skipanir keyrðar

- `npm run type-check`: exit 0
- `npm run test:run -- road-intelligence-place-search-bridge road-intelligence-road-map-places road-intelligence-travel-bridge-map-data`:
  - 3 test files passed, 12 tests passed, exit 0

## Hvað mistókst / var sleppt

- Ekki prófað í browser.
- `vedurstofanLayer` er ekki alltaf til (krefst `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`
  stillingar, eða hún er open by default). Ef null er `vedurstofanStationCount = 0` og
  summary línur birtist ekki — fallback er óbreytt met.no dots.
- Veðurstofan stöðvar sem skortir lat/lon eru síaðar út. Þær birtast ekki á korti en eru enn
  í backend station matching.
- `forecastRows[0]?.windSpeedMs` er fyrsta forecast row. Þetta er EKKI ETA-matched við
  brottfarartíma notanda. Fullt ETA-matching (eins og `computeVedurstofanAssessments` í
  FerdalagidClient) er næsta skref.
- WindStatusFilterPills í summary keyra enn á met.no dots, ekki Veðurstofan. Þetta er
  meðvituð millistaða þar til Veðurstofan ETA-matching og `windDisplayStatus` classification
  er útfærð.
- met.no dots eru enn sýnilegir (55% opacity, 3px radius). Þeir gefa WindStatusFilterPills
  merkingu. Þegar Veðurstofan-first classification er fullbúin má fela met.no lag eða fjarlægja.

## Áhætta / þarf að rýni

### `providerMatchingPoints` gæti verið null á sumar leiðir
Í `RouteGeometry` type er `providerMatchingPoints` optional (`?`). Fallback er `routeGeometry.points`
(80 punktar) sem er sama og fyrr. Engin regression ef hann vantar.

### Veðurstofan stöðvafjöldi vs met.no dot fjöldi
Summary sýnir nú BÆÐI: "80 veðurpunktar" (met.no) og "X Veðurstofan stöðvar". Þetta
gæti ruglað notanda í prototype. Á sér til lausnar þegar met.no lag er falið eða fellt niður.

### Veðurstofan popup sýnir forecastRows[0] vindur
Þetta er næst í tíma, ekki ETA-matched. Fyrir lange leiðir (635 km) gæti næsti row verið
óraunhæfur miðað við brottfarartíma. Betra er `computeVedurstofanAssessments` eins og í
FerdalagidClient. Þetta er M3B verkefni.

### `providerMatchingPoints` response stærð
Fyrir 635 km leið gæti `providerMatchingPoints` haft 300-500 punktar. JSON response stækkar
um nokkra KB. Þetta er ásættanlegt í prototype; gæti þurft compression eða truncation í
production.

### Veðurstofan layer order
`map.moveLayer('vedurstofan-route-stations')` er kallað til að flytja stöðvarnar efst. Þetta
gæti í einstaka tilvikum fara á undan travel-bridge-weather-points. Þarf að prófa í browser.

## Route Intelligence Check

- `providerMatchingPoints` er þegar notað til stöðvarsamsvörunar (Veðurstofan + Vegagerðin).
  Við erum nú að nota sömu geometry til display — samræmur contracts.
- met.no er enn notað í BACKEND assessment (`stada`, `svar`) — við þreptum display, ekki
  backend lógík.
- Vegagerðin road segment layer (lit eftir færð) er óbreyttur — hann er enn á kortinu og
  sýnir current conditions. Þetta er "Vegagerðin for current status" hlutinn.
- Veðurstofan stöðvar eru "Veðurstofan for forecasts" hlutinn (þó aðeins 1. forecast row nú).
- `IcelandRoadmap.md` þarf ekki að uppfæra — þetta er prototype display, ekki canonical segment.

## Design Check

- Teal (#0891b2) er frábrugðinn met.no lit (grár/gult/rautt). Tær liti á hvítan bakgrunn.
- 9px radius vs 3px met.no dots: Veðurstofan eru augljóst "primary" og met.no er "secondary".
- Summary lína með teal dot er viðbótarinfo, ekki aðalniðurstaðan.
- Engin ný hardcoded UI texti — allt í message files.

## Supabase / SQL / auth / production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engar Supabase töflur, RLS, auth, env, secrets breytt.
- Enginn commit, push eða deploy.
- API response stærð eykst lítið eitt vegna `providerMatchingPoints` í `auditPolylinePoints`.
  Production gerir þetta sjálfkrafa við næsta deploy.

## Localhost checks for Stebbi

Setup:
- Dev server hjá Stebba, `http://localhost:3004`
- Innskráður notandi með `road-intelligence-v1` feature access

Slóð: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Próf 1: Route fylgir vegum
1. Slá inn `Reykjavík` → `Egilsstaðir` og smella Reikna.
2. Bera saman við skjámynd 2026-07-21 105910.
3. Vænt: route línan á nú að fylgja vegum (kringum Heiðar, meðfram fjörðum á Austurlandi),
   EKKI beinar línur þvert yfir land.
4. Ef hún er enn gróf: skoðaðu DevTools → Network → POST til `/api/teskeid/weather/travel` →
   Response JSON → `travelPlan.route.auditPolylinePoints` — hversu marga punkta hefur hann?
   (≥200 = providerMatchingPoints virkar, ~80 = enn gamla útgáfan)

Próf 2: Veðurstofan stöðvar á korti
1. Eftir route submit: leita að teal (cyan) hringjum á leiðinni.
2. Þeir eiga að vera stærri en met.no dotin (gráir/litaðir).
3. Smella á teal hring: popup á að sýna stöðvaheiti + km frá upphafi + vindur ef til.
4. Skoða summary neðan við route title: ætti að sýna "X Veðurstofan stöðvar á leiðinni"
   með litlum teal dot.
5. Ef engar teal stöðvar birtast: Veðurstofan access gæti vantað í local env eða engar
   stöðvar eru á þessari leið — þá er `vedurstofanStationCount = 0` og sumarylínun birtist ekki.

Próf 3: met.no dots eru secondary
1. met.no lituðu dotin (grár/gulur/rauður) eiga enn að vera sýnilegir en minni og gagnsærari.
2. WindStatusFilterPills virka enn á þessum dots.
3. Teal Veðurstofan stöðvar yfirgnæfa visuelt met.no dots.

Próf 4: Hreinsa virkar
1. Smella Hreinsa.
2. Bæði met.no dots OG teal Veðurstofan stöðvar hverfa.
3. Kort zoomar til baka á Íslandsyfirlit.

Próf 5: Regression — Vegagerðin lag
1. Vegagerðin litir (grær/gult/rautt/appelsínugult) á vegakerfinu eiga áfram að birtast.
2. Pan/zoom breytir segment litunum eins og áður.
3. Popups á Vegagerðin segments virka.

Próf 6: Önnur leið (Reykjavík → Akureyri eða → Ísafjörður)
1. Þessi leið er enn lengri og sveigjanlegri — route á að fylgja Hringvegi norður,
   EKKI beinni línu yfir miðland.

Mobile:
- Teal stöðvar og met.no dots á 390px: gætu verið þétt. Ásættanlegt í prototype.
- Summary línan með Veðurstofan count á 390px: ætti að passa í panelinn.

## Tillaga að næsta skrefi (M3B aðdragandi)

**Skammtíma (M3A-3)**:
- ETA-matching fyrir Veðurstofan stöðvar: nota `computeVedurstofanAssessments` (eins og
  í FerdalagidClient) til að flokka hverja stöð eftir vindstöðu á ETA (ikke forecastRows[0])
- Lita teal dots eftir vindstöðu (sama litkerfið og met.no dots)
- WindStatusFilterPills gætu þá keyrt á Veðurstofan dots í stað met.no

**Meðaltíma (M3B)**:
- Skoða hvort við getum routað meðfram Vegagerðin road segments án Google
- OSM routing (Valhalla/OSRM) sem open-data valkostur
- Þetta leysir route-geometry vandann án þess að treysta á Google polyline quality
