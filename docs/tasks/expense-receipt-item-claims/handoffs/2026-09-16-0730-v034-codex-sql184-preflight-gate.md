# v034 — SQL184 preflight-gátt og v2 candidate-rýni

Created: 2026-09-16 07:30 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Base: 57a57d33c093a89ef38dd087acfa2b789897435d.
Candidate: C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Mannamál og næsta eigendagátt

Stebbi staðfesti SQL-fría UI-framsetningu: „Þetta er mun betra svona“.
Versioned gagnasamningur, samhæfni við eldri splitt, server-bound actor,
nákvæm fjárhæðaskipting og SQL184 migration/preflight/postflight eru tilbúin
og hafa farið í fullan static rýnihring. Uppsetning SQL184 ein og sér breytir
engri kvittun og flytur engar gagnaraðir; fyrsta v2 vistun uppfærir aðeins sitt
split nákvæmlega undir sama parent lock.

**JÁ — STEBBI Á AÐ KEYRA AÐEINS PREFLIGHT NÚNA.**

Skrá: [SQL184 preflight](../../../sql/validation/184-receipt-split-v2/preflight.sql)

SQL Editor: https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

Vænt nákvæmlega ein röð:

- `operator_state = READY`
- `predecessor_state = EXACT_INSTALLED`
- `operator_ok = true`
- `targets_absent = true`

Ef eitthvað annað kemur: stoppa, ekki keyra migration, senda Codex alla röðina.
Ef allt er exact READY staðfestir Codex hana og afhendir migration sem næstu
sérstöku SQL-gátt. READY er ekki sjálfkrafa migration-heimild.

Preflight les PostgreSQL catalog/function bodies/ACL/RLS metadata og private
storage-bucket stillingu. Það les engar kvittanir, claims, myndir, nöfn,
netföng eða deilihlekki og breytir ekki schema/gögnum. `SET search_path`
gildir aðeins Editor-session. Velja skal `Run`/`Yes` aðeins fyrir preflight;
ekki velja varanlegt leyfi fyrir SQL/Production.

## Findings úr fullri rýni

Engin opin blocking finding er eftir í candidate artifacts.

Leiðrétt í rýni:

1. Whole-split revision var fyrst sett á hvert claim. Það hefði gert óskylda
   samtímis þátttöku að óþarfa conflict. Claim notar nú item revision,
   previous-own units, total capacity, request lock og parent lock. Þannig
   hafnar gamalt tæki eftir verð-/magnbreytingu en óskyld claims geta raðast.
2. Node og Edge röðuðu ISK/EUR táknum mismunandi í Intl og ollu hydration
   villu. Stöðugt locale/currency formatter-snið var sett inn og endurprófað.
3. Nýir íslenskir textar skemmdust í fyrsta PowerShell pipeline. UTF-8 source
   og parity/encoding regression-próf lagaði það.
4. Negative-net adjustment er áfram sýnilegt review-vandamál og getur ekki
   orðið neikvæð skuld þátttakanda. Sharing write með neikvæða línusummu er hafnað.

Eftirstandandi raunáhætta sem static próf geta ekki sannað:

- Preflight/postflight þurfa actual catalog frá Supabase.
- SQL locks, grants og service-role boundary eru ekki runtime-prófuð fyrr en
  Stebbi hefur sett migration upp og exact postflight staðist.
- Live route er vísvitandi áfram v1 þar til postflight; prepared v2 service er
  ekki importað af app/components. Það kemur í veg fyrir köll í óuppsett RPC.
- Eftir fyrsta v2-only brot er taplaus downgrade í scale 1000 ómöguleg. Rollback
  þarf þá forward-compatible app, ekki destructive down-conversion. Engin
  recovery SQL er því látin fylgja án sérstakrar ákvörðunar.

## Samþykktur samningur og raunveruleg útfærsla

- Standalone contract v2 notar scale 3000. Legacy milli umbreytist exact ×3.
  Shared Expense quantity contract er óbreytt scale 1000.
- ¼=750, ⅓=1000, ½=1500 og heil=3000. Ógeymsluhæfum brotum er hafnað.
- `receipt_total_minor` er sjálfstætt reference. Línusumma stýrir claims;
  mismunur er sýnilegur og hindrar ekki save/confirm.
- BigInt summary skiptir hverri línu deterministic eftir magni; óskiptur hluti
  tekur þátt. Tax/tip/discount deilist yfir claim + unclaimed línusummu.
- Owner einn breytir heiti, skýringu, magni, verði, reference eða bætir við.
  Participant breytir aðeins eigin claim magni. Actor kemur úr session á server.
- Item ID/member token/claim tengsl og valið einingamagn haldast við edit.
  Magn undir claimed total er hafnað. Claimed line má ekki fá zero price.
- Original description geymist sérstaklega. Explanation er optional plain text,
  240 stafir, með review flag úr extraction og owner correction.
- Add/edit breytir ekki reference total. Item revision hækkar við edit.
- Request ID + exact payload hash veita idempotency; sama ID með öðru payload
  er conflict. Engin blind server retry á óvissri mutation.
- Öll gömul og ný writes taka request lock á undan parent row lock.
- SQL184 er lazy/additive. V1 splitt heldur v1 þar til fyrsta v2 write. V2 read
  getur sýnt það án writes. Eftir upgrade hafna v1 writers með
  `split_upgrade_required`, svo gamall gluggi getur ekki yfirskrifað v2 units.
- Tables/schema halda RLS/FORCE RLS, engum client policies eða table grants.
  Public boundary er SECURITY DEFINER, postgres-owned, empty search_path,
  aðeins service_role EXECUTE. Private helpers eru ekki service-role executable.
- SQL182/183 artifacts eru immutable og byte-hashes óbreytt.

## Breytingar á verkefnalýsingu

- UI-gátt færð úr „bíður“ í staðfest samkvæmt orðum Stebba.
- Current gate færð í SQL184 catalog-only preflight með exact væntum gildum.
- Bætt við að SQL184 installation framkvæmir enga bulk migration og live app
  heldur v1 þar til exact postflight/application cutover.
- Whole-split claim revision tillaga leiðrétt í item revision + own previous
  quantity svo concurrency og stale-price vörn samræmist samþykktu markmiði.
- Bætt final evidence: 304 tests, type/lint/parser, deterministic hashes og
  skýr downgrade-takmörk.
- Skráð að migration sjálf er ekki afhent til keyrslu fyrr en READY hefur verið
  staðfest; engin SQL-keyrsla Codex.

## Skrár sem voru skoðaðar

- C:/Users/Lenovo/Documents/WORKFLOW.md v8, repository AGENTS/WORKFLOW og Design.md.
- Canonical task document og immutable handoffs v020–v033 eftir þörfum.
- SQL182/183 migration, preflight/postflight og artifact generatorar.
- Standalone contracts/actions/server/components/tests og shared Expense
  extraction/allocation contracts. Shared Expense implementation var ekki breytt.
- Lifandi GoLive task var lesið áður en v2-undirbúningur hófst; status var
  in_progress, Codex writer, enginn predecessor blocker.

## Skrár sem voru bættar við

- `sql/184_receipt_split_v2.sql`
- `sql/validation/184-receipt-split-v2/preflight.sql`
- `sql/validation/184-receipt-split-v2/postflight.sql`
- `sql/validation/184-receipt-split-v2/README.md`
- `scripts/receipt-split-v2-artifacts.cjs`
- `scripts/check-receipt-split-v2-sql.py`
- `lib/receipt-split/contracts-v2.ts`
- `lib/receipt-split/session-v2.ts`
- `lib/receipt-split/view-v2.ts`
- `lib/receipt-split/summary-v2.ts`
- `lib/receipt-split/service-v2.server.ts`
- `lib/__tests__/standalone-receipt-v2-compatibility.test.ts`
- `lib/__tests__/standalone-receipt-session-v2.test.ts`
- `lib/__tests__/standalone-receipt-v2-summary.test.ts`
- `lib/__tests__/standalone-receipt-v2-sql.test.ts`
- `lib/__tests__/standalone-receipt-v2-service.test.ts`
- `docs/tasks/expense-receipt-item-claims/application-server-v2-scope.md`
- Þetta handoff.

UI-preview skrár og tests voru skráð í v033. `lib/receipt-split/format.ts` og
messages voru þá breytt. Canonical verkefnalýsing var uppfærð aftur í v034.

## Application/server cutover scope

Fullur cutover er skráður í
`docs/tasks/expense-receipt-item-claims/application-server-v2-scope.md`.
Eftir SQL184 exact postflight á live detail read að flytjast á read_v2; pasted
JSON og provider legacy extraction fara í feature-local v2 adapter; lifecycle
sendir explicit version/scale; UI notar samþykkta preview-board hegðun; v2
summary sýnir reference difference aðskilið. Engin Expense/ÚL tenging bætist við.

Prepared `service-v2.server.ts` sannar session actor, strict input og eitt RPC
kall án retry. Það er ekki `use server` action og er ekki importað live fyrir
postflight. Þessi röð forðast að localhost/Production kalli RPC áður en það er til.

## SQL artifacts og exact hashes

- Migration SHA-256:
  `86cfc392db870d8c18ce4584e6e1bd5f3158b65bf52411f62fef72202b2af330`
- Preflight SHA-256:
  `4873fb9a275b672f1872369622a52c9c9e3327987c02d21231b90d1d1f489a4c`
- Postflight SHA-256:
  `57fdbbf750243aac1b4393bd4d1a7ebcd6809eb47e40cb66d947cf4dda3e04e2`
- SQL182 SHA-256 áfram:
  `80c3810ed9ca4992f0d18edbdef23c85cc7d25c980044da7b20cbb7c6b037a2c`
- SQL183 SHA-256 áfram:
  `7d9aa3fc40d3e282bf6bebe549ce2ea15de16f798bb508799d590d1005afb10a`

Generator keyrður tvisvar; allir þrír SQL184 hashes deterministic=true.

## Skipanir, niðurstöður og exit codes

- `node scripts/receipt-split-v2-artifacts.cjs` → artifacts generated only,
  no database execution, exit 0. Ein fyrstu keyrsla stöðvaðist áður en skrif
  hófust vegna of strangrar string replacement uniqueness; generator lagaður
  þannig að replacement text sé literal. Endanlegar endurkeyrslur deterministic.
- Python312 + pglast 8.4 static parse:
  migration 50 SQL statements/14 PLpgSQL bodies; preflight 2/0;
  postflight 2/0, allt PASS, exit 0. Engin DB-tenging eða SQL-keyrsla.
- `npm.cmd run test:run -- middleware.test standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next
  teskeid-multi-select-pill-filter` → 23 files, 304 tests PASS, exit 0.
- Síðasti focused `npm.cmd run test:run -- standalone-receipt-v2` eftir
  concurrency-leiðréttingu → 4 files, 20 tests PASS, exit 0.
- `npm.cmd run type-check` eftir lokabreytingar → PASS, exit 0.
- Afmarkað `next lint` á v2 contracts/service/summary/tests → PASS, exit 0;
  aðeins Next 16 deprecation notice.
- `git -c core.safecrlf=false diff --check` á task scope → PASS, exit 0.
- Scope search: prepared v2 service/RPC er ekki importað af live app/components.

Ekkert full build var keyrt til að trufla ekki dev `.next` á server Stebba.
Ekkert SQL var keyrt, hvorki local né Production. Engin dev-server stjórn,
provider-köll, commit, push, merge eða deploy.

## Hvað er ekki sannað enn

- SQL184 preflight actual catalog READY.
- Migration apply Success og postflight EXACT_INSTALLED.
- Runtime DB concurrency/permissions eftir uppsetningu.
- Live v2 application cutover og tveggja innskráðra notenda browser-próf.
- Full build/release candidate og Production rollout.

## Localhost checks for Stebbi

SQL184 preflight hefur engin localhost-áhrif. SQL-fríi samþykkti skjárinn er áfram:
http://localhost:3004/preview/splitt-v032. Engin frekari UI-prófun er nauðsynleg
fyrir preflight, en endurhleðsla má áfram endurstilla sýnigögn.

Eftir migration, exact postflight og application cutover fær Stebbi mest þrjú
nákvæm skref fyrir raunverulega v2 vistun: exact þriðjung, owner edit með
öðrum participant og Eftir/Búið/pillusíu. Nota aðeins synthetic gögn og tvo
samþykkjandi Teskeiðarnotendur. Ekki prófa raunverulegar kvittanir, óviðkomandi
aðgang, ÚL/Expense færslu eða eyðingu kæruleysislega.
