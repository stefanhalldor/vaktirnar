# TODO #67 Vedrid - Execution-ready handoff (v037)

Created: 2026-07-03 15:45
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Handoff — fangar allar lokaákvarðanir úr v019–v036. Eitt opið atriði eftir. Engin kóðavinna, SQL, env, Supabase, commit, push, deploy eða production breytingar gerðar.

---

## Lokaðar ákvarðanir

Allt hér að neðan er settled. Þarf ekki frekari umræðu.

| Atriði | Ákvörðun |
|--------|----------|
| Native app | Capacitor — wrappar Next.js |
| Provider | Google Maps Platform — fyrst. Mapbox seinna ef þarf. |
| Billing | Stebbi hefur þegar Google Cloud billing |
| Provider toggle | `WEATHER_MAP_PROVIDER=google` env var, production-wide |
| Map confirmation | Static Maps mynd (browser key) + Places Autocomplete leit |
| Places API path | Places API (New) — `AutocompleteSessionToken` + `fetchAutocompleteSuggestions` + `fetchFields()` án token |
| Iceland bias | `includedRegionCodes: ['is']`, `language: 'is'` í öllum autocomplete requests |
| Static Maps URL | Server býr til URL með `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, skilar browser-safe URL |
| Session token | Fer á `AutocompleteRequest` — EKKI inn í `fetchFields()` |
| Lyklar | Server key: Geocoding + Routes. Browser key: Maps JS + Places + Static Maps |
| Route cap | 80 punkta sample cap + adaptive spacing. Skýr "of löng leið" message — engin km cap |
| Data storage | Engar raw Google responses í DB. Engin places.ts auto-growth frá provider. places.ts er curated only. |
| Geocoding cache | Ekki persistent í Phase 2. Provider kallað live, niðurstöður aðeins notaðar í þeirri keyrslu. |
| Admin toggle | Env var í Phase 2. Supabase admin UI er seinna verk með sér execution permission. |
| Bake-off | Sleppt — Google valinn beint. |
| Phase 1 + 2 | Ship saman í Phase 2A4. |
| AI wording | Sama reglur og grill — deterministic alltaf source of truth, AI orðar þegar `WEATHER_AI_ENABLED=true` |
| Client lat/lon | Treyst sem user input, validated server-side (bounds Ísland: lat 63–67, lon -25 to -12) |
| Debounce/stale | Min 2-3 stafir, debounce, abort guard á stale responses |
| Capacitor auth | Sérstakt verkefni — ekki hluti Phase 2A |

---

## Eitt opið atriði

**Dependency: hvernig hlöðum við Google Maps JavaScript API?**

| Valkostur | Útskýring |
|-----------|-----------|
| **A — `@googlemaps/js-api-loader`** | Official Google npm package. Einfaldasta implementationið. Þarf explicit leyfi til að bæta við `package.json`. |
| **B — Native script tag** | `<Script src="https://maps.googleapis.com/...">` í Next.js layout. Ekkert npm. Meira boilerplate. |

> **Stebbi svarar:** A eða B?

Þetta er eina atriðið sem stoppar Phase 2A2 planning. Phase 2A1 er ekki háð þessu.

---

## Phase plan — execution scope

### Phase 2A1 — Golf + intent (engir Google lyklar, engar dependencies)

**Tilbúið til framkvæmdar þegar Stebbi gefur leyfi.**

Scope:
- `question.ts`: `detectIntent` + `'activity_window_golf'` + `'route_towable_trailer'`, `extractGolfPlace`, `extractTrailerKind`, `extractRouteOrigin`, `extractRouteDestination`
- `places.ts`: Golf aliases + ferðamannastaðir (Apavatn + listi frá Stebba)
- `tools.ts`: `checkGolfWindow` — 4.5h sliding window, best + 2 alternatives, golf thresholds (13/17 m/s)
- `ask/route.ts`: þekkir `activity_window_golf` → `checkGolfWindow`, þekkir `route_towable_trailer` → `{ status: 'provider_not_configured' }`
- `messages/is.json` + `messages/en.json`: golf svör, "staður óþekktur", "provider ekki stilltur"
- Tests: ~30–35

Þarf frá Stebba:
- [ ] Listi yfir golf courses til að bæta við `places.ts`
- [ ] Listi yfir ferðamannastaði (Apavatn er fyrsti — hverjir fleiri?)
- [ ] Framkvæmdarleyfi: **"Claude Code, framkvæmdu Phase 2A1"**

---

### Phase 2A2 — Google provider + map confirmation

**Þarf Google lykla og dependency ákvörðun áður en þetta getur byrjað.**

Scope:
- `provider.types.ts`: `WeatherMapProvider` interface (Mapbox-ready)
- `google.server.ts`: `geocodePlace`, `getRouteGeometry`, `staticMapUrl`
- `provider.server.ts`: les `WEATHER_MAP_PROVIDER`, velur adapter
- `MapConfirmation.tsx`: static map + confirm/change
- `PlaceSearch.tsx`: Places Autocomplete (New API), Iceland-biased, debounced, stale guard
- Server validation: `validateIcelandicCoords`, route sample cap
- Tests: ~25–30 með mocked Google responses

Þarf frá Stebba:
- [ ] Dependency ákvörðun: A eða B
- [ ] `GOOGLE_MAPS_SERVER_KEY` búinn til í Google Cloud Console
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` búinn til, restricted til teskeid.is og localhost
- [ ] Quota caps settir (Static Maps 500/day, Geocoding 200/day, Routes 200/day, Places 200/day)
- [ ] Budget alert ($20/mánuð) í Google Cloud Billing
- [ ] `WEATHER_MAP_PROVIDER=google` sett í `.env.local`
- [ ] Framkvæmdarleyfi: **"Claude Code, framkvæmdu Phase 2A2"**

---

### Phase 2A3 — Route weather eftir staðfestingu

Scope:
- `checkTrailerRouteWeather`: Google Routes → sampling → met.no → worst-case → AI wording
- Horse trailer caveat
- `findLatestDeparture` (ef Stebbi vill)
- Tests: ~35–40

Þarf frá Stebba:
- [ ] Svar: `findLatestDeparture` í Phase 2A3 eða seinna?
- [ ] Framkvæmdarleyfi: **"Claude Code, framkvæmdu Phase 2A3"**

---

### Phase 2A4 — Combined pre-release

Phase 1 + 2A1 + 2A2 + 2A3 → localhost prófun → production ship.

---

## Localhost checks (samantekt)

**Phase 2A1:**
1. `Hvenær er best að spila golf í Grafarholti á morgun?` → best gluggi + alternatives, vindrökstuðningur. 10–11 m/s ekki rautt.
2. Óþekktur golfvöllur → "þetta staðarheiti þekki ég ekki"
3. Route intent → "provider ekki stilltur" — ekkert fake veður
4. `Er grillveður í Mosó í kvöld?` → regression, virkar eins og Phase 1

**Phase 2A2:**
5. DevTools: `GOOGLE_MAPS_SERVER_KEY` sést aldrei — aldrei
6. Þekktur staður (places.ts): static map, engin Geocoding API köll
7. Óþekktur staður: Places leitarbox, íslenskir candidates fremstir, notandi velur, static map
8. "Breyta": nýr staður, ný static map
9. Autocomplete: engar requests við <2 stafi, debounce virkar, stale response overwritar ekki nýja leit
10. Mobile 360/390/460 px: 16px input, engin overflow, buttons reachable með keyboard
11. Billing dashboard: eðlilegar tölur eftir handvirk próf

**Phase 2A3:**
12. Route með hjólhýsi → staðfesting → "skoðaði X punkta á leiðinni"
13. Hestakerra → caveat í svari
14. Rauður punktur → early-exit, skýr ástæða
15. `WEATHER_AI_ENABLED=false` → deterministic svör á grill/golf/route
16. `WEATHER_AI_ENABLED=true` → AI wording aðeins þegar valid `toolResultId`

---

## Óvissa / þarf að staðfesta

- **Places API New í Capacitor WebView:** Líklega virkar — þarf test þegar Capacitor byrjar.
- **Google Routes coverage á hálendi:** Óstaðfest. Við munum sjá þegar við prófum Kjöl/Sprengisand.
- **Static Maps attribution á 360px:** Google krefst attribution — þarf að passa að hún sé readable.
