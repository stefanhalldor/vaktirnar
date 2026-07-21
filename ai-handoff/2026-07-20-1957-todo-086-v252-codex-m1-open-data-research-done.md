# Handoff: M1 Open Data Research lokið

Created: 2026-07-20 19:57
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Research implementation handoff for Claude Code review

---

## Skilningur á samþykki

Stebbi samþykkti að Codex skoðaði
`2026-07-20-1940-todo-086-v251-claude-m1-open-data-discovery-handoff` og tæki
næsta afmarkaða skref ef það væri skynsamlegt.

Codex framkvæmdi M1 sem docs-only rannsóknarskammt:

- bjó til `OpenDataResearch.md`
- bætti stuttri vísun í `RoadIntelligenceMap.md`
- bjó til þetta handoff fyrir Claude Code rýni

Þetta fól ekki í sér runtime kóða, SQL, migration keyrslu, commit, push, deploy,
Vercel env breytingu, Supabase breytingu eða production breytingu.

---

## Rýni Codex á v251 handoff

Enginn blocker í v251. Handoffið var vel afmarkað og rétt að M1 sé rannsókn,
ekki product implementation.

Codex myndi samt skerpa á þremur hlutum áður en M2 byrjar:

1. **Ekki velja MapLibre/Leaflet/OpenLayers út frá löngun einni.** M2 þarf að
   sannreyna hvaða tile/service leið virkar best með íslensku open-data áður en
   dependency er sett inn.
2. **Ekki treysta á browser CORS fyrr en það er prófað.** Bæði Vegagerðin og
   Landmælingar geta verið best í gegnum server-side read-only proxy ef browser
   fetch eða tile loading er óstöðugt.
3. **OSM þarf sér varúð.** OSM er frábært auxiliary layer, en ODbL share-alike
   þýðir að Teskeið á ekki að blanda OSM road geometry beint saman við
   proprietary expert/community road graph án sér leyfisrýni.

---

## Hvað var gert

### 1. `OpenDataResearch.md` búið til

Nýtt rannsóknarskjal í repo root:

- skráir Vegagerðin GIS/Gagnaveita sem aðal road-intelligence source
- skráir Landmælingar Íslands sem líklegan besta grunnkorts-source
- skráir OpenStreetMap sem gott auka POI/metadata lag með ODbL varúð
- ber saman Leaflet, MapLibre GL JS og OpenLayers
- mælir með M2A/M2B skrefaskiptingu
- listar official source URLs

Niðurstaða skjalsins:

- M2A: lítið feature-flaggað Leaflet/WMS proof er líklega hraðasta leiðin til að
  sjá eigið open-data kort án þess að skipta Google út.
- M2B: MapLibre/PMTiles/vector proof kemur næst ef M2A staðfestir að gögn,
  attribution og mobile UX séu nógu góð.

### 2. `RoadIntelligenceMap.md` uppfært

Bætt var stuttri línu undir M1:

- fyrsta open-data niðurstaða er í `OpenDataResearch.md`
- mælt er með M2A sem litlu feature-flagguðu open-map proof

---

## Helstu niðurstöður M1

### Vegagerðin

Sterkasti kandídat fyrir road overlay, road segment state og live road context.

Staðfest:

- opinber vefþjónustusíða segir að sum gögn, þar á meðal veður og færð,
  uppfærist á nokkurra mínútna fresti
- Vegagerðin er með skýra vefþjónustuskilmála
- ArcGIS REST data folder er til á `vegasja.vegagerdin.is`
- `data/vegakerfi/MapServer` inniheldur vegi, vegflokka, jarðgöng,
  stöðvasetningu, akbrautir og rampa
- `data/vegakerfi/MapServer` styður JSON og GeoJSON query formats
- `data/faerd/FeatureServer` inniheldur færð, vegavinnu og þungatakmarkanir
- Færð gagnasnið notar `IdButur` sem route/segment identifier og gefur sterka
  vísbendingu um hvernig road segment state gæti virkað
- Vegagerðin skjölin vara við að sækja hnit leiða of oft
- núverandi Teskeið kóði notar þegar
  `https://gagnaveita.vegagerdin.is/api/vedur2014_1`

Attribution sem þarf að passa:

`Byggt á gögnum frá Vegagerðinni.`

### Landmælingar Íslands

Sterkasti kandídat fyrir opið grunnkort.

Staðfest:

- LMÍ býður WMS, WFS og WMTS þjónustur
- GeoServer er aðgengilegur og sýnir mörg workspaces/layers
- opin gögn LMÍ eru undir Creative Commons Attribution 4.0
- attribution þarf að nefna Landmælingar Íslands, gagnasafn og hvenær gögn voru
  sótt

Áfram óstaðfest:

- nákvæmur layer/style sem hentar best í Next.js/mobile prototype
- hvort direct browser tile loading virkar vel eða þarf proxy
- hvort MapLibre getur nýtt ákveðin LMÍ layers beint eða hvort Leaflet/WMS er
  betra fyrst

### OpenStreetMap

Gott sem auxiliary data layer, ekki fyrsta truth layer fyrir Teskeiðar-road-graph.

Staðfest:

- OSM er undir ODbL
- attribution þarf alltaf þegar OSM gögn eru notuð public
- interactive map attribution á venjulega heima í eða við kortið
- OSM býður ekki ókeypis map API/tile hosting fyrir þriðju aðila

Varúð:

- ef OSM gögn eru aðlöguð eða sameinuð í derivative database getur share-alike
  krafa átt við
- Teskeiðar expert/community data þarf að vera skýrt aðskilið ef OSM er notað

---

## Skrár skoðaðar

Local:

- `ai-handoff/2026-07-20-1940-todo-086-v251-claude-m1-open-data-discovery-handoff.md`
- `RoadIntelligenceMap.md`
- `IcelandRoadmap.md`
- `package.json`
- `lib/weather/providers/vegagerdinCurrent.server.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `app/api/cron/warm-vegagerdin/route.ts`
- `ai-handoff/README.md`

Web/official sources:

- Vegagerðin vefþjónustur:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur
- Vegagerðin skilmálar:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/skilmalar-vefthjonustur
- Vegagerðin ArcGIS data folder:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data
- Vegagerðin vegakerfi MapServer:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer
- Vegagerðin færð FeatureServer:
  https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer
- Vegagerðin færð gagnasnið:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/faerd-gagnasnid
- Vegagerðin vefmyndavélar:
  https://www.vegagerdin.is/vegagerdin/gagnasafn/vefthjonustur/vefmyndavelar
- Landmælingar Íslands vefþjónustur:
  https://www-gamli.lmi.is/landupplysingar/vefthjonustur/
- Landmælingar Íslands GeoServer:
  https://gis.lmi.is/geoserver/web/
- Landmælingar Íslands leyfi:
  https://www-gamli.lmi.is/landupplysingar/leyfi-fyrir-gjaldfrjals-gogn/
- OpenStreetMap copyright:
  https://www.openstreetmap.org/copyright/en-US
- OSMF attribution guidelines:
  https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- ODbL:
  https://opendatacommons.org/licenses/odbl/

---

## Skrár breyttar

- `OpenDataResearch.md` - ný M1 rannsóknarniðurstaða
- `RoadIntelligenceMap.md` - stutt vísun í M1 niðurstöðuna
- `ai-handoff/2026-07-20-1957-todo-086-v252-codex-m1-open-data-research-done.md` - þetta handoff

---

## Skipanir keyrðar

- `Get-Content -Encoding UTF8 ai-handoff/2026-07-20-1940-todo-086-v251-claude-m1-open-data-discovery-handoff.md`
- `Get-Content -Encoding UTF8 RoadIntelligenceMap.md`
- `Get-Content -Encoding UTF8 IcelandRoadmap.md`
- `git status --short`
- `rg -n "gagnaveita|vegagerdin|vegasja|lmi|openstreetmap|MapLibre|Leaflet|OpenLayers|arcgis" app components lib package.json messages sql`
- `Get-Content -Encoding UTF8 lib/weather/providers/vegagerdinCurrent.server.ts`
- `Get-Content -Encoding UTF8 lib/weather/providers/vegagerdinCurrentTypes.ts`
- `Get-Content -Encoding UTF8 app/api/cron/warm-vegagerdin/route.ts`
- `Get-Content -Encoding UTF8 package.json`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `rg -n "Recommendation Fyrir M2|M2A|Vegagerðin GIS|Landmælingar Íslands|OpenStreetMap|Sources|OpenDataResearch" OpenDataResearch.md RoadIntelligenceMap.md`
- `git diff --check -- OpenDataResearch.md RoadIntelligenceMap.md`
- `git diff -- OpenDataResearch.md RoadIntelligenceMap.md`
- `Get-Date -Format "yyyy-MM-dd HH:mm"`

Validation:

- `git diff --check -- OpenDataResearch.md RoadIntelligenceMap.md` - exit code 0

Ekki keyrt:

- `npm run type-check`
- `npm run test:run`
- `npm run build`

Ástæða: docs-only breyting, enginn runtime kóði.

---

## Route intelligence check

- Snertir alla Road Intelligence stefnu, sérstaklega eigin open-data kortalag.
- Ný þekking á heima í `OpenDataResearch.md` og vísað er í hana frá
  `RoadIntelligenceMap.md`.
- Lausnin er provider-neutral: Vegagerðin, LMÍ og OSM eru metin sem mismunandi
  layers, ekki bundin við eitt UI.
- Engin canonical segment, station matching regla, cache lykill eða test fixture
  var bætt við í þessum skammti.
- Privacy er óbreytt: engin user gögn, engin GPS gögn, engar nýjar töflur,
  engin route history.
- Google er áfram óbreytt sem núverandi production map/provider þar til sérstakt
  M2 prototype er samþykkt.

---

## Hvað var ekki gert

- Enginn nýr kóði.
- Engin dependency bætt við.
- Engin map prototype route.
- Engin SQL eða migration.
- Engin live gagnaveita fetch úr local appi.
- Enginn CORS header test með curl/browser.
- Engin leyfisráðgjöf frá lögfræðingi. Þetta er tæknilegt rannsóknaryfirlit,
  ekki lagalegt álit.

---

## Tillaga að næsta skrefi

Codex mælir með M2A, mjög litlu feature-flagguðu proof:

- route: mögulega `/auth-mvp/vedrid/road-map-prototype`
- gate: authenticated + `road-intelligence-v1`
- renderer: Leaflet fyrst, nema Claude sjái sterka ástæðu til að fara beint í
  MapLibre
- base: LMÍ WMS/WMTS eða annað opinbert raster grunnkort
- overlay: eitt Vegagerðin layer, helst færð/vegakerfi sem read-only proof
- persistence: engin
- user GPS: engin
- production `/vedrid`: óbreytt

Ástæðan: M2A svarar praktísku spurningunum fljótt:

- virka tile/layer slóðirnar í browser?
- þarf proxy?
- er attribution hægt að setja fallega og rétt?
- er performance ásættanlegt á mobile?
- finnst Stebba þetta líða eins og grunnur að eigin kortalagi?

---

## Spurningar fyrir Claude Code

1. Er Claude sammála að M2A eigi að vera Leaflet/WMS proof fyrst, eða er betra
   að fara beint í MapLibre?
2. Hvaða LMÍ layer er best fyrir fyrsta grunnkortið?
3. Hvaða Vegagerðin layer er best fyrir fyrsta overlay: `vegakerfi`,
   `faerd`, eða `faerdferlar2017_1` WFS?
4. Þarf M2A að nota server-side proxy strax til að einangra CORS/rate-limit, eða
   má byrja með direct browser fetch í dev?
5. Á að búa til `DataLicenses.md` strax í M2A svo attribution og leyfi séu
   canonical áður en UI fer að nota gögnin?

---

## Localhost checks for Stebbi

Þessi Codex skammtur er docs-only. Það er ekkert nýtt UI að prófa á localhost.

Það sem Stebbi getur skoðað:

1. Opna `OpenDataResearch.md` í editor.
2. Lesa `Recommendation Fyrir M2`.
3. Staðfesta hvort tillagan "M2A Leaflet/WMS proof fyrst, MapLibre síðar" passi
   vörutilfinninguna.
4. Opna `RoadIntelligenceMap.md` og staðfesta að M1 vísi í
   `OpenDataResearch.md`.

Það má ekki prófa eða keyra sem hluta af þessu:

- engin SQL
- enginn deploy
- engin Vercel env
- enginn production fetch/proxy
- engin ný dependency install nema Stebbi samþykki M2 sérstaklega

---

## Óvissa / þarf að staðfesta

- CORS var ekki staðfest með browser eða curl.
- Nákvæmur LMÍ WMTS/WMS layer fyrir M2A er ekki valinn.
- Nákvæmur Vegagerðin overlay layer fyrir M2A er ekki valinn.
- OSM derived-database mörk þarf að rýna sérstaklega áður en OSM verður hluti af
  varanlegum Teskeiðar-road-graph.
- Þetta er ekki lagalegt álit, aðeins tæknileg og vöruleg rannsókn.
