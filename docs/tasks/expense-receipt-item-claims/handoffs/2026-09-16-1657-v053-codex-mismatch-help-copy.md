# Skýrari mismatch-hjálpartexti

Date: 2026-09-16 16:57
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`

## Plan áfangans

Skýra að skipting megi hefjast þótt heildarfjárhæð liða stemmi ekki við reikning
og að hægt sé að laga liði/fjárhæðir síðar.

## Hvað var raunverulega gert

- Íslenski `reviewHelp` textinn var uppfærður samkvæmt orðalagi Stebba.
- Enska þýðingin var samræmd.
- Textinn birtist áfram aðeins í mismatch state við báða confirm-takkana.

## Skrár sem voru skoðaðar

- `messages/is.json`, `messages/en.json`, `SplitBoardV2.tsx` og v2 UI-próf.

## Skrár sem voru breyttar

- `messages/is.json`, `messages/en.json`, canonical task og þessi handoff-skrá.

## Skipanir og niðurstöður

- Locale JSON parse og exact-value smoke: PASS, exit 0.
- Focused v2 UI: 1 skrá, 7/7 PASS, exit 0.

## Hvað mistókst eða var sleppt

Ekkert. Engin SQL-keyrsla, commit, push, deploy eða env-breyting.

## Ákvarðanir

Textinn útskýrir bæði af hverju má halda áfram og hvaða leiðréttingar eru leyfðar
eftir að skipting hefst. Matched state helst textalaust.

## Áhætta sem er enn til staðar

Lengri texti þarf mobile visual smoke fyrir eðlilegt line-wrap.

## Næsta skref og workflow-stopp

SQL185 read-only postflight er áfram næsta ytri gátt. Ekki endurkeyra migration.

## Spurningar fyrir rýni

Engin blocking spurning.

## Supabase-áhrif

Engin.

## Breytingar á verkefnalýsingu

Canonical task skráir merkingu nýja hjálpartextans og prófaevidence.

## Localhost checks for Stebbi

Mynda mismatch og staðfesta nýja textann við báða takka við 360/390/460 px.
Matched state á áfram að vera án texta og án ytri confirm-kassa.

## Óvissa / þarf að staðfesta

Confidence er hátt; mobile line-wrap bíður visual smoke.
