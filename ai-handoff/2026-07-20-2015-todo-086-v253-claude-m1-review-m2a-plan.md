# Handoff: M1 Rýni (Devil's Advocate) + M2A Plan

Created: 2026-07-20 20:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Review + plan handoff -- engin framkvæmd án samþykkis

---

## Hvað þessi handoff gerir

Þetta er rýni á Codex v252 M1 niðurstöður (`OpenDataResearch.md`) með devil's
advocate sjónarmiði. Því næst er plan fyrir M2A sem þarf samþykki Stebba áður
en framkvæmd byrjar.

Engar skrár voru breyttar í þessum Claude-skammti.

---

## Devil's Advocate: Hvað er rétt í M1

Codex gerði solid rannsókn:

- Staðfesti Vegagerðin ArcGIS REST endpoints rétt
- Staðfesti LMÍ CC BY 4.0 leyfi og GeoServer
- OSM ODbL share-alike risk er rétt greint og skráð
- `IdButur` sem segment identifier er mikilvægt domain signal
- M2A/M2B tvískipting er góð -- proof fyrst, platform síðar
- Attribution textar eru teknir úr réttum upprunum

---

## Devil's Advocate: Fimm veikleikar í M1 sem þarf að leiðrétta

### 1. `www-gamli.lmi.is` er gamli vefurinn -- dokumentation kann að vera úreld

LMÍ URLs í `OpenDataResearch.md` nota `www-gamli.lmi.is` (gamli = old). Þetta
gæti þýtt að þær vefþjónustulýsingar sem Codex las eiga við eldri útgáfur.

GeoServer á `gis.lmi.is` virðist vera núverandi, en við vitum ekki hvort layer
nöfn, attribution textar og WMTS endpoints sem Codex lýsir eiga við
nuverandi production GeoServer.

**Áhætta:** M2A kóðar á layer/URL sem er ekki längur til.

**Tillaga:** Við þurfum að ganga úr skugga um að `gis.lmi.is/geoserver` sé
current production instance og að layer nöfn séu rétt áður en við kóðum URL
fastir í M2A.

### 2. `faerdferlar2017_1` -- árstalið 2017 er áhyggjuefni

`OpenDataResearch.md` nefnir `gis:faerdferlar2017_1` WFS sem geometry source
fyrir segment-state. Árstalið 2017 í layer nafninu er óljóst merki. Þetta
gæti þýtt:

- gögnin voru síðast uppfærð 2017
- þetta er version-specific skýsla sem hefur verið skipt út
- eða þetta er bara nafngjöf á dataset sem er enn virkt

Codex tók þetta ekki upp. Við eigum ekki að byggja M2B á WFS layer sem kann
að vera úrelt.

**Tillaga:** `faerdferlar2017_1` er WFS (vector geometry) og passar betur í
M2B en M2A. Í M2A nægir að nota `data/vegakerfi/MapServer` sem raster overlay
-- ekkert parsing, bara tile. `faerdferlar2017_1` validationið getur bíðið.

### 3. Leaflet/WMS proof er throwaway -- fara beint í MapLibre GL JS

Codex mælir með Leaflet í M2A og MapLibre í M2B. Rökstuðningurinn er að Leaflet
sé hraðar að setja upp. En þetta hefur þrjár hliðar:

**React 18+ / Next.js 15 hydration vandamál:** `react-leaflet` hefur langa sögu
af SSR hydration glitches í Next.js. Verkefnið er Next.js 15 / React 19. Þetta
getur orðið tímaþrevjandi debugging vandamál í M2A.

**MapLibre styður raster nú þegar:** MapLibre GL JS þarf ekki PMTiles eða vector
pipeline til að byrja. `addSource({ type: 'raster', tiles: [wmtsUrl] })` virkar
með WMTS/WMS raster tiles beint. M2A getur notað MapLibre með raster sources
-- sama proof, betri platform.

**Throwaway er dýr:** Ef við gerum M2A í Leaflet og M2B í MapLibre höfum við
gert UI integration tvisvar: route, component, flag-guard, mobile layout, SSR
workarounds -- allt aftur. Það er ekki lítið.

**Tillaga:** Fara beint í MapLibre GL JS. M2A er enn lítill, feature-flaggaður
spike, en built á réttu platform. Þetta þarf Stebbi-samþykki fyrir `maplibre-gl`
dependency.

### 4. CORS er ekki "athugasemd" -- það er fyrsti checkpoint

`OpenDataResearch.md` nefnir CORS sem "óstaðfest" en lætur það vera
hliðarathugasemd. Það er ekki rétt röðun. CORS er **fyrsti technicalur
checkpoint** fyrir M2A, ekki síðastur.

Ef `gis.lmi.is/geoserver` og `vegasja.vegagerdin.is/arcgis` bjóða ekki upp á
`Access-Control-Allow-Origin: *` eða Teskeið domain, þá:

- besta nálgunin er Next.js API route sem read-only tile/feature proxy
- þetta snertir cache reglu, rate-limit og performance val
- það er einfalt en þarf hönnunarákvarðanatöku áður en kóðun byrjar

**Tillaga:** M2A plan á að gera CORS-check að fyrsta skrefi, ekki síðasta.
Áður en við skrifum eina línu af map kóða ætti Codex að prófa:

```
curl -I "https://gis.lmi.is/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
```

og athuga `Access-Control-Allow-Origin` header. Sama með Vegagerðin ArcGIS.

### 5. Attribution á heima í `DataLicenses.md` -- ekki scattered í JSX

`OpenDataResearch.md` notar attribution textana á tveimur stöðum. Þegar þessir
textar fara inn í map UI component verða þeir scattered um JSX skrár, þar til
við gleymum að uppfæra þær.

`DataLicenses.md` er einfalt skjal með einum stað per license:

- upprunaheiti
- license URL
- attribution string sem á heima í UI
- hvaða component/route notar þetta

Þetta verður gott ref þegar M2B og M3 bæta fleiri sources við.

**Tillaga:** Búa til `DataLicenses.md` sem fyrsta M2A artifact, áður en
map component er skrifaður.

---

## M2A Plan (þarf samþykki Stebba)

### Scope

- Ný route: `/auth-mvp/vedrid/road-map-prototype`
- Aðeins authenticated + `road-intelligence-v1` feature flag
- Grunnkort: LMÍ WMTS eða WMS raster í MapLibre GL JS
- Overlay: Vegagerðin `data/vegakerfi/MapServer` WMS raster
- Attribution: canonical strings úr `DataLicenses.md`
- Engin Supabase writes, engin user GPS, engar ráðleggingar
- Núverandi `/auth-mvp/vedrid` er óbreytt

### Framkvæmdaskref (í þessari röð)

1. **CORS validation** -- Codex (eða Claude) keyrir curl eða fetch test á:
   - `gis.lmi.is/geoserver` WMS GetCapabilities
   - `vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer`
   - Ef CORS er blocked: skrifa `/app/api/map-proxy/route.ts` sem read-only proxy
     (fær URL param, fetchar server-side, skilar tile/JSON, engin user data)

2. **`DataLicenses.md`** -- Búa til skjal með attribution strings:
   - Vegagerðin: `Byggt á gögnum frá Vegagerðinni.` + leyfi URL
   - LMÍ: `Inniheldur gögn frá [dataset] Landmælinga Íslands frá [date].` + CC BY 4.0
   - Haldsreitur: nafn og URL dataset sem við notum í M2A, þannig attribution
     er rétt sem við vitum af

3. **Dependency: `maplibre-gl`** -- þarf Stebbi-samþykki:
   - `npm install maplibre-gl` (um 800KB gzipped, þarf CSS import)
   - Muna að setja `"use client"` á map component og nota dynamic import með
     `ssr: false` eins og allir heavy map libs krefjast í Next.js

4. **`/auth-mvp/vedrid/road-map-prototype/page.tsx`** -- server component:
   - Sannreyna auth og `road-intelligence-v1` feature flag (eins og vedrid/page.tsx)
   - Þegar flaggið er af: redirect til `/auth-mvp/vedrid`
   - Þegar flaggið er á: render client map component

5. **Map client component** -- `RoadMapPrototype.tsx`:
   - `"use client"` + dynamic import
   - MapLibre initializer, raster source frá LMÍ
   - WMS overlay frá `data/vegakerfi/MapServer`
   - Attribution text frá `DataLicenses.md` constants
   - Engin state writes, engin GPS

6. **Navigation link** -- bæta við link á `/auth-mvp/vedrid` sem sést aðeins
   þegar `hasRoadIntelligence === true`:
   - "Kort prototype" eða "Sýna kort" -- label sem Stebbi kýs
   - `<Link href="/auth-mvp/vedrid/road-map-prototype">`
   - Engin link fyrir notendur án flaggs

### Hvað M2A er EKKI

- Ekki map á `/vedrid` eða `/auth-mvp/vedrid` -- þær eru óbreyttar
- Ekki segment routing (M2B)
- Ekki live segment state (M3)
- Ekki user GPS
- Ekki Supabase writes
- Ekki `faerdferlar2017_1` WFS parsing -- það er M2B

### Mælikvarðar á M2A

- Kortet renderar á mobile og desktop án horizontal overflow
- Attribution textar eru sýnilegir í eða við kortið
- LMÍ raster grunnkort hleðst án JavaScript console errors
- Vegagerðin WMS overlay birtist yfir grunnkorti
- CORS approach (direct eða proxy) er skýr og documented
- `npm run type-check` er grænt
- `npm run test:run` er grænt

---

## Spurningar sem þarf Stebbi-svar á áður en Codex eða Claude byrjar M2A

1. **MapLibre GL JS samþykki:** Er Stebbi tilbúinn að bæta `maplibre-gl`
   við sem dependency? (um ~800KB gzipped, þarf CSS import)

2. **Leaflet í staðinn:** Ef Stebbi vill Leaflet fyrst, er hann meðvitaður
   um Next.js 15 SSR hydration áhættu með `react-leaflet`?

3. **CORS proxy:** Ef CORS er blocked á Vegagerðin/LMÍ, er Stebbi tilbúinn
   að við búum til read-only `/api/map-proxy` route? Eða vill hann gera
   þessa ákvörðun eftir að við höfum séð CORS test niðurstöður?

4. **Nafn á route:** Er `/auth-mvp/vedrid/road-map-prototype` nógu lýsandi
   eða vill Stebbi eitthvað annað?

5. **`DataLicenses.md`:** Á þetta að vera fyrsta M2A deliverable (þarf ekkert
   samþykki, bara docs) og Codex/Claude getur byrjað á þessu án dependency?

---

## Hvað var gert í þessum Claude-skammti

Engar skrár voru breyttar.

Lesið:
- `ai-handoff/2026-07-20-1957-todo-086-v252-codex-m1-open-data-research-done.md`
- `OpenDataResearch.md`
- `RoadIntelligenceMap.md`

---

## Tillaga að Codex næsta skrefi (eftir Stebbi samþykki)

Ef Stebbi samþykkir MapLibre og próxý-nálgunina:

1. Codex keyrir CORS validation curl tests
2. Codex býr til `DataLicenses.md`
3. Codex skrifar `/api/map-proxy/route.ts` ef CORS er blocked
4. Claude eða Codex útfærir route og map component

Ef Stebbi vill Leaflet þrátt fyrir allt:
- Nota `leaflet` (ekki `react-leaflet`) með vanilla JS initialization í useEffect
- `"use client"` + `typeof window !== 'undefined'` guard
- Þetta kemst framhjá SSR hydration vandanum en er meira verbose

---

## Óvissa

- Hvort `www-gamli.lmi.is` documentation eigi við núverandi GeoServer -- þarf
  staðfestingu
- Hvort `faerdferlar2017_1` layer er enn virkt og uppfært í dag -- þarf að
  prófa með WFS GetFeature query
- Hvort LMÍ `grunnkort2025` layer sé betri M2A basemap en generic WMTS -- ekki
  rannsakað
- CORS status á báðum Vegagerðin og LMÍ GeoServer
