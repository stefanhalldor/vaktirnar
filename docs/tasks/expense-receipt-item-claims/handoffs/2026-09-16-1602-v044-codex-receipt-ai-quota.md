# v044 — dagleg myndgreining og admin-undanþágur

Created: 2026-09-16 16:02
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up external ID: `expense-receipt-ai-daily-quota`
GoLive follow-up issue: `bb87bed9-003a-459a-8cb8-f44e3884c9fa`

## Plan áfangans

Takmarka innbyggða myndgreiningu við eitt mögulega gjaldfært kall á íslenskan
dag fyrir hvern staðfestan notanda, veita admin-stýrðar undanþágur og halda
global/burst kostnaðarvörnum fyrir alla, þar með talið undanþegna notendur.

## Hvað var raunverulega gert

- Server sannreynir mynd og extraction-lease áður en quota-reservation er tekin.
- SQL185 reservation er serialized fyrir Reykjavíkurdag og gerist rétt fyrir
  Anthropic-kall. Provider er aldrei kallaður þegar daily/global/burst gate hafnar.
- Venjulegur notandi fær eitt kall á dag. Undanþeginn notandi sleppur dagskvóta
  en fær aðeins eitt lifandi kall og sjálfgefið mest 5 köll á mínútu.
- Sameiginlegt daglegt þak er sjálfgefið 100; env-gildi eru hard-cap-að við
  10.000 global og 20 á mínútu.
- Misheppnuð provider-tilraun heldur quota-reservation. Lease er lokað best-effort
  og útrunninn lease hættir að blokka eftir tvær mínútur.
- Quota/global-höfnun fer á vistaða recovery-síðu og bendir á Leið 2.
- Ný admin section leitar að staðfestum notanda með netfangi og veitir eða
  afturkallar undanþágu sem bindst `user_id`. Admin auðkenni er bundið á server.
- SQL185 migration, read-only preflight/postflight og operator README voru skrifuð.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md`, [GoLive AI connection instructions](https://goliveplaybook.com/ai)
- receipt split actions/contracts/UI/tests og SQL184 predecessor
- admin auth, admin API og admin page patterns
- provider boundary í `lib/expenses/receipt-split.server.ts`
- canonical task og v043 handoff

## Skrár sem voru breyttar

- `.env.example`
- `lib/receipt-split/ai-quota.server.ts`
- `lib/receipt-split/actions.ts`, `lib/receipt-split/contracts.ts`
- `components/receipt-split/SplitImport.tsx`, `SplitBoardV2.tsx`
- `app/auth-mvp/splitta-reikningnum/[draftId]/page.tsx`
- `app/api/admin/receipt-ai-quota/route.ts`
- `components/admin/ReceiptAiQuotaAdminSection.tsx`
- `app/(admin)/admin/page.tsx`
- `messages/is.json`, `messages/en.json`
- `sql/185_receipt_split_ai_quota.sql`
- `sql/validation/185-receipt-split-ai-quota/*`
- þrjár nýjar quota/SQL/admin testskrár og tvær uppfærðar split-testskrár
- canonical task og þetta handoff

## Skipanir og niðurstöður

- Focused Vitest: 5 skrár, 42 próf PASS, exit 0.
- `npm.cmd run type-check`: PASS, exit 0.
- Scoped ESLint á runtime/testskrám: PASS, exit 0.
- Scoped `git diff --check`: PASS; aðeins fyrirliggjandi CRLF warnings.
- GoLive repository client 1.0.29 `projects` og `list`: PASS, HTTP 200;
  repository-bound Codex-tengingin fann Vaktirnar og núverandi aðalmiða.
- GoLive follow-up `create`: PASS, HTTP 201; stofnaði
  `expense-receipt-ai-daily-quota` sem undirlið `expense-receipt-item-claims`,
  issue ID `bb87bed9-003a-459a-8cb8-f44e3884c9fa`.

## Hvað mistókst eða var sleppt

Fyrsta UI-próf þurfti explicit unmount og fyrsta provider-próf async finish-mock;
bæði voru leiðrétt og endurkeyrsla er græn. SQL var ekki keyrt. Enginn dev server,
commit, push, deploy, production env eða provider-kall var framkvæmt.

Fyrri tilraun með gamla repo-adapterinn var röng leið fyrir þessa tengingu og
fór ekki út á net. Rétta leiðin er repository-bound GoLive client með Codex
DPAPI-bindingu. Hún var yfirfarin og notuð til að stofna follow-up miðann.

## Ákvarðanir

- Reservation telur kostnað frá því augnabliki sem provider-kall má hefjast;
  provider-villa endurgreiðir ekki quota sjálfkrafa.
- MIME/stærðarvilla fyrir provider eyðir ekki quota.
- Admin leitar með netfangi en gagnasamningur bindur undanþágu við staðfestan
  `auth.users.id` og geymir audit actor/note/timestamps.
- Undanþága slekkur ekki á global ceiling eða burst/concurrency vörnum.
- UI birtir kostnaðarfyrirvarann eftir notaða/failed tilraun og leiðir strax í
  manual AI-leið, samkvæmt ákvörðun Stebba.

## Áhætta sem er enn til staðar

- SQL185 hefur aðeins static/unit evidence þar til Stebbi keyrir preflight,
  migration og postflight í Supabase.
- Global limit er fjöldatakmark, ekki rauntíma krónukostnaðarreiknir. Modelverð
  getur breyst og env-gildið þarf því rekstrarlegt mat.
- Admin undanþágulisti er óvirkur/fail-closed áður en SQL185 er uppsett.
- GoLive follow-up er stofnaður og tengdur við aðalmiðann.

## Næsta skref og workflow-stopp

**Hard stop við SQL185 preflight.** Stebbi keyrir eingöngu:
`sql/validation/185-receipt-split-ai-quota/preflight.sql`.

Ekki keyra migration fyrr en ein niðurstöðuröð sýnir `operator_state=READY` og
`operator_ok`, `function_ok`, `tables_ok`, `targets_absent` eru öll `true`.

## Spurningar fyrir rýni

- Er 100 global provider-köll á Reykjavíkurdag ásættanlegt upphafsneyðarþak?
- Er tveggja mínútna active-lease expiry hæfileg vörn gegn function crash?
- Á admin að sjá disabled audit history síðar, eða nægir virkur undanþágulisti?

## Supabase / SQL

SQL-skrá: `sql/185_receipt_split_ai_quota.sql`. Hún var aðeins skrifuð og static-
prófuð, ekki keyrð. Hún bætir við tveimur private forced-RLS töflum, fjórum
service-role-only security-definer functions og engum client policies. Engin
fyrirliggjandi gögn eru uppfærð. Auth users eru aðeins foreign-key/verified-email
lookup; engin auth metadata er breytt. Production er ósnert.

## Breytingar á verkefnalýsingu

Canonical task var uppfært með nákvæmum kvótapunkti, Reykjavíkurdegi, hvenær
tilraun telst notuð, post-failure copy, `user_id`-bundinni admin-undanþágu,
global/burst/concurrency mörkum og SQL185 manual gate. GoLive follow-up external
ID, issue ID og tenging við aðalmiðann eru skráð sérstaklega.

## Localhost checks for Stebbi

Ekki er hægt að prófa raunverulegan kvóta á localhost fyrr en SQL185 postflight
er exact og appið notar þann gagnagrunn. Eftir uppsetningu, með synthetic/eigin
myndum:

1. Venjulegur notandi: fyrsta provider-kall má fara af stað; önnur mynd sama
   Reykjavíkurdag kallar ekki provider og opnar recovery með Leið 2.
2. Ógild MIME/stærð fyrir provider á ekki að eyða dagskvóta.
3. Provider-villa eftir reservation eyðir dagskvóta og recovery mælir með Leið 2.
4. Í `/admin`: veittu staðfestu prófnetfangi undanþágu, staðfestu að annað kall
   sama dag sé leyft, afturkallaðu og staðfestu að næsta kall sé hafnað.
5. Prófaðu tvo samtímis smelli hjá undanþegnum notanda; aðeins eitt provider-kall
   má hefjast. Ekki hækka global env-gildi fyrir prófið.
6. Staðfestu mobile UI við 360/390/460 px: quota texti, Leið 2, admin email/note
   og takkar mega ekki zooma, overflowa eða missa focus eftir keyboard.

Notaðu ekki raunveruleg viðkvæm kvittunargögn. Ekki prófa gegn production eða
keyra provider-loop. Admin undanþága og usage-gögn eru notendagögn; notaðu aðeins
eigin prófnotanda.

## Óvissa / þarf að staðfesta

Confidence er hátt á application boundary, fail-closed hegðun og static SQL
contract. GoLive follow-up er staðfestur; runtime SQL correctness bíður næstu
handvirku preflight-gáttar.
