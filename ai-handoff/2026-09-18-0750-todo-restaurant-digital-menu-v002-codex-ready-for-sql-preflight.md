# restaurant-digital-menu-to-split — implementation handoff v002

## Staða

`READY_FOR_MANUAL_SQL_PREFLIGHT_AND_REVIEW`

Candidate er tilbúinn til handvirkrar SQL preflight-rýni. SQL var aðeins skrifað og rýnt sem source artifact; Codex keyrði ekkert SQL og gerði enga Supabase-, Production-, push-, merge- eða deploy-aðgerð.

## Baseline og provenance

- Isolated worktree: `C:\Users\Lenovo\Documents\vaktirnar\.tmp\restaurant-menu-split-v1`
- Branch: `codex/restaurant-digital-menu-to-split-v1`
- Canonical baseline: `cd7e80bff08de31ccdc47ecc62ad425d19558c92`
- `origin/main` staðfest read-only með `git ls-remote` á sama SHA við lok vinnslu.
- Dirty root var ekki snert, hreinsað, resett eða fært.

## Hvað er tilbúið

- Almenn Splitt participant-authority: active authenticated participant má bæta við venjulegum lið í exact sharing Splitti.
- Immutable creator provenance, exact membership, revisions og idempotent request IDs fylgja add/edit/cancel command boundary.
- Creator getur breytt eigin manual línu. Restaurant menu snapshot er immutable og þarf að fella niður og senda aftur. Atomic cancellation hafnar línu sem annar hefur claim-að eða veitingastaður hefur tekið í vinnslu.
- Owner review/admin flæði og núverandi claims, quantities, settlement og retries eru varðveitt.
- Canonical `business_profiles` er endurnýtt fyrir restaurant capability, staði, borð, starfsfólk og matseðla.
- Public venue menu og QR projection eru global-gated read-only og leka ekki Split-, participant-, claim- eða settlement-gögnum.
- Private `MenuDraft` er í `sessionStorage`, bundið við venue/menu/version. Stöðugt request ID og expected revision eru varðveitt yfir óvissa retry; staðfestar línur eru fjarlægðar ein í einu til að hindra tvítekningu eftir partial success.
- Restaurant submit býr til venjulegan participant-created Splitt lið og immutable operational snapshot.
- Owner, staff og guest nota þrjú sjálfstæð per-user flags: `veitingastadir`, `veitingastadir_starfsfolk`, `veitingastadir_gestir`; global kill switch er `RESTAURANTS_ENABLED`.
- Operational view sýnir aðeins allowlisted order gögn og stöðurnar `nytt`, `i_vinnslu`, `afgreitt`; forecast projection inniheldur ekki participant, claim, settlement eða greiðslugögn.
- Forpöntun notar ordinary Splitt, visit metadata og eina revision/idempotency-varða tengingu við exact opið borð.

## WORKFLOW.md regla

Canonical `WORKFLOW.md` fékk regluna `BASELINE_RED_NONBLOCKING`: exact failure identities, assertion messages, uncaught errors og snapshot drift eru borin saman við clean canonical baseline. Baseline-equivalent eða færri failures án nýrra IDs stöðva ekki óskylda feature-vinnu; candidate-only RED er lagað og endurprófað. Local commit er heimill þegar focused tests, typecheck, lint, build, scope/diff, secret scan og review eru GREEN, en handoff má aldrei kalla full suite GREEN. Codex keyrir aldrei SQL; Stebbi er eini SQL operatorinn.

## Breyttar skrár

- `.env.example`
- `WORKFLOW.md`
- `app/(admin)/admin/page.tsx`
- `app/api/admin/feature-access/route.ts`
- `app/api/restaurants/owner/capability/route.ts`
- `app/api/restaurants/public/[venueSlug]/route.ts`
- `app/api/restaurants/public/qr/[token]/route.ts`
- `app/api/restaurants/staff/orders/route.ts`
- `app/matseðill/[venueSlug]/loading.tsx`
- `app/matseðill/[venueSlug]/page.tsx`
- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `components/restaurants/PublicMenuClient.tsx`
- `components/restaurants/__tests__/PublicMenuClient.test.tsx`
- `lib/__tests__/restaurants-v1.test.ts`
- `lib/__tests__/standalone-receipt-v2-service.test.ts`
- `lib/loans/guard.ts`
- `lib/receipt-split/actions.ts`
- `lib/receipt-split/contracts-v2.ts`
- `lib/receipt-split/server.ts`
- `lib/receipt-split/view-v2.ts`
- `lib/restaurants/actions.ts`
- `lib/restaurants/contracts.ts`
- `lib/restaurants/management.server.ts`
- `lib/restaurants/server.ts`
- `messages/en.json`
- `messages/is.json`
- `middleware.ts`
- SQL source artifacts listed below.

## SQL artifacts og SHA-256

- `sql/validation/192-restaurant-menu-split-v1/preflight.sql` — `9EE001873FC4C1B549BB244BE046EF5D414E9D0ED19998DE72CCB555FEEB648C`
- `sql/192_restaurant_menu_split_v1.sql` — `4FCE233B2A097DC5848470E44814BE1E9B47CEC60B5CFCFD9B13C1C5A7A3F736`
- `sql/validation/192-restaurant-menu-split-v1/postflight.sql` — `61C9AA10EFA4EFA2E9EF27379DD3E1529E68BB820CB4633A47FCF1EB370A2A4D`

SQL192 er forward-only source artifact. Engin þessara skráa var keyrð.

## Local gates

- Focused tests: GREEN, 4 files / 29 tests eftir creator/retry lagfæringar; sérstakt Unicode boundary rerun GREEN, samtals 4 files / 28 tests í loka focused umferð.
- TypeScript: `npm.cmd run type-check` GREEN.
- Lint: GREEN, 0 errors; 18 fyrirliggjandi warnings í unrelated expenses/landing/weather skrám. Vegna isolated-worktree root inference var ESLint keyrt með local `NODE_PATH` og local binary.
- Build: GREEN; compile, type validation og 154/154 static pages kláruð. Next sýndi þekkt workspace-root ESLint config warning en build exit code var 0.
- `git diff --check`: GREEN.
- Secret scan yfir allar tracked og untracked candidate skrár: GREEN, engin þekkt credential/private-key pattern.
- Remote provenance: GREEN, `origin/main` var enn baseline SHA.
- Fresh independent source review: GREEN eftir að þrjú candidate findings voru löguð: stöðug MenuDraft retry identity, participant add UI/exact revision, og creator-only edit/cancel authority án owner bypass. Engin óleyst security/privacy eða shared-scope finding.

## Full suite: BASELINE_RED_NONBLOCKING

Command: `npm.cmd run test:run -- --maxWorkers=4 --reporter=json --outputFile=.tmp/restaurant-candidate-final3.json`

- Candidate: 1,901 suites; 8,080 tests; 59 failed tests; 7,956 passed tests; 60 unique failure IDs.
- Clean canonical baseline á sama SHA: 1,895 suites; 8,066 tests; 62 failed tests; 7,939 passed tests; 63 unique failure IDs.
- Candidate-only failure IDs: engin.
- Assertion-message drift: ekkert.
- Candidate hefur þrjú færri failure IDs. Baseline-only IDs eru tvö í `standalone-receipt-v2-service.test.ts` og eitt í `weather-routing-production-boundary.test.ts`.

Full suite er því ekki GREEN. Hún er nákvæmlega `BASELINE_RED_NONBLOCKING`; debt er fyrirliggjandi á canonical baseline og var ekki lagað innan restaurant scope.

## Localhost checks for Stebbi

Ekki er hægt að prófa gagnagrunnstengd restaurant-flæði á localhost fyrr en SQL192 hefur farið í gegnum sérstaka preflight/migration/postflight gátt. Ekki setja Production credentials í local umhverfi og ekki prófa SQL192 kæruleysislega gegn Production.

Eftir samþykkta SQL-gátt í öruggu umhverfi:

1. Settu `RESTAURANTS_ENABLED=true` og úthlutaðu role-flöggunum aðeins á prófunarnotendur.
2. Prófaðu public `/matseðill/{venueSlug}` logged-out við 360, 390 og 460 px: matseðill og local drög sjást, engin Split gögn sjást, ekkert lárétt overflow eða zoom kemur fram.
3. Prófaðu gest án `veitingastadir_gestir`, flaggaðan gest án membership og flaggaðan active participant. Aðeins síðasti má binda exact borð og setja línu í Splitt.
4. Prófaðu tvöfaldan submit og hermdu eftir óvissu svari. Sama request ID má ekki búa til tvær línur og staðfest lína má ekki birtast aftur í drögum.
5. Prófaðu tvo þátttakendur: báðir sjá línu og creator; annar má ekki breyta eða fella hana niður. Creator má fella nýja línu niður meðan aðeins eigin initial claim er til, en ekki eftir claim frá öðrum eða stöðu `i_vinnslu`/`afgreitt`.
6. Prófaðu owner, staff og guest flag combinations. Ekkert flagg eitt sér má veita authority annars hlutverks og restaurant operational view má aldrei sýna participants, claims, uppgjör eða greiðslustöðu.
7. Prófaðu forpöntun, eina borðatengingu, retry á sömu tengingu og höfnun á öðru borði eða öðrum venue.

## Næsta handvirka SQL-gátt

Stebbi rýnir hashana og keyrir **aðeins** `sql/validation/192-restaurant-menu-split-v1/preflight.sql` handvirkt í réttum gagnagrunni. Stöðva skal við hvaða óvænta row, mismatch eða annað en exact READY niðurstöðu og skila öllu outputi til rýni. Ekki keyra migration eða postflight fyrr en preflight output hefur verið sérstaklega samþykkt.
