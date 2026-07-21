# Handoff: M1 Open Data Discovery — næsta skref

Created: 2026-07-20 19:40
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Research + implementation handoff for Codex

---

## Staða

Road Intelligence RI-0 til RI-3 er released (`6c25d76`).

Næsta skref samkvæmt `RoadIntelligenceMap.md` M1 er open-data discovery og
leyfisrýni. Þetta er **rannsóknarskammtur, ekki implementation**. Engar production
breytingar eru samþykktar hér.

Stebbi þarf að samþykkja sérstaklega áður en nokkuð opið gagnauppspretta fer í
production eða nýjar SQL-töflur eru búnar til.

---

## Markmið M1

Skrá eftirfarandi fyrir hverja gagnauppsprettu sem við viljum nota:

1. Hvaða endpoints/services eru í boði?
2. Hvert er leyfi og attribution?
3. Eru cache-reglur? Þarf að fara fram á server-side caching?
4. Hvaða gögn eru í boði (vegnet, veðurstöðvar, lokanir, myndavélar, umferðarteljarar)?
5. Hvað er uppfærslutíðni og hleðsluhraði?
6. Er hægt að nota þetta í Next.js client? Þarf CORS proxy?
7. Er hægt að geyma í Supabase/PostGIS eða þarf on-demand fetch?

---

## Gagnauppsprettur sem á að rannsaka

### 1. Vegagerðin

Vegagerðin hefur opin GIS gögn. Hugsanleg uppbygging:

**REST endpoints (hugsanleg):**
- `https://gis.vegagerdin.is/arcgis/rest/services/` eða sambærileg ArcGIS REST API
- FeatureServer layers (vegnet, brýr, göng, einbreiðar brýr, lokanir, fjalllegar leiðir)
- MapServer (raster/vector tile)
- Road condition layers

**Þekkt gögn sem þegar eru í kerfinu:**
- Vegagerðin mælistöðvar eru þegar notaðar í `/vedrid` (current measurements, gusts)
- Myndavélar eru EKKI í kerfinu ennþá (var nefnt í minni sem "research task")

**Hvað Codex á að gera:**
- Skoða `https://gis.vegagerdin.is/` eða opinberar API skjölur
- Staðfesta ArcGIS REST API URL og available layers
- Skoða leyfi og attribution kröfur
- Meta hvort CORS leyfi eru gefin fyrir browser fetch
- Skrá niðurstöður í þetta skjal (bæta við neðst eða í nýrri skrá)

### 2. Landmælingar Íslands

**Hugsanleg uppbygging:**
- WMTS/WMS tile services
- Raster og vector grunnkort
- Terrain, hillshade, contour lines
- Staðanöfn og kennileiti
- Örugglega þekkt: `https://gis.lmi.is/` eða `https://www.lmi.is/is/landupplysingar/gagnagrunnar-og-vefthjonustur/`

**Hvað Codex á að gera:**
- Finna tile service URLs (WMTS endpoint og layer names)
- Staðfesta attribution-kröfur
- Meta hvort open/free eða þarf beiðni
- Meta hvort það er hægt að nota með MapLibre GL JS

### 3. OpenStreetMap

**Þekkt:**
- OSM data er ODbL licensed
- Overpass API fyrir queries
- Geofabrik eða BBBike fyrir Iceland extracts
- PMTiles/MBTiles fyrir vector tiles

**Hvað Codex á að gera:**
- Staðfesta ODbL kröfur — attribution, hvað felst í "derived database"
- Meta hvort tile hosting (Protomaps, Stadia, etc.) er betri valkostur en self-hosted
- Skrá hvaða data layers OSM Iceland hefur sem við þyrftum

---

## Hvað Codex á EKKI að gera í M1

- Engar nýjar SQL migrations
- Enginn nýr kóði í production runtime
- Engin Google replacement
- Ekki byrja M2 (map prototype) nema Stebbi gefi sérstaklega leyfi

---

## Útkoma M1

Codex á að skrá niðurstöðurnar í:

**`OpenDataResearch.md`** — ný skrá í rót verkefnis.

Skjalið á að innihalda:

```
# Open Data Research

## Vegagerðin GIS
- Endpoints: ...
- Leyfi: ...
- Attribution: ...
- Cache reglur: ...
- Tiltæk gögn: ...
- CORS: ...
- Ráðlegging: ...

## Landmælingar Íslands
- (sama uppbygging)

## OpenStreetMap
- (sama uppbygging)

## Tillaga að næsta skrefi
- Hvaða uppspretta hentar best sem grunnkort?
- Hvaða uppspretta hentar best sem road overlay?
- Er M2 prototype feasible án Supabase writes?
```

---

## Validation eftir M1

Þar sem þetta er docs-only skammtur:

- `npm run type-check` þarf **ekki** að vera keyrt (engin kóðabreyting)
- `npm run test:run` þarf **ekki** að vera keyrt
- Git status á að sýna bara nýja markdown skrá
- Enginn commit, push eða deploy án Claude rýni

---

## Route Intelligence Check

M1 snertir:
- Vegagerðin GIS sem hugsanleg uppspretta fyrir road segment geometry
- Landmælingar sem hugsanlegt grunnkort
- OSM sem hugsanleg POI/road overlay

Það sem **verður** ekki í M1:
- Engin segment geometry í `lib/iceland-routes/`
- Engar nýjar route families
- Engin station matching
- Engin production URL sem fetcharar opin gögn

---

## Spurningar sem Codex gæti þurft að svara

1. Eru Vegagerðin GIS services skráðar opinberlega? (t.d. á vegagerdin.is eða gis.vegagerdin.is)
2. Eru Landmælingar WMTS tiles með open attribution eða lokaðar?
3. Eru til Íslenskar OSM-based tile services sem þegar hafa attribution og cache?
4. Þarf M2 prototype að fara beint í MapLibre eða getur Leaflet verið nógu gott til að sannreyna?

Codex má svara þessum spurningum í `OpenDataResearch.md`.
