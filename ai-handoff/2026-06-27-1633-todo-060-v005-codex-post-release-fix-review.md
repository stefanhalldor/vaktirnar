# #60 v005 - Codex post-release fix og rýni

**TODO:** #60 - Spjall sem hluti af sögu hlutar  
**Samhengi:** Claude Code gaf út `c0c5042` áður en Stebbi hafði samþykkt síðasta rýnihring og áður en SQL61 var keyrt.  
**Staða eftir þessa skrá:** Lítið öryggisfix komið í kóða. SQL61 er enn ókeyrt og spjall er feature-flagged off sjálfgefið.

## Findings

### 1. Blocker lagaður: spjallform mátti birtast áður en SQL61 var keyrt

Claude handoff sagði að chatformið væri ekki sýnilegt fyrr en SQL61 væri keyrt. Það var rangt. `LoanHistory` renderaði `LoanChatForm` alltaf, þannig að production hefði getað sýnt form sem kallar ótilbúið `create_loan_chat_message` RPC.

**Lagað:** `LoanHistory` tekur nú `chatEnabled` prop og renderar `LoanChatForm` aðeins þegar það er `true`. Detail-síðan sendir `chatEnabled={process.env.LOAN_CHAT_ENABLED === 'true'}`.

### 2. Blocker lagaður: server action mátti kalla ótilbúið RPC

Jafnvel þótt formið sé falið getur eldri client bundle, handvirkt kall eða race kallað `sendLoanChatMessage`. Áður hefði það reynt að kalla RPC sem er ekki til ef SQL61 er ókeyrt.

**Lagað:** `sendLoanChatMessage` hættir strax með `{ ok: false, error: 'feature_disabled' }` ef `LOAN_CHAT_ENABLED !== 'true'`. Þá er hvorki `guardLoanAccess` né Supabase RPC kallað.

### 3. SQL61 virðist ekki þurfa revert, en á ekki að keyra fyrr en Stebbi samþykkir

Ég las `sql/61_loan_chat_messages_in_history.sql`. Það inniheldur atriðin úr v003 rýninni:

- `loan_chat_messages` með RLS enabled og service_role-only grants
- index á `(loan_id, created_at, id)` fyrir virk skilaboð
- `create_loan_chat_message` með SQL60-líkum access check
- `get_loan_event_history` með `UNION ALL`
- explicit final column list, ekki `SELECT *`
- `loan_chat_message` síað út úr `recent_events` event_rows svo skilaboð birtist ekki tvöfalt
- rollback og deploy order í header

Niðurstaða: ekki revert-a bara vegna SQL61. En ekki keyra SQL61 fyrr en Stebbi biður sérstaklega um það og við höfum tekið formlega pre-release rýni.

## Hvað var breytt af Codex

- `components/loans/LoanHistory.tsx`
  - bætti við `chatEnabled?: boolean`
  - felur `LoanChatForm` sjálfgefið
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
  - sendir `chatEnabled` út frá `LOAN_CHAT_ENABLED`
- `lib/loans/actions.ts`
  - `sendLoanChatMessage` stoppar áður en RPC er kallað ef feature flag er off
- `.env.example`
  - skráir `LOAN_CHAT_ENABLED=false` með athugasemd um SQL61 og schema cache
- `lib/__tests__/loan-pages.test.tsx`
  - prófar að chat sé off sjálfgefið og on aðeins með flaggi
- `lib/__tests__/actions.test.ts`
  - prófar að `sendLoanChatMessage` kalli ekki RPC þegar flaggið er off

## Prófanir keyrðar

- `npm run type-check` - stóðst
- `npm run test:run -- lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts` - 2 files passed, 136 passed, 5 todo
- `npm run test:run` - 42 files passed, 1312 passed, 22 skipped, 8 todo

## SQL / Supabase

SQL61 var ekki keyrt. Engin Supabase, production, auth, RLS, grants eða notendagögn voru snert af Codex.

Núverandi örugg staða:

- `LOAN_CHAT_ENABLED` vantar eða er ekki `true`: spjallformið birtist ekki og server action kallar ekki RPC.
- Þegar Stebbi vill virkja spjall: keyra SQL61, reload-a PostgREST schema cache, staðfesta RPC visibility, setja `LOAN_CHAT_ENABLED=true`, deploya, prófa localhost/production varlega.

## Localhost checks for Stebbi

Áður en SQL61 er keyrt:

1. Opna `/auth-mvp/lanad-og-skilad/{loanId}` á localhost með venjulegu láni.
2. Vænt niðurstaða: `Saga hlutarins` birtist, en ekkert skilaboðaform sést.
3. Prófa að saga hlutarins sýni eldri events áfram.
4. Regression: detail-síða, back-linkur, edit og mark-returned aðgerðir eiga að virka óbreytt.

Eftir að SQL61 hefur verið keyrt og schema cache endurhlaðið, en aðeins ef Stebbi samþykkir:

1. Setja `LOAN_CHAT_ENABLED=true` í viðeigandi env og endurræsa/deploya appið.
2. Opna accepted lán þar sem báðir aðilar hafa aðgang.
3. Skrifa skilaboð í `Saga hlutarins`.
4. Vænt niðurstaða: skilaboðin birtast einu sinni í sögunni, með nafni og tíma.
5. Skrá inn sem hinn aðilinn.
6. Vænt niðurstaða: `Ólesið` sýnir ný skilaboð, en skilaboðatextinn lekur ekki í `Ólesið`.
7. Prófa pending invitation ef við ætlum að leyfa það: creator sendir skilaboð, pending recipient sér/svarar og réttur aðili fær unread.
8. Prófa mobile 360px, 390px og 460px með lyklaborð opið og lokað. Enginn zoom, ekkert overflow, ekkert overlap.

Ekki nota production service-role key í screenshots, handoff, logs eða chat. Ekki keyra SQL61 á production nema Stebbi samþykki það sérstaklega.

## Workflow regla héðan

Fyrir næsta stærra skref á #60:

1. Claude Code má ekki framkvæma eða deploya eftir Codex review fyrr en Stebbi hefur svarað skýrt.
2. Ef SQL, Vercel, Supabase, production eða env-flögg koma við sögu þarf sérstaka leyfisbeiðni með áhættuskýringu.
3. Handoff þarf að segja nákvæmlega hvort SQL var bara skrifað eða líka keyrt.
4. Codex review þarf að vera annað hvort:
   - `samþykkt til framkvæmdar`, eða
   - `samþykkt með skilyrðum`, og þá má ekki framkvæma fyrr en skilyrðin hafa verið felld inn og Stebbi hefur samþykkt.
5. Eftir útgáfu þarf post-release handoff og Stebbi-localhost checks áður en TODO fer í DONE.

## Næsta skref

Skila þessari stöðu til Stebba og leyfa honum að ákveða:

- halda kóðanum með `LOAN_CHAT_ENABLED=false` og bíða með SQL61, eða
- fara í formlega SQL61 pre-release rýni og virkjunarplan.
