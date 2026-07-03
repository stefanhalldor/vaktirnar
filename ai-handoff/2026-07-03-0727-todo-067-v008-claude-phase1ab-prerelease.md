# TODO #67 Vedrid — Phase 1A+1B Pre-Release Handoff
**Dagsetning:** 2026-07-03 07:27
**Frá:** Claude (Sonnet 4.6)
**Til:** Stebbi

---

## Staða: Tilbúið til útgáfu

Öll Phase 1A+1B kóðavinna er lokið. Type-check og tests ná í gegn.

---

## Hvað var gert

### Nýjar skrár (lib/weather/)
- `lib/weather/types.ts` — WeatherStatus, HourPoint, DeterministicResult, AiResult, WeatherAnswerEnvelope, ResolvedPlace
- `lib/weather/thresholds.ts` — WEATHER_THRESHOLDS (grill: tooWindyMs=8, dry: maxPrecipMmPerHour=0.1)
- `lib/weather/places.ts` — resolvePlace(), roundCoord(), local alias map (10 staðir)
- `lib/weather/forecast.ts` — parseMetnoForecast(), filterHours()
- `lib/weather/tools.ts` — checkGrillWeather() → DeterministicResult
- `lib/weather/metno.server.ts` — fetchForecast() með Supabase cache og met.no HTTP handling
- `lib/weather/ai.server.ts` — getAiAnswer() með @anthropic-ai/sdk, forced tool use, validation

### Nýjar skrár (app/)
- `app/api/teskeid/weather/ask/route.ts` — POST handler
- `app/auth-mvp/vedrid/page.tsx` — server wrapper (guardTeskeidSession + guardFeatureAccess)
- `app/auth-mvp/vedrid/VedridClient.tsx` — client UI (form, chips, status dot, "Af hverju?" disclosure)
- `app/auth-mvp/vedrid/loading.tsx` — canonical TeskeidLoader

### Nýjar SQL skrár
- `sql/67_weather_cache.sql` — weather_cache tafla (EKKI keyrð enn)

### Breyttar skrár (existing)
- `lib/loans/guard.ts` — bætti við `vedrid` case í checkFeatureAccess (WEATHER_ENABLED + WEATHER_FLAG)
- `.env.example` — bætti við WEATHER_ENABLED, WEATHER_FLAG, WEATHER_AI_ENABLED, WEATHER_AGENT_MODEL, ANTHROPIC_API_KEY, METNO_USER_AGENT
- `app/auth-mvp/heim/page.tsx` — bætti við `weatherEnabled` í Promise.all og `vedrid` í READY_TESKEID_ROUTES
- `components/teskeid/ReadyTeskeidCard.tsx` — bætti við CloudSun icon fyrir `vedrid` slug
- `messages/is.json` — bætti við `teskeid.vedrid.*` namespace (14 lyklar)
- `messages/en.json` — bætti við `teskeid.vedrid.*` namespace (14 lyklar)

### Nýjar prófanaskrár
- `lib/__tests__/weather-places.test.ts` — 15 tests (resolvePlace, roundCoord)
- `lib/__tests__/weather-forecast.test.ts` — 13 tests (parseMetnoForecast, filterHours)
- `lib/__tests__/weather-tools.test.ts` — 16 tests (checkGrillWeather, öll stöður + edge cases)
- `lib/__tests__/guard.test.ts` — bætti við 16 tests fyrir `vedrid` (sama mynstur og facebook-oauth)
- `lib/__tests__/sql-migration.test.ts` — bætti við 9 tests fyrir sql/67

### npm pakki
- `@anthropic-ai/sdk` installað (package.json + package-lock.json)

---

## Prófanir

```
npm run type-check  → clean (0 villur)
npm run test:run    → 46 test files, 1463 passed, 22 skipped, 8 todo
```

---

## Hvað þarf að gera á Vercel / í raun

### 1. Keyra SQL migration
```sql
-- Límdu inn sql/67_weather_cache.sql í Supabase SQL Editor
```

Migrations sjá um:
- Búa til `weather_cache` töflu
- Virkja RLS
- Gefa service_role aðgang (engin policy — service_role sleppur alltaf)

### 2. Setja umhverfisbreytur í Vercel
```
WEATHER_ENABLED=true
# WEATHER_FLAG=true    # stilltu þetta til að opna per-user, annars opið fyrir alla
WEATHER_AI_ENABLED=true          # ef þú vilt AI svar
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=<lykill>       # ef WEATHER_AI_ENABLED=true
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

**Athugaðu:** WEATHER_ENABLED=false (eða ósett) þýðir að Veðrið er algerlega ósýnilegt (sama mynstur og LOANS_ENABLED, UMONNUN_ENABLED).

### 3. Ganga úr skugga um að hugmyndin `vedrid` sé til í Supabase
Heim-síðan sýnir Teskeiðina þegar `ideas.slug = 'vedrid'` og `ideas.status = 'launched'`. Ef hún er ekki til verður að bæta henni við í `ideas` töflunni. Ef hún er til en `status` er ekki `launched`, þarf að uppfæra.

### 4. WEATHER_FLAG per-user gate (valfrjálst)
Til að opna aðeins fyrir ákveðna notendur, stilltu `WEATHER_FLAG=true` og bættu netföngum við `feature_access` töfluna með `feature_key = 'vedrid'`.

---

## Atriði sem eru EKKI í Phase 1 (TBD síðar)
- Fleiri intent (ekki bara grill): laundry, golf, painting, caravan
- Geocoding provider (núna er local alias map með 10 stöðum)
- Notifications / recurring checks
- Persónulegar stillingar

---

## Localhost próf checklist
- [ ] `WEATHER_ENABLED=true` í `.env.local`
- [ ] `METNO_USER_AGENT=Teskeidin/1.0 (+https://localhost; dev@example.com)` í `.env.local`
- [ ] `ANTHROPIC_API_KEY=<lykill>` ef `WEATHER_AI_ENABLED=true`
- [ ] SQL migration keyrð á dev Supabase verkefni
- [ ] Hugmyndin `vedrid` er til með `status=launched`
- [ ] Fara á `/auth-mvp/vedrid` og spyrja: "Er grillveður í Mósó í kvöld?"
- [ ] Athuga að status-dot birtist (grænt/gult/rautt)
- [ ] Athuga "Af hverju?" disclosure
- [ ] Athuga að hleðslan lítur rétt út (TeskeidLoader)
- [ ] Athuga að back-link virki → `/auth-mvp/heim`
- [ ] Athuga að heim-síðan sýni Veðrið kort þegar logged inn og WEATHER_ENABLED=true
