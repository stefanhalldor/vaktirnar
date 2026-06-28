# Codex-rýni á Claude Code v003: Tengsl og stillingar

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2122-todo-049-050-v003-claude-tengsl-review.md`

**Staða:** Codex samþykkir að skilja `Minn prófíll` frá stóra Tengsl-diffinu,
en schema- og feature-flag hlutinn þarf að herða áður en Claude Code skrifar SQL.

## Findings

1. **Hátt: Ekki nota `contacts` sem nýtt töfluheiti.**

   Claude Code leggur til `contacts` í schema-planinu, en það heiti er þegar
   notað í legacy Krakkavaktin grunni. `sql/01_schema.sql` býr til `contacts`
   töflu með `child_a_id`, `child_b_id` og `status`, og legacy kóði les og skrifar
   beint í hana í `app/(app)/contacts/page.tsx` og `app/api/contacts/route.ts`.

   Þetta er ekki bara nafnaóþægindi. Ef production gagnagrunnur er með gamla
   `contacts` töflu myndi `CREATE TABLE public.contacts` annaðhvort falla eða,
   ef notað væri `IF NOT EXISTS`, skilja appið eftir að tala við ranga töflu.

   **Codex mælir með:** nota `relationships`, `relationship_tags` og
   `relationship_sources`, eða `user_relationships` ef Claude Code vill gera
   eiganda-eðlið enn skýrara. Ekki nota `contacts` fyrir nýju Teskeið-tengslin.

2. **Hátt: Feature-flag niðurstaðan á að fylgja Umönnun-mynstrinu, ekki bara nýju env-flaggi.**

   Claude Code segir `Feature flag: ENV var, ekki DB`, en núverandi Umönnun-mynstur
   er tvílaga:

   - `UMONNUN_ENABLED=true` er global kill-switch.
   - `UMONNUN_FLAG=true` kveikir á per-user aðgangi í `feature_access`.
   - Ef `UMONNUN_FLAG` er ekki `true`, fá allir innskráðir aðgang þegar
     `UMONNUN_ENABLED=true`.

   Þetta sést í `lib/loans/guard.ts`. `feature_access` er þó núna með SQL
   constraint sem leyfir bara `feature_key IN ('umonnun')` í
   `sql/52_feature_access.sql`.

   **Codex mælir með:** endurnýta sama mynstur:

   - `TENGSL_ENABLED=true` sem global kill-switch.
   - `TENGSL_FLAG=true` sem valkvætt per-user prófunarflag.
   - `checkFeatureAccess(..., 'tengsl')` styðji sama hegðun og `umonnun`.
   - Ný SQL migration víkki `feature_access` constraint þannig að `'tengsl'` sé
     leyfilegt feature key.

   Middleware á aðeins að geta stoppað global-off hratt. Per-user `feature_access`
   check á að vera í server-side guard/page/action, ekki service-role lookup í
   middleware.

3. **Hátt: Núverandi schema-plan lokar á fjölskyldumeðlimi án netfangs.**

   Claude Code leggur til constraint:
   `counterpart_user_id is not null or email is not null`. Það virkar fyrir
   lánaviðtakanda með email, en passar ekki við #50 þar sem fjölskyldumeðlimur
   getur verið barn eða óinnskráður aðili án email og án `auth.users` færslu.

   **Codex mælir með:** schema þarf að leyfa local/private manneskju. Til dæmis:

   - `counterpart_user_id uuid null`
   - `email_canonical text null`
   - `private_display_name text null`
   - `note text null`
   - check sem leyfir línu ef a.m.k. eitt af `counterpart_user_id`,
     `email_canonical` eða `private_display_name` er til staðar.

   Ekki yfirhlaða `display_name` þannig að stundum sé það nickname fyrir skráðan
   notanda og stundum eini auðkennir barns. Heitið má vera private, t.d.
   `private_display_name`, svo lekiáhættan sé augljós í schema.

4. **Miðlungs: Auto-vistun má ekki bara tengjast `addLoanInvitation`.**

   Claude Code nefnir `addLoanInvitation`, en `createLoan` býr líka til invitation
   þegar lán er stofnað með `recipient_email`. Í `lib/loans/actions.ts` sést að
   `createLoan` fær `invitation_id` úr `create_loan` RPC og sendir boð strax á
   eftir, á meðan `addLoanInvitation` gerir sama fyrir lán sem var stofnað án
   viðtakanda.

   **Codex mælir með:** auto-vistun tengsla þarf að keyra í báðum flæðum:

   - `createLoan` þegar `recipient_email` og `invitation_id` eru til.
   - `addLoanInvitation` þegar `invitation_id` er til.

   Tengslavistun á að gerast eftir að invitation/loan samhengi er til. Ef
   tengslavistun mistekst má hún ekki fella lánastofnun eða boðssendingu; hún á
   að logga almennt, án netfangs eða einkagagna, og skila aðalflæðinu áfram.

5. **Miðlungs: `contact_sources` / `relationship_sources` vantar idempotency.**

   Claude Code nefnir að nota `ON CONFLICT DO NOTHING`, en schema-plan sýnir
   ekki unique constraint sem gerir það öruggt. Það þarf að vera skýrt hvað
   `source_id` er.

   **Codex mælir með:** í v1 sé source tengt við lánið sjálft, ekki bara
   invitation:

   - `source_type = 'loans'`
   - `source_id = loan_items.id`
   - valkvætt `source_detail_id = loan_invitations.id` ef þarf síðar
   - unique constraint á `(relationship_id, source_type, source_id)`

   Þannig verður sama lán ekki skráð mörgum sinnum á sama tengsl, þótt boð sé
   endursent eða action keyri aftur.

6. **Miðlungs: Zod-validation kemur ekki í veg fyrir raunveruleg email-mistök.**

   Claude Code segir að ógilt netfang komist ekki í gegn og því verði tengsl ekki
   til vegna typo. Það er aðeins rétt fyrir syntactically ógilt email. Mistök eins
   og `ariel.petursson@gmail.com` í stað `arielpetursson@gmail.com` eru samt
   löglegt netfang og geta búið til tengsl.

   **Codex mælir með:** nota `normalizeEmailForAccess` sem canonical grunn fyrir
   `email_canonical`, ekki bara `trim().toLowerCase()`. UI þarf líka að leyfa
   notanda að fela, breyta eða eyða auto-vistuðu tengsli sem var búið til út frá
   röngu netfangi.

7. **Miðlungs: Server-actions-only er rétt v1, en þá þarf grant/RLS orðalagið að vera nákvæmt.**

   Codex er sammála Claude Code að v1 eigi að vera server-actions/server-components
   only, líkt og `loan_items` og `loan_invitations`: engin bein client-read
   heimild á nýju töflurnar.

   Þá þarf migration að vera skýr:

   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role`
   - engin broad authenticated policy

   Ef Claude Code bætir við owner-RLS policies án authenticated grants er það
   varnarundirbúningur, ekki raunveruleg aðgangsleið í v1. Það má vera, en þarf
   að vera útskýrt svo rýni ruglist ekki á því hvort client megi lesa beint.

8. **Lágt: `Minn prófíll` á að vera sérstakur framkvæmdaráfangi, en product-ákvörðunin stendur.**

   Codex samþykkir að flutningur frá `/auth-mvp/minn-profill` yfir á
   `/stillingar/minn-profill` sé ekki hluti af sama SQL/schema/Tengsl-diffi.
   Stebbi hefur samt tekið product-ákvörðun: canonical framtíðarleiðin er
   `/stillingar/minn-profill`, ekki standalone `/minn-profill`.

   **Codex mælir með:** ekki framkvæma prófílflutning í #49/#50 diffinu, nema
   aðeins sé bætt við almennum `/stillingar/*` auth guard sem þarf fyrir
   `/stillingar/tengsl`.

## Leiðrétt framkvæmdarröð sem Codex mælir með

1. Claude Code uppfærir schema-plan áður en SQL er skrifað:
   - nota `relationships`, ekki `contacts`
   - styðja local/private tengsl án email
   - skilgreina `email_canonical`
   - skilgreina idempotent `relationship_sources`
   - víkka `feature_access` fyrir `'tengsl'` ef `TENGSL_FLAG` verður stutt
2. Claude Code skrifar `sql/53_*.sql`, en keyrir það ekki.
3. Claude Code bætir `tengsl` við `checkFeatureAccess` með sama mynstri og
   Umönnun.
4. Claude Code bætir global middleware guard fyrir `/stillingar/tengsl`:
   `TENGSL_ENABLED !== 'true'` fer á `/`.
5. Claude Code bætir auth guard fyrir `/stillingar/*` þannig að óinnskráðir fari
   á `/innskraning`, ekki legacy `/login`.
6. Claude Code býr til server-only helpers/actions fyrir tengsl.
7. Claude Code tengir auto-vistun bæði við `createLoan` og `addLoanInvitation`.
8. Claude Code útfærir `/stillingar/tengsl` og `/stillingar/tengsl/[id]` í
   lágmarksútgáfu með lánatengdum sources.
9. Claude Code geymir `/stillingar/minn-profill` sem sér áfanga.

## Skýr ákvörðun sem Codex leggur til

Codex myndi svara opnu spurningu Claude Code svona:

> Nota server-actions/server-components only fyrir v1. Ekki gefa
> `authenticated` eða `anon` beinan aðgang að relationship-töflum. Endurnýta
> Umönnun feature-flag mynstrið: `TENGSL_ENABLED` global og valkvætt
> `TENGSL_FLAG` með `feature_access`.

## SQL-varúð

SQL má ekki keyra fyrr en Stebbi samþykkir það sérstaklega. Ný migration mun
líklega snerta:

- nýjar relationship-töflur
- `feature_access` constraint ef `'tengsl'` verður leyft
- grants og RLS
- mögulega helper functions ef Claude Code velur RPC frekar en beinar
  service-role server actions

Rollback þarf að nefna rétta röð:

1. slökkva `TENGSL_ENABLED`
2. redeploya app án Tengsl-aðgerða ef þær eru komnar út
3. drop-a nýjar relationship-töflur/functions
4. þrengja `feature_access` constraint aftur ef það var víkkað

## Localhost checks for Stebbi

Þegar Claude Code hefur útfært v1 ætti Stebbi að prófa:

1. **Feature flag slökkt**
   - Setja `TENGSL_ENABLED=false`.
   - Opna `/stillingar/tengsl`.
   - Vænt niðurstaða: notandi fer á `/` eða skýrt óvirkt state, og engin
     tengslagögn eru lesin.

2. **Feature flag kveikt**
   - Setja `TENGSL_ENABLED=true`.
   - Opna `/stillingar/tengsl` sem innskráður notandi.
   - Vænt niðurstaða: síða opnast og sýnir aðeins eigin tengsl.

3. **Óinnskráður aðgangur**
   - Opna `/stillingar/tengsl` í logged-out browser/session.
   - Vænt niðurstaða: redirect á `/innskraning`, ekki `/login`.

4. **Auto-vistun við stofnun láns**
   - Stofna nýtt lán með viðtakandanetfangi strax í nýskráningarforminu.
   - Vænt niðurstaða: viðtakandi birtist í `/stillingar/tengsl` með uppruna
     `Lánað og skilað`.

5. **Auto-vistun þegar viðtakanda er bætt við síðar**
   - Stofna lán án viðtakanda.
   - Bæta við netfangi síðar.
   - Vænt niðurstaða: sama hegðun og í lið 4.

6. **Tvítekning**
   - Senda eða endursenda boð til sama viðtakanda fyrir sama lán.
   - Vænt niðurstaða: ekki myndast tvær eins relationship/source færslur.

7. **Rangt en syntactically gilt netfang**
   - Prófa netfang sem er gilt að formi en rangt að efni.
   - Vænt niðurstaða: notandi getur síðar falið, breytt eða eytt tengslinu.

8. **Gmail-punktar**
   - Prófa `ariel.petur@gmail.com` og `arielpetur@gmail.com`.
   - Vænt niðurstaða: canonical email hegðun er samræmd við
     `normalizeEmailForAccess`.

9. **Privacy milli notenda**
   - Skrá inn annan notanda.
   - Vænt niðurstaða: hann sér ekki tengsl, private display name, note eða
     sources fyrri notanda.

10. **Legacy contacts regression**
    - Með `LEGACY_ENABLED=false`, staðfesta að `/contacts` og `/api/contacts`
      séu áfram lokuð eins og áður.
    - Vænt niðurstaða: nýju Tengsl-töflurnar nota ekki legacy `contacts` og
      breyta ekki Krakkavaktin legacy hegðun.

Ekki prófa SQL-keyrslu, Supabase dashboard breytingar eða production gögn án
sérstaks samþykkis frá Stebba.
