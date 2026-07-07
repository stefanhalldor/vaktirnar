# TODO #67 Vedrid - Codex review of v040 production gating

Created: 2026-07-03 16:27
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Review/advice only. Engar kóðabreytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

Reviewed:
- `ai-handoff/2026-07-03-1625-todo-067-v040-claude-phase2a1-shipped.md`
- `lib/loans/guard.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/api/teskeid/weather/ask/route.ts`
- `.env.example`
- `lib/weather/metno.server.ts`

## Findings

### Major 1 - Google env vars do not hide Phase 2A1; `WEATHER_ENABLED` / `WEATHER_FLAG` do

Refs:
- `lib/loans/guard.ts:70`
- `lib/loans/guard.ts:71`
- `lib/loans/guard.ts:72`
- `app/auth-mvp/heim/page.tsx:61`
- `app/auth-mvp/heim/page.tsx:72`
- `app/auth-mvp/vedrid/page.tsx:7`
- `app/api/teskeid/weather/ask/route.ts:22`
- `app/api/teskeid/weather/ask/route.ts:24`
- `.env.example:41`
- `.env.example:42`
- `.env.example:43`

Svar við spurningunni: já, 2A1 er falið í production ef `WEATHER_ENABLED` er ekki `true`.

En það er mikilvægt að rugla þessu ekki saman við Google Maps env breytur. `GOOGLE_MAPS_SERVER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` og `WEATHER_MAP_PROVIDER` stjórna ekki sýnileika Phase 2A1. Þær eru fyrir Phase 2A2 route/map provider.

Núverandi gating hegðun er:

- `WEATHER_ENABLED` unset eða ekki `true`: Veðrið birtist ekki á heimaskjá og `/auth-mvp/vedrid` redirectar á `/`; API skilar 404.
- `WEATHER_ENABLED=true` og `WEATHER_FLAG` unset/eða ekki `true`: Veðrið er opið öllum innskráðum notendum.
- `WEATHER_ENABLED=true` og `WEATHER_FLAG=true`: Veðrið er bara opið þeim sem eru í `feature_access` með `feature_key='vedrid'`.

Ef Claude Code er að ýta 2A1 út á raun án þess að `WEATHER_ENABLED=true` sé sett í production, þá á virknin að vera falin. Ef `WEATHER_ENABLED=true` er þegar til í production frá Phase 1, þá verður 2A1 sýnilegt samkvæmt sömu reglum.

### Medium 1 - Production push of 2A1 breytir notendasýnilegri virkni ef Veðrið er þegar enabled

Refs:
- `ai-handoff/2026-07-03-1625-todo-067-v040-claude-phase2a1-shipped.md`
- `app/api/teskeid/weather/ask/route.ts:37`
- `app/api/teskeid/weather/ask/route.ts:39`
- `app/api/teskeid/weather/ask/route.ts:66`
- `app/api/teskeid/weather/ask/route.ts:69`

v040 segir að Phase 2A1 sé localhost-prófað og engar production breytingar hafi verið gerðar. Ef þetta er núna að fara á raun, þá er það release ákvörðun, ekki bara internal milestone.

Ef Veðrið er production-enabled, notendur fá:

- golfveður-glugga,
- fleiri þekkta staði/aliases,
- route/hjólhýsi spurningar sem skila "coming soon/provider not configured",
- áfram grill regression.

Það er ekki háð Google Maps lyklum.

Mín ráðlegging: ef þú vilt ýta kóðanum út en halda þessu falið, láta production `WEATHER_ENABLED` vera unset/false. Ef þú vilt prófa sjálfur í production, nota `WEATHER_ENABLED=true` + `WEATHER_FLAG=true` og feature_access row fyrir þig.

### Medium 2 - Ef `WEATHER_FLAG=true` á að nota í production þarf `vedrid` að vera leyfilegt í feature_access

Refs:
- `lib/loans/guard.ts:73`
- `app/api/admin/feature-access/route.ts:7`
- `lib/__tests__/sql-migration.test.ts:931`
- `lib/__tests__/sql-migration.test.ts:953`

Ef production á að vera "bara Stebbi sér Veðrið", þá þarf:

- `WEATHER_ENABLED=true`
- `WEATHER_FLAG=true`
- SQL sem leyfir `feature_key='vedrid'` í `feature_access` constraintinu
- feature_access row fyrir Stebba/admin test-user

Annars gæti niðurstaðan verið að enginn komist inn, eða að admin insert fyrir `vedrid` mistakist ef production constraintið er gamalt.

### Minor 1 - Weather cache SQL vantar ekki til að fela feature, en skiptir máli fyrir met.no álag

Refs:
- `lib/weather/metno.server.ts:19`
- `lib/weather/metno.server.ts:27`
- `lib/weather/metno.server.ts:32`
- `lib/weather/metno.server.ts:46`
- `lib/weather/metno.server.ts:71`
- `lib/weather/metno.server.ts:92`

Ef `weather_cache` taflan er ekki komin á production en Veðrið er enabled, þá virðist kóðinn samt eiga að halda áfram: cache read/write errors eru non-fatal. Það þýðir samt að production notar meira live met.no fetch og fær ekki cache ávinning.

Þetta er ekki sýnileika-gate, en fyrir raunopnun er betra að vera viss um að `sql/67_weather_cache.sql` hafi verið keyrt og service-role grants/RLS séu rétt.

## Practical answer for Stebbi

Ef þú ert **ekki** búinn að stilla `WEATHER_ENABLED=true` í production, þá á 2A1 að vera falið þótt kóðinn fari út.

Ef þú ert bara **ekki** búinn að stilla Google Maps breyturnar, þá er 2A1 ekki sjálfkrafa falið. Golf/grill geta samt verið sýnileg ef `WEATHER_ENABLED=true`. Route-spurningar skila bara skilaboðum um að route weather sé í vinnslu.

## Recommended production choices

Veldu eina af þessum leiðum áður en Claude Code ýtir þessu á raun:

1. **Falið fyrir alla:**
   - Ekki setja `WEATHER_ENABLED=true` í production.
   - Kóðinn má fara út, en Veðrið birtist ekki.

2. **Prófa sjálfur/admin aðeins:**
   - Setja `WEATHER_ENABLED=true`
   - Setja `WEATHER_FLAG=true`
   - Keyra/staðfesta `feature_access` support fyrir `vedrid`
   - Bæta þér við `feature_access`

3. **Opið öllum innskráðum:**
   - Setja `WEATHER_ENABLED=true`
   - Láta `WEATHER_FLAG` vera unset/false
   - Þetta gerir Phase 2A1 sýnilegt öllum innskráðum, líka án Google Maps env vars.

Ég myndi velja leið 1 ef þetta á bara að fara út með kóða en ekki birtast. Ég myndi velja leið 2 ef þú vilt production sanity checka sjálfur.

## Localhost checks for Stebbi

Þetta er production-gating review, ekki ný framkvæmd. Á localhost eða preview:

1. `WEATHER_ENABLED` unset/false:
   - Heimaskjár á ekki að sýna Veðrið.
   - `/auth-mvp/vedrid` á að redirecta á `/`.
   - `/api/teskeid/weather/ask` á að skila 404 fyrir innskráðan notanda.

2. `WEATHER_ENABLED=true`, `WEATHER_FLAG` unset/false:
   - Veðrið birtist innskráðum notanda.
   - Grill og golf virka.
   - Route/hjólhýsi skilar "coming soon/provider not configured".

3. `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`:
   - Notandi án `feature_access` sér ekki Veðrið.
   - Notandi með `feature_access(feature_key='vedrid')` sér Veðrið.

Ekki breyta production env, keyra SQL eða opna feature öllum án sérstakrar release-ákvörðunar.
