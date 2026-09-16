# v037 — SQL184 exact og live v2 localhost-candidate

Created: 2026-09-16 07:50 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Mannamál og current gate

SQL184 er nákvæmlega uppsett. Stebbi skilaði actual postflight með
`EXACT_INSTALLED` og öllum sjö vörnum true. Codex hélt sjálfkrafa áfram í
heimilaðan application cutover. Raunverulega Splitta reikningnum detail-síðan
notar nú scale3000, exact brot, tvær heildir, owner-edit/add, liðaskýringar,
Eftir/Búið og participant pills. JSON, myndlestur, legacy-afritun og join fara
líka inn um versioned v2 boundary.

Næsta raunverulega workflow-gátt er innskráð localhost-prófun Stebba. Agent
hefur enga browser-session eða samþykktan annan Teskeiðarnotanda og getur því
ekki sannað raunverulega service-role/RPC virkni eða tveggja notenda samvinnu.

**NEI — EKKI KEYRA MEIRA SQL NÚNA.** Ekki endurkeyra SQL182/183/184.

## Actual SQL184 postflight

| gate | result |
| --- | --- |
| operator_state | EXACT_INSTALLED |
| seal_ok | true |
| functions_ok | true |
| tables_ok | true |
| no_client_policies | true |
| schema_private | true |
| tables_private | true |
| bucket_ok | true |

Þetta staðfestir exact body/ACL/catalog seal og private schema/table boundary.
Það sannar ekki browser/runtime concurrency eitt og sér.

## Raunverulegar application-breytingar

- `readSplit` kallar `receipt_split_read_v2` og strict `splitViewV2Schema`.
  Listinn getur áfram notað quantity-laust v1 list response.
- Ný `SplitBoardV2` er tengd detail-route. Hún sýnir receipt reference, line sum
  og vöntun/umfram aðskilið. Mismatch hindrar hvorki save-review né confirm.
- Exact ¼/⅓/½/1 presets, stepper og arbitrary exact input nota scale3000.
  Preset setur eigið heildarmagn; það leggst ekki sjálfkrafa við.
- Claim sendir item revision + previous own units. Whole-split version er ekki
  notað á claim, svo óskyldir aðilar geta unnið eftir röðun parent locks.
- Fullskiptir liðir fara í lokaða Búið-skúffu; partial/óskiptir eru í Eftir.
  Participant filter birtir viðkomandi liði utan lokaðrar skúffu.
- Focus/óvistað custom magn eða owner edit pinnast í sínum group meðan control
  er opið. Drawer/filter state er client-state og tapast ekki við router refresh.
- Upprunalegt heiti, optional plain-text skýring og review flag birtast.
  Owner getur breytt heiti/skýringu/magni/line total fyrir og eftir sharing.
- Owner getur breytt receipt reference og bætt við lið; hvorugt breytir hinu.
- SQL guards hafna quantity undir total claims og zero-price með claims.
- Sharing sýnir participant pills, totals, unclaimed og deilihlekk. Poll/focus
  refresh er áfram 8 sekúndur; ekkert realtime-push loforð.
- Delete/image/open/rotate nota v2 lifecycle eftir upgrade. Actor kemur aðeins
  úr confirmed server session; browser sendir aldrei actor ID.
- `joinSplit` notar v2. Join á v1 split umbreytir sama split exact undir parent
  lock; v1 stale writer failar síðan lokað.
- Pasted JSON create/apply, provider extraction og authorized legacy copy nota
  feature-local `parseSplitExtractionV2*`. Legacy milli ×3; optional explanation
  varðveitist. Shared Expense extraction/scale1000 var ekki breytt.

## Findings og leiðréttingar í cutover-rýni

1. Fyrsta action-tenging lét create/image/legacy áfram fara í v1. Það hefði
   hvorki vistað explanations né ný exact units. Create/apply/image/legacy voru
   færð á v2 adapter/RPC; provider contract sjálft helst óbreytt.
2. Join þurfti v2; annars hefði nýr þátttakandi fengið `split_upgrade_required`
   á þegar uppfærðu splitti. Join er nú versioned og session-bound.
3. Claim whole-split revision finding úr v034 er áfram leiðrétt: item revision,
   own previous amount og capacity eru notuð; óskyld concurrent claims blokkast ekki.
4. Delete með enga image path þurfti samt complete_delete. V2 action framkvæmir
   nú completion hvort sem blob-path er til eða ekki; storage remove aðeins ef path.

Engin blocking static finding er eftir. Runtime authenticated test er ólokið gate.

## Skrár breyttar í cutover

- `app/auth-mvp/splitta-reikningnum/[draftId]/page.tsx`
- `components/receipt-split/SplitBoardV2.tsx` (ný)
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx` (ný)
- `lib/receipt-split/server.ts`
- `lib/receipt-split/actions.ts`
- `lib/__tests__/standalone-receipt-actions.test.ts`
- canonical task document, SQL184 README og þetta handoff.

Preview/v2 contract/SQL skrár frá v033–v036 eru áfram hluti candidate. Gamli
`SplitBoard.tsx` er varðveittur tímabundið fyrir eldri component regression tests
en er ekki lengur importaður af live detail-route. Engar unrelated dirty skrár
voru afturkallaðar.

## Prófanir og evidence

- Actual SQL184 postflight: `EXACT_INSTALLED`, 7/7 booleans true.
- `npm.cmd run test:run -- middleware.test standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter` → 24 files, 307 tests PASS, exit 0.
- Focused live action/UI/v2 run eftir síðustu breytingar → 6 files,
  35 tests PASS, exit 0.
- `npm.cmd run type-check` → PASS, exit 0.
- Afmarkað lint á live v2 board/actions/server/tests → PASS, exit 0; aðeins
  almenn Next lint deprecation notice.
- `git diff --check` á task scope → PASS. V1 RPC-name scope search skilaði engum
  óvæntum live app/component imports; skipunin endaði 1 vegna no-match eftir PASS.
- Óinnskráð HTTP á localhost:3004:
  list/detail → 307 á innskráningu með exact next, private no-store, noindex,
  nofollow/noarchive, no-referrer og frame/content-type headers.
- Engin full build keyrð til að trufla ekki `.next` dev server Stebba.
- Ekkert SQL keyrt af Codex. Engin provider-köll, commit, push, merge eða deploy.

## Breytingar á verkefnalýsingu

- SQL184 current gate lokað með actual exact postflight og sjö true.
- Current gate færð í innskráð localhost-notendapróf á live v2 route.
- Live application cutover og öll tengd v2 inngöng skráð, ekki aðeins preview.
- Findings um create/image/legacy/join og delete completion skráð með leiðréttingum.
- Evidence uppfært í 307 tests/24 files, type/lint og auth/privacy HTTP.
- Skýrt að ekkert meira SQL eigi að keyra og release bíði localhost/runtime-rýni.

## Localhost checks for Stebbi

Nota localhost:3004, eigin synthetic reikning og innskráðan Teskeiðarnotanda.
Ekki þarf að endurræsa server; hann er í gangi á staðfestum candidate.

1. Opnaðu `/auth-mvp/splitta-reikningnum`, límdu gamla JSON án myndar og stofnaðu
   splitt. Breyttu receipt reference eða einum lið svo mismatch sjáist; vistaðu
   yfirferð og staðfestu þrátt fyrir mismatch. Original name/skýringu á að sjá.
2. Í sharing: taktu ½ og síðan ⅓ af lið, prófaðu mínus/plús og custom input.
   Staðfestu Eftir/Búið og participant pill; breyttu verði/magni sem owner og
   sannreyndu að reference total haldist og claim units varðveitist.
3. Opnaðu deilihlekk í öðrum innskráðum Teskeiðarnotanda ef tiltækur. Takið
   samtímis ólíka liði og reynið síðasta lausa brotið. Engin yfirúthlutun,
   ÚL/Expense færsla eða aðgangur að öðru splitti má myndast.

Við villu: ekki eyða eða endurkeyra SQL. Taka skjámynd/villutexta og halda
reikningnum til greiningar. Nota ekki raunveruleg Production-viðskiptagögn eða
óviðkomandi notanda. Physical mobile/keyboard og skjálesari eru enn gagnleg
regression-próf; headless 360/390/460 preview evidence er í v033.
