# TODO 086 v186 - Env og feature flag contract fyrir veður, auth og provider-a

Created: 2026-07-14 22:53
Timezone: Atlantic/Reykjavik

Mode:
- Handoff / explanation only.
- Engar kóðabreytingar.
- Engar env-breytingar.
- Engar Supabase-breytingar.
- Engin migration keyrð af Codex.

Tilefni:
- Stebbi sagði að env/flöggin væru orðin ruglingsleg og bað um handoff sem útskýrir þetta allt ítarlega en á mannamáli.
- Stebbi límdi inn `.env.local` línur með raunverulegum secret-gildum. Þau eru **ekki endurbirt hér**.

---

## Fyrst: secret hygiene

Stebbi límdi inn nokkur gildi sem líta út eins og raunveruleg secrets. Codex endurbirtir þau ekki.

Flokkun:

### Public eða client-visible

Þessi gildi eru annaðhvort public by design eða mega lenda í browser bundle ef þau byrja á `NEXT_PUBLIC_`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

Athugið samt:

- Supabase anon key er public, en RLS þarf að vera rétt. Hún má ekki gefa aðgang að gögnum án RLS/policies.
- Google browser key er public-ish en getur valdið kostnaði ef ekki er rétt takmörkuð. Hún þarf HTTP referrer restrictions, t.d. `https://teskeid.is/*` og localhost eftir þörf.

### Server-only secrets

Þessi gildi eiga ekki að birtast í client, logs, screenshots, handoffum eða spjalli:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `GOOGLE_MAPS_SERVER_KEY`
- `CRON_SECRET`
- `VOTE_SECRET`
- `AUTH_CODE_SECRET`
- `UNSUBSCRIBE_SECRET`

Áhætta ef þau leka:

- `SUPABASE_SERVICE_ROLE_KEY`: mjög alvarlegt. Getur bypassað RLS og lesið/skrifað gögn með service role.
- `RESEND_API_KEY`: hægt að senda tölvupóst sem appið.
- `GOOGLE_MAPS_SERVER_KEY`: getur valdið Google kostnaði ef takmarkanir eru veikar.
- `CRON_SECRET`: getur triggerað cron endpoints sem nota vinnslu og mögulega ytri köll.
- `AUTH_CODE_SECRET`, `VOTE_SECRET`, `UNSUBSCRIBE_SECRET`: geta haft áhrif á token/signature öryggi og virkni tengla/kóða.

Ráð:

- Ekki líma raunveruleg secret-gildi í handoff eða spjall framvegis, bara `KEY=...`.
- Ef þetta samtal/skjáskot hefur farið út fyrir lokað vinnuumhverfi Stebba, þá er öruggast að rota sérstaklega:
  1. `SUPABASE_SERVICE_ROLE_KEY`
  2. `RESEND_API_KEY`
  3. `GOOGLE_MAPS_SERVER_KEY`
  4. `CRON_SECRET`
  5. síðan auth/vote/unsubscribe secrets eftir áhættumati.

---

## Meginreglan: þrjár tegundir af rofum

Það eru þrír mismunandi hlutir í gangi og þeir heita of líkt:

1. **Master kill switch**
   - Slekkur á heilu feature-i.
   - Dæmi: `WEATHER_ENABLED=false`.

2. **Per-user feature flag**
   - Feature er til, en bara fyrir users með row í `feature_access`.
   - Dæmi: `WEATHER_FLAG=true` þýðir að `vedrid` þarf `feature_access` row.

3. **Public / guest switch**
   - Opnar eitthvað fyrir óinnskráða eða almenna notkun.
   - Dæmi: `WEATHER_PUBLIC_ENABLED=true` opnar public `/vedrid` flæðið.

Þetta er lykillinn að ruglinu:

- `WEATHER_FLAG=true` **opnar ekki fyrir alla**. Það þrengir auth-veður að per-user access.
- `WEATHER_PUBLIC_ENABLED=true` er rofinn sem raunverulega opnar gestaaðgang að `/vedrid`.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` opnar ekki Veðurstofu fyrir alla; hún krefst líka per-user `weather-provider-vedurstofan`.

---

## Núverandi gildi Stebba og hvað þau þýða

Stebbi nefndi þessi gildi, með secrets redacted hér:

```txt
AUTH_MVP_ENABLED=true
LOANS_ENABLED=true
UMONNUN_ENABLED=true
UMONNUN_FLAG=false
TENGSL_ENABLED=true
TENGSL_FLAG=true

WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_TRIP_FLAG=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
WEATHER_AI_ENABLED=false
WEATHER_MAP_PROVIDER=google
METNO_USER_AGENT=...
CRON_SECRET=...
```

### App/auth grunnur

#### `AUTH_MVP_ENABLED=true`

Kveikir á `/auth-mvp/*` og `/api/auth-mvp/*`.

Staðfest í:

- `middleware.ts:44-52`
- `lib/auth/guard.ts`

Ef þetta er `false`:

- Auth-MVP síður loka/redirecta.
- Veður auth-flæði virkar ekki, því `/auth-mvp/vedrid` er undir þessu.

#### `LOANS_ENABLED=true`

Kveikir á `Lánað og skilað`.

Staðfest í:

- `middleware.ts:54-62`
- `lib/loans/guard.ts:54`

Athugið:

- Þetta er global fyrir authenticated users. Ekki per-user flag í núverandi `checkFeatureAccess` contract.

#### `UMONNUN_ENABLED=true` + `UMONNUN_FLAG=false`

Kveikir á Umönnun og opnar hana fyrir alla authenticated users.

Staðfest í:

- `lib/loans/guard.ts:55-58`

Regla:

- `UMONNUN_ENABLED !== true` => lokað.
- `UMONNUN_ENABLED=true` og `UMONNUN_FLAG !== true` => opið öllum authenticated.
- `UMONNUN_ENABLED=true` og `UMONNUN_FLAG=true` => bara users með `feature_access.feature_key='umonnun'`.

#### `TENGSL_ENABLED=true` + `TENGSL_FLAG=true`

Kveikir á Tengsl en heldur þeim undir per-user flaggi.

Staðfest í:

- `middleware.ts:64-70`
- `lib/loans/guard.ts:60-63`

Regla:

- Notandi þarf `feature_access.feature_key='tengsl'`.

---

## Veðurflögg

### `WEATHER_ENABLED=true`

Master switch fyrir veðurkerfið.

Staðfest í:

- `lib/loans/guard.ts:70-88`
- `app/vedrid/page.tsx:5-10`
- `app/api/teskeid/weather/travel/route.ts:173-180`
- `app/api/teskeid/weather/travel/routes/route.ts:27-34`
- `app/api/cron/warm-vedurstofan/route.ts:17-19`

Ef þetta er `false`:

- Auth veður access failar.
- Public `/vedrid` lokast.
- Travel API skilar not found.
- Veðurstofu cron skilar `skipped: weather disabled`.

### `WEATHER_FLAG=true`

Per-user flag fyrir auth-veðrið.

Staðfest í:

- `lib/loans/guard.ts:70-73`
- `app/auth-mvp/vedrid/page.tsx:5-9`

Regla:

- `WEATHER_ENABLED=false` => lokað.
- `WEATHER_ENABLED=true` og `WEATHER_FLAG` unset/false => auth-veður opið öllum authenticated users.
- `WEATHER_ENABLED=true` og `WEATHER_FLAG=true` => notandi þarf `feature_access.feature_key='vedrid'`.

Núverandi gildi Stebba:

- `WEATHER_FLAG=true`, þannig að `/auth-mvp/vedrid` er **ekki global** heldur per-user.

### `WEATHER_PUBLIC_ENABLED=true`

Public/guest switch fyrir `/vedrid`.

Staðfest í:

- `app/vedrid/page.tsx:5-13`
- `app/api/teskeid/weather/travel/routes/route.ts:45-63`
- `app/api/teskeid/weather/travel/route.ts:191-195`
- `app/api/teskeid/weather/saved-places/route.ts:42-50`

Regla:

- Public `/vedrid` þarf:
  - `AUTH_MVP_ENABLED=true`
  - `WEATHER_ENABLED=true`
  - `WEATHER_PUBLIC_ENABLED=true`
- Þetta fer ekki í gegnum `WEATHER_FLAG`, því gestur hefur engan `feature_access` row.

Á mannamáli:

- Þetta er stóri rofinn sem opnar veðrið út á við.
- Með `WEATHER_PUBLIC_ENABLED=true` er guest route virk.
- Þetta getur valdið Google/MET.no notkun og þarf því rate limiting og monitoring.

Athugun / áhætta:

- `travel/routes` guest endpoint keyrir per-IP rate limit.
- `travel` final endpoint virðist krefjast `WEATHER_PUBLIC_ENABLED=true` fyrir gesti, en Codex sá ekki sömu rate limit þar í skoðuðum línum. Claude ætti að staðfesta að gestaflæði geti ekki valdið óheftum Google/MET.no köllum.

### `WEATHER_TRIP_FLAG=true`

Per-user flag fyrir `ferdalagid`.

Staðfest í:

- `lib/loans/guard.ts:75-78`
- `app/auth-mvp/vedrid/page.tsx:8-9`
- Admin section: `app/(admin)/admin/page.tsx` sýnir `Ferðalag-aðgangur`.

Regla:

- `WEATHER_ENABLED=false` => lokað.
- `WEATHER_TRIP_FLAG !== true` => lokað.
- `WEATHER_TRIP_FLAG=true` => notandi þarf `feature_access.feature_key='ferdalagid'`.

Á mannamáli:

- Þetta opnar ekki public veður.
- Þetta stýrir auth-user trip/route affordance.

### `WEATHER_ELTA_VEDRID_FLAG=true`

Per-user flag fyrir `Elta veðrið` validation/explorer síðu.

Staðfest í:

- `lib/loans/guard.ts:80-83`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx:5-10`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`

Regla:

- Notandi þarf bæði:
  - `vedrid` access
  - `elta-vedrid` access
- Þetta er fyrir validation/explorer, ekki sama og travel-layer Veðurstofan provider.

Á mannamáli:

- Þetta er "verkfæri til að sannreyna Veðurstofugögnin".
- Ekki nota þetta sem framtíðarrofa fyrir Veðurstofu-provider í ferðaveðri.

### `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`

Provider-specific rofi fyrir Veðurstofu í ferðaveðrinu.

Staðfest í:

- `lib/loans/guard.ts:85-88`
- `app/api/teskeid/weather/travel/route.ts:342-358`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
- Admin section: `app/(admin)/admin/page.tsx` sýnir `Veðurstofan-veðurlagalayer`.

Regla:

- `WEATHER_ENABLED=false` => lokað.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED !== true` => lokað.
- `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` => notandi þarf `feature_access.feature_key='weather-provider-vedurstofan'`.

Á mannamáli:

- Þetta er núverandi rétti rofinn fyrir Veðurstofu-provider.
- Þetta opnar Veðurstofuna ekki global.
- Þetta er provider-specific og future-proof fyrir `weather-provider-vegagerdin` síðar.

### `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`

Staða:

- Codex fann engin virk code references í app/lib/components með `rg`, bara eldri handoff references.
- Þetta var áður rætt/notað sem sérstakur layer-rofi.
- Nú virðist þetta hafa verið leyst af hólmi með `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.

Á mannamáli:

- Þetta er líklega obsolete/legacy env.
- Það ruglar Stebba vegna þess að nafnið hljómar eins og það sé enn nauðsynlegt.

Tillaga:

- Claude á að staðfesta með fullri repo-leit að enginn runtime code path lesi `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`.
- Ef staðfest: fjarlægja það úr `.env.example`, docs/handoffum framvegis og Vercel env ef til staðar.
- Ekki treysta á þetta flag í núverandi hegðun.

### `WEATHER_AI_ENABLED=false`

Kostnaðarrofi fyrir AI veðursvör.

Staðfest í:

- `lib/weather/ai.server.ts:27-33`

Regla:

- Ef ekki `true`, skilar AI helper `null` og kallar ekki Anthropic.
- Þarf líka `ANTHROPIC_API_KEY` ef kveikt er.

Á mannamáli:

- `false` er rétt ef Stebbi vill byrja án AI kostnaðar.

### `WEATHER_MAP_PROVIDER=google`

Velur kort/route provider.

Staðfest í:

- `lib/weather/provider.server.ts:9-12`
- `app/api/teskeid/weather/travel/route.ts:259-263`

Regla:

- `google` => Google provider virkur.
- unset/annað => provider `null`, route weather skilar `provider_not_configured`.

Á mannamáli:

- Þetta er ekki feature access flag; þetta velur tæknilega gagnaveitu fyrir leiðarköll.
- Með `google` verða Google köll möguleg þegar notandi/gestur reiknar leið.

### `METNO_USER_AGENT=...`

Ekki feature flag heldur kurteisis-/policy stilling fyrir MET.no.

Staðfest í:

- `lib/weather/metno.server.ts`

Á mannamáli:

- Á að vera sett í production.
- Ekki secret.

### `CRON_SECRET=...`

Bearer secret fyrir cron endpoints.

Staðfest í:

- `app/api/cron/warm-vedurstofan/route.ts:10-15`
- `app/api/cron/cleanup-chats/route.ts:11-15`
- `middleware.ts:35-39` leyfir exact cron path framhjá browser session; route handler sér um `CRON_SECRET`.

Á mannamáli:

- Þetta opnar ekki UI.
- Þetta leyfir cron-köll ef rétt `Authorization: Bearer ...`.
- Ef þetta lekur getur einhver triggerað warm/cleanup endpoints.

---

## Hvaða rofar opna hvað núna?

Með núverandi gildum:

### Auth-only app

- `/auth-mvp/*` er virkt.
- `Lánað og skilað` er virkt fyrir authenticated users.
- `Umönnun` er virkt fyrir authenticated users, ekki per-user takmarkað.
- `Tengsl` er virkt, en per-user takmarkað.

### Veðrið fyrir innskráða

- `/auth-mvp/vedrid` er virkt en per-user takmarkað með `vedrid`.
- `ferdalagid`/ferðaflæði er per-user takmarkað með `ferdalagid`.
- Veðurstofu-provider er per-user takmarkaður með `weather-provider-vedurstofan`.
- Elta veðrið er per-user takmarkað með `elta-vedrid`.

### Veðrið fyrir gesti/public

- `/vedrid` er virkt fyrir gesti/public vegna `WEATHER_PUBLIC_ENABLED=true`.
- Gestir fá ekki saved places.
- Gestir fá ekki Veðurstofu-provider layer, því travel route sækir Veðurstofu layer bara þegar `user?.id && user?.email` og `weather-provider-vedurstofan` access stenst.

### Kostnaður

Möguleg kostnaðar- eða álagsgildi:

- `WEATHER_PUBLIC_ENABLED=true`: opnar gestanotkun, þar með möguleg Google/MET.no köll.
- `WEATHER_MAP_PROVIDER=google`: route/weather flæði getur notað Google.
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`: browser map/places/static key.
- `GOOGLE_MAPS_SERVER_KEY`: server-side Google calls.
- `WEATHER_AI_ENABLED=false`: AI kostnaður slökktur.
- `CRON_SECRET`: ef rétt notað, leyfir scheduled Veðurstofu warm; kostnaður er aðallega compute/Veðurstofu köll, ekki Google/met.no.

---

## Tillaga að hreinni mental model / naming

Halda núverandi virkni, en hugsa svona:

```txt
WEATHER_ENABLED
  = master kill switch fyrir allt veður

WEATHER_PUBLIC_ENABLED
  = public/guest veður opið

WEATHER_FLAG
  = auth-user /auth-mvp/vedrid er per-user flagged

WEATHER_TRIP_FLAG
  = ferðalag/trip affordance er per-user flagged

WEATHER_ELTA_VEDRID_FLAG
  = Elta veðrið validation/explorer er per-user flagged

WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
  = Veðurstofan provider er globally allowed, en samt per-user gated

WEATHER_PROVIDER_VEGAGERDIN_ENABLED
  = framtíðarrofi fyrir Vegagerðina, ekki til enn
```

Bestu næstu hreinsunarskref:

1. Fjarlægja eða staðfesta dauða stöðu `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`.
2. Skjalfesta að `WEATHER_PUBLIC_ENABLED` er opnunarrofi út á við og þarf kostnaðar-/rate-limit vörn.
3. Halda provider-specific flöggum:
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
   - síðar `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`
4. Ekki nota generic `EXTRA_PROVIDER` flag núna; það verður of óskýrt þegar provider-ar fá mismunandi áhættu, gæði og rollout stöðu.

---

## Recommended `.env.local` útgáfa, redacted

Þetta er ekki beiðni um að breyta skrám, bara mannamálsútgáfa af núverandi intent:

```txt
# Supabase / auth
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AUTH_MVP_ENABLED=true

# Email / auth secrets
RESEND_API_KEY=...
AUTH_CODE_SECRET=...
UNSUBSCRIBE_SECRET=...
EMAIL_FROM=...
REPLY_TO=...
ADMIN_EMAILS=...
NEXT_PUBLIC_SITE_URL=http://localhost:3005

# Existing product areas
LOANS_ENABLED=true
UMONNUN_ENABLED=true
UMONNUN_FLAG=false
TENGSL_ENABLED=true
TENGSL_FLAG=true

# Weather master + public/auth access
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_TRIP_FLAG=true

# Weather providers/tools
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
WEATHER_ELTA_VEDRID_FLAG=true
# VEDURSTOFAN_TRAVEL_LAYER_ENABLED should likely be removed after code confirmation

# Weather cost/provider config
WEATHER_AI_ENABLED=false
WEATHER_MAP_PROVIDER=google
METNO_USER_AGENT=...
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...

# Cron
CRON_SECRET=...
```

---

## Skýr beiðni til Claude Code

Claude Code, vinsamlegast rýndu og staðfestu flag contractið áður en þú framkvæmir næstu veðurbreytingu:

1. Staðfestu að `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` sé ekki lengur lesið af runtime kóða.
   - Ef það er dautt: leggðu til að fjarlægja það úr docs/env/handoffum framvegis.
   - Ekki fjarlægja úr raun/Vercel án Stebba-leyfis.

2. Staðfestu að Veðurstofan travel provider noti eingöngu:
   - `WEATHER_ENABLED=true`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`
   - per-user `feature_access.feature_key='weather-provider-vedurstofan'`

3. Staðfestu að `WEATHER_ELTA_VEDRID_FLAG` sé bara fyrir Elta veðrið station validation/explorer.

4. Staðfestu public weather áhættu:
   - `WEATHER_PUBLIC_ENABLED=true` opnar gestaaðgang.
   - Guest endpoints þurfa rate limiting á öllum Google/MET.no kostnaðarköllum, ekki bara route-options ef final forecast kallar líka Google/MET.no.

5. Bættu við eða uppfærðu developer-facing env docs ef Stebbi biður um framkvæmd:
   - Mælt: `.env.example` comments eða `docs/weather-flags.md` ef docs-mappa er til/búin til með samþykki.
   - Ekki setja secret values í docs.

---

## Localhost checks for Stebbi

Þetta handoff er útskýringarskjal, en ef Claude gerir breytingar út frá því þarf Stebbi að prófa:

### 1. Auth weather vs public weather

- Með `WEATHER_PUBLIC_ENABLED=true`:
  - Opna `/vedrid` logged out.
  - Vænt: public weather flow opnast.
- Með `WEATHER_PUBLIC_ENABLED=false`:
  - Opna `/vedrid` logged out.
  - Vænt: redirect eða lokun.
- Með `WEATHER_FLAG=true`:
  - Opna `/auth-mvp/vedrid` sem notandi án `vedrid`.
  - Vænt: lokað/redirect.
  - Sem notandi með `vedrid`: opnast.

### 2. Veðurstofan provider

- Notandi með `vedrid` en án `weather-provider-vedurstofan`:
  - Vænt: enginn Veðurstofu provider í ferðaveðri.
- Notandi með `weather-provider-vedurstofan` og `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true`:
  - Vænt: Veðurstofu provider birtist.
- Setja `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=false`/unset og endurræsa dev server:
  - Vænt: Veðurstofu provider hverfur jafnvel hjá notanda með feature row.

### 3. Elta veðrið

- Notandi með `vedrid` en án `elta-vedrid`:
  - `/auth-mvp/vedrid/elta-vedrid` lokast.
- Notandi með bæði:
  - Síðan opnast.

### 4. Cost/rate-limit sanity

- Prófa public `/vedrid` sem gestur.
- Staðfesta að repeated route/forecast köll séu rate-limited eða að minnsta kosti monitoruð.
- Ekki prófa með miklu magni kalla á production án skýrs leyfis, því þetta getur snert Google/met.no kostnað.

### 5. Secret hygiene

- Staðfesta að engin secret-gildi birtast í:
  - browser console
  - network responses
  - handoff/docs
  - client bundle

---

## Skrár sem Codex skoðaði

- `ai-handoff/README.md`
- `lib/loans/guard.ts`
- `middleware.ts`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/cron/cleanup-chats/route.ts`
- `app/(admin)/admin/page.tsx`
- `lib/weather/provider.server.ts`
- `lib/weather/ai.server.ts`
- `.env.example`
- eldri handoff references fyrir `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

---

## Skrár sem Codex breytti

- Bætti við þessari handoff skrá:
  - `ai-handoff/2026-07-14-2253-todo-086-v186-codex-env-flag-contract-handoff.md`

Engar app-skrár breyttar.
Engin env-skrá breytt.
Engin SQL breytt.
Engin migration keyrð.

---

## Óvissa / þarf að staðfesta

- Codex fann ekki runtime reference í `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`, en þar sem worktree er mjög lifandi og mörg handoff eru til, þarf Claude að staðfesta áður en það er formlega fjarlægt úr env/docs.
- Codex staðfesti ekki Vercel env stillingar.
- Codex staðfesti ekki Google/Supabase/Resend dashboard restrictions.
- Codex endurbirti ekki secret-gildi og skoðaði ekki `.env.local` sjálft; skjalið byggir á redacted lista Stebba og kóðaleit.
