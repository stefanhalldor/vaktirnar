# Handoff: M2A-1 MapLibre prototype shell lokið

Created: 2026-07-20 22:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Implementation handoff for Codex review

---

## Skilningur á samþykki

Stebbi samþykkti:

- `maplibre-gl` dependency sérstaklega
- M2A-1 (MapLibre + LMÍ raster basemap) sem næstu framkvæmd
- MapLibre sem einlægan renderer; ekki Leaflet proof fyrst

Claude framkvæmdi M2A-1.

Þetta fól ekki í sér:

- commit, push eða deploy
- SQL eða Supabase breytingu
- Vercel env breytingu
- Vegagerðin overlay (það er M2A-2)
- user GPS
- production routing advice

---

## Rýni á Codex v254

Codex v254 (M1B) var solid:

- CORS validation var rétt og ítarleg. LMÍ `browser-confirmed`, Vegagerðin
  `proxy-likely-required` -- þetta er núna kóðað í `openDataSources.ts`.
- `DataLicenses.md` er vel uppbyggt.
- `openDataSources.ts` typed registry er góð hönnun. Helpers
  (`needsRoadIntelligenceMapProxy`, `getRoadIntelligenceAttributions`,
  `formatLmiAttribution`) eru strax gagnlegir.
- Tests eru góðar og ná yfir mikilvægar invariants.
- M2A-1/M2A-2 skipting er rétt: MapLibre + LMÍ fyrst, Vegagerðin proxy í sér
  skammti.

Eitt svar við Codex-spurningu:

> "Er `lib/iceland-routes/openDataSources.ts` réttur landing staður?"

Já, í bili. `lib/road-intelligence/` er náttúrulegt skref þegar M2B og M3 byrja
að bæta við map state management, proxy utilities og routing logic. Að færa
registryið þá er lítil refactor. Ekki þess virði að flytja núna.

---

## Hvað var framkvæmt

### 1. `npm install maplibre-gl`

Útgáfa: `5.24.0`

Athugasemd sem kom upp: MapLibre 5.x breynti `attributionControl` type --
`true` er ekki lengur gilt. Default (án þess að setja það) sýnir attribution.
Þetta kom upp í type-check og var lagað strax.

### 2. `components/weather/RoadMapPrototypeMap.tsx`

Nýtt client component:

- `'use client'`
- CSS import: `import 'maplibre-gl/dist/maplibre-gl.css'`
- `useEffect` með `async import('maplibre-gl')` -- forðast SSR browser-API vandamál
- LMÍ WMS raster source via `gis.lmi.is/geoserver/ows`
- Layer: `IS_50V:IS_50V` -- fyrsti kandídat, þarf validation (sjá neðar)
- Attribution: `formatLmiAttribution('IS 50V', '2026')` frá `openDataSources.ts`
- Center: `[-18.9, 64.9]` (miðja Íslands), zoom 6
- `map?.remove()` cleanup í useEffect return

### 3. `app/auth-mvp/vedrid/road-map-prototype/page.tsx`

Nýtt server component:

- `guardTeskeidSession()` -- krefst innskráningar
- `checkFeatureAccess('', email, 'road-intelligence-v1')` -- krefst flaggs
- Ef flagg er af: `notFound()`
- `next/dynamic` með `ssr: false` til að hlaða map component
- Einföld haus með "← Vedrid" hlekk og "Kort prototype" titil
- `h-screen overflow-hidden` -- kort fyllir skjáinn undir hausinum

### 4. `app/auth-mvp/vedrid/road-map-prototype/loading.tsx`

Eins og aðrar loading.tsx í vedrid möppunni -- notar `TeskeidLoader`.

### 5. `components/weather/WeatherOverviewClient.tsx`

Tvær breytingar:

- `import Link from 'next/link'` bætt við
- "Kort prototype →" hlekkur bætt við eftir `RoadIntelligencePreview` block,
  sýnilegur þegar `hasRoadIntelligence === true` óháð hvort tveir staðir eru
  valdir

---

## Validation

- `npm run type-check` -- exit code 0
- `npm run test:run` -- 120 test files, 3447 tests passed, 27 skipped, 8 todo

---

## Skrár breyttar

- `package.json` -- `maplibre-gl` bætt við
- `package-lock.json` -- uppfært
- `components/weather/RoadMapPrototypeMap.tsx` -- nýtt
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx` -- nýtt
- `app/auth-mvp/vedrid/road-map-prototype/loading.tsx` -- nýtt
- `components/weather/WeatherOverviewClient.tsx` -- Link import + prototype link

---

## Localhost checks for Stebbi

1. `npm run dev`
2. Fara á `/auth-mvp/vedrid` sem notandi með `road-intelligence-v1` flagg.
   Vænt: "Kort prototype →" sést neðst í route/RI section.
3. Smella á "Kort prototype →".
   Vænt: fer á `/auth-mvp/vedrid/road-map-prototype`.
4. Fara á `/auth-mvp/vedrid/road-map-prototype` sem notandi **án** flaggs.
   Vænt: 404.
5. Á prototype síðunni: MapLibre kort hleðst, Ísland sést í heild, kort fyllir
   skjáinn.

Ef kortið hleðst en engar tiles birtast (grár/hvítur bakgrunnur):

- `IS_50V:IS_50V` layer name kann að vera rangt
- Opna browser DevTools, fara í Network og athuga WMS GetMap request
- URL er sýnileg í `RoadMapPrototypeMap.tsx` -- layer name þarf að vera
  staðfest gegn `gis.lmi.is/geoserver/web/`
- Þetta er þekkt óvissa í M2A-1 og er skráð undir næstu skref

---

## LMÍ layer validation -- þarfnast M2A-1b

`IS_50V:IS_50V` er líklegasti first-try layer name en er ekki staðfestur með
raunverulegri tile render. Til að staðfesta:

```
curl "https://gis.lmi.is/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities" | grep -i "IS_50V\|grunnkort"
```

Eða opna `gis.lmi.is/geoserver/web/` og leita að layer sem hentar sem Iceland
basemap.

Ef `IS_50V:IS_50V` er rangt, eru næstu líklegir kandidatar:

- `grunnkort2025:grunnkort2025`
- `LMI_raster:LMI_raster`
- `IS_50V:vegir` eða `IS_50V:yfirlit`

Þetta er eins eða tveggja línu breyting í `RoadMapPrototypeMap.tsx`.

---

## Hvað er næst -- M2A-2

M2A-2 er Vegagerðin allowlisted proxy:

- `/app/api/map-proxy/route.ts`
- Tekur `source` param úr þekktum allowlist (t.d. `vegakerfi-wms`)
- Hardcoded endpoint og layer per `source` ID
- Engin arbitrary URL
- `no-store` cache headers í fyrstu
- Feature/auth gate ef tile cookies virka, annars rate-limit í proxy

Þegar proxy er tilbúinn, bæta við Vegagerðin WMS overlay í
`RoadMapPrototypeMap.tsx` sem annað raster source yfir LMÍ.

---

## Spurningar til Codex

1. Á Codex að byrja á M2A-2 proxy eða bíða eftir að Stebbi staðfesti að
   LMÍ tiles rendera rétt á localhost fyrst?
2. Á "Kort prototype →" link að vera í route/RI section eins og núna, eða
   ætti hann að vera í header/navigation á `/auth-mvp/vedrid`?
3. Ætti prototype page header að nota sama layout/shell og `/auth-mvp/vedrid`
   (t.d. sama auth wrapper) eða er "standalone fullscreen map" rétt fyrir M2?

---

## Óvissa

- `IS_50V:IS_50V` layer name þarf staðfestingu með raunverulegri render
- LMÍ tile performance á mobile er óþekkt þar til Stebbi prófar
- Vegagerðin proxy er ekki til ennþá -- M2A-2
- `road-intelligence-v1` flagg, SQL89 og Vercel env eru ennþá ósamþykkt í
  production
