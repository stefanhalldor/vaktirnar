# 2026-07-21 10:56 - todo-086 v275 - Codex Road Map: vindmörk í stað eftirvagns + status pillur

Created: 2026-07-21 10:56  
Timezone: Atlantic/Reykjavik

## 1. Plan áfangans

Stebbi bað um að hætta við eftirvagnategundar-fókusinn úr v274 og halda frekar sömu lógík og er þegar í `/vedrid` og `/vedrid/ferdalagid`: notandi slær sjálfur inn mörk fyrir `Óþægilegt` og `Hættulegt`, ferðaleiðin reiknast m.v. þau mörk, og undir/við leiðarniðurstöðu birtast sömu status-pillur með `Einfalt` og `Nánar`.

Afmörkun sem Codex tók:
- Breyta aðeins prototype-kóðanum fyrir Road Intelligence route bridge.
- Ekki SQL, env, Supabase, commit, push eða deploy.
- Fjarlægja trailer UI úr prototype-forminu.
- Halda `departureAt` áfram, þar sem það er gagnlegt fyrir ferðaveðurreikninginn og Stebbi bað ekki um að fjarlægja það.
- Gera status-pillurnar virkar sem filter á nýju MapLibre route-weather punktunum.

## 2. Hvað var raunverulega gert

### Eftirvagnaval tekið út úr prototype UI

Í `components/weather/RoadMapPrototypeMap.tsx` var:
- `TrailerKind` import fjarlægt.
- `trailerKind` state fjarlægt.
- `Eftirvagn` select fjarlægt úr formi.
- Submit sendir nú alltaf `trailerKind: 'none'` til `/api/teskeid/weather/travel`.

Þetta þýðir að nýja korttilraunin hagar sér eins og venjulegur akstur, nema vindmörkin koma frá notandanum.

### Vindmörk sett inn í formið

Formið fékk tvo `number` reiti:
- `Óþægilegt`
- `Hættulegt`

Default er tekið úr `resolveThresholds('none')`, sem í dag er `10 / 15`.

Submit validates:
- bæði gildi þurfa að vera finite numbers
- bæði > 0
- bæði <= 40
- `Óþægilegt < Hættulegt`

Ef gildi standast validation fer þetta í travel API sem:

```ts
thresholdOverrides: {
  cautionWindMs: thresholds.cautionWindMs,
  redWindMs: thresholds.redWindMs,
}
```

### Route-weather punktar fá `windDisplayStatus`

Route-weather GeoJSON punktar frá `buildTravelBridgeMapData()` eru nú annotaðir í component áður en þeir fara í MapLibre source:

```ts
windDisplayStatus
```

Þetta notar sameiginlega lógík úr:

```ts
classifyPointWindDisplayStatus(windMs, true, thresholds)
```

Þar með nota route punktarnir sömu fine-grained status-lógík og gamla `/vedrid`/`/ferdalagid` UI:
- `innan-marka`
- `nalgast-othaegindi`
- `othaegilegt`
- `nalgast-haettumork`
- `haettulegt`
- `no_data`

### Route punktalitir tengdir við `WindDisplayStatus`

MapLibre route-weather punktarnir nota nú `windDisplayStatus` fyrir lit:
- grænt: innan marka
- amber: nálgast óþægindi
- appelsínugult: óþægilegt
- rautt: nálgast hættumörk / hættulegt
- grátt: no data / no wind data

### `Einfalt` / `Nánar` + pillur bætt við leiðarniðurstöðu

Eftir vel heppnaðan route-submit birtist nú:
- route summary
- texti sem sýnir hvaða mörk voru notuð
- toggle: `Einfalt` / `Nánar`
- `WindStatusFilterPills`

Pillurnar sía MapLibre route-weather punktana með `map.setFilter()` á `travel-bridge-weather-points`.

Ath: Í prototype birtast pillurnar inni í ferðaleiðarspjaldinu ofan á kortinu, ekki í nýju svæði fyrir neðan kortið, þar sem prototype-kortið er full-screen í `h-screen` layouti. Þetta er meðvituð afmörkun til að forðast stærri layout-breytingu í þessum áfanga.

### Þýðingar

Bætt við:
- `roadMapPrototypeThresholdError`
- `roadMapPrototypeRouteThresholdSummary`
- `roadMapPrototypeShowAll`

Fjarlægt úr prototype-lykli:
- `roadMapPrototypeTrailerLabel`

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/2026-07-21-1045-todo-086-v274-claude-m3a2-trailer-departure.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/windStatusUi.ts`
- `components/weather/WeatherThresholdBar.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/thresholds.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/weather/assessment.ts`
- `lib/weather/types.ts`
- `lib/road-intelligence/travelBridgeMapData.ts`
- `lib/road-intelligence/vegagerdinSegments.ts`
- `messages/is.json`
- `messages/en.json`

## 4. Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-21-1056-todo-086-v275-codex-road-map-threshold-pills.md`

## 5. Skipanir sem voru keyrðar

```powershell
npm run type-check
```

Exit code: 0

```powershell
npm run test:run -- lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts
```

Exit code: 0  
Result: 2 test files passed, 7 tests passed.

```powershell
npm run build
```

Exit code: 0  
Result: build succeeded. Existing lint warnings remain in unrelated files (`app/s/[sessionId]/page.tsx`, `components/landing/Avatar.tsx`, `IcelandOverviewMap.tsx`, `TravelAuditMap.tsx`, `WeatherOverviewClient.tsx`).

## 6. Niðurstöður

Kóðinn type-checkar, targeted Road Intelligence tests eru græn, og production build klárast.

Ný hegðun í prototype:
1. Notandi velur/slær inn `Frá` og `Til`.
2. Notandi getur stillt `Óþægilegt` og `Hættulegt`.
3. Notandi getur valið `Brottfarartími`.
4. `Reikna` kallar áfram í gamla travel API-ið, en nú með custom wind thresholds og án eftirvagnategundar.
5. Leiðin teiknast á nýja MapLibre-kortinu.
6. Route-weather punktar litast eftir `WindDisplayStatus`.
7. Pillur geta síað route-weather punkta.
8. `Einfalt` sýnir þrjár meginstöður; `Nánar` sýnir fine-grained stöðurnar.

## 7. Hvað mistókst eða var sleppt

- Ekki var keyrt localhost/browserpróf af Codex. Stebbi keyrir dev server sjálfur samkvæmt workflow.
- Ekki var tengt við saved user preferences fyrir prototype. Þetta notar bara gildin í formi þegar route er reiknuð.
- Ekki var bætt við sérstöku “Reikna aftur” state ef notandi breytir vindmörkum eftir að route hefur þegar verið reiknuð. Nú gildir leiðarniðurstaðan sem síðasti submit notaði.
- Ekki var unnið í dropdown vandamálinu í þessum áfanga.
- Ekki var bætt við ómalbikað/ómalbikaðir kaflar flaggi.

## 8. Ákvarðanir sem Codex tók

- `departureAt` var haldið áfram, því það er gagnlegt fyrir ETA-veðurreikning og var ekki hluti af því sem Stebbi vildi skipta út.
- `trailerKind` er áfram sent sem `'none'`, því travel API krefst gildis og þessi prototype útgáfa á að vera venjulegur akstur með notendavöldum vindmörkum.
- Pillurnar voru settar í route-spjaldið í prototype, ekki í nýtt svæði fyrir neðan kortið, til að forðast stór layout refactor á full-screen kortinu.
- `windDisplayStatus` fyrir route punktana notar `windMs` úr `summaryForWindow`, ekki `gustMs`. Þetta fylgir núverandi `classifyPointWindDisplayStatus()` contract fyrir `RouteWeatherPoint`. Travel API statusinn sjálfur getur þó enn tekið tillit til hviða í overall `stada`.

## 9. Áhætta sem er enn til staðar

- Mögulegt misræmi: overall route badge (`Innan marka`/`Óþægilegt`/`Hættulegt`) kemur frá travel API og getur tekið hviður/úrkomu með, en pillurnar í þessum áfanga flokka route-punkta eftir `windMs`. Ef við viljum að route-punktapillur noti líka hviður þarf að ákveða hvort hviður séu bornar saman við `redWindMs` eða sér `redGustMs`.
- Ef notandi breytir vindmörkum eftir að leið hefur verið reiknuð, þarf hann að smella `Reikna` aftur til að fá nýtt API mat. UI segir þetta ekki sérstaklega.
- Neðri wind legend fyrir almennu station dots er enn gamla fasta `7 / 15 / 20+` legendið. Þetta skref breytti aðeins route-weather punktunum og route-pillunum.
- `components/weather/RoadMapPrototypeMap.tsx` er enn ótracked samkvæmt `git status`, af því Road Intelligence prototype skráin er ný í þessari vinnulotu.
- `messages/is.json` og `messages/en.json` sýna stóran diff frá Git base vegna eldri ócommittaðra prototype-lykla frá Claude/Codex vinnu. Codex breytti aðeins nýju lyklunum í lok blokkarinnar í þessum áfanga.

## 10. Um ómalbikaða leið / “Gegnum Hólmavík”

Í núverandi kóða er Vegagerðin layerið sem við notum:

```ts
data/faerd/FeatureServer/14
```

Og `FAERD_SEGMENT_OUT_FIELDS` eru:

```ts
OBJECTID
NAFN_LEIDAR
NRVEGUR
NRKAFLI
AST1_LITUR
AST1_NAFN
AST1_FAERD
AST1_SKILTI
TIMIKEYRSLA
```

Þetta gefur okkur núverandi færð/ástand/lit/skilti/keyrslutíma, en ekki staðfesta yfirborðsgerð eins og “malbikað / ekki malbikað” í núverandi data contracti.

Niðurstaða: með þeim Vegagerðargögnum sem prototype notar núna getum við ekki örugglega sagt “þessi leið er ekki malbikuð alla leið”. Það þarf sér discovery á öðru Vegagerðin/Landmælingar/OSM layeri fyrir road surface/vegtegund, eða við geymum curated caution eins og `Gegnum Hólmavík` þar til opna gagnasniðið er fundið.

## 11. Tillaga að næsta skrefi

Næsti stór áfangi sem Claude ætti að taka:

1. Browser-rýna þessa breytingu á localhost.
2. Ákveða hvort route-punktapillur eigi að nota:
   - aðeins `windMs` eins og nú, eða
   - `coalesce(gustMs, windMs)` fyrir Vegagerðarlíka upplifun, eða
   - sér “gust-aware” display classifier með `redGustMs`.
3. Laga eða styrkja dropdown-place picker ef enn birtist ekkert.
4. Byrja sérstakan M3B/M4 discovery-fasa fyrir road surface / unpaved road metadata:
   - athuga hvort Vegagerðin FeatureServer hafi layer fyrir slitlag/vegtegund
   - annars skoða OSM `surface`/`tracktype`/`highway` sem secondary metadata
   - búa til explicit normalized `roadSurfaceStatus` áður en það er notað í route advice
5. Meta hvort prototype eigi að sækja saved wind preferences fyrir innskráðan notanda, eða hvort það bíði þar til route bridge fer inn í product UI.

## 12. Spurningar sem Codex vill að Claude rýni sérstaklega

- Er MapLibre filter-expressionið `['in', ['get', 'windDisplayStatus'], ['literal', statuses]]` rétt fyrir alla browsera/MapLibre 5.24, eða viltu frekar nota legacy property filter form?
- Á route-weather point display status að vera wind-only, eða eigum við að bæta við gust-aware display classifier?
- Á breyting á vindmörkum eftir reiknaða leið að:
  - hreinsa niðurstöðuna,
  - sýna “Reikna aftur”,
  - eða auto-submit-a aftur?
- Á station dot legendið neðst að verða tengt við sömu notendavindmörk strax, eða er það sér M3B/M4 skref?
- Er betra að færa status-pillurnar úr route-spjaldinu niður í sérstakt full-width svæði fyrir neðan map container þegar prototype hættir að vera full-screen?

## 13. Supabase / SQL / auth / production áhrif

- Engin SQL var skrifuð eða keyrð.
- Engar Supabase töflur, RLS policies, grants, functions eða production gögn voru snert.
- Engin auth-breyting.
- Engin env/secrets breyting.
- Enginn commit, push eða deploy.
- API request shape breyttist aðeins í client prototype:
  - áfram `trailerKind`, en fast `'none'`
  - nýtt `thresholdOverrides` object með `cautionWindMs` og `redWindMs`
  - áfram optional `earliestDepartureAt`

## Localhost checks for Stebbi

Prereq:
- Dev server keyrandi hjá Stebba.
- Innskráður notandi með `road-intelligence-v1` feature access.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` í `.env.local` ef route gate krefst þess í núverandi local setup.

Slóð:

```text
http://localhost:3004/auth-mvp/vedrid/road-map-prototype
```

Prófun 1: Eftirvagnareitur farinn
1. Opna slóðina.
2. Staðfesta að route formið sýni `Frá`, `Til`, `Reikna`, `Óþægilegt`, `Hættulegt`, `Brottfarartími`.
3. Staðfesta að enginn `Eftirvagn` select sjáist og enginn raw translation key birtist.

Vænt niðurstaða:
- Enginn eftirvagnareitur.
- Vindmörk defaulta í `10` og `15`.

Prófun 2: Reikna með custom mörkum
1. Setja `Frá = Reykjavík`.
2. Setja `Til = Akureyri` eða `Ísafjörður`.
3. Breyta mörkum t.d. í `10` og `13`.
4. Smella `Reikna`.

Vænt niðurstaða:
- Leið teiknast á korti.
- Route summary sýnir mörkin sem voru notuð.
- Punktar á leiðinni litast eftir vindstöðu.
- Pillur birtast eftir niðurstöðu.

Prófun 3: Einfalt / Nánar
1. Eftir route calculation, skoða `Einfalt`.
2. Skipta í `Nánar`.
3. Smella á pillur.

Vænt niðurstaða:
- `Einfalt` sýnir meginstöður.
- `Nánar` sýnir fínni stöður ef þær eru til í punktunum.
- Þegar pilla er valin hverfa route-weather punktar sem passa ekki við valið.
- `Sýna allt` kemur þegar filter er virkur og endurstillir route-punkta.

Prófun 4: Validation
1. Setja `Óþægilegt = 15`, `Hættulegt = 10`.
2. Smella `Reikna`.

Vænt niðurstaða:
- Engin API keyrsla á að klára.
- Villutexti segir að óþægilegt verði að vera lægra en hættulegt.

Prófun 5: Hólmavík / ómalbikað
1. Prófa leiðir sem fara “Gegnum Hólmavík”.
2. Ekki búast við sjálfvirku “ómalbikað” flaggi í þessari útgáfu.

Vænt niðurstaða:
- Færðarlitir frá Vegagerðinni geta sést ef condition segments eru virk.
- Engin surface/ómalbikað fullyrðing á að birtast enn, því núverandi gögn styðja hana ekki örugglega.

Öryggis-/gagnavarúð:
- Þetta er local prototype og kallar á existing API routes.
- Engin migration eða production-gögn eru snert við þessi browserpróf.
- Ekki deploya fyrr en Claude hefur yfirfarið sérstaklega gust-vs-wind ákvörðunina og UX fyrir “Reikna aftur” eftir breytt mörk.
