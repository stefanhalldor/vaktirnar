# TODO #23/#24/#25 - Combined Codex handoff plan

**Dagsetning:** 2026-06-09 08:02
**Agent:** Codex
**Tengd TODO:** #23 Breyta nafni á lánaða hlutnum, #24 Athugasemdir á hluti í `Lánað og skilað`, #25 `Skrá hlut í láni` efst á lánalista
**Hlutverk:** Claude Code er tæknilegur ráðgjafi og framkvæmdaaðili. Codex er að skila plani og áhætturýni.
**Mjög mikilvægt:** Þetta er ekki grænt ljós á framkvæmd. Claude Code skal fyrst rýna þetta plan, skila eigin mati/handoff til Stebba og bíða eftir staðfestingu frá Codex áður en kóðabreytingar hefjast.

## Stutt niðurstaða

Það er skynsamlegt að taka #23, #24 og #25 saman, en ekki sem eina stóra óvarða breytingu.

- #25 er lítið UI/texta-verk.
- #23 og #24 virðast einföld í UI, en eru auth/RPC-verk undir yfirborðinu.
- Núverandi `update_loan` er viljandi þröngt: creator-only og pre-acceptance only.
- Ekki má breikka núverandi edit-flæði þannig að samþykkt lán eða rangir aðilar geti breytt `loaned_at`, `due_at`, recipient/invitation stöðu eða öðrum lánagögnum.

Codex mælir með nýju, þröngu "item details" flæði fyrir `item_name` og `note`, frekar en að víkka núverandi full-edit action.

## Núverandi staða sem Codex sá

Relevant skrár:

- `app/auth-mvp/lanad-og-skilad/page.tsx`
- `components/loans/LoanList.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/LoanForm.tsx`
- `components/loans/PendingInvitationCard.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `sql/32_loan_functions.sql`
- nýjasta loan migration í repo virðist vera `sql/43_open_loans.sql`

Athuganir:

- `LoanForm` hefur nú þegar `item_name` og `note`.
- `LoanCard` birtir `item.note` ef hún er til.
- `PendingInvitationCard` birtir ekki note.
- `LoanList` er með `+ {t('newItem')}` link neðst, með textalykli `newItem`.
- `messages/is.json` er með `newItem: "Skrá hlut"`.
- `messages/en.json` er með `newItem: "Add item"`.
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` stoppar ef notandi er ekki creator eða ef invitation er accepted.
- `lib/loans/actions.ts:updateLoan` kallar `update_loan` með `item_name`, `note`, `loaned_at`, `due_at`.
- `sql/32_loan_functions.sql:update_loan` er "Pre-acceptance edit by creator only" og uppfærir fleiri svið en #23/#24 þurfa.

## Tillaga að réttindareglu fyrir #23/#24

Claude Code skal rýna þessa reglu sérstaklega og skila athugasemdum áður en framkvæmd hefst.

Codex mælir með þessari fyrstu, þröngu reglu:

1. **Skráningaraðili (`created_by`) má breyta `item_name` og `note`.**
2. **Lánveitandi (`lender_user_id`) má breyta `item_name` og `note` þegar hann er raunverulegur participant á láninu.**
3. **Lántaki má aðeins breyta ef hann er líka skráningaraðili.**
4. **Óviðkomandi innskráður notandi má hvorki lesa né breyta með direct action/RPC.**
5. **Þessi regla má aðeins ná til `item_name` og `note`, ekki dagsetninga, skilastöðu, invitation, recipient eða ownership.**

Ástæða:

- Stebbi bað um "sá sem skráði hlutinn og/eða sá sem lánaði hlutinn".
- Þetta opnar ekki almennan edit-rétt fyrir báða aðila.
- Þetta passar við að lánveitandi þekkir hlutinn sjálfan, en lántaki fær ekki sjálfkrafa rétt til að endurnefna hlut nema hann hafi skráð færsluna.

Ef Claude Code telur að báðir participants eigi að geta breytt `note`, eða að borrower eigi líka að geta breytt `item_name`, skal Claude Code stoppa og spyrja Stebba/Codex áður en kóði er skrifaður.

## Mælt framkvæmd, áfangaskipt

### Áfangi 0 - Claude Code rýnir plan, engar breytingar

Claude Code skal fyrst skoða:

- nýjustu útgáfu `create_loan`, `update_loan`, `get_my_loans`, `get_my_pending_invitations`
- hvort `sql/43_open_loans.sql` er nýjasta migration og hvort næsta migration eigi að vera `sql/44_...`
- hvernig `item_name_snapshot` í `loan_invitations` er notað í email/resend/claim/pending UI
- hvort núverandi tests gera ráð fyrir creator-only edit
- hvort note visibility er nú þegar rétt í `get_my_loans`

Claude Code skal svo skila handoff til Stebba/Codex með:

- nákvæmri permission-reglu sem Claude Code leggur til
- hvort ný SQL migration þarf
- hvaða skrár yrðu snertar
- hvaða tests yrðu uppfærð
- hvaða áhættur eru eftir
- spurningum sem þurfa Stebba/Codex ákvörðun

Ekki hefja framkvæmd fyrr en Codex staðfestir.

### Áfangi 1 - #25 top CTA, lágt öryggisrisk

Markmið:

- Aðgerðin sé efst á `Lánað og skilað`, ekki falin neðst.
- Textinn verði `Skrá hlut í láni`.

Mælt:

- Færa CTA úr botni `components/loans/LoanList.tsx`.
- Setja CTA ofarlega í `app/auth-mvp/lanad-og-skilad/page.tsx`, helst beint undir nav/title og áður en pending invitations/listi byrja.
- Halda einum CTA, ekki tvítaka efst og neðst.
- Uppfæra `messages/is.json` `teskeid.loans.newItem` í `Skrá hlut í láni`.
- Uppfæra `messages/en.json` í náttúrulegan enskan texta, t.d. `Register loan item` eða `Add loaned item`.
- Passa mobile: enginn horizontal overflow, min touch target 44px, texti má ekki þrýsta layouti út fyrir skjá.

Prófa:

- CTA sést án þess að skrolla neðst á 360-460px mobile viewport.
- Smellur fer enn á `/auth-mvp/lanad-og-skilad/ny`.
- Gamli aðaltextinn `Skrá hlut` sé ekki lengur á þessum CTA.

### Áfangi 2 - #23/#24 þröng item-details edit leið

Ekki víkka `updateLoan`/`update_loan` ef það þýðir að fleiri aðilar geta breytt `loaned_at` eða `due_at`.

Mælt:

- Bæta við nýrri server action, t.d. `updateLoanItemDetails`.
- Bæta við nýju validation schema, t.d. `EditLoanItemDetailsSchema`, með aðeins:
  - `item_name`: trim, min 1, max 200
  - `note`: trim, max 1000, empty -> `null`
- Bæta við þröngri UI form component, t.d. `LoanItemDetailsForm`, sem sýnir aðeins:
  - `Hvað var lánað?`
  - `Athugasemd (valfrjálst)`
  - Vista/Hætta við
- Nota ekki fulla `LoanForm` fyrir accepted/participant item-details edit, því hún inniheldur dagsetningar og create/edit semantics sem eru stærri en #23/#24.

Route valkostur:

- Halda `/auth-mvp/lanad-og-skilad/breyta/[id]` sem edit route.
- Ef `item.is_creator && item.invitation_status !== 'accepted'`: núverandi full edit má halda áfram.
- Annars, ef actor má breyta item details samkvæmt nýju reglunni: sýna `LoanItemDetailsForm`.
- Annars `notFound()`.

Þetta heldur einni edit-slóð en aðgreinir full edit frá details-only edit.

### Áfangi 3 - Server/RPC enforcement

Mikilvægt: UI-hnappur má aldrei vera eini varnarveggurinn.

Ef ný permission-regla nær út fyrir núverandi `update_loan`, þarf nýja RPC/function í migration, líklega næsta lausa SQL númer.

Mælt function:

```sql
public.update_loan_item_details(
  p_actor_id uuid,
  p_loan_id uuid,
  p_item_name text,
  p_note text
) returns text
```

Mælt hegðun:

- Staðfesta að `p_actor_id` sé til í `auth.users`.
- Locka `loan_items` row með `FOR UPDATE`.
- Ef row finnst ekki: `not_found`.
- Ef actor er ekki `created_by` og ekki `lender_user_id`: skila `not_found` eða `not_editable`.
- Uppfæra aðeins `item_name`, `note`, `updated_at`.
- Ekki breyta `loaned_at`, `due_at`, `returned_at`, `lender_user_id`, `borrower_user_id`, invitation status eða email fields.
- Validate-a `item_name` og `note` líka í SQL/RPC, ekki bara Zod.
- Fylgja núverandi loan RPC mynstri: appið kallar þetta með service_role server action, ekki beint úr client.
- REVOKE frá `PUBLIC`, `anon`, `authenticated`; GRANT aðeins til `service_role`.
- Ekki veikja RLS eða grants á töflum.

Codex mælir með að nota ekki `SECURITY DEFINER` nema Claude Code hafi skýra ástæðu. Núverandi loan RPC mynstur notar service_role caller og explicit grants.

### Áfangi 4 - Pending invitation snapshot ákvörðun

Þetta er falin áhætta í #23.

Claude Code skal skoða hvort `item_name_snapshot` er notað þegar invitation email er sent/resend eða þegar pending/claim UI er sýnt.

Mælt:

- Ef `item_name` breytist á láni sem er með pending invitation, skal framtíðar UI/resend helst nota nýja heitið.
- Ekki reyna að breyta email sem hefur þegar verið sent.
- Ekki senda nýjan email sjálfkrafa bara vegna nafnabreytingar.
- Ef snapshot er notað fyrir future resend, þarf annaðhvort að uppfæra `item_name_snapshot` fyrir opin pending invitation í sömu transaction eða skýra af hverju það er ekki gert.
- Ekki bæta `note` inn í invitation email eða pending invitation UI án sérstakrar ákvörðunar frá Stebba.

Ef Claude Code telur að snapshot uppfærsla þurfi að snerta núverandi `update_loan` líka, skal það koma fram í plan-review áður en framkvæmd hefst.

## UI/control visibility

`getLoanCardControls` er nú single source of truth fyrir card actions.

Mælt:

- Bæta við nýju control flaggi, t.d. `canEditItemDetails`.
- `canEdit` má áfram þýða "full edit" fyrir creator pre-acceptance.
- `canEditItemDetails` stýrir pencil eða nýjum details-edit action þegar full edit er ekki heimilt.
- Ef sami pencil er notaður, þarf route/form að tryggja details-only mode fyrir accepted/participant cases.

Forðast:

- Að sýna full edit pencil fyrir accepted loans.
- Að fela hnapp en leyfa direct action.
- Að gera `getLoanCardControls` svo flókið að tests verði ólæsileg.

## Note visibility

Codex mælir með einfaldri note, ekki comment-thread.

Mælt fyrsta útgáfa:

- Note er eitt `loan_items.note` textasvið.
- Note sést í `LoanCard` fyrir participants sem fá row úr `get_my_loans`.
- Note sést ekki í pending invitation email/UI nema Stebbi samþykki það sérstaklega.
- Empty/whitespace note vistast sem `null`.
- Of löng note er hafnað client-side og server-side.

## Tests sem Claude Code skal leggja til

### Unit/schema

- `EditLoanItemDetailsSchema` trim-ar item name.
- Empty/whitespace item name hafnað.
- Note whitespace -> `null`.
- Note max 1000.

### Action tests

- `updateLoanItemDetails` kallar rétt RPC með `p_actor_id`, `p_loan_id`, `p_item_name`, `p_note`.
- Mappar `not_found`, `not_editable`, `invalid_item_name`, `invalid_note` í rétt `ActionResult`.
- Revalidates `/auth-mvp/lanad-og-skilad` og mögulega `/auth-mvp/heim`.

### SQL/static tests ef repo heldur áfram því mynstri

- Ný migration inniheldur `update_loan_item_details`.
- Function uppfærir aðeins `item_name`, `note`, `updated_at`.
- Function inniheldur ekki update á `loaned_at`, `due_at`, `returned_at`, `lender_user_id`, `borrower_user_id`.
- Execute grant aðeins `service_role`; revoke frá public/anon/authenticated.
- Permission check fyrir `created_by` og `lender_user_id`.

### UI/component tests

- #25 CTA er efst og notar nýjan texta.
- Bottom CTA er ekki tvítekin.
- Creator pre-acceptance sér full edit.
- Creator accepted sér details-only edit.
- Lender participant sér details-only edit.
- Borrower sem er ekki creator sér ekki edit nema Stebbi samþykki slíkt.
- Note birtist á card þegar til staðar.
- Empty note birtist ekki.

### Manual checks

- Mobile 360-460px: CTA efst, enginn horizontal scroll.
- Ný færsla: note og item name virka áfram.
- Breyta pre-acceptance: full edit virkar áfram.
- Breyta accepted/details-only: aðeins name/note sýnilegt.
- Direct unrelated call/action er hafnað.
- Heimaskjár/recent sýnir nýtt heiti eftir breytingu.

## Stoppskilyrði

Claude Code skal stoppa og skila plan-review ef eitthvað af þessu kemur upp:

1. Lausnin krefst þess að `update_loan` verði víkkað fyrir accepted loans.
2. Það er óljóst hvort borrower má breyta note eða item name.
3. Snapshot/email behavior reynist flóknara en ein transaction uppfærsla.
4. Breytingin krefst RLS veikingar eða breiðari grants.
5. Migration þarf að breyta núverandi gögnum í bulk.
6. Tests sýna að núverandi accepted loan flows brotna.

## Handoff sem Claude Code skal skila áður en framkvæmd hefst

Claude Code skal senda Stebba handoff sem má líma til Codex og inniheldur:

1. Hvaða permission-regla Claude Code leggur til.
2. Hvort ný SQL migration þarf og þá hvaða function/grants hún inniheldur.
3. Hvort `item_name_snapshot` þarf uppfærslu og af hverju.
4. Hvaða UI route/form strategy verður notuð.
5. Hvaða skrár verða breyttar.
6. Hvaða tests verða skrifuð/keyrð.
7. Hvaða áhætta er eftir.
8. Skýrt: engar kóðabreytingar byrja fyrr en Stebbi og Codex staðfesta.

## Codex recommendation

Codex mælir með að Claude Code taki fyrst aðeins Áfanga 0: read-only rýni og eigið implementation plan.

Eftir það getur Stebbi sent plan Claude Code aftur til Codex. Þá getur Codex staðfest hvort öruggt sé að framkvæma #23/#24/#25 saman eða hvort #25 eigi að fara fyrst og #23/#24 sér.
