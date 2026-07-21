# Handoff: Blank map diagnostic session

Created: 2026-07-21 00:35
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Diagnostic handoff for Codex review

---

## Staða þegar þessi handoff er skrifuð

MapLibre GL JS kort á `/auth-mvp/vedrid/road-map-prototype` er hvítt/tómt þrátt fyrir:

- Auth + feature flag virkar (201 stöðvar sást í legend í öllum skjámyndum)
- Allar API requests skila 200
- Engar MapLibre villur í console
- Container er með raunverulegar stærðir (546×879 px staðfest í log)
- type-check og tests eru grön

---

## Tímalína tilrauna (öll `RoadMapPrototypeMap.tsx` breytingar í þessari lotu)

### v257/v258 (Codex)
- LMÍ WMS (`{bbox-epsg-3857}`) direkt í MapLibre
- Niðurstaða: hvítt kort

### v259 (Claude) — WMTS proxy tilraun
- Búin til `lib/road-intelligence/lmiTileProxy.ts` með GWC WMTS endpoint
- Búin til `/api/teskeid/road-intelligence/lmi-tile/route.ts`
- Skiptum LMÍ source yfir í `/api/teskeid/road-intelligence/lmi-tile?z={z}&x={x}&y={y}`
- Niðurstaða: 502 Bad Gateway — GWC hefur ekki `LMI_Island_einfalt` cached

### WMS bbox proxy (Claude, sami lota)
- Pivotaðum `lmi-tile` yfir í WMS bbox approach:
  `?bbox={bbox-epsg-3857}` → LMÍ OWS WMS server
- Niðurstaða: 200 OK með `image/png` — en kort enn hvítt
- Greining: `LMI_Island_einfalt` ("einfalt" = simplified) er minimalist lag sem lítur hvítt út á zoom 6

### CartoDB Voyager (Claude, sami lota)
- Skiptum yfir í `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`
- XYZ tiles, CORS open, engin proxy þörf
- Niðurstaða: Subtitle uppfærðist ✓, en kort enn hvítt
- Breytingar á subtitle text í `messages/is.json` og `messages/en.json` ✓

### Resize fix tilraunir (Claude, sami lota)
Þrjár mismunandi tilraunir:

**Tilraun 1:** `min-h-0` á `flex-1` div í page.tsx + `requestAnimationFrame(() => map.resize())`
Niðurstaða: Engin breyting

**Tilraun 2:** `ResizeObserver` via `resizeObserverRef` + `map.resize()` í `map.on('load')`
Niðurstaða: Engin breyting
Galli: `resizeObserver` var local í `initMap()` closure, var aldrei accessible í cleanup — búið til `resizeObserverRef` til að laga

**Tilraun 3:** Ytri div breytt frá `relative w-full h-full` → `absolute inset-0`
Niðurstaða: Container size staðfest sem **546×879** í console log — RÉTT STÆRÐ
En kort enn hvítt

---

## Þekkt staðfest gögn (skjámyndir + terminal)

| Atriði | Staða |
|--------|-------|
| `GET /auth-mvp/vedrid/road-map-prototype` | 200 |
| `GET /api/teskeid/road-intelligence/lmi-tile?bbox=...` | 200 image/png |
| `GET /api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox=...` | 200 image/png |
| `GET /api/teskeid/road-intelligence/station-markers` | 200 GeoJSON (201 features) |
| CartoDB Voyager tiles (browser, direct) | Ekki séð í terminal — eru þessar requests sendar? |
| `[RoadMapPrototype] container size at init: 546 x 879` | ✓ |
| MapLibre errors í console | Engar |
| NavigationControl sýnilegur | Nei |
| Basemap sýnileg | Nei |
| Wind dots sýnileg | Nei |

---

## Núverandi staða kóða

### `components/weather/RoadMapPrototypeMap.tsx`

Notar:
- `CARTO_VOYAGER_TILES = ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png']`
- `absolute inset-0` á ytri div (ekki `relative w-full h-full`)
- `requestAnimationFrame(() => map.resize())` eftir `new Map()`
- `map.resize()` efst í `map.on('load')`
- `ResizeObserver` via `resizeObserverRef` sem kallar `map.resize()` á stærðarbreytingu
- `map.on('error', ...)` logger í dev
- Díagnóstísk logs (sjá neðar)

### `app/auth-mvp/vedrid/road-map-prototype/page.tsx`

```tsx
<main className="flex flex-col h-screen bg-background overflow-hidden">
  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
    ...header...
  </div>
  <div className="flex-1 relative min-h-0">
    <RoadMapPrototypeMap />
  </div>
</main>
```

---

## Díagnóstísk logs sem eru til staðar núna

Eftirfarandi er logað í `NODE_ENV !== 'production'`:

### 1. Container við init
```
[RoadMapPrototype] container at init: {
  clientW, clientH, offsetW, offsetH, inDocument
}
```

### 2. Canvas eftir `new Map()`
```
[RoadMapPrototype] canvas after new Map(): {
  w, h,               // canvas.width, canvas.height (backing store)
  styleW, styleH,     // canvas.style.width/height (CSS)
  display,            // computed style display
  visibility,         // computed style visibility
  opacity,            // computed style opacity
  inDocument          // document.contains(canvas)
}
```

### 3. WebGL context
```
[RoadMapPrototype] WebGL context: 'ok' | 'UNAVAILABLE or already held by MapLibre'
```
Plus `webglcontextlost` event listener á canvas.

### 4. Canvas eftir rAF resize
```
[RoadMapPrototype] canvas after rAF resize: W x H
```

### 5. Við `map.on('load')`
```
[RoadMapPrototype] map.on(load): canvas W x H | isStyleLoaded: true/false
[RoadMapPrototype] DOM check: {
  mapDivFound,        // .maplibregl-map element til staðar?
  mapDivW, mapDivH,   // offset dimensions á MapLibre wrapper div
  mapDivOverflow,     // overflow CSS á wrapper (á að vera 'hidden')
  canvasInDOM,        // canvas element til staðar?
  canvasOffsetW,      // offset width á canvas
  canvasOffsetH       // offset height á canvas
}
```

---

## Hvað Codex/næsti agent þarf að gera

### Skref 1: Skoða console eftir full-page reload

Opna `/auth-mvp/vedrid/road-map-prototype` af ferskum (Ctrl+Shift+R), skoða allar `[RoadMapPrototype]` línur í console og skrá niður:

**Spurning A:** Er `container at init` stærðin rétt (clientW/H og offsetW/H)?
**Spurning B:** Hvað er canvas.width/height ÁÐUR en resize?
**Spurning C:** Hvað er WebGL context — ok eða UNAVAILABLE?
**Spurning D:** Hvað eru canvas computed styles (display, visibility, opacity)?
**Spurning E:** Er canvas `inDocument: true`?
**Spurning F:** Hvað er canvas size EFTIR rAF resize?
**Spurning G:** Hvað sýna DOM check tölurnar við `map.on(load)`?

### Skref 2: Network tab

Opna Network tab (DevTools), reloada síðuna, og staðfesta:
- Koma CartoDB tile requests (`basemaps.cartocdn.com/...`)? Ef ekki, þá er MapLibre ekki að senda tile requests.
- Koma `lmi-tile` requests enn eða eru þær þöglar?
- Er `station-markers` 200?

### Skref 3: Elements tab

Í Elements/Inspector tab:
- Finna `containerRef` div (leitaðu að `.maplibregl-map` eða `canvas`)
- Staðfesta að `.maplibregl-map` div sé til
- Athuga computed styles á `.maplibregl-canvas`:
  - `display`: ætti að vera `block`
  - `width/height`: ætti að vera > 0
  - `transform` eða `clip` sem gæti falið það

### Skref 4: Hugsanlegar orsakir eftir greiningargögn

**Ef WebGL = UNAVAILABLE:**
MapLibre GL krefst WebGL. Ef WebGL er ekki í boði í þessu browser/driver sambandi, er kort aldrei renderað. Fix: Nota Leaflet.js í staðinn sem Canvas/SVG rendererar (þarf þó umritunarvinnu).

**Ef canvas display = 'none' eða visibility = 'hidden':**
MapLibre CSS er ekki að hlaðast. Prófaðu: flytja `import 'maplibre-gl/dist/maplibre-gl.css'` í route-scoped layout (`app/auth-mvp/vedrid/road-map-prototype/layout.tsx`).

**Ef canvas er ekki inDocument:**
Grunsamlegur lifecycle vandamál — containerRef er detached.

**Ef canvas.width/height eru 0 áður en resize:**
MapLibre tók stærð við init. rAF resize á að laga þetta. Ef eftir rAF resize er canvas enn 0×0, þá er foreldri container 0×0 þrátt fyrir container logger.

**Ef mapDivFound = false eða mapDivW/H = 0:**
MapLibre's innra CSS er ekki virkt (líklega CSS import vandamál).

**Ef allt lítur rétt út en map er enn hvítt:**
MapLibre GL JS v5.24.0 WebGL rendering vandamál. Prófaðu að downgrade-a í v4 eða skipta yfir í Leaflet.

---

## Skrár breyttar í þessari lotu (v259-v260)

### Nýjar skrár
- `lib/road-intelligence/lmiTileProxy.ts`
- `lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` (27 tests)
- `app/api/teskeid/road-intelligence/lmi-tile/route.ts`

### Breyttar skrár
- `components/weather/RoadMapPrototypeMap.tsx` — margbreytingar (sjá tímalínu)
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx` — `min-h-0` á flex-1 div
- `messages/is.json` — subtitle: "CartoDB + Vegagerðin"
- `messages/en.json` — subtitle: "CartoDB + Vegagerðin"
- `messages/is.json`, `messages/en.json` — Codex v258 bætti við fleiri keys

---

## Validation

- `npm run type-check` — exit code 0
- `npm run test:run` — 123 files, 3477 tests passed (öll vitest tests grön)

---

## Ef Codex tekur þetta

Vinsamlegast:

1. Keyrðu EKKI SQL
2. Keyrðu EKKI migration
3. Commitaðu EKKI
4. Lestu console diagnostics (skref 1 hér að ofan)
5. Ef WebGL = UNAVAILABLE: skrifaðu handoff og spurðu Stebba hvort Leaflet eigi frekar við
6. Ef CSS vandamál: prófaðu route layout import
7. Ef allt lítur rétt út: prófaðu MapLibre v4 eða Leaflet
8. Skráðu niður allt í nýjan handoff (v261)
