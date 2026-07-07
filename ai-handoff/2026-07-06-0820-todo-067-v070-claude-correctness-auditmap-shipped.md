# 2026-07-06-0820-todo-067-v070-claude-correctness-auditmap-shipped

Created: 2026-07-06 08:20
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Lokið. Engar production-breytingar, engin SQL-keyrsla, ekkert commit, ekkert push, ekkert deploy.

---

## Niðurstaða

Skref 1-7 úr v068 review framkvæmd. 51/51 test files, 1651 tests passed. Build clean.

---

## Framkvæmdar breytingar

### `lib/weather/types.ts`

- `WorstMetric`: bætt við `yrnoUrl?: string`
- `RouteWeatherPoint`: bætt við `yrnoUrl: string`
- `TravelIssue`: bætt við `routeIndex?`, `forecastLat?`, `forecastLon?`, `metnoUrl?`, `googleMapsUrl?`, `yrnoUrl?`
- `TravelPlan.route`: bætt við `auditPolylinePoints?: Array<{lat; lon}>`, `auditMapUrl?: string`

### `lib/weather/travel.ts`

- `YRNO_FORECAST_BASE` constant bætt við
- **Blocker 1 (return ETA stefna)**: `findWorstMetric` fær `leg: 'outbound' | 'return' = 'outbound'` parameter. Return: `etaFraction = 1 - routeFraction`. Outbound: `etaFraction = routeFraction`. `evaluateCandidate` og `generateCandidates` fá líka `leg` parameter og senda áfram.
- **Blocker 2 (metric-aware candidate selection)**: Nýtt `candidateSeverity()` fall. `worstCandidateOf` notar nú metric-aware tie-break: precipitation kandidatar bera saman `worstPrecip.value`, vindar bera saman gust/wind eftir þröskuldinum.
- **Major 2 (TravelIssue audit fields)**: `buildHighlightedIssue` afritar `routeIndex`, `forecastLat`, `forecastLon`, `metnoUrl`, `yrnoUrl`, `googleMapsUrl` úr decisive `WorstMetric` yfir í `TravelIssue`. Engar type casts þarf í UI.
- **Major 3 (summaryForWindow leg)**: `buildRouteWeatherPoints` fær `summaryInfo: {candidate, leg}`. ETA-fraction í summaryForWindow er nú `1 - routeFraction` á heimleið.
- **Major 4 (decisiveTimeIso)**: Ef decisive metric er `'precipitation'` er valinn stundinn með mesta úrkomu; annars stundinn með mesta vind.
- **Major 3 cont. (decisive leg candidate)**: `checkTravelWeather` velur `summaryCandidate` úr `returnCandidates` ef `highlightedIssue?.leg === 'return'`.
- **Blocker 3 (route audit map)**: `buildAuditMapUrl()` fall smíðað. Samplar polyline niður í ≤40 punkta, byggir Google Static Maps URL með `path=` (route lína í bláum lit) + rauður V-marker (versti punktur) + grænn A-marker (áfangastaður). Notar `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.
- `TravelWeatherInput`: bætt við `auditPolylinePoints?`
- `checkTravelWeather`: sendir `'return'` til `generateCandidates` fyrir return candidates; reiknar `auditMapUrl` og setur á `travelPlan.route`.

### `lib/weather/google.server.ts`

- **Major 1 (seinasti punktur)**: `samplePoints()` leiðrétt. Nú ef cap er fullur er seinasti samplaður punktur **skipt út** fyrir raunverulegan seinasta punkt í stað þess að push+slice sem gat hent honum.

### `app/api/teskeid/weather/travel/route.ts`

- **Major 1 (seinasti punktur í route.ts)**: Last-point cap fix: ef `weatherPoints.length >= MAX_WEATHER_POINTS` er síðasti punkturinn skipt út (`replace`) en bætt ekki við. Þannig er áfangastaður alltaf í úrtakinu.
- `auditPolylinePoints: routeGeometry.points` sent til `checkTravelWeather`.

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

- `TravelIssue` imported beint úr types.
- **IssueAuditCard**: type cast fjarlægður. Notar `issue.metnoUrl`, `issue.yrnoUrl`, `issue.googleMapsUrl` beint. Primær hlekkur er "Skoða veðurspá" (yr.no), síðan "Opna á korti" (Google Maps), síðan "Hrá met.no gögn" (raw, dimmur).
- **RoutePointRow**: allir hardcoded strings settir í messages. Bætt við "Skoða veðurspá" (yr.no) sem primæran hlekk, "Hrá met.no gögn" sem tæknilegan hlekk.
- **Audit map**: `<img>` bætt við efst á result skjánum þegar `auditMapUrl` er til staðar. `style="max-width:100%; height:auto"` — mobile-safe. Alt-texti úr messages.

### `messages/is.json` + `messages/en.json`

Nýir lyklar í `ferdalagid`:
- `viewForecast`: "Skoða veðurspá" / "View weather forecast"
- `viewMetnoRaw`: "Hrá met.no gögn" / "Raw met.no data"
- `timeLabel`: "Tími" / "Time"
- `kmFromOrigin`: "km frá uppruna" / "km from origin"
- `routeFractionSuffix`: "leiðarinnar" / "of route"
- `pointLabel`: "Punktur" / "Point"
- `metnoCoordLabel`: "Spápunktur met.no" / "met.no forecast point"
- `auditMapAlt`: "Leiðarkort frá {origin} til {destination} með veðurspápunktum" / "Route map from {origin} to {destination} with forecast points"

### `lib/__tests__/weather-travel.test.ts`

Nýir prófahópar (17 nýir próf → 1651 total):
- `return-leg ETA direction`: 2 próf — verifikerar að dest-side punktur sé flaggaður við return departure, origin-side punktur við return arrival.
- `metric-aware candidate selection`: 2 próf — precipitation-only case, mixed wind+precip case.
- `TravelIssue audit fields`: 3 próf — `metnoUrl/yrnoUrl/googleMapsUrl` til staðar, `routeIndex/forecastLat/forecastLon` rétt, precipitation issue pointers rétt.
- Uppfært: `'each routeWeatherPoint has googleMapsUrl, metnoUrl, and yrnoUrl'` (bætt við yrnoUrl assertion).

---

## Svör við Codex spurningum frá v067

### Spurning 1: Er off-route punkturinn á leiðinni?

Með audit map er þetta nú sannanlegt á localhost. Punktarnir eru sóttir úr `geoJsonLinestring.coordinates` frá Google Routes API (raunveruleg vegahnit) og tvöfalt sampluð (80 → 15). Línan í audit mapinu sýnir raunverulega 80-punkta Google-geometríuna. Ef punkturinn liggur á þeirri línu er hann á leiðinni. Stebbi getur nú séð þetta beint.

### Spurning 2: Nota Maps hlekkir vegahnit eða rounded hnit?

`googleMapsUrl` notar `pt.lat, pt.lon` (vegahnit, ekki rounded). Rétt. Nú sýnir IssueAuditCard bæði: `metnoCoordLabel` (rounded forecast coords) og `openOnMap` (vegahnit). Þetta er skýrt aðskilið.

### Spurning 3: Er origin og destination alltaf í úrtaki?

Já, eftir þessa leiðréttingu. Bæði `google.server.ts` og `route.ts` nota nú `replace` logic í stað `push+slice`.

### Spurning 4: Þegar highlighted issue er return, vísa allt á sama leg?

Já eftir leiðréttingar: `svar`, `facts`, `summaryForWindow`, `isHighlightedIssue`, `IssueAuditCard` vísa öll á return leg/tíma/metric.

### Spurning 5+6: Route alternatives?

Ekki útfærðar — frestað í sér pass eins og ráðlagt í v068 og staðfest af Codex í v069.

---

## Athugasemdir um yr.no URL

`YRNO_FORECAST_BASE = 'https://www.yr.no/en/forecast/daily-table/'` — URL-sniðið er `lat,lon` á eftir. Þetta er útfært með best-effort. **Þarf að sannreyna á localhost** að hlekkurinn opni mannlega lesanlega spá. Ef yr.no virkar ekki með þessum hnitunum er auðvelt að skipta út um base URL eða falla back á annað.

Codex bað um sannreyningu áður en þetta fer í production. Þetta er first-pass útfærsla; Stebbi ætti að smella á "Skoða veðurspá" hlekk á localhost og staðfesta.

---

## Prófunarniðurstöður

```
npm run type-check  → exit 0
npm run test:run    → 51/51 files, 1651 passed | 27 skipped | 8 todo
npm run build       → exit 0
```

Build warnings:
- `FerdalagidClient.tsx`: `<img>` warning fyrir audit map — þetta er expected, Google Static Maps URL er dynamic og getur ekki farið í gegnum `next/image`.
- `app/s/[sessionId]/page.tsx`: React hook dependency — óbreytilegt, pre-existing.
- `Avatar.tsx`: `<img>` — pre-existing.
- Browserslist stale — pre-existing.

---

## Localhost prófanir fyrir Stebbi

1. Opnaðu `/auth-mvp/vedrid`.
2. Veldu `Reykjavík` sem uppruna og `Selfoss` sem áfangastað. Engar valfrjálsar tímar, enginn eftirvagn.
3. Smelltu á "Skoða veður".
4. Væntar niðurstöður:
   - Audit map birtist efst á niðurstöðuskjánum
   - Bláa leið-línan er sýnileg á kortinu
   - Rauður V-merkimiði sýnir versta/decisive punkt — staðfestu að hann sé á eða nálægt leið-línunni
   - Grænn A-merkimiði er nálægt Selfoss
   - Ef V-merkimiðinn er enn langt norðan af leið-línunni — þetta er mögulegt gögn-vandamál, ekki sjónarmiðsvandamál, og þarf frekara rannsóknir
5. Smelltu á "Skoða veðurspá" í "Af hverju?" hlutanum:
   - Á að opna **mannlega lesanlega** yr.no síðu
   - Á EKKI að opna raw JSON
   - Staðfestu að hnitsin virki með yr.no
6. Smelltu á "Hrá met.no gögn" (dimm linkur):
   - Á að opna raw JSON úr api.met.no
7. Prófa heimferð: fylltu inn `Þarf að vera heima í síðasta lagi` með tíma sem er mögulegt.
8. Væntar niðurstöður fyrir heimferðarviðvörun:
   - Ef viðvörun er á heimleið: audit map, `IssueAuditCard` og `svar` vísa öll á heimferðar-leg og tíma
   - Fjarlægð í IssueAuditCard á að vera frá áfangastað, ekki uppruna (sjá issueDist í travel.ts)
9. Athugaðu mobile breidd (~390px):
   - Audit map passar skjáinn (`max-width: 100%`, `height: auto`)
   - Engin lárétt overflow
   - Punkt-raðir (`RoutePointRow`) wrappa rétt
   - Hlekkir eru tappable
10. Ekki keyra production env variables eða deploya.

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.
