# Sjálfstætt splitt: JSON án myndar, deilihlekkur og sjónræn skipting

Created: 2026-09-15 17:01
Timezone: Atlantic/Reykjavik
Task: expense-receipt-item-claims
GoLive issue: 516ec885-9521-4d84-8350-9219ac829695
Candidate: C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2
Base: 57a57d33c093a89ef38dd087acfa2b789897435d

## Findings fyrst og raunverulegt stopp

**STOP: product/security ákvörðun um auðkenningu viðtakanda deilihlekks.**
Nýtt standalone splitt er ekki útfært eða release-ready. Næsta eina ákvörðun
er hvort viðtakandi auðkennir sig sem gestur án Teskeið-reiknings eða með
Teskeið-innskráningu án ÚL-aðgangskröfu. Spurning var send Stebba og er enn
ósvarað við þetta handoff. Eftir svar heldur samþykkt staðbundin vinna áfram.

**NEI — EKKI KEYRA SQL NÚNA.** SQL181 er ókeyrður Expense-bound candidate og
DRAFT HOLD. Hann er ekki rétti gagnasamningurinn fyrir nýja standalone scope.
SQL179/180 eru ekki endurkeyrð. Engin commit/push/deploy framkvæmd eða heimild.

Helstu niðurstöður:
- JSON-only er fyrri krafa Stebba sem canonical skjal hafði ranglega haldið
  myndaskilyrði á. Codex viðurkenndi og leiðrétti skráninguna.
- Núverandi UI stöðvaði á myndavalidation áður en server request var send.
  Villan birtist ofar á skjánum. Stebbi staðfesti villuna með skjámynd.
- Að færa villu að takka er ekki lausn á JSON-only kröfunni.
- Núverandi route/guard og undirliggjandi gagnasamningur krefjast ÚL og leiða
  áfram á greiðandaskref. Þetta samræmist ekki nýju standalone-kjarnakröfunni.

## Samþykkt mannamálsniðurstaða

Myndgreining eða JSON án myndar → yfirferð (þ.m.t. núllkrónulínur) →
staðfestur innlestur → afritanlegur deilihlekkur → fólk tekur til sín hluti.

Dæmi Stebba: 4 espresso, þátttakandi tekur 1, nafn hans sést á þeim hluta og
3 eru eftir. Efst eru participant-pillur með samantekt sem sía reikninginn
á viðkomandi aðila. Canonical generic toggle/clear/fjölval er endurnýtt.

Kjarnasplittið spyr ekki „Hver borgaði?“, krefst ekki ÚL og stofnar engar skuldir.
ÚL-tenging er frestuð. Síðar getur eigið valkvætt flæði átt við þegar einhver
greiðir raunverulega fyrir annan; það verður aðeins sýnilegt með ÚL-flaggi.

## Breytingar á verkefnalýsingu

Canonical skjalið var endurskrifað til að geyma einn gildandi samning:
1. **Leiðrétt markmið:** JSON eitt og sér nægir; myndahleðsla er ekki forsenda.
2. **Fjarlægð röng myndakrafa:** eldri fullyrðing um mandatory private upload í
   manual-first leið var tekin úr gildandi product-samningi.
3. **Bætt við standalone-kjarna:** aðgreind yfirferð, staðfesting innlestrar,
   deiling, participant claims, sjónræn magnbirting og varanleg endurkoma.
4. **Bætt við nákvæmu espresso-dæmi:** 1 af 4, nafn á úthlutun og 3 eftir.
5. **Bætt við pillusamantekt:** canonical TeskeidMultiSelectPillFilter,
   fjölval með OR og hreinsun síu; engin ný sérgerð af generic hegðun.
6. **ÚL sett í bið:** greiðandaskref, ledger/finalizer og Expense-entitlement
   eru ekki hluti sjálfstæða splittsins. Framtíðaraðgerð aðeins með ÚL-flaggi.
7. **Varðveitt zero-total ákvörðun:** línur haldast í sér yfirferð og hægt er
   að fylla inn jákvæða fjárhæð; engin sjálfvirk slepping/eyðing.
8. **Uppfært current gate:** aðgangsákvörðun kemur á undan nýju gagnalíkani;
   SQL181 merkt HOLD og gamla localhost-gateið tekið úr virkum næstu skrefum.
9. **Skýrð acceptance:** án myndar, án ÚL, deilihlekkur, samtímis claims,
   pillusíun, refresh, privacy og mobile.
10. **Skráð handoff-regla Stebba:** hver afhending telur nákvæmlega upp
    breytingar á verkefnalýsingu. Gamlar afhendingar eru óbreyttar saga.
11. **Hreinsuð mótsögn:** eldri gates/product texti er ekki lengur hafður sem
    samhliða gildandi fyrirmæli. SQL179/180 evidence er merkt sögulegt.

Canonical skjal:
[expense-receipt-item-claims.md](../expense-receipt-item-claims.md)

## Hvað var gert í candidate áður en scope þróaðist

- Villu frá parent-upload flæði komið fyrir við manual submit með
  externalError; false callback fær fallback-villu og pending helst við navigation.
- Ný action createExpenseReceiptFromJson með strict input/text parsing,
  session-derived actor/name og einu nýju atomic RPC.
- JSON-submit hættir að kalla prepare/upload/provider. Request/draft IDs eru
  varðveitt fyrir endurtekna tilraun með sama texta í sama opna formi.
- Aðgreind invalid JSON villa og almenn save-villa; engin private villugögn
  eru birt eða logguð.
- IS/EN hjálpartexti segir skýrt að mynd sé óþörf.
- Ný RPC/DDL/operator artifacts fyrir SQL181 voru skrifuð, en aldrei keyrð.
  Þau breyta metadata-lifecycle fyrir JSON og nota enn Expense-private-drafts.
  Þegar Stebbi afmarkaði standalone-kjarnann var þessi leið sett í HOLD.

Þessi app-kóði er staðbundinn undirbúningur, ekki uppsett virkni: SQL181 RPC
er ekki til í Production og candidate má ekki kynna sem nothæft standalone
splitt. Ekki prófa nýja JSON-action gegn Production fyrr en samræmd schema-
og app-gátt er afhent. Fyrirliggjandi image-recovery action er varðveitt.

## Skrár breyttar í þessum hring

Product/test:
- components/expenses/ExpenseReceiptManualImport.tsx
- components/expenses/ExpenseReceiptUpload.tsx
- components/expenses/__tests__/expense-receipt-upload.test.tsx
- lib/expenses/receipt-actions.ts
- lib/expenses/receipt-split.ts
- lib/__tests__/expense-receipt-manual-action.test.ts
- lib/__tests__/expense-receipt-server.test.ts
- messages/is.json
- messages/en.json

Ókeyrð HOLD artifacts:
- sql/181_expense_receipt_json_drafts.sql
- sql/validation/181-expense-receipt-json-drafts/preflight.sql
- sql/validation/181-expense-receipt-json-drafts/postflight.sql
- sql/validation/181-expense-receipt-json-drafts/README.md

Skjöl:
- docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md
- þetta v020 handoff

Ignored local generation scratch: .tmp/sql181-build/body.txt og generate.py.
Þau eru ekki release artifacts og generator á ekki að endurkeyra yfir HOLD
merkingar. Aðalvinnumöppu, dependency skrám, dev server og secrets var ekki breytt.

## Greining og endurnýting

Lesið: receipt upload/manual/actions/server/schema/tests, SQL179 töflur og
image/delete lifecycle, SQL180 zero-total functions/operator, SQL96 request
idempotency helpers, SQL168 private-draft save, canonical Design-kaflar,
TeskeidMultiSelectPillFilter og próf þess, PrioritizedTaskList notkun,
EventGuestBrowser og Booking GuestAccessExchange.

Niðurstaða:
- Pillurnar eru þegar canonical og notaðar í heimilisverkum. Ekki smíða
  nýtt toggle/filter kerfi fyrir Splitta reikningnum.
- EventGuestBrowser er fyrst og fremst person-source UI, ekki gestainnskráning.
- Booking GuestAccessExchange sýnir fragment-token til bounded session exchange,
  en það er request-scoped lestrarsamningur, ekki tilbúin sameiginleg claim-heimild.
  Ekki afrita hann sem óyfirfarinn participant-auth samning.
- Receipt quantity/rounding/JSON logic má endurnýta, en Expense identity,
  publication, payer og finalizer mega ekki verða ósýnileg ÚL-skilyrði.
- Design.md krefst mobile 16px input, canonical loading, pending/error
  feedback og minnst 40px touch targets. Ný board-útfærsla bíður nú rétta
  standalone identity/state contractins.

## Skipanir og niðurstöður

- Fyrri targeted error-feedback keyrsla: 45/45 PASS; type-check PASS.
- Fyrsta JSON-only keyrsla: 49 PASS, 3 FAIL. Föllin sýndu að Zod-validation
  villur voru ranglega flokkaðar sem save_failed. Nýja JSON-action lagfærð til
  að skila invalid_input fyrir ZodError án private details.
- Lokakeyrsla:
  npm.cmd run test:run -- expense-receipt expense-sql180-zero-total-review
  → 6 skrár, 52/52 PASS, exit 0.
- npm.cmd run type-check → exit 0.
- git -c core.safecrlf=false diff --check → exit 0.
- Python launcher alias var óaðgengilegur; staðfestur Python312 executable
  keyrði local artifact generator, exit 0. Generator skrifar skrár og keyrir
  aldrei SQL.
- Full build/suite og full SQL181 lokarýni voru ekki keyrð eftir standalone
  scope-breytingu. Ekki eyða prófunarvinnu í óbreytta útgáfuleið sem er nú HOLD.
- Ekkert SQL, browser mutation, provider-kall, commit, push eða deploy.

52 PASS eru app/mock/static sönnun eingöngu. Engin fullyrðing um SQL181
runtime, concurrency, standalone auth eða end-to-end notkun.

## Framhald eftir aðgangsákvörðun

1. Festa hvernig deilihlekkur leiðir í samþykkta, varanlega þátttöku.
2. Skilgreina sjálfstæð split/line/participant/claim gögn og concurrency-gates,
   endurnýta quantity/rounding og generic UI primitives.
3. Byggja innlestur/yfirferð/deilingu og board sem krefst ekki ÚL.
4. Útfæra participant pills og sjónræna einingaúthlutun með server confirmation.
5. Fullrýna og prófa. Handvirkt SQL hjá Stebba er áfram sérstakt næsta gate.
   Ekki útfæra ÚL-yfirfærsluna í þessum áfanga.

## Localhost checks for Stebbi

Ekki prófa SQL181/eldra JSON-submit núna; gagnasamningur og app eru ósamræmd
við nýtt standalone scope. Engin SQL-keyrsla er næsta aðgerð.

Eftir nýtt reviewed gate á checklist að prófa:
- gilt JSON án myndar og strict höfnun ógilds svars;
- varðveislu og fjárhæðarfyllingu núllkrónulína;
- staðfestingu innlestrar sem gefur hlekk án greiðandaspurningar;
- samþykktan viðtakanda án ÚL sem tekur 1 espresso af 4, nafn og 3 eftir;
- tvo þátttakendur sem reyna samtímis að taka síðasta eintakið;
- pillusíun, fjölval, hreinsun, refresh og rétta summu/magn hvers aðila;
- óviðkomandi aðgang og mobile focus/keyboard/overflow.

Notið synthetic/eigin prófsgögn og samþykkjandi þátttakendur. Engin raunveruleg
fjárhagsfærsla, eyðing eða sending boða af agent án sérstaks scopes. Stebbi
stýrir localhost og sends deilihlekk sjálfur.

## Óvissa

### Samræming við GoLive

Canonical repo-skjal og GoLive-lýsing voru bæði uppfærð. GoLive update á
exact issue/project skilaði exit 0 / HTTP 200 kl. 17:02 UTC og svarinu fylgdi
nýja lýsingin með standalone-scope, JSON án myndar, pillum, frestun ÚL,
SQL181 HOLD og vísun á þetta v020. Status var áfram in_progress og priority
medium; þeim reitum var ekki breytt. Engin önnur external write fór fram.

High confidence um röngu myndakröfuna og núverandi ÚL-tengingar.
Aðgangsleið viðtakanda er enn opin og ræður nýju schema/security scope.
Handoffið er product/architecture stopp með varðveittum undirbúningi,
ekki fullgerð standalone útfærsla.
