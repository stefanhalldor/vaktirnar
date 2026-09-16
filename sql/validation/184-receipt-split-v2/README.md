# SQL184 — standalone scale=3000 og breytanlegir liðir

## Núverandi gátt

Preflight lokið 2026-09-16: Stebbi skilaði nákvæmlega `READY`,
`EXACT_INSTALLED`, `operator_ok=true`, `targets_absent=true`.

Migration lokið samkvæmt skjámynd Stebba 2026-09-16:
`Success. No rows returned`. Exact catalog/ACL uppsetning bíður postflight.

Postflight lokið 2026-09-16. Stebbi skilaði `EXACT_INSTALLED` og öllum sjö
boolean gates `true`. SQL184 SQL-gátt er lokuð; ekki endurkeyra preflight,
migration eða postflight. Application cutover er nú í localhost-prófun.

Fyrri postflight-gátt er varðveitt hér að neðan sem saga:

Opnaðu [postflight.sql](postflight.sql) í sama SQL Editor og keyrðu einu sinni.
Vænt er `operator_state=EXACT_INSTALLED` og öll sjö boolean gates `true`:
`seal_ok`, `functions_ok`, `tables_ok`, `no_client_policies`, `schema_private`,
`tables_private`, `bucket_ok`.

Ef annað kemur: stoppa og senda Codex alla röðina. Ekki endurkeyra migration.
Postflight er read-only catalog/ACL/RLS/bucket sannprófun og les engin business gögn.

Fyrri migration-gátt er varðveitt hér að neðan sem saga:

Opnaðu [migration](../../184_receipt_split_v2.sql) í sama SQL Editor. Keyrðu
skrána nákvæmlega einu sinni. Vænt er `Success. No rows returned`.

Ef villa eða önnur niðurstaða kemur: ekki endurkeyra blint; senda Codex nákvæm
skilaboð. Eftir Success skal ekki keyra postflight fyrr en Codex hefur staðfest
migration-hash/niðurstöðu og afhent postflight sem næstu gátt.

Migration er ein transaction með 5 sekúndna lock timeout. Hún bætir schema/RPC
við en umbreytir engum núverandi split-röðum. Versta líklega frávik er lock timeout
eða prerequisite mismatch; transaction rúllar þá til baka. Ekki velja varanlegt
„don't ask again“ leyfi fyrir Production SQL.

## Staðfest preflight niðurstaða

Nákvæm röð frá Stebba:

- `operator_state = READY`
- `predecessor_state = EXACT_INSTALLED`
- `operator_ok = true`
- `targets_absent = true`

Fyrri preflight-leiðbeiningar eru varðveittar hér að neðan sem saga:

Opnaðu [preflight.sql](preflight.sql) í SQL Editor fyrir project
`bpjwgutpzsifjaucvkbk`:
https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

Vænt ein röð:

- `operator_state = READY`
- `predecessor_state = EXACT_INSTALLED`
- `operator_ok = true`
- `targets_absent = true`

Ef annað birtist: stoppa og senda Codex nákvæma niðurstöðu. Ekki keyra migration.
Preflight les aðeins PostgreSQL catalog, function bodies/ACL, RLS metadata og
stillingu private storage-buckets. Það les ekki kvittanir, claims, notendanöfn,
netföng, myndir eða deilihlekki. `SET search_path` gildir aðeins SQL Editor session.

## Artifact hashes

- `sql/184_receipt_split_v2.sql`:
  `86cfc392db870d8c18ce4584e6e1bd5f3158b65bf52411f62fef72202b2af330`
- `preflight.sql`:
  `4873fb9a275b672f1872369622a52c9c9e3327987c02d21231b90d1d1f489a4c`
- `postflight.sql`:
  `57fdbbf750243aac1b4393bd4d1a7ebcd6809eb47e40cb66d947cf4dda3e04e2`

Generatorinn var keyrður tvisvar með sömu hashes. SQL/PLpgSQL parser samþykkti
50 migration statements og 14 bodies, auk beggja validation-skráa. Ekkert SQL
var keyrt af Codex.

## Hvað migration gerir ef hún verður síðar afhent til keyrslu

- Bætir við contract-version, scale=3000 quantity, item revision, original name,
  optional explanation og review flag. Engin gömul röð umbreytist við uppsetningu.
- Bætir service-role-only v2 read/command RPC við; private schema/tables halda
  engum client grants eða policies.
- V2 read sýnir gömul milli-gildi nákvæmlega sem ×3. Fyrsta v2 write umbreytir
  sama split undir parent lock og varðveitir item/member/claim IDs.
- Gamla v1 flæðið heldur áfram á v1 splittum. Þegar einstakt split hefur verið
  uppfært í v2 hafna v1 writers því með `split_upgrade_required`.
- Kvittunarviðmið er óháð línusummu; mismunur hindrar ekki confirm.
- Eigandi má bæta/breyta liðum og viðmiði. Magn má ekki fara undir claims og
  verð má ekki verða núll meðan claims eru til. Þátttakendur breyta aðeins sínu magni.
- Claim notar request lock, parent lock, item revision, fyrra eigið magn og
  capacity. Óskyldir þátttakendur geta unnið samtímis án whole-split conflict.
- SQL182/183 artifact bytes eru óbreytt. Expense/ÚL, auth, storage policy,
  bucket og shared Expense scale breytast ekki.

## Takmörk og recovery

Migration er í transaction og fail-closed preflight kemur fyrst. Hún er additive
og gerir enga bulk data migration. Eftir fyrstu v2 vistun getur nákvæmur þriðjungur
ekki farið aftur í scale 1000 án gagnataps. Því er ekkert sjálfvirkt recovery SQL
afhent. Rollback eftir notkun verður forward-compatible og þarf sér rýni/ákvörðun.

## Eftir READY

Codex staðfestir exact niðurstöðu og óbreytt hashes, og afhendir þá migration sem
næstu sérstaka SQL-gátt. READY eitt og sér heimilar ekki migration-keyrslu.
Eftir migration Success kemur postflight; aðeins `EXACT_INSTALLED` með öllum
boolean gates true opnar application cutover.

## Localhost checks for Stebbi

Preflight breytir engu í localhost og krefst engrar localhost-prófunar. Halda má
áfram að prófa SQL-fría skjáinn á http://localhost:3004/preview/splitt-v032.
Raunveruleg v2 vistun er ekki tengd live route fyrr en migration og postflight
hafa staðist og application cutover hefur verið yfirfarinn. Ekki prófa Production
gögn, raunverulega kvittun eða óviðkomandi notanda í þessum preflight-áfanga.
