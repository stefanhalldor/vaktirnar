# Handoff: Codex rýni á v255 + M2A-2 proxy-sneið

Created: 2026-07-20 23:02  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: 086  
Type: Implementation handoff for Claude Code review  

---

## 1. Plan áfangans

Stebbi bað Codex að rýna `2026-07-20-2215-todo-086-v255-claude-m2a1-maplibre-prototype-done` og gera lagfæringar og/eða fara í næsta framkvæmdarskref.

Ég túlkaði þetta sem afmarkað framkvæmdarleyfi fyrir:

- rýni á M2A-1 MapLibre prototype shell
- lagfæringar sem eru útgáfu- eða build-hamlandi
- afmarkað M2A-2 fyrsta skref: same-origin allowlisted proxy fyrir Vegagerðin `vegakerfi/MapServer/export`
- engin commit, push, deploy, SQL, migration, Supabase write, Vercel env eða production breyting

Ég las líka `WORKFLOW.md`, `Design.md` og `ai-handoff/README.md`. UI nálgunin fylgir Design.md í því að halda prototype-inu sem app-líkri, þröngri, full-screen verkfærasíðu með skýrum til baka-link, án marketing hero eða card-heavy wrapper.

---

## 2. Hvað var raunverulega gert

### Rýni á Claude v255

Ég fann þrjú atriði sem þurftu lagfæringu:

1. `dynamic(..., { ssr: false })` var notað í Server Component á nýju route-síðunni. `next build` hefði getað lent í App Router vandamáli. Ég fjarlægði `dynamic` og importaði client componentið beint.
2. `maplibre-gl/dist/maplibre-gl.css` var importað inni í client componenti. Ég færði CSS importið í `app/layout.tsx`, þar sem global CSS passar betur.
3. UI texti var hardcode-aður. Ég færði texta í `messages/is.json` og `messages/en.json`.

### LMÍ layer validation

Ég staðfesti með read-only WMS köllum að:

- `IS_50V:IS_50V` skilaði `200 text/xml;charset=UTF-8`, sem bendir til WMS exception en ekki tile myndar.
- `nytt_grunnkort_samsett_naer_fjaer` skilaði líka XML í prófuðu EPSG:3857 kallinu.
- `LMI_Island_einfalt` skilaði `200 image/png`.

Ég breytti MapLibre basemap source yfir í `LMI_Island_einfalt`.

### M2A-2 fyrsta proxy-sneið

Ég bætti við namespaced API route:

`/api/teskeid/road-intelligence/map-proxy`

Hún:

- tekur aðeins `source=vegakerfi`
- tekur `bbox={bbox-epsg-3857}`
- leyfir ekki arbitrary URL
- byggir fastan upstream ArcGIS export URL:
  `https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/export`
- validatar WebMercator bbox:
  - fjórar tölur
  - finite values
  - `minX < maxX`
  - `minY < maxY`
  - innan WebMercator marka
- krefst authenticated user
- krefst `road-intelligence-v1` feature access
- skilar aðeins upstream `image/png`
- hafnar XML/HTML upstream villum sem `502 upstream_unavailable`
- notar `private, max-age=60, stale-while-revalidate=300` fyrir tile response

Svo bætti ég proxy tile source við MapLibre prototype-ið sem raster overlay yfir LMÍ basemap með `raster-opacity: 0.78`.

---

## 3. Skrár sem voru skoðaðar

- `ai-handoff/2026-07-20-2215-todo-086-v255-claude-m2a1-maplibre-prototype-done.md`
- `ai-handoff/2026-07-20-2015-todo-086-v253-claude-m1-review-m2a-plan.md`
- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/loading.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/RoadIntelligencePreview.tsx`
- `lib/loans/guard.ts`
- `lib/auth/guard.ts`
- `lib/iceland-routes/openDataSources.ts`
- `lib/iceland-routes/index.ts`
- `OpenDataResearch.md`
- `RoadIntelligenceMap.md`
- `messages/is.json`
- `messages/en.json`
- `app/layout.tsx`

---

## 4. Skrár sem voru breyttar

### Breyttar skrár

- `app/layout.tsx`
  - Bætti við global `maplibre-gl/dist/maplibre-gl.css` import.

- `components/weather/RoadMapPrototypeMap.tsx`
  - Fjarlægði MapLibre CSS import úr client component.
  - Skipti LMÍ layer úr óstaðfestu `IS_50V:IS_50V` yfir í staðfest `LMI_Island_einfalt`.
  - Bætti við Vegagerðin `vegakerfi` raster overlay í gegnum Teskeið proxy.
  - Færði attribution import beint í `openDataSources` til að halda client importinu þrengra.

- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
  - Fjarlægði `next/dynamic` + `ssr:false`.
  - Importar `RoadMapPrototypeMap` beint sem client component.
  - Notar `teskeid.vedrid.overview` translations fyrir UI texta.

- `components/weather/WeatherOverviewClient.tsx`
  - Prototype link notar nú translation key í stað hardcode texta.

- `messages/is.json`
  - Bætti við:
    - `roadMapPrototypeLink`
    - `roadMapPrototypeBack`
    - `roadMapPrototypeTitle`
    - `roadMapPrototypeSubtitle`

- `messages/en.json`
  - Sama og í íslensku.

### Nýjar skrár

- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
  - Auth/feature-gated same-origin image proxy fyrir Vegagerðin map tiles.

- `lib/road-intelligence/vegagerdinMapProxy.ts`
  - Source allowlist, bbox validation, ArcGIS export URL builder og content-type guard.

- `lib/__tests__/road-intelligence-map-proxy.test.ts`
  - Unit tests fyrir source allowlist, bbox validation, URL builder og content-type guard.

---

## 5. Skipanir sem voru keyrðar

### Read-only external validation

- LMÍ GetCapabilities / GetMap validation via PowerShell `Invoke-WebRequest`
  - Niðurstaða:
    - `IS_50V:IS_50V => 200 text/xml;charset=UTF-8`
    - `nytt_grunnkort_samsett_naer_fjaer => 200 text/xml;charset=UTF-8`
    - `LMI_Island_einfalt => 200 image/png`

- Vegagerðin ArcGIS export HEAD validation:
  - `https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/export?...`
  - Niðurstaða: `200 image/png`

### Validation

- `npm run type-check`
  - Exit code: 0

- `npm run build`
  - Exit code: 0
  - Ath: build sýnir eldri lint warnings í óskyldum skrám:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`

- `npm run test:run -- lib/__tests__/road-intelligence-map-proxy.test.ts`
  - Exit code: 0
  - 1 test file, 4 tests passed

- `npm run test:run`
  - Exit code: 0
  - 121 test files passed
  - 3452 tests passed, 27 skipped, 8 todo

### False validation failure

Ég keyrði `npm run type-check` tvisvar samhliða `npm run build`. Það féll með `TS6053` vegna þess að `next build` hreinsaði/endurgenereraði `.next/types` á meðan `tsc` var að lesa þær. Þetta var validation race, ekki kóðavilla. Þegar `type-check` var keyrt sér eftir build varð exit code 0.

---

## 6. Hvað mistókst eða var sleppt

- Ég ræsti ekki dev server og gerði ekki browser/screenshot próf. Stebbi keyrir localhost sjálfur samkvæmt workflow.
- Ég prófaði ekki authenticated browser tile requests end-to-end, bara:
  - direct upstream Vegagerðin `export` response
  - unit-test á proxy helperum
  - Next build/type/tests
- Ég bætti ekki við overlay toggle, opacity slider eða layer status UI.
- Ég bætti ekki við rate limit. Þetta er feature-flaggað prototype og proxy er allowlistaður, en Claude á að rýna performance/rate-limit áður en þetta fer víðar.
- Ég skrifaði ekki SQL og keyrði ekkert í Supabase.
- Ég breytti ekki Vercel env. `ROAD_INTELLIGENCE_V1_ENABLED=true` og `feature_access` row þurfa að vera til staðar ef Stebbi/Claude ætla að prófa þetta í umhverfi.

---

## 7. Ákvarðanir sem Codex tók

1. **MapLibre er áfram réttur renderer.** Þetta passar betur við Live Road OS, vector-tile framtíð og segment styling heldur en Leaflet.
2. **Proxy route var namespaced undir `/api/teskeid/road-intelligence/map-proxy`.** Claude handoff nefndi `/api/map-proxy`, en ég valdi þrengra namespace svo þetta verði ekki generic proxy surface.
3. **Feature/auth gate er sett á tile proxy.** Þetta ver prototype-ið og heldur því undir `road-intelligence-v1`. Gallinn er að tile requests kalla auth/feature check oft; það þarf að meta áður en þetta opnast víðar.
4. **`LMI_Island_einfalt` er notað sem basemap fyrst.** Það er staðfest að það skilar PNG í EPSG:3857. Þetta er ekki endilega endanlega besta grunnkortið.
5. **Vegagerðin overlay notar raster `MapServer/export` fyrst.** Þetta er proof, ekki endanleg segment intelligence. M2B á enn að fara í vector/segment layer.

---

## 8. Áhætta sem er enn til staðar

- **Auth per tile getur verið dýrt.** MapLibre getur sótt margar tiles við pan/zoom. Fyrir fáeina feature-flaggaða notendur er þetta í lagi, en production þarf annað hvort stutt signed tile token, server-side cache strategy, eða mjög afmarkað rate-limit.
- **Vegagerðin overlay er raster, ekki semantic.** Þetta sannar að við getum birt Vegagerðin kortagögn yfir LMÍ, en gefur ekki enn `IdButur`, færðarástand eða segment IDs í client.
- **LMÍ basemap er einfalt.** `LMI_Island_einfalt` er öruggt fyrsta lag en gæti verið of einfalt fyrir notendaupplifun. Næst þarf að finna betra LMÍ/WMTS lag eða tile source sem sýnir vegi/örnefni skýrara.
- **Browser end-to-end er óprófað.** Build segir að þetta compile-ar, en Stebbi þarf að staðfesta að tiles birtist í raun í browser og að cookies fylgi same-origin tile requests.
- **Attribution þarf loka-rýni.** Attribution kemur úr `openDataSources`, en dataset label `LMI_Island_einfalt` er tæknilegt. Betra notendavænt dataset heiti þarf líklega áður en þetta fer úr prototype.

---

## 9. Tillaga að næsta skrefi

Ég myndi láta Claude Code rýna þennan skammt og þá taka næst eitt af þessu:

1. **M2A-2b browser hardening**
   - staðfesta í browser að `/api/teskeid/road-intelligence/map-proxy` fái cookies og skili PNG tiles
   - bæta við einföldu overlay status/diagnostic UI á prototype síðu ef tile proxy bilar
   - ákveða hvort `private max-age=60` sé nóg eða hvort prototype eigi að vera `no-store`

2. **M2A-3 better basemap discovery**
   - finna betra LMÍ layer/WMTS source með skýrari vegum/örnefnum
   - halda `LMI_Island_einfalt` sem fallback

3. **M2B first semantic segment proof**
   - ekki skipta Google út
   - sækja lítið, afmarkað Vegagerðin feature/segment sample server-side
   - teikna 1-2 segment línur í MapLibre sem vector/source proof
   - ekki vista gögn, ekki route advice

Mín tillaga: Claude byrji á **M2A-2b browser hardening** áður en við förum í M2B. Það lokar stærstu óvissunni: hvort auth-gated tile proxy virkar raunverulega í MapLibre browser requestum.

---

## 10. Spurningar sem Claude á sérstaklega að rýna

1. Er rétt að tile proxy krefjist `road-intelligence-v1` á hverja tile request, eða eigum við að gera session-gated en ekki feature-gated proxy meðan route-síðan sjálf er feature-gated?
2. Er `private, max-age=60, stale-while-revalidate=300` ásættanlegt fyrir Vegagerðin `vegakerfi` raster tiles í prototype, eða á fyrsta útgáfa að nota `no-store` eins og upprunalega v255 plan sagði?
3. Er endpoint nafnið `/api/teskeid/road-intelligence/map-proxy` betra en `/api/map-proxy`, eða vill Claude halda sig við handoff-nafnið?
4. Þurfum við að takmarka bbox zoom/extent eða tile request count frekar til að verja upstream?
5. Er `LMI_Island_einfalt` nægilega gott fyrir M2A release, eða á Claude að finna betra LMÍ lag áður en Stebbi prófar?

---

## 11. Supabase / SQL / auth / production áhrif

- Engin SQL var skrifuð.
- Engin SQL var keyrð.
- Engin Supabase gögn voru lesin eða skrifuð af mér.
- Ný API route les Supabase session í runtime með `createClient()` og notar `checkFeatureAccess(..., 'road-intelligence-v1')`.
- Engar RLS policies eða grants breyttust.
- Engin secrets eða env values voru snert.
- Engin production deployment var gerð.
- Production áhrif ef þetta er deployað:
  - ný authenticated/feature-gated image proxy route verður aðgengileg
  - route er ekki arbitrary proxy, aðeins allowlisted `vegakerfi` source og valid WebMercator bbox
  - proxy fetchar opin Vegagerðin map images server-side

---

## 12. Localhost checks for Stebbi

Forsendur:

- Localhost dev server er keyrður af Stebba.
- `AUTH_MVP_ENABLED=true`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true`.
- Innskráður notandi þarf `feature_access` row fyrir `road-intelligence-v1`.
- Ekki prófa þetta kæruleysislega á production eða með Vercel env breytingum nema það sé sér samþykkt.

Prófun:

1. Opna `/auth-mvp/vedrid` sem innskráður notandi með `road-intelligence-v1`.
   - Vænt: neðst í route/road-intelligence svæði birtist linkur `Korttilraun →`.

2. Smella á `Korttilraun →`.
   - Vænt: farið er á `/auth-mvp/vedrid/road-map-prototype`.
   - Vænt: full-screen MapLibre kort birtist með haus efst og til baka-link.

3. Skoða kortið á mobile viewport.
   - Vænt: Ísland sést án horizontal overflow.
   - Vænt: hægt er að pan/zoom-a.
   - Vænt: LMÍ basemap birtist, ekki grátt/tómt kort.
   - Vænt: Vegagerðin road-network overlay sést yfir grunnkorti.

4. Opna DevTools Network.
   - Leita að `/api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox=...`.
   - Vænt: tile requests skila `200`.
   - Vænt: `Content-Type: image/png`.
   - Vænt: ekki 401/404/502 þegar notandi er rétt flaggaður.

5. Prófa óflaggaðan notanda eða lokað incognito session.
   - `/auth-mvp/vedrid/road-map-prototype`:
     - Vænt án auth: redirect/innskráningarflæði frá auth guard.
     - Vænt með auth en án feature flaggs: 404.
   - Direct API tile URL án auth:
     - Vænt: 401.
   - Direct API tile URL með auth en án flaggs:
     - Vænt: 404.

6. Athuga regressions.
   - `/auth-mvp/vedrid` á að virka eins og áður.
   - Núverandi Google kort á `/vedrid` og `/auth-mvp/vedrid` á ekki að hafa breyst.
   - Engin SQL/migration á að þurfa fyrir þennan skammt.

Ef kortið er tómt:

- Athuga Console fyrir MapLibre villur.
- Athuga Network fyrir LMÍ WMS tile status.
- Athuga Network fyrir Vegagerðin proxy status.
- Ef LMÍ virkar en Vegagerðin proxy skilar 401/404, þá er líklega auth/cookie/feature flag issue.
- Ef proxy skilar 502, þá kom upstream ekki með `image/png` eða Vegagerðin svaraði ekki rétt.
