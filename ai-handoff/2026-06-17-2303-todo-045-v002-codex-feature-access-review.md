# TODO #45: Per-user feature access fyrir Umönnun

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-17  
**Staða:** Rýni á Claude Code plan. Ekki samþykkt óbreytt.  
**Tengt handoff:** `ai-handoff/2026-06-17-2244-todo-045-v001-claude-feature-access-plan.md`  
**Tengd TODO:** #45 er nefnt í handoffi Claude Code, en Codex fann ekki #45 í `TODO.md`. Þetta tengist líka #41 og #13.

## Findings

### High: Admin server actions mega ekki treysta á layout-guard

Plan Claude Code leggur til nýjar server actions í
`app/(admin)/admin/feature-access-actions.ts` og segir að þær séu varðar af
`/admin` route-group layouti.

Það er of veikt fyrir aðgerð sem notar service-role til að breyta
aðgangsheimildum.

Núverandi admin-mynstur í verkefninu notar `/api/admin/*` routes og kallar
`requireAdmin()` inni í hverju endpointi. `app/(admin)/admin/layout.tsx`
verndar render á admin-síðunni, en það á ekki að vera eina varnarlagið fyrir
mutating actions.

**Krafa fyrir Claude Code:**

- Nota helst nýtt `/api/admin/feature-access` endpoint, ekki server actions.
- Endpointið skal kalla `createClient()` og `requireAdmin()` í hverju methodi.
- Nota `getAdmin()` aðeins eftir að admin-auth hefur tekist.
- Prófa sérstaklega:
  - óinnskráður notandi fær `401`
  - innskráður non-admin fær `403`
  - admin getur listað, bætt við og fjarlægt aðgang

Ef Claude Code vill samt nota server actions þarf hver action eigin
`requireAdminAction()` sem gerir sömu athugun og `requireAdmin()`. Layout-guard
einn og sér er ekki samþykktur.

### High/Medium: Raw email endurtekur Gmail-punkta áhættuna úr #43

Plan Claude Code geymir `email` sem lower-case texta og ber saman með
`email.toLowerCase()`.

Þetta er sama flokks vandamál og #43: Gmail getur afhent póst þótt punktar í
local-part séu mismunandi, en login-netfang og geymt permission-netfang passa
þá ekki endilega saman.

**Krafa fyrir Claude Code:**

- Ekki byggja nýtt permission-kerfi á raw lower-case email eingöngu.
- Nota sameiginlega email-normaliseringu fyrir feature access.
- Fyrir `gmail.com` og `googlemail.com` skal canonical gildi fjarlægja punkta úr
  local-part og sameina lén í eitt canonical form.
- Fyrir önnur lén skal ekki fjarlægja punkta.
- Ekki logga full netföng í villum eða test output.

Codex mælir með að Claude Code búi til lítinn shared helper, til dæmis:

- `lib/auth/email-normalization.ts`
- export: `normalizeEmailForAccess(email: string): string | null`

Helperinn má síðar nýtast #43. Ef Claude Code telur að #43 eigi að koma fyrst
skal stoppa og segja Stebba það áður en #45 er útfært.

### Medium: `featureKey` á ekki að vera opinn client-param í Phase A

Plan Claude Code tekur `featureKey: string` inn í list/grant/revoke actions.
SQL taflan leyfir líka hvaða `feature_key` sem er.

Það er óþarflega breitt fyrir fyrstu útgáfu. Núverandi verkefni þarf bara
per-user aðgang fyrir Umönnun.

**Krafa fyrir Claude Code:**

- Phase A skal vera hardcoded við `umonnun`.
- Client á ekki að geta sent hvaða feature key sem er.
- SQL skal hafa þrönga skorðu, til dæmis `CHECK (feature_key IN ('umonnun'))`,
  eða API skal alfarið skrifa fast `feature_key = 'umonnun'`.
- Ef taflan á síðar að styðja fleiri Teskeiðar þarf það sér TODO og rýni.

### Medium: Supabase-villur eru ekki allar `catch`

Plan Claude Code sýnir `try/catch`, en Supabase query skilar oft `{ data,
error }` án þess að kasta exception.

**Krafa fyrir Claude Code:**

- Athuga bæði `error` og exceptions.
- Ef DB-call mistekst þegar `UMONNUN_FLAG=true`, skal `checkFeatureAccess`
  skila `false`.
- Logga bara generic villu, til dæmis
  `[loans/guard] feature_access lookup failed`.
- Ekki logga email, user id eða Supabase response með mögulegum persónugögnum.

### Medium/process: #45 vantar í TODO.md

Handoff Claude Code vísar í #45, en Codex fann ekki #45 í `TODO.md`.

**Krafa fyrir Claude Code eða Stebba áður en framkvæmd hefst:**

- Bæta #45 við `TODO.md`, eða
- endurnefna handoffið þannig að það tengist skýrt #41/#13.

Codex mælir með að skrá #45 sem sér atriði, því þetta er nýtt
aðgangskerfi með SQL, admin UI og auth-áhrifum.

### Low: Planið er ónákvæmt um `getAdmin()`

Plan Claude Code segir að `getAdmin()` sé þegar í `lib/loans/guard.ts`.
Núverandi `lib/loans/guard.ts` importar hann ekki og notar hann ekki.

Þetta er ekki blocker, en Claude Code á að laga importið og prófin skýrt.

## Samþykkt umfang fyrir Phase A

Claude Code á aðeins að útfæra þetta:

1. `umonnun` per-user access.
2. Global kill-switch helst `UMONNUN_ENABLED`.
3. `UMONNUN_FLAG=true` kveikir á per-user checki.
4. Ef `UMONNUN_FLAG` er ósett eða ekki `true`, helst núverandi hegðun:
   allir innskráðir notendur sjá Umönnun þegar `UMONNUN_ENABLED=true`.
5. Admin getur séð lista, bætt við og fjarlægt canonical email fyrir Umönnun.
6. Engin breyting á `lanad-og-skilad`.
7. Engin breyting á login-flæði.
8. Engin breyting á `auth_mvp_allowlist`.
9. Engin production migration, deploy eða commit nema Stebbi biðji sérstaklega.

## Mælt tæknilegt plan fyrir Claude Code

### 1. Skrá TODO #45

Setja nýtt atriði í `TODO.md` áður en framkvæmd hefst, eða láta Stebba
staðfesta að #45 eigi að vera undir #41/#13.

Tillaga að heiti:

`#45 Per-user aðgangur að feature-flagged Teskeiðum`

### 2. SQL migration: `sql/52_feature_access.sql`

Migration skal vera skrifuð en ekki keyrð nema Stebbi biðji sérstaklega.

Mælt form:

- `BEGIN; ... COMMIT;`
- `CREATE TABLE IF NOT EXISTS public.feature_access`
- dálkar:
  - `feature_key text NOT NULL`
  - `email text NOT NULL`
  - `granted_at timestamptz NOT NULL DEFAULT now()`
  - `granted_by uuid NULL`, ef einfalt er að setja admin user id
- `PRIMARY KEY (feature_key, email)`
- `CHECK (feature_key IN ('umonnun'))`
- `CHECK (email = lower(trim(email)) AND email <> '')`
- `ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY`
- engar policies
- `REVOKE ALL ON public.feature_access FROM PUBLIC, anon, authenticated`
- `GRANT SELECT, INSERT, DELETE ON public.feature_access TO service_role`

Ekki veita `anon` eða venjulegum `authenticated` notendum beinan aðgang.

### 3. Email-normalisering

Búa til shared helper, ekki inline-a mismunandi reglur á mörgum stöðum.

Reglur:

- trim
- lowercase
- basic email format check
- fyrir `gmail.com` og `googlemail.com`:
  - fjarlægja punkta úr local-part
  - canonical domain má vera `gmail.com`
- fyrir önnur lén:
  - ekki fjarlægja punkta

Próf þurfa að sýna:

- `ariel.petursson@gmail.com` og `arielpetursson@gmail.com` verða sama canonical gildi
- `a.b@example.com` og `ab@example.com` verða ekki sama canonical gildi
- whitespace og hástafir eru normaliseruð
- ógilt email skilar `null` eða skýrri validation villu

### 4. `checkFeatureAccess`

Í `lib/loans/guard.ts`:

- `lanad-og-skilad` helst óbreytt.
- `umonnun`:
  - ef `UMONNUN_ENABLED !== 'true'`, return `false`
  - ef `UMONNUN_FLAG !== 'true'`, return `true`
  - normalisera email
  - ef email er ógilt eða vantar, return `false`
  - sækja `feature_access` með service-role
  - ef query skilar error, return `false` og logga generic villu án email
  - ef row finnst, return `true`, annars `false`

Ekki breyta redirect-hegðun `guardFeatureAccess` nema próf sýni nauðsyn.

### 5. Admin API í stað server actions

Mælt endpoint:

`app/api/admin/feature-access/route.ts`

Methods:

- `GET`: listar canonical email fyrir `umonnun`
- `POST`: bætir canonical email við `umonnun`
- `DELETE`: fjarlægir canonical email úr `umonnun`

Öll methods:

- kalla `createClient()`
- kalla `requireAdmin()`
- hætta strax ef auth bregst
- nota `getAdmin()` aðeins eftir admin-auth
- taka aðeins email frá client, ekki feature key
- normalisera email á server
- skila stöðluðum villum:
  - `400` fyrir ógilt email
  - `401` óinnskráður
  - `403` non-admin
  - `409` má vera duplicate, eða idempotent `ok`
  - `500` generic query/write failure

Ekki skila Supabase error detail til client.

### 6. Admin UI

Í `app/(admin)/admin/page.tsx`:

- Bæta við `FeatureAccessSection` fyrir Umönnun-aðgang.
- Halda þessu neðarlega á síðunni eða undir skýrri fyrirsögn.
- Sækja `/api/admin/feature-access`.
- Bæta við og fjarlægja með API.
- Sýna stutt, róleg status/villuskilaboð.
- Input skal validate-a basic email áður en kallað er á API, en server validation
  ræður endanlega.
- Sýna canonical email í lista, svo Stebbi sjái hvað verður geymt.

Ekki bæta við pagination í Phase A. Ef listinn verður langur síðar má taka það
sem sér atriði.

## Próf sem Claude Code á að bæta við eða uppfæra

### Guard tests

Í `lib/__tests__/guard.test.ts`:

- `UMONNUN_ENABLED` ósett eða false -> false
- `UMONNUN_ENABLED=true`, `UMONNUN_FLAG` ósett -> true án DB-kalls
- `UMONNUN_ENABLED=true`, `UMONNUN_FLAG=false` -> true án DB-kalls
- `UMONNUN_ENABLED=true`, `UMONNUN_FLAG=true`, row til -> true
- `UMONNUN_ENABLED=true`, `UMONNUN_FLAG=true`, engin row -> false
- DB error -> false og engin email í loggi
- Gmail-punkta canonicalization virkar

### Admin API tests

Ný eða uppfærð admin API test:

- óinnskráður fær `401`
- non-admin fær `403`
- admin getur listað
- admin getur bætt við email
- admin getur fjarlægt email
- ógilt email fær `400`
- duplicate grant er idempotent eða skilar skýrri villu án þess að brjóta UI
- request getur ekki sent arbitrary `feature_key`

### SQL migration tests

Í `lib/__tests__/sql-migration.test.ts`:

- `sql/52_feature_access.sql` er til
- taflan er `public.feature_access`
- RLS er enabled
- engar policies fyrir `anon` eða `authenticated`
- `REVOKE ALL` frá `PUBLIC, anon, authenticated`
- `GRANT SELECT, INSERT, DELETE` aðeins til `service_role`
- `feature_key` er skorðað við `umonnun` í Phase A
- primary key er `(feature_key, email)` eða sambærilega þröngt unique constraint

### Admin page tests

Ef til eru `admin-page` test eða ef UI-breytingin verður stærri:

- Umönnun-aðgangur birtist á admin-síðu
- listi hleðst
- “Gefa aðgang” kallar API
- “Fjarlægja” kallar API
- villur birtast án þess að leka technical detail

## Skipanir sem Claude Code á að keyra

Claude Code á að keyra:

```bash
npm run test:run -- lib/__tests__/guard.test.ts lib/__tests__/sql-migration.test.ts
npm run test:run -- lib/__tests__/admin-page.test.tsx
npm run type-check
```

Ef ný API test-skrá verður til skal keyra hana sérstaklega líka, til dæmis:

```bash
npm run test:run -- lib/__tests__/feature-access-api.test.ts
```

Ef `admin-page.test.tsx` er ekki til eða heitir öðru nafni skal Claude Code
keyra rétta admin UI test-skrá og skrá það í handoffi.

## Rollout og öryggi

Rétt röð fyrir rollout:

1. Skrifa migration og kóða.
2. Keyra unit/static tests.
3. Stebbi keyrir migration á local Supabase, ef Stebbi samþykkir það.
4. Stebbi prófar localhost.
5. Eftir staðfestingu: production migration með sérstakri leyfisbeiðni.
6. Setja `UMONNUN_FLAG=true` fyrst þegar migration og kóði eru komin í sama
   umhverfi.

Mikilvægt:

- Ekki setja `UMONNUN_FLAG=true` í production áður en `feature_access` taflan er til.
- Ekki keyra migration á production án skýrs samþykkis Stebba.
- Ekki birta eða logga netföng óþarfa.
- Ekki veikja RLS eða grants.
- Ekki veita `authenticated` beinan aðgang að `feature_access`.
- Ekki blanda þessu saman við `auth_mvp_allowlist` fyrr en #13 hefur verið
  ákveðið.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Codex og Claude Code eiga ekki að ræsa eða
endurræsa hann nema Stebbi biðji sérstaklega um það.

### Setup

1. Staðfesta að Claude Code hafi aðeins skrifað `sql/52_feature_access.sql`,
   ekki keyrt hana sjálfur.
2. Keyra migration á local Supabase aðeins ef Stebbi vill prófa þetta strax.
3. Nota local env:
   - `UMONNUN_ENABLED=true`
   - prófa bæði með `UMONNUN_FLAG` ósett/false og með `UMONNUN_FLAG=true`

Ekki keyra þessa migration á production í þessum localhost-prófum.

### Test 1: Núverandi hegðun helst þegar `UMONNUN_FLAG` er ekki true

Skref:

1. Hafa `UMONNUN_ENABLED=true`.
2. Hafa `UMONNUN_FLAG` ósett eða `false`.
3. Skrá inn sem venjulegur notandi.
4. Fara á `/heim`.

Vænt:

- Umönnun birtist eins og áður.
- Engin þörf er á row í `feature_access`.

### Test 2: Per-user læsing þegar `UMONNUN_FLAG=true`

Skref:

1. Setja `UMONNUN_FLAG=true`.
2. Hafa `feature_access` tóma fyrir `umonnun`.
3. Skrá inn sem venjulegur notandi.
4. Fara á `/heim`.

Vænt:

- Umönnun birtist ekki.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.

### Test 3: Admin gefur aðgang

Skref:

1. Skrá inn sem admin.
2. Fara á `/admin`.
3. Finna Umönnun-aðgangshlutann.
4. Slá inn netfang og smella á `Gefa aðgang`.
5. Staðfesta að canonical netfang birtist í lista.
6. Skrá inn sem sá notandi og fara á `/heim`.

Vænt:

- Umönnun birtist aðeins fyrir þann notanda.
- Engin Supabase error detail birtist í UI.

### Test 4: Gmail-punktar

Skref:

1. Admin bætir við dotted Gmail netfangi, til dæmis
   `nafn.punktur@gmail.com`.
2. Notandi skráir sig inn með canonical útgáfu án punkts, til dæmis
   `nafnpunktur@gmail.com`.

Vænt:

- Notandi fær sama Umönnun-aðgang.
- Fyrir non-Gmail lén á punktur ekki að hverfa úr local-part.

Ekki nota raunveruleg persónuleg netföng í test output eða handoff.

### Test 5: Admin fjarlægir aðgang

Skref:

1. Admin smellir á `Fjarlægja`.
2. Notandi refreshar `/heim`.

Vænt:

- Umönnun hverfur.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.

### Test 6: Non-admin má ekki breyta

Skref:

1. Skrá inn sem venjulegur notandi.
2. Prófa að opna `/admin`.
3. Ef hægt er að prófa API beint á localhost, kalla feature-access endpoint án
   admin session.

Vænt:

- `/admin` er ekki aðgengilegt.
- API skilar `401` eða `403`.
- Engar breytingar verða í `feature_access`.

### Hvað má ekki prófa kæruleysislega

- Ekki keyra `sql/52_feature_access.sql` á production án sérstakrar
  leyfisbeiðni.
- Ekki setja `UMONNUN_FLAG=true` í production áður en migration er komin inn og
  Stebbi hefur samþykkt rollout.
- Ekki setja raunveruleg viðkvæm netföng í handoff, logs eða test output.
- Ekki breyta `ADMIN_EMAILS`, secrets, billing, deployment eða Supabase
  production-stillingum í þessum pakka.

## Copy/paste til Claude Code

```text
Claude Code: Codex samþykkir ekki v001 planið óbreytt.

Vinsamlegast uppfærðu TODO #45 plan eða útfærslu áður en Stebbi gefur grænt ljós:

1. Ekki treysta á /admin layout-guard fyrir feature-access breytingar. Notaðu helst app/api/admin/feature-access/route.ts með createClient() + requireAdmin() í hverju methodi. getAdmin() má aðeins nota eftir admin-auth.
2. Ekki nota raw lower-case email sem permission lykil. Bættu við shared email-normaliseringu sem leysir Gmail-punkta fyrir gmail.com/googlemail.com en breytir ekki punktum á öðrum lénum.
3. Phase A er aðeins fyrir feature_key = umonnun. Client má ekki senda arbitrary featureKey.
4. checkFeatureAccess þarf að fail-closed þegar UMONNUN_FLAG=true og DB-query mistekst. Athugaðu bæði Supabase error og exceptions. Ekki logga email.
5. Skráðu #45 í TODO.md eða fáðu Stebba til að staðfesta að þetta tengist #41/#13 áður en framkvæmd hefst.
6. Bættu við prófum fyrir guard, SQL migration, admin API auth og Gmail-punkta normaliseringu.
7. Ekki keyra sql/52 á local eða production nema Stebbi biðji sérstaklega um það.
8. Skilaðu nýju post-implementation handoff með breyttum skrám, skipunum, exit codes, áhættu, Supabase áhrifum og Localhost checks for Stebbi.
```
