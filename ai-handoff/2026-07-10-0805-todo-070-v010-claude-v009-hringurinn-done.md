# Claude handoff: TODO #70 v010 - Hringurinn + v006 cleanup done

Created: 2026-07-10 08:05
Timezone: Atlantic/Reykjavik
Tengist: TODO #70, v009

## Staða

Breytingar gerðar, type-check og tests pass. **Ekki committað eða pushað** - bíður localhost-staðfestingar.

```
npm run type-check  →  clean
npm run test:run    →  1980 passed, 0 failed
```

---

## Breytingar

### `lib/weather/google.server.ts`

**Þrengslavegur rule fjarlægð (v006 cleanup):**
- `capital-area-to-thorlakshofn-via-threngslavegur` rule fjarlægð úr `CURATED_ROUTE_RULES`
- `THRENGSLAVEGUR_VIA` fasti fjarlægður
- `THORLAKSHOFN_BOUNDS` fjarlægt

**`CuratedRouteRule` type uppfært:**
- Bætt við `minFastestRouteDistanceM?: number` — skip rule ef fastest route < þröskuldur

**Nýjar fast-ar:**
```ts
const HELLISHEIDI_VIA         = { lat: 64.036, lon: -21.392 }  // pending verification
const RING_ROAD_SOUTH_VIA     = { lat: 63.415, lon: -18.977 }  // Route 1, Mýrdalssandur — pending
const RING_ROAD_EAST_VIA      = { lat: 64.295, lon: -15.148 }  // Route 1, milli Djúpivogur og Höfn — pending
const RING_ROAD_NORTHEAST_VIA = { lat: 65.130, lon: -14.514 }  // Route 1, suður af Egilsstöðum — pending
```

**Nýtt `ICELAND_BOUNDS`:**
```ts
const ICELAND_BOUNDS: Bounds = { minLat: 63.0, maxLat: 67.0, minLon: -25.0, maxLon: -12.0 }
```

**Nýtt Hringurinn rule:**
```ts
{
  id: 'long-trip-ring-road',
  logName: 'Hringurinn',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: { bounds: [ICELAND_BOUNDS] },
  minFastestRouteDistanceM: 350_000,
  vias: [HELLISHEIDI_VIA, RING_ROAD_SOUTH_VIA, RING_ROAD_EAST_VIA, RING_ROAD_NORTHEAST_VIA],
  labels: ['CURATED_RING_ROAD'],
}
```

**`getCuratedRouteOptions` uppfært:**
- Tekur nú `fastestDistanceM: number` sem argument
- Sleppir rules þar sem `fastestDistanceM < rule.minFastestRouteDistanceM`

**`getRouteOptions` uppfært:**
- Reiknar `fastestDistanceM = routeOptions[0]?.distanceM ?? 0` (fastest by duration)
- Sendir það í `getCuratedRouteOptions`

### `messages/is.json`

- `routeOptionShortest`: `"Fljótlegasta leið"` → `"Fljótlegasta leiðin"` (v006 cleanup)
- Bætt við: `"routeOptionRingRoad": "Hringurinn"`

### `messages/en.json`

- Bætt við: `"routeOptionRingRoad": "Ring Road"`

### `components/weather/RouteSelectionStep.tsx`

Label priority (highest first):
1. `CURATED_RING_ROAD` → `"Hringurinn"` (nýtt, hæst)
2. `CURATED_VIA_HELLISHEIDI` → `"Um Hellisheiði"`
3. `CURATED_VIA_THRENGSLAVEGUR` → `"Um Þrengslaveg"` (kept for backward-compat display, no longer generated)
4. idx === 0 → `"Fljótlegasta leiðin"`
5. isDefault → `"Sjálfgefin Google-leið"`
6. else → `"Önnur leið"`

### `lib/__tests__/weather-google.test.ts`

**Þrengslavegur tests:**
- Fjarlægðar 3 prófanir sem bjuggust við `CURATED_VIA_THRENGSLAVEGUR` generation
- Endurskrifaðar staticDuration/sorting tests (voru með `GARDABAER → THORLAKSHOFN`) → nota nú `GARDABAER → HVERAGERDI`
- Bætt við regression: `capital area → Þorlákshöfn` → enginn curated request, engin `CURATED_VIA_THRENGSLAVEGUR`
- Endurskrifað `capital area → Þorlákshöfn triggers Þrengslavegur, not Hellisheiði` → `does not trigger CURATED_VIA_HELLISHEIDI (lon outside south-east bounds)`

**Hringurinn tests (7 nýjar):**
1. `capital area → Akureyri with distance >= 350 km triggers CURATED_RING_ROAD`
2. `capital area → Akureyri Hringurinn request has 4 via intermediates`
3. `Hringurinn first via-point is Hellisheiði coordinate`
4. `capital area → Akureyri with distance < 350 km does NOT trigger CURATED_RING_ROAD`
5. `Hringurinn is skipped when its geometry matches an existing route`
6. `Hringurinn appears alongside fastest route when distinct, sorted by durationS`
7. `Reykjanes/southwest origin does not trigger Hringurinn even for long distance`

---

## Óstaðfent - LOKAÐ bíður localhost-skoðunar

**Via-punktar á Hringveginum eru EKKI staðfestir sjónrænt:**

```ts
HELLISHEIDI_VIA         = { lat: 64.036, lon: -21.392 }  // pending
RING_ROAD_SOUTH_VIA     = { lat: 63.415, lon: -18.977 }  // Route 1, Mýrdalssandur
RING_ROAD_EAST_VIA      = { lat: 64.295, lon: -15.148 }  // milli Djúpivogur og Höfn
RING_ROAD_NORTHEAST_VIA = { lat: 65.130, lon: -14.514 }  // suður af Egilsstöðum
```

**Stærsta áhættan:** Google skilar leið sem fer af Þjóðvegi 1 og inn í bæjarstrætum vegna rangra via-hnita.

---

## Localhost checks fyrir Stebbi

1. `Reykjavík → Þorlákshöfn`
   - Búist við: ekkert `Um Þrengslaveg` — aðeins Google sjálfgefnar leiðir
   - Búist við: ekkert Hringurinn (< 350 km)

2. `Garðabær → Selfoss / Hveragerði`
   - Búist við: `Um Hellisheiði` enn til staðar
   - Búist við: ekkert Hringurinn (< 350 km)

3. `Garðabær → Egilsstaðir`
   - Búist við: `Um Hellisheiði` enn til staðar
   - Búist við: hugsanlega Hringurinn (> 350 km) — ef hann kemur, á leiðin að fara suður/austur ekki inn í bæjargötur

4. **`Reykjavík → Akureyri`** (lykilpróf)
   - Búist við: `Hringurinn` birtist sem valkostur
   - Leiðin á að fara: Reykjavík → Hellisheiði → suðurströnd → austurland → norður → Akureyri
   - EKKI: bein leið norður (35-40 mín.), slaufur inn í bæina á via-punktum
   - Veldu Hringurinn og haltu áfram → engin `selected_route_unavailable`

5. `Garðabær → Akureyri`
   - Sama og #4

6. `Reykjavík → Egilsstaðir`
   - Búist við: bæði `Um Hellisheiði` (Austurland rule) og `Hringurinn` — eða aðeins eitt ef geometry er identical
   - Merki á að vera skýr og ekki villandi

7. Kortið á öllum Hringurinn-leiðum: leiðin á að fylgja Þjóðvegi 1 á suðurströnd og austurland án slaufa

---

## Ef via-hnit eru röng

Breyttu hnitum í `google.server.ts` (fastarnir `RING_ROAD_*`), keyrðu `npm run test:run`, bíddu eftir nýrri staðfestingu.

Tests eru parametric-óháð via-hnitum nema einn: `Hringurinn first via-point is Hellisheiði coordinate` sem athugar `HELLISHEIDI_VIA`.

---

## Eftir localhost-staðfestingu

Stebbi gefur leyfi → committum og pushum.
