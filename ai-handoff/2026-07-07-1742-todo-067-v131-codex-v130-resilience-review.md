# TODO 067 - v131 Codex review: Claude v130 Google Maps resilience

Created: 2026-07-07 17:42  
Timezone: Atlantic/Reykjavik

## Samantekt

Codex rýndi `2026-07-07-1740-todo-067-v130-claude-google-maps-resilience.md` og kóðann sem Claude breytti.

Niðurstaða: Enginn blocking code-finding fannst. Þetta er rétta áttin fyrir production: staðaleit er ekki lengur algjörlega háð Google Maps JavaScript í browser, og kortabilun á ekki að frysta UI í endalausu loading state.

Það eru samt nokkur atriði sem þarf að hafa í huga áður en þetta fer aftur á raun:

1. Production server key þarf að vera rétt stilltur fyrir Geocoding API.
2. Search empty-state og search-failure eru enn blönduð saman í UI.
3. Google selection path þarf helst try/catch svo `fetchFields` failure hreinsi ekki input án skýringa.

## Findings

### Medium - Production fallback virkar aðeins ef `GOOGLE_MAPS_SERVER_KEY` leyfir Geocoding API

Skrár:

- `app/api/place/search/route.ts:63-81`
- `lib/weather/google.server.ts:64-84`

Nýja `/api/place/search` leiðin notar:

```ts
const candidates = await provider.geocodePlace(q)
```

Google provider notar Geocoding REST API með `GOOGLE_MAPS_SERVER_KEY`. Þetta er rétt tæknilega, en production þarf að staðfesta sérstaklega:

- `GOOGLE_MAPS_SERVER_KEY` er til í Vercel Production.
- Key-inn leyfir `Geocoding API`.
- Key-inn leyfir `Routes API`.
- Key-inn er ekki með browser HTTP referrer restriction. Server-side Google REST köll frá Vercel munu ekki passa við `https://www.teskeid.is/*` referrer restriction á sama hátt og browser key.
- API restrictions á server key mega vera þröngar, en þurfa að innihalda a.m.k. Geocoding API og Routes API.

Þetta er ekki kóðagalli hjá Claude, en það er release-prerequisite. Ef þetta vantar mun fallbackið falla í 503 og notendur sem eru í Chrome/Google JS vandanum fá enn ekki staðaleit.

Mælt production check:

- Í Google Cloud, skoða `GOOGLE_MAPS_SERVER_KEY`.
- API restrictions: `Geocoding API` + `Routes API`.
- Application restrictions: helst ekki Websites fyrir server key. Ef takmarkað þarf að vera server-samhæft, ekki browser-referrer.

### Medium - `PlaceSearch` sýnir "Leit virkar ekki" þegar server fallback skilar einfaldlega engum niðurstöðum

Skrár:

- `components/weather/PlaceSearch.tsx:98-103`
- `messages/is.json:602-608`
- `messages/en.json:598-604`

Núverandi logic:

```ts
const results = await searchViaServer(value)
setSuggestions(results)
if (results.length === 0) setFetchError(true)
```

Þetta ruglar saman tveimur ólíkum tilfellum:

1. Server fallback er bilað eða óaðgengilegt.
2. Leit virkar, en þessi fyrirspurn skilar engum niðurstöðum.

Í production getur notandi slegið inn typo eða mjög sérkennilegt staðarheiti og fengið:

`Leit virkar ekki núna. Reyndu aftur seinna.`

Það er of sterkt og getur látið appið virðast bilað þótt fallback hafi bara ekki fundið stað.

Mælt fix:

- `searchViaServer` ætti að skila status, ekki bara lista:

```ts
type ServerSearchOutcome =
  | { ok: true; results: SearchSuggestion[] }
  | { ok: false; results: [] }
```

- Ef `ok: true` og `results.length === 0`, sýna mildan no-results texta:

IS: `Enginn staður fannst. Prófaðu annað heiti eða bættu við sveitarfélagi.`

EN: `No place found. Try another name or add the municipality.`

- Ef `ok: false`, sýna núverandi `errorAllProviders`.

Þetta er ekki blocker fyrir resilience-markmiðið, en það mun hjálpa mikið í alvöru notendaprófun.

### Low - Google selection path hreinsar input áður en `fetchFields` tekst

Skrá:

- `components/weather/PlaceSearch.tsx:123-142`

Núverandi `handleSelect` gerir:

```ts
setSuggestions([])
setInput('')
...
await place.fetchFields(...)
```

Ef `fetchFields` failar eftir að notandi smellir á Google suggestion, er input þegar horfið og engin skýr villa sett. Þetta er sjaldgæfara en upphaflegi browser-loader vandinn, en samt sami flokkur: Google client API getur bilað á miðri leið.

Mælt fix:

- Ekki hreinsa input fyrr en successful selection.
- Wrap-a Google branch í try/catch.
- Í catch:
  - setja `googleUnavailableRef.current = true`
  - reyna server fallback á suggestion label eða núverandi input
  - ef það tekst ekki, sýna `errorAllProviders`

Þetta er ekki nauðsynlegt fyrir fyrstu production rescue útgáfu, en það lokar einu götunni í “belti og axlabönd”.

### Low - `debounceRef` er ekki hreinsað við unmount

Skrá:

- `components/weather/PlaceSearch.tsx:113-120`

Ef component unmountast meðan debounce timer er virkur, getur timer kallað `search` eftir unmount. Þetta er líklega ekki sýnilegt vandamál, en auðvelt að laga með cleanup `useEffect`.

Mælt fix:

```ts
useEffect(() => {
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }
}, [])
```

Þetta krefst að bæta `useEffect` við import.

### Low - Cache comment segir "normalized query", en cache key er bara trimmed query

Skrá:

- `app/api/place/search/route.ts:22-26`
- `app/api/place/search/route.ts:53-60`

Comment segir:

`In-memory cache per normalized query`

Kóðinn notar:

```ts
const q = (...).trim()
const cached = cache.get(q)
```

Þetta er ekki functional bug. En ef við viljum raunverulega normalize-a:

```ts
const normalizedQ = q.toLocaleLowerCase('is')
```

Nota `normalizedQ` sem cache key, en senda `q` áfram í provider svo upprunaleg stafsetning haldist.

## Það sem lítur vel út

- `/api/place/search` er auth-gated og feature-gated.
- Server key fer ekki í client.
- Non-Iceland results eru filteruð út með `validateIcelandicCoords`.
- Rate limit er til staðar, best-effort per IP.
- `PlaceSearch` hættir að hamra á Google JS eftir failure í sama component instance.
- `RouteSelectionStep` sýnir fallback texta í stað endalauss loading.
- `TravelAuditMap` reynir static map og fellur svo í text fallback.
- Engin breyting á veðurmati, thresholds eða route-weather deterministic logic.

## Staðfesting á testum

Codex keyrði:

```bash
npm run type-check
```

Niðurstaða:

- Exit code: 0
- `tsc --noEmit` grænt.

Codex keyrði:

```bash
npm run test:run
```

Niðurstaða:

- Exit code: 0
- 54 test files passed
- 1769 tests passed
- 27 skipped
- 8 todo

## Tillaga að næsta skrefi

Ég myndi gera eitt af tvennu:

### Valkostur A - Fljót production rescue

Ef Stebbi vill ýta þessu fljótt út:

1. Staðfesta `GOOGLE_MAPS_SERVER_KEY` í Google Cloud:
   - Geocoding API enabled/allowed
   - Routes API enabled/allowed
   - ekki Websites/referrer restriction á server key
2. Keyra `npm run type-check` og `npm run test:run` hjá Claude Code.
3. Deploya.
4. Prófa strax í Android Chrome með cache hreinsuðu og/eða incognito.

Þetta er ásættanlegt því code blockers fundust ekki.

### Valkostur B - Polished rescue

Áður en deploy:

1. Laga empty-state vs failure-state í `PlaceSearch`.
2. Bæta try/catch í `handleSelect` Google branch.
3. Bæta debounce cleanup.
4. Keyra tests.

Ég hallast að B ef þetta tekur stutt, en A er samt verjanlegt ef production vandinn er að bíta núna.

## Localhost checks for Stebbi

### 1. Venjulegt Google flæði

1. Opna `/auth-mvp/vedrid`.
2. Leita að `Garðabær`.
3. Velja stað.
4. Leita að `Akureyri`.
5. Velja stað.
6. Staðfesta að kort birtist ef Google JS virkar.
7. Reikna ferð.

Expected:

- Engar visible regressions frá fyrri útgáfu.
- Suggestions birtast fljótt.
- Kortið birtist þegar Google virkar.

### 2. Simulated Google JS failure

Í DevTools Network blocking:

- blocka `maps.googleapis.com`
- blocka `places.googleapis.com`

Svo refresh.

Expected:

- Route selection map sýnir skilaboð um að kort hafi ekki hlaðist.
- Staðaleit á samt að skila niðurstöðum ef `/api/place/search` og server key virka.
- Notandi á að geta valið frá/til og komist áfram.

### 3. Prófa API route beint

Á localhost, innskráður með `vedrid` access:

- Opna `/api/place/search?q=reykjavik`

Expected:

- JSON með `results`.
- Ef 503 kemur: server provider/key/API restriction er ekki tilbúið.
- Ef 401/404 kemur: auth/feature gate state þarf að skoða.

### 4. Production Android Chrome

Eftir deploy:

1. Prófa í Chrome Incognito á Android.
2. Prófa venjulegan Chrome eftir að site data hefur verið hreinsað.
3. Prófa Samsung Internet til samanburðar.

Expected:

- Ef Google JS klikkar í Chrome, á fallback search samt að virka.
- Ef bæði Google JS og BFF faila, þarf screenshot af Console og Network fyrir `/api/place/search`.

## Supabase / auth / production gögn

- Engin SQL eða migration í þessari breytingu.
- Engin RLS breyting.
- Nýja API route les Supabase auth user og feature access.
- Engin notendagögn eru skrifuð.
- Google provider niðurstöður eru ekki geymdar í Supabase.
- In-memory cache geymir staðaleitarniðurstöður per query í process minni í 10 mín, ekki per user.

## Óvissa / þarf að staðfesta

- Codex prófaði ekki browser UI sjálft, aðeins kóða og test suite.
- Production server key stilling er óstaðfest og þarf að skoða í Google Cloud áður en fallback er treyst.
- Ef Google Cloud billing/full account state hefur áhrif á Geocoding API, kemur það fram sem 503 frá `/api/place/search`.
- Ef Vercel environment hefur ekki `GOOGLE_MAPS_SERVER_KEY` í Production, fallbackið virkar ekki.
