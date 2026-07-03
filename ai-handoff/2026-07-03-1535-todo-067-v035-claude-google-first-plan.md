# TODO #67 Vedrid - Google-first implementation plan (v035)

Created: 2026-07-03 15:35
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Planning handoff. Engin kóðavinna, SQL, env, Supabase, commit, push, deploy eða production breytingar gerðar.

---

## Ákvarðanir sem gilda í þessum plan

| Atriði | Ákvörðun |
|--------|----------|
| Provider (Phase 2A) | **Google Maps Platform** — fyrst |
| Mapbox | Adapter interface hönnuð inn — implementað seinna ef þarf |
| Bake-off | Ekkert — við skip-um það |
| Provider toggle | `WEATHER_MAP_PROVIDER=google` env var, production-wide |
| Map confirmation | Static Maps mynd + Places Autocomplete leit |
| Capacitor | Sérstakt verkefni, ekki hluti Phase 2A |

Þetta er ekki framkvæmdarleyfi. Stebbi þarf að gefa skýrt og afmarkað leyfi áður en kóðavinna hefst.

---

## Lykla-uppbygging (Google)

Tveir lyklar, skörp aðskilnaður:

**`GOOGLE_MAPS_SERVER_KEY`** — server only, aldrei í browser
- Fær: Geocoding API, Routes API
- Restriction: IP-restriction eða none (ekki HTTP referrer)

**`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`** — browser-visible, restricted
- Fær: Maps JavaScript API, Places API (New), Maps Static API
- HTTP Referrer restrictions (setja í Google Cloud Console):
  - `https://teskeid.is/*`
  - `https://*.teskeid.is/*`
  - `http://localhost:*/*`
- Þegar Capacitor kemur: bæta við app bundle ID

Client byggir Static Maps URL með browser key — það er rétta mynstrið, browser key er restricted til Static Maps API + allowed domains.

---

## Provider adapter interface (hönnuð fyrir Mapbox seinna)

```ts
// lib/weather/provider.types.ts
export type PlaceCandidate = {
  placeId: string
  displayName: string
  formattedAddress: string
  lat: number
  lon: number
}

export type RouteGeometry = {
  points: Array<{ lat: number; lon: number }>
  distanceM: number
  durationS: number
}

export type WeatherMapProvider = {
  geocodePlace(query: string): Promise<PlaceCandidate[]>
  getRouteGeometry(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteGeometry | null>
  staticMapUrl(params: StaticMapParams): string
}
```

`lib/weather/google.server.ts` implementerar `WeatherMapProvider`.
`lib/weather/provider.server.ts` les `WEATHER_MAP_PROVIDER` og skilar réttum adapter.
Þegar Mapbox kemur seinna: `lib/weather/mapbox.server.ts` implementerar sama interface.

---

## Places Autocomplete — exact path (Places API New)

Þetta er nákvæmt path sem Claude Code implementar. Ekki legacy Autocomplete widget, ekki Places UI Kit.

**Browser-side (React component, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`):**

```ts
// Hlað einu sinni í app
const loader = new Loader({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY!,
  libraries: ['places'],
})

// Við hverja leit — session token
const sessionToken = new google.maps.places.AutocompleteSessionToken()

// Við hvert keystroke (debounced)
const { suggestions } = await google.maps.places.AutocompleteSuggestion
  .fetchAutocompleteSuggestions({ input, sessionToken })

// Notandi velur — sækja staðinn og loka session
const place = suggestions[i].placePrediction.toPlace()
await place.fetchFields({
  fields: ['id', 'displayName', 'formattedAddress', 'location'],
  sessionToken,           // lokar session — billing: eitt session
})

const result: PlaceCandidate = {
  placeId: place.id!,
  displayName: place.displayName!,
  formattedAddress: place.formattedAddress!,
  lat: place.location!.lat(),
  lon: place.location!.lng(),
}
// Sendir result til server
```

**Session billing:** Öll keystrokes í einni leit + Place Details eru eitt session (eitt billing event). Ef notandi hættir leit án vals → abandoned session, billed sem individual autocomplete requests.

**Hvað server fær:** `{ placeId, displayName, lat, lon }` — engar frekari Places API köll á server fyrir þetta.

---

## Server-side lat/lon validation

Client-sent lat/lon er user input — server treystir því aldrei blindt:

```ts
function validateIcelandicCoords(lat: number, lon: number): boolean {
  return (
    isFinite(lat) && isFinite(lon) &&
    lat >= 63.0 && lat <= 67.0 &&   // Ísland + nágrenni
    lon >= -25.0 && lon <= -12.0
  )
}
```

Route sample count capped (80 max). Route distance capped (~600 km — Ísland).

---

## Google Cloud setup (þarf Stebbi að gera áður en Phase 2A2 getur prófað)

### 1. API lyklar (Google Cloud Console → APIs & Services → Credentials)

**Server key:**
- Create credentials → API key
- Nafn: `Teskeid Server`
- API restrictions: Geocoding API, Routes API
- Application restrictions: None eða Server IP
- Vista sem `GOOGLE_MAPS_SERVER_KEY`

**Browser key:**
- Create credentials → API key
- Nafn: `Teskeid Browser`
- API restrictions: Maps JavaScript API, Places API (New), Maps Static API
- Application restrictions: HTTP referrers (sjá að ofan)
- Vista sem `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

### 2. Quota caps (Google Cloud → APIs & Services → veldu API → Quotas)

Setja daily quota á:
- Maps Static API: 500/day (MVP)
- Geocoding API: 200/day
- Routes API: 200/day
- Places API: 200/day

Þetta verndar gegn billing spikes. Budget alert er til viðbótar, ekki í staðinn.

### 3. Budget alert (Google Cloud → Billing → Budgets & alerts)

Set $20/mánuð alert. Skilar email, stöðvar ekki sjálfkrafa köll.

### 4. Vercel env vars

```
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
WEATHER_MAP_PROVIDER=google
```

---

## Phase plan

### Phase 2A1 — Intent + golf (engir Google lyklar þarf)

**Scope:**

`lib/weather/question.ts` uppfært:
- `detectIntent` → bætir við `'activity_window_golf'` og `'route_towable_trailer'`
- `extractGolfPlace(question)` — þekkir "Grafarholt", "Grafarholtsvöllur", "Grafarholtið" o.fl.
- `extractTrailerKind(question)` → `'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer' | 'generic_trailer'`
- `extractRouteOrigin(question)` — "frá X"
- `extractRouteDestination(question)` — "að Y", "til Y"

`lib/weather/places.ts` — bæta við:
- Golf: Grafarholt golfvöllur (þegar til staðar), [fleiri ef Stebbi gefur lista]
- Ferðamannastaðir: Apavatn + [Stebbi gefur lista]

`lib/weather/tools.ts` — bæta við:
- `checkGolfWindow(input)`: 4.5h sliding window, best slot + 2 alternatives, golf thresholds (13/17 m/s), precipitation, temp

`app/api/teskeid/weather/ask/route.ts` — þekkir:
- `activity_window_golf` → `checkGolfWindow`
- `route_towable_trailer` → skilar `{ status: 'provider_not_configured' }` (Phase 2A2 mun fylla þetta)

`messages/is.json` + `messages/en.json`:
- Golf svör, "staður óþekktur", "provider ekki stilltur"

Tests (~30-35):
- Golf intent detection (Grafarholt variants, golf keywords)
- Golf place extraction
- Golf time window parsing
- `checkGolfWindow`: best slot, alternatives, no-good-window, 10-11 m/s ekki rautt
- Trailer kind detection
- Route origin/destination extraction
- Route `provider_not_configured` path
- Regression: grill virkar enn, Mosó virkar enn

---

### Phase 2A2 — Google provider + map confirmation (þarf Google lykla)

**Scope:**

`lib/weather/provider.types.ts` — shared interface (sjá að ofan)

`lib/weather/google.server.ts`:
- `geocodePlace(query)` → `PlaceCandidate[]` via Google Geocoding API (server key)
- `getRouteGeometry(from, to)` → `RouteGeometry | null` via Google Routes API (server key)
- `staticMapUrl(params)` → Google Static Maps URL (browser key — client sér þennan URL)

`lib/weather/provider.server.ts`:
- Les `WEATHER_MAP_PROVIDER`
- Skilar `google` adapter (Mapbox stub til framtíðar)

Map confirmation UI component (`components/weather/MapConfirmation.tsx`):
- Static Maps `<img>` með A/B pins og route line (ef available)
- "Þetta er rétt" / "Breyta" buttons
- Design.md compliant: mobile-first, 16px inputs, engin overflow, stable aspect-ratio
- Provider attribution sýnileg (Google krefst þess)

Places Autocomplete component (`components/weather/PlaceSearch.tsx`):
- Leitarbox, Places API (New) session tokens (sjá path að ofan)
- Candidate list (display name + formatted address)
- Notandi velur → `PlaceCandidate` sent til server

Server validation:
- `validateIcelandicCoords(lat, lon)` á öllum client-sent coordinates
- Route distance cap, sample count cap

All copy í messages files. Loading/pending states á öllum async operations.

Tests (~25-30 með mocked Google responses):
- `geocodePlace`: success, empty, failure
- `getRouteGeometry`: success, provider failure, unknown route
- `staticMapUrl`: rétt URL format
- `validateIcelandicCoords`: within bounds, outside bounds, non-finite
- Map confirmation UI: render, confirm action, change action
- Places Autocomplete: session token lifecycle, field restrictions
- Provider not configured: skýr villa, ekkert crash

---

### Phase 2A3 — Route weather eftir staðfestingu

**Scope:**

`lib/weather/tools.ts` — bæta við `checkTrailerRouteWeather(input)`:
- Þegar staður er staðfestur → route geometry frá Google Routes API
- 3-5 km sampling, 80 punkta cap
- met.no forecast fyrir hvern punkt (lazy cache)
- Early-exit ef einn punktur rauður
- Worst-case aggregation + disclosure ("Skoðaði X punkta á leiðinni")
- Horse trailer caveat
- Provider failure → skýr "route provider ekki tiltækur"

`findLatestDeparture` — ef Stebbi vill í þessum phase (spurning neðar)

AI wording þegar `WEATHER_AI_ENABLED=true` — sama reglur og grill: deterministic er alltaf source of truth, AI orðar aðeins.

Tests (~35-40):
- Route sampling: known distances, cap behavior, early-exit
- Worst-case aggregation
- Horse trailer caveat
- Provider failure paths
- Latest-departure scanning (ef implementað)
- Regression: grill, golf virka enn

---

### Phase 2A4 — Combined pre-release

Phase 1 + 2A1 + 2A2 + 2A3 → localhost prófun → production.

---

## Hvað þarf frá Stebba áður en framkvæmd byrjar

**Fyrir Phase 2A1 (hægt að byrja strax með leyfi):**
- [ ] Lista yfir golf courses til að bæta í `places.ts` (Grafarholt er þegar þar)
- [ ] Lista yfir ferðamannastaði í `places.ts` (Apavatn er fyrsti — hverjir fleiri?)
- [ ] Framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 2A1"

**Fyrir Phase 2A2 (þarf Google lykla fyrst):**
- [ ] Google server key búinn til og sendur/settur í env
- [ ] Google browser key búinn til, restricted, sendur/settur í env
- [ ] Quota caps settir í Google Cloud
- [ ] Budget alert sett
- [ ] `WEATHER_MAP_PROVIDER=google` sett í Vercel
- [ ] Framkvæmdarleyfi: "Claude Code, framkvæmdu Phase 2A2"

**Opnar spurningar:**
1. Latest-departure (`findLatestDeparture`) — í Phase 2A3 eða seinna?
2. Golf courses til viðbótar við Grafarholt?
3. Ferðamannastaðir til viðbótar við Apavatn?

---

## Localhost checks for Stebbi

### Phase 2A1
1. `Hvenær er best að spila golf í Grafarholti á morgun?` → best gluggi + alternatives, rökstuðningur
2. 10-11 m/s → ekki rautt sjálfkrafa
3. Golf á óþekktum velli → "þetta staðarheiti þekki ég ekki"
4. `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?` → "provider ekki stilltur" (ekki fake veður)
5. `Er grillveður í Mosó í kvöld?` → virkar eins og áður (regression)

### Phase 2A2
6. DevTools Network: `GOOGLE_MAPS_SERVER_KEY` kemur aldrei fram — aldrei
7. Þekktur staður (Reykjavík, Apavatn): static map mynd, engin Geocoding API köll
8. Óþekktur staður: Places Autocomplete leitarbox, notandi velur, static map sýnd
9. "Breyta": leit opnar, nýr staður valinn, ný static map
10. Mobile 360/390/460 px: static map fit, Places input ≥16px, engin overflow, buttons reachable
11. Provider failure (slökkt á lykli): skýr villa, ekkert crash
12. Billing: quota dashboard sýnir eðlilegar tölur eftir prófun

### Phase 2A3
13. `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?` → staðfesting → route weather með "skoðaði X punkta"
14. Hestakerra caveat í svari þegar `hestakerra` er í spurningu
15. Rauður punktur á leið → early-exit í svari, skýr ástæða
16. Óþekkt leið eða provider failure → skýrt "get ekki metið þessa leið"
17. `WEATHER_AI_ENABLED=false` → deterministic svör á grill/golf/route
18. `WEATHER_AI_ENABLED=true` → AI wording aðeins þegar valid toolResultId

---

## Óvissa / þarf að staðfesta

- **Places API (New) í Capacitor WebView:** Virkar líklega eins og í browser (WebView er Chrome/WebKit). Þarf test þegar Capacitor setup byrjar.
- **Google Routes API Icelandic coverage:** Líklega góð, en óstaðfest sérstaklega fyrir ófarnar leiðir (Sprengisandur, Kjölur). Þegar við fáum raunveruleg test getur það komið í ljós.
- **Static Maps attribution í mobile viewport:** Google krefst attribution. Þarf að passa að attribution sé readable á 360px.
- **Confidence: high** á Places API (New) session token path — þetta er current Google recommendation.
- **Confidence: high** á adapter interface — clean separation mun gera Mapbox auðveldara seinna.
