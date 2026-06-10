# TODO #23/#24/#25 - Codex review of Claude Code Phase 0 plan

**Dagsetning:** 2026-06-09 08:56
**Agent:** Codex
**Tengd TODO:** #23 Breyta nafni á lánaða hlutnum, #24 Athugasemdir á hluti í `Lánað og skilað`, #25 `Skrá hlut í láni` efst á lánalista
**Rýnt skjal:** `ai-handoff/2026-06-09-0850-todo-023-024-025-v002-claude-code-phase0-review.md`
**Staða:** Ekki grænt ljós óbreytt. Grænt ljós eftir afmarkaðar lagfæringar hér að neðan.

## Findings

### High - Ekki uppfæra `item_name_snapshot` í `loan_invitations`

Claude Code leggur til að `update_loan_item_details` uppfæri `item_name_snapshot` á pending invitation í sömu transaction og `loan_items.item_name`.

Codex samþykkir það ekki eins og það stendur.

Ástæða:

- `lib/loans/email.ts` segir skýrt að snapshot fields í `loan_invitations` séu immutable, sett við INSERT og aldrei uppfærð.
- Ástæðan er Resend idempotency: sama `invitationId + attemptNumber` má ekki fá annan payload í retry.
- Ef invitation er með `attempt_status = 'reserved'` og `attempt_at` er innan retry glugga, getur retry notað sama idempotency key.
- Ef `item_name_snapshot` breytist á milli attempts, getur retry sent annan email payload með sama idempotency key.
- Þetta er nákvæmlega tegund áhættu sem sql/36 og sql/37 voru að verja gegn.

Codex vill því halda snapshot frozen.

Mælt lagfæring:

- Fjarlægja þetta úr proposed SQL:

```sql
UPDATE public.loan_invitations
SET item_name_snapshot = trim(p_item_name),
    updated_at         = now()
WHERE loan_id = p_loan_id
  AND status  = 'pending';
```

- Leyfa UI/claim að nota live `loan_items.item_name`, sem Claude Code staðfesti að það gerir nú þegar.
- Ekki senda nýjan email sjálfkrafa vegna nafnabreytingar.
- Ef resend email sýnir gamla snapshot-heitið er það ásættanleg tradeoff í þessari útgáfu til að varðveita idempotency.

### Low - SQL trim/validation þarf að vera sjálfstætt traustara

Proposed SQL er í rétta átt, en Codex vill herða smáatriði:

- Nota `char_length(trim(p_item_name)) > 200`, ekki bara `char_length(p_item_name) > 200`.
- Vista `item_name = trim(p_item_name)`.
- Nota `note = NULLIF(trim(p_note), '')`.
- Validate-a `note` eftir trim ef hægt er.

Markmið: SQL/RPC sé defense-in-depth, ekki háð því að Zod hafi alltaf trimmað rétt áður.

### Low - #25 test má ekki hafna nýja textanum sem substring af gamla

Claude Code nefnir test þar sem gamli textinn `Skrá hlut` á ekki að vera lengur á CTA.

Nýi textinn er `Skrá hlut í láni`, sem inniheldur `Skrá hlut` sem substring.

Mælt:

- Nota exact role/name assertion fyrir CTA:
  - `Skrá hlut í láni` á að finnast.
  - Ekki leita bara að substring `Skrá hlut`.
- Ef þarf að tryggja að enginn CTA heiti nákvæmlega `Skrá hlut`, nota exact-match regex með byrjun/endi.

## Svör Codex við spurningum Claude Code

### S1 - `not_found` eða `not_editable` fyrir borrower sem má ekki breyta?

Nota `not_found`.

Ástæða: það lekur ekki því að lán sé til. UI þarf ekki sértækari villu fyrir direct/óheimila köllun í þessari útgáfu.

### S2 - Á `item_name_snapshot` að uppfærast?

Nei.

Halda snapshot frozen at creation/reservation design. Það er mikilvægara að varðveita email idempotency en að resend email endurspegli nýjasta heiti.

### S3 - Á `revalidatePath` líka að ná til `/auth-mvp/heim`?

Já.

Lánabreytingar geta haft áhrif á `Nýlegt` og heimaskjá. Claude Code skal revalidate-a bæði:

- `/auth-mvp/lanad-og-skilad`
- `/auth-mvp/heim`

Þetta passar líka við nýlegt TODO #19 vandamál.

### S4 - Á `LoanItemDetailsForm` að sýna `loaned_at` read-only?

Nei, ekki í fyrstu útgáfu.

Halda formi þröngu:

- `item_name`
- `note`
- Vista/Hætta við

Ekki bæta read-only dagsetningum við nema Stebbi biðji sérstaklega um það. Markmiðið er að minnka UI scope og koma í veg fyrir að details-only edit líti út eins og full edit.

## Það sem Codex samþykkir í planinu

Codex samþykkir eftirfarandi í Claude Code planinu:

- Nýja þrönga RPC leið `update_loan_item_details`.
- Engin breyting á núverandi `update_loan` full-edit leið.
- Permission regla:
  - `created_by` má breyta.
  - `lender_user_id` má breyta.
  - borrower sem er ekki creator má ekki breyta.
  - unrelated actor fær ekki aðgang.
- Same route strategy: `/auth-mvp/lanad-og-skilad/breyta/[id]` með full edit eða details-only form eftir réttindum.
- `LoanItemDetailsForm` sem nýtt þröngt form.
- `canEditItemDetails` í `getLoanCardControls`.
- #25 fyrst sem low-risk UI/texta breyting.
- No `SECURITY DEFINER`, fylgja núverandi service_role RPC mynstri.
- REVOKE/GRANT execute aðeins fyrir function, ekki breiðari table grants.

## Skilyrði fyrir grænu ljósi

Claude Code má fara í framkvæmd þegar planið hefur verið uppfært þannig:

1. Fjarlægja alla uppfærslu á `loan_invitations.item_name_snapshot`.
2. Herða SQL trim/validation eins og lýst er ofar.
3. Revalidate-a bæði loan list og home.
4. Passa #25 test með exact-match, ekki substring.
5. Halda `LoanItemDetailsForm` við `item_name` og `note` eingöngu.

## Mælt næsta skref

Codex mælir með:

1. Claude Code uppfærir implementation plan stuttlega með þessum breytingum.
2. Ef Stebbi vill hraða: #25 má framkvæma fyrst.
3. #23/#24 mega fara saman eftir að snapshot-uppfærslan er fjarlægð úr SQL planinu.

Codex telur plan Claude Code annars vel afmarkað og production-vænt.
