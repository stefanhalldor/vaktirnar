# Claude prerelease handoff: TODO #46 Task B — Public Veðrið/Umönnun

Created: 2026-07-10 14:30
Timezone: Atlantic/Reykjavik
Tengist: TODO #46 v006

## Staða

Task B er lokið. Kóðabreytingarnar eru tilbúnar til prerelease-prófunar á localhost.
Ekkert er commitað, pushað eða deployað.

## Hvað var gert

### Nýjar skrár

- `lib/weather/ip-rate-limit.server.ts` — IP rate limit hjálparfall fyrir gestnotendur
- `app/vedrid/page.tsx` — opinber `/vedrid` síða (þarfnast WEATHER_PUBLIC_ENABLED=true)
- `app/umonnun/page.tsx` — opinber `/umonnun` upplýsingasíða (þarfnast AUTH_MVP_ENABLED=true)
- `lib/__tests__/weather-public.test.ts` — 21 einingapróf (öll grænast)

### Breytar skrár

- `middleware.ts` — bætti við `/vedrid`, `/umonnun`, `/api/teskeid/weather/travel`,
  `/api/teskeid/weather/saved-places` í PUBLIC_PATHS
- `app/api/teskeid/weather/travel/routes/route.ts` — optional auth, WEATHER_ENABLED
  check, IP rate limit fyrir gestnotendur (bara hér), usage events aðeins fyrir
  innskráða
- `app/api/teskeid/weather/travel/route.ts` — optional auth, WEATHER_ENABLED check,
  usage events aðeins fyrir innskráða (engin rate limit increment hér)
- `app/api/teskeid/weather/saved-places/route.ts` — GET skilar `{ places: [] }` fyrir
  gesti þegar WEATHER_PUBLIC_ENABLED=true; POST/DELETE haldast óbreytt (401 fyrir gesti)
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `isGuest` prop, added-value strip, 429
  meðhöndlun, back link, TeskeidMenu variant
- `messages/is.json` — bætti við `guestHint`, `guestSignIn`, `errorGuestRateLimited`
- `messages/en.json` — sama á ensku
- `lib/__tests__/weather-routes-api.test.ts` — bætti við WEATHER_ENABLED í beforeEach
- `lib/__tests__/weather-travel-api.test.ts` — bætti við WEATHER_ENABLED í beforeEach
- `lib/__tests__/middleware.test.ts` — uppfærði private API test path (var á
  /api/teskeid/weather/travel sem er nú opinber)

## Svör við spurningum v006

**1. Exactly which endpoint increments the 5/day guest limit?**

Eingöngu `/api/teskeid/weather/travel/routes` (POST). Þetta er Google-kostnaðarkallan.
Sjá `app/api/teskeid/weather/travel/routes/route.ts` — `checkWeatherGuestRateLimit`
er kallað þar en ekki í `app/api/teskeid/weather/travel/route.ts`.

**2. Does one normal guest trip consume exactly one of the five daily slots?**

Já. Eitt flæði (velja Frá/Til → routes → thresholds → reikna) kallar routes endpoint
einu sinni. Það incrementar talninguna einu sinni.

**3. What happens if a guest opens route options but never finishes final forecast?**

Hann eyðir einum slota. Routes endpoint incrementar þegar route options eru sóttar,
óháð því hvort gestnotandinn lýkur ferðaútreikningunum.

**4. Are authenticated users fully outside this guest rate limit?**

Já. `checkWeatherGuestRateLimit` er eingöngu kallað í `else` grein þar sem
`user?.email` er falsy. Innskráðir notendur komast aldrei í þá grein.

**5. Which tests prove guest saved places cannot write/read private data?**

Sjá `lib/__tests__/weather-public.test.ts` section C ("guest saved-places contract"):
- GET skilar `{ places: [] }` — les engin DB gögn
- POST endurþarf 401 (authGuard) — skrifar ekkert
- DELETE endurþarf 401 (authGuard) — eyðir engu
RLS hlutast til sem harður mörk ef eitthvað sleiðist í gegn.

**6. Was SQL changed or run?**

Nei. Engar SQL breytingar. Enginn migration var skrifaður eða keyrður í þessum Task B.

## Kröfur á env vars

Til að opna opinbert Veðrið:

```
AUTH_MVP_ENABLED=true
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
```

Sjálfgefin rate limit er 5 ferðir/IP/dag. Breytanleg með:

```
WEATHER_PUBLIC_IP_DAILY_LIMIT=5
```

Til að opna opinbera Umönnun síðu:

```
AUTH_MVP_ENABLED=true
```

## Localhost athuganir fyrir Stebbi

Sjá v006 handoff fyrir tæmandi lista. Helstu atriði:

### Gestur að nota Veðrið

1. Opna `/vedrid` í incognito (þarf WEATHER_PUBLIC_ENABLED=true í .env.local)
2. Vænt: síða opnast án redirect
3. Grænna stripe með "Þekktir staðir vistast fyrir innskráða notendur og þeir geta
   reiknað ótakmarkaðan fjölda af ferðum" og "Innskrá" takka sést
4. Slá inn Frá/Til og halda ferðinni áfram — ætti að virka

### Rate limit

1. Reikna 5 ferðir sem gestur (sömu IP)
2. 6. ferð: routes endpoint skilar 429
3. Vænt: UI sýnir "Þú hefur reiknað 5 ferðir í dag sem gestur. Skráðu þig inn til að
   reikna fleiri ferðir." og "Innskrá" takka — ekkert hrá API villa

### Innskráður notandi

1. Skrá sig inn og opna Veðrið (`/auth-mvp/vedrid` eða `/vedrid`)
2. Vænt: added-value stripe sést ekki, gestalímið gildir ekki, saved places virka

### Opinber Umönnun

1. Opna `/umonnun` óinnskráður
2. Vænt: síða opnast, sýnir upplýsingar, tenglar á umonnun.is / App Store / Play Store

### Saved places

1. Óinnskráður: opna `/vedrid` — engin saved places sjást, engin villa
2. Innskráður: saved places virka eins og áður

## Prófunarniðurstöður

```
Test Files  64 passed (64)
Tests  2041 passed | 27 skipped | 8 todo (2076)
```

TypeScript: tsc --noEmit: engar villur.

## Hvað á eftir (ekki í þessum Task B)

- Commit og push (Stebbi þarf að gefa leyfi)
- Env var uppfærsla á Vercel (WEATHER_PUBLIC_ENABLED, WEATHER_PUBLIC_IP_DAILY_LIMIT)
- SQL 72 (auth email code idempotency) — aðskilið frá þessum Task B
- Auth v001 commit/push — aðskilið
