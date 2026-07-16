# v237 Master release handoff — todo-086 Veðrið full release

Created: 2026-07-15 18:00
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Tests: 2561 pass (at v233 checkpoint — must re-verify after reviewing full diff below)

---

## Hvað er í þessari útgáfu

Þetta er ein stór útgáfa sem inniheldur allt frá v226 til v233:

1. **Auth mode fix** — `WEATHER_ENABLED=All/Authenticated` lyklar í stað gamla `true/false` kerfis
2. **Guard uppfærsla** — `lib/loans/guard.ts` notar `getWeatherEnabledMode()`, skilur á `WEATHER_AUTH_ACCESS_REQUIRED` og `weather-provider-vedurstofan`
3. **Veðurstofan freshness tracking** — `vedurstofanFreshness.ts`, SQL 75 (run-state dálkar)
4. **Forecast history** — SQL 77, `readVedurstofanProductForStations` les history til að fylla inn liðin tíma í sama cycle
5. **Cron optimisation** — 10 mín smart-schedule, hoppar ef fresh/running/recentlyAttempted
6. **Provider layer UI** — FerdalagidClient endurskrifaður, veituval, VedurstofanPointCard, WindStatusBadge, blend
7. **Trip assessment** — `trip.ts`, `trip-assessment.ts`, `providerComparator.ts`
8. **Freshness + refresh API** — tvær nýjar endpoints
9. **Admin** — `weather-provider-vedurstofan` í feature-access API og admin síðu
10. **SQL 76** — feature_access constraint fyrir weather-provider-vedurstofan
11. **Bug fixes** — gestir í Authenticated mode fara á /innskraning, ekki /

---

## SKREF 1 — SQL migrations (keyra í Supabase ÁÐUR en push)

Þessar þrjár SQL skrár verða að vera keyrðar í production Supabase áður en kóðinn er pushað.
Ef þær eru EKKI keyrðar fyrst mun cron og history-lestur bresta í production.

### sql/75_weather_fetch_runs_metadata.sql

Bætir við dálkum í `weather_fetch_runs` töfluna:
- `status` (running/succeeded/failed/skipped)
- `triggered_by` (cron/manual/admin)
- `trigger_reason`
- `expected_atime`
- `result_atime`
- Unique index til að koma í veg fyrir samhliða runs

Þarf vegna: `app/api/cron/warm-vedurstofan/route.ts` kallar `getVedurstofanRunState()` og `insertVedurstofanRunningRow()`.

### sql/76_feature_access_weather_provider_vedurstofan.sql

Bætir `weather-provider-vedurstofan` við leyfðar feature keys í `feature_access` töflunni.

Þarf vegna: `lib/loans/guard.ts` athugar `checkPerUserAccess(email, 'weather-provider-vedurstofan')`.

### sql/77_vedurstofan_forecasts_history.sql

Stofnar `vedurstofan_forecasts_history` töflu.

Þarf vegna: `lib/weather/providers/vedurstofan.server.ts` les úr þessari töflu þegar `etaWindowFromIso`/`etaWindowToIso` eru gefin.

**Röð:** keyra 75 fyrst, svo 76, svo 77.

---

## SKREF 2 — Vercel env uppfærsla (ÁÐUR en push)

Fara í Vercel → Project Settings → Environment Variables.

### Þarf að breyta / staðfesta:

```env
NEXT_PUBLIC_SITE_URL=https://teskeid.is          ← breyta ef enn localhost
WEATHER_ENABLED=All                               ← breyta (allir sjá base MET/Yr)
WEATHER_AUTH_ACCESS_REQUIRED=true                 ← halda (per-user gate fyrir /auth-mvp/vedrid)
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true ← halda (Veðurstofan aðeins per-user)
WEATHER_TRIP_FLAG=true                            ← halda
WEATHER_ELTA_VEDRID_FLAG=true                     ← halda
WEATHER_AI_ENABLED=false                          ← halda
```

### Þarf að eyða / skilja eftir óstillt:

```env
WEATHER_PUBLIC_ENABLED          ← fjarlægja (legacy, ekki notað lengur)
WEATHER_FLAG                    ← fjarlægja (legacy, skipt út fyrir WEATHER_AUTH_ACCESS_REQUIRED)
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED   ← fjarlægja (legacy)
VEDURSTOFAN_TRAVEL_LAYER_ENABLED       ← fjarlægja (legacy)
WEATHER_ENABLED=true            ← breyta í All (ef enn true)
```

**Mikilvægt:** `NEXT_PUBLIC_*` breytur eru build-time inlined. Ef þær eru breyttar EFTIR að build hefst þarf að gera fresh redeploy.

---

## SKREF 3 — git add (nákvæmlega þessar skrár)

Nota EKKI `git add .` — TODO.md og WORKFLOW.md verða EKKI committed.

### Nýjar skrár (untracked → git add)

```bash
git add -- "lib/weather/weatherBaseAccess.server.ts"
git add -- "lib/weather/weatherEnabledMode.server.ts"
git add -- "lib/weather/vedurstofanFreshness.ts"
git add -- "lib/weather/providers/vedurstofanBlend.ts"
git add -- "lib/weather/providerComparator.ts"
git add -- "lib/weather/trip.ts"
git add -- "lib/weather/trip-assessment.ts"
git add -- "components/weather/VedurstofanPointCard.tsx"
git add -- "components/weather/WindStatusBadge.tsx"
git add -- "app/api/teskeid/weather/vedurstofan/freshness/route.ts"
git add -- "app/api/teskeid/weather/vedurstofan/refresh/route.ts"
git add -- "sql/75_weather_fetch_runs_metadata.sql"
git add -- "sql/76_feature_access_weather_provider_vedurstofan.sql"
git add -- "sql/77_vedurstofan_forecasts_history.sql"
```

### Nýjar prófunarskrár

```bash
git add -- "lib/__tests__/weather-provider-comparator.test.ts"
git add -- "lib/__tests__/weather-trip.test.ts"
git add -- "lib/__tests__/weather-trip-assessment.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-blend.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-freshness.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-run-state.test.ts"
```

### Breyttar upprunaskrár (modified)

```bash
# Kjarni — guard og access
git add -- "lib/loans/guard.ts"
git add -- "lib/weather/providers/vedurstofan.server.ts"
git add -- "lib/weather/windDisplayStatus.ts"

# API routes
git add -- "app/api/cron/warm-vedurstofan/route.ts"
git add -- "app/api/place/search/route.ts"
git add -- "app/api/teskeid/weather/saved-places/route.ts"
git add -- "app/api/teskeid/weather/saved-places/[id]/route.ts"
git add -- "app/api/teskeid/weather/travel/route.ts"
git add -- "app/api/teskeid/weather/travel/routes/route.ts"
git add -- "app/api/teskeid/weather/vedurstofan/stations/route.ts"
git add -- "app/api/admin/feature-access/route.ts"

# Pages
git add -- "app/(admin)/admin/page.tsx"
git add -- "app/auth-mvp/heim/page.tsx"
git add -- "app/auth-mvp/vedrid/page.tsx"
git add -- "app/auth-mvp/vedrid/FerdalagidClient.tsx"
git add -- "app/auth-mvp/vedrid/VedridClient.tsx"
git add -- "app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx"
git add -- "app/hugmyndir/[slug]/page.tsx"
git add -- "app/page.tsx"
git add -- "app/vedrid/page.tsx"

# Components
git add -- "components/weather/DepartureHeatmap.tsx"
git add -- "components/weather/TravelAuditMap.tsx"
git add -- "components/weather/travelAuditMap.helpers.ts"

# Messages
git add -- "messages/en.json"
git add -- "messages/is.json"

# Config + docs
git add -- ".env.example"
git add -- "vercel.json"
```

### Breyttar prófunarskrár

```bash
git add -- "lib/__tests__/feature-access-api.test.ts"
git add -- "lib/__tests__/guard.test.ts"
git add -- "lib/__tests__/home-page.test.tsx"
git add -- "lib/__tests__/place-search-api.test.ts"
git add -- "lib/__tests__/public-landing.test.ts"
git add -- "lib/__tests__/sql-migration.test.ts"
git add -- "lib/__tests__/travelAuditMap.helpers.test.ts"
git add -- "lib/__tests__/weather-public.test.ts"
git add -- "lib/__tests__/weather-routes-api.test.ts"
git add -- "lib/__tests__/weather-saved-places-api.test.ts"
git add -- "lib/__tests__/weather-travel-api.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-cron-route.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-product-reader.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-projector.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-server.test.ts"
git add -- "lib/__tests__/weather-vedurstofan-warmer.test.ts"
```

### EKKI git add (skilja eftir unstaged):

```
TODO.md
WORKFLOW.md
ai-handoff/  (handoff skrár commitast ekki)
```

---

## SKREF 4 — Staðfesta staged skrár

```bash
git diff --cached --name-only | sort
git status --short
```

Staged skrár eiga að vera nákvæmlega þær 56 skrár sem eru listaðar hér að ofan.
Engar handoff skrár, engar TODO/WORKFLOW skrár eiga að vera staged.

---

## SKREF 5 — Commit

```bash
git commit -m "feat: full Veðrið release — auth mode, Veðurstofan layer, cron freshness, trip assessment (#86)"
```

---

## SKREF 6 — Push og monitor

```bash
git push
```

Fylgjast með Vercel build logs strax. Build tekur 3-5 mínútur.

Ef build misheppnast: EKKI reyna fix með force-push. Lesa build error, gera leiðréttingu, committa og pusha aftur.

---

## SKREF 7 — Post-deploy checks á teskeid.is

### A. Gestir (WEATHER_ENABLED=All)

1. Fara á `teskeid.is` sem óinnskráður.
   - [x] Veðrið kort sýnist á forsíðu
   - [x] Smella á Veðrið → `/vedrid` opnast (ekki /innskraning)
   - [x] MET/Yr veðurgögn birtast
   - [x] Engin Veðurstofan vísir/lag

2. Fara á `teskeid.is/hugmyndir/vedrid` sem óinnskráður.
   - [ ] CTA hnappur → `/vedrid`

3. Slá inn `/vedrid` beint.
   - [x] Opnast (ekki redirect)

### B. Innskráður án vedrid-access (`stebbishj@gmail.com`)

4. `/auth-mvp/heim`
   - [x] Veðrið kort sýnist
   - [x] Smella → `/auth-mvp/vedrid` opnast
   - [x] MET/Yr virkar
   - [x] Engin Veðurstofan

5. Vistaðar staðsetningar
   - [x] Virka (GET/POST/DELETE)

### C. Innskráður með weather-provider-vedurstofan (`teskeid@gottvibe.is` ef honum er veitt aðgangur)

6. `/auth-mvp/vedrid`
   - [x] Veðurstofan lag sýnist í veituvali
   - [x] Veðurstofan gögn birtast á leið
   - [ ] Refresh hnappur er til staðar

### D. Admin

7. Fara á `/admin` (innskráður sem admin)
   - [x] "Veðurstofan-veðurlagalayer" hluti sýnist undir feature access
   - [x] Hægt að gefa `teskeid@gottvibe.is` veituaðgang
   - [x] Hægt að taka veituaðgang frá

### E. Cron

8. Vercel → Cron Jobs
   - [x] `warm-vedurstofan` er stilltur á `*/10 * * * *`
   - [x] Næsti keyrsla er á 10 mínútna fresti (ekki 6 tíma)

### F. Elta veðrið (ef WEATHER_ELTA_VEDRID_FLAG=true)

9. `/auth-mvp/vedrid/elta-vedrid` (með elta-vedrid feature access)
   - [x] Station explorer virkar
   - [ ] Gögn úr `vedurstofan_forecasts_latest` birtast

---

## Ef eitthvað fer úrskeiðis

### SQL 75 misheppnast
Cron mun keyra en skiptir sér ekki af run-state. Fallback er eðlilegur (keyrir alltaf). Getur beðið og keyrt SQL aftur.

### SQL 76 misheppnast
Admin getur ekki veitt `weather-provider-vedurstofan`. Veðurstofan layer kemur aldrei upp. Getur beðið og keyrt SQL aftur.

### SQL 77 misheppnast
History-lestur í `readVedurstofanProductForStations` kastar villu (caught, gracefully skips). Fallback til base product-only. Getur beðið og keyrt SQL aftur.

### Vercel build brotnar
Lesa build log. Algeng ástæða: type villa eða missing import. Laga, committa, pusha aftur.

---

## Áhættumat

| Hluti | Áhætta | Athugasemd |
|-------|--------|------------|
| guard.ts | HÁ — ef gleymt brýtur WEATHER_ENABLED=All | Á staging listanum |
| SQL 75 | MEÐAL — cron virkar en án run-state | Graceful fallback |
| SQL 76 | LÁG — einungis Veðurstofan-veita bilar | Admin getur ekki veitt aðgang |
| SQL 77 | LÁG — history augmentation bilar | Graceful fallback |
| vercel.json cron | LÁG — cron keyrir en á röngu tímasetningu | Getur leiðrétt í Vercel |
| FerdalagidClient | MEÐAL — stór breyting, 801 línur | Þarfnast localhost-staðfestingar |

---

## Hvað er EKKI í þessari útgáfu

- `TODO.md` og `WORKFLOW.md` — project management, ekki production code
- `lib/weather/travel.ts` og `lib/weather/types.ts` — sýnast sem M í git status en `git diff` sýnir engar breytingar (líklega CRLF artifact) — skilja eftir
- `lib/__tests__/weather-travel.test.ts` — sama, engar efnislegar breytingar
- Handoff skrár — commitast aldrei
