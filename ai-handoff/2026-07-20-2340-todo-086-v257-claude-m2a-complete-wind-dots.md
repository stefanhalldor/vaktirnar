# Handoff: M2A lokið — live vindpunktar á korti

Created: 2026-07-20 23:40
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Implementation handoff for Codex review

---

## Skilningur á samþykki

Stebbi bað Claude um að rýna v256 mjög vel, gera lagfæringar/viðbætur og fara í
næstu stóru framkvæmd.

Claude framkvæmdi:

1. Þrjár lagfæringar frá v256 rýni
2. M2A completion: toggle + NavigationControl + error state
3. Nýr M2B-inngangur: live Vegagerðin veðurstöðvar sem vindlitaðar punktar á korti

Þetta fól ekki í sér commit, push, deploy, SQL, migration, Supabase write eða
Vercel env breytingu.

---

## Rýni á Codex v256

### Hvað Codex gerði rétt

- LMÍ layer validation (`LMI_Island_einfalt` confirmed) -- mjög gagnlegt
- Proxy hönnun er solid: allowlist, bbox validation, content-type guard, auth/feature gate
- Namespace `/api/teskeid/road-intelligence/map-proxy` er betra en `/api/map-proxy`
- Tests ná yfir security invariants
- `dynamic()` removal -- rétt niðurstaða, þó af öðrum ástæðum en Codex skráði
  (sjá neðar)

### Þrjár lagfæringar sem Claude gerði

**1. CSS í `layout.tsx` -- fjarlægt**

Codex setti `maplibre-gl/dist/maplibre-gl.css` í `app/layout.tsx`. Þetta hlóð
MapLibre CSS á allar síður í appinu, þar með talið almennt `/vedrid`, login
síður og allt annað. MapLibre CSS á að scopa-st við prototype route-ið.

Claude færði CSS importið til baka í `RoadMapPrototypeMap.tsx`. CSS import í
`'use client'` skrá er fullkomlega lögmætt í Next.js 15 -- webpack bundlar það
með route chunk-num, ekki globally.

**2. Proxy `fetch()` án try/catch -- lagað**

`app/api/teskeid/road-intelligence/map-proxy/route.ts` hafði ekkert error
handling kringum network `fetch()`. Ef Vegagerðin er ekki aðgengileg skilar
Next.js 500 með unhandled exception stack í logs. Lagað með try/catch sem skilar
502 `upstream_unreachable` í staðinn.

**3. `dynamic()` skýring**

Codex fjarlægði `dynamic()` og sagði að það sé vandamál í App Router Server
Components. Þetta er að hluta rétt -- `dynamic()` with hooks (t.d. `loading`)
getur valdið vandræðum í Server Components í sumum útgáfum. En `dynamic()` with
`ssr: false` er fullkomlega gilt í Server Components í Next.js 15 App Router.

Codex leiðin (direct import + `useEffect` dynamic import) er líka rétt og
verklegur. Þetta er tvær gildar leiðir. Codex leið er jafn góð -- haldið.

### Eitt opið atriði frá Codex

> "Er rétt að tile proxy krefjist `road-intelligence-v1` á hverja tile request?"

Svar: Já, í bili. Fyrir 1-2 feature-flaggaða notendur er þetta fine. Ef þetta
opnast fyrir fleiri þarf short-lived signed token (t.d. JWT eða signed cookie)
sem MapLibre getur sent með tile requests, þannig að Supabase session check fer
ekki fram á hverja tile. Þetta er M3+ vandamál, ekki M2A.

---

## Hvað var framkvæmt

### Lagfæringar (3)

- `app/layout.tsx` -- fjarlægt `import 'maplibre-gl/dist/maplibre-gl.css'`
- `app/api/teskeid/road-intelligence/map-proxy/route.ts` -- try/catch kringum
  upstream `fetch()`; 502 `upstream_unreachable` ef network Villa
- `components/weather/RoadMapPrototypeMap.tsx` -- CSS import bætt við efst

### M2A viðbætur

`components/weather/RoadMapPrototypeMap.tsx` uppfært:

- `NavigationControl` bætt við (zoom in/out, rotate) -- efst til hægri
- `showOverlay` state og `handleOverlayToggle` -- toggle takki fyrir Vegagerðin
  raster overlay
- `mapError` state og error UI -- ef MapLibre initialization bila
- `cancelled` flag til að vernda gegn state updates eftir unmount

### Nýtt M2B entry: live vindpunktar

**`lib/road-intelligence/stationGeoJson.ts`** (nýtt)

- `stationsToGeoJson(measurements)` -- breytir `VegagerdinCurrentMeasurement[]`
  í GeoJSON FeatureCollection
- Filtrar út stöðvar með `NaN`/`Infinity` lat/lon
- Mappar `gustLast10MinMs` á `gustMs` property (concise key fyrir MapLibre expressions)

**`app/api/teskeid/road-intelligence/station-markers/route.ts`** (nýtt)

- Auth + `road-intelligence-v1` feature gate
- Kallar `readVegagerdinCurrentWithHistoryFallback()` -- notar existing cache,
  ekkert nýtt Vegagerðin API call
- Skilar GeoJSON FeatureCollection
- `private, max-age=60, stale-while-revalidate=120`
- Ef cache er unavailable: skilar empty FeatureCollection (ekki 502)

**`lib/__tests__/road-intelligence-station-geo-json.test.ts`** (nýtt)

- 6 tests: coordinate order, gustMs mapping, null wind filtering, lat/lon NaN
  filter, empty input

**`components/weather/RoadMapPrototypeMap.tsx`** -- station layer:

- Fetchar `/api/teskeid/road-intelligence/station-markers` í `map.on('load')`
- Bætir við `geojson` source og `circle` layer
- Wind color expression (MapLibre step expression):
  - `< 7 m/s`: grænt `#22c55e`
  - `7–15 m/s`: gult `#eab308`
  - `15–20 m/s`: appelsínugult `#f97316`
  - `20+ m/s`: rautt `#ef4444`
  - Notar `gustMs` í fyrsta lagi, fellur til baka á `meanWindMs`, þá 0
- Stöðufjöldi birtist í legend eftir að markers hlaðast

**Wind legend UI:**

- Litaðar punktar með m/s bil
- Stöðufjöldi þegar hlaðið
- Overlay toggle takki

---

## Skrár breyttar / búnar til

- `app/layout.tsx` -- fjarlægt MapLibre CSS (scoping fix)
- `app/api/teskeid/road-intelligence/map-proxy/route.ts` -- try/catch (error fix)
- `components/weather/RoadMapPrototypeMap.tsx` -- complete rewrite (M2A + M2B entry)
- `lib/road-intelligence/stationGeoJson.ts` -- nýtt
- `lib/__tests__/road-intelligence-station-geo-json.test.ts` -- nýtt
- `app/api/teskeid/road-intelligence/station-markers/route.ts` -- nýtt

---

## Validation

- `npm run type-check` -- exit code 0
- `npm run test:run` -- 122 test files, 3459 tests passed, 27 skipped, 8 todo

---

## Hvað þarf Stebbi að gera til að sjá þetta

Forsendur (óbreyttar frá v256):

1. `.env.local`: `ROAD_INTELLIGENCE_V1_ENABLED=true`
2. SQL89 keyrð í Supabase (bætir `road-intelligence-v1` við CHECK constraint)
3. `INSERT INTO feature_access (email, feature_key) VALUES ('þitt@netfang.is', 'road-intelligence-v1') ON CONFLICT DO NOTHING;`
4. `npm run dev`

Proof-of-concept:

1. `/auth-mvp/vedrid` → "Korttilraun →" sést með flaggi
2. `/auth-mvp/vedrid/road-map-prototype` → MapLibre kort hleðst
3. LMÍ grunnkort sést (Island simplified)
4. Vegagerðin vegakerfi overlay sést yfir grunnkorti (grálæg vegakerfi raster)
5. Litaðir vindpunktar birtast eftir nokkrar sekúndur (stöðufjöldi upp í 202)
6. Toggle "Fela vegakerfi" felur/sýnir road network overlay
7. Wind legend með litum og m/s bilum
8. Zoom controls efst til hægri

Ef stöðvar koma ekki upp:

- DevTools → Network → leita að `/station-markers`
- 401: notandi er ekki innskráður
- 404: `road-intelligence-v1` flaggið er ekki til
- 200 en tómt: Vegagerðin cache er tómt (leyst með cron)

---

## Hvað er þetta í heild

Kortið sýnir núna þrjár layers:

1. **LMÍ raster grunnkort** -- opið Íslandskort
2. **Vegagerðin vegakerfi** -- road network raster (via proxy)
3. **Live vindpunktar** -- 202 Vegagerðin stöðvar í lit eftir vind

Þetta er fyrsta road intelligence kort Teskeiðar. Ekki Google Maps replacement.
Ekki production. En það er eigið kort með eigin gögnum, bak við eigið flagg.

---

## Næstu skref

### M2A-3 (optional): betri grunnkort

`LMI_Island_einfalt` er simplified. Betra lag með vegum og örnefnum myndi bæta
lesanleika. LMÍ GeoServer hefur fleiri layers (`IS_50V:*`, `grunnkort2025:*`)
sem þarfnast validation.

### M2B: vector segment layer

Í stað raster vegakerfi tiles: sækja GeoJSON features úr Vegagerðin
`faerd/FeatureServer` og teikna sem MapLibre vector lines. Þetta gefur okkur:

- styling per segment (litur eftir færðarástandi)
- click-to-select segment
- tengsl við `IdButur` sem segment ID

### M3: tengja við Road Intelligence registry

Teikna `lib/iceland-routes/` leiðir og cautions á kortið sem GeoJSON segment
overlay -- sama short-list og sýnt er í `RoadIntelligencePreview`.

---

## Spurningar til Codex

1. Á Codex að byrja á M2A-3 (betri LMÍ grunnkort) eða hoppa beint í M2B
   (vector segment layer)?
2. Þarf wind legend UI að vera localized (íslenska/enska) eða er "m/s" nóg sem
   universal label?
3. Eru önnur stöðvar í Teskeiðar cache (Veðurstofa) sem gætu bætt vindpunkta
   niðurstöðuna, eða er Vegagerðin-only rétt fyrir Road Intelligence prototype?

---

## Óvissa

- Vegagerðin vegakerfi raster overlay er proof -- engar segment IDs, engin
  condition data ennþá (þarf M2B)
- `LMI_Island_einfalt` gæti þurft að skipt út fyrir betra lag
- Auth-per-tile limit er ekki rate-limited ennþá (M3+ vandamál)
- Wind dots eru Vegagerðin-only -- Veðurstofa stöðvar eru ekki á kortinu ennþá
- Browser end-to-end er óprófað af Claude -- Stebbi þarf localhost keyrslu
