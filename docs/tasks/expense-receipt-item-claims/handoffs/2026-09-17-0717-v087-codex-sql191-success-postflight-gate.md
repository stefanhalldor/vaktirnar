# v087 — SQL191 migration success og postflight-gátt

Created: 2026-09-17 07:17
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skrá actual migration-niðurstöðu, loka endurkeyrslu og afhenda aðeins read-only
exact postflight ef artifact er óbreytt.

## Hvað var raunverulega gert

- Stebbi keyrði SQL191 migrationina eftir `READY` preflight.
- Actual niðurstaða var `Success. No rows returned`.
- Migration- og postflight-hashar eru óbreyttir frá fyrri gátt.
- Migrationina má ekki keyra aftur.

## Skrár sem voru skoðaðar

- Skjámynd Stebba af actual migration-niðurstöðu
- SQL191 migration og postflight
- v085–v086 handoff og canonical task-skjal

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- SHA-256 sannprófun migration og postflight: PASS.
- `git diff --check`: PASS; aðeins line-ending warnings.

## Hvað mistókst eða var sleppt

Exact postflight og localhost-prófun eru enn ókeyrð.

## Ákvarðanir

Success án rows lokar migration-gáttinni. Næsta eina SQL-skref er óbreytt
read-only postflight; engin endurkeyrsla migration er leyfileg.

## Áhætta sem er enn til staðar

Successful transaction sannar ekki ein og sér endanlegt function body,
constraint eða service-only security. Postflight þarf að staðfesta það áður en
localhost er prófað.

## Tillaga að næsta skrefi

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA**, en aðeins:
`sql/validation/191-receipt-split-fraction-notation/postflight.sql`.

Vænt niðurstaða:

- `operator_state = EXACT_INSTALLED`
- `security_ok = true`
- `projection_ok = true`
- `command_ok = true`
- `columns_ok = true`
- `constraint_ok = true`

## Spurningar sem Codex á sérstaklega að rýna

- Er state nákvæmlega `EXACT_INSTALLED`?
- Eru allar fimm sannprófanir true?
- Kom einhver önnur röð, warning eða error fram?

## Supabase

SQL191 var keyrt í production Supabase og lauk án rows. Það bætti nullable
fraction metadata við private claims og uppfærði service-only functions.
Migration breytti hvorki RLS policies, auth né client grants. Exact staða bíður
postflight.

- migration SHA-256: `62ABFCBDDC85702E068EB407981D79D112705941E8975ED69B785B720A06525F`
- postflight SHA-256: `02CB02C207E9B729ABE017A7508ACE7BCBB1A428D4F43B75F00F329A3890DF9E`

## Localhost checks for Stebbi

Ekki prófa fyrr en postflight skilar `EXACT_INSTALLED`. Þá skal vista `2/10`,
endurhlaða og staðfesta að nákvæm brotaskrift haldist alls staðar en canonical
magn sé áfram 20% af heildarmagni liðarins. Ekki prófa production og ekki
endurkeyra SQL191 migrationina.
