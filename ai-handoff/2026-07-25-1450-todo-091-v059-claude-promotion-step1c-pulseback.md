# TODO 091 v059 — Promotion áfangi 1b+1c lokið

Created: 2026-07-25 15:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Samantekt á því sem er tilbúið (ócommittað)

Öll þrjú undirskref áfanga 1 eru lokið:

### 1a — Parent layouts (v057)
- `app/vedrid/layout.tsx` — MapLibre CSS + viewport fyrir `/vedrid/*`
- `app/auth-mvp/vedrid/layout.tsx` — MapLibre CSS + viewport fyrir `/auth-mvp/vedrid/*`

### 1b — Typed navigation (Codex v058)
- `lib/weather/roadMapNavigation.ts` (ný) — `RoadMapNavigation` type, helpers
- `components/weather/RoadMapPrototypeMap.tsx` — `navigation` prop, helpers notaðar
- `components/weather/DriveJourneyPanel.tsx` — `stationReturnTo` required prop
- `lib/__tests__/road-map-navigation.test.ts` (ný) — 4 tests

### 1c — pulseBack canonical paths (þetta skref)
- `lib/weather/pulseBack.ts` — `/vedrid` og `/auth-mvp/vedrid` fluttar úr
  `overview` í `drive`; prototype path hlutast af í sama `drive` block
- `lib/__tests__/pulseBack.test.ts` — `overview (auth/public)` describe blocks
  endurnefnd og uppfærð í `drive`; `/vedrid-anything` evil lookalike bætt við;
  bare prototype path test bætt við

## Staðfesting

```
npm run type-check          → exit 0
vitest run pulseBack + road-map-navigation → 36/36 passed
```

## Þetta er EKKI committuð

Allt frá v057 til v059 bíður í einum commit þegar Stebbi gefur leyfi.

## Áhrif 1c á notendur núna (áður en áfangi 2)

`/auth-mvp/vedrid` og `/vedrid` flokkast nú sem `drive` í stað `overview`.
Notendur sem koma til baka frá stöðvaspjaldi með þessar slóðar sem `returnTo`
munu sjá "Til baka í akstur" í stað "Til baka í spákort". Þetta er minna
sjónrænt mismatch sem leiðréttist sjálfkrafa þegar page promotion (áfangi 2)
fer fram.

---

## Næsti áfangi — Áfangi 2: page promotion og prototype redirect

Þetta er meginverkið. Þegar Stebbi staðfestir áfanga 1 er hægt að hefja:

### Skrár sem breytast

**`app/vedrid/page.tsx`**
- Skipta `WeatherOverviewClient` út fyrir `RoadMapPrototypeMap` með
  `navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}`
- Halda `WEATHER_ENABLED` og `AUTH_MVP_ENABLED` guards óbreyttum
- `isAuthenticated` er alltaf `false` (public page — auth user er redirectaður
  í middleware)

**`app/auth-mvp/vedrid/page.tsx`**
- Skipta `WeatherOverviewClient` út fyrir `RoadMapPrototypeMap` með
  `navigation={{ canonicalPath: '/auth-mvp/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}`
- Halda `guardTeskeidSession()` og `checkFeatureAccess` óbreyttum
- `isAuthenticated={true}` (þar sem session guard er kominn)
- Fjarlægja `hasRoadIntelligence` prop (kortið keyrir eigin conditional access
  logic)

**`app/auth-mvp/vedrid/road-map-prototype/page.tsx`**
- Breyta í `redirect('/vedrid')` með query string varðveittum
- Public notandi lendir á `/vedrid`, middleware canonicalize-ar auth notanda
  þaðan á `/auth-mvp/vedrid`

### Spurningar sem þarf að leysa áður en áfangi 2 fer fram

1. **`hasRoadIntelligence` prop á WeatherOverviewClient** — núverandi
   `app/auth-mvp/vedrid/page.tsx` leggur þetta fyrir kortið. `RoadMapPrototypeMap`
   sækir ekki þennan prop beint. Þarf að staðfesta hvort road-intelligence
   access logic sé inni í componentinum sjálfum.

2. **`tripHref` prop** — `WeatherOverviewClient` fær `tripHref` og
   `stationPulseReturnBase`. Þessar props ganga í gegn. `RoadMapPrototypeMap`
   hefur eigin `navigation` contract. Þarf að staðfesta að engar `WeatherOverviewClient`
   prop séu tapaðar við promotion.

3. **`/vedrid/ferdalagid`** — heldur áfram að rendera `WeatherOverviewClient`
   ferðalagið? Eða er þetta route falið í áfanga 2? Stebbi ákveður.

4. **Prototype redirect query handling** — `redirect()` í Next.js App Router
   styður ekki sjálfkrafa query forwarding. Þarf annaðhvort middleware redirect
   eða dynamic route handler sem les `request.url` og forwarda params.

### Staðfestingarhringur áfanga 2

```
npm run type-check
npm run test:run
npm run build
git diff --check
```

Auk browser-prófunar á localhost:
- `/vedrid` → nýja kortið (public)
- `/auth-mvp/vedrid` → nýja kortið (auth)
- `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1`
  → redirect → `/vedrid?...` → middleware → `/auth-mvp/vedrid?...` (auth)
- "Til baka í akstur" frá stöðvaspjaldi virkar
- `WeatherOverviewClient` og `/vedrid/ferdalagid` óbreyttar (ef þannig er ákveðið)
