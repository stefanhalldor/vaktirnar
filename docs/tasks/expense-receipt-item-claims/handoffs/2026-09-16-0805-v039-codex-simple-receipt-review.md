# v039 — einföld kvittunaryfirferð fyrir skiptingu

Created: 2026-09-16 08:05 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Plan og raunveruleg niðurstaða

Yfirferðarskjárinn sýnir nú einn einfaldan lista undir „Liðir á kvittun“.
Hver lína sýnir nákvæmt upprunalegt kvittunarheiti, mannamálsskýringuna undir,
inline magn með `stk.` og inline línuupphæð með mynt. Breyting á magni eða
upphæð birtir „Vista lið“ án þess að opna „Breyta lið“.

Yfirferðin sýnir ekki claim-stepper, brotahnappa, participant pills eða
Eftir/Búið skúffur. Þegar state er `sharing` er fyrri `ItemRow` áfram notuð
óbreytt með öllum núverandi skiptingarcontrols.

Innbyggði Anthropic extractorinn varðveitir nú `description` nákvæmlega eins
og prentað og skilar einnig stuttri íslenskri `explanation` ásamt review flaggi.
Reitirnir voru þegar optional í v2 samningi og uppsettu SQL184; engin schema-
eða migration-breyting þurfti. Eldra JSON án skýringar er áfram gilt.

## Skoðað og breytt

Skoðað: `WORKFLOW.md`, `AGENTS.md`, `Design.md`, canonical task, v038 handoff,
`SplitBoardV2`, v2 contracts/view, extraction server, SQL184 explanation-fields,
þýðingar og focused próf.

Breytt:

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `lib/expenses/receipt-split.server.ts`
- `lib/__tests__/expense-receipt-server.test.ts`
- `messages/is.json`, `messages/en.json`
- canonical task document og þetta handoff

## Prófanir og skipanir

- Focused UI/extraction/action run → 3 skrár, 26 próf PASS, exit 0.
- `npm.cmd run type-check` → PASS, exit 0.
- Afmarkað `next lint --file` á fjórum breyttum TS/TSX-skrám → PASS, exit 0;
  aðeins almenn Next lint deprecation notice.
- Afmarkað `git diff --check` → PASS, exit 0; aðeins line-ending warnings á
  þýðingarskrám.

Ekkert SQL var skrifað eða keyrt. Enginn dev server, provider-call, commit,
push, merge eða deploy var framkvæmdur.

## Ákvarðanir og eftirstandandi áhætta

- Upprunalega heitið er heading í review; skýringin er secondary texti.
- Fyrir eldri línu án explanation er breytt description sýnd sem fallback ef
  hún er frábrugðin original. Enginn texti er fundinn upp í client.
- Inline save notar sama revision-varða `edit_item` command. Kvittunarviðmið
  breytist ekki og fyrri mismatch-regla helst.
- Provider-breytingin er backward compatible í parser en raunveruleg gæði
  íslenskra skýringa þurfa synthetic localhost-myndpróf.

Engin static blocking finding er opin. Núverandi gate er innskráð localhost-
prófun á review og síðan sharing. SQL/release-gátt breyttist ekki.

## Breytingar á verkefnalýsingu

- Bætt við nákvæmum samningi um einfaldan review-lista og inline magn/upphæð.
- Skýrt að claim-controls, participant pills og Eftir/Búið byrja í sharing.
- Skráð að extractor varðveiti prentað heiti og útbúi íslenska skýringu.
- Leiðrétt úrelt „ekki tengt live“ orðalag eftir v037 cutover.

## Localhost checks for Stebbi

Á `http://localhost:3004/auth-mvp/splitta-reikningnum`, innskráður og með eigin
synthetic kvittun:

1. Lestu mynd sem inniheldur t.d. `Chocolate Cake`. Í yfirferð á línan að sýna
   prentaða heitið, íslenska skýringu undir, `1 stk.` og `13 EUR` sem dæmi.
2. Breyttu magni og upphæð beint í reitunum. „Vista lið“ birtist; vistaðu og
   staðfestu að mismatch-samantekt uppfærist en kvittunarviðmið haldist.
3. Staðfestu og hefðu skiptingu. Þá eiga núverandi stepper, ¼/⅓/½/1,
   „Annað magn“, „Breyta lið“, participant pills og Eftir/Búið að birtast eins
   og áður. Prófaðu einnig 360–390px breidd án zoom, overlap eða overflow.

Myndlestur gerir raunverulegt provider-kall og getur haft billing-áhrif. Nota
aðeins eigin/synthetic mynd án viðkvæmra gagna. **Ekki keyra SQL.**
