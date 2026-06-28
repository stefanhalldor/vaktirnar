# Handoff fyrir Claude Code: Gmail canonical identity í lánaboðum og Tengslum

**TODO:** #43 Gmail-punktar og útrunnin soft-ack lánaboð, #49 Tengsl þvert á Teskeiðar  
**Dagsetning:** 2026-06-22 22:42  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Stebbi vill að Claude Code rýni og lagfæri. Þetta er privacy- og Supabase-viðkvæmt.

## Samhengi frá Stebba

Stebbi sér tvær færslur í `/stillingar/tengsl` sem eiga að flokkast sem sami aðili: sama Gmail-netfang annars vegar með punkti í local-part og hins vegar án punkts. Í þessu handoffi eru notuð synthetic dæmi:

- `fyrri.seinni@gmail.com`
- `fyrriseinni@gmail.com`

Þessi tvö eiga að canonicalize-ast í sama aðila fyrir Gmail/Googlemail, því Gmail afhendir venjulega punktaðar og punktalausar útgáfur í sama pósthólf. Þetta tengist beint #43: notandi getur fengið tölvupóst á punktuðu Gmail-netfangi en skráð sig inn með punktalausu netfangi.

## Persónugagnavarúð

Ekki setja raunnetföng úr skjámyndum eða samtali Stebba í:

- migration
- test fixture
- logs
- handoff
- client payload
- commit message

Nota alltaf synthetic dæmi eins og `fyrri.seinni@gmail.com` og `fyrriseinni@gmail.com`.

## Núverandi staða sem Codex sá

Skoðað:

- `lib/auth/email-normalization.ts`
- `lib/relationships/actions.ts`
- `sql/50_loan_soft_acknowledgement.sql`
- `sql/55_get_my_loans_add_recipient_email.sql`
- `sql/54_relationships.sql`
- `TODO.md`

Mikilvægt:

- TypeScript helperinn `normalizeEmailForAccess()` virðist þegar gera Gmail-aware canonicalization:
  - trim + lowercase
  - fjarlægir punkta í local-part fyrir `gmail.com` og `googlemail.com`
  - breytir `googlemail.com` í `gmail.com`
  - fjarlægir ekki punkta fyrir önnur domain
- SQL-föllin sem stýra lánaboðum nota víða enn `lower(trim(...))`, t.d. fyrir `recipient_email_normalized` og actor-email matching.
- `relationships.email_canonical` getur því orðið Gmail-aware í nýjum TypeScript upsertum, en `loan_invitations.recipient_email_normalized` getur áfram verið punktuð útgáfa úr SQL.
- Núverandi duplicate í Tengslum getur líka verið eldri gögn sem voru vistuð áður en TS-helperinn var kominn eða áður en merged/inferred listinn var samræmdur.

Niðurstaða Codex: þetta má ekki leysa eingöngu með UI-dedupe. Það þarf eina canonical identity reglu sem gildir fyrir:

- ný relationship rows
- inferred tengslalista
- lánsform/tengiliðaval
- pending invitation visibility
- `Þekki málið` / claim
- detail activity lookup
- mögulega eldri gögn

## Product-regla

V1 regla:

- Fyrir `gmail.com` og `googlemail.com`: canonical identity fjarlægir punkta úr local-part og normaliserar domain í `gmail.com`.
- Fyrir önnur domain: aðeins trim + lowercase. Punktar eru merkingarbærir og má ekki fjarlægja þá.
- Ekki fjarlægja `+alias` í v1 án sérstakrar ákvörðunar frá Stebba. Gmail styður plus aliases, en notendur geta notað þau viljandi sem aðskilin contact/notification netföng.

## Rýni og framkvæmd sem Claude Code á að gera

### 1. Kortleggja alla normalization staði

Claude Code þarf fyrst að kortleggja hvar email identity er normaliseruð:

- TypeScript schemas fyrir create/add invitation
- `normalizeEmailForAccess()`
- `upsertLoanRelationship()`
- `getRelationships()` / merged Tengsl view
- `getRelationshipLoanActivity()` ef komin
- `getRelationshipRecipientOptions()` ef komin
- SQL functions sem skrifa eða bera saman `recipient_email_normalized`
- `get_my_loans`
- `claim_loan_invitation`
- `get_invitation_for_claim` ef það er enn notað
- email send/retry helpers sem fletta invitation recipient

Ekki halda áfram fyrr en Claude Code veit hvort canonical-reglan er tvöföld eða ósamstæð milli TS og SQL.

### 2. Sameina canonical reglu

Besti kosturinn er að hafa:

- TypeScript helper fyrir client/server TypeScript paths
- SQL helper fyrir database function paths

Mögulegt SQL API:

```sql
public.normalize_email_canonical(p_email text) returns text
```

Kröfur:

- `NULL` eða ógilt input skili `NULL` eða sé meðhöndlað skýrt af caller.
- Gmail/Googlemail punktafjarlæging sé aðeins fyrir þessi domain.
- Ekki fjarlægja punkta fyrir önnur domain.
- Ekki fjarlægja plus aliases í v1.
- Function þarf að vera örugg með `SET search_path = ''` ef hún er PL/pgSQL, eða einföld SQL immutable function ef það passar betur.

Ef Claude Code bætir við SQL helper:

- setja í nýja migration í `sql/` með næsta númeri
- keyra ekki migration sjálfkrafa
- bæta static tests í `lib/__tests__/sql-migration.test.ts`
- skýra rollback

### 3. Laga lánaboð og soft-ack matching

SQL þarf að nota canonical helperinn á öllum nýjum og viðeigandi lestrarleiðum:

- þegar `recipient_email_normalized` er skrifað
- þegar actor email er borið saman við `recipient_email_normalized`
- þegar duplicate/pending active invitations eru skoðuð
- þegar `get_my_loans` bætir pending soft-ack rows við lista
- þegar `claim_loan_invitation` ákveður hvort innskráður notandi megi velja `Þekki málið`

Acceptance:

- Boð sent á `fyrri.seinni@gmail.com` birtist hjá notanda sem skráir sig inn sem `fyrriseinni@gmail.com`.
- `Þekki málið` virkar í sama dæmi ef boðið er enn `pending` samkvæmt soft-ack reglum.
- Dæmið má líka virka öfugt: boð sent á punktalausa útgáfu, login með punktuðu.

### 4. Laga Tengsl duplicate og activity lookup

Tengsl þarf að flokka dotted/punktalaust Gmail sem sama aðila.

Mikilvæg krafa:

- `/stillingar/tengsl` á að sýna einn tengilið fyrir canonical Gmail identity, ekki tvær færslur.
- Detail-síðan á að sýna öll lán sem tengjast báðum vistuðum útgáfum, ef eldri gögn innihalda bæði dotted og punktalausa útgáfu.
- Lánsform/tengiliðaval á að sýna einn valmöguleika.

Ef til eru tvær persisted `relationships` rows hjá sama owner:

- Ekki eyða gögnum í fyrsta áfanga nema Stebbi samþykki.
- Byrja með merged view eða lazy cleanup.
- Ef UI þarf að velja eina primary row, velja fyrirsjáanlega:
  - row með `private_display_name` eða `note` fyrst
  - annars nýjustu uppfærðu eða elstu stofnuðu, en skrá ákvörðunina
- Tags/private note mega ekki týnast.
- Ef bæði rows hafa mismunandi private notes/tags, ekki skrifa sjálfvirkt yfir nema með skýrri merge-reglu og prófi.

Codex mælir með öruggri v1:

- sýna merged entry í UI
- nota canonical email til activity lookup
- skilja physical duplicate rows eftir þar til sérstök cleanup migration/preflight er samþykkt
- þegar notandi vistar breytingu á merged entry, skrá í primary relationship row og ekki tvöfalda

### 5. Gagna- og migration-varúð

Ef Claude Code vill canonicalize-a eldri gögn í DB þarf sérstakt preflight áður en nokkuð er uppfært:

Read-only preflight ætti að finna:

- `loan_invitations` þar sem `recipient_email_normalized` breytist við Gmail canonicalization
- duplicate active invitations sem myndu rekast saman eftir canonicalization
- `relationships` duplicates per `owner_id` eftir canonicalization
- rows þar sem bæði dotted og punktalaus útgáfa hafa mismunandi notes/tags

Ekki keyra data update eða cleanup án skýrs samþykkis Stebba.

Versta mögulega afleiðing rangrar migration:

- boð tengjast röngum notanda
- tveir aðskildir einstaklingar á non-Gmail domain eru sameinaðir ranglega
- private note/tag týnist
- `Þekki málið` opnar boð fyrir rangan actor

Líkindi eru lág ef Gmail-reglan er stranglega bundin við `gmail.com`/`googlemail.com`, en afleiðingin er nógu alvarleg til að krefjast prófa og preflight.

## Ekki gera

- Ekki fjarlægja punkta á öllum domainum.
- Ekki merge-a `a.b@example.com` og `ab@example.com`.
- Ekki fjarlægja plus aliases í v1.
- Ekki logga netföng eða private notes.
- Ekki keyra production SQL eða data cleanup án samþykkis Stebba.
- Ekki leysa þetta bara í `/stillingar/tengsl` UI ef `get_my_loans` og claim-path eru enn ósamstæð.

## Prófanir sem þarf

TypeScript tests:

- `normalizeEmailForAccess('fyrri.seinni@gmail.com') === 'fyrriseinni@gmail.com'`
- `normalizeEmailForAccess('fyrri.seinni@googlemail.com') === 'fyrriseinni@gmail.com'`
- `normalizeEmailForAccess('fyrri.seinni@example.com') === 'fyrri.seinni@example.com'`
- `normalizeEmailForAccess('fyrriseinni@example.com') !== normalizeEmailForAccess('fyrri.seinni@example.com')`
- plus alias hegðun er föst: ekki fjarlægja `+alias` í v1.

SQL/static tests:

- ný SQL canonical helper inniheldur Gmail/Googlemail sérreglu
- SQL notar helperinn í `get_my_loans`, `claim_loan_invitation` og nýjustu create/add invitation function bodies
- non-Gmail punktar eru ekki fjarlægðir

Tengsl tests:

- `/stillingar/tengsl` dedupe-ar synthetic dotted/punktalaust Gmail í eina færslu.
- Detail activity fyrir merged tengilið sýnir lán sem voru skráð á báðar útgáfur.
- Lánsform/tengiliðaval sýnir einn valmöguleika.
- Ef tvær persisted rows hafa notes/tags týnast þær ekki við birtingu.

Loan/soft-ack tests:

- Pending boð sent á dotted Gmail birtist hjá punktalausu login.
- Pending boð sent á punktalaust Gmail birtist hjá dotted login.
- `Þekki málið` virkar í báðum tilfellum.
- Ótengdur Gmail notandi getur ekki claim-að boð sem canonical identity hans á ekki.

## Localhost checks for Stebbi

Nota aðeins testnetföng, ekki raunnetföng úr skjámyndum.

### Tengsl duplicate

1. Gera eða finna tvö lán/tengsl þar sem sami Gmail-aðili kemur fyrir sem `fyrri.seinni@gmail.com` og `fyrriseinni@gmail.com`.
2. Opna `/stillingar/tengsl`.
3. Vænt niðurstaða: aðeins ein færsla birtist fyrir þann aðila.
4. Opna færsluna.
5. Vænt niðurstaða: detail-síðan sýnir activity úr báðum útgáfum netfangsins.
6. Staðfesta að non-Gmail dæmi, t.d. `fyrri.seinni@example.com` og `fyrriseinni@example.com`, sameinast ekki.

### Lánaboð og soft-ack

1. Sem notandi A, stofna lánaboð á `fyrri.seinni@gmail.com`.
2. Skrá inn sem sama Gmail-aðili með punktalausu útgáfunni `fyrriseinni@gmail.com`.
3. Opna `Lánað og skilað`.
4. Vænt niðurstaða: pending boðið sést.
5. Velja `Þekki málið`.
6. Vænt niðurstaða: boðið claimast, ekki `expired`, `not_found` eða `not_claimable`.
7. Endurtaka öfugt: senda á punktalaust, login með punktuðu.

### Tengiliðaval í lánsformi

1. Opna `/auth-mvp/lanad-og-skilad/ny`.
2. Vænt niðurstaða: tengiliðaval sýnir einn valmöguleika fyrir canonical Gmail-aðilann.
3. Velja hann.
4. Vænt niðurstaða: email input fyllist með canonical eða skýrt valinni útgáfu, og nýtt lán stofnast án duplicate tengsla.

### Varúð

- Ekki nota raunveruleg netföng í testum sem verða commit-uð.
- Ekki keyra production migration/backfill nema Claude Code hafi skilað preflight og Stebbi hafi samþykkt.
- Ef test krefst Supabase data update á localhost, skrá nákvæmlega hvaða SQL var keyrt og hvort það snerti schema eða gögn.

## Spurningar sem Claude Code á að svara í handoff til baka

1. Er til ein sameiginleg canonical-regla í TS og SQL eftir breytinguna?
2. Hvaða SQL functions voru uppfærð?
3. Þarf data migration/backfill fyrir eldri rows, eða er merged view nóg í v1?
4. Hvernig eru duplicate `relationships` rows með notes/tags meðhöndlaðar?
5. Hvernig var tryggt að non-Gmail punktanetföng sameinist ekki?
6. Hvernig var claim/soft-ack prófað fyrir dotted vs punktalaust Gmail?
7. Hvaða próf voru keyrð og hver voru exit codes?
