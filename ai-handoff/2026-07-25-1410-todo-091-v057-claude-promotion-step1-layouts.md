# TODO 091 v057 — Promotion áfangi 1a: parent layout skrár

Created: 2026-07-25 14:50
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Hvað var gert

Tvær nýjar layout-skrár búnar til sem eru prerequisite fyrir promotion:

### `app/vedrid/layout.tsx` (ný)

Importar `maplibre-gl/dist/maplibre-gl.css` og setur `viewportFit: cover`
fyrir öll public weather routes (`/vedrid/*`).

### `app/auth-mvp/vedrid/layout.tsx` (ný)

Sama contract fyrir allar authenticated weather routes
(`/auth-mvp/vedrid/*`), þar með talið `/auth-mvp/vedrid/road-map-prototype`.

### `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` (óbreytt)

Hrófað ekki við. CSS og viewport eru nú tvíteknar (parent + child) en
webpack deduplicates. Hægt er að hreinsa þessa skrá í seinni áfanga þegar
við erum viss um Next.js inheritance í production.

## Staðfesting

```
npm run type-check  → exit 0
npm run build       → exit 0, 100/100 static pages, engar nýjar villur
```

Öll warnings eru pre-existing (fyrirliggjandi exhaustive-deps og img). Engin
ný warning bættist við.

## Það sem þetta leysir

Áður myndi `/vedrid` rendera `RoadMapPrototypeMap` án MapLibre CSS þar sem
CSS-importið sat eingöngu í prototype-layout. Nú þekur
`app/vedrid/layout.tsx` öll routes undir `/vedrid/` og
`app/auth-mvp/vedrid/layout.tsx` þekur `/auth-mvp/vedrid/` og allar
undir-routes þar.

## Þetta er EKKI enn committuð

Skrefið er tilbúið til localhost-prófunar og review. Ekki commit eða push
fyrr en Stebbi staðfestir.

---

## Næstu skref (Áfangi 1b)

Þessi skrár eru ein línán á leiðinni. Röð áfanga:

### Áfangi 1b — Typed navigation + path parameterization

**Hvað:** Bæta `basePath` prop (eða typed `RoadMapNavigation` contract) við
`RoadMapPrototypeMap` og `DriveJourneyPanel`. Nota í stað allra
hardcoded-slóða.

**Skrár:**
- `components/weather/RoadMapPrototypeMap.tsx` — bæta við `basePath` prop,
  nota í `routeReturnHref()` (l. 4290), sign-in CTA (l. 6332),
  pulse hrefs (ll. 7114-7117)
- `components/weather/DriveJourneyPanel.tsx` — bæta við `returnTo` prop,
  nota á ll. 293, 380, 405

**Áhætta:** Lítil. Þetta eru string-breytingar með prop-threading. Þarf að
ganga úr skugga um að `basePath` sé rétt sent frá báðum page-wrappers.

### Áfangi 1c — pulseBack og tests

**Hvað:** Bæta `/vedrid` og `/auth-mvp/vedrid` við sem gild `drive`
destinations í `lib/weather/pulseBack.ts`. Uppfæra tests.

**Mikilvægt:** Þetta þarf að koma Á UNDAN `overview`-matchinu í kóðanum
(sjá v056 leiðréttingu) þar sem `/vedrid` og `/auth-mvp/vedrid` eru bæði
`drive` og `overview` möguleg og `drive` á að vinna.

**Skrár:**
- `lib/weather/pulseBack.ts`
- `lib/__tests__/pulseBack.test.ts`

### Áfangi 2 — page wrappers og prototype redirect

**Hvað:** Breyta `app/vedrid/page.tsx` og `app/auth-mvp/vedrid/page.tsx` til
að rendera `RoadMapPrototypeMap` með réttum `basePath`. Gera
`app/auth-mvp/vedrid/road-map-prototype/page.tsx` að redirect á canonical.

**Krafist:** 1b og 1c eru lokið og prófuð áður en þetta fer fram.

**Fallgildur:** Halda bæði `/vedrid/ferdalagid` og
`/auth-mvp/vedrid/ferdalagid` óbreyttum í þessum áfanga.

### Áfangi 3 — station click fyrir óinnskráðan notanda (Valkostur A)

**Hvað:** Þegar óinnskráður notandi smellir á stöðvarpunkt á kortinu birtist
inline sign-in CTA í stað þess að navigatea á auth-gated station page.

**Skrár:**
- `components/weather/RoadMapPrototypeMap.tsx` — breyta click handler á
  stöðvum þannig að `!isAuthenticated` sýnir inline CTA

---

## Localhost check eftir Áfanga 2

(Þetta er það sem Stebbi prófar áður en commit fer fram á Áfanga 2)

1. `/auth-mvp/vedrid/road-map-prototype` — kortið hleðst eins og áður.
2. DevTools Network: `maplibre-gl.css` hlaðast rétt.
3. `/vedrid` (þar sem `WEATHER_ENABLED=All`) — er enn `WeatherOverviewClient`;
   MapLibre CSS er þó nú til staðar ef við prófum manuelt með
   `RoadMapPrototypeMap` á þessari slóð.
4. Console á báðum: engar CSS/sizing villur.

---

## Tímalína

- v055: Claude rýni — fann MapLibre CSS gap, path bugs, pulseBack kind mismatch
- v056: Codex rýni — fann chat-gate, redirect direction, query contract, typed nav
- v057 (þetta): Áfangi 1a — layouts, build grænt, ócommittað
- v05x: Áfangi 1b-c — path parameterization + pulseBack
- v05x: Áfangi 2 — page wrappers + redirect
- v05x: Áfangi 3 — station click UX (Valkostur A)
- Final: staðfestingarhringur + release
