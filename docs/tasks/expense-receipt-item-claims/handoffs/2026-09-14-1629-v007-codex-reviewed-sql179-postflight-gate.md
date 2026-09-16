# SQL179 reviewed manual postflight gate

Created: 2026-09-14 16:29
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og findings

**JÁ — ÞÚ ERT AÐ FARA AÐ KEYRA SQL NÚNA.**

Stebbi keyrði nákvæma reviewed SQL179 apply migration. Skjámyndin staðfesti
réttan `-- SQL179 MIGRATION:` header og `Success. No rows returned`. APPLY er
því GREEN.

Eina aðgerð Stebba núna er að keyra frozen reviewed **read-only postflight**
skrána. Hún les aðeins PostgreSQL catalog metadata og eina stillingarröð fyrir
private receipt bucket, skilar einni sanitized contract-röð og endar í
`ROLLBACK`.

**Ekki endurkeyra SQL179 apply.** Engin executable, SQL, test eða product bytes
breyttust við þessa afhendingu.

## Staðfest apply evidence

- Apply SHA-256:
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`
- Fyrsta lína sýnd í keyrslu: `-- SQL179 MIGRATION:`
- SQL Editor niðurstaða: `Success. No rows returned`
- Classification: `APPLY GREEN`

## Eina skráin sem má keyra núna

- Skrá: [SQL179 read-only postflight](../../../../sql/validation/179-expense-receipt-item-claims/postflight.sql)
- Absolute path: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2\sql\validation\179-expense-receipt-item-claims\postflight.sql`
- SHA-256: `e0911f4142c45d4ffabb6ac8c98944fbfe31ea84f386a37812eb6f78aa1f2af5`
- Bytes: `19,374`
- Lines: `390`
- Final newline: `true`
- Operator input: ekkert; engin UUID eða önnur placeholders eru í skránni.
- Production SQL Editor: [Supabase SQL Editor](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new)

Production project ref `bpjwgutpzsifjaucvkbk` er staðfest í canonical
repository deployment evidence
`ai-handoff/2026-07-15-1720-todo-086-v235-deploy-vercel-config.md`.

## Framkvæmd Stebba

1. Opnaðu Production SQL Editor hlekkinn og staðfestu að project ref í
   address bar sé nákvæmlega `bpjwgutpzsifjaucvkbk`.
2. Opnaðu fullu postflight skrána með hlekknum hér að ofan.
3. Settu alla skrána óbreytta í nýjan, tóman SQL Editor. Engin input eða
   placeholders þarf að setja inn.
4. Staðfestu að skráin byrji á `-- SQL179 READ-ONLY POSTFLIGHT:` og endi á
   `ROLLBACK;`.
5. Veldu allan textann eða hafðu ekkert textaval og keyrðu alla skrána einu
   sinni.
6. Afritaðu heila einu result-röðina aftur til Codex. Hún inniheldur aðeins
   catalog booleans og classification; ekkert actor UUID eða notendagögn.

## Expected exact GREEN row

| field | required value |
| --- | --- |
| `executor_ok` | `true` |
| `prerequisites_exact` | `true` |
| `actor_input_required` | `false` |
| `targets_absent` | `false` |
| `target_functions_exact` | `true` |
| `target_relations_exact` | `true` |
| `target_triggers_exact` | `true` |
| `target_bucket_exact` | `true` |
| `target_catalog_exact` | `true` |
| `targets_exact` | `true` |
| `installation_state` | `EXACT_INSTALLED` |
| `postconditions_ok` | `true` |

GREEN krefst nákvæmlega einnar row og allra gildanna hér að ofan. Þá er
SQL179 schema/operator gate lokið og Codex heldur sjálfkrafa áfram með
app-release undirbúning samkvæmt WORKFLOW.

## STOP og error handling

Ef eitthvert gildi er annað, `installation_state` er ekki
`EXACT_INSTALLED`, `postconditions_ok` er ekki `true`, row vantar eða fleiri en
ein row kemur, þá er STOP. Sama gildir um editor error, timeout, aborted
transaction, vantaðan `ROLLBACK;` hala eða partial-selection keyrslu.

Við STOP:

- ekki endurkeyra apply;
- ekki endurkeyra postflight blindandi;
- ekki keyra önnur SQL artifacts;
- senda Codex heila bounded result-röðina eða exact editor-villuna fyrst.

## Read-only áhrif og mörk

Postflight er 100% read-only transaction. Það breytir ekki schema, functions,
grants, RLS, auth, bucket, kvittunum, fjárhagsgögnum eða öðrum Production
gögnum. Versta raunhæfa afleiðing er bounded catalog/editor villa; þá er STOP
án frekari SQL-keyrslu.

Apply, preflight og postflight hashes eru áfram:

| artifact | SHA-256 | staða |
| --- | --- | --- |
| `sql/179_expense_receipt_item_claims.sql` | `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c` | þegar GREEN; aldrei endurkeyra |
| `sql/validation/179-expense-receipt-item-claims/preflight.sql` | `c614b37504d56e16b2c0c4f28f572dbdbf6cbe6c841b78bf080bddf2d6bc2d2c` | þegar GREEN; ekki endurkeyra |
| `sql/validation/179-expense-receipt-item-claims/postflight.sql` | `e0911f4142c45d4ffabb6ac8c98944fbfe31ea84f386a37812eb6f78aa1f2af5` | keyra núna |

Reviewed executable manifest er óbreytt. v005-v007 og canonical status-link
updates eru aðeins post-review documentation evidence.

## Localhost checks for Stebbi

Ekki keyra localhost núna. Postflight þarf fyrst að staðfesta
`EXACT_INSTALLED`, og samhæfur app candidate þarf síðan að fara í sitt
release-ferli. Localhost checklist verður aðeins afhent þegar SQL schema og
app-code eru bæði til staðar í sama prófunarumhverfi.

## Óvissa / þarf að staðfesta

Eina óstaðfesta atriðið er exact Production postflight classification. Apply
success einn og sér sannar ekki catalog seal/postconditions. Codex keyrði
ekkert SQL.
