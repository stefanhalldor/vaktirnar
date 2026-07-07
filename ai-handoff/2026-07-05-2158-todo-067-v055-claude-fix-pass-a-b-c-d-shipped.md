# TODO-067 v055 - Claude Code fix-pass A/B/C/D shipped

Created: 2026-07-05 21:58
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Framkvæmd lokið. Engin commit, engin push, engin deploy, engin SQL, engar production/env breytingar.

---

## Samantekt

Allar fjórar lagfæringar úr v054 eru framkvæmdar og staðfestar með prófum.

---

## Fix A — General driving thresholds fyrir engan eftirvagn

**Vandinn:** `evalDrivingLeg` skilaði alltaf `graent` þegar `trailerKind === 'none'`, jafnvel í 25 m/s storm.

**Lagfæring:**

- `lib/weather/thresholds.ts`: Bætt við `driving` blokk:
  ```ts
  driving: { cautionWindMs: 15, redWindMs: 20, redGustMs: 28 }
  ```
- `lib/weather/travel.ts`: `evalDrivingLeg` notar nú `WEATHER_THRESHOLDS.driving` þegar `trailerKind === 'none'`:
  - `gult` ef vindur >= 15 m/s eða úrkoma > 0.1 mm/klst
  - `rautt` ef vindur >= 20 m/s eða hviður >= 28 m/s
  - `graent` ef allt undir þröskuldum
- `svar` texti uppfærður til að meðhöndla `reasonCode === 'too_windy_driving'`

**Prófar:**
- calm + no trailer → `graent`
- caution wind (15 m/s) + no trailer → `gult`, reasonCode `caution_wind_driving`
- red wind (20 m/s) + no trailer → `rautt`, reasonCode `too_windy_driving`
- red gust (28 m/s) + no trailer → `rautt`, reasonCode `too_windy_driving`
- precip (0.5 mm/h) + no trailer → `gult`, reasonCode `precipitation`

---

## Fix B — Destination forecast fyrir stay/lodging window

**Vandinn:** Stay window notaði `worstConditions(pointForecasts, ...)` sem sótti versta veður á allri leiðinni, ekki bara á áfangastað.

**Lagfæring:**

- `lib/weather/travel.ts`:
  - `TravelWeatherInput` fékk nýtt valfrjálst svæði: `destinationForecast?: { hours: HourPoint[] }`
  - Stay window notar nú eingöngu `[destinationForecast]` þegar það er til staðar
  - Ef `destinationForecast` vantar og outdoor lodging + return: `{ stada: 'gult', reasonCode: 'no_data' }` (conservative fallback)

- `app/api/teskeid/weather/travel/route.ts`:
  - Sækir forecast sérstaklega fyrir `destCandidate.lat/lon` samhliða route point forecasts
  - Sendir sem `destinationForecast` inn í `checkTravelWeather`

**Prófar:**
- windy route point during stay + calm destination → stay `graent` (destination controls)
- calm route + windy destination stay + tent → `rautt` (too_windy_tent)
- no destinationForecast + tent + returnDepartureAt → `gult` (no_data conservative)

---

## Fix C — Sampling missir ekki destination

**Vandinn:** `push(last)+splice(MAX)` myndi fjarlægja destination punkt ef route hafði >15 punkta.

**Lagfæring:**

- `app/api/teskeid/weather/travel/route.ts`:
  - Loop-inn cap-ar nú beint: `for (...; weatherPoints.length < MAX_WEATHER_POINTS; ...)`
  - Engar `push(last)` eða `splice()` eftir á
  - Destination forecast er sótt sérstaklega (Fix B), þannig að route sampling er eingöngu fyrir driving exposure points
  - Fallback check uppfærður: `if (pointForecasts.length === 0 && !destinationForecast)` → 503

---

## Fix D — Kortastaðfesting í wizard

**Vandinn:** `FerdalagidClient` sýndi bara texta-card (nafn + heimilisfang) eftir staðarval.

**Lagfæring:**

- `lib/weather/staticMap.ts`: Þegar þegar til (búið til í fyrra skrefi) — `getStaticMapUrl(lat, lon)` notar `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

- `components/weather/MapConfirmation.tsx`:
  - Bætt við `useState` og `imgFailed` state
  - `onError` handler á `<img>` → setur `imgFailed = true`
  - Fallback: MapPin icon í muted box með stable aspect ratio þegar mynd bilar
  - Alt text notar þýðingarlykil: `t('mapAlt', { place: placeName })`

- `messages/is.json` + `messages/en.json`:
  - Bætt við `"mapAlt": "Kort af {place}"` / `"Map of {place}"` undir `teskeid.vedrid.mapConfirmation`

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`:
  - Import: `MapConfirmation`, `getStaticMapUrl`
  - Nýjar state breytur: `originMapUrl`, `destinationMapUrl`
  - Við staðarval í origin og destination: `setOriginMapUrl(getStaticMapUrl(p.lat, p.lon))`
  - Origin og destination confirmation step: ef `mapUrl` er til staðar → `MapConfirmation`, annars → `PlaceConfirmation` (text fallback)
  - `startOver()` hreinsar bæði `originMapUrl` og `destinationMapUrl`
  - `onChangePlace` hreinsar mapUrl samhliða place state

---

## Skrár breyttar

- `lib/weather/thresholds.ts` — driving blokk
- `lib/weather/travel.ts` — Fix A (driving thresholds) + Fix B (destinationForecast)
- `app/api/teskeid/weather/travel/route.ts` — Fix B (destination forecast fetch) + Fix C (sampling)
- `components/weather/MapConfirmation.tsx` — Fix D (imgFailed, mapAlt translation)
- `messages/is.json` — mapAlt lykill
- `messages/en.json` — mapAlt lykill
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — Fix D (MapConfirmation í wizard)
- `lib/__tests__/weather-travel.test.ts` — Uppfærð/bætt við prófum

---

## Skipanir keyrðar

- `npm run type-check` — exit code 0
- `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts` — exit code 0, 112 tests passed
- `npm run test:run` — exit code 0, 51 files, 1637 tests passed, 22 skipped, 8 todo

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.

---

## Hvað var ekki gert

- Engin commit, push eða deploy
- Engar `.env.local` breytingar
- Engar Google Cloud/billing/key uppsetningar
- Ekki farið í gamla `/ask` route-branch (medium priority, ekki blocker)
- Engin interactive/draggable map
- Engin admin toggle, Mapbox adapter, destination discovery

---

## Localhost checks for Stebbi

### Forsendur

1. Settu Google env vars á localhost ef ekki þegar gert:
   ```
   WEATHER_MAP_PROVIDER=google
   GOOGLE_MAPS_SERVER_KEY=...
   NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
   WEATHER_AI_ENABLED=false
   ```
2. Endurræstu localhost dev server sjálfur eftir env breytingu.

### Kortastaðfesting

3. Opnaðu `/auth-mvp/vedrid`.
4. Sláðu inn `Reykjavík` í staðarleit og veldu.
5. Staðfestu að confirmation sýni static map með pinna, nafn og `Breyta stað` hnapp.
6. Smelltu `Breyta stað` — staðarleit kemur aftur.
7. Veldu destination, t.d. `Akureyri` — sama staðfesting á destination.
8. Prófaðu tvírætt heiti eins og `Suðurgata` — kortið ætti að gefa visual confirmation.
9. Slökktu á `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` í `.env.local` og endurræstu:
   - Staðfesting á að fara í text fallback (`PlaceConfirmation`), engin crash.
10. Kveiktu aftur á key og endurræstu áður en þú prófa veðrið.

### Veðurmat — enginn eftirvagn

11. Veldu origin + destination, settu brottfarardag innan met.no forecast window.
12. Veldu **Enginn eftirvagn** og **Gisti ekki**.
13. Smelltu `Skoða veður`.
14. Breyttu manually brottfarardag í tíma þar sem vindur er líklega mikill — t.d. storm-spá á næstu dögum.
15. Staðfestu að niðurstaðan sé EKKI alltaf `Gott` þegar vindur er mikill án eftirvagns.

### Veðurmat — dvöl á áfangastað

16. Veldu Reykjavík → Mývatn, settu brottfarardagsetningu og heimferð daginn eftir.
17. Veldu **Tjald** sem gistingu.
18. Smelltu `Skoða veður`.
19. Staðfestu að `Dvöl á áfangastað` í facts endurspegli Mývatn veður, ekki versta veður á Holtavörðuheiði.

### Mobile

20. Prófaðu 360/390/460 px viewport: engin horizontal overflow, engin input zoom, kortið heldur stable aspect ratio (2:1).

---

## Óvissa

- Kortastaðfesting krefst að `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` sé stillt. Ef lykillinn er til staðar en Static Maps API er ekki virkjað á honum mun mynd bila og fallback (MapPin icon) sést — þetta er rétt hegðun.
- Localhost prófanir á veðurmati þurfa met.no forecast gögn — spáin nær yfir ~9 daga frá núverandi tíma.
