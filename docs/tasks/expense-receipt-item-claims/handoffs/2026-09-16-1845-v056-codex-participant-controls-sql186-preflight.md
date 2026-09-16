# Þátttakendastýring og SQL186 preflight

Date: 2026-09-16 18:45
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`

## Plan áfangans

Útfæra deilihlekkjaupplifun, endurkomulista, nákvæmari skiptingarstýringar,
persónulegt „Ekki mitt“, QR-deilingu og staðbundinn gengisreikni. Stöðva við
read-only SQL186 preflight samkvæmt WORKFLOW.md.

## Hvað var raunverulega gert

- Deilihlekkur forskoðar aðeins reikningsheiti og biður um samþykki áður en
  aðild er stofnuð. Innskráningarleið varðveitir ásetning og opnar splittið eftir
  innskráningu.
- Reikningalisti sýnir dagsetningu fyrir sharing-reikninga sem notandi á eða
  hefur tekið þátt í.
- Þátttakendasía varðveitir alla meðeigendur á sýnilegum lið.
- Útistandandi/Afgreitt pillur, fjölda- og hlutfallsinnsláttur, „Ég tek
  restina“ og user-bound „Ekki mitt“ skúffa voru útfærð.
- Manual AI-samningur biður um skýringu ásamt nákvæmu kvittunarheiti.
- QR-kóði er myndaður í browser úr núverandi deilihlekk með `qrcode@1.5.4`.
- Valfrjáls gengisreiknir reiknar samantektir nákvæmlega milli minor-unit sniða.
  Hann vistar hvorki gengi né breytir reikningnum.
- SQL186, preflight, postflight og operator-runbook voru skrifuð en ekki keyrð.
- GoLive-undirliður `expense-receipt-participant-controls`
  (`fa8b49d9-3d10-4e1c-977d-4454d86b36a5`) var stofnaður í `in_progress` og
  tengdur aðalmiðannum.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `AGENTS.md`, `Design.md`
- Canonical verkefnalýsing og fyrri handoff v032-v055
- Núverandi v2 actions, server, contracts, view, summary og UI-próf
- SQL184/185 og validation-mynstur

## Skrár sem voru breyttar

- `app/auth-mvp/splitta-reikningnum/page.tsx`
- `components/receipt-split/SplitBoardV2.tsx`, `SplitJoin.tsx` og UI-próf þeirra
- `lib/receipt-split/actions.ts`, `contracts.ts`, `exchange.ts`, `quantity-v2.ts`,
  `server.ts`, `session-v2.ts`, `view-v2.ts` og tengd próf
- `messages/is.json`, `messages/en.json`
- `package.json`, `package-lock.json`
- `scripts/check-receipt-split-v2-sql.py`
- `sql/186_receipt_split_participant_controls.sql`
- `sql/validation/186-receipt-split-participant-controls/*`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run type-check`: PASS, exit 0.
- Fimm focused Vitest skrár: 48/48 PASS, exit 0.
- Eftir gengis-UI próf: tvær focused skrár, 15/15 PASS, exit 0.
- Scoped ESLint á breyttum runtime-skrám: PASS, exit 0.
- `npm.cmd run build`: PASS, exit 0; aðeins fyrirliggjandi warnings utan scope.
- GoLive create: HTTP 201, undirliður stofnaður og parent-tenging staðfest.
- Locale JSON parse: PASS.
- Frozen SHA-256: migration `308D3DE6C04EB62E75BB52B735931CBA431961303606F81200DB6745FB1155B3`,
  preflight `C5139071BA65D19504D26F9C94B18AA5459832EE2270E889A767C2CA5FF88FA3`,
  postflight `956CA0DD0987A8FBBDEC1436BEAEBFB048FD3F686EA370F9B16CB3E3EA1C8379`.
- Python SQL-parser var ekki keyrður: Windows Store `python.exe` var óaðgengilegur
  og `py` launcher er ekki uppsettur. Þetta er tooling-gap, ekki parser-fall.

## Hvað mistókst eða var sleppt

SQL-parsergáttin gat ekki ræst vegna Python-uppsetningar vélarinnar. SQL186 var
ekki keyrt, localhost-server var ekki ræstur og engin commit/push/deploy eða
production-breyting var framkvæmd.

## Ákvarðanir

- `1/7` er námundað sýnilega að næstu 1/3000 einingu og UI sýnir normaliserað
  hlutfall/magn. Engin falin námundun eða global claim-migration.
- „Ekki mitt“ er user+split+item state og aldrei sameiginleg staða.
- QR og gengi eru eingöngu client-side. Enginn þriðji aðili fær hlekk eða
  fjárhagsgögn og enginn rekstrarkostnaður bætist við.
- Upprunaleg mynt er authoritative. Gengisreiknirinn er tímabundin áætlun.

## Áhætta sem er enn til staðar

SQL186 verður að standast handvirkt preflight, migration og exact postflight áður
en app-candidate er prófaður. Bearer-forskoðun skilar aðeins heiti virks reiknings;
deilihlekkurinn er áfram leyndarmál sem eigandi stjórnar. Browserpróf þarf að
staðfesta innskráningarendurkomu, mobile layout, QR og samtímis claim/dismiss.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins
`sql/validation/186-receipt-split-participant-controls/preflight.sql`.
Halda aðeins áfram ef ein röð skilar `operator_state=READY` og öll boolean-gildi
eru `true`. Migration er ekki afhent til keyrslu fyrr en sú actual niðurstaða
hefur verið skráð og artifact-bytes endurstaðfest.

## Spurningar fyrir rýni

Engin product-ákvörðun er opin. Rýni á næsta stigi á að einblína á actual
catalog-forverann og hvort öll SQL186 targets séu sannarlega absent.

## Supabase-áhrif

SQL186 er aðeins skrifað. Það bætir við private forced-RLS töflu fyrir
persónulegt „Ekki mitt“, service-only titilforskoðun, actor-bound idempotent
dismiss-aðgerð, v2 read projection með dagsetningu og dismissal IDs og private
trigger sem hreinsar stale dismissal þegar sami notandi tekur magn. Engar client
policies, engin ÚL-tenging og engin breyting á fyrirliggjandi röðum.

## Breytingar á verkefnalýsingu

Canonical lýsing var uppfærð með product-óskum Stebba, leiðréttingu á user-bound
„Ekki mitt“, QR-deilingu og valfrjálsum staðbundnum gengisreikni. Current gate
var fært yfir í ókeyrt SQL186 preflight. ÚL er áfram frestað.

## Localhost checks for Stebbi

Ekki prófa candidate á localhost fyrr en SQL186 migration og exact postflight
hafa staðist. Eftir það:

1. Opna deilihlekk bæði innskráður og óinnskráður; samþykkja og lenda beint í
   splittinu eftir innskráningu.
2. Fara á `/auth-mvp/splitta-reikningnum`; opna þátttökureikning með dagsetningu.
3. Sía á einn þátttakanda og staðfesta að allir meðeigendur sömu liða sjáist.
4. Vista `1/7`, `10%` og fjölda; sjá samræmt normaliserað magn og hlutfall.
5. Prófa stöðupillur, „Ég tek restina“ og persónulegu „Ekki mitt“ skúffuna.
6. Sýna QR, skanna með öðru tæki og staðfesta sama þátttökuskjá.
7. Velja ISK í gengisreikni og slá `150` fyrir EUR. Endurhleðsla á ekki að
   varðveita gengið.
8. Prófa 360px breidd: enginn zoom, láréttur overflow eða dauð navigation.

Notið aðeins synthetic/eigin gögn og samþykkjandi prófnotendur. Ekki keyra
production-próf, kvittunarmyndgreiningu eða migration án sérstakrar gáttar.
