# SQL179 reviewed manual read-only relation diagnostic gate

Created: 2026-09-14 17:48
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og findings

**JÁ — ÞÚ ERT AÐ FARA AÐ KEYRA SQL NÚNA.**

SQL179 apply er GREEN, en handvirkt read-only postflight skilaði
`target_relations_exact=false`, `target_catalog_exact=true` og
`DRIFT_STOP`. Ekki endurkeyra apply eða postflight.

Eina aðgerð Stebba núna er að keyra yfirförnu read-only relation diagnostic
skrána. Hún les aðeins PostgreSQL catalog metadata fyrir nákvæmlega fimm
SQL179 töflur, staðfestir current SQL179 function/catalog-seal lineage og les
eina stillingarröð private receipt bucket. Hún les engar app-, actor-,
kvittunar- eða fjárhagsraðir og endar í `ROLLBACK`.

Source-rýni sýnir líklegan operator-contract galla: postflight ber ACL hverrar
töflu saman við nákvæmlega sjö `postgres` entries, en sealed catalog samningur
samþykkti raunverulega uppsetta ACL. Nýrri PostgreSQL útgáfa getur bætt
`MAINTAIN` við sjálfgefin owner-réttindi. Þetta er aðeins tilgáta þar til
diagnostic output staðfestir hana.

## Eina skráin sem má keyra núna

- Skrá: [SQL179 read-only target relation diagnostic](../../../../sql/validation/179-expense-receipt-item-claims/diagnose-target-relations.sql)
- Absolute path: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2\sql\validation\179-expense-receipt-item-claims\diagnose-target-relations.sql`
- SHA-256: `ba07a28283662d9c2fdc14fecf122ae972bcdcf5b4d4a449357c22001f43673c`
- Bytes: `31,246`
- Lines: `653`
- Final newline: `true` (LF)
- Operator input: ekkert; engin UUID eða önnur placeholders eru í skránni.
- Production SQL Editor: [Supabase SQL Editor](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new)

Production project ref `bpjwgutpzsifjaucvkbk` er staðfest í canonical
repository deployment evidence
`ai-handoff/2026-07-15-1720-todo-086-v235-deploy-vercel-config.md`.

## Framkvæmd Stebba

1. Opnaðu Production SQL Editor hlekkinn og staðfestu að project ref í
   address bar sé nákvæmlega `bpjwgutpzsifjaucvkbk`.
2. Opnaðu fullu diagnostic skrána með hlekknum hér að ofan.
3. Settu alla skrána óbreytta í nýjan, tóman SQL Editor. Engin input eða
   placeholders þarf að setja inn.
4. Staðfestu að skráin byrji á `-- SQL179 READ-ONLY DIAGNOSTIC:` og endi á
   `ROLLBACK;`.
5. Veldu allan textann eða hafðu ekkert textaval og keyrðu alla skrána einu
   sinni.
6. Afritaðu allar fimm sanitized result-raðirnar aftur til Codex. Ekki senda
   editor-innihald eða önnur logg.

## Expected output og flokkun

Skráin á að skila nákvæmlega einni röð fyrir hverja af þessum fimm relation:

- `expense_receipt_claims`
- `expense_receipt_finalizations`
- `expense_receipt_items`
- `expense_receipt_party_handles`
- `expense_receipt_splits`

Hver röð inniheldur aðeins:

- contract/version, relation-heiti og classification;
- executor, prerequisite, SQL179 function, catalog-seal og sameinað lineage
  boolean;
- PostgreSQL server version number;
- existence, relkind, RLS, force-RLS og owner booleans;
- policy-, column- og ACL-talningar;
- exact column/ACL booleans;
- MD5 fingerprints fyrir ordered column names, actual ACL og PostgreSQL
  owner-default ACL;
- sérstaklega `maintain_privilege_count`.

Engin raw column listi, raw ACL, UUID, actor, titill, upphæð, mynd, payload eða
önnur notendagögn koma í output.

Líkleg niðurstaða, ef source-tilgátan er rétt, er nákvæmlega fimm
`OPERATOR_ACL_VERSION_CONTRACT` rows með:

- `lineage_guard_ok=true`;
- öll relation/RLS/owner/policy/column predicates true;
- `operator_acl_exact=false`;
- `acl_matches_pg_owner_default=true`;
- `maintain_privilege_count=1`.

Þetta er diagnostic finding, ekki leyfi til að breyta eða keyra meira SQL.

## STOP og error handling

Eftir þessa einu keyrslu er alltaf STOP fyrir Codex-greiningu. Sérstaklega:

- `STOP_LINEAGE`: STOP; engar relation details eiga að vera notaðar og ekkert
  annað SQL er keyrt.
- `RELATION_MISMATCH`: STOP; greina nákvæma sanitized row áður en viðgerð er
  hönnuð.
- fimm eins `OPERATOR_ACL_VERSION_CONTRACT` rows: STOP; þetta staðfestir
  líklega PostgreSQL ACL-version contract gallann.
- fimm `PASS` rows eða blönduð classification: STOP vegna snapshot/drift sem
  þarf að greina.
- ekki nákvæmlega fimm rows, editor error, timeout, aborted transaction,
  vantaður `ROLLBACK;` hali eða partial-selection keyrsla: STOP.

**Ekki endurkeyra SQL179 apply. Ekki endurkeyra SQL179 postflight. Ekki keyra
önnur SQL artifacts.**

## Review og staðbundin gates

- Ein óháð final-byte diagnostic rýni: GREEN.
- Static/focused SQL179 tests: 2 files, 21/21 GREEN.
- Type check: GREEN, exit 0.
- Path-specific diff/no-index whitespace checks: engin findings.
- SQL179 executable bytes eru óbreytt frá reviewed/manual-run artifacts:

| artifact | SHA-256 | staða |
| --- | --- | --- |
| `sql/179_expense_receipt_item_claims.sql` | `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c` | APPLY GREEN; aldrei endurkeyra |
| `sql/validation/179-expense-receipt-item-claims/preflight.sql` | `c614b37504d56e16b2c0c4f28f572dbdbf6cbe6c841b78bf080bddf2d6bc2d2c` | PREDECESSOR_READY GREEN; ekki endurkeyra |
| `sql/validation/179-expense-receipt-item-claims/postflight.sql` | `e0911f4142c45d4ffabb6ac8c98944fbfe31ea84f386a37812eb6f78aa1f2af5` | DRIFT_STOP; ekki endurkeyra núna |

## Supabase áhrif og mörk

Diagnostic er 100% read-only transaction. Það breytir ekki schema,
functions, grants, RLS, auth, bucket, kvittunum, fjárhagsgögnum eða öðrum
Production gögnum. Versta raunhæfa afleiðing er bounded catalog/editor villa;
þá er STOP án frekari SQL-keyrslu. Codex keyrði ekkert SQL.

## Localhost checks for Stebbi

Ekki keyra localhost núna. SQL179 schema/operator postcondition þarf fyrst að
vera greind og leiðrétt með sér reviewed handvirku SQL-gate ef við á. App-code
þarf síðan að vera útgefinn áður en mobile/desktop receipt split flæðið er
prófað. Ekki nota raunveruleg viðkvæm kvittunargögn í fyrstu prófun.

## Óvissa / þarf að staðfesta

`MAINTAIN` ACL skýringin er líkleg út frá local source og núverandi Production
booleans, en hún er ekki staðfest fyrr en allar fimm sanitized diagnostic
raðirnar liggja fyrir.
