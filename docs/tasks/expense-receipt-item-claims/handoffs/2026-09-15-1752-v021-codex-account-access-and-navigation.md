# v021 — Teskeiðarinnskráning og leiðrétting rangrar ÚL-leiðar

Created: 2026-09-15 17:52 Atlantic/Reykjavik (clock tool).
Task: expense-receipt-item-claims. Writer: Codex.
Candidate: C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.
Base: 57a57d33c093a89ef38dd087acfa2b789897435d.

## Niðurstaða og gildandi framhald

Stebbi hefur ákveðið að viðtakendur deilihlekks skrái sig inn með
Teskeiðarnotanda, án ÚL-aðgangskröfu. Aðgangsspurning v020 er því leyst.
Ekki biðja aftur um þetta val. Gestakóðaleið verður ekki útfærð.

Rangur ÚL-hlekkur á standalone-yfirferðarsíðu hefur verið fjarlægður úr
candidate. Þetta afhendir ekki nýja skiptingarskjáinn eða deilihlekk.
Sjálfstæði kjarninn, aðild og UI eru áfram ólokin framkvæmd innan gildandi umboðs.
Þetta er stöðuhandoff, ekki ný samþykkisgátt fyrir áframhald.

**NEI — EKKI KEYRA SQL NÚNA.** SQL181 er áfram ókeyrt DRAFT HOLD;
það byggir á Expense-private-drafts og uppfyllir ekki sjálfstæða gagnasamninginn.

## Breytingar á verkefnalýsingu

1. Skipt út opinni aðgangsspurningu fyrir orðrétta ákvörðun Stebba:
   „Þeir verða að skrá sig inn með Teskeiðarnotanda... höfum það þannig“.
2. Skráð að enginn gestakóði eða ÚL-aðgangur sé skilyrði/leið fyrir þátttakendur.
3. Skýrð mörk: innskráning sannar notanda; gild hlekkjaaðild veitir aðeins
   aðgang að einu splitti. Server bindur aðild og eigin claims við notandann.
4. Skráð endurkoma í rétt splitt eftir innskráningu.
5. Fjarlægt STOP við aðgangsákvörðun og skráð heimilt framhald.
6. Skráð raunveruleg candidate-staða: röng ÚL-navigation fjarlægð, en
   undirliggjandi standalone gögn og flæði enn ólokin. Eldri opinn ÚL-tabbi
   færist ekki sjálfkrafa á nýja slóð.
7. Uppfærð latest-handoff vísun, framkvæmdarröð og prófunarsönnun.

JSON án myndar, sérskref núllkrónulína, 1 af 4 espresso, generic pillusíun
og frestun ÚL halda óbreytt gildi. Eldri handoff eru óbreytt saga.

## Framkvæmt og skrár breyttar

- app/auth-mvp/splitta-reikningnum/[draftId]/page.tsx:
  fjarlægt manageHref inn á /auth-mvp/utlagt-og-endurgreitt/nytt?draft=.
- lib/__tests__/expense-receipt-server.test.ts:
  navigation-contract hafnar þessum ÚL-hlekk í standalone-review route.
- docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md:
  breytingarnar að ofan.
- Þetta handoff.

Engin breyting á sameiginlega ExpenseReceiptSplitPanel eða eldri Expense-formum.
Núverandi auth-vörðum var ekki breytt án samsvarandi gagnasamnings.
Það er enn útfærsluvinna að fjarlægja ÚL-dependency úr standalone guard,
launcher visibility, RPC og persistence. Ekki merkja það fullgert.

## Rýnt og prófað

Lesið: shared WORKFLOW.md, Design.md canonical pill/identity kaflar,
standalone review route, receipt panel/server/actions/schema/guard,
launcher.server.ts, featureRollout.server.ts, server-próf, canonical task
og v020. Eldri v001–v018 höfðu verið lesin í fyrri samhengisendurheimt.

- npm.cmd run test:run -- expense-receipt-server: 8/8 PASS, exit 0.
- npm.cmd run type-check: PASS, exit 0.
- GoLive get á exact issue/project: HTTP 200, exit 0.
- GoLive description update á sama issue/project: HTTP 200, exit 0,
  updated_at 2026-09-15T17:54:10.134372+00:00. Lýsir tekinni aðgangsákvörðun,
  afmarkaðri navigation-leiðréttingu og óloknu standalone-flæði; vísar á v021.
  Status in_progress og priority medium voru óbreytt.
- Afmarkað git -c core.safecrlf=false diff --check: exit 0. Receipt-skrár
  geta verið untracked miðað við base; próf og bein skráarlesning eru aðalsönnun.
- Ein greiningarlesning reyndi lib/teskeid/guard.ts sem var ekki til;
  rg fann rétta guardTeskeidSession í lib/auth/guard.ts. Engin mutation.
- Full build eða browser-próf voru ekki keyrð fyrir þessa prop-fjarlægingu.
  Dev server er í höndum Stebba; engin SQL-keyrsla, commit, push eða deploy.

Design.md: fjarlægður rangur navigation-control; canonical inputs, loaders
og pilluhluti eru óbreytt. Nýtt board þarf áfram 16px input, touch targets,
pending/error feedback, canonical fjölval og mobile overflow/focus-prófun.

## Næsta framkvæmd

1. Festa session-bound standalone split/member/claim/invite samning sem
   krefst Teskeiðarinnskráningar en engra Expense-töfluheimilda eða greiðanda.
2. Útfæra sjálfstæða vistun, review/confirm, deilihlekk og þátttöku.
   Engar sjálfvirkar skuldir eða yfirfærsla í ÚL.
3. Útfæra sjónræna hlutdeild og TeskeidMultiSelectPillFilter samantektir.
4. Samræma launcher og routes við nýjan aðgang, prófa auth, samtímis claims,
   idempotency, magn/fjárhæðir og varðveislu núllkrónulína.
5. Fullrýna SQL-pakka áður en Stebbi fær næsta handvirka SQL-gate.

## Localhost checks for Stebbi

Aðeins navigation-leiðréttingin er tilbúin til afmarkaðrar skoðunar.
Í sama candidate á staðfestu localhost:3004, með núverandi innskráningu og
eigin eldri kvittunardrög sem virkuðu fyrir breytinguna:

1. Farðu á /auth-mvp/splitta-reikningnum/<draftId> með ID úr eigin kvittun.
2. Skoðaðu yfirferðina. Hlekkur yfir í ÚL til að velja fólk á ekki að sjást.
3. Ekki nota eldri opna /auth-mvp/utlagt-og-endurgreitt/nytt-síðuna sem
   sönnun fyrir nýju splitti; sú síða er áfram sjálfstætt Expense-flæði.

Ekki prófa nýja JSON-only vistun gegn óuppsettu SQL181 eða vænta deilihlekks
og standalone-þátttöku enn. Engin þörf á að vista, eyða, bjóða fólki eða
stofna fjárhagsfærslu fyrir þetta sjónræna check. Öll end-to-end acceptance
fyrir nýja flæðið bíður samræmdrar app/schema-afhendingar.
