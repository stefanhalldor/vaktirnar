# SQL179 corrected read-only postflight gate

Created: 2026-09-14 19:20
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og findings

**JÁ — ÞÚ ERT AÐ FARA AÐ KEYRA SQL NÚNA.**

Stebbi á nú aðeins að keyra corrected read-only SQL179 postflight. SQL179
apply er þegar GREEN og má ekki endurkeyra.

Fyrri `DRIFT_STOP` var staðfestur sem operator-validation galli. Production
keyrir PostgreSQL `170006`; allar fimm SQL179 töflurnar eru exact með RLS,
force-RLS, owner, engum policies og réttum columns. ACL hverrar töflu er
nákvæmlega PostgreSQL owner-default með átta entries, þar á meðal
`MAINTAIN`. Engin PUBLIC, anon, authenticated, service-role eða önnur
non-owner réttindi fundust.

Leiðréttingin breytir aðeins read-only preflight/postflight validation. Hún
ber actual effective ACL í báðar áttir saman við authoritative
`pg_catalog.acldefault('r', relowner)` fyrir keyrandi PostgreSQL útgáfu.
Canonical samanburðurinn inniheldur grantor, grantee, privilege og grant
option og er óháður röð. Missing, extra, PUBLIC, non-owner, wrong-grantor og
wrong-grant-option ACL drift er áfram hafnað.

SQL179 apply, schema, functions, grants, RLS, app og product behavior eru
byte-identical og óbreytt. Enginn repair/apply artifact er nauðsynlegur.

## Eina skráin sem má keyra núna

- Skrá: [Corrected SQL179 read-only postflight](../../../../sql/validation/179-expense-receipt-item-claims/postflight.sql)
- Absolute path: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2\sql\validation\179-expense-receipt-item-claims\postflight.sql`
- SHA-256: `c72040a7713324bc52fcb8c7347f0ca626ffdd02b93a01f9b49684d5a6a90198`
- Bytes: `19,735`
- Lines: `399`
- Final newline: `true` (LF)
- Operator input: ekkert; engin UUID eða önnur placeholders eru í skránni.
- Production SQL Editor: [Supabase SQL Editor](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new)

Production project ref `bpjwgutpzsifjaucvkbk` er staðfest í canonical
repository deployment evidence
`ai-handoff/2026-07-15-1720-todo-086-v235-deploy-vercel-config.md`.

## Framkvæmd Stebba

1. Opnaðu Production SQL Editor hlekkinn og staðfestu að project ref í
   address bar sé nákvæmlega `bpjwgutpzsifjaucvkbk`.
2. Opnaðu fullu corrected postflight skrána með hlekknum hér að ofan.
3. Settu alla skrána óbreytta í nýjan, tóman SQL Editor. Engin input eða
   placeholders þarf að setja inn.
4. Staðfestu að skráin byrji á `-- SQL179 READ-ONLY POSTFLIGHT:` og endi á
   `ROLLBACK;`.
5. Veldu allan textann eða hafðu ekkert textaval og keyrðu alla skrána einu
   sinni.
6. Afritaðu heila einu sanitized result-röðina aftur til Codex.

**Ekki endurkeyra SQL179 apply. Ekki keyra preflight eða diagnostic aftur.**

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
SQL179 schema/operator gate lokið og næsta skref er app-release undirbúningur
samkvæmt WORKFLOW.

## STOP og error handling

Ef eitthvert gildi er annað, result-row vantar eða fleiri en ein row kemur,
er STOP. Sama gildir um editor error, timeout, aborted transaction, vantaðan
`ROLLBACK;` hala eða partial-selection keyrslu. Ekki endurkeyra apply,
postflight eða önnur SQL artifacts; senda exact bounded result-röð eða
editor-villu fyrst.

## Frozen hashes og gates

| artifact | SHA-256 | bytes | lines | staða |
| --- | --- | ---: | ---: | --- |
| `sql/179_expense_receipt_item_claims.sql` | `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c` | 92,929 | 2,249 | APPLY GREEN; byte-identical |
| `sql/validation/179-expense-receipt-item-claims/preflight.sql` | `471cb5da5c0e178bff16e4aa92f57cc9731355c4bceae394f5881251d517c3ef` | 19,774 | 400 | corrected operator bytes; ekki keyra núna |
| `sql/validation/179-expense-receipt-item-claims/postflight.sql` | `c72040a7713324bc52fcb8c7347f0ca626ffdd02b93a01f9b49684d5a6a90198` | 19,735 | 399 | keyra núna |
| `sql/validation/179-expense-receipt-item-claims/diagnose-target-relations.sql` | `ba07a28283662d9c2fdc14fecf122ae972bcdcf5b4d4a449357c22001f43673c` | 31,246 | 653 | evidence; ekki endurkeyra |

- Static/focused SQL179 tests: 2 files, 23/23 GREEN.
- PG17 `MAINTAIN`, reorder, missing, extra, PUBLIC, non-owner, grantor,
  grantee og grant-option regression assertions: GREEN.
- Preflight/postflight classification parity: GREEN.
- Type check: GREEN, exit 0.
- Path-specific diff/no-index whitespace checks: engin findings.
- Independent final-byte review á corrected operator contract: GREEN.
- `package.json`, `package-lock.json` og `vercel.json`: Git object IDs exact
  við samþykktan base.
- Canonical `C:\Users\Lenovo\Documents\WORKFLOW.md` v7 var uppfært og rýnt
  GREEN af root; SHA-256
  `f5ee6782a73cbd2bd3867dcbbc096f3edf874d1a56424e20d4909a3647c31957`.

## Supabase áhrif og mörk

Corrected postflight er 100% read-only transaction og endar í `ROLLBACK`.
Það breytir ekki schema, functions, grants, RLS, auth, bucket, kvittunum,
fjárhagsgögnum eða öðrum Production gögnum. Codex keyrði ekkert SQL.

## Localhost checks for Stebbi

Ekki keyra localhost núna. Corrected postflight þarf fyrst að staðfesta
`EXACT_INSTALLED`, og samhæfur app candidate þarf síðan að fara í release.
Localhost checklist verður aðeins afhent þegar SQL179 schema og app-code eru
bæði til staðar í sama prófunarumhverfi. Ekki nota raunveruleg viðkvæm
kvittunargögn í fyrstu prófun.

## Óvissa / þarf að staðfesta

Eina opna runtime-gatið er handvirka corrected postflight niðurstaðan.
Production diagnostic hefur þegar staðfest að uppsetta schemað sjálft er
exact og að fyrri RED stafaði af PostgreSQL 17 owner-default ACL contracti.
