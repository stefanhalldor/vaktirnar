# TODO #45: Rýni á per-user feature access fyrir Umönnun

**Agent:** Codex  
**Fyrir:** Stebbi og Claude Code  
**Dagsetning:** 2026-06-17  
**Staða:** Rýni lokið. Localhost-prófanir fyrir Stebba fylgja.  
**Tengt handoff:** `ai-handoff/2026-06-17-2330-todo-045-v003-claude-feature-access-done.md`  
**Tengd TODO:** #45 Per-user aðgangur að feature-flagged Teskeiðum

## Findings

### Engir High-blockers fundust

Codex fann ekki augljósa RLS-veikingu, auth-bypass eða feature-key injection í
útfærslu Claude Code.

Góð atriði:

- `app/api/admin/feature-access/route.ts` notar `createClient()` og
  `requireAdmin()` í hverju methodi áður en `getAdmin()` er kallað.
- `feature_key` er hardcoded sem `umonnun`; client getur ekki sent eigin
  feature key.
- `sql/52_feature_access.sql` veitir aðeins `service_role` aðgang og setur RLS
  á töfluna.
- Gmail-punktar eru normaliseraðir í sameiginlegum helper.
- `lanad-og-skilad` virðist óbreytt.

### Medium: `checkFeatureAccess` getur enn kastað exception

`lib/loans/guard.ts` segir að `checkFeatureAccess` kasti aldrei exception, en
núverandi kóði er ekki með `try/catch` utan um Supabase query eða `getAdmin()`.

Við venjulegt Supabase `{ data, error }` svar er þetta í lagi, en ef client
creation eða query kastar exception þegar `UMONNUN_FLAG=true`, getur `/heim` eða
`/auth-mvp/umonnun` endað í 500 í stað þess að fail-closeda í `false`.

**Skrá:** `lib/loans/guard.ts`  
**Viðmið:** línur 39-44 kalla `getAdmin().from(...).select(...).maybeSingle()` án
`try/catch`.

**Tillaga Codex:**

- Vefja DB-kallinu í `try/catch`.
- Ef exception verður, logga generic skilaboð án email/user id.
- Skila `false`.
- Bæta prófi þar sem `mockFeatureAccessQuery` rejectar eða `getAdmin` kastar.

Þetta er ekki blocker fyrir localhost-prófun, en Codex myndi laga þetta áður en
`UMONNUN_FLAG=true` er sett í production.

### Medium: Admin UI felur load-villu sem tóman lista

`FeatureAccessSection` byrjar með `entries = []`. Ef
`/api/admin/feature-access` skilar 500, til dæmis vegna þess að
`feature_access` taflan er ekki komin inn, þá er villan gleypt og UI sýnir
áfram `Enginn í lista.`

Þetta getur gefið Stebba ranga tilfinningu um að taflan sé tóm þegar hún er í
raun ekki til eða API er bilað.

**Skrá:** `app/(admin)/admin/page.tsx`  
**Viðmið:** línur 126-130 gleypa fetch-villu, og línur 173-174 sýna empty state
út frá `entries.length === 0`.

**Tillaga Codex:**

- Bæta við `loadError` eða `loaded` state.
- Ef GET skilar ekki `ok` eða JSON er ekki array, sýna t.d.
  `Náði ekki að sækja Umönnun-aðgang. Staðfestu migration eða prófaðu aftur.`
- Prófa að API 500 sýni villu, ekki `Enginn í lista.`

Þetta er sérstaklega mikilvægt vegna þess að migration er ekki sjálfkrafa keyrð
í localhost-prófun.

### Low: Nokkur próf staðfesta hegðun en ekki nákvæm query gildi

Prófin eru góð sem regression-net, en þau mættu vera örlítið beittari:

- `feature-access-api.test.ts` staðfestir að arbitrary `feature_key` nái ekki í
  gegnum route, en assertar ekki beint að `insert` fái
  `{ feature_key: 'umonnun', email: canonical }`.
- `guard.test.ts` staðfestir að dotted Gmail fái aðgang, en assertar ekki að
  `.eq('email', 'arielpetur@gmail.com')` sé notað í query.

Þetta er ekki blocker. Kóðinn virðist gera rétta hluti, en prófin myndu grípa
meira ef þau assertuðu payload/query gildi.

### Low: Nýr admin-texti er hardcoded

Nýr texti í `FeatureAccessSection` er hardcoded í `app/(admin)/admin/page.tsx`.
Admin-síðan virðist þegar nota mikið af hardcoded íslenskum texta, svo þetta er
ekki nýtt mynsturbrot í þeirri skrá. Almennu verkefnisreglurnar segja samt að
notendatexti eigi helst heima í `messages/is.json` og `messages/en.json`.

Codex myndi ekki stöðva þessa breytingu út af þessu, en þetta má hreinsa þegar
admin UI verður formlegra.

## Sjálfvirk próf sem Codex keyrði

### Targeted tests

```bash
npm run test:run -- lib/__tests__/email-normalization.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/sql-migration.test.ts lib/__tests__/admin-page.test.tsx
```

Niðurstaða:

- Exit code 0
- 5 test files passed
- 116 tests passed

### Type-check

```bash
npm run type-check
```

Niðurstaða:

- Exit code 0

### Full test suite

```bash
npm run test:run
```

Niðurstaða:

- Exit code 0
- 40 test files passed
- 1134 passed
- 22 skipped
- 8 todo

Athugasemd: Vitest prentaði `Not implemented: navigation to another Document`,
en keyrslan var samt græn. Þetta virðist vera þekkt jsdom/navigation atriði úr
núverandi prófum, ekki ný failing villa í #45.

### Production build

```bash
npm run build
```

Niðurstaða:

- Exit code 0
- Next.js build compiled successfully.
- Ótengdar warnings komu í:
  - `app/s/[sessionId]/page.tsx`: vantar hook dependency í eldri `useEffect`
  - `components/landing/Avatar.tsx`: notar `<img>` í stað `next/image`

Codex telur þessar warnings ekki tengjast #45.

## Supabase og migration áhætta

`sql/52_feature_access.sql` var skrifuð en Codex keyrði hana ekki.

Migration breytir schema:

- býr til `public.feature_access`
- setur RLS á töfluna
- veitir `service_role` `SELECT, INSERT, DELETE`
- tekur allan aðgang frá `PUBLIC`, `anon` og `authenticated`

Migration breytir ekki:

- `auth.users`
- `auth_mvp_allowlist`
- `loan_items`
- `loan_invitations`
- RLS/policies annarra taflna
- production gögn, nema Stebbi keyri hana sérstaklega á production

**Mikilvægt rollout:**

1. Migration þarf að vera komin í sama umhverfi áður en `UMONNUN_FLAG=true` er
   notað.
2. Ef `UMONNUN_FLAG` er ósett eða `false`, þá er DB-lookup ekki notað og
   núverandi opna hegðun helst.
3. Ekki setja `UMONNUN_FLAG=true` í production áður en production migration er
   keyrð og staðfest.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Codex og Claude Code eiga ekki að ræsa eða
endurræsa dev server nema Stebbi biðji sérstaklega um það.

Þessi próf eru skipt í fjóra hluta:

1. Prófa án migration að núverandi hegðun sé óbreytt.
2. Keyra migration aðeins á local Supabase og staðfesta töfluna.
3. Prófa per-user aðgang og admin UI.
4. Prófa öryggi og regression.

### Áður en byrjað er

Staðfesta:

- Stebbi er á local umhverfi, ekki production Supabase.
- `.env.local` inniheldur ekki production service-role lykil.
- Dev server er keyrður af Stebba.
- Eftir env-breytingar gæti þurft að endurræsa dev server. Það gerir Stebbi
  sjálfur.

Ekki líma raunveruleg viðkvæm netföng í handoff eða opin logs. Nota má eigin
test-netföng ef þau eru örugg í local prófun.

### Test 1: Núverandi hegðun án per-user flaggs

Setup:

- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG` ósett eða `UMONNUN_FLAG=false`
- `sql/52_feature_access.sql` þarf ekki að vera keyrð fyrir þetta próf.

Skref:

1. Skrá inn sem venjulegur notandi.
2. Fara á `/heim`.
3. Smella á Umönnun ef hún birtist.
4. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Umönnun birtist á `/heim`.
- `/auth-mvp/umonnun` opnast.
- Engin krafa er um row í `feature_access`.
- `Lánað og skilað` hegðar sér eins og áður.

Regression sem þarf að passa:

- `/heim` má ekki brotna ef `sql/52` hefur ekki verið keyrð.
- Umönnun má ekki hverfa þegar `UMONNUN_FLAG` er ósett.

### Test 2: Global kill-switch

Setup:

- `UMONNUN_ENABLED=false` eða breytan ósett.
- `UMONNUN_FLAG` má vera hvað sem er.

Skref:

1. Skrá inn sem venjulegur notandi.
2. Fara á `/heim`.
3. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Umönnun birtist ekki á `/heim`.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.
- `Lánað og skilað` hefur óbreytta hegðun ef `LOANS_ENABLED=true`.

### Test 3: Admin UI fyrir migration

Setup:

- Ekki keyra `sql/52_feature_access.sql` enn.
- Skrá inn sem admin.

Skref:

1. Fara á `/admin`.
2. Skruna að `Umönnun-aðgangur`.
3. Opna DevTools Network tab.
4. Endurhlaða `/admin`.
5. Skoða kallið á `/api/admin/feature-access`.

Vænt niðurstaða:

- Ef `feature_access` taflan er ekki til, má API-kallið skila 500.
- UI gæti samt sýnt `Enginn í lista.` vegna finding hér að ofan.

Þetta er ekki endanleg virkni. Þetta próf er til að staðfesta að Stebbi sjái
hvort migration vanti. Ef UI sýnir tóman lista en Network sýnir 500, á Claude
Code að laga error state áður en production rollout er samþykkt.

### Test 4: Keyra migration á local Supabase

Þetta er schema-breyting og er ekki read-only. Hún á aðeins að keyrast á local
Supabase nema Stebbi gefi sérstaklega leyfi fyrir öðru.

Áhrif:

- Býr til local `public.feature_access`.
- Breytir local grants/RLS fyrir þá nýju töflu.
- Snertir ekki lánagögn eða auth notendur.

Versta mögulega local afleiðing:

- Taflan eða grants verða röng í local gagnagrunni og þarf að laga eða resetta
  local DB.

Líkur:

- Lágar, þar sem migration er lítil og afmörkuð.

Skref:

1. Opna local Supabase SQL editor.
2. Keyra `sql/52_feature_access.sql` á local gagnagrunn.
3. Keyra read-only staðfestingu:

```sql
select to_regclass('public.feature_access') as feature_access_table;

select relrowsecurity
from pg_class
where oid = 'public.feature_access'::regclass;

select *
from pg_policies
where schemaname = 'public'
  and tablename = 'feature_access';

select feature_key, email, granted_at
from public.feature_access
order by granted_at desc;
```

Vænt niðurstaða:

- `feature_access_table` er `feature_access`.
- `relrowsecurity` er `true`.
- `pg_policies` skilar engum rows.
- `feature_access` listinn er tómur fyrst.

### Test 5: `UMONNUN_FLAG=true` og tómur listi

Setup:

- `sql/52_feature_access.sql` hefur verið keyrð á local.
- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG=true`
- `feature_access` er tóm fyrir `umonnun`.

Skref:

1. Skrá inn sem venjulegur notandi.
2. Fara á `/heim`.
3. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Umönnun birtist ekki á `/heim`.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.
- `/heim` brotnar ekki.

### Test 6: Admin gefur aðgang

Setup:

- Vera skráður inn sem admin.
- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG=true`
- `sql/52` keyrð á local.

Skref:

1. Fara á `/admin`.
2. Finna `Umönnun-aðgangur`.
3. Slá inn test-netfang.
4. Smella á `Gefa aðgang`.
5. Staðfesta að netfang birtist í listanum.
6. Keyra read-only SQL staðfestingu:

```sql
select feature_key, email, granted_at
from public.feature_access
order by granted_at desc;
```

Vænt niðurstaða:

- Canonical email birtist í admin listanum.
- Sama canonical email birtist í SQL.
- Engin Supabase error detail birtist í UI.

### Test 7: Notandi með aðgang sér Umönnun

Setup:

- Netfang notandans er í `feature_access`.
- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG=true`

Skref:

1. Skrá inn sem notandinn sem fékk aðgang.
2. Fara á `/heim`.
3. Smella á Umönnun.
4. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Umönnun birtist á `/heim`.
- Umönnun upplýsingasíðan opnast.
- Hún birtir enga viðkvæma Umönnun-gögn, aðeins upplýsingatexta og hlekki.

### Test 8: Notandi án aðgangs sér ekki Umönnun

Setup:

- Annar venjulegur notandi er ekki í `feature_access`.
- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG=true`

Skref:

1. Skrá inn sem notandi án aðgangs.
2. Fara á `/heim`.
3. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Umönnun birtist ekki.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.
- Notandinn sér ekki lista yfir hverjir hafa aðgang.

### Test 9: Gmail-punktar

Setup:

- `UMONNUN_ENABLED=true`
- `UMONNUN_FLAG=true`
- `sql/52` keyrð á local.

Skref:

1. Sem admin, bæta við dotted Gmail test-netfangi, til dæmis
   `nafn.punktur@gmail.com`.
2. Skoða admin listann.
3. Skoða SQL:

```sql
select feature_key, email
from public.feature_access
where feature_key = 'umonnun'
order by email;
```

4. Ef til er local notandi með dot-free útgáfuna, skrá inn sem hann og fara á
   `/heim`.

Vænt niðurstaða:

- Listinn sýnir canonical form, til dæmis `nafnpunktur@gmail.com`.
- SQL geymir canonical formið.
- Dot-free Gmail notandinn fær aðgang.
- Það myndast ekki tvær rows fyrir dotted og dot-free útgáfu sama Gmail.

### Test 10: Non-Gmail punktar haldast aðskildir

Skref:

1. Sem admin, bæta við `a.b@example.com`.
2. Bæta við `ab@example.com`.
3. Skoða admin listann og SQL.

Vænt niðurstaða:

- Bæði netföng geta verið til sem aðskildar rows.
- Punktar eru ekki fjarlægðir fyrir non-Gmail lén.

### Test 11: Duplicate grant

Skref:

1. Sem admin, bæta við sama netfangi tvisvar.
2. Prófa líka dotted og dot-free Gmail útgáfur af sama test-netfangi.
3. Skoða listann og SQL.

Vænt niðurstaða:

- Engin villa sem brýtur UI.
- Aðeins ein row er til fyrir sama canonical email.
- Admin listinn sýnir ekki duplicate.

### Test 12: Fjarlægja aðgang

Skref:

1. Sem admin, smella á `Fjarlægja` við netfang.
2. Staðfesta að netfang hverfi úr listanum.
3. Keyra read-only SQL staðfestingu:

```sql
select feature_key, email
from public.feature_access
where feature_key = 'umonnun'
order by email;
```

4. Skrá inn sem sá notandi eða refresh-a `/heim` ef notandinn er þegar inni.
5. Prófa beint að opna `/auth-mvp/umonnun`.

Vænt niðurstaða:

- Row hverfur úr SQL.
- Umönnun hverfur af `/heim`.
- Beint að `/auth-mvp/umonnun` redirectar á `/`.

### Test 13: Ógilt email

Skref:

1. Sem admin, prófa að setja `bad`.
2. Prófa `bad@`.
3. Prófa `bad@example`.

Vænt niðurstaða:

- UI eða API hafnar gildinu.
- Engin row bætist við í SQL.
- Engin raw Supabase villa eða stack trace birtist í UI.

### Test 14: Non-admin API má ekki breyta

Setup:

- Skrá inn sem venjulegur non-admin notandi.
- Vera á hvaða local síðu sem er, til dæmis `/heim`.
- Opna DevTools Console.

Skref:

Keyra:

```js
await fetch('/api/admin/feature-access').then(async (r) => ({
  status: r.status,
  body: await r.text(),
}))
```

Vænt:

- `403` fyrir innskráðan non-admin.
- `401` ef engin session er til.

Prófa POST:

```js
await fetch('/api/admin/feature-access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'nonadmin-test@example.com' }),
}).then(async (r) => ({
  status: r.status,
  body: await r.text(),
}))
```

Vænt:

- `403` fyrir innskráðan non-admin.
- Engin row bætist við í `feature_access`.

Prófa DELETE:

```js
await fetch('/api/admin/feature-access', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'existing-test@example.com' }),
}).then(async (r) => ({
  status: r.status,
  body: await r.text(),
}))
```

Vænt:

- `403` fyrir innskráðan non-admin.
- Engin row hverfur úr `feature_access`.

### Test 15: Logged-out API má ekki lesa eða breyta

Setup:

- Skrá út.
- Opna DevTools Console á public síðu.

Skref:

1. Keyra GET fetch á `/api/admin/feature-access`.
2. Keyra POST fetch með test-netfangi.
3. Keyra DELETE fetch með test-netfangi.

Vænt niðurstaða:

- Öll köll skila `401`.
- Engin gögn leka í body.
- Engin row breytist í SQL.

### Test 16: Feature key injection virkar ekki

Setup:

- Skrá inn sem admin.

Skref:

Keyra í Console:

```js
await fetch('/api/admin/feature-access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'feature-injection-test@example.com',
    feature_key: 'lanad-og-skilad',
  }),
}).then(async (r) => ({
  status: r.status,
  body: await r.text(),
}))
```

Síðan staðfesta með SQL:

```sql
select feature_key, email
from public.feature_access
where email = 'feature-injection-test@example.com';
```

Vænt niðurstaða:

- Row er annaðhvort búin til með `feature_key = 'umonnun'` eða duplicate er
  idempotent.
- Engin row með `feature_key = 'lanad-og-skilad'` verður til.

### Test 17: Admin UI í mobile breidd

Setup:

- Skrá inn sem admin.
- Opna `/admin`.
- Setja viewport í 360-460 px.

Skref:

1. Skruna að `Umönnun-aðgangur`.
2. Skoða input og `Gefa aðgang`.
3. Bæta við langt test-netfang.
4. Skoða listann og `Fjarlægja` takkann.

Vænt niðurstaða:

- Enginn horizontal scroll.
- Langt email brotnar snyrtilega.
- `Fjarlægja` takkinn helst nothæfur.
- Texti og takkar skarast ekki.

### Test 18: Regression á Lánað og skilað

Setup:

- `LOANS_ENABLED=true`.
- `UMONNUN_ENABLED=true`.
- Prófa bæði með `UMONNUN_FLAG=false` og `UMONNUN_FLAG=true`.

Skref:

1. Fara á `/heim`.
2. Opna `Lánað og skilað`.
3. Staðfesta að lánalistinn hleðst.
4. Staðfesta að pending return breytingin úr #44 virkar enn ef hún er komin inn.
5. Staðfesta að textinn `Boð um sameiginlega sýn á lánið` birtist enn þar sem
   við á.

Vænt niðurstaða:

- `Lánað og skilað` er óbreytt af #45.
- Umönnun-aðgangur hefur ekki áhrif á lánagögn eða lánaboð.

### Hvað á ekki að prófa kæruleysislega

- Ekki keyra `sql/52_feature_access.sql` á production án sérstakrar
  leyfisbeiðni.
- Ekki breyta Vercel env í production án sérstakrar leyfisbeiðni.
- Ekki setja `UMONNUN_FLAG=true` í production fyrr en production migration er
  keyrð og staðfest.
- Ekki nota production service-role lykil í localhost.
- Ekki líma raunveruleg viðkvæm netföng, API lykla eða Supabase villusvör í
  handoff eða opið samtal.
- Ekki tengja þessa breytingu við `auth_mvp_allowlist` eða login-flæði í þessari
  lotu.

## Niðurstaða Codex

Codex telur útfærsluna almennt vel afmarkaða og mun betri en v001 planið.
Automated staðan er sterk: type-check, targeted tests, full test suite og build
eru öll græn.

Codex myndi samt biðja Claude Code að laga tvö medium atriði áður en þetta fer í
production með `UMONNUN_FLAG=true`:

1. `checkFeatureAccess` þarf `try/catch` svo það kasti aldrei.
2. Admin UI þarf að sýna load-villu í stað þess að fela hana sem tóman lista.

Eftir það eru localhost-prófin hér að ofan góð samþykktarprófun fyrir Stebba.

## Copy/paste til Claude Code

```text
Claude Code: Codex rýndi v003 feature-access útfærsluna. Engir High-blockers fundust og automated staðan er græn: type-check, targeted tests, full test suite og build passa.

Codex vill samt að þú lagir tvö medium atriði áður en UMONNUN_FLAG=true fer í production:

1. lib/loans/guard.ts: checkFeatureAccess lofar að kasta aldrei, en DB-kallið í umonnun FLAG=true grein er ekki í try/catch. Vefðu getAdmin/query í try/catch, loggaðu generic villu án email/user id og skilaðu false. Bættu prófi þar sem query rejectar eða getAdmin kastar.
2. app/(admin)/admin/page.tsx: FeatureAccessSection gleypir GET-villu og sýnir þá “Enginn í lista.” Þetta felur migration/API vandamál. Bættu við loadError/loaded state og sýndu skýra villu ef /api/admin/feature-access skilar ekki ok eða JSON er ekki array. Bættu prófi fyrir API 500 -> villuskilaboð, ekki empty state.

Ekki keyra SQL eða breyta production/Vercel. Skilaðu stuttu handoffi með skrám, prófum, exit codes og uppfærðum localhost checks ef þú lagar þetta.
```
