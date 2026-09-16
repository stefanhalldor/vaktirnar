# SQL179 reviewed manual apply gate

Created: 2026-09-14 16:24
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og findings

**JÁ — ÞÚ ERT AÐ FARA AÐ KEYRA SQL NÚNA.**

SQL179 read-only Production preflight skilaði nákvæmlega GREEN
`PREDECESSOR_READY`. Target er alveg fjarverandi, current predecessor lineage er
nákvæmt og operator identity er rétt. Eina aðgerð Stebba núna er því að keyra
yfirförnu SQL179 apply migration skrána einu sinni í sama staðfesta Production
projecti.

Frozen apply bytes voru endurstaðfest eftir preflight og eru nákvæmlega þau
sömu og fengu GREEN loka-endurrýni. Engin executable, SQL, test eða product
bytes breyttust við þessa afhendingu.

## Staðfest preflight evidence

Stebbi skilaði einni nákvæmri röð:

| field | value |
| --- | --- |
| `executor_ok` | `true` |
| `prerequisites_exact` | `true` |
| `actor_input_required` | `false` |
| `targets_absent` | `true` |
| `target_functions_exact` | `false` |
| `target_relations_exact` | `false` |
| `target_triggers_exact` | `true` |
| `target_bucket_exact` | `false` |
| `target_catalog_exact` | `false` |
| `targets_exact` | `false` |
| `installation_state` | `PREDECESSOR_READY` |
| `operator_state_ok` | `true` |

Þetta er nákvæmlega approved apply-precondition úr v005.

## Eina skráin sem má keyra núna

- Skrá: [SQL179 apply migration](../../../../sql/179_expense_receipt_item_claims.sql)
- Absolute path: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2\sql\179_expense_receipt_item_claims.sql`
- SHA-256: `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`
- Bytes: `92,929`
- Lines: `2,249`
- Final newline: `true`
- Fyrsta lína: `-- SQL179 MIGRATION:`
- Síðasta statement: `COMMIT;`
- Operator input: ekkert; engin UUID eða önnur placeholders eru í skránni.
- Production SQL Editor: [Supabase SQL Editor](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new)

Production project ref `bpjwgutpzsifjaucvkbk` er staðfest í canonical
repository deployment evidence
`ai-handoff/2026-07-15-1720-todo-086-v235-deploy-vercel-config.md`.

## Framkvæmd Stebba

1. Opnaðu Production SQL Editor hlekkinn og staðfestu að project ref í
   address bar sé nákvæmlega `bpjwgutpzsifjaucvkbk`.
2. Opnaðu fullu SQL179 apply skrána með hlekknum hér að ofan.
3. Afritaðu alla skrána í nýjan, tóman SQL Editor. Ekki nota texta úr
   preflight tabinu og ekki bæta neinu við.
4. Staðfestu að fyrsta línan byrji á `-- SQL179 MIGRATION:` og að síðasta
   statement sé `COMMIT;`.
5. Veldu allan textann eða hafðu ekkert textaval. Keyrðu alla skrána einu
   sinni.
6. Sendu Codex aðeins bounded niðurstöðuna: nákvæman success-texta eða, ef
   villa kemur, SQLSTATE/editor-villu og hvaða statement/lína editor bendir á.
   Ekki senda project credentials, env eða önnur óviðkomandi logg.

## Expected success og STOP-reglur

Vænt SQL Editor niðurstaða er success án result rows, venjulega
`Success. No rows returned`. Apply er transaction og lýkur aðeins við lokastaka
`COMMIT;`.

Ef editor sýnir error, timeout, aborted transaction, vantaðan hala eða gefur
til kynna að aðeins valinn hluti hafi verið keyrður:

- STOP;
- ekki endurkeyra apply;
- ekki keyra postflight;
- sendu bounded exact villuna til Codex til greiningar.

**Ekki keyra postflight enn, jafnvel þótt apply sýni success.** Fyrst skal
Stebbi senda success niðurstöðuna til Codex. Þá sannreynir Codex gateið og
afhendir nákvæma read-only postflight skrá sérstaklega.

## Hvað migration gerir

SQL179 stofnar eina private receipt Storage bucket configuration, fimm
receipt-domain töflur, afmarkaðar constraints/indexes, forced RLS án client
table grants, og actor-scoped service-role RPC functions. Það tengir atomic
receipt confirmation við núverandi canonical expense ledger og setur sealed
catalog fingerprint fyrir exact postflight classification.

Migrationin hleður ekki upp kvittun, kallar ekki Anthropic, stofnar ekki
kostnað og breytir ekki fyrirliggjandi greiðslu-, skiptingar- eða fjárhagssögu.
Preflight staðfesti að target objects væru öll fjarverandi. Versta raunhæfa
afleiðing við óvænta SQL-villu er að transaction rollbacki og postflight sé
bannað þar til villan hefur verið greind.

## Frozen artifact evidence

| artifact | SHA-256 | bytes | lines | final newline | staða núna |
| --- | --- | ---: | ---: | --- | --- |
| `sql/179_expense_receipt_item_claims.sql` | `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c` | 92,929 | 2,249 | true | keyra núna |
| `sql/validation/179-expense-receipt-item-claims/preflight.sql` | `c614b37504d56e16b2c0c4f28f572dbdbf6cbe6c841b78bf080bddf2d6bc2d2c` | 19,413 | 391 | true | þegar GREEN; ekki endurkeyra |
| `sql/validation/179-expense-receipt-item-claims/postflight.sql` | `e0911f4142c45d4ffabb6ac8c98944fbfe31ea84f386a37812eb6f78aa1f2af5` | 19,374 | 390 | true | ekki keyra enn |

Reviewed candidate manifest er áfram 36 paths: 31 óbreytt
product/operator/test paths og 5 pre-review docs. v005, þetta v006 handoff og
canonical status-link updates eru post-review documentation evidence utan
executable manifestins.

## Localhost checks for Stebbi

Ekki keyra localhost núna. Apply þarf fyrst að skila success og síðan þarf
nákvæmt read-only postflight að staðfesta `EXACT_INSTALLED`. Samhæfur app
candidate hefur heldur ekki verið commit-aður eða gefinn út. Localhost
checklist kemur aðeins eftir að schema og app-code eru til staðar í sama
prófunarumhverfi.

## Óvissa / þarf að staðfesta

Eina óstaðfesta atriðið er hvort reviewed apply transaction ljúki í raun í
Production. Static/operator tests og review koma ekki í stað handvirkrar runtime
niðurstöðu. Codex keyrði ekkert SQL.
