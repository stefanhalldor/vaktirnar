# v025 — SQL182 PASS og localhost-gátt

## Niðurstaða og næsta aðgerð

Stebbi skilaði EXACT_INSTALLED og seal_ok, functions_ok, tables_ok,
no_client_policies, boundary_ok, schema_private, bucket_ok og
storage_policy_ok voru öll true. SQL182 catalog-gátt er lokið.
NEI — EKKI KEYRA SQL NÚNA. Engin SQL-skrá var breytt eða keyrð af Codex.

Stebbi þarf að endurræsa eigin localhost:3004 úr:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.
WORKFLOW v8 og AGENTS.md áskilja að Stebbi stýri server; Codex gerði það ekki.
Eftir staðfestingu heldur Codex sjálfkrafa áfram í HTTP-próf. Engin
authenticated browser-session er tiltæk hjá agent; innskráð próf þarf Stebbi.

## Plan, framkvæmd og evidence

- Plan: loka SQL-gátt, prófa /splitt, greina frávik og afhenda runtime-próf.
- Tveir unauthenticated Invoke-WebRequest GET á http://localhost:3004/splitt
  skiluðu 200 og lendingartextanum „Taka þátt í splitti“.
- Cache-Control var no-store, must-revalidate; Referrer-Policy var
  strict-origin-when-cross-origin; X-Robots-Tag vantaði.
- Fundið: global regla kom á eftir /splitt í next.config.js.
  Færði /splitt á eftir global svo sérreglan ráði. Nýtt node-environment
  próf reiknar saman virkar reglur og staðfestir privacy headers.
- HTTP eftir breytingu sýndi enn gömlu niðurstöðu: source/config runtime
  er óstaðfest, ekki merkt PASS og ekki notað sem release-evidence.
- Fyrsta header-próf mistókst í jsdom vegna next-intl plugin environment;
  node-environment leysti harness-villuna. 1/1 PASS.
- npm.cmd run test:run -- standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter: 13 skrár, 120/120 PASS, exit 0.
- Fyrri type-check/lint PASS úr v022; engin TypeScript app-breyting núna.
- Full build ekki keyrt til að raska ekki .next hjá server Stebba.
- Lesið: shared WORKFLOW v8, canonical task, SQL182 README,
  next.config.js, middleware-header tilvísanir og lifandi GoLive-task.
- Ein README-slóð og ein middleware-slóð í upphafsleit reyndust ekki til;
  rétt SQL182 README fannst. Þetta hafði engin gögn eða runtime-áhrif.

## Skrár breyttar í v025

1. next.config.js — röð sértækra privacy-reglna.
2. lib/__tests__/standalone-receipt-headers.test.ts — regression-próf.
3. docs/tasks/expense-receipt-item-claims/fixtures/espresso-zero-review.json
   — synthetic JSON með 4 espresso og núllkrónuköku.
4. docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md.
5. sql/validation/182-standalone-receipt-splits/README.md.
6. Þetta nýja, óbreytanlega handoff.

## Breytingar á verkefnalýsingu

Skráði actual postflight PASS, lokaði SQL-keyrslubeiðni og færði current gate
í staðfestingu localhost-source og runtime. Skráði hausafrávik, afmarkaða
leiðréttingu, 120/120 próf og tilbúið JSON-prófgagn. Kröfur um JSON án
myndar, sérskref núllkrónulína, Teskeiðarinnskráningu án ÚL og standalone
splitt eru óbreyttar. GoLive-description er samræmd; status er in_progress.

## Localhost checks for Stebbi

1. Endurræstu serverinn úr candidate að ofan á porti 3004 og staðfestu það.
   Codex athugar /splitt HTTP-hausana aftur. Engin SQL-keyrsla þarf.
2. Opnaðu /auth-mvp/splitta-reikningnum innskráður. Límdu allt úr
   fixtures/espresso-zero-review.json án myndar og búðu til drög.
3. Espresso á að vera 4 og EUR 16.00. Birthday Cake á að haldast í
   sérskrefi fyrir núllkrónulínur. Settu kökuna á 4.50 og heild á 20.50,
   vistaðu yfirferð og staðfestu. Engin greiðandaspurning eða ÚL-route.
4. Afritaðu deilihlekkinn í aðra browser-session með samþykkjandi
   Teskeiðarnotanda án ÚL-aðgangs. Innskráning á að leiða aftur í splittið.
5. Taktu 1 espresso: nafn, 1 eintak og EUR 4.00; 3 espresso eftir.
   Eigandi á að sjá uppfærslu innan 8 sekúndna eða við focus.
6. Prófaðu participant-pillur, fjölval, hreinsun og refresh.
   Prófaðu tvo að taka síðasta eintakið: aldrei yfirúthlutun.
7. Prófaðu við 360/390/460px: engin lárétt scroll, overlap eða keyboard-zoom.
   Engin UI/layout-breyting var gerð í v025; Design.md-reglur v022 haldast.

Nota eingöngu synthetic eigin prófgögn og samþykkjandi þátttakendur.
Localhost getur skrifað í tengdan Supabase; ekki nota raunverulegar kvittanir
eða eyða eldri gögnum í þessari prófun. JSON kallar ekki á myndgreiningu.

## Eftirstandandi áhætta og rýni

Catalog PASS sannar ekki authenticated app-runtime, concurrent claims eða
mobile-upplifun. Source identity og virkir HTTP-hausar bíða endurræsingar.
Rýna sérstaklega þessa þrjá þætti áður en release er rætt. Engin commit,
push eða deploy. SQL182 er uppsett af Stebba og helst óbreytt; SQL181 HOLD.
