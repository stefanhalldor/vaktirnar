# TODO 067 - v130 Codex handoff: belti og axlabönd fyrir Google Maps / Places í production

Created: 2026-07-07 17:28  
Timezone: Atlantic/Reykjavik

## Staða

Stebbi gaf Ferðaveðrið út á raun til að fá alvöru prófun. Kort og autocomplete hafa virkað hjá Stebba á desktop og Chrome á iPhone, en sumir production notendur hafa lent í því að kortavirknin eða staðaleitin virkar ekki. Eitt dæmi: sama Android tæki virkaði í Samsung Internet en ekki Chrome.

Fyrri Google Console villa var:

- `RefererNotAllowedMapError`
- `AutocompletePlaces 403 (Forbidden)`

Stebbi uppfærði browser-key restrictions með:

- `https://teskeid.is/*`
- `https://www.teskeid.is/*`
- `http://localhost:3004/*`
- `http://127.0.0.1:3004/*`

Browser key leyfir:

- Maps JavaScript API
- Maps Static API
- Places API (New)

Þetta er rétt stilling fyrir domain, en við þurfum samt að setja belti og axlabönd í kóðann. Production má ekki vera þannig að ein Google JS failure í browser loki bæði korti og staðavali.

## Findings

### High - `PlaceSearch` er browser-Google-only og fellur alveg ef Google JS/Places bilar

Skrá:

- `components/weather/PlaceSearch.tsx`

Núverandi flæði:

- `PlaceSearch` kallar `loadPlacesLibrary()`
- notar `AutocompleteSuggestion.fetchAutocompleteSuggestions`
- við failure: `setFetchError(true)` og engar niðurstöður

Afleiðing:

Ef Google Maps JS loader, Places API, browser referrer, cache, extension, privacy stilling eða network blockar Google í þessum vafra, getur notandi ekki valið staði og kemst ekki áfram.

Þetta er production blocker fyrir MVP robustness.

### Medium - `RouteSelectionStep` sýnir loading-map overlay endalaust ef map init bilar

Skrá:

- `components/weather/RouteSelectionStep.tsx`

Núverandi flæði:

- map init er í `try/catch`
- catch gerir ekkert nema skilja `mapLoaded` eftir false
- UI sýnir áfram `interactiveMapLoading`

Afleiðing:

Notandi sér "Hleð kort..." eða gráan/ónýtan map state, en fær ekki skýra leið um að hann geti samt haldið áfram með leit.

### Medium - `TravelAuditMap` hefur static fallback, en fallback treystir enn á browser-restricted Google Static Maps key

Skrár:

- `components/weather/TravelAuditMap.tsx`
- `lib/weather/google.server.ts`

Niðurstöðukortið getur sýnt `staticMapUrl` ef JS map bilar. Það er gott. En Static Maps notar `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, sem þýðir að ef vandinn er referrer/restriction/browser key, getur static image líka bilað.

Þetta þarf ekki að blokka leitina, en fallback þarf að vera fallegur og gagnlegur jafnvel þegar ekkert Google map renderast.

### Low - Vandinn gæti líka verið cache/site state hjá stökum browser

Þegar sama Android tæki virkar í Samsung Internet en ekki Chrome er líklegt að eitthvað af þessu sé í gangi:

- Chrome heldur í gamalt JS bundle eða Google loader failure state.
- Site data/cache frá því áður en Google restriction var löguð.
- Chrome privacy/DNS/adblock/content setting.
- Google restriction propagation.

Þetta er samt ekki afsökun fyrir að hafa ekki fallback. Appið þarf að þola þetta.

## Markmið

Ferðaveðrið á að virka svona í production:

1. Ef Google Maps JS virkar: full upplifun með autocomplete og interactive map.
2. Ef Google Maps JS bilar en server-key virkar: staðaleit virkar samt í gegnum BFF/server fallback og notandi getur reiknað ferð.
3. Ef interactive map bilar: appið segir það á mannamáli, sýnir einfalt fallback og blokkar ekki ferðaflæðið.
4. Ef bæði browser-Google og server-Google bilar: notandi fær skýra villu sem segir að staðaleit sé tímabundið óaðgengileg, ekki bara "Villa við leit".
5. Við eigum að geta greint hvort failure er Google JS, Places, BFF, server key, feature gate eða network.

## Tillaga: P0 production guidance fyrir Stebba strax

Þetta er ekki kóðabreyting, bara support/debug checklist:

1. Ef notandi lendir í brotnu korti eða leit, biðja hann fyrst að prófa Incognito/Private í sama vafra.
2. Ef Incognito virkar: biðja notanda að hreinsa site data/cache fyrir `teskeid.is`.
3. Ef Incognito virkar ekki: biðja um screenshot af Console ef mögulegt.
4. Nánar að safna:
   - tæki
   - vafri
   - hvort `www.teskeid.is` eða `teskeid.is`
   - hvort kort og autocomplete bæði bila
   - console villa, sérstaklega hvort hún sé `RefererNotAllowedMapError`, `ApiNotActivatedMapError`, `InvalidKeyMapError`, `BillingNotEnabledMapError`, `ERR_BLOCKED_BY_CLIENT` eða 403 frá Places.

## Tillaga: P1 kóðabreyting fyrir Claude Code

Claude Code: framkvæma afmarkaðan resilience pass. Ekki breyta veðurmati, thresholds eða route-weather deterministic logic.

### 1. Bæta við server-side place search fallback

Búa til nýtt endpoint:

- `app/api/place/search/route.ts`

Behavior:

- `GET /api/place/search?q=garða`
- Auth + `vedrid` feature gate, sama mynstur og `app/api/place/reverse-geocode/route.ts` og `app/api/teskeid/weather/travel/route.ts`
- Nota `getWeatherMapProvider()` og `provider.geocodePlace(...)`
- Skila normalized results sem passa við `PlaceResult`:

```ts
type PlaceSearchResponse = {
  results: Array<{
    placeId?: string
    name: string
    formattedAddress: string
    lat: number
    lon: number
  }>
}
```

Validation:

- `q` trim
- min length 2
- max length 80 eða 120
- ef `q` vantar eða er of stutt: `400` eða `{ results: [] }`, velja einfalt og testvænt
- filtera niðurstöður með `validateIcelandicCoords`
- aldrei skila Google key eða raw provider payload

Rate limit:

- einfalt in-memory per IP, t.d. 30 requests / 60 sek
- svipað og reverse-geocode
- `429` skilar `{ results: [] }`

Cache:

- in-memory cache per normalized query í 5-15 mín
- Vercel process cache er best-effort, það er nóg fyrir MVP

API requirements:

- Server key þarf að leyfa Geocoding API, því `googleProvider.geocodePlace()` notar `https://maps.googleapis.com/maps/api/geocode/json`.
- Server key þarf áfram að leyfa Routes API fyrir route geometry.
- Þetta er server-side, ekki `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`.

### 2. Breyta `PlaceSearch` í provider-agnostic UI

Skrá:

- `components/weather/PlaceSearch.tsx`

Núna er `suggestions` typed sem `google.maps.places.AutocompleteSuggestion[]`. Breyta í internal type, t.d.:

```ts
type SearchSuggestion = {
  id: string
  label: string
  place: PlaceResult
  source: 'google-js' | 'server'
}
```

Search flow:

1. Reyna Google Places JS fyrst ef ekki hefur áður failað í þessari component/session.
2. Setja stutt timeout, t.d. 3-4 sek, svo hanging Google loader haldi UI ekki hostage.
3. Ef Google Places JS eða fetchAutocompleteSuggestions failar:
   - setja `googleUnavailable` true
   - kalla server fallback endpoint
4. Ef server fallback skilar niðurstöðum:
   - sýna þær í sama listbox
   - velja stað án `fetchFields`, því fallback result er þegar með lat/lon
5. Ef bæði Google JS og server fallback faila:
   - sýna skýrari error

Mikilvægt:

- Ekki sýna notandanum "Google er bilað" sem panic texta.
- Má sýna hógvært: "Nota varaleit..." eða ekkert ef niðurstöður birtast.
- Þegar fallback er komið í gang í component, halda sig við fallback fyrir næstu keystrokes til að forðast repeated Google JS 403 spam.

### 3. Bæta map error state í `RouteSelectionStep`

Skrá:

- `components/weather/RouteSelectionStep.tsx`

Bæta við:

```ts
const [mapError, setMapError] = useState(false)
```

Í map init catch:

- `setMapError(true)`

UI:

- Ef `mapError`:
  - ekki sýna endalaust `interactiveMapLoading`
  - sýna einfalt fallback spjald í map box:

IS copy hugmynd:

`Kortið náði ekki að hlaðast í þessum vafra. Þú getur samt valið brottfararstað og áfangastað og reiknað ferðina.`

EN:

`The map could not load in this browser. You can still choose origin and destination and calculate the trip.`

Ef origin/destination eru valin:

- sýna textalínu: `{origin} → {destination}`
- confirm button á áfram að virka

### 4. Bæta graceful fallback í `TravelAuditMap`

Skrá:

- `components/weather/TravelAuditMap.tsx`

Núverandi mapError:

- sýnir static map ef `staticMapUrl`
- annars texta

Bæta við:

- Ef static image bilar líka, sýna texta fallback undir/í staðinn
- Bæta `onError` á static image til að skipta í non-map fallback
- Non-map fallback þarf að segja:
  - kortið hlóðst ekki
  - niðurstaðan er samt reiknuð úr leið og veðurspá
  - hægt er að skoða punktadetail/lista ef hann er til staðar

Mikilvægt:

- Ekki fela niðurstöðuna bara af því kortið bilar.
- Kort er audit/visual layer, ekki source of truth.

### 5. Bæta message keys

Allur notendatexti í:

- `messages/is.json`
- `messages/en.json`

Mögulegir lyklar:

Undir `teskeid.vedrid.placeSearch`:

- `fallbackLoading`
- `fallbackNotice`
- `errorAllProviders`

Undir `teskeid.vedrid.ferdalagid`:

- `routeMapUnavailableTitle`
- `routeMapUnavailableBody`
- `auditMapUnavailableTitle`
- `auditMapUnavailableBody`
- `staticMapUnavailable`

Copy þarf að vera stutt, ekki tæknilegt, og passa mobile.

## Tillaga: P2 diagnostics síðar, ekki í fyrsta pass nema einfalt

Ef Claude Code sér einfalda leið án privacy áhættu:

- logga `console.warn` í development með `error.message`
- ekki senda Google errors í analytics í þessum pass

Seinna mætti bæta við client-side diagnostic event:

- maps_js_failed
- places_js_failed
- place_search_fallback_used
- static_map_failed

En ekki gera það núna nema með sér review um analytics/privacy.

## Test plan fyrir Claude Code

### Unit/component tests

Bæta við eða uppfæra tests eftir því sem núverandi test setup leyfir:

1. `PlaceSearch`:
   - þegar Google Places virkar, notar Google suggestions
   - þegar `loadPlacesLibrary` rejectar, kallar `/api/place/search`
   - þegar fallback skilar niðurstöðu, `onPlaceSelected` fær `PlaceResult`
   - þegar bæði Google og fallback faila, sýnir error

2. `RouteSelectionStep`:
   - þegar `loadMapsLibrary` rejectar, sýnir map fallback texta
   - staðaval og confirm button virka samt ef origin/destination eru til

3. API route:
   - unauth -> 401
   - feature denied -> 404
   - short query -> empty/400 eftir hönnun
   - provider missing -> 503
   - provider returns candidates -> normalized JSON
   - non-Iceland coords filtered out

### Commands

Keyra:

```bash
npm run type-check
npm run test:run
```

## Production acceptance criteria

Eftir breytinguna á að vera satt:

- Ef `loadPlacesLibrary()` failar, autocomplete gefst ekki upp strax heldur reynir BFF fallback.
- Ef Google JS map failar, route selection skjárinn hangir ekki á loading.
- Notandi getur valið frá/til og komist áfram án interactive map.
- Result screen sýnir niðurstöðu eða nothæfan fallback þótt Google map renderist ekki.
- Browser key failure má ekki loka allri ferðaveðursupplifun.
- Server key er aldrei sendur í client.
- No secrets in logs/client responses.
- Engin breyting á deterministic weather model.

## Localhost checks for Stebbi

### Venjulegt flæði

1. Opna `/auth-mvp/vedrid`.
2. Velja brottfararstað og áfangastað með venjulegri leit.
3. Staðfesta að kort birtist ef Google JS virkar.
4. Reikna ferð.
5. Staðfesta að niðurstöðukort og punktar birtast.

### Simulated Google JS failure

Stebbi getur prófað með DevTools:

1. Opna Network tab.
2. Blocka tímabundið:
   - `maps.googleapis.com`
   - `places.googleapis.com`
3. Refresh.
4. Prófa að slá inn stað.

Expected:

- Leit á samt að gefa niðurstöður í gegnum server fallback, ef server key/API eru rétt.
- Kortabox á ekki að vera fast í endalausu loading.
- Notandi á að geta valið frá/til og haldið áfram.

### Production retry

1. Prófa `https://www.teskeid.is/auth-mvp/vedrid` í Chrome incognito á Android ef mögulegt.
2. Prófa venjulegan Chrome eftir að site data hefur verið hreinsað.
3. Prófa Samsung Internet.
4. Ef Chrome bilar en Samsung Internet virkar, safna console villu ef hægt er.

### Varúð

- Ekki prófa með raunverulegri production data mutation; þetta flæði les veður/gögn og notar Google/met.no API, en breytir ekki Supabase notendagögnum.
- Fylgjast með Google API billing ef margir eru að prófa fallback leit, en með rate limit ætti þetta að vera lítil áhætta.

## Ekki gera í þessum áfanga

- Ekki breyta weather thresholds.
- Ekki breyta route sampling.
- Ekki breyta AI/weather answer logic.
- Ekki bæta við Mapbox í þessum pass.
- Ekki geyma feedback eða diagnostics í Supabase án sér handoff/review.
- Ekki veikja auth eða feature gate á `/auth-mvp/vedrid`.

## Óvissa / þarf að staðfesta

- Server key þarf að vera með Geocoding API enabled/restricted rétt ef `/api/place/search` notar `googleProvider.geocodePlace`.
- Ef Google Cloud project er enn í trial/full activation state gæti það haft áhrif á suma APIs, en núverandi villumynstur bendir fyrst og fremst á browser/client layer.
- Codex prófaði ekki production browser, heldur las kóða og byggði plan út frá console villum og Stebba lýsingu.
