# #56 v004 - Pre-release handoff til Codex

**TODO:** #56 - Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Agent:** Claude Code

**Staða:** Implementað, commit `078c60f` á `main` locally. Óbirt. SQL58 þarf að keyra á Supabase áður en við deployum.

---

## Hvað var implementað

### SQL58 (`sql/58_update_loan_item_details_and_dates_with_diff.sql`)

Nýtt RPC `public.update_loan_item_details_and_dates_with_diff`:

- Tekur: `p_actor_id uuid`, `p_loan_id uuid`, `p_item_name text`, `p_note text`, `p_loaned_at date`, `p_due_at date`
- Skilar: `status text`, `before_item_name text`, `before_note text`, `before_loaned_at date`, `before_due_at date`, `counterpart_user_id uuid`
- Heimildir: `created_by OR lender_user_id OR borrower_user_id` (borrower_user_id er aðeins sett eftir claim, svo pending recipient fær `not_found`)
- Notar `p_actor_id` (ekki `auth.uid()`) - kall kemur með service_role
- Notar `date` (ekki `timestamptz`) - sama og sql/30
- Grants: `service_role` eingöngu; revoked frá `PUBLIC`, `anon`, `authenticated`

### `lib/loans/types.ts`

- `EditLoanItemDetailsSchema` fær `loaned_at: dateField` (required) og `due_at` (optional), með `due_at >= loaned_at` validation
- `getLoanCardControls`: `canEditItemDetails` er nú `true` fyrir accepted borrower (`invitation_status === 'accepted'`)

### `lib/loans/actions.ts`

- `updateLoanItemDetails` kallar nú á `update_loan_item_details_and_dates_with_diff` (SQL58)
- Sendir `p_loaned_at` og `p_due_at`
- `computeLoanChanges` tekur með `loaned_at` og `due_at` diff
- `invalid_due_date` bætt við status-athugun

### `components/loans/LoanItemDetailsForm.tsx`

- Bætti `LoanDateField` fyrir `Lánað` og `Skila fyrir` við formið
- Sendir dates í action

### Prófanir

```
npm run type-check   ✓
1309 tests passed, 8 todo (42 test files)
```

Nýjar/uppfærðar prófanir:
- `EditLoanItemDetailsSchema`: Bætti `loaned_at` (required), `due_at >= loaned_at` validation
- `getLoanCardControls`: `true when non-creator accepted borrower (#56)` bætt, `false when non-creator borrower` breytt
- `loan-pages.test.tsx`: `throws notFound for borrower non-creator` → `renders LoanItemDetailsForm for accepted borrower non-creator`
- `actions.test.ts`: Öll `updateLoanItemDetails` köll uppfærð með `loaned_at`, RPC-nafn uppfært

---

## SQL sem Stebbi þarf að keyra

```sql
-- Keyra allt innihald sql/58_update_loan_item_details_and_dates_with_diff.sql
-- á Supabase SQL editor, síðan reloada schema cache.
```

**Varúð:** Þetta er nýtt fall og breytir ekki gögnum. Aðeins DDL.

---

## Spurningar til Codex

### A. Er heimildarlagið rétt?

`borrower_user_id IS DISTINCT FROM p_actor_id` er þriðja skilyrðið í `not_found`-skillyrðinu. Er þetta nógu traust til að koma í veg fyrir að pending recipient fái aðgang?

(Svar: `borrower_user_id` er `NULL` á pending lán; `NULL IS DISTINCT FROM p_actor_id` er `TRUE`, svo pending actor fær `not_found`. Þetta er rétt.)

### B. Á `canEditItemDetails` að vera `true` þegar `invitation_status === null` og `my_role === 'borrower'` og `is_creator === false`?

Núverandi kóði: `!isPendingRecipient && (item.is_creator || item.my_role === 'lender' || item.invitation_status === 'accepted')`.

Ef `invitation_status === null` og `my_role === 'borrower'` og `is_creator === false`: gildi er `false`. Þetta er rétt - lán án invitation á lendingarstiginu eiga ekki að leyfa borrower-edit.

### C. Á óskiladag (due_at) að vera required eða optional?

Hann er optional (nullable) í SQL58 og í schema. Þetta er sama og CreateLoanSchema. Kalla með `null` eyðir skiladegi.

---

## Localhost checks fyrir Stebbi

Eftir SQL58 og deploy:

1. Sem **lánveitandi** á samþykktu láni:
   - Opna edit-penna
   - Breyta `Lánað`-dagsetningu
   - Breyta `Skila fyrir`-dagsetningu
   - Vista
   - Mótaðili á að sjá `Breyttur skiladagur` eða `Breytt lánsdagsetning` í Ólesið

2. Sem **lántakandi** (viðtakandi sem hefur samþykkt / claimed):
   - Opna edit-penna á sama hlut
   - Staðfesta að `Lánað` og `Skila fyrir` séu sýnileg og breytanleg
   - Breyta dagsetningu
   - Vista
   - Lánveitandi á að sjá event í Ólesið

3. Sem **pending viðtakandi** sem hefur ekki samþykkt:
   - Edit-hnappur á ekki að sjást (canEditItemDetails=false)
   - Ef farið beint á breyta-slóð: á að fá 404

4. Á **360-390 px**:
   - Date inputs stækka ekki síðuna
   - Engin iOS zoom

5. Óviðkomandi notandi:
   - Opna breyta-slóð beint: 404

---

## Opið scope

- **#58** Ferill hlutar á detail-síðu - separat TODO, ekki hluti af þessum release
- **#37** bíður á DONE-færslu hjá Codex
