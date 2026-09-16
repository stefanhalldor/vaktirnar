# v027 — Mismunur og tölusnið í splitti

## Plan og framkvæmd

Stebbi óskaði eftir nákvæmri vöntun á heild og læsilegu magni/fjárhæðum.
Útfært í sama task-candidate innan gildandi framkvæmdarumboðs:

- Lifandi mismunur úr núverandi heild og línureitum; sýnir annaðhvort
  fjárhæð sem vantar eða umframupphæð. Núllmismunur felur villuna.
- Ógildir/tómir fjárhæðareitir gefa almenna leiðbeiningu, ekki falska tölu.
- Nákvæm BigInt-samlagning mismunar, líka fyrir neikvæða afslætti.
- Magn og innsláttarfjárhæðir missa aðeins óþarfa aukastafanúll:
  4.000 → 4, 10.000 → 10, 48.00 → 48, 4.50 → 4.5.
- Úthlutun, eigin magn og samantektir fylgja sömu reglu.
- Nýr standalone formatter notar Intl.NumberFormat currency/locale-snið,
  en heldur nákvæmum heiltölum og aukastöfum án float-deilingar.
- Núverandi gjaldmiðlasamningur haldast: ISK 0, EUR/USD/GBP/DKK/NOK/SEK 2.
  Hvorki ný mynt né gagnabreyting/migration. Punktur og komma leyfð sem
  tugabrotsskil í óhópuðum innsláttarreitum; engin endursniðun við hvert keypress.
- Vista þarf enn breytingar áður en hægt er að staðfesta yfirferð.

## Skrár

Breyttar:
1. components/receipt-split/SplitBoard.tsx.
2. lib/receipt-split/contracts.ts.
3. lib/receipt-split/format.ts (ný).
4. messages/is.json.
5. messages/en.json.
6. components/receipt-split/__tests__/standalone-receipt-ui.test.tsx.
7. lib/__tests__/standalone-receipt-split.test.ts.
8. docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md.
9. Þetta handoff.

Skoðað einnig: Design.md mobile/form-kaflar, lib/expenses/input-money.ts,
WORKFLOW v8, eldri formatter og núverandi próf.

## Breytingar á verkefnalýsingu

Bætti við nákvæmum, lifandi mismun fyrir vöntun og umfram, hegðun ógilds
innsláttar, tölusniði án aukastafanúlla og óbreyttum geymslueiningum.
Skráði currency/locale-reglu og bætti localhost-checks við. Uppfærði
próftölu í 237 og latest handoff; GoLive er samræmt. Eldri handoff óbreytt.

## Prófanir og skipanir

- npm.cmd run test:run -- standalone-receipt: 52/52 PASS, exit 0.
- npm.cmd run test:run -- middleware.test standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter: 237/237 í 14 skrám, exit 0.
- npm.cmd run type-check: PASS.
- Targeted npm.cmd run lint á breyttum TS/TSX: PASS, exit 0;
  aðeins fyrirliggjandi Next lint deprecation.
- git diff --check á kóða/messages: PASS.
- Fyrsta mechanical edit með python alias mistókst vegna óaðgengilegs
  Windows alias; engin skrá breyttist í þeirri keyrslu. Node vann sömu
  afmörkuðu breytingu, exit 0.
- Enginn build sem truflar .next, SQL, provider-kall, server-stjórnun,
  commit, push eða deploy. Innskráð browser/mobile þarf enn Stebba.

Próf ná yfir live vöntun/umfram/jöfnun/tóman reit, dirty-confirm vörn,
4/10/0/brot/neikvætt magn-snið, ISK/EUR, íslensku/ensku og mjög stórar
nákvæmar fjárhæðir. Formatter heldur centum og birtir ekki 10 sem 1.

## Design.md

Núverandi canonical input-classes og decimal-keyboard haldast, engin breyting
á font-size eða zoom-hömlum. Mismunur hefur aria-live=polite, textabrot og
min-h-6 til að halda lágmarkshæð skilaboðasvæðis. Mobile þarf sjónræna prófun.

## Localhost checks for Stebbi

Á localhost:3004/auth-mvp/splitta-reikningnum, opna eigið synthetic splitt
í yfirferð. Engin endurræsing eða SQL þarf. Endurhlaða síðu eftir að vista
það sem á að varðveita; reload getur tapað óvistuðum reitum.

1. Staðfestu að magn sé 4 og 1, en ekki 4.000/1.000. Heilar fjárhæðir
   eiga að vera 48/16/13 og núll 0.
2. Í prófsplitti með heild 20 og línu 16 sést að 4 EUR vantar.
   Breyttu línu í 20.5: 0,5 EUR umfram á íslensku. Breyttu í 20: enginn
   mismunur. Staðfesting helst óvirk þar til vistað er.
3. Prófaðu 4.01 og 1.25 í viðeigandi reitum; gild brot haldast eftir vistun.
   Tómur reitur sýnir ekki reiknaða vöntun sem gæti verið röng.
4. Prófaðu ISK án aukastafa og EUR með centum, pillusamantekt og eigin
   magn í skiptingu. Athuga sérstaklega 10 einingar og núll eftirstöðvar.
5. Við 360/390/460px með keyboard: enginn overflow/zoom, skilaboð læsileg.

Nota eigin synthetic gögn; vistun fer í tengdan Supabase. Ekki breyta
raunverulegum upphæðum til prófunar. Ekkert SQL er til keyrslu.

## Viðmið og eftirstandandi

Intl.NumberFormat notar ISO 4217 minor-unit upplýsingar:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat
Nákvæmni geymslu er áfram núverandi explicit gjaldmiðlasamningur appsins.
Engin global breyting á öðrum Teskeiðum. Næsta skref er localhost-rýni
Stebba og áframhald tveggja notenda runtime-prófunar.
