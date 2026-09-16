# v042 — production release lokið

Created: 2026-09-16 09:44
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims

## Niðurstaða

Stebbi heimilaði commit, push og production deployment. Afmarkað release-manifest
var stage-að og yfirfarið; SQL181, Expense/ÚL-skrár og önnur óskyld dirty vinna
fór ekki í commit. Commit `71e44cfcb1cf32d992564bb2db116853e4a4f9f3`
(`feat: release standalone receipt splitting`) var byggt beint ofan á
`origin/main` `57a57d33c093a89ef38dd087acfa2b789897435d` og push-að sem `HEAD:main`.

Vercel production deployment `dpl_41yuSzha8EXLNCobPTMxvMirVBUH` varð `Ready`:
`https://vaktirnar-gs6q3n2xq-stefan-halldor-jonssons-projects.vercel.app`.
Production aliases innihalda `https://teskeid.is` og `https://vaktirnar.is`.

## Útgáfuefni og yfirferð

- Fyrra focused evidence stendur: v041 UI/actions 19/19 PASS, type-check PASS,
  scoped lint PASS.
- Staged manifest var 132 skrár og secret/forbidden-path scan fann ekkert.
- `git diff --cached --check` fann aðeins sögulegt trailing whitespace í þremur
  handoff-skrám; engin runtime-skrá hafði whitespace-villu.
- Full suite evidence er óbreytt og skráð heiðarlega: 560 files og 8017 tests
  PASS, en exit 1 vegna missing 96 MB curated-route artifacts og fjögurra
  óskyldra booking API `invalid_input` prófa.
- Vercel build lauk grænt eftir push og er endanlegi production build-gate.

## SQL, gögn og umhverfi

Ekkert SQL var keyrt í útgáfunni. SQL179/180/182/183/184 voru þegar uppsett eins
og fyrri gates skjalfesta. SQL181 er áfram HOLD/obsolete og var útilokað.
Engum RLS policies, production-gögnum, auth, secrets eða billing var breytt við
útgáfuna.

Codex breytti ekki Vercel env-breytum. Stebbi stillir sjálfur:

- `EXPENSE_RECEIPT_AI_ENABLED=true`
- `ANTHROPIC_API_KEY` með leynigildi
- `EXPENSE_RECEIPT_MODEL=claude-haiku-4-5-20251001`

API-lykill var hvorki lesinn né skráður í repo eða handoff.

## Breytingar á verkefnalýsingu

Canonical task var uppfært úr prerelease gate í nákvæma production-stöðu með
commit, Vercel deployment og eftirstandandi env-virkjun. Product-samningur og
runtime-kóði breyttust ekki í þessum docs-only lokunaráfanga.

## Localhost checks for Stebbi

Útgáfan er komin á production; ekkert frekara localhost-próf er release-blocker.
Eftir að env-breyturnar hafa verið stilltar skal Stebbi nota aðeins eigið eða
synthetic kvittunargagn til að staðfesta:

1. `Á kvittun` er editable í review og enginn `Vista yfirferð` hnappur sést.
2. `Staðfesta og fara í skiptingu` vistar yfirferð og opnar sharing í einum smelli.
3. Sharing sýnir `Breyta heildarfjárhæð` og eldri claims/pills/Eftir/Búið virka.
4. Myndgreining notar stillt model án þess að lykill eða provider-svar leki í UI.

Ekki keyra SQL. Ekki nota raunveruleg viðkvæm notendagögn í smoke-prófinu.

## Óvissa / þarf að staðfesta

AI-myndgreining verður óvirk þar til Stebbi hefur stillt allar þrjár Vercel
breyturnar og nýtt deployment/redeploy hefur tekið þær upp. Sjálf receipt-split
útgáfan og Vercel build eru græn.
