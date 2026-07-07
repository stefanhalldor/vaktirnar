# TODO-067 v066 - Claude Code: Auditability + route point transparency shipped

Created: 2026-07-06 07:50
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Lokið. Engar production-breytingar, engin SQL-keyrsla, ekkert commit, ekkert push, ekkert deploy.

---

## Niðurstaða

v062 og v063 addenda framkvæmdar í heild. 51/51 test files, 1644 passed. Build clean.

---

## Framkvæmdar breytingar

### `lib/weather/types.ts`

- `TravelPointForecast`: bætt við `forecastLat: number`, `forecastLon: number` (rounded met.no coords)
- `WorstMetric`: bætt við `forecastLat?: number`, `forecastLon?: number`, `metnoUrl?: string`
- Nýr type `RouteWeatherPoint` með: id, routeIndex, totalRouteWeatherPoints, lat/lon, forecastLat/forecastLon, distanceFromOriginM, routeFraction, isOrigin, isDestinationClosest, isHighlightedIssue, googleMapsUrl, metnoUrl, summaryForWindow
- `TravelPlan`: bætt við `routeWeatherPoints?: RouteWeatherPoint[]`

### `lib/weather/travel.ts`

- Bætt við `METNO_FORECAST_BASE` og `GMAPS_SEARCH_BASE` constants
- `findWorstMetric`: fyllir nú `forecastLat`, `forecastLon`, `metnoUrl` í `WorstMetric`
- Nýr `buildRouteWeatherPoints()` helper:
  - Reiknar `summaryForWindow` per punkt (ETA-based, eins og `findWorstMetric`)
  - Merkir `isDestinationClosest` á síðasta punkti
  - Merkir `isHighlightedIssue` ef lat/lon passar við `highlightedIssue`
  - Setur `googleMapsUrl` og `metnoUrl` per punkt
- `checkTravelWeather`: kallar `buildRouteWeatherPoints()` og setur `routeWeatherPoints` á `travelPlan`

### `app/api/teskeid/weather/travel/route.ts`

- Bætt við `import { roundCoord } from '@/lib/weather/places'`
- `weatherPoints` fær nú `forecastLat: roundCoord(lat)`, `forecastLon: roundCoord(lon)` per punkt
- Þar sem pointForecasts er byggt með `...weatherPoints[i]` fara `forecastLat/forecastLon` sjálfkrafa inn í `TravelPointForecast`

### `lib/__tests__/weather-travel.test.ts`

- `makeForecast()` uppfærð: `forecastLat/forecastLon` default til `merged.lat/merged.lon` ef ekki sérstaklega sett
- 5 nýir auditability tests:
  - WorstMetric hefur forecastLat/forecastLon/metnoUrl
  - routeWeatherPoints er til staðar á travelPlan
  - Hvert point hefur googleMapsUrl og metnoUrl
  - isDestinationClosest á síðasta punkti, einungis einn
  - isHighlightedIssue passar við highlighted issue point

### `messages/is.json` + `messages/en.json`

Nýir copy keys í ferdalagid:
- `bestWindowLabel`, `returnWindowLabel`, `outboundLabel`
- `metricWind`, `metricGust`, `metricPrecip`
- `routePointsTitle`, `betaTransparencyCopy`
- `decisivePointLabel`, `nearestDestLabel`
- `openOnMap`, `viewMetnoForecast`

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

- Bætt við `showRoutePoints` state
- `utcHHMM()` helper (sýnir HH:MM úr ISO string, UTC)
- **Result card**:
  - Best departure window badge ef `windowMode` og `bestWindow` til staðar
  - Return best window badge ef til staðar
  - Stækkuð "Af hverju?" section: `IssueAuditCard` sýnir highlighted issue með metric, tíma, fjarlægð, hnit, met.no link, Google Maps link
- **`IssueAuditCard`** sub-component: sýnir structured audit details
- **"Spápunktar á leiðinni"** expandable section: beta transparency note + `RoutePointRow` lista
- **`RoutePointRow`** sub-component: punktur N/M, fjarlægð, vindgildi, met.no hnit, Open on map + View met.no links

---

## Localhost prófanir fyrir Stebbi

1. Opnaðu `/auth-mvp/vedrid`.
2. Keyra leið sem gefur gult/rautt (t.d. Reykjavík → Húsafell með karavan).
3. Smelltu á "Af hverju?" — staðfestu að IssueAuditCard sýni:
   - Leg (Útleið/Heimferð)
   - Metric og gildi
   - Tíma
   - Fjarlægð frá uppruna
   - Hnit
   - "Skoða spágögn (met.no)" link → opna og leita að tímagildi
   - "Opna á korti" link → staðfesta að punktur sé á eða nálægt leiðinni
4. Smelltu á "Spápunktar á leiðinni" — staðfestu:
   - Allir sampleðir punktar sjást
   - Versti punkturinn er merktur
   - Næsti áfangastað er merktur
   - Vindgildi samrýmast met.no spánni

---

## Eftir þessari framkvæmd

- `TravelIssue` hefur ekki `metnoUrl` beint — `IssueAuditCard` notar type cast. Þetta gæti þurft viðleiðni ef Stebbi vill cleaner type.
- `worstCandidateOf` tie-break for precipitation candidates er enn ógáð (minor).
- Candidate list í result card er ekki renderad (sýnir bara best/worst, ekki alla).

---

## Prófunarniðurstöður

```
npm run type-check  → clean
npm run test:run    → 51/51 test files, 1644 passed | 27 skipped | 8 todo
npm run build       → clean
```

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.
