# RoadIntelligenceMap.md - Eigið Teskeiðar Kortalag Og Live Road OS

Þetta skjal fangar næstu stefnu úr Road Intelligence pælingunum: Teskeið á ekki
bara að sýna betra veðurkort ofan á Google. Teskeið á smám saman að byggja eigið
road-intelligence kortalag fyrir Ísland þar sem vegkaflar, aðstæður, spá,
raungildi, varasamir kaflar og notendapúls tengjast saman.

Google Maps og Google Routes mega áfram vera provider, samanburður og fallback á
meðan. Þau eiga ekki að vera langtíma truth layer fyrir íslenska vegaskilninginn.

## Kjarnahugmynd

Google veit hvar vegurinn er.

Teskeið á að skilja hvað vegurinn þýðir núna og næstu klukkustundir.

Notandinn á ekki bara að fá svarið "hvernig kemst ég þangað?". Hann á að fá svar
við spurningum eins og:

- Er skynsamlegt að fara núna?
- Hvaða leið er öruggust miðað við vind, hviður, færð og ökutæki?
- Hvar verður erfiðasti kaflinn þegar ég kem þangað?
- Borgar sig að bíða?
- Hvar er næsti góði stoppistaður ef aðstæður versna?

## Layer 1 - Opið Grunnkort

Fyrsta rannsóknarskref er að staðfesta hvaða opin gögn geta borið grunnkortið:

- Vegagerðin: ArcGIS REST, FeatureServer, MapServer, WMS, WMTS, WFS, road network,
  road condition layers, lokanir, þjónusta, myndavélar, mælistöðvar og
  umferðarteljarar.
- Landmælingar Íslands: WMTS/WMS/raster/vector, terrain, hillshade, labels,
  náttúruleg kennileiti og cache/attribution reglur.
- OpenStreetMap: POI, bensín, hleðsla, þjónusta, tjaldsvæði, heimilisföng og
  auka metadata sem opinber gögn ná ekki alltaf yfir.

Markmið fyrsta prototype er ekki að skipta Google út í production, heldur að
sanna að við getum renderað eigið íslenskt kortalag bak við feature flagg.

## Layer 2 - Iceland Road Graph

Langtíma kjarninn er eigin road graph. Hver mikilvægur vegkafli verður entity,
ekki bara lína á korti.

Dæmi um `road_segment`:

- `id`
- `geometry`
- `road_number`
- `road_name`
- `surface`
- `road_class`
- `speed_limit`
- `length_m`
- `bridge`
- `tunnel`
- `mountain_pass`
- `gravel`
- `single_lane`
- `one_lane_bridge`
- `seasonal`
- `winter_service`
- `wind_sensitive`
- `known_crosswind_area`
- `crosswind_direction`
- `fog_prone`
- `snow_prone`
- `tourist_route`
- `verified`

Þetta tengist beint við núverandi `lib/iceland-routes/` vinnu. Static registry
sem er að koma inn núna er fræið að stærri road graph.

## Layer 3 - Segment State

Ofan á hvern vegkafla reiknar Teskeið stöðu sem getur breyst yfir daginn:

- spá frá Veðurstofu
- raungildi og hviður frá Vegagerðinni
- færð og lokanir
- vindnæmi og vindátt miðað við vegstefnu
- skyggni
- myndavélar
- umferð
- framkvæmdir
- notendapúls
- sérfræðireglur
- confidence og freshness
- overall travel score

Þetta er mikilvægi munurinn: Veðrið á ekki bara að vera punktar á korti. Punktar,
leiðir og púlsgögn eiga að enda sem segment intelligence.

## Layer 4 - Sérfræðilag

Sérfræðilagið geymir þekkingu sem almenn kort hafa ekki:

- hvar koma skyndilegar hviður oft í norðanátt?
- hvaða brýr eða opnir kaflar eru slæmir fyrir eftirvagna?
- hvaða fjallvegir eru oft varasamir þó Google leggi þá til?
- hvaða staðir versna fyrr en almenn spá gefur til kynna?

Þetta getur byrjað hand-curated í `lib/iceland-routes/` og færst síðar í
stýrðan gagnagrunn þegar líkanið er orðið stöðugt.

## Layer 5 - Community Layer

Notendur geta síðar sent inn aðstæður sem festast við vegkafla:

- miklar hviður
- hálka
- lélegt skyggni
- steinar á vegi
- þung umferð
- bilaður hleðslustaður
- stoppistaður fullur eða lokaður

Allt slíkt þarf expiry, moderation, abuse-varnir og privacy-rýni. Fyrsta útgáfa
á að lesa, reikna og sýna segment state áður en hún fer að treysta á
notendainnsendingar sem öryggisgögn.

## Layer 6 - Live Road OS

Live Road OS er langtímasýnin: Teskeið verður ferðafélagi sem skilur stöðu
notandans á leiðinni.

Síðar getur kerfið vitað:

- núverandi GPS staðsetningu
- núverandi vegkafla
- akstursstefnu
- ETA á næstu vegkafla
- ökutækjaprófíl, t.d. eftirvagn, mótorhjól eða vörubíl
- vindnæmi notandans
- veðurglugga framundan
- næsta skynsamlega stopp

Þessi sýn er ekki navigation til að byrja með. Hún er ákvörðunaraðstoð fyrir
ferð um Ísland.

## Fyrstu Framkvæmdarskref

### M0 - Stefna læst

Þetta skjal og `IcelandRoadmap.md` skilgreina að við stefnum í eigið
Road Intelligence kortalag. RI-0 til RI-3 eru ekki lokaafurð, heldur fyrsta
feature-flaggaða leiðin til að sýna notanda að Teskeið þekki leiðir.

### M1 - Open Data Discovery

Næsti tæknilegi rannsóknarskammtur:

- finna nákvæmar Vegagerðin GIS endpoints
- finna Landmælingar grunnkort sem hentar vefappinu
- meta OSM sem viðbótarlag
- skrá leyfi, attribution, cache-reglur, hraða og uppfærslutíðni
- skrifa stutta niðurstöðu í þetta skjal áður en provider er valinn

**Byrjað (v252 - first open-data research):**

Fyrsta niðurstaða er skráð í `OpenDataResearch.md`. Þar er mælt með M2A sem
lítið feature-flaggað open-map proof áður en Google kortinu er skipt út í
production.

**Byrjað (v254 - source registry og CORS preflight):**

Attribution og open-data source metadata eru komin í `DataLicenses.md` og
`lib/iceland-routes/openDataSources.ts`. Fyrsta CORS preflight bendir til að
LMÍ basemap geti farið beint í browser, en Vegagerðin ArcGIS overlay þurfi
líklega same-origin allowlisted proxy.

### M2 - Feature-Flagged Map Prototype

Búa til sér prototype leið, t.d. `/auth-mvp/vedrid/road-map-prototype`, aðeins
fyrir notendur með `road-intelligence-v1`.

Prototype má prófa:

- MapLibre GL JS
- Leaflet
- OpenLayers
- opið raster grunnkort
- einfalt vector road overlay
- núverandi Veðurstofu/Vegagerðar punkta ofan á sama korti

Þetta á ekki að replace-a núverandi `/vedrid` kort fyrr en performance, UX,
leyfi og mobile hegðun eru staðfest.

### M3 - Segment State Prototype

Velja 10-20 þekkta vegkafla og reikna einfalt segment state:

- nearest Veðurstofu forecast stations
- nearest Vegagerðin observations
- hviður notaðar þegar þær eru til
- caution metadata úr `lib/iceland-routes/cautions.ts`
- confidence/freshness

### M4 - Route Projection

Mappa route-intelligence niðurstöðu yfir vegkafla:

- hvaða segments snertir leiðin?
- hvaða segment verður slæmast næstu klukkustundir?
- hvaða alternative sleppir við slæma segmentið?
- hvað sýnist notanda sem einföld, mannamálsleg ráðlegging?

### M5 - Eigið Routing Experiment

Þegar graph er nógu góður:

- prófa OSRM, Valhalla eða GraphHopper fyrir Ísland
- bera saman við Google Routes
- mæla route quality, kostnað, cache, performance og edge cases
- halda Google sem fallback þar til eigið routing stenst íslensk regression tests

## Tengsl Við Núverandi RI-0 Til RI-3

RI-0 til RI-3 eru enn rétt næsta release-skref:

- feature flagg verndar tilraunina
- static `lib/iceland-routes/` registry er fræið að road graph
- `/vedrid` preview sýnir að Teskeið þekkir mannamálslegar leiðir
- engin raw Google gögn eru vistuð sem canonical grunnur

En það vantar að hugsa þetta sem inngang að eigin kortalagi. Þessi skrá fyllir
það gat og setur næstu vinnu í rétta stefnu.

## Non-Goals Fyrir Næsta Release

- Ekki skipta Google kortinu út í production.
- Ekki keyra nýjar migrations fyrir road graph án sér samþykkis.
- Ekki geyma GPS feril notanda.
- Ekki byggja AI ráðleggingar ofan á óstaðfest segment state.
- Ekki birta "öruggt/óöruggt" sem opinbera staðhæfingu.

## Áhætta Og Rýni

- Open-data leyfi og attribution þarf að staðfesta áður en kort eða tiles fara
  í production.
- Ef við notum OSM þarf að huga að ODbL og hvernig derived databases eru meðhöndluð.
- MapLibre/vector-tile leið getur orðið stórt platform-verkefni, svo prototype
  þarf að vera þröngt og feature-flaggað.
- Segment scoring má ekki verða falskt öryggi. Fyrstu útgáfur eiga að merkja
  confidence og segja "Teskeið metur" frekar en gefa bindandi öryggisyfirlýsingar.
