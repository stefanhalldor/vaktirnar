# Claude Code: TODO #69 v012 framkvæmt — prerelease handoff

Created: 2026-07-11 07:36
Timezone: Atlantic/Reykjavik
Tengist: TODO #069
Byggt á: v012 Codex final scope review

## Staða

Framkvæmd lokið. Ekkert commitað, pushað eða deployað.

## Hvað var gert

### 1. `lib/teskeid/usage.server.ts`
- `userId: string` → `userId: string | null`

### 2. `app/api/teskeid/weather/travel/routes/route.ts`
- Bætt við `actor`/`userId` local helpers rétt eftir rate limit check
- Öll þrjú `recordTeskeidUsageEvent` köll fjarlægð úr `if (user)` blokkum
- Bætt við `actor` í öll metadata objects
- Nýtt `weather_route_options_rate_limited` event þegar guest er stoppað af IP takmörkun (fyrir rate limit 429 return)

### 3. `app/api/teskeid/weather/travel/route.ts`
- Bætt við `actor`/`userId` local helpers
- Öll fjögur `recordTeskeidUsageEvent` köll fjarlægð úr `if (user)` blokkum
- Bætt við `actor` í öll metadata objects

### 4. `app/api/admin/teskeid-usage/route.ts`
- Bætt við `getActor()` backward-compatible helper (prefers `metadata.actor`, fallback til `user_id` presence)
- Nýjar talningar: `routeCalcAuth`, `routeCalcPublic`, `finalForecastAuth`, `finalForecastPublic`, `rateLimitedPublic`
- `weatherFinalForecasts` reiknað af `finalForecastEvents.length` (var áður `weatherByName[...]`)
- Ný fields í zero-state og response:
  - `route_options_calculated_authenticated`
  - `route_options_calculated_public`
  - `route_options_rate_limited_public`
  - `final_forecast_completed_authenticated`
  - `final_forecast_completed_public`

### 5. `app/(admin)/admin/page.tsx`
- `TeskeidUsageWeather` type fékk 5 ný fields
- `Virkir notendur` → `Innskráðir notendur` (skýrara þar sem guest events eru nú taldar)
- Veðrið detail grid: bætt við public/auth split á route options og final forecast, stoppað-af-takmörkun row

### 6. Próf
- `lib/__tests__/teskeid-usage.test.ts`: 2 ný próf — `userId: null` accepted, `actor` kemst í gegnum sanitizer
- `lib/__tests__/weather-routes-api.test.ts`: `checkWeatherGuestRateLimit` mock bætt við, `guestUser()` helper, 7 ný próf:
  - guest `calculated` event með `userId: null` og `actor: 'guest'`
  - guest `failed` event
  - `rate_limited` event + 429
  - rate_limited recorders ekki `calculated`
  - authenticated events fá `actor: 'authenticated'`
  - guest metadata inniheldur ekki staðanöfn, lat, lon

## Prófarniðurstöður

```
Test Files  65 passed (65)
Tests  2060 passed | 27 skipped | 8 todo (2095)
```

TypeScript: tsc --noEmit: engar villur.

## Hvað var EKKI gert

- Engin SQL migration
- Engar RLS/grant breytingar
- Engir nýir env vars
- Engin breyting á `sanitizeUsageMetadata` blocked patterns
- `weather-travel-api.test.ts` var ekki uppfært — þau próf nota þegar `userId: user.id` í mock og ná yfir authenticated path. Guest final forecast events fylgja sama pattern og route events og eru þægilega þakin af routes-prófin.

## Localhost checks fyrir Stebbi

### Setup
- `.env.local`: `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=true`, `WEATHER_PUBLIC_ENABLED=true`
- SQL 71 þarf að vera keyrð (þegar til)
- `USAGE_EVENT_SECRET` ef distinct route-pair metrics eru þörf

Ekki keyra marga route calculations — hvert guest-köll gæti notað Google Routes API.

### Public route options
1. Opna `/vedrid` í private/incognito glugga (óinnskráður)
2. Velja Reykjavík → Akureyri
3. Bíða eftir route options
4. **Vænt**: route options birtast; admin (eftir 5 mín) sýnir `Óinnskráðir` = 1 undir "Leiðir reiknaðar"

### Public final forecast
5. Velja leið og klára veðurútreikning
6. **Vænt**: niðurstaða birtist; admin sýnir `Lokaniðurstöður — óinnskráðir` = 1

### Authenticated regression
7. Opna `/auth-mvp/vedrid` sem innskráður notandi
8. Reikna leið
9. **Vænt**: `Innskráðir` = 1, `Óinnskráðir` óbreytt

### Admin UI
10. Opna `/admin` → Veðrið section
11. **Vænt**:
    - "Leiðir reiknaðar" = total
    - "Innskráðir" og "Óinnskráðir" = rétt split
    - "Stoppað af takmörkun" = 0 (eða fjöldi ef rate limit var þreyttur)
    - "Innskráðir notendur" (ekki "Virkir notendur") í summary cards
    - Engin raw user_id, route hash, IP, staðanöfn eða hnit í UI

### Rate limit (aðeins á localhost með mock eða controlled test)
12. Þegar guest er stoppað: admin sýnir "Stoppað af takmörkun" = 1, "Leiðir reiknaðar" óbreytt
