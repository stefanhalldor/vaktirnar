# Claude handoff: TODO #70 v005 - vias refactor + Austurland done

Created: 2026-07-10 07:30
Timezone: Atlantic/Reykjavik
Tengist: TODO #70, v003/v004

## Staða

Breytingar gerðar, type-check og tests pass. **Ekki committað eða pushað** - bíður localhost-staðfestingar frá Stebbi.

## Breytingar

### `lib/weather/google.server.ts`

**`via` → `vias` refactor:**
- `CuratedRouteRule.via: { lat; lon }` → `vias: readonly { lat; lon }[]`
- `fetchCuratedRoute` notar nú `rule.vias.map(v => ({ via: true, location: ... }))` til að búa til `intermediates`

**Deildur fastar:**
```ts
const THRENGSLAVEGUR_VIA = { lat: 63.9550, lon: -21.4900 } // staðfest 2026-07-08
const HELLISHEIDI_VIA    = { lat: 64.0360, lon: -21.3920 } // bíður staðfestingar
```

**Nýr bounds:**
```ts
const EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS: Bounds = {
  minLat: 64.35,  // suður: suðurlandsreglur sjá um neðar
  maxLat: 65.50,  // norður: Mývatn (65.6), Akureyri (65.7) útilokuð
  minLon: -15.90, // vestur: Egilsstaðir (-14.4) er austar, þetta er aðeins vestur
  maxLon: -13.0,  // austur: austurfjörð
}
```

**Þrjár reglur í CURATED_ROUTE_RULES:**
1. `capital-area-to-thorlakshofn-via-threngslavegur` — `vias: [THRENGSLAVEGUR_VIA]`
2. `capital-corridor-to-south-east-via-hellisheidi` — `vias: [HELLISHEIDI_VIA]`
3. `capital-corridor-to-east-iceland-via-hellisheidi` (nýtt) — `vias: [HELLISHEIDI_VIA]`, labels: `['CURATED_VIA_HELLISHEIDI', 'CURATED_EAST_ICELAND_VIA_HELLISHEIDI']`

### `lib/__tests__/weather-google.test.ts`

6 nýjar prófanir:
- `vias` refactor: single-via rule gefur enn eitt `intermediates` item
- Egilsstaðir → `CURATED_VIA_HELLISHEIDI` ✓
- Egilsstaðir → `CURATED_EAST_ICELAND_VIA_HELLISHEIDI` ✓
- Egilsstaðir curated notar Hellisheiði via-hnit ✓
- Mývatn → ekkert `CURATED_VIA_HELLISHEIDI` ✓ (lon -16.99 < minLon -15.90)
- Selfoss → `CURATED_VIA_HELLISHEIDI` enn til staðar, ekki `CURATED_EAST_ICELAND` ✓

## Build status

```
npm run type-check  →  clean
npm run test:run    →  1975 passed, 0 failed
```

## Óstaðfest

- `HELLISHEIDI_VIA` hnit `64.0360, -21.3920` bíður localhost-staðfestingar — er þetta á Leið 1?
- `EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS` — er Egilsstaðir þar inni? Mývatn á ekki að vera þar.
- Framkvæmir Google rétt via-hnit fyrir `Reykjavík → Egilsstaðir` sem fer í gegnum Hellisheiði?

## Localhost checks for Stebbi

1. `Garðabær → Egilsstaðir`
   - Á að sýna `Um Hellisheiði` valkost í route picker.
   - Kortið á að fylgja Leið 1 yfir Hellisheiði í upphafi.
   - Terminal: `curatedRules: ["CURATED_VIA_HELLISHEIDI"]` (eða bæði labels).
   - Velja `Um Hellisheiði` og halda áfram → engin `selected_route_unavailable`.

2. `Reykjavík → Egilsstaðir` — sama.

3. `Garðabær → Selfoss / Hveragerði` — enn `Um Hellisheiði` (suðurlandsreglan).

4. `Garðabær → Þorlákshöfn` — enn `Um Þrengslaveg`, ekki `Um Hellisheiði`.

5. `Garðabær → Akureyri` — **enginn** `Um Hellisheiði`.

6. `Garðabær → Mývatn` — **enginn** `Um Hellisheiði`.

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki deploya fyrr en Stebbi hefur prófað á localhost og gefið leyfi.

## Eftir localhost-staðfestingu

Stebbi gefur leyfi → þá committum og pushum.

Ef via-hnit er rangt → leiðréttum hnit, keyrum tests aftur, bíðum eftir nýrri staðfestingu.
