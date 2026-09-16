# Leið 2 biður um reikningsmynd

Date: 2026-09-16 16:19
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-ai-daily-quota
GoLive issue: `bb87bed9-003a-459a-8cb8-f44e3884c9fa`

## Plan áfangans

Bæta einni fail-safe grein fremst í afrituðu fyrirspurn Leiðar 2 og verja hana
með locale-contract prófi.

## Hvað var raunverulega gert

- Íslenska og enska fyrirspurnin segja nú að án myndar skuli gervigreindin taka
  við fyrirmælunum og biðja notandann um mynd af reikningnum sem á að splitta.
- Án myndar má hún hvorki búa til JSON né giska á innihald reikningsins.
- Þegar mynd fylgir heldur fyrri JSON-samningur áfram óbreyttur.
- Contract-prófið sannreynir missing-image og no-guess textann í báðum tungumálum.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md`
- `components/expenses/ExpenseReceiptSplitPanel.tsx`
- `components/expenses/__tests__/expense-receipt-split-panel.test.tsx`
- `lib/__tests__/expense-receipt-server.test.ts`
- `messages/is.json`, `messages/en.json`

## Skrár sem voru breyttar

- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/expense-receipt-server.test.ts`
- canonical task og þessi handoff-skrá

## Skipanir og niðurstöður

- Focused Vitest: 1 skrá, 9/9 próf PASS, exit 0.
- JSON parse og prompt smoke fyrir bæði locale: PASS, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Engin SQL-keyrsla, commit, push, deploy, env-breyting eða
provider-kall var framkvæmt.

## Ákvarðanir

Reglan er fremst í fyrirspurninni svo hún taki forgang fram yfir fyrirmælin um
að skila eingöngu JSON. Hún biður aðeins um mynd þegar mynd vantar; hún breytir
ekki output-schema þegar mynd er til staðar.

## Áhætta sem er enn til staðar

Ytri gervigreind getur virt fyrirmæli misvel. Skýrt no-JSON/no-guess orðalag
dregur úr líkum á tilbúnu svari en Teskeið staðfestir áfram innlímt JSON.

## Næsta skref og workflow-stopp

SQL185 postflight-gátt v046 er áfram næst: Stebbi keyrir aðeins
`sql/validation/185-receipt-split-ai-quota/postflight.sql` og sendir eina röð.
Ekki endurkeyra migrationina.

## Spurningar fyrir rýni

Engin blocking spurning. Staðfesta síðar í localhost að afritaður texti byrji á
missing-image reglunni og að núverandi copy-feedback haldist.

## Supabase-áhrif

Engin. SQL185 migration var áður keyrð af Stebba; þessi breyting snertir aðeins
locale-texta og contract-próf. Read-only postflight er enn ókeyrt.

## Breytingar á verkefnalýsingu

Canonical task skráir nýju missing-image hegðunina, báða locale og 9/9 focused
próf. Current SQL185 postflight gate breyttist ekki.

## Localhost checks for Stebbi

Eftir exact SQL185 postflight: opna Leið 2, ýta á „Afrita“, líma í myndhæft
gervigreindarapp án myndar og staðfesta að appið biðji um mynd í stað JSON.
Bæta síðan eigin eða synthetic reikningsmynd við og staðfesta að JSON-svarið sé
enn hægt að líma í Teskeið. Ekki nota reikning annars notanda.

## Óvissa / þarf að staðfesta

Confidence er hátt á texta- og contract-breytingunni. Raunhegðun mismunandi ytri
gervigreindarappa verður aðeins staðfest með localhost/manual smoke.
