# v028 — Viðbótarliðir fyrir og eftir staðfestingu

## Tilbúið og næsta gátt

Sama AddSplitItem-form er komið í yfirferð og skiptingu. Vistun í yfirferð
notar SQL182. Shared-vistun þarf nýtt SQL183 RPC sem er skrifað en ÓKEYRT.
JÁ — STEBBI Á AÐ KEYRA SQL NÚNA: aðeins
sql/validation/183-receipt-split-add-item/preflight.sql.
Vænt READY og öll 10 boolean gates=true. Við PASS heldur Codex áfram
að afhenda exact migration. Engin SQL-keyrsla eða server-stjórnun af Codex.

## Plan, framkvæmd og ákvarðanir

- Sameiginlegt heiti/magn/upphæð form, decimal input, validation, pending og
  villutexti við form. Misheppnuð viðbót heldur input og request UUID.
- Yfirferð: ný lína heldur kvittunarheild, lækkar sýnilega vöntun og fer með
  næstu vistun; staðfesting bíður vistunar.
- Skipting: nýr jákvæður liður er óúthlutaður, heild hækkar um upphæð hans.
  Fyrri IDs, línufjárhæðir og valið magn haldast; samantektir endurreiknast.
- Eingöngu eigandi eftir staðfestingu. Spurt var valfrjálst hvort allir ættu
  að geta bætt við; ekkert svar lá fyrir við útfærslu. Eigandi einn er
  skráð afmörkuð forsenda, ekki fullyrðing um nýja staðfest ákvörðun Stebba.
- Existing tax/tip/discount allocation getur færst við nýtt grunnverð;
  engin loforð um að allar lokasamantektir haldist óbreyttar.
- Engin version-krafa á append: óháðar viðbætur mega gerast samtímis.
  Parent row lock ver total/ordinal/limit; request-lock/hash ver retry.
- Hámark 100 línur, magn 1..1000000 milli, jákvæð fjárhæð <= safe integer,
  heild <= safe integer. Shared heild þarf að stemma áður en bætt er við.

## SQL183

Eitt nýtt public.receipt_split_add_item_v1(uuid,uuid,uuid,jsonb), service-only
SECURITY DEFINER, postgres-owned, search_path tómt. Staðfestur session-actor
og eigandi/sharing/membership eru athuguð. Request journal geymir hash og ID,
ekki hráa lýsingu. Engin tables/policies, elder routines, storage, auth,
ÚL/Expense eða eldri kvittunargögn eru breytt við migration.
Við runtime bætast item/request við og split total/version breytast atomically.

Preflight endurnýtir óbreytt SQL182 seal/body/access-checks, operator=postgres
og target-absence. Apply endurtekur sömu gate í transaction. Postflight
staðfestir bæði eldri seal og exact nýtt body/ACL. SQL183 er fail-closed við
endurkeyrslu/óþekkt target; ekki idempotent með overwrite.

SHA256:
- Migration: 7d9aa3fc40d3e282bf6bebe549ce2ea15de16f798bb508799d590d1005afb10a
- Preflight: 9a3fc10916489fb8f563b8d17e68a7ed07e360f9a17725f6749e701ed7dd6103
- Postflight: dddbecfa3122abe33b9138db05ec6a17c99fc1a7791f74a55a81db83f2532b6b

SQL182 SHA256 er óbreytt:
80c3810ed9ca4992f0d18edbdef23c85cc7d25c980044da7b20cbb7c6b037a2c.
SQL Editor: https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

## Skrár skoðaðar og breyttar

Skoðað SQL182 tables/commands/postflight, server actions, samninga,
núverandi UI-próf og Design.md-viðmið úr v027.

Breytt/ný:
1. components/receipt-split/AddSplitItem.tsx.
2. components/receipt-split/SplitBoard.tsx.
3. lib/receipt-split/contracts.ts.
4. lib/receipt-split/actions.ts.
5. messages/is.json og messages/en.json.
6. components/receipt-split/__tests__/standalone-receipt-ui.test.tsx.
7. lib/__tests__/standalone-receipt-actions.test.ts.
8. lib/__tests__/standalone-receipt-add-sql.test.ts.
9. scripts/receipt-split-add-item-artifacts.cjs.
10. sql/183_receipt_split_add_item.sql.
11. sql/validation/183-receipt-split-add-item/{preflight.sql,postflight.sql,README.md}.
12. Canonical task-skjal og þetta handoff.

## Skipanir, niðurstöður og takmarkanir

- node scripts/receipt-split-add-item-artifacts.cjs: exit 0; aðeins textaskrár.
- npm.cmd run test:run -- standalone-receipt: 59/59 PASS.
- Full áður valin receipt/middleware/launcher/login/pill regression-suite:
  244/244 í 15 skrám PASS, exit 0.
- npm.cmd run type-check og targeted Next lint á fimm app-TS/TSX skrám:
  PASS, exit 0; fyrirliggjandi lint-deprecation.
- Staðbundinn pglast parser: migration 9 SQL statements/2 PLpgSQL bodies;
  preflight 2/0 og postflight 2/0; allt PASS. Aldrei SQL-execution.
- Parser-mappan krafðist elevated read vegna ACL; engin net- eða DB-tenging.
- Engin full build, authenticated browser eða raunveruleg concurrent DB-prófun.
- Engin SQL-keyrsla, commit, push, deploy eða provider-kall.

Static tests verja owner lock, replay-hash, max total/ordinal, engin
claims/item-overwrite og óbreytt SQL182-hash. UI/action tests staðfesta
review-total, same-form, owner-only UI, error-preservation og session actor.
Static tests koma ekki í stað SQL-runtime prófana.

## Breytingar á verkefnalýsingu

Skráði nýja ósk Stebba um að bæta við lið í báðum stöðum, sömu form-reiti,
hegðun heildar, varðveislu fyrri magns og eigandaforsendu. Bætti SQL183
gátt við án breytinga á SQL182 og færði current gate í handvirkt preflight.
Tölusnið/mismunur v027 haldast. GoLive-description samræmd, in_progress.

## Localhost checks for Stebbi

1. Opna synthetic yfirferð á localhost:3004/auth-mvp/splitta-reikningnum.
   Smella Bæta við lið, fylla heiti/magn/upphæð sem vantar. Mismunur lækkar
   strax, heild helst, ný lína vistast með Vista yfirferð.
2. Eftir SQL183 EXACT_INSTALLED: eigandi bætir 2 einingum/8 EUR við deilt
   synthetic splitt. Heild hækkar um 8 EUR, liður er óskiptur, fyrra
   1-af-4 espresso val og liðauðkenni haldast.
3. Viðtakandi sér nýjan lið innan 8 sekúndna/focus og getur tekið 1 einingu.
   Owner-only viðbót má ekki birtast hjá öðrum eða fara í gegnum RPC þeirra.
4. Tveir owner-gluggar bæta við samtímis; bæði vistast og summa er rétt.
   Retry sömu beiðni tvískráir ekki. Þátttakendur geta áfram claim-að.
5. Villa heldur innslættinum. Loka/opna form og prófa mobile 360/390/460px,
   keyboard, 16px controls, textabrot og pending-feedback skv. Design.md.

Engin endurræsing þarf. Shared-add próf bíður SQL183. Aðeins eigin synthetic
gögn og samþykkjandi þátttakendur; runtime-vistun snertir tengdan Supabase.
Ekki prófa eyðingu eða breyta raunverulegum reikningum.
