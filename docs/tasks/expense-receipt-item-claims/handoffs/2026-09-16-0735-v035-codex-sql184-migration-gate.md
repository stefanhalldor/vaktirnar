# v035 — SQL184 READY og migration-gátt

Created: 2026-09-16 07:35 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Mannamál og næsta eigendagátt

SQL184 preflight er nákvæmlega grænt. Uppsetta SQL182/183 grunnlagið stemmir,
operator er réttur og öll SQL184 target eru enn ónotuð. Migration-bytes og báðar
validation-skrár eru óbreytt frá fullrýndum v034 candidate.

**JÁ — STEBBI Á AÐ KEYRA SQL184 MIGRATION NÚNA.**

Skrá: [sql/184_receipt_split_v2.sql](../../../sql/184_receipt_split_v2.sql)

SQL Editor: https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

Keyra nákvæmlega einu sinni. Vænt niðurstaða: `Success. No rows returned`.
Við villu, timeout eða aðra niðurstöðu: ekki endurkeyra blint; senda Codex nákvæm
skilaboð. Eftir Success skal bíða eftir því að Codex staðfesti niðurstöðuna og
afhendi postflight sem næstu sérstaka SQL-gátt.

Migration er ein transaction, `lock_timeout='5s'`, með innbyggðu exact
prerequisite guard. Hún bætir við dálkum og v2 RPC/private helpers en flytur
engar núverandi gagnaraðir. V1 splitt halda v1 þar til fyrsta v2 write kemur
síðar eftir application cutover. Þess vegna verða engar núverandi quantities,
claims eða receipt totals endurreiknaðar við þessa keyrslu.

Velja skal venjulegt `Run`/`Yes`, ekki varanlegt „don't ask again“ fyrir
Production SQL. Þetta er schema/function breyting í Supabase Production target;
versta raunhæfa bilun fyrir apply er prerequisite mismatch eða lock timeout,
sem rúllar transaction til baka. Ekki keyra recovery/down-conversion.

## Actual preflight frá Stebba

| gate | result |
| --- | --- |
| operator_state | READY |
| predecessor_state | EXACT_INSTALLED |
| operator_ok | true |
| targets_absent | true |

Þetta er actual output, ekki áætlað gildi. Það sannar prerequisite/catalog-gátt,
ekki migration uppsetningu eða runtime virkni.

## Exact artifacts

- Migration SHA-256:
  `86cfc392db870d8c18ce4584e6e1bd5f3158b65bf52411f62fef72202b2af330`
- Preflight SHA-256:
  `4873fb9a275b672f1872369622a52c9c9e3327987c02d21231b90d1d1f489a4c`
- Postflight SHA-256:
  `57fdbbf750243aac1b4393bd4d1a7ebcd6809eb47e40cb66d947cf4dda3e04e2`

Hashes voru endurreiknaðir eftir niðurstöðu Stebba og stemma v034. `diff --check`
á SQL184 artifacts er PASS. SQL182/183 eru áfram óbreytt samkvæmt v034 static tests.

## Breytingar á verkefnalýsingu

- Current gate færð úr preflight í migration apply.
- Actual preflight-röð Stebba skráð með öllum fjórum exact gildum.
- Migration-áhrif, transaction/lock timeout og no-blind-retry leiðbeining gerð skýr.
- Tekið fram að engar núverandi split-raðir umbreytast við uppsetningu.
- Næsta skref eftir Success afmarkað við Codex-staðfestingu og postflight; live
  application cutover eða runtime-próf eru ekki opnuð af Success einu saman.

## Skrár skoðaðar og breyttar

Skoðað: lifandi GoLive task, SQL184 migration/preflight/postflight og v034
canonical/handoff. Breytt: canonical task document, SQL184 README og þetta
immutable handoff. SQL/code/test artifacts breyttust ekki.

## Skipanir og niðurstöður

- SHA-256 endurreikningur á migration/preflight/postflight → exact v034 hashes,
  exit 0.
- `git -c core.safecrlf=false diff --check` á SQL184 artifacts → PASS, exit 0.
- GoLive latest read → status `in_progress`, Codex writer, enginn relation blocker.
- Engin tests endurkeyrð því engin executable bytes breyttust frá 304-test v034.
- Ekkert SQL keyrt af Codex; engin app-/server-/Production mutation, commit,
  push, merge, deploy eða dev-server stjórn.

## Localhost checks for Stebbi

Migration-keyrslan breytir ekki live route og uppfærir engar split-raðir, svo
ekkert nýtt localhost-flæði á að birtast strax. SQL-fríi samþykkti skjárinn er
áfram http://localhost:3004/preview/splitt-v032. Ekki prófa raunverulega v2
vistun fyrr en postflight er exact og application cutover hefur verið afhent.
Engin ÚL/Expense, provider eða notendagögn eiga að snertast í þessu skrefi.
