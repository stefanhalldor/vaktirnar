# 2026-07-17 12:58 - TODO-086 v423 - Claude: B3B routing prerelease

Created: 2026-07-17 12:58
Timezone: Atlantic/Reykjavik

## Hvað var gert

B3B framkvæmt í heild, í þeirri innri röð sem v422 mælti með.

### B3B-0: Preflight (lokið í fyrri hluta lotu)

Staðfest:
- `/vedrid` og `/auth-mvp/vedrid` voru trip wizard (FerdalagidClient)
- `/auth-mvp/vedrid/elta-vedrid` var station explorer (tvíþreifugætt)
- Station API les aðeins `vedurstofan_forecasts_latest` (engar live HTTP beiðnir, engin notendagögn)
- `restore` er sessionStorage-grunnt, ekki URL-query
- `loginNext.ts` leyfir þegar `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid` (engar breytingar þar)
- `FerdalagidClient.tsx:1195` hafði `vedurstofanReturnTo = '/auth-mvp/vedrid'`
- `RouteSelectionStep.tsx:469` hafði `returnTo="/auth-mvp/vedrid"`

### B3B-2: Nýir ferðareiknivélar-routes

Búið til 4 nýjar skrár:

- `app/auth-mvp/vedrid/ferdalagid/page.tsx` — sama logic og gamla `auth-mvp/vedrid/page.tsx`: `guardTeskeidSession` + `resolveAuthenticatedWeatherShellAccess` + `checkFeatureAccess('ferdalagid')` + `FerdalagidClient`
- `app/auth-mvp/vedrid/ferdalagid/loading.tsx` — `TeskeidLoader` eins og aðrir `loading.tsx` í verkefninu
- `app/vedrid/ferdalagid/page.tsx` — sama logic og gamla `vedrid/page.tsx`: mode checks + `FerdalagidClient isGuest`
- `app/vedrid/ferdalagid/loading.tsx` — `TeskeidLoader`

### B3B-1: Reusable overview shell

`VedurstofanStationExplorerClient` uppfært með þrem valkvæðum prop:

- `backHref?: string` — ef gefið, sýnir ChevronLeft back link; annars ekki
- `tripHref?: string` — ef gefið, sýnir "Reikna ferðaveðrið" CTA-takka
- `stationPulseReturnBase?: string` — default `/auth-mvp/vedrid/elta-vedrid`; notar þetta sem grunn að `returnTo` í `VedurstofanPulseInline` í `StationDetail`

`StationDetail` fær `pulseReturnBase: string` prop og byggir `returnTo` sem `${pulseReturnBase}?stationId=${station.stationId}`.

### B3B-3: Compatibility og returnTo

Uppfærðar skrár:

- `lib/weather/pulseBack.ts` — þrír kinds:
  - `'overview'` — `/auth-mvp/vedrid` exact eða `?`/`#` (gamlar pulse-links og nýjar frá overview)
  - `'trip'` — `/auth-mvp/vedrid/ferdalagid` exact eða `?`/`#` (nýr ferðareiknivéll)
  - `'stationExplorer'` — `/auth-mvp/vedrid/elta-vedrid` og undirslóðir (óbreytt)

- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` — back link label uppfært:
  - `kind === 'trip'` → `t('backToTrip')`
  - `kind === 'overview'` → `t('backToOverview')`
  - `kind === 'stationExplorer'` → `t('backToStationExplorer')`

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1195` — `vedurstofanReturnTo = '/auth-mvp/vedrid/ferdalagid'`
- `components/weather/RouteSelectionStep.tsx:469` — `returnTo="/auth-mvp/vedrid/ferdalagid"`

### B3B-4: Yfirlit routes

- `app/auth-mvp/vedrid/page.tsx` — nú `VedurstofanStationExplorerClient` með `tripHref="/auth-mvp/vedrid/ferdalagid"` og `stationPulseReturnBase="/auth-mvp/vedrid"`. Heldur `guardTeskeidSession` + `resolveAuthenticatedWeatherShellAccess`.
- `app/vedrid/page.tsx` — nú `VedurstofanStationExplorerClient` með `tripHref="/vedrid/ferdalagid"` og `stationPulseReturnBase="/vedrid"`. Heldur `AUTH_MVP_ENABLED` og mode checks.
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx` — bætt við `backHref="/auth-mvp/vedrid"` (compat route heldur áfram að virka, back link á overview).

### B3B-5: Station API access contract

`app/api/teskeid/weather/vedurstofan/stations/route.ts` uppfært:

- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'`: krefst innskráðs notanda + `vedrid` + `elta-vedrid` feature rows
- Annars: public read af product/cache gögnum (engar breytingar á öðrum gátum)
- `AUTH_MVP_ENABLED`, `WEATHER_ENABLED`, `WEATHER_ELTA_VEDRID_FLAG` gátar eru enn til staðar

### i18n

Bætt við í `messages/is.json` og `messages/en.json` undir `teskeid.vedrid.eltaVedrid`:

```json
"tripCta": "Reikna ferðaveðrið" / "Calculate trip weather"
"backToOverview": "Til baka í Veðrið" / "Back to Weather"
```

### B3B-6: Tests

Keyrð:

```
npm run type-check        → clean (exit 0)
npm run test:run -- lib/__tests__/pulseBack.test.ts   → 20/20 passed
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/loginNext.test.ts → 121/121 passed (5 skipped, óbreyttir)
```

`lib/__tests__/pulseBack.test.ts` uppfært:
- Gamlar `trip` cases (sem vísuðu á `/auth-mvp/vedrid`) → nú `overview` cases
- Nýjar `trip` cases fyrir `/auth-mvp/vedrid/ferdalagid`
- Nýr lookalike test: `/auth-mvp/vedrid/ferdalagid-fake` → null

## Localhost checks fyrir Stebbi

### Public

1. Opna `/vedrid`
   - Vænt: station overview map, ekki ferðareiknivél
   - Ef `WEATHER_ELTA_VEDRID_FLAG=true` og `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` er ekki `true`: Veðurstofustöðvar sjást
   - "Reikna ferðaveðrið" takki er sýnilegur

2. Smella á "Reikna ferðaveðrið"
   - Vænt: `/vedrid/ferdalagid`
   - Gamalt public ferðaflæði virkar óbreytt

3. Opna `/vedrid/ferdalagid` beint
   - Vænt: sama og gamla `/vedrid` (ferðareiknivél með isGuest)

### Innskráður notandi

1. Opna `/auth-mvp/vedrid`
   - Vænt: station overview, ekki ferðareiknivél
   - "Reikna ferðaveðrið" takki sýnilegur

2. Smella á "Reikna ferðaveðrið"
   - Vænt: `/auth-mvp/vedrid/ferdalagid`
   - Vistaðir staðir og öll trip-virkni virkar eins og áður

3. Opna `/auth-mvp/vedrid/ferdalagid` beint
   - Vænt: sama og gamla `/auth-mvp/vedrid` (ferðareiknivél)

### Veðurstofan station explorer (compat)

1. Opna `/auth-mvp/vedrid/elta-vedrid`
   - Vænt: station explorer virkar áfram
   - Back link "Til baka í ferðaveðrið" → `/auth-mvp/vedrid`

2. Opna `/auth-mvp/vedrid/elta-vedrid?stationId=<known-id>`
   - Vænt: stöð valin við hlöðun

### Pulse back navigation

1. Opna stöð úr `/auth-mvp/vedrid` overview → pulse → til baka
   - Vænt: "Til baka í Veðrið" → `/auth-mvp/vedrid?stationId=...`

2. Opna stöð úr `/auth-mvp/vedrid/ferdalagid` (route wizard) → pulse → til baka
   - Vænt: "Til baka í ferðalagið mitt" → `/auth-mvp/vedrid/ferdalagid`

3. Opna stöð úr `/auth-mvp/vedrid/elta-vedrid` → pulse → til baka
   - Vænt: "Til baka í Veðurpúlsinn" → `/auth-mvp/vedrid/elta-vedrid?stationId=...`

### Station API access

- Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` er ekki sett eða ekki `true`:
  - Óinnskráður notandi getur kallað á `/api/teskeid/weather/vedurstofan/stations` og fær gögn
- Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`:
  - Óinnskráður notandi fær 401
  - Notandi án `vedrid`/`elta-vedrid` feature rows fær 404

### Mobile (390 px)

- Ekkert horizontal overflow
- CTA takki er nothægur
- Map og station preview passa

## Óvissa / þarf að staðfesta

- `WeatherPulseFeed` component í `VedurstofanStationExplorerClient` notar auth-girt endpoint. Fyrir public `/vedrid` skilar hann null þegar 401/403/503 kemur. Þetta virkar þegar prófað, en Stebbi á að staðfesta að engin flash eða villa sé sýnileg á public overview.
- `WEATHER_ELTA_VEDRID_FLAG` er enn gát á station API. Þetta þýðir að public overview sýnir `loadError` ef flaggið er af. Þetta er sama hegðun og áður á `/auth-mvp/vedrid/elta-vedrid`. Ef ætlunin er að station data sé alltaf til staðar á public overview þegar `WEATHER_ENABLED=All`, þarf að fjarlægja eða breyta `WEATHER_ELTA_VEDRID_FLAG` gátina. Þetta var ekki breytt í B3B.
- `elta-vedrid/page.tsx` krefst enn `vedrid` + `elta-vedrid` feature rows á notanda-stig. Eftir B3B er `/auth-mvp/vedrid` open fyrir alla innskráða notendur með weather access. Ef ætlunin er að `/auth-mvp/vedrid/elta-vedrid` sé líka opinn, þarf að uppfæra þær gátar. Þetta var ekki breytt.

## Skrár sem breyttust

```
app/auth-mvp/vedrid/page.tsx                                   (rewritten: overview)
app/auth-mvp/vedrid/ferdalagid/page.tsx                        (new: trip calculator)
app/auth-mvp/vedrid/ferdalagid/loading.tsx                     (new)
app/auth-mvp/vedrid/elta-vedrid/page.tsx                       (backHref prop added)
app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx  (props + CTA)
app/auth-mvp/vedrid/FerdalagidClient.tsx                       (vedurstofanReturnTo)
app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx  (overview kind)
app/vedrid/page.tsx                                            (rewritten: overview)
app/vedrid/ferdalagid/page.tsx                                 (new: trip calculator)
app/vedrid/ferdalagid/loading.tsx                              (new)
app/api/teskeid/weather/vedurstofan/stations/route.ts          (public access)
components/weather/RouteSelectionStep.tsx                      (returnTo)
lib/weather/pulseBack.ts                                       (overview + trip kinds)
lib/__tests__/pulseBack.test.ts                                (updated tests)
messages/is.json                                               (tripCta, backToOverview)
messages/en.json                                               (tripCta, backToOverview)
```
