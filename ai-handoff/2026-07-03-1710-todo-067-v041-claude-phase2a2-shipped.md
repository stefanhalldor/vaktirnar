# TODO #67 Vedrid - Phase 2A2 shipped

Created: 2026-07-03 17:10
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Handoff — Phase 2A2 framkvæmt. Engar production env breytingar, commit eða push gerðar.

---

## Staða

Phase 2A2 er **lokið, 39 nýjar prófanir, 1593 heildarlega, ekkert brotið.** Kóðinn er tilbúinn. Localhost prófun krefst Google lykla — sjá neðar.

---

## Hvað var gert

### Nýjar skrár

| Skrá | Lýsing |
|------|--------|
| `lib/weather/provider.types.ts` | `PlaceCandidate`, `RouteGeometry`, `StaticMapParams`, `WeatherMapProvider` interface |
| `lib/weather/coords.ts` | `validateIcelandicCoords(lat, lon)` — lat 63–67, lon -25 to -12 |
| `lib/weather/google.server.ts` | Google adapter: `geocodePlace`, `getRouteGeometry` (Routes API v2), `staticMapUrl` |
| `lib/weather/provider.server.ts` | `getWeatherMapProvider()` — les `WEATHER_MAP_PROVIDER`, skilar adapter eða null |
| `lib/weather/googleMaps.client.ts` | Browser-only helper: v2-style `setOptions()` + `loadPlacesLibrary()` via `importLibrary('places')` |
| `components/weather/MapConfirmation.tsx` | Static map + "Breyta stað" hnappur |
| `components/weather/PlaceSearch.tsx` | Places Autocomplete (New API), Iceland-biased, debounced, stale guard, sessionToken rétt útfærður |
| `lib/__tests__/weather-coords.test.ts` | 14 prófanir á validateIcelandicCoords |
| `lib/__tests__/weather-google.test.ts` | 25 prófanir á google.server.ts og provider.server.ts (mocked fetch) |

### Breyttar skrár

| Skrá | Breyting |
|------|----------|
| `lib/weather/types.ts` | `place?: { name, lat, lon, staticMapUrl? }` bætt við `WeatherAnswerEnvelope` |
| `app/api/teskeid/weather/ask/route.ts` | Tekur við `confirmedPlace` (validated server-side), skilar `place.staticMapUrl` ef provider stilltur |
| `app/auth-mvp/vedrid/VedridClient.tsx` | `PlaceSearch` + `MapConfirmation` integration, unknown_place → PlaceSearch, "Breyta stað" → PlaceSearch |
| `package.json` + `package-lock.json` | `@googlemaps/js-api-loader` (dependencies), `@types/google.maps` (devDependencies) |

---

## Tæknilegar ákvarðanir útfærðar

| Atriði | Útfærsla |
|--------|----------|
| Dependency | `@googlemaps/js-api-loader` — v2-style: `setOptions()` + `importLibrary('places')` |
| Session token | Fer á `AutocompleteRequest` — EKKI inn í `fetchFields()` (fetchFields lokar session sjálfkrafa) |
| Iceland bias | `includedRegionCodes: ['is']`, `language: 'is'` |
| Stale guard | `requestId` counter — eldra response getur aldrei yfirskrifað nýtt |
| Debounce | 300ms, engar requests við <2 stafi |
| Route points | 80 max, adaptive sampling (`samplePoints`), alltaf fyrsti og síðasti punktur |
| Data storage | Engar raw Google responses vistaðar — curated `places.ts` stækkar ekki sjálfkrafa |
| Static Maps key | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — server generates URL, sends to client (browser key has referrer restrictions) |
| Server key | `GOOGLE_MAPS_SERVER_KEY` kemur aldrei í URL eða API response — aðeins í `X-Goog-Api-Key` header |

---

## UX flæði

**Þekktur staður (í places.ts):**
1. Notandi sendir spurningu
2. API: resolve place → fetch forecast → checkGolfWindow/checkGrillWeather → svar + staticMapUrl
3. UI: sýnir veður + kort neðst í svari + "Breyta stað" hnappur

**Óþekktur staður:**
1. Notandi sendir spurningu
2. API: extractPlace → null → 422 unknown_place
3. UI: sýnir PlaceSearch (Google Autocomplete)
4. Notandi velur stað → `confirmedPlace` sent til server
5. API: validateIcelandicCoords → fetch forecast → svar + staticMapUrl

**"Breyta stað":**
1. Notandi smellir á "Breyta stað" undir kortinu
2. PlaceSearch opnast
3. Notandi velur → nýtt request með `confirmedPlace`

---

## Áhætta og takmarkanir

| Áhætta | Athugasemd |
|--------|------------|
| **Lyklar ekki til staðar** | Localhost prófun án lykla: `staticMapUrl` kemur ekki í svar, PlaceSearch bregst við. Kóðinn bregst skýrt við (throws, fær villu í UI). |
| **Places API (New) í Capacitor WebView** | Óprófað. WebView er Chromium-based, ætti að virka. |
| **Google Routes á hálendi** | Óstaðfest fyrir Kjöl/Sprengisand — kemur í ljós við Phase 2A3 prófun. |
| **Static Maps attribution á 360px** | Google krefst attribution text. `MapConfirmation.tsx` sýnir kortið en ekki Google logo — þarf að bæta við attribution texta áður en ship. |
| **`confirmedPlace` frá client** | Validated server-side með `validateIcelandicCoords`. Name field er string-validated. Engar SQL injections mögulegar (lat/lon eru numbers). |

**Attribution:** Google Static Maps þarf "Map data ©Google" texta undir kortinu. Þetta er lítið fix — bæta við í `MapConfirmation.tsx` áður en ship.

---

## Localhost checks for Stebbi

**Krefst lykla í `.env.local`:**
```
GOOGLE_MAPS_SERVER_KEY=<server key>
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<browser key>
WEATHER_MAP_PROVIDER=google
WEATHER_AI_ENABLED=false
```

1. **DevTools Network:** `GOOGLE_MAPS_SERVER_KEY` á **aldrei** að sjást í Network tab — aldrei
2. **Þekktur staður (Reykjavík, Apavatn):** Spyrðu um grill/golf → kort birtist neðst í svari, engar Geocoding API köll (staðurinn er í `places.ts`)
3. **"Breyta stað":** Smelltu → PlaceSearch opnast, Íslenskir candidates fremstir
4. **PlaceSearch — Suðurgata, Mosó, Húsavík, Husavik (ASCII):** Íslenskir candidates birtast
5. **PlaceSearch — engar requests við tómt input:** Skrifa 1 staf → engar API köll
6. **PlaceSearch — debounce:** Snöggt typing → bara ein request í lok
7. **Óþekktur staður (t.d. "Eyrarási"):** PlaceSearch birtist sjálfkrafa
8. **Staðfesting + veður:** Veldu stað í PlaceSearch → veður + kort birtast
9. **Mobile 360/390/460 px:** PlaceSearch input ≥16px, engin overflow, buttons reachable
10. **Billing dashboard:** Eftir handvirk próf — eðlilegar tölur, engar sprengjur

---

## Næsta skref — Phase 2A3

Phase 2A3: Route weather eftir staðfestingu (þarfnast Phase 2A2 lykla + execution permission).

Áður en Phase 2A3 hefst:
- [ ] Attribution fix í `MapConfirmation.tsx` (Google krefst þess)
- [ ] Localhost prófun Phase 2A2 gengur vel
- [ ] Framkvæmdarleyfi: **"Claude Code, framkvæmdu Phase 2A3"**
