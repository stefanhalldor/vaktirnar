# v089 — Heiti fyrir nákvæmari skiptingu

Created: 2026-09-17 07:24
Timezone: Atlantic/Reykjavik

## Plan áfangans

Breyta aðeins heiti skúffunnar samkvæmt orðalagi Stebba og halda íslensku og
ensku skilaboðunum samstæðum.

## Hvað var raunverulega gert

- Íslenska heitinu var breytt í „Splitta með nákvæmari hætti“.
- Enska heitinu var breytt í „Split more precisely“.
- Engin UI-hegðun, gögn eða útreikningur breyttist.

## Skrár sem voru skoðaðar

- `messages/is.json`
- `messages/en.json`
- tilvísanir í components, tests og task-skjölum

## Skrár sem voru breyttar

- `messages/is.json`
- `messages/en.json`
- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- Focused UI Vitest: 15/15 PASS.
- `npm.cmd run type-check`: PASS.
- `git diff --check`: PASS; aðeins line-ending warnings.

## Hvað mistókst eða var sleppt

Engin browserprófun var keyrð af Codex; Stebbi sér textann á sínum dev server.

## Ákvarðanir

Þýðanlegi textinn helst í message-skrám. Eldri immutable handoff voru ekki
endurrituð þótt þau skjalfesti fyrra heitið.

## Áhætta sem er enn til staðar

Mjög lítil; lengra heiti þarf aðeins sjónræna athugun á mjóum skjá.

## Tillaga að næsta skrefi

Staðfesta heitið á localhost samhliða `2/10` prófinu.

## Spurningar sem Codex á sérstaklega að rýna

- Brotnar textinn eðlilega á 360 px án overflow?
- Er orðalagið skýrt þegar skúffan er bæði opin og lokuð?

## Supabase

Á ekki við. Engin SQL, RLS, auth, grant eða production-breyting var gerð.

## Localhost checks for Stebbi

1. Opna split á `http://localhost:3004`.
2. Staðfesta að lokaða og opna skúffan heiti „Splitta með nákvæmari hætti“.
3. Prófa 360 px breidd og staðfesta að textinn valdi hvorki overflow né overlap.
4. Halda áfram með `2/10` refresh-prófið úr v088.
