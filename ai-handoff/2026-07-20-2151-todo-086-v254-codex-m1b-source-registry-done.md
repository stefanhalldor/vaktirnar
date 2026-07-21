# Handoff: M1B source registry, DataLicenses og CORS preflight lokið

Created: 2026-07-20 21:51
Timezone: Atlantic/Reykjavik
Agent: Codex
Relevant TODO: 086
Type: Implementation handoff for Claude Code review

---

## Skilningur á samþykki

Stebbi bað Codex að skoða
`2026-07-20-2015-todo-086-v253-claude-m1-review-m2a-plan` með gagnrýnum augum
og halda áfram í næstu stóru framkvæmd.

Codex túlkaði þetta sem leyfi til að framkvæma næsta afmarkaða Road
Intelligence skammt í repo, en ekki leyfi til að setja inn ný dependency,
commit-a, push-a, deploy-a, keyra SQL eða gera production/Supabase/Vercel
breytingar.

Codex framkvæmdi M1B:

- CORS preflight á LMÍ og Vegagerðin endpoints
- canonical `DataLicenses.md`
- typed open-data source registry í `lib/iceland-routes/`
- tests fyrir registryið
- docs uppfærslur

Codex setti ekki `maplibre-gl` inn, því Claude v253 kallaði það rétt út sem
sér dependency-ákvörðun sem Stebbi þarf að samþykkja sérstaklega.

---

## Rýni Codex á Claude v253

Claude v253 var mjög gagnlegt devil's advocate plan.

Codex er sammála:

- `www-gamli.lmi.is` er veik heimild ef við ætlum að hardcode-a layer URL.
- `faerdferlar2017_1` á ekki að vera fyrsti M2A dependency fyrr en staðfest.
- CORS er fyrsti checkpoint, ekki aukaatriði.
- Attribution á að verða canonical, ekki dreift í JSX.
- MapLibre er líklega réttara langtíma platform en Leaflet ef við ætlum í
  vector tiles, segment styling og Live Road OS.

Codex er aðeins varkárari með eitt:

- Það er rétt að MapLibre sé líklega betra langtíma, en `maplibre-gl` dependency
  install á ekki að gerast í sama skrefi og CORS/license óvissan. Nú er sú
  óvissa minnkuð og næsta samþykkta skref getur orðið MapLibre prototype.

---

## CORS niðurstöður

Keyrt var read-only curl með `Origin: https://www.teskeid.is`.

### LMÍ WMS GetCapabilities

Command:

`curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://gis.lmi.is/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"`

Niðurstaða:

- HTTP 200
- `Access-Control-Allow-Origin: *`
- `Access-Control-Expose-Headers: Access-Control-Allow-Origin,Access-Control-Allow-Credentials`

OPTIONS preflight:

- HTTP 200
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: HEAD,DELETE,POST,GET,OPTIONS,PUT`

Túlkun:

- LMÍ lítur vel út fyrir direct browser basemap í M2A.

### Vegagerðin vegakerfi ArcGIS

Command:

`curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer?f=json"`

Niðurstaða:

- HTTP 200
- `Vary: Origin`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: *`
- **ekkert `Access-Control-Allow-Origin` í svarinu**

OPTIONS preflight:

- HTTP 204
- allowed methods/headers
- **ekkert `Access-Control-Allow-Origin`**

Túlkun:

- Browser notkun á Vegagerðin ArcGIS er líklega blocked án proxy.
- M2A ætti að gera ráð fyrir same-origin allowlisted proxy fyrir Vegagerðin
  overlay.

### Vegagerðin færð FeatureServer

Command:

`curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer?f=json"`

Niðurstaða:

- sama mynstur og `vegakerfi`
- HTTP 200
- **ekkert `Access-Control-Allow-Origin`**

OPTIONS preflight:

- HTTP 204
- allowed methods/headers
- **ekkert `Access-Control-Allow-Origin`**

Túlkun:

- Vegagerðin færð layer þarf líklega proxy ef það er notað í browser.

---

## Hvað var framkvæmt

### 1. `DataLicenses.md`

Nýtt canonical skjal fyrir attribution, leyfi og production varúð:

- Vegagerðin attribution:
  `Byggt á gögnum frá Vegagerðinni.`
- LMÍ attribution pattern:
  `Inniheldur gögn frá {dataset} gagnagrunni Landmælinga Íslands frá {retrievedAt}.`
- OSM attribution:
  `OpenStreetMap contributors`

Skjalið skráir líka:

- CORS stöðu 2026-07-20
- að Vegagerðin proxy má ekki vera almennur open proxy
- að OSM má ekki fara inn í proprietary road graph án sér ODbL rýni
- að open-data geometry á ekki að fara í Supabase/persistent store án sér
  cache/license/refresh ákvörðunar

### 2. `lib/iceland-routes/openDataSources.ts`

Nýtt typed registry fyrir open-data sources:

- `vegagerdin-vegakerfi`
- `vegagerdin-faerd`
- `vegagerdin-vedur-current`
- `lmi-geoserver`
- `openstreetmap`

Exportar:

- source/provider/role types
- CORS status
- production readiness
- canonical attribution constants
- `formatLmiAttribution(dataset, retrievedAt)`
- `getRoadIntelligenceOpenDataSource(id)`
- `getRoadIntelligenceAttributions(sourceIds)`
- `needsRoadIntelligenceMapProxy(sourceId)`

Mikil design ákvörðun:

- Þetta er í `lib/iceland-routes/` því það er route/road-intelligence metadata
  sem á að nýtast map prototype, segment-state og síðar routing, ekki bara
  einu Weather component.

### 3. `lib/__tests__/iceland-routes-open-data-sources.test.ts`

Ný tests sem tryggja:

- source IDs eru unique og slug-safe
- allir sources hafa HTTPS license URL, attribution og endpoints
- Vegagerðin ArcGIS sources eru merktir `proxy-likely-required`
- LMÍ GeoServer er merkt `browser-confirmed`
- Vegagerðin attribution dedupe-ar milli margra sources
- LMÍ attribution format fallið virkar

### 4. `lib/iceland-routes/index.ts`

Nýju open-data source types og helpers eru exportaðir úr package index.

### 5. Docs uppfærslur

`OpenDataResearch.md`:

- bætt við M1B framkvæmdarkafla
- bætt við raunverulegum CORS niðurstöðum
- Vegagerðin CORS kafli uppfærður úr "óstaðfest" í "proxy likely"
- LMÍ CORS kafli uppfærður úr "óstaðfest" í "browser confirmed"
- open questions uppfærðar út frá nýrri stöðu

`RoadIntelligenceMap.md`:

- bætt við v254 status undir M1
- vísar í `DataLicenses.md` og `openDataSources.ts`
- skráir að LMÍ basemap virðist browser-ready en Vegagerðin overlay þurfi líklega
  allowlisted proxy

`IcelandRoadmap.md`:

- `DataLicenses.md` og `openDataSources.ts` bætt við kóðalendingarstað/skráalista

`lib/iceland-routes/README.md`:

- skráir open-data source metadata sem hluta af current scope

---

## Skrár breyttar

- `DataLicenses.md` - nýtt canonical license/attribution skjal
- `OpenDataResearch.md` - uppfært með M1B og CORS niðurstöðum
- `RoadIntelligenceMap.md` - uppfært með v254 status
- `IcelandRoadmap.md` - skráalisti uppfærður
- `lib/iceland-routes/openDataSources.ts` - nýtt typed registry
- `lib/iceland-routes/index.ts` - exportar registry
- `lib/iceland-routes/README.md` - scope uppfært
- `lib/__tests__/iceland-routes-open-data-sources.test.ts` - ný tests
- `ai-handoff/2026-07-20-2151-todo-086-v254-codex-m1b-source-registry-done.md` - þetta handoff

Ótengd staða:

- `.obsidian/workspace.json` var dirty fyrir og er óviðkomandi. Codex snerti það
  ekki.

---

## Skipanir keyrðar

Lesa/rýna:

- `Get-Content -Encoding UTF8 ai-handoff/2026-07-20-2015-todo-086-v253-claude-m1-review-m2a-plan.md`
- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 Design.md`
- `git status --short`
- `Get-ChildItem -Force lib`
- `Get-ChildItem -Force lib/iceland-routes`
- `Get-ChildItem -Force lib/__tests__`
- `Get-Content -Encoding UTF8 lib/iceland-routes/index.ts`
- `Get-Content -Encoding UTF8 lib/__tests__/iceland-routes-road-intelligence.test.ts`
- `Select-String` í `OpenDataResearch.md`, `RoadIntelligenceMap.md`, `IcelandRoadmap.md`
- `Get-Content -Encoding UTF8 lib/iceland-routes/README.md`

CORS preflight:

- `curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://gis.lmi.is/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"`
- `curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer?f=json"`
- `curl.exe -s -o NUL -D - -H "Origin: https://www.teskeid.is" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer?f=json"`
- `curl.exe -s -o NUL -D - -X OPTIONS -H "Origin: https://www.teskeid.is" -H "Access-Control-Request-Method: GET" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer?f=json"`
- `curl.exe -s -o NUL -D - -X OPTIONS -H "Origin: https://www.teskeid.is" -H "Access-Control-Request-Method: GET" "https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer?f=json"`
- `curl.exe -s -o NUL -D - -X OPTIONS -H "Origin: https://www.teskeid.is" -H "Access-Control-Request-Method: GET" "https://gis.lmi.is/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"`

Validation:

- `npm run type-check` - exit code 0
- `npm run test:run -- lib/__tests__/iceland-routes-open-data-sources.test.ts` - exit code 0, 6 tests passed
- `npm run test:run` - exit code 0, 120 test files passed, 3447 tests passed, 27 skipped, 8 todo
- `rg -n "[ \t]+$" ...` - exit code 1, engin trailing whitespace match
- `git diff --check ...` - exit code 0

Ath:

- Full testasettið var keyrt áður en `lib/iceland-routes/README.md` fékk
  docs-only viðbót. Eftir README breytinguna voru `type-check`, targeted test og
  trailing-whitespace scan endurtekin.

---

## Design.md check

Þessi skammtur snerti ekki nýtt UI, en Design.md var lesið vegna þess að næsta
M2 skref mun snerta nýjan kortaskjá.

Atriði sem þurfa að ráða M2:

- mobile-first, enginn horizontal overflow
- ekkert kort inni í korti sem decorative wrapper
- route segment með auth/feature gate þarf loading/pending state
- attribution þarf að vera læsilegt á mobile án þess að þekja mikilvæg map
  controls
- nýr prototype skjár má ekki verða marketing/hero síða; hann á að vera
  actual tool/skjár

---

## Route intelligence check

- Snertir Road Intelligence platformið almennt, sérstaklega open-data
  grunnkort, road overlay og segment-state undirbúning.
- Ný þekking á heima í `lib/iceland-routes/openDataSources.ts`,
  `DataLicenses.md`, `OpenDataResearch.md`, `RoadIntelligenceMap.md` og
  `IcelandRoadmap.md`.
- Lausnin er provider-neutral: source registry skilur að LMÍ, Vegagerðin og OSM
  í mismunandi roles.
- Engin canonical segment, route family eða station matching regla var bætt við.
- Engin route gögn, GPS gögn, user_id eða raw user route var geymt.
- Engin SQL, engin Supabase breyting og engin production fetch path var bætt við.

---

## Áhætta sem er lækkuð

- Attribution er ekki lengur bara í research texta. Það er komið í canonical
  docs og typed constants.
- CORS er ekki lengur óstaðfest fyrir fyrstu endpoints.
- Vegagerðin browser-risk er merktur í kóða með `proxy-likely-required`.
- LMÍ basemap-ready staða er merkt í kóða með `browser-confirmed`.
- Næsti map prototype getur importað source metadata í stað þess að hardcode-a
  attribution og URL beint í JSX.

---

## Áhætta sem er enn til staðar

1. **MapLibre dependency er ósamþykkt.**
   - Ekki setja `maplibre-gl` inn fyrr en Stebbi samþykkir dependency og bundle
     tradeoff.

2. **Proxy route er ekki enn skrifuð.**
   - Ef M2 notar Vegagerðin overlay þarf líklega same-origin proxy.
   - Proxy þarf strangt allowlist, ekki arbitrary URL parameter.

3. **LMÍ exact layer er ekki valið.**
   - CORS virkar á GetCapabilities, en við eigum eftir að velja layer/style og
     sannreyna map rendering.

4. **Vegagerðin exact overlay er ekki valið.**
   - `vegakerfi` getur verið gott road overlay.
   - `faerd` gæti verið betra fyrir segment-state.
   - `faerdferlar2017_1` þarf sér validation áður en því er treyst.

5. **Þetta er ekki lagalegt álit.**
   - License interpretation þarf áfram varúð áður en open-data UI fer public.

---

## Tillaga að næstu stóru framkvæmd

Codex mælir nú með M2A-1:

### M2A-1: MapLibre prototype shell án Vegagerðin overlay

Scope:

- Stebbi samþykkir `maplibre-gl` dependency sérstaklega.
- Búa til `/auth-mvp/vedrid/road-map-prototype`.
- Gate: authenticated + `road-intelligence-v1`.
- Client component notar MapLibre með LMÍ basemap source.
- Sýna attribution úr `openDataSources.ts`.
- Engin Vegagerðin overlay í fyrsta commit nema direct/proxy ákvörðun sé klár.
- Engin user GPS, engin Supabase writes, engin route safety advice.

Af hverju ekki proxy strax?

- M2A-1 á fyrst að staðfesta MapLibre + LMÍ + mobile UX.
- Proxy er mikilvægur en þarf sérstaka security rýni.
- Ef bæði MapLibre og proxy koma í sama skammti eykst blast radius óþarflega.

### M2A-2: Vegagerðin allowlisted map proxy

Scope:

- aðeins eftir að M2A-1 renderar
- API route með hardcoded allowlist fyrir samþykkt Vegagerðin endpoint/layer
- enginn arbitrary URL
- short cache headers
- feature/auth gating ef tile-loading með cookies virkar, annars takmarka með
  opaque source IDs og rate/caching

---

## Spurningar til Claude Code

1. Er `lib/iceland-routes/openDataSources.ts` réttur landing staður, eða ætti
   source registry að fara í nýja `lib/road-intelligence/` möppu áður en M2
   stækkar?
2. Er rétt að skipta M2A í M2A-1 MapLibre+LMÍ og M2A-2 Vegagerðin proxy, eða
   vill Claude sameina þetta í einn skammt?
3. Ef MapLibre er sett inn, hvaða SSR/dynamic import mynstur passar best við
   núverandi Next.js 15 App Router kóða?
4. Getur MapLibre raster source notað LMÍ WMS endpoint beint með bbox template,
   eða ætti M2A-1 að byrja á WMTS/tile endpoint úr GetCapabilities?
5. Hvernig viljum við gera `loading.tsx` fyrir prototype route þannig að það
   fylgi Design.md navigation feedback reglunni?

---

## Localhost checks for Stebbi

Þessi skammtur bætir ekki við nýjum sýnilegum skjá, þannig að það er ekkert
nýtt map UI að prófa á localhost ennþá.

Það sem Stebbi getur skoðað í editor:

1. Opna `DataLicenses.md`.
   - Vænt: attribution og varúð fyrir Vegagerðina, LMÍ og OSM sé á einum stað.
2. Opna `OpenDataResearch.md`.
   - Vænt: M1B kafli sýnir CORS niðurstöður og næstu M2A spurningar.
3. Opna `lib/iceland-routes/openDataSources.ts`.
   - Vænt: Vegagerðin sources séu merktir `proxy-likely-required`; LMÍ sé
     `browser-confirmed`.
4. Opna `RoadIntelligenceMap.md`.
   - Vænt: M1 status vísi í `DataLicenses.md` og source registry.

Það sem á ekki að prófa kæruleysislega:

- ekki installa `maplibre-gl` nema Stebbi samþykki dependency
- ekki búa til eða opna production proxy route fyrr en hún hefur verið rýnd
- ekki keyra SQL/migrations
- ekki breyta Vercel env
- ekki deploya

---

## Óvissa / þarf að staðfesta

- Exact LMÍ layer/tile URL fyrir MapLibre er enn óvalið.
- Exact Vegagerðin overlay layer fyrir M2A er enn óvalið.
- Hvort MapLibre tile requests senda cookies nægilega fyrir auth-gated proxy
  þarf að staðfesta áður en proxy gating er ákveðin.
- OSM derived-database mörk eru enn lögfræðileg/gagnahönnunar óvissa.
- `www-gamli.lmi.is` heimildir voru notaðar í fyrri research; M2A ætti að
  byggja actual layer val á `gis.lmi.is` GetCapabilities, ekki gamla vefnum.
