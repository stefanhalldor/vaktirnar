# v041 — review-staðfesting og release-undirbúningur

Created: 2026-09-16 08:47 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Niðurstaða og current gate

Beðnar lokabreytingar eru útfærðar. `Á kvittun` er beinn editable reitur í
review. Þegar gildið breytist birtist afmörkuð vistun þess. Í sharing er sama
eldra toggle áfram en heitir nú `Breyta heildarfjárhæð`.

Sérstakur `Vista yfirferð` hnappur er horfinn. `Staðfesta og fara í skiptingu`
kallar nýja application-level `confirm_review`: hún vistar review með client
request ID, les authoritative nýtt version og staðfestir síðan. Ef svar tapast
eftir fyrra skref getur sama request replay-að save án tvíverknaðar; ef split er
þegar sharing lýkur retry sem success. SQL184 boundary og ACL eru óbreytt.

Release-undirbúningur er kominn að raunverulegu stoppi: focused task gates eru
græn, en full repo suite er ekki græn og nýja UI þarf lokastaðfestingu Stebba á
localhost. Enginn commit, push eða deploy var framkvæmdur.

## Skrár skoðaðar og breyttar

Skoðað: `WORKFLOW.md`, `AGENTS.md`, `Design.md`, canonical task, v040 handoff,
`SplitBoardV2`, actions/server/contracts, SQL184 command/idempotency/version
ordering og viðeigandi UI/action tests.

Breytt í v041:

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `lib/receipt-split/actions.ts`
- `lib/__tests__/standalone-receipt-actions.test.ts`
- `messages/is.json`, `messages/en.json`
- canonical task document og þetta handoff

## Prófanir og release evidence

- Focused v2 UI + actions: 2 skrár, 19/19 PASS, exit 0.
- `npm.cmd run type-check` → PASS, exit 0.
- Afmarkað lint á fjórum v041 TS/TSX-skrám → PASS, exit 0; aðeins Next lint
  deprecation notice.
- Afmarkað `git diff --check` → PASS; line-ending warnings á translation files.
- Full `npm.cmd run test:run` → **exit 1** eftir 173 sekúndur:
  560 files PASS, 3 skipped; 8017 tests PASS, 57 skipped, 8 todo.
  Fimm release-gate failures voru utan þessa task-scope:
  1. `curated-route-real-artifact.test.ts` vantar
     `.tmp/phase2-road-source/official-source.json` (96 MB release artifact).
  2. Fjögur `lib/bookings/__tests__/api-routes.test.ts` create/rate-limit próf
     fá `400 invalid_input` í stað 201/429.

Fyrsta type-check eftir nýju orchestration fann eina destructuring-narrowing
villu í `actions.ts`; branching var fært fyrir destructuring og endurkeyrsla
stóðst. Engin runtime-villa var falin eða sleppt.

Ekkert SQL var skrifað/keyrt. Enginn build var keyrður því Stebbi keyrir dev
server og build getur truflað sameiginlegt `.next`. Engin provider-köll,
commit, push, merge eða deploy.

## Findings og áhætta

### Release-blocking gates

1. Full repo suite er rauð vegna fjögurra booking-prófa og missing curated-route
   artifact. Þau tengjast ekki breyttum receipt files, en workflow má ekki kalla
   production-candidate fullgrænan fyrr en þau eru baseline-uð eða lagfærð.
2. Stebbi þarf að sannreyna inline total og sameinaða staðfestingu gegn installed
   SQL184 á localhost. Static mocks sanna RPC-röð en ekki raunverulegt DB runtime.

### Task-rýni

Engin blocking finding fannst í v041 task-diff. Confirm orchestration treystir á
SQL184 request ledger fyrir idempotent `save_review`, les version eftir write og
sendir actor aðeins úr server session. RLS/ACL, service boundary, Expense/ÚL og
gagnalíkan voru ekki víkkuð.

## Breytingar á verkefnalýsingu

- Skráð inline `Á kvittun` í review og nýtt sharing-heiti.
- Skráð að confirm visti review sjálfkrafa með retry-safe server orchestration.
- Bætt v041 evidence og full-suite release blockers við breytingasögu.
- Current gate færð úr almennri localhost-prófun í lokapróf + afgreiðslu
  repo-wide release gates; ekkert SQL er næst.

## Localhost checks for Stebbi

Á `http://localhost:3004/auth-mvp/splitta-reikningnum`, innskráður og með eigin
synthetic splitti:

1. Í review: staðfestu að `Á kvittun` sé strax editable og að enginn
   `Leiðrétta kvittunarheild` eða `Vista yfirferð` hnappur sjáist. Breyttu
   heildinni, vistaðu inline og sjáðu mismatch uppfærast.
2. Ýttu beint á `Staðfesta og fara í skiptingu` þegar review er ekki áður merkt
   vistað. Vænt: ein pending-aðgerð, síðan sharing með deilihlekk; engin conflict-
   villa eða þörf á öðrum smelli.
3. Í sharing: staðfestu `Breyta heildarfjárhæð`, opnaðu/breyttu/vistaðu og sjáðu
   að claim UI, brot, pills og Eftir/Búið séu áfram eins og áður. Prófaðu einnig
   360–390px án zoom/overflow.

Nota aðeins eigin/synthetic gögn. **Ekki keyra SQL.** Eftir PASS þarf að afgreiða
full-suite blockerana áður en production deploy er samþykkt. Commit/push/deploy
krefjast áfram sérstakrar lokaheimildar samkvæmt workflow.
