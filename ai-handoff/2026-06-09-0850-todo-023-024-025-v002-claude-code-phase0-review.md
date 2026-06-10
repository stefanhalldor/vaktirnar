# TODO #23/#24/#25 - Phase 0 review: Claude Code implementation plan

**Dagsetning:** 2026-06-09 08:50
**Agent:** Claude Code (Phase 0 rýni - engar kóðabreytingar)
**Tengd TODO:** #23, #24, #25
**Hlutverk:** Svara Codex Phase 0 spurningum og leggja til nákvæmt plan til staðfestingar

---

## 1. Permission-regla sem Claude Code leggur til

### `update_loan_item_details` -- hverjir mega breyta

| Actor                                    | Má breyta? | Ástæða                                     |
|------------------------------------------|------------|--------------------------------------------|
| `created_by = p_actor_id`                | Já         | Full eigandaéttur                          |
| `lender_user_id = p_actor_id` (ekki creator) | Já     | Lánveitandi þekkir hlutinn sjálfan         |
| `borrower_user_id = p_actor_id` (ekki creator) | Nei  | Lántaki breytti ekki til að fá rétt á nafni |
| Enginn sem er hvorki lender né borrower  | Nei        | get_my_loans sýnir þeim ekki línuna        |

SQL-yfirlit:
```sql
-- Reject if actor is neither created_by nor lender_user_id
IF v_loan.created_by      IS DISTINCT FROM p_actor_id
   AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id THEN
  RETURN 'not_found'; -- not_found preferred over not_editable (no existence leak)
END IF;
```

Þetta passar nákvæmlega við Codex reglur 1-4 í handoff-skjalinu.

Spurning til Codex/Stebba: Er rétt að nota `not_found` eða `not_editable` þegar borrower (sem er ekki creator) reynir? `not_found` gefur ekki til kynna að lánið sé til. Ef UX krefst skýrari villuskilaboða getur það verið `not_editable`, en þá þarf vörpun í server action.

---

## 2. SQL migration

**Næsta númer:** `sql/44_loan_item_details_edit.sql`

`update_loan` er skilgreint í sql/32 og hefur ekki verið snert í sql/33-43. Næsta lausan slóð er sql/44.

### Tillaga að fallinu

```sql
CREATE OR REPLACE FUNCTION public.update_loan_item_details(
  p_actor_id  uuid,
  p_loan_id   uuid,
  p_item_name text,
  p_note      text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_loan public.loan_items;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_actor_id) THEN
    RETURN 'unauthenticated';
  END IF;

  SELECT * INTO v_loan
  FROM public.loan_items
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- created_by OR lender_user_id only
  IF v_loan.created_by      IS DISTINCT FROM p_actor_id
     AND v_loan.lender_user_id IS DISTINCT FROM p_actor_id THEN
    RETURN 'not_found';
  END IF;

  -- Validate item_name
  IF char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200 THEN
    RETURN 'invalid_item_name';
  END IF;

  -- Validate note (NULL is ok; non-null must be <= 1000 chars)
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RETURN 'invalid_note';
  END IF;

  -- Update loan: item_name, note, updated_at ONLY
  UPDATE public.loan_items
  SET item_name  = trim(p_item_name),
      note       = CASE WHEN trim(p_note) = '' THEN NULL ELSE p_note END,
      updated_at = now()
  WHERE id = p_loan_id;

  -- Also update item_name_snapshot on any active pending invitation
  -- so that resend emails reflect the new name.
  UPDATE public.loan_invitations
  SET item_name_snapshot = trim(p_item_name),
      updated_at         = now()
  WHERE loan_id = p_loan_id
    AND status  = 'pending';

  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_loan_item_details(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_loan_item_details(uuid,uuid,text,text)
  TO service_role;
```

**Athuganir:**
- Engin SECURITY DEFINER. Sama mynstur og öll önnur loan RPCs.
- Uppfærir AÐEINS `item_name`, `note`, `updated_at` á `loan_items`.
- Uppfærir `item_name_snapshot` á pending invitations í sömu transaction (sjá kafla 3).
- Uppfærir EKKI `loaned_at`, `due_at`, `returned_at`, `lender_user_id`, `borrower_user_id`.

---

## 3. `item_name_snapshot` -- þarf uppfærslu og af hverju

**Niðurstaða af kóðarýni:**

| Staður sem notar item_name | Gögn                     | Snapshot eða live? |
|----------------------------|--------------------------|--------------------|
| `PendingInvitationCard`    | `invitation.item_name`   | Live (`li.item_name` via join) |
| Claim-síða                 | `item_name`              | Live (`li.item_name` via join) |
| Invitation email (send/resend) | `item_name_snapshot` | **Snapshot** |

`get_my_pending_invitations` og `get_invitation_for_claim` nota báðar `li.item_name` (JOIN á `loan_items`), **ekki** `item_name_snapshot`. Þess vegna mun nafnabreyting sjást strax í UI án kóðabreytinga.

**Vandamál:** `performInvitationSend` les `item_name_snapshot` úr `loan_invitations` og sendir það í email template. Ef notandi breytir `item_name` en resend-ar, mun emailinn innihalda gamla heitið.

**Tillaga:** Uppfæra `item_name_snapshot` á pending invitations í sömu transaction og `update_loan_item_details`. Þetta er:
- Eitt `UPDATE ... WHERE loan_id = p_loan_id AND status = 'pending'` - nær yfir 0 eða 1 row
- Atomic: uppfærir bæði eða ekkert
- Sendir ekki nýjan email
- Þarfnast engra breytinga á `performInvitationSend` eða email templates

Spurning til Codex/Stebba: Er þetta samþykkt? Eða á snapshot að vera "frozen at creation time" og gamla nafnið birtast í resend email?

---

## 4. UI route/form strategy

### Strategi: Ein slóð, tvær forms

**Route:** `/auth-mvp/lanad-og-skilad/breyta/[id]` (óbreytt URL)

**Server component logic (`breyta/[id]/page.tsx`):**

```
1. Sækja item via get_my_loans (actor must be participant)
2. if !item: notFound()
3. if item.is_creator && item.invitation_status !== 'accepted':
     → render LoanForm (full edit, existing behavior)
4. else if item.is_creator || item.my_role === 'lender':
     → render LoanItemDetailsForm (item_name + note only)
5. else:
     → notFound()
```

**Í `LoanCard`:** Nota `canEditItemDetails` í `getLoanCardControls` til að ákvarða hvort pencil sé sýnilegur.

### `canEditItemDetails` í `getLoanCardControls`

Núverandi `getLoanCardControls` input er:
```ts
Pick<LoanItem, 'invitation_status' | 'invitation_attempt_status' | 'can_send_invitation' | 'is_creator'>
```

Þarf að bæta við `my_role`:
```ts
Pick<LoanItem, 'invitation_status' | 'invitation_attempt_status' | 'can_send_invitation' | 'is_creator' | 'my_role'>
```

Ny `canEditItemDetails` regel:
```ts
canEditItemDetails: item.is_creator || item.my_role === 'lender'
```

`canEdit` breytist EKKI:
```ts
canEdit: item.is_creator && item.invitation_status !== 'accepted'
```

**Í `LoanCard`:** Pencil sér þegar `canEdit || canEditItemDetails` (en ef `canEdit` er true, þarf ekki sérstaklega `canEditItemDetails` - same link, same route handles it).

Einfaldara er að breyta pencil condition frá `canEdit` í `canEditItemDetails`:
```tsx
{canEditItemDetails && (
  <Link href={`/auth-mvp/lanad-og-skilad/breyta/${item.id}`} ...>
    <Pencil ... />
  </Link>
)}
```

Þar sem `canEdit` implies `canEditItemDetails` (creator implies creator || lender), þá er þetta öruggt. Route ákvarðar hvort full edit eða details-only sé sýnt.

---

## 5. Skrár sem breytast

### #25 (CTA move + text)

| Skrá | Breyting |
|------|---------|
| `components/loans/LoanList.tsx` | Fjarlægja CTA link neðst |
| `app/auth-mvp/lanad-og-skilad/page.tsx` | Bæta við CTA link efst (ofan pending invitations) |
| `messages/is.json` | `teskeid.loans.newItem`: `"Skrá hlut"` → `"Skrá hlut í láni"` |
| `messages/en.json` | `teskeid.loans.newItem`: `"Add item"` → `"Add loaned item"` |

### #23/#24 (item details edit)

| Skrá | Breyting |
|------|---------|
| `sql/44_loan_item_details_edit.sql` | Ný migration: `update_loan_item_details` |
| `lib/loans/types.ts` | `EditLoanItemDetailsSchema`, bæta `my_role` við `getLoanCardControls` input, bæta `canEditItemDetails` við `LoanCardControls` |
| `lib/loans/actions.ts` | Bæta við `updateLoanItemDetails` server action |
| `components/loans/LoanItemDetailsForm.tsx` | Ný form component (item_name + note only) |
| `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` | Routing logic: full vs. details-only mode |
| `components/loans/LoanCard.tsx` | `canEdit` → `canEditItemDetails` fyrir pencil |

---

## 6. Tests sem verða skrifuð/uppfærð

### Í `lib/__tests__/loans.test.ts`

- `canEditItemDetails` er `true` þegar `is_creator = true`
- `canEditItemDetails` er `true` þegar `my_role = 'lender'` (óháð `is_creator`)
- `canEditItemDetails` er `false` þegar `is_creator = false` og `my_role = 'borrower'`
- `canEdit` hegðar sér óbreytt eftir viðbótina á `my_role` í input

### Í `lib/__tests__/actions.test.ts`

- `updateLoanItemDetails` kallar `update_loan_item_details` RPC með réttum params
- Mappar `not_found`, `not_editable`, `invalid_item_name`, `invalid_note` í `ActionResult`
- `revalidatePath` kallað á `/auth-mvp/lanad-og-skilad` og `/auth-mvp/heim`

### Í `lib/__tests__/loan-pages.test.tsx`

- Creator pre-acceptance: LoanForm birtist (full edit)
- Creator accepted: LoanItemDetailsForm birtist (details-only)
- Lender non-creator: LoanItemDetailsForm birtist
- Borrower non-creator: `notFound()` kallað
- Non-participant: `notFound()` kallað (item ekki í lista)

### Í `lib/__tests__/loans.test.ts` (schema)

- `EditLoanItemDetailsSchema` trim-ar item_name
- Tómt/whitespace item_name hafnað
- Note whitespace → null
- Note > 1000 chars hafnað

### #25 test

- CTA link er efst, notar nýjan texta `Skrá hlut í láni`
- Gamli texti `Skrá hlut` er ekki lengur á neinum CTA
- CTA link fer á `/auth-mvp/lanad-og-skilad/ny`

---

## 7. Áhætta eftir

| Áhætta | Líkur | Meðhöndlun |
|--------|-------|------------|
| `note` stored server-side sem `trim(p_note)` en SQL er með `CASE WHEN trim(p_note) = '' THEN NULL` - hugsa þarf hvort trim á sér stað á server action eða SQL | Lágar | `EditLoanItemDetailsSchema` trim-ar, SQL er extra defense |
| `item_name_snapshot` uppfærsla á pending invitations sér aðeins status='pending'. Ef invitation er 'expired' eða 'cancelled', verður snapshot aldrei uppfærður. En þar sem expired/cancelled invitations verða aldrei sendar aftur, er þetta rétt. | Engin | Uppfærsla á pending er nákvæmlega rétt |
| Resend email eftir nafnabreytingu mun sýna nýja nafnið (snapshot uppfærsla). Ef Stebbi vill að snapshot sé frozen at creation, þarf að sleppa snapshot-uppfærslunni. | Lágar | Spurning til Stebba (kafli 3) |
| `LoanCard` pencil breytist frá `canEdit` í `canEditItemDetails` - lender non-creator mun sjá pencil á accepted loans sem hann gat ekki áður breytt. Þetta er ætluð breyting en þarf staðfestingu. | Meðallágar | Skýrt í plan |
| Engar breytingar á RLS eða grant á töflum | Engin | Öll aðgangsgæsla í RPC |

---

## 8. Spurningar til Stebba/Codex

**S1.** Er `not_found` eða `not_editable` rétt svar þegar borrower (sem er ekki creator) reynir? `not_found` er öruggara (engin existence leak). `not_editable` gefur skýrari skilaboð í UI.

**S2.** Á `item_name_snapshot` að uppfærast þegar nafni er breytt? Eða á snapshot að vera frozen at creation (gamla nafnið í resend email)?

**S3.** Á revalidatePath að ná einnig til `/auth-mvp/heim` þannig að Nýlegt section sé uppfærð með nýju nafni?

**S4.** Á `LoanItemDetailsForm` að sýna núverandi `loaned_at` sem read-only upplýsingar, eða aðeins `item_name` og `note` input fields?

---

## Samantekt: Engar kóðabreytingar byrja fyrr en Stebba og Codex staðfesta

Phase 0 er lokið. Bíð eftir staðfestingu á:
1. Permission-reglunni (S1 hér að ofan)
2. Snapshot-hegðun (S2)
3. revalidatePath scope (S3)
4. LoanItemDetailsForm UI scope (S4)

Ef allt fær grænt ljós: mæli með að framkvæma #25 fyrst (lágt risk, engar SQL migrations) og síðan #23/#24 saman.
