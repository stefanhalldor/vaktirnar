# v026 — Deilihlekkur og unauthenticated runtime

## Plan og niðurstaða

Endurprófa HTTP eftir endurræsingu Stebba; laga afmörkuð frávik og halda
áfram að næstu raunverulegu notendaprófun. Stebbi sýndi candidate-slóð,
Next.js 15.5.14, port 3004 og Ready. Engin server-stjórnun af hálfu Codex.

Beint curl án þess að fylgja áframsendingum fann 307 /splitt → /login.
Fyrri Invoke-WebRequest fylgdi redirect og texti getur komið úr þýðingagögnum;
200 og HasJoinCopy voru ekki sönnun um lendingarsíðuna. v025 evidence er
leiðrétt með þessu handoffi; eldri handoff er óbreytt saga.

## Framkvæmt

- Bætti /splitt við EXACT_PUBLIC_PATHS í middleware. Aðeins lending opnast,
  ekki undirslóðir eða gögn. Page-flags og verified-session/membership í
  server actions haldast. Fragment getur nú varðveist áður en login hefst.
- Þrjú regression-próf: /splitt án redirect; /splitt/private og /splitt-extra
  halda fyrri aðgangsvörn.
- HTTP /splitt: 200, enginn Location, Referrer-Policy=no-referrer,
  X-Robots-Tag=noindex, nofollow, noarchive; Cache-Control=no-store,
  must-revalidate frá dev server. Engin krafa um að dev skili nákvæmlega
  private-strengnum þegar framework yfirskrifar hann með no-store.
- HTTP /auth-mvp/splitta-reikningnum án session: 307 →
  /innskraning?next=%2Fauth-mvp%2Fsplitta-reikningnum.

## Skrár skoðaðar og breyttar

Skoðað: middleware.ts, next.config.js, app/splitt/page.tsx,
components/receipt-split/SplitJoin.tsx, middleware/header tests og JSON-fixture.

Breytt:
1. middleware.ts.
2. lib/__tests__/middleware.test.ts.
3. docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md.
4. sql/validation/182-standalone-receipt-splits/README.md.
5. Þetta nýja handoff.

## Prófanir og skipanir

- npm.cmd run test:run -- middleware.test standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter: 227/227, 14 skrár, exit 0.
- npm.cmd run type-check: PASS.
- npm.cmd run lint -- --file middleware.ts --file lib/__tests__/middleware.test.ts:
  PASS; aðeins Next lint deprecation.
- curl.exe -sS --max-time 30 -D - -o NUL http://localhost:3004/splitt:
  exit 0, niðurstaða að ofan. Sama lestur á einkasíðu: exit 0.
- Engin SQL-keyrsla, myndgreining, commit, push, deploy eða server-endurræsing.
- Full build og authenticated browser/concurrency hafa ekki verið framkvæmd.

## Breytingar á verkefnalýsingu

Skráði raunverulega endurræsingu og middleware-finding; leiðrétti fyrri
HTTP-evidence sem fylgdi redirects. Næsta gate er nú innskráð notendaprófun,
ekki SQL eða önnur endurræsing. Uppfærði próftölur í 227/227. Product-scope
er óbreytt: Teskeiðarnotandi án ÚL, JSON án myndar og sérskref núllkrónulína.
GoLive-description er samræmd þessari stöðu; task er áfram in_progress.

## Localhost checks for Stebbi

Ekki þarf að endurræsa aftur. Opna http://localhost:3004/auth-mvp/splitta-reikningnum
innskráður með eigin prófgögnum.

1. Límdu allt úr ../fixtures/espresso-zero-review.json án myndar.
2. Búðu til drög; sjáðu 4 espresso á EUR 16.00 og köku á núlli í sérskrefi.
3. Settu köku á 4.50 og heild á 20.50, vistaðu yfirferð, staðfestu.
4. Afritaðu deilihlekk í aðra browser-session. Viðtakandi skráir sig inn
   með Teskeiðarnotanda án ÚL-aðgangs og tekur þátt.
5. Taktu 1 espresso: nafn, magn 1, EUR 4.00 og 3 eftir. Eigandi sér
   uppfærslu innan 8 sekúndna eða við focus. Prófaðu pillusíur og refresh.
6. Prófaðu samtímis síðasta eintak; aldrei yfirúthlutun. Fylgdu einnig
   mobile- og aðgangschecklist SQL182 README áður en release er samþykkt.

Nota eingöngu synthetic gögn og samþykkjandi þátttakendur. Localhost
getur skrifað í tengdan Supabase. Engin raunveruleg kvittun eða eyðing
eldri gagna í þessum prófum. JSON gerir ekki provider-kall.

## Áhætta og næsta skref

Engin authenticated browser-session er aðgengileg Codex; Stebbi framkvæmir
prófin hér að ofan. Catalog PASS og unit-próf sanna ekki business-runtime
eða concurrent claims í gagnagrunni. Rýna þær niðurstöður næst og laga
afmörkuð findings innan áframhaldandi framkvæmdarumboðs.
Engin UI/layout-breyting; Design.md-viðmið v022 haldast.
