# v086 — SQL191 READY og migration-gátt

Created: 2026-09-17 07:15
Timezone: Atlantic/Reykjavik

## Plan áfangans

Rýna actual SQL191 preflight, staðfesta artifacts og opna aðeins migration-
gáttina ef allt er nákvæmlega rétt.

## Hvað var raunverulega gert

- Actual preflight frá Stebba var `READY`.
- `operator_ok`, `predecessor_ok` og `targets_absent` voru öll true.
- Hashar migration, preflight og postflight stemma við v085.
- SQL191 migration hefur ekki verið keyrð.

## Skrár sem voru skoðaðar

- Actual preflight-röð frá Stebba
- `sql/191_receipt_split_fraction_notation.sql`
- SQL191 validation README og artifacts
- v085 handoff og canonical task-skjal

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- SHA-256 sannprófun: PASS; allir þrír hashar óbreyttir.
- `git diff --check`: PASS; aðeins line-ending warnings.
- Candidate validation úr v085: scoped lint, type-check, 29 focused próf og
  production build PASS.

## Hvað mistókst eða var sleppt

SQL191 migration, postflight og localhost-prófun eru enn ókeyrð.

## Ákvarðanir

Preflight sannar nákvæman SQL190 predecessor og að hvorugur target-dálkurinn sé
til. Migrationin er því eina leyfilega næsta SQL-skrefið.

## Áhætta sem er enn til staðar

Migration breytir private claims schema og service-only functions. Transaction
og guard stöðva hana ef production-state hefur breyst frá preflight.

## Tillaga að næsta skrefi

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA:**
`sql/191_receipt_split_fraction_notation.sql` nákvæmlega einu sinni.

Vænt niðurstaða er `Success. No rows returned`. Stöðva við allar aðrar
niðurstöður og ekki keyra postflight fyrr en actual migration-niðurstaða hefur
verið rýnd.

## Spurningar sem Codex á sérstaklega að rýna

- Skilar migrationin nákvæmlega success án rows?
- Kom einhver SQL warning eða error fram?
- Héldust artifacts óbreytt frá READY-gáttinni?

## Supabase

Preflight var read-only og breytti engu. Næsta migration bætir nullable
`fraction_numerator` og `fraction_denominator` við private claims, setur
constraint og uppfærir service-only read/command functions. Hún breytir engri
RLS policy, auth reglu eða client grant og flytur engin eldri gögn.

Artifacts:

- migration SHA-256: `62ABFCBDDC85702E068EB407981D79D112705941E8975ED69B785B720A06525F`
- preflight SHA-256: `4F9B5002EBEDCFDC1B26BC316AB6D7C458E1227DFE68C851A92AE3FDBF7D8E70`
- postflight SHA-256: `02CB02C207E9B729ABE017A7508ACE7BCBB1A428D4F43B75F00F329A3890DF9E`

## Localhost checks for Stebbi

Ekki prófa candidate milli migration og exact postflight. Þegar SQL191 er
exact uppsett verður prófað að `2/10` haldist óstytt eftir vistun og refresh,
að canonical magn sé rétt og að slider skipti aftur í Magn. Ekki prófa
production og ekki endurkeyra SQL190 eða SQL191.
