# Tvöföld staðfesting og scroll efst

Date: 2026-09-16 16:23
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`

## Plan áfangans

Endurnýta staðfestingaraðgerðina fyrir ofan og neðan kvittunarliðina og færa
viewport efst aðeins eftir farsæla staðfestingu.

## Hvað var raunverulega gert

- Sami primary takki birtist eftir heildarreitnum, fyrir ofan fyrsta liðinn.
- Fyrri takkinn undir síðasta liðnum helst óbreyttur.
- Báðir kalla sömu `saveReview`, deila pending-state og læsast saman.
- Farsælt server-svar kallar `window.scrollTo({ top: 0, behavior: 'smooth' })`
  áður en `router.refresh()` endurhleður skiptinguna.
- Validation/server-villa scrollar ekki og heldur samhengi formsins.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md`
- `components/expenses/ExpenseReceiptSplitPanel.tsx`
- `components/expenses/__tests__/expense-receipt-split-panel.test.tsx`

## Skrár sem voru breyttar

- `components/expenses/ExpenseReceiptSplitPanel.tsx`
- `components/expenses/__tests__/expense-receipt-split-panel.test.tsx`
- canonical task og þessi handoff-skrá

## Skipanir og niðurstöður

- Focused Vitest: 1 skrá, 13/13 PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- `npm.cmd run type-check`: PASS, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Engin SQL-keyrsla, commit, push, deploy eða env-breyting var
framkvæmd.

## Ákvarðanir

Takkinn er ekki sticky/floating. Þetta fylgir `Design.md`: primary action er
auðfundin á mobile án nýs fixed controls mynsturs. Scroll gerist aðeins eftir
success svo villuskilaboð og innsláttur tapist ekki úr sjónmáli.

## Áhætta sem er enn til staðar

Smooth-scroll stuðningur fer eftir vafra en fallback er samt efst-staða. Raun-
mobile viewport þarf localhost smoke við 360/390/460 px.

## Næsta skref og workflow-stopp

SQL185 postflight er áfram næsta ytri gátt: Stebbi keyrir aðeins
`sql/validation/185-receipt-split-ai-quota/postflight.sql` og sendir eina röð.
Ekki endurkeyra migrationina.

## Spurningar fyrir rýni

Engin blocking spurning. Staðfesta á localhost að efri og neðri takki séu báðir
sýnilegir í réttri röð og að success opni skiptingu efst.

## Supabase-áhrif

Engin frá þessari UI-breytingu. Fyrri SQL185 migration Success stendur;
read-only postflight er enn ókeyrt.

## Breytingar á verkefnalýsingu

Canonical task skráir tvöfalda staðsetningu staðfestingartakkans, success-only
scroll og grænt prófaevidence. SQL-gátt breyttist ekki.

## Localhost checks for Stebbi

Opna yfirferð kvittunar með mörgum liðum við 360, 390 eða 460 px breidd.
Staðfesta að takki sé bæði fyrir ofan fyrsta lið og neðan síðasta lið, án
overflow eða overlap. Breyta lið, staðfesta með neðri takka og búast við að
skiptingarskjárinn opnist efst. Prófa ógilt gildi og staðfesta að skjárinn
scrolli ekki frá villunni. Nota aðeins eigin eða synthetic kvittun.

## Óvissa / þarf að staðfesta

Confidence er hátt á component-hegðun og sjálfvirkum prófum. Raunbrowser scroll
og mobile layout bíða localhost smoke.
