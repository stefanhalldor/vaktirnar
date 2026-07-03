# TODO #67 Vedrid - Codex review of v010 mini-fix prerelease

**Dagsetning:** 2026-07-03 07:54  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Review a `2026-07-03-0750-todo-067-v010-claude-minifix-prerelease.md` eftir v009 findings.

## Verdict

v010 leysir stóru v009 blokkirnar að mestu: `vedrid` er nú leyft í DB constraint migration, admin API allowlist, SQL tests og met.no cache tests eru komin. Type-check og test suite eru græn hjá Codex.

Ég myndi leyfa local/dev prerelease prófun núna með `WEATHER_FLAG=true`, en production rollout ætti enn að bíða þar til Stebbi hefur annað hvort:

1. samþykkt að bæta sér í `feature_access` með SQL/direct API, eða
2. látið Claude bæta `vedrid` section við admin UI.

## Findings

### Medium - admin API styður vedrid, en admin UI sýnir ekki vedrid section

`app/api/admin/feature-access/route.ts` leyfir nú `vedrid`, en `app/(admin)/admin/page.tsx` renderar aðeins:

- `featureKey="umonnun"`
- `featureKey="tengsl"`

og `FeatureAccessSectionProps` er enn typed sem `'umonnun' | 'tengsl'`.

Afleiðing: v010 checklist segir að Stebbi geti "eða nota admin UI" til að bæta email við `feature_access`, en það virðist ekki rétt fyrir `vedrid` eins og staðan er núna. Það er samt hægt að nota SQL/direct API.

Tillaga:

- Annað hvort breyta checklist: "notaðu SQL insert fyrir `vedrid` í bili".
- Eða láta Claude bæta þriðju `FeatureAccessSection` við admin page:
  - `featureKey="vedrid"`
  - `heading="Veðrið-aðgangur"`
  - `flagName="WEATHER_FLAG"`
  - uppfæra prop type og admin-page tests.

### Medium - example chips eru enn hardcoded user-facing text

`app/auth-mvp/vedrid/VedridClient.tsx` er enn með `EXAMPLE_QUESTIONS` sem íslenskan user-facing texta í component. API error textar voru lagaðir yfir í messages/error codes, en chipsin vantar enn.

Þetta er ekki blocker fyrir local/dev test, en ætti að laga fyrir production til að fylgja project reglu um `messages/is.json` og `messages/en.json`.

### Medium - missing weather fields eru bara að hluta leyst

`parseMetnoForecast()` sleppir nú entries þar sem `wind_speed` vantar. Það er framför. En `air_temperature`, `precipitation_amount` og `wind_from_direction` defaulta enn í `0`.

Helsta áhættan er `precipitation_amount ?? 0`: ef precipitation-gögn vantar gæti svarið orðið of bjartsýnt. Líklega er þetta sjaldgæft í met.no compact response, en fyrir bulletproof nálgun væri betra að:

- sleppa punktum þar sem precipitation data vantar fyrir valið period, eða
- skila `gult/no_data` þegar lykilgögn vantar.

## Staðfestingar

### v009 Major 1 - per-user gate

Staða: að mestu leyst.

- `sql/68_feature_access_vedrid.sql` bætir `vedrid` í `feature_access_feature_key_check`.
- `app/api/admin/feature-access/route.ts` bætir `vedrid` í `ALLOWED_FEATURES`.
- Static SQL test er komið fyrir sql/68.
- Feature access API test er komið fyrir `?feature=vedrid`.

Eftir stendur bara admin UI rendering, sjá finding að ofan.

### v009 Major 2 - met.no cache tests

Staða: leyst fyrir unit-level coverage.

`lib/__tests__/weather-metno.test.ts` prófar cache hit/miss, 304, 403, 429, network fallback og non-fatal cache write failure. Þetta er góð aukning.

Residual: tests mocka `parseMetnoForecast`, þannig þau prófa ekki full integration á raw met.no body -> parsed HourPoint í sömu keðju. Það er ásættanlegt sem næsta stig, ekki blocker.

### v009 Medium 1 - API hardcoded error text

Staða: að mestu leyst.

API skilar nú `unsupported_intent`, `unknown_place`, `forecast_unavailable`, og client mappar í messages. Eftir standa hardcoded example chips.

### v009 Medium 2 - false-green missing data

Staða: hluta leyst.

`wind_speed` missing entries eru filteruð út. `precipitation_amount` og `air_temperature` eru enn defaultuð í `0`.

## Prófanir keyrðar af Codex

```text
npm run type-check
Exit code: 0

npm run test:run
Exit code: 0
Test Files: 47 passed (47)
Tests: 1484 passed, 22 skipped, 8 todo (1514)
```

Engar migrations voru keyrðar af Codex. Engar Supabase, Vercel, production, env eða billing breytingar voru gerðar.

## Leiðbeiningar fyrir Stebba núna

### Ef þú vilt halda áfram í localhost/dev prófun

Þetta er nú nægilega tilbúið til local/dev prófunar, með einni skýrri breytingu frá v010:

- ekki treysta á admin UI fyrir `vedrid` access nema Claude bæti Veðrið section við admin page
- notaðu SQL insert beint fyrir dev access

### Dev SQL röð

Keyra fyrst á dev Supabase, ekki production:

1. `sql/67_weather_cache.sql`
2. `sql/68_feature_access_vedrid.sql`

Síðan bæta þínu login email við:

```sql
INSERT INTO public.feature_access (feature_key, email)
VALUES ('vedrid', 'stebbi@teskeid.is')
ON CONFLICT (feature_key, email) DO NOTHING;
```

Ef localhost login notar annað email, nota það í staðinn.

### `.env.local`

Byrja án AI kostnaðar:

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_AI_ENABLED=false
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

Þegar deterministic flæðið er grænt:

```env
WEATHER_AI_ENABLED=true
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=<þinn lykill>
```

Restartaðu dev server eftir `.env.local` breytingar.

### Ekki Vercel enn

Ég myndi ekki setja Vercel env fyrr en:

- dev migrations hafa verið keyrðar og staðfestar
- Stebbi hefur prófað localhost
- annað hvort admin UI hefur verið uppfært fyrir `vedrid` eða ákveðið er meðvitað að nota SQL/API fyrir allowlist
- AI model/key hefur verið prófað local

## Localhost checks for Stebbi

1. Með `WEATHER_AI_ENABLED=false`:
   - opna `/auth-mvp/heim`
   - staðfesta að Veðrið kort birtist fyrir allowlisted user
   - opna `/auth-mvp/vedrid`
   - spyrja `Er grillveður í Mósó í kvöld?`
   - vænt: deterministic svar, status dot, facts undir `Af hverju?`, enginn AI source texti

2. Feature gate:
   - prófa með email sem er ekki í `feature_access`
   - vænt: Veðrið kort sé ekki sýnilegt og direct route sé ekki aðgengileg

3. Weather cache:
   - eftir fyrsta successful request, skoða dev Supabase `weather_cache`
   - vænt: cache key byrjar á `metno:locationforecast:2.0:compact:`
   - vænt: engin notenda-email, prompt eða Anthropic gögn í cache

4. Error states:
   - spyrja `Er grillveður á Tunglinu í kvöld?`
   - vænt: þægileg unknown-place villa
   - spyrja `Má ég mála húsið í Mósó?`
   - vænt: unsupported-intent villa

5. AI smoke:
   - setja `WEATHER_AI_ENABLED=true` og `ANTHROPIC_API_KEY`
   - restart dev server
   - spyrja sömu grillspurningu
   - vænt: AI-orðað svar ef Anthropic kall tekst; annars deterministic fallback
   - ef AI svar birtist ekki, skoða hvort model name sé valid fyrir lykilinn

6. Mobile/design:
   - prófa 360px, 390px og 460px breidd
   - focusa textarea og loka keyboard
   - vænt: ekkert mobile zoom, ekkert horizontal overflow, controls hoppa ekki í loading

Ekki keyra production SQL, setja Vercel env, deploya eða snerta production `feature_access` án sérstöku leyfis.

## Næsta skref

Ég myndi biðja Claude um mjög lítinn v012 polish-fix áður en þú prófar:

1. bæta `vedrid` section við admin page, eða uppfæra handoff/checklist þannig að SQL insert sé eina leiðin í bili
2. færa `EXAMPLE_QUESTIONS` í `messages`
3. ákveða hvort precipitation missing eigi að vera `gult/no_data` frekar en `0`

Ef þú vilt komast strax í local prófun, þá er það líka raunhæft núna: notaðu SQL insert í stað admin UI og byrjaðu með `WEATHER_AI_ENABLED=false`.
