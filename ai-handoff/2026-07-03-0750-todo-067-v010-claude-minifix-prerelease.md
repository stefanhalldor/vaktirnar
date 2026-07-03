# TODO #67 Vedrid — Mini-fix handoff (v009 blokkur leystir)
**Dagsetning:** 2026-07-03 07:50
**Frá:** Claude (Sonnet 4.6)
**Til:** Stebbi og Codex

---

## Allar blokkur úr v009 Codex review leysdar

### Major 1 — per-user gate heilt í gegnum stackinn

**Vandinn:** `vedrid` var ekki leyft í `feature_access` DB constraint og admin API allowlist.

**Lagfæring:**
- `sql/68_feature_access_vedrid.sql` — ný migration sem drop/re-add constraint: `('umonnun', 'tengsl', 'facebook-oauth', 'vedrid')`
- `app/api/admin/feature-access/route.ts` — bætti `'vedrid'` við `ALLOWED_FEATURES`
- `lib/__tests__/sql-migration.test.ts` — 4 ný tests fyrir sql/68
- `lib/__tests__/feature-access-api.test.ts` — 1 nýr test: `?feature=vedrid` skilar 200

### Major 2 — metno cache/HTTP tests

**Vandinn:** Engin tests fyrir `lib/weather/metno.server.ts`.

**Lagfæring:**
- `lib/__tests__/weather-metno.test.ts` — 16 tests sem ná yfir:
  - Cache hit (ekki útrunnið): fetch ekki kallað
  - Cache miss (engin röð): fetch kallað, URL með réttum koordinötum og User-Agent
  - Cache miss (útrunnið): If-Modified-Since sent
  - HTTP 304: stale cache skilað, ekki throw
  - HTTP 403: fallback á cache eða throw ef engin cache
  - HTTP 429: fallback á cache eða throw ef engin cache
  - Network error: fallback á cache eða throw ef engin cache
  - Cache write failure: non-fatal, forecast skilar samt

### Medium 1 — error codes í stað Íslensks texta í API

**Vandinn:** `route.ts` skilaði harðkóðuðum Íslenskum villutexta sem `VedridClient` birti beint.

**Lagfæring:**
- `app/api/teskeid/weather/ask/route.ts` — skilar nú stable error codes: `unsupported_intent`, `unknown_place`, `forecast_unavailable`
- `app/auth-mvp/vedrid/VedridClient.tsx` — mappar error codes á `t()` í stað þess að birta `data.error` beint
- `messages/is.json` — 3 ný lyklar: `errorUnsupportedIntent`, `errorUnknownPlace`, `errorForecastUnavailable`
- `messages/en.json` — 3 ný lyklar (sama)

### Medium 2 — parseMetnoForecast gefur ekki falskt grænt við gögn sem vantar

**Vandinn:** `wind_speed ?? 0` þýddi að HourPoints án vind-gagna töldust sem 0 m/s (falskt grænt).

**Lagfæring:**
- `lib/weather/forecast.ts` — `.filter((ts) => ts.data?.instant?.details?.wind_speed !== undefined)` áður en `.map()` keyrir — punktar án `wind_speed` eru slepptar
- `lib/__tests__/weather-forecast.test.ts` — test uppfært: "skips entries where wind_speed is undefined"

### Minor — copy fix

**Vandinn:** "til grill" er óeðlilegt Íslenskt.

**Lagfæring:**
- `lib/weather/tools.ts` — `"til grill"` → `"til að grilla"` í jákvæðu svarinu
- `lib/__tests__/weather-tools.test.ts` — test uppfært: `expect(result.svar).toContain('til að grilla')`

---

## Prófanir

```
npm run type-check  → clean (0 villur)
npm run test:run    → 47 test files, 1484 passed, 22 skipped, 8 todo
```

---

## SQL migrations í réttri röð

Tvær migrations þurfa að keyra, í þessari röð:

```
1. sql/67_weather_cache.sql    — búa til weather_cache töflu
2. sql/68_feature_access_vedrid.sql — bæta vedrid við feature_access constraint
```

Báðar eru ókeyrðar. Keyra á dev Supabase fyrst.

---

## Localhost próf checklist (uppfært)

- [x] Keyra `sql/67_weather_cache.sql` á dev Supabase
- [x] Keyra `sql/68_feature_access_vedrid.sql` á dev Supabase
- [x] Bæta eigin email við feature_access með `feature_key='vedrid'` (eða nota admin UI)
- [x] Setja í `.env.local`:
  ```
  WEATHER_ENABLED=true
  WEATHER_FLAG=true
  WEATHER_AI_ENABLED=false   # byrja án AI kostnaðar
  METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
  ```
- [ ] Staðfesta hugmyndina `vedrid` með `status='launched'` í ideas töflunni
- [ ] Opna `/auth-mvp/heim` — staðfesta Veðrið kort
- [ ] Opna `/auth-mvp/vedrid` — spyrja "Er grillveður í Mósó í kvöld?"
- [ ] Prófa unknown place: "Er grillveður á Tunglinu í kvöld?" → þægileg villa, ekki crash
- [ ] Prófa unsupported intent: "Má ég mála húsið í Mósó?" → þægileg villa
- [ ] Staðfesta `weather_cache` röð í Supabase eftir fyrsta request
- [ ] Ef staðfest: reyna `WEATHER_AI_ENABLED=true` með `ANTHROPIC_API_KEY`
