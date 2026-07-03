# TODO #67 Vedrid - Codex review of v008 prerelease

**Dagsetning:** 2026-07-03 07:34  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Review a `2026-07-03-0727-todo-067-v008-claude-phase1ab-prerelease.md`, med serstokum fokus a migration, env vars, per-user gate, localhost og hvort tetta se tilbuid til utgafu.

## Verdict

Ekki merkja v008 sem production-ready enn. Kjarnaflæðið er komið langt, en per-user gate er ekki heilt i gegnum stackinn. Það er i lagi ad profa local/dev afmarkad, en ekki setja i Vercel/prod rollout fyrr en atridin undir Major eru leyst.

Claude Code segir i v008 ad `WEATHER_FLAG=true` megi nota til ad opna per-user og baeta `feature_key = 'vedrid'` i `feature_access`. Thad stenst ekki nuna vegna DB constraint og admin API allowlist.

## Findings

### Major - per-user gate er ekki raunhaeft enn

- `lib/loans/guard.ts` notar `vedrid` fyrir per-user access þegar `WEATHER_FLAG=true`.
- `.env.example` lysir `WEATHER_FLAG=true` sem per-user access.
- En nyjasta feature_access constraint i `sql/66_feature_access_facebook_oauth.sql` leyfir bara `('umonnun', 'tengsl', 'facebook-oauth')`.
- `app/api/admin/feature-access/route.ts` leyfir lika bara `['umonnun', 'tengsl', 'facebook-oauth']`.

Afleiding: ef Stebbi setur `WEATHER_FLAG=true` og reynir ad baeta ser inn sem `vedrid`, getur DB insert failad vegna check constraint, og admin API getur hafnad feature key sem invalid. Þetta er blocker fyrir bulletproof per-user prerelease.

Lagfaering sem tharf fyrir execution handoff:

- Annað hvort uppfæra `sql/67_weather_cache.sql` áður en hún er keyrð, eða búa til næstu migration, t.d. `sql/68_feature_access_vedrid.sql`.
- Migration þarf að drop/re-add `feature_access_feature_key_check` með `('umonnun', 'tengsl', 'facebook-oauth', 'vedrid')`.
- `app/api/admin/feature-access/route.ts` þarf að bæta `vedrid` við `ALLOWED_FEATURES`.
- Static SQL tests þurfa að staðfesta að `vedrid` sé leyft.

### Major - v008 fullyrðir meira cache-test coverage en er til

v008 listar weather unit tests fyrir places/forecast/tools og sql/67, en engin `weather-metno.test.ts` eða sambærileg test sjást fyrir `lib/weather/metno.server.ts`.

Þar vantar test fyrir:

- cache hit þegar `expires_at > now`
- 304 Not Modified
- 403/429 fallback á stale cache
- non-ok response án cache
- cache write failure sem má ekki fella requestið
- að cache key sé `metno:locationforecast:2.0:compact:{lat3}:{lon3}`

Þetta er ekki endilega blocker fyrir handvirkt localhost smoke-test, en það er production-risk því met.no + cache er ytri dependency og lykilhluti í "bulletproof" leiðinni.

### Medium - API skilar hardcoded notendatexta sem client birtir beint

`app/api/teskeid/weather/ask/route.ts` skilar islenskum villutexta i JSON, og `VedridClient` birtir `data.error` beint. Þetta fer gegn project-reglu um að notendatexti eigi heima i `messages/is.json` og `messages/en.json`.

Betra mynstur:

- API skilar stable error code, t.d. `unsupported_intent`, `unknown_place`, `forecast_unavailable`.
- Client mappar error code yfir i `messages`.

### Medium - missing weather fields verða 0 og geta gefið falskt grænt svar

`parseMetnoForecast()` notar `?? 0` fyrir hitastig, vind, vindhviður og úrkomu. Ef met.no shape breytist eða stök fields vantar getur það litið út eins og lygnt og þurrt veður.

Betra:

- annað hvort sleppa hourly punktum sem vantar core fields
- eða leyfa `null` i `HourPoint` og láta toolið skila `gult/no_data` frekar en grænu þegar lykilgögn vantar.

### Minor - deterministic copy þarf aðeins fágun

`Já, þetta lítur vel út til grill í ${placeName}!` er skiljanlegt en ekki náttúrulegasta íslenska. Betra væri t.d. `Já, þetta lítur vel út fyrir grill í ${placeName}!` eða `...til að grilla...`.

## Leiðbeiningar fyrir Stebba - skref fyrir skref

### 0. Ekki byrja i Vercel

Claude leggur til að setja env beint i Vercel, en fyrir þetta feature er betra að byrja i `.env.local` og dev Supabase.

Ástæða:

- Anthropic lykill getur valdið kostnaði.
- met.no cache migration þarf að vera staðfest.
- per-user gate er ekki heilt fyrr en `vedrid` er komið i feature_access constraint og admin allowlist.
- Vercel env + deploy er production rollout, ekki local sanity check.

### 1. Bidja Claude fyrst um mini-fix

Biddu Claude Code um ad laga þessi atriði áður en þú keyrir migration:

1. Bæta `vedrid` við `feature_access` constraint í SQL migration, helst sem ný `sql/68_feature_access_vedrid.sql` ef `sql/67_weather_cache.sql` er talin final.
2. Bæta `vedrid` við `ALLOWED_FEATURES` í `app/api/admin/feature-access/route.ts`.
3. Bæta static SQL test fyrir `vedrid` í feature_access constraint.
4. Bæta eða planleggja `metno.server.ts` tests fyrir cache/HTTP fallback.

Ekki keyra production SQL fyrr en þessi mini-fix er kominn og rýndur.

### 2. Local `.env.local` fyrst

Þegar mini-fixið er komið, settu þetta fyrst í `.env.local`, ekki Vercel:

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_AI_ENABLED=true
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=<þinn Anthropic lykill>
METNO_USER_AGENT=Teskeidin-dev/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

Ath:

- `WEATHER_ENABLED=true` opnar feature globally nema `WEATHER_FLAG=true` sé líka sett.
- `WEATHER_FLAG=true` á að vera default prerelease leiðin hjá ykkur, en hún virkar ekki rétt fyrr en `vedrid` er leyft i `feature_access`.
- `WEATHER_AI_ENABLED=true` þýðir að local próf getur notað Anthropic og þar með kostað örlítið.
- Ef þú vilt fyrst prófa án AI kostnaðar: settu `WEATHER_AI_ENABLED=false`, prófaðu deterministic svarið, settu svo `true` og prófaðu AI.
- Ég myndi ekki nota `dev@example.com` í User-Agent. Nota frekar vaktaða netfangið `teskeid@gottvibe.is`.

Restartaðu dev server eftir `.env.local` breytingar, því Next les env við start.

### 3. Dev Supabase migration

Keyra fyrst á dev/local Supabase, ekki production:

1. Keyra weather cache migration (`sql/67_weather_cache.sql`).
2. Keyra feature_access vedrid migration ef hún verður sér migration (`sql/68_feature_access_vedrid.sql`).
3. Staðfesta að `weather_cache` hafi RLS enabled, engar client policies, og service_role grant.
4. Staðfesta að `feature_access_feature_key_check` leyfi `vedrid`.

Ekki keyra þetta kæruleysislega á production. Þetta snertir schema, RLS/grants og feature gating.

### 4. Bæta Stebba í per-user gate á dev

Þegar `vedrid` er leyft í constraint:

```sql
INSERT INTO public.feature_access (feature_key, email)
VALUES ('vedrid', 'stebbi@teskeid.is')
ON CONFLICT (feature_key, email) DO NOTHING;
```

Ef þú notar annað login email á localhost, notaðu það canonical/lowercase email í staðinn.

### 5. Staðfesta `ideas` row á dev

Heim-síðan sýnir kortið ef hugmyndin er launched. Staðfesta í dev:

- `ideas.slug = 'vedrid'`
- `ideas.status = 'launched'`

Ef þetta vantar, biðja Claude um read-only staðfestingu eða afmarkaða dev-Supabase leið. Ekki breyta production row án sér samþykkis.

### 6. Localhost smoke-test röð

1. Skrá inn á localhost með email sem er í `feature_access` fyrir `vedrid`.
2. Opna `/auth-mvp/heim`.
3. Staðfesta að Veðrið kort birtist.
4. Opna `/auth-mvp/vedrid`.
5. Spyrja: `Er grillveður í Mósó í kvöld?`
6. Staðfesta að:
   - submit button fari í loading/pending
   - svar birtist með grænum/gulum/rauðum status
   - `Af hverju?` opnist og sýni facts
   - AI svar birtist ef `WEATHER_AI_ENABLED=true`
   - deterministic svar birtist ef AI er off eða failar
   - back-link fari til `/auth-mvp/heim`
7. Prófa unknown place:
   - `Er grillveður á Tunglinu í kvöld?`
   - á að gefa fallega villu, ekki crash.
8. Prófa unsupported intent:
   - `Má ég mála húsið í Mósó í kvöld?`
   - á að segja að spurningin sé ekki studd enn.

### 7. Dev Supabase smoke-check eftir local próf

Eftir fyrsta successful request:

- `weather_cache` á að hafa row með cache key sem byrjar á `metno:locationforecast:2.0:compact:`.
- `response_body` má innihalda met.no forecast JSON.
- Taflan má ekki innihalda Anthropic prompt, notenda-email eða spurningu Stebba.
- `expires_at`, `fetched_at`, `updated_at` eiga að vera sett.

### 8. Vercel kemur seinna

Settu ekki env i Vercel fyrr en:

- mini-fix fyrir per-user gate er kominn
- dev SQL migration hefur verið keyrð og prófuð
- localhost smoke-test hefur tekist
- Codex hefur rýnt loka-handoffið

Þegar Vercel kemur:

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_AI_ENABLED=true
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=<production Anthropic key>
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

Fyrir production rollout:

1. Keyra SQL migrations á production með sérstöku samþykki.
2. Bæta aðeins völdum emailum í `feature_access` með `feature_key='vedrid'`.
3. Setja Vercel env.
4. Deploya.
5. Staðfesta sem allowlisted user.
6. Staðfesta sem non-allowlisted user að feature sé ósýnilegt.

## Localhost checks for Stebbi

Nákvæm local próf áður en release er samþykkt:

1. Með `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`, `WEATHER_AI_ENABLED=false`:
   - skrá inn sem allowlisted user
   - opna `/auth-mvp/heim`
   - opna `/auth-mvp/vedrid`
   - spyrja `Er grillveður í Mósó í kvöld?`
   - vænt: deterministic svar, status dot, facts, enginn AI source texti
2. Með `WEATHER_AI_ENABLED=true` og `ANTHROPIC_API_KEY`:
   - spyrja sömu spurningu
   - vænt: AI-orðað svar ef Anthropic kall tekst, en sama deterministic status og facts undir "Af hverju?"
3. Með user sem er ekki í `feature_access`:
   - opna `/auth-mvp/heim`
   - vænt: Veðrið kort sé ekki sýnilegt
   - opna `/auth-mvp/vedrid` beint
   - vænt: redirect eða 404/access-block samkvæmt núverandi feature gate mynstri
4. Mobile checks samkvæmt `Design.md`:
   - prófa 360px, 390px og 460px breidd
   - focusa textarea og loka keyboard
   - vænt: ekkert mobile zoom, ekkert horizontal overflow, submit/control helst nothæft
5. Dev Supabase:
   - staðfesta að `weather_cache` row myndist
   - staðfesta að engin notendagögn eða promptar séu í cache töflunni

Ekki prófa production SQL, production Vercel env, production feature_access eða production Anthropic rollout án sérstöku samþykkis frá Stebba.

## Tillaga að næsta skrefi

Bidja Claude Code um v010 mini-fix handoff sem gerir per-user gate heilt:

- feature_access constraint leyfir `vedrid`
- admin API leyfir `vedrid`
- SQL/static tests uppfærð
- met.no cache tests annað hvort bætt við eða skráð sem meðvitaður release-risk
- hardcoded API/user text flyst í messages eða verður error-code based

Eftir það er hægt að keyra local/dev migration og fara í handvirku prófin hér að ofan.
