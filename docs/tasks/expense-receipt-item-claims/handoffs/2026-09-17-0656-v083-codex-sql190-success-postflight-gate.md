# v083 — SQL190 success og postflight-gátt

Created: 2026-09-17 06:56
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skrá actual migration success og opna óbreytt read-only postflight sem næstu gátt.

## Hvað var raunverulega gert

- Stebbi keyrði SQL190 einu sinni eftir exact READY preflight.
- Supabase skilaði `Success. No rows returned`.
- Postflight hash og stærð voru staðfest óbreytt frá v081/v082.

## Skrár sem voru skoðaðar

- Skjámynd actual SQL190 success
- SQL190 postflight
- v081 og v082 handoff

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- Postflight: 1897 bytes, SHA-256
  `3E5D0FF5FC2F95AA6B5AA0471A9A84AFA35A31B812EE0B8B20184B0AE7BBC9F8`.
- `git diff --check`: PASS.
- Codex keyrði ekkert SQL.

## Hvað mistókst eða var sleppt

Postflight er enn ókeyrt. Localhost-prófun bíður exact niðurstöðu þess.

## Ákvarðanir

Migration success lokar migration-gáttinni. Skráin má ekki keyra aftur.

## Áhætta sem er enn til staðar

Uppsetning functions, grants, constraint og projection er ekki fullstaðfest fyrr
en postflight skilar exact niðurstöðu.

## Tillaga að næsta skrefi

Stebbi keyrir aðeins SQL190 postflight og sendir eina niðurstöðuröð.

## Spurningar sem Codex á sérstaklega að rýna

Staðfesta öll postflight svið áður en localhost-gátt opnast.

## Supabase

SQL190 var keyrt. Það bætti `input_mode` við private claims, defaultaði eldri
færslur í `quantity` og uppfærði private validator og service-only read/command
functions. Engin RLS policy eða client grant var breytt.

## Localhost checks for Stebbi

Ekki hefja nýja claim-prófun fyrr en postflight er `EXACT_INSTALLED`. Eftir það
gilda localhost-skref v081.

### Næsta handvirka gátt

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA**, en aðeins read-only
[`postflight.sql`](../../../../sql/validation/190-receipt-split-claim-input-mode/postflight.sql).
Vænt niðurstaða er `EXACT_INSTALLED` með `security_ok`, `projection_ok`,
`command_ok`, `column_ok` og `constraint_ok` öll true.
