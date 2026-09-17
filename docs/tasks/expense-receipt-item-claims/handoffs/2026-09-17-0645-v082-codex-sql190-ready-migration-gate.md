# v082 — SQL190 READY og migration-gátt

Created: 2026-09-17 06:45
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skrá actual SQL190 preflight niðurstöðu, staðfesta óbreytt artifacts og opna
migrationina eina sem næstu handvirku gátt.

## Hvað var raunverulega gert

- Actual preflight frá Stebba var `READY`.
- `operator_ok`, `predecessor_ok`, `command_ok` og `target_absent` voru öll true.
- Migration, preflight og postflight hashes og stærðir voru endurstaðfest óbreytt.

## Skrár sem voru skoðaðar

- SQL190 migration, preflight og postflight
- v081 handoff og canonical task-skjal

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- SHA-256 og byte-stærðir: exact match við v081.
- `git diff --check`: PASS.
- Engin SQL-skipun var keyrð af Codex.

## Hvað mistókst eða var sleppt

Ekkert. Supabase analyzer gaf falska RLS-viðvörun á read-only preflight vegna
`INSERT INTO` texta inni í `LIKE` streng; query-ið skrifaði engin gögn.

## Ákvarðanir

READY niðurstaðan opnar aðeins exact SQL190 migrationina. Hún heimilar hvorki
postflight, commit, push né deployment.

## Áhætta sem er enn til staðar

Migrationin breytir private claims schema og service-only functions. Transaction
og guard tryggja að partial breyting rúlli til baka við frávik.

## Tillaga að næsta skrefi

Stebbi keyrir SQL190 migrationina einu sinni og sendir nákvæma niðurstöðu.

## Spurningar sem Codex á sérstaklega að rýna

Eftir success: staðfesta að postflight artifact sé óbreytt áður en gátt opnast.

## Supabase

Preflight var read-only. Migration er enn ókeyrð. Hún bætir einum constrained
non-null textadálki við private claims og uppfærir validator, read projection og
claim write án breytinga á RLS eða client grants.

Artifacts:

- Migration: 6296 bytes, SHA-256 `8B03F3261CDC99AA4EBD71A98D9E25352F6182B1B63F876E127C5145EEBE604B`
- Preflight: 1507 bytes, SHA-256 `4F76C0D9EA7878F324844531C66C87431658BAD55E32341C1F690B1049010F62`
- Postflight: 1897 bytes, SHA-256 `3E5D0FF5FC2F95AA6B5AA0471A9A84AFA35A31B812EE0B8B20184B0AE7BBC9F8`

## Localhost checks for Stebbi

Ekki prófa nýja claim-flæðið fyrr en migration og exact postflight eru bæði
staðfest. Eftir það gilda localhost-skref v081 óbreytt.

### Næsta handvirka gátt

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA**: keyra aðeins
[`sql/190_receipt_split_claim_input_mode.sql`](../../../../sql/190_receipt_split_claim_input_mode.sql)
einu sinni í sama Supabase SQL Editor. Vænt niðurstaða er `Success. No rows returned`.
Ekki endurkeyra migrationina og ekki keyra postflight fyrr en Codex hefur skráð
actual success.
