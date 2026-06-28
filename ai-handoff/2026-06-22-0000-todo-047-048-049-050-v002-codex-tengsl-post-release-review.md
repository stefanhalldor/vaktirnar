# Codex-rýni á post-release handoff fyrir TODO #47, #48, #49 og #50

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22  
**Rýnt skjal:** `ai-handoff/2026-06-22-0000-todo-047-048-049-050-v001-claude-tengsl-post-release.md`

## Niðurstaða

Codex myndi ekki samþykkja þetta sem fullklárað post-release ennþá. SQL/RLS-hliðin er almennt varlega hugsuð, en það eru tvö atriði sem þarf að laga eða festa skýrt áður en Stebbi keyrir þetta í production: tengsla-upsert edge-case og per-user gating rollout.

## Findings

### 1. Blokkari: email-only tengsl geta festst þegar viðtakandi finnst síðar sem auth-notandi

**Skrár:** `lib/relationships/actions.ts:60-82`, `lib/relationships/actions.ts:83-107`, `sql/54_relationships.sql:75-77`

Ef samband verður fyrst til sem email-only row, en seinna skilar `getUserByEmail(emailCanonical)` `counterpartUserId`, leitar `upsertLoanRelationship` aðeins að existing row með `counterpart_user_id`. Ef slík row finnst ekki reynir kóðinn að insert-a nýja row með sama `owner_id + email_canonical`.

Það rekst á `relationships_owner_email_canonical_idx`, því email-rowið er þegar til. Þar sem insert-error er ekki meðhöndlaður sérstaklega verður `relationshipId` áfram `null`, source verður ekki bætt við og existing sambandið fær ekki `counterpart_user_id`.

**Áhrif:** Tengslasaga getur orðið ófullkomin nákvæmlega í flæðinu sem Teskeið þarf að þola vel: fyrst er viðtakandi bara netfang, síðar er hann raunverulegur notandi. Þetta er ekki RLS-gat, en þetta er gagnaheilleika- og product-gæði blokkari.

**Tillaga:** Claude Code ætti að breyta upplausninni þannig að kóðinn finni fyrst existing relationship með `owner_id + email_canonical`, og ef `counterpart_user_id` er komið þá uppfæri rowið ef það er tómt. Síðan má leita eftir `counterpart_user_id` sem fallback. Bæta þarf sérstöku unit-prófi fyrir:

- fyrst email-only insert,
- seinni keyrsla finnur counterpart user,
- sama relationship row er uppfært,
- nýr `relationship_sources` row bætist við.

### 2. Miðlungs/hár rollout-risk: `TENGSL_FLAG` er optional þó Stebbi hafi beðið um per-user gating strax

**Skrár:** `lib/loans/guard.ts:60-63`, `.env.example:35-37`, `app/(admin)/admin/page.tsx:1387`

Núverandi hegðun er sama mynstur og Umönnun: ef `TENGSL_ENABLED=true` en `TENGSL_FLAG` er ekki líka `true`, sjá allir innskráðir notendur Tengsl.

Það er tæknilega samræmt við núverandi feature-flag mynstur, en Stebbi ákvað í rýni að per-user gating ætti að vera strax í v1. Þá má þetta ekki ráðast af því að einhver muni stilla annað env-var rétt í Vercel.

**Tillaga:** Fyrir v1 þarf annað hvort:

- setja skýrt í handoff/deploy-checklist að `TENGSL_ENABLED=true` má aldrei fara í production án `TENGSL_FLAG=true`, eða
- breyta `tengsl` branch þannig að per-user gating sé default meðan feature er beta og opnun fyrir alla verði með sér ákvörðun síðar.

Codex hallast að fyrri leiðinni ef Stebbi vill halda sama flag-mynstri og Umönnun, en þá þarf checklist að vera mjög skýr.

### 3. Miðlungs: `upsertLoanRelationship` er ekki nógu idempotent við race conditions

**Skrá:** `lib/relationships/actions.ts:60-126`

Kóðinn gerir select-then-insert fyrir relationships og relationship_sources. Unique indexes verja gegn tvítekningu, en ef tvær keyrslur gerast samtímis getur önnur fengið unique violation og hætt án þess að endurlesa rowið eða búa til source.

**Áhrif:** Aðal lánaflæði brotnar ekki, sem er gott. En tengslasöfnun getur orðið götótt án þess að nokkur taki eftir því.

**Tillaga:** Nota `upsert(..., { onConflict: ... })` þar sem Supabase styður það, eða höndla `23505` með því að lesa rowið aftur. Sama gildir um `relationship_sources`. Prófa duplicate/race-ish idempotency með mockaðri unique violation.

### 4. Miðlungs: Handoff segir `TODOs closed`, en SQL 53/54 er ekki keyrt og Stebbi hefur ekki staðfest localhost

**Skrá:** `ai-handoff/2026-06-22-0000-todo-047-048-049-050-v001-claude-tengsl-post-release.md`

Claude Code segir `TODOs closed: #47, #48, #49, #50`, en sama handoff segir að `sql/53_feature_access_tengsl.sql` og `sql/54_relationships.sql` séu ekki keyrðar. Þá eru #49/#50 ekki raunverulega lokin, og #47/#48 þurfa enn Stebba-staðfestingu á localhost áður en þau færast í `DONE.md`.

**Tillaga:** Halda TODO #47-#50 opnum þar til:

- Stebbi hefur staðfest localhost checks,
- SQL 53/54 hefur verið keyrt með sérstöku samþykki, ef Tengsl á að virkja gagnasöfnun,
- `TENGSL_FLAG=true` rollout-reglan er skýr,
- blokkari #1 er lagaður.

### 5. Miðlungs: `sql/48` er sögð hafa verið keyrð áður, en umhverfi og staðfesting vantar í handoff

**Skrá:** `sql/48_update_loan_with_diff.sql`

Handoff segir að `sql/48_update_loan_with_diff.sql` hafi verið "run manually already" í fyrri session. Það þarf að vera nákvæmara áður en #47 er talið tilbúið: var þetta local Supabase, staging eða production? Var schema cache endurhlaðið ef þurfti? Hver staðfesti að active function body sé nú með `li.status`?

**Tillaga:** Claude Code eða Stebbi ætti að skrá í næsta handoff nákvæmlega hvar SQL 48 var keyrt. Codex mælir ekki með neinni nýrri SQL-keyrslu án sérstöku samþykkis.

### 6. Lágt/miðlungs: Tengsl-detail linkar eru ekki enn raunveruleg "opna þessa færslu" upplifun

**Skrá:** `app/stillingar/tengsl/[id]/page.tsx:23-34`, `app/stillingar/tengsl/[id]/page.tsx:64-68`

Detail-síðan síar `relationship_sources` með `get_my_loans`, sem er örugg leið til að forðast gagnaleka. En linkurinn er bara `/auth-mvp/lanad-og-skilad?id=${loanId}` og birtir textann `Opna lán`.

Ef lána-listinn notar ekki `id` query param til að scrolla/highlighta rétt kort verður þetta ekki sú upplifun sem Stebbi lýsti: að smella á virkni frá Tengsl og opna viðkomandi hlut.

**Tillaga:** Þetta má vera v1 takmörkun, en þarf að prófa sérstaklega. Ef query param er ekki studdur þarf annað hvort að bæta deep-link/highlight við Lánað og skilað eða breyta copy í eitthvað eins og "Opna Lánað og skilað" þar til það er tilbúið.

### 7. Lágt: Engin sértæk unit-próf virðast ná yfir `lib/relationships/actions.ts`

**Skrá:** `lib/relationships/actions.ts`

Prófin sem bættust við eru gagnleg fyrir static SQL, middleware og admin API. Codex fann ekki sértækt test fyrir `upsertLoanRelationship`, `getRelationships` eða `getRelationship`.

**Tillaga:** Áður en þetta er samþykkt ætti Claude Code að bæta að minnsta kosti upsert-prófum fyrir:

- feature access off → ekkert skrifað,
- nýtt email-only tengsl,
- existing email-only tengsl → ný source bætist við,
- email-only tengsl → counterpart user finnst síðar,
- duplicate source veldur ekki villu og býr ekki til tvítekið source,
- `getRelationships` og `getRelationship` eru alltaf scopuð á `owner_id`.

## Það sem lítur vel út

- `sql/54_relationships.sql` veitir ekki `anon` eða `authenticated` beinan aðgang og RLS er virkt á öllum nýjum töflum.
- `relationship_sources` hefur ekki FK á polymorphic source, en detail-síðan reynir að sannreyna aðgang með `get_my_loans` áður en linkar eru sýndir. Það er rétt öryggishugsun fyrir v1.
- `middleware.ts` lokar `/stillingar/tengsl` alveg þegar `TENGSL_ENABLED` er ekki `true`.
- Admin API leyfir bara þekkt feature keys, `umonnun` og `tengsl`, og notar canonical email.
- `sql/53` er lítið og afmarkað constraint-breytingarskjal.

## SQL og Supabase mat

Codex keyrði ekki SQL.

`sql/53_feature_access_tengsl.sql`:

- Breytir aðeins CHECK constraint á `feature_access.feature_key`.
- Hefur ekki áhrif á RLS, grants eða gögn.
- Ætti að keyrast á undan því að admin UI reyni að insert-a `feature_key='tengsl'`.

`sql/54_relationships.sql`:

- Býr til nýjar töflur og ný gögn fara aðeins inn í þær.
- RLS er virkt og grants eru service_role-only.
- Engar policies eru skilgreindar, sem passar við service-role server-side mynstur.
- Helsta áhættan er ekki schema-leki heldur að app-upsert lendi í duplicate/transition edge-case og tapi source upplýsingum.

## Prófanir sem Codex staðfesti

Codex staðfesti eftir handoff-rýni:

```txt
npm run type-check
Exit code: 0

npm run test:run
Exit code: 0
40 test files passed, 1180 tests passed, 22 skipped, 8 todo
```

Athugið: test-run skilaði áfram JSDOM skilaboðum um navigation sem er þekkt test-environment atriði og exit code var samt 0.

## Tillaga að næsta skrefi fyrir Claude Code

Claude Code ætti að gera lítinn follow-up patch áður en Stebbi samþykkir þetta:

1. Laga `upsertLoanRelationship` svo email-only relationship uppfærist þegar counterpart user finnst síðar.
2. Gera insert/upsert idempotency skýrari fyrir relationships og relationship_sources.
3. Bæta unit-prófum fyrir `lib/relationships/actions.ts`.
4. Skýra `TENGSL_FLAG=true` sem skyldu fyrir v1 rollout eða breyta `tengsl` gating þannig að per-user sé default.
5. Uppfæra handoff orðalag úr `TODOs closed` í `implemented, pending Stebbi localhost + SQL approval`.

## Localhost checks for Stebbi

Ekki keyra SQL 53/54 í production án sérstakrar ákvörðunar. Fyrst er öruggast að prófa á localhost/local Supabase eða með greinilega afmörkuðu dev-umhverfi.

### #47 Lán edit

1. Skráðu þig inn sem eigandi láns.
2. Finndu lán sem var stofnað án viðtakanda, t.d. sambærilegt `Gítarstandur?`.
3. Opnaðu edit.
4. Breyttu heiti úr `Gítarstandur?` í `Gítarstandur`.
5. Bættu við viðtakandanetfangi ef UI býður upp á það.
6. Vistaðu.

Vænt niðurstaða: engin almenn villa `Ekki tókst að vista`; heiti vistast; ef netfang er bætt við verður boð til án duplicate virks boðs.

### #48 Root redirect

1. Sem óinnskráður notandi: opna `/`.
2. Sem innskráður notandi: opna `/`.

Vænt niðurstaða: óinnskráður sér lendingarsíðu; innskráður fer á `/auth-mvp/heim`.

### #49/#50 Tengsl flags

1. Með `TENGSL_ENABLED` ekki `true`: opna `/stillingar/tengsl`.
2. Með `TENGSL_ENABLED=true` og `TENGSL_FLAG=true`: opna `/stillingar/tengsl` sem notandi sem er ekki í admin feature access.
3. Bæta sama notanda í admin undir Tengsl-aðgang.
4. Prófa aftur `/stillingar/tengsl`.

Vænt niðurstaða: feature er lokuð þegar global flag er off; með per-user gating kemst aðeins feature-aðgangsnotandi inn.

### Tengsl gagnaflæði

Þessi prófun gildir aðeins eftir að SQL 53/54 hefur verið keyrt í réttu dev/local umhverfi.

1. Sem Stebbi/notandi A: búðu til lán og settu netfang notanda B sem viðtakanda.
2. Opnaðu `/stillingar/tengsl`.
3. Staðfestu að B birtist sem tengsl með taggi `Óflokkaður`.
4. Opnaðu B í Tengsl-detail.
5. Smelltu á lána-source linkinn.

Vænt niðurstaða: tengsl birtist einu sinni, source vísar í rétt lán og linkurinn opnar eða leiðir að réttu Lánað og skilað samhengi.

### Edge-case sem þarf sérstaklega að prófa eftir patch

1. Búðu fyrst til lán á netfang sem á ekki auth-notanda í dev.
2. Staðfestu að email-only tengsl verður til.
3. Láttu sama netfang verða auth-notandi eða mockaðu `getUserByEmail` þannig að það skili user.
4. Búðu til annað lán á sama netfang.

Vænt niðurstaða: sama relationship row er notað, `counterpart_user_id` fyllist inn og nýr source bætist við. Það má ekki verða duplicate relationship eða missa source.
