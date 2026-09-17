# v081 — Vistað innsláttarform og SQL190 preflight-gátt

Created: 2026-09-16 23:42
Timezone: Atlantic/Reykjavik

## Plan áfangans

Vista hvaða innsláttarform notandi notaði fyrir claim, sýna þá framsetningu
aftur og skipta aftur í Magn þegar slider er notaður. Þjappa jafnframt spjaldinu.

## Hvað var raunverulega gert

- Claim samningur ber nú `inputMode`: `quantity`, `percent` eða `fraction`.
- SQL190 bætir constrained `input_mode` dálki við claims, uppfærir service-only
  command validation/write og detail projection.
- Eldri claims fá örugga sjálfgefna gildið `quantity`.
- Sliderhreyfing skiptir strax yfir í Magn og hoppar á hálfum.
- Brot og prósenta haldast eftir refresh þegar viðkomandi mode var vistað.
- „Ég tek restina“ er nú í sömu línu og `x af y eftir`.
- Skúffuheitið er „Nákvæmari mælieiningar“ / „More precise units“.

## Skrár sem voru skoðaðar

- v2 contracts, view, session, action og board components
- SQL184, SQL187, SQL189 og validation-mynstur þeirra
- tengd UI-, summary-, migration- og contract-próf
- `Design.md`, `WORKFLOW.md` og `AGENTS.md`

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `lib/receipt-split/{contracts-v2,session-v2,view-v2}.ts`
- `lib/__tests__/standalone-receipt-{session-v2,v2-summary}.test.ts`
- `lib/__tests__/receipt-split-sql190-claim-input-mode.test.ts`
- `messages/is.json`, `messages/en.json`
- SQL190 migration og validation artifacts
- canonical task-skjal og þetta handoff

## Skipanir og niðurstöður

- Focused Vitest: 28/28 PASS, exit 0.
- Type-check: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- Production build: PASS, exit 0; aðeins eldri ótengdar warnings.
- `git diff --check`: PASS.

## Hvað mistókst eða var sleppt

SQL190 var aðeins skrifað og hefur ekki verið keyrt. Localhost detail parsing
og ný claim mutation bíða uppsetningar SQL190. Enginn dev server var snertur.

## Ákvarðanir

- Geyma mode fremur en að giska á það út frá niðurstöðumagni.
- Geyma ekki raw inntak; canonical magn og mode nægja til að endurreikna örugga
  birtingu og forðast ósamræmd tvöföld gögn.
- Historical claims eru Magn, því upprunalegt form þeirra er óþekkt.
- SQL190 breytir engum RLS policies og heldur read/command functions service-only.
- UI fylgir `Design.md` með þéttari mobile hierarchy, semantic controlum og
  óbreyttum touch/focus-mörkum.

## Áhætta sem er enn til staðar

- Migrationin notar guarded function-definition replacements og má aðeins keyra
  eftir exact READY preflight.
- Concurrent eldri client eftir SQL190 fær `split_invalid` vegna vantaðs mode;
  því þarf app candidate og SQL að fara saman í loka release.
- Browserrýni þarf eftir exact postflight.

## Tillaga að næsta skrefi

Stebbi keyrir aðeins SQL190 preflight og sendir eina niðurstöðuröð. Ef hún er
exact READY undirbýr Codex migration-gáttina; migration er ekki heimiluð enn.

## Spurningar sem Codex á sérstaklega að rýna

- Exact predecessor match fyrir dynamic read/command patch.
- Að service-only grants, capacity og optimistic concurrency haldist óbreytt.
- Að slider skipti persisted fraction/percent yfir í quantity við fyrstu hreyfingu.

## Supabase

SQL190 er skrifað en ókeyrt. Það bætir einum non-null textadálki með default og
check constraint við private `receipt_split.claims`, uppfærir private validator
og tvö service-only public functions. Engin RLS policy, auth regla eða client
grant breytist. Existing rows verða `quantity`; engin fjárhæð breytist.

Artifacts:

- Migration: 6296 bytes, SHA-256 `8B03F3261CDC99AA4EBD71A98D9E25352F6182B1B63F876E127C5145EEBE604B`
- Preflight: 1507 bytes, SHA-256 `4F76C0D9EA7878F324844531C66C87431658BAD55E32341C1F690B1049010F62`
- Postflight: 1897 bytes, SHA-256 `3E5D0FF5FC2F95AA6B5AA0471A9A84AFA35A31B812EE0B8B20184B0AE7BBC9F8`

## Localhost checks for Stebbi

Ekki prófa nýja claim-flæðið fyrr en SQL190 hefur farið í gegnum READY,
migration success og EXACT_INSTALLED. Eftir það:

1. Vista 1/10 undir Brot og endurhlaða. Pillan og slider-merkið eiga að sýna 1/10.
2. Hreyfa sliderinn. Hann á að hoppa á næsta hálfa magn og birta magn, ekki nýtt brot.
3. Vista prósentu og endurhlaða; sama prósenta á að birtast.
4. Staðfesta að „Ég tek restina“ sé við `x af y eftir` og að kortið sé þéttara.
5. Staðfesta heitið „Nákvæmari mælieiningar“ og prófa 360, 390 og 460 px.
6. Staðfesta eina mutation við release og enga meðan fingur er á skjánum.

### Næsta handvirka gátt

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA**, en aðeins read-only
[`preflight.sql`](../../../../sql/validation/190-receipt-split-claim-input-mode/preflight.sql)
í sama Supabase SQL Editor og fyrri receipt-split migrations. Vænt niðurstaða er
ein röð með `operator_state=READY` og `operator_ok`, `predecessor_ok`,
`command_ok`, `target_absent` öll `true`. Ekki keyra migration eða postflight enn.
