# v022 — Sjálfstætt splitt og SQL182 preflight

Created: 2026-09-15 19:04 Atlantic/Reykjavik, staðfest með clock tool.
Task: expense-receipt-item-claims. Writer: Codex.
Candidate: C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.
Base: 57a57d33c093a89ef38dd087acfa2b789897435d.

## Mannamál fyrst

Sjálfstæða splittflæðið er útfært og staðbundin próf standast. JSON krefst
ekki myndar, yfirferð varðveitir núllkrónulínur og staðfesting leiðir í deilingu
og sjónræna magnskiptingu án ÚL. Raunveruleg vistun og þátttaka bíða nýs schema.
Næsta skref er aðeins lestur á gagnagrunnsumhverfinu; hann setur ekkert upp.

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA: aðeins preflight.sql.**

1. Opna [réttan Supabase SQL Editor](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new).
2. Keyra alla [SQL182 preflight-skrána](../../../../sql/validation/182-standalone-receipt-splits/preflight.sql), engin input þarf.
3. Senda alla einu niðurstöðuröðina hingað. PASS: operator_state=READY,
   operator_ok/columns_ok/roles_ok/definer_ok/primitives_ok/storage_rls_ok/
   targets_absent eru true og missing_columns=[].
4. Ekki keyra migration, postflight eða SQL181 enn.

Þessi lestur snertir aðeins catalog og bucket-stillingar. Hann les ekki
notendagögn og breytir hvorki schema, auth, RLS, billing, deployment né gögnum.
Við READY heldur Codex sjálfkrafa áfram að næsta afmarkaða handvirka SQL-skrefi.
Við STOP/villu er örugg greining næsta verk, engin blind endurkeyrsla.

## Hashes nákvæmra artifacts

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| sql/validation/182-standalone-receipt-splits/preflight.sql | 2672 | 2b812f8bbfac5bfceb5e38aada1a0b7c28870b4c97c2a992e97dbf705161dd57 |
| sql/182_standalone_receipt_splits.sql — EKKI KEYRA ENN | 27495 | 80c3810ed9ca4992f0d18edbdef23c85cc7d25c980044da7b20cbb7c6b037a2c |
| sql/validation/182-standalone-receipt-splits/postflight.sql — EKKI KEYRA ENN | 5453 | 2395559a0018cfc56f17e761766504afc6c00e37c8f2a0b66445aeaa0e61603e |

## Skilningur á umboði og af hverju stopp er nú rétt

Stebbi heimilaði framkvæmd til næsta workflow-stopps og ákvað
Teskeiðarinnskráningu án ÚL-kröfu. Fyrra samtalsstopp eftir þeirri ákvörðun
var óþarft; engin ný almenn leyfisbeiðni var gerð í þessum framkvæmdarhring.
Sameiginlegt WORKFLOW.md v8, Supabase/SQL-kaflinn: „Stebbi keyrir allt SQL
sjálfur.“ Candidate-smíði, leiðréttingar, próf og samfelld rýni voru unnin fyrst.
Núna þarf raunverulega handvirka SQL-aðgerð áður en hægt er að staðfesta runtime.
Enginn agent keyrði SQL, hvorki local, production, preflight né postflight.

## Plan og raunveruleg útfærsla

- Nýr private gagnakjarni fyrir splitt, línur, meðlimi, claims og request journal.
  Engin Expense-draft, greiðanda- eða ledger-mutation í SQL182.
- JSON fer beint í sjálfstæða stofnun. Myndaleið notar eigandabundið signed
  upload, magic/size/MIME validation og eina provider-lease; ekkert sjálfvirkt retry.
- Yfirferð hefur sérstakt editable núllkrónuskref. 0 varðveitist og jákvæð
  fjárhæð virkjar línu. Server krefst vistaðrar yfirferðar og réttrar summu áður
  en staðfesting opnar deilingu.
- Sjálfstæður deilihlekkur, innskráning og membership. Token er í fragment,
  hreinsað úr slóð, varðveitt í sessionStorage yfir login og eytt eftir join.
- Einn tekur 1 af 4 espresso, nafn/1 birtist og 3 eru eftir. Eigin magn má
  stilla í brotum og minnka aftur. Participant-summary notar nákvæma afrúnun
  með óskiptum hluta, svo enginn fær kostnað af óvöldum hlutum.
- Canonical TeskeidMultiSelectPillFilter er endurnýtt óbreytt; OR-fjölval,
  hreinsun, per-person magn og línufjárhæðir. Refresh/focus og 8 sekúndna
  polling uppfæra hlutdeild meðan sharing-skjár er opinn.
- ÚL-flaggið ræður ekki standalone launcher eða server guard. JSON, claims,
  staðfesting og hlekkur leiða ekki í ÚL.
- Legacy-brú afritar aðeins innlesnar línur úr óbirtri eigandakvittun við
  staðfesta source-version. Engin gömul mynd, aðild, skuld eða greiðsla er færð.
  Upprunagögn eru óbreytt; UI segir þetta skýrt.
- Eyðing er endurheimtanleg milli DB-tombstone og Storage removal. Aðgangi er
  lokað fyrst, línur/membership/claims hreinsast þegar fullri eyðingu lýkur.

## Breytingar á verkefnalýsingu

1. Skipt út „ólokin útfærsla / ekkert SQL“ stöðu fyrir staðbundinn candidate
   og afmarkaðan handvirkan SQL182 preflight. Runtime er ekki merkt PASS.
2. Fest session-bound aðild, profile-nafn án email-fallback og sjálfstæða
   launcher/route-vörn án ÚL.
3. Skráð að vista þarf yfirferð fyrir staðfestingu; 0-línur varðveitast.
4. Skráð 30 daga hlekk, rotation, fragment-hreinsun og login-endurkomu.
5. Skráð magnclaim, óskiptan kostnað, nákvæma afrúnun, generic pillur og polling.
6. Skráð legacy-afritun lína með óbreyttri eldri mynd og kvittun.
7. Skráð endurheimtanlega eyðingu og takmörk signed Storage-tokena.
8. SQL181 áfram HOLD; SQL182 er sjálfstætt og notar ekki SQL181. SQL179/180
   eru varðveitt með sömu hashes.
9. Uppfærð prófunarsönnun, localhost-skref, shared paths og framkvæmdarröð
   til preflight → apply → postflight → runtime → release-gáttar.
10. Handoff-vísun uppfærð; eldri handoff eru óbreytt saga.

## Skrár breyttar/stofnaðar í þessum framkvæmdarhring

Routes og UI:
- app/auth-mvp/splitta-reikningnum/page.tsx
- app/auth-mvp/splitta-reikningnum/[draftId]/page.tsx
- app/splitt/page.tsx
- app/splitt/loading.tsx
- components/receipt-split/SplitImport.tsx
- components/receipt-split/SplitBoard.tsx
- components/receipt-split/SplitJoin.tsx
- components/receipt-split/LegacyReceiptCopy.tsx
- components/receipt-split/__tests__/standalone-receipt-ui.test.tsx

Server/domain og próf:
- lib/receipt-split/contracts.ts
- lib/receipt-split/server.ts
- lib/receipt-split/actions.ts
- lib/receipt-split/legacy.server.ts
- lib/__tests__/standalone-receipt-split.test.ts
- lib/__tests__/standalone-receipt-actions.test.ts
- lib/__tests__/standalone-receipt-sql.test.ts
- lib/__tests__/expense-receipt-server.test.ts
- lib/__tests__/teskeid-launcher.test.ts

Sameiginlegt yfirborð:
- lib/auth/loginNext.ts
- lib/teskeid/launcher.server.ts
- components/teskeid/TeskeidAnalytics.tsx
- next.config.js
- messages/is.json
- messages/en.json

SQL og skjöl:
- sql/182_standalone_receipt_splits.sql
- sql/validation/182-standalone-receipt-splits/preflight.sql
- sql/validation/182-standalone-receipt-splits/postflight.sql
- sql/validation/182-standalone-receipt-splits/README.md
- scripts/receipt-split-sql-artifacts.py
- docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md
- þetta handoff

Ignored tooling: .tmp/receipt-sql-parser (pglast 8.4). Engin breyting á
package.json/lockfile, environment eða dev server. Aðalvinnumappan er varðveitt.

## Rýni, próf og niðurstöður

- Lesið: gildandi shared/repo workflow, Design.md canonical/mobile-kaflar,
  öll eldri receipt contracts, server/actions, SQL179/180, SQL181 HOLD, profile/
  auth/login/middleware, launcher/analytics, canonical pill component og próf.
- npm.cmd run test:run -- standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter → 12 skrár, 119/119 PASS, exit 0.
- npm.cmd run type-check → PASS, exit 0.
- npm.cmd run lint með tíu breyttum UI/server/route skrám → engar warnings/errors,
  exit 0. Next lint sýndi almenna deprecation-notice; engin toolchain-breyting gerð.
- Eftir síðasta generated migration-guard: standalone-receipt-sql → 6/6 PASS.
- pglast 8.4 parse_sql + parse_plpgsql_json á final artifacts → migration
  38 SQL statements / 6 PLpgSQL bodies, preflight 1/0, postflight 2/0; exit 0.
  Þetta er málfræðigreining í minni, án gagnagrunns og án SQL-keyrslu.
- Afmarkað git diff --check → exit 0. Nýjar untracked skrár voru lesnar,
  type-/lint-/parser-prófaðar beint; git diff eitt nær ekki yfir þær.
- SQL179 SHA: 60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c.
- SQL180 SHA: 681d415f667a866099244415ce088906a1e89f69813d36d5c9dee5549d505a47.
- SQL180 postflight SHA: afedbb8f7d0fe557201889542af64d16223f27ab40ee5bec852e33be13ef0d5a.

Fyrri findings löguð í sama hring: launcher-próf endurspegluðu rangt ÚL-skilyrði;
eyðing þurfti endurkomustöðu eftir Storage-villu; afritunarútgáfa þurfti version-check;
claim-fjárhæð í síu átti að sýna eigin hlut; review/confirm þurfti skýr server-mörk;
replay mátti ekki gefa nýjan upload-URL fyrir eytt splitt; malformed fragment
mátti ekki endurnýta annað pending invite; SQL-vörður var samræmdur við preflight.

Tooling: fyrsta pip-tilraun hafnað vegna sandbox-netaðgangs; afmörkuð hækkun
sótti parser í ignored candidate-möppu. Parser þurfti sömu lesréttindahækkun.
Engin auto-review höfnun stöðvaði verkið. Ein apply_patch tilraun með delete/add
á sömu skrá var hafnað áður en nokkuð breyttist; endurtekið sem afmarkað update.

## SQL og öryggisrýni

GoLive-lýsing sama issue/project var uppfærð með þessari útfærslu og preflight-gátt:
HTTP 200, exit 0, updated_at=2026-09-15T19:08:15.695575+00:00.
Status er áfram in_progress og priority medium. Ný lýsing vísar á þetta v022
og segir skýrt að runtime bíði, SQL181 sé HOLD og aðeins preflight sé næsta aðgerð.
Lokasamanburður staðfesti SHA/bytes allra þriggja SQL-skránna í töflunni að ofan.

Nýr private schema-aðgangur er lokaður PUBLIC/anon/authenticated/service_role;
fimm töflur hafa forced RLS og engar client policies. Aðeins tveir public
SECURITY DEFINER RPC hafa service-role execute, fixed empty search_path og
staðfestan actor. Membership/owner skilyrði vernda object-scope.
Það er ekki dregið úr neinni eldri RLS-vörn.

Receipt-row lock + fyrra eigið magn verja samtímis claims. Actor/request lock
og payload-hash verja retry og request-ID endurnotkun með breyttum payload.
Review-items verða immutable við sharing. Nákvæm summa er forsenda staðfestingar.

Migration býr aðeins til ný objects/bucket/restrictive policy; engin gömul
business-röð er uppfærð. Exact preflight er endurtekið inni í transaction.
Catalog seal fangar eigin töflur/columns/constraints/indexes/functions/ACL/policies/
triggers/bucket. Postflight ber seal og hardcoded reviewed body-hashes saman.
SQL182 hefur ekki verið keyrt. SQL181 er ókeyrt og áfram HOLD.

Runtime/RLS/concurrency eru enn ósönnuð. Full production build/browser-próf voru
ekki keyrð meðan Stebbi stjórnar dev server í candidate; ekki trufla hans server.
Signed download er 60s; þegar útgefinn upload-token getur lifað eftir eyðingu.
Síðbúinn blob getur því þurft síðar afmarkaða storage-hreinsun; hann fær ekki
nýjan read-URL gegnum appið. Engin slík hreinsun er keyrð eða sjálfvirkt heimiluð.

Óbirt legacy receipt getur flutt línur með eiganda-version check; upprunamyndin
er ekki afrituð. Nýjar myndir nota nýja private bucketinn. Takmörk: 100 línur,
50 þátttakendur, magn með 3 aukastöfum; þetta er ekki greiðslu-/skuldakerfi.

## Localhost checks for Stebbi

**Ekki prófa vistun nýja flæðisins fyrr en SQL182 gates hafa staðist.**
Núverandi aðgerð er aðeins preflight. Full checklist, auth/gagna-state,
skref og væntar niðurstöður eru í
[SQL182 README](../../../../sql/validation/182-standalone-receipt-splits/README.md).

Eftir EXACT_INSTALLED á localhost:3004 í réttum candidate:
- Eigin synthetic JSON án myndar → varanleg yfirferð.
- Núllkrónulína → sérstakur reitur → 4,50 EUR eða varðveitt 0.
- Vista yfirferð → staðfesta → hlekkur, engin greiðandaspurning.
- Annar Teskeiðarnotandi án ÚL í öðrum browser → login → rétt splitt.
- 1 af 4 espresso → nafn/1, þrír eftir og einungis eigin fjárhæð.
- Tveir taka síðasta samtímis → ein staðfest úthlutun; hitt fær sýnilega villu.
- Canonical pillu-fjölval/clear, per-person línufjárhæðir, brot, afrúnun,
  afsláttur/þjórfé, óskiptur hluti, refresh og focus.
- Óviðkomandi split-ID gefur engin gögn; member fær engar owner-aðgerðir.
- Synthetic myndleið og recovery; ekkert sjálfvirkt provider retry.
- Eigandaeyðing/Storage-failure recovery aðeins á gögnum sem má eyða.
- Legacy-afritun varðveitir frumgögn og afritar ekki fjárhagsfærslur.
- Mobile 360/390/460px, 16px input, touch targets, langt nafn, keyboard,
  ekkert overflow/zoom og pending/error við aðgerðina.

Stebbi ræður server og sendir deilihlekki sjálfur. Ekki prófa á öðrum notendum
án samþykkis eða stofna/eyða raunverulegum gögnum í óafmörkuðu prófi. Myndlestur
getur notað API-inneign. Engin commit/push/deploy heimild er fyrirliggjandi.
