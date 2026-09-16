# SQL189 READY og migration-gátt

Date: 2026-09-16 20:39
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual SQL189 preflight og opna migrationina eina sem næstu handvirku gátt.

## Hvað var raunverulega gert

- Actual preflight skilaði `READY`.
- `operator_ok`, `predecessor_ok`, `columns_absent` og `function_absent` voru öll `true`.
- Artifact-hashes voru endurstaðfest og eru óbreytt.

## Skrár sem voru skoðaðar

- Actual preflight-röð, SQL189 artifacts, v070 og canonical verkefnalýsing.

## Skrár sem voru breyttar

- Canonical verkefnalýsing og þetta handoff.

## Skipanir og niðurstöður

- Actual preflight: `READY`, 4/4 booleans true.
- Migration SHA-256: `87C57ACC260DC1F9B313039268F93F87D33C3615859DCFCC75CBD1933AA792A2`.
- Preflight SHA-256: `4A2FE43A63A0724215A9A9CE00E1E01F53CECD6F98D3141BFD64E0FFA188A4FB`.
- Postflight SHA-256: `475B39FEE38BF1377AE939FF06484C14042E08A392F25F4E9B4F7BE6ED8CFAD5`.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Migration og postflight voru ekki keyrð. Engin commit, push eða deploy.

## Ákvarðanir

Preflight-gátt er lokuð. SQL189 migrationin má keyra einu sinni; ekki endurkeyra hana.

## Áhætta sem er enn til staðar

Migration actual niðurstaða og exact postflight vantar áður en localhost-próf hefjast.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins `sql/189_receipt_split_shared_exchange.sql` og sendir
óbreytta niðurstöðu. Vænt niðurstaða er `Success. No rows returned`.

## Spurningar fyrir rýni

Skilar migrationin væntri success-niðurstöðu án guard- eða lock-timeout villu?

## Supabase-áhrif

Migrationin bætir tveimur nullable dálkum, constraint, detail projection og
service-only member-bound mutation function. Engin núverandi gögn, RLS policy
eða client grant breytast.

## Breytingar á verkefnalýsingu

SQL189 current gate var færð úr preflight yfir í migration.

## Localhost checks for Stebbi

Engin localhost-prófun á þessu stoppi. Eftir migration þarf fyrst exact
postflight; þá gildir 7-skrefa gengisprófunin í v070.

Ekki prófa nýju vistunina fyrr en exact postflight hefur staðfest schema og fall.

## Óvissa / þarf að staðfesta

Actual SQL189 migration-niðurstaða er eina opna gáttin.
