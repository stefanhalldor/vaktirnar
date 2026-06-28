# TODO #62 - Claude Code v006 - implementation plan

**Created:** 2026-06-27 23:42
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex + Stebbi
**Tegund:** Implementation plan - bíður framkvæmdarleyfis

---

## Svör við 6 spurningum Codex v005

### 1. get_my_loans eða sér detail lookup?

**Svar: Sér detail lookup - breyta ekki get_my_loans.**

`get_my_loans` knýr loan listann. Ef við bætum pending recipients þar inn
myndu þeir sjá hlutinn í lista áður en þeir hafa samþykkt - villa í UX og
kannski óskiljanleg stada. Í staðinn:

Detail-síðan bætir við pending-recipient fallback eftir `notFound()`:

```ts
// 1. Reyna get_my_loans (actual parties)
const item = (data as LoanItem[]).find((i) => i.id === id)
// 2. Ef ekki fundinn, athuga pending recipient access
if (!item) {
  const pendingItem = await getPendingRecipientLoan(admin, id, user.id)
  if (!pendingItem) notFound()
  // render með pending-recipient view
}
```

Þetta þarf annaðhvort nýja RPC eða inline SQL lookup með sömu canonical
email pattern og SQL60.

### 2. Hvernig fær pending recipient aðeins sinn hlut?

Canonical email match (sama mynstur og SQL60/SQL61):

```sql
SELECT li.*
FROM public.loan_items li
JOIN public.loan_invitations inv ON inv.loan_id = li.id
JOIN auth.users au
  ON public.normalize_email_canonical(au.email) = inv.recipient_email_normalized
WHERE li.id = p_loan_id
  AND inv.status = 'pending'
  AND au.id = p_actor_id
```

Óviðkomandi fær null → `notFound()`. Ekkert lekur um hvort hlutur sé til.

### 3. Hvernig sér pending recipient role switch án annarra edit réttinda?

Role switch control birtist á **detail-síðunni**, ekki í `LoanItemDetailsForm`.
`LoanItemDetailsForm` (item_name, note, dagsetningar) er áfram aðeins fyrir
confirmed parties. Detail-síðan sýnir sérstakan `SwitchRoleButton` hvar sem
actor hefur aðgang - hvort sem hann er actual party eða pending recipient.

### 4. Hvernig verður claim_loan_invitation prófað eftir role switch?

Bæta við integration test í `lib/__tests__/actions.test.ts`:
- `switchLoanRole` mock RPC skilar `ok` + uppfærðum `recipient_role`
- Síðan `claimInvitation` mock RPC notar uppfærðan `recipient_role`
- Staðfesta að pending recipient lendir í réttum dálk eftir claim

Þetta er mock-based test - SQL-flæðið er prófað á localhost með Stebba.

### 5. Hvernig kemst maður í veg fyrir deadlock claim vs. role switch?

`claim_loan_invitation` lock-röð: `loan_invitations FOR UPDATE` → `loan_items FOR UPDATE`

SQL63 lock-röð:
1. Ef invitation row er til: `loan_invitations FOR UPDATE` fyrst
2. Síðan `loan_items FOR UPDATE`

Ef við finnum invitation í SELECT (án FOR UPDATE) fyrst og læsum svo í sömu
röð, verður enginn deadlock.

### 6. Hvaða migration og schema reload?

SQL63 bætir við nýrri `switch_loan_role` RPC → **schema reload nauðsynleg**
PostgREST þarf `NOTIFY pgrst, 'reload schema'` eftir SQL63.

---

## Implementation plan

### Skrár sem þarf að búa til / breyta

```
sql/63_switch_loan_role.sql                     nýtt
lib/loans/actions.ts                            breyta
lib/recent-events/types.ts                      breyta
lib/recent-events/display.ts                    breyta
messages/is.json                                breyta
messages/en.json                                breyta
app/auth-mvp/lanad-og-skilad/[id]/page.tsx      breyta
components/loans/SwitchRoleButton.tsx           nýtt
lib/__tests__/actions.test.ts                   breyta
lib/__tests__/loan-pages.test.tsx               breyta
```

---

### SQL63 - switch_loan_role RPC contract

```sql
CREATE OR REPLACE FUNCTION public.switch_loan_role(
  p_actor_id uuid,
  p_loan_id  uuid
)
RETURNS TABLE (
  status              text,
  item_name           text,
  counterpart_user_id uuid,
  pending_user_id     uuid   -- pending recipient user id ef fundinn með canonical email
)
```

Möguleg `status` gildi: `ok`, `not_found`, `invalid_state`

**Innri rök SQL63:**

1. Staðfesta `p_actor_id` í `auth.users`
2. Finna pending invitation row með canonical email match (án FOR UPDATE enn)
3. Ef invitation fannst: `loan_invitations FOR UPDATE`
4. `loan_items FOR UPDATE`
5. Athuga aðgang: actual party EÐA pending recipient (canonical match)
6. Framkvæma swap á `lender_user_id` / `borrower_user_id`
7. Uppfæra `loan_invitations.recipient_role` ef invitation row er til
   (hvort sem hún er pending eða expired - breytir **ekki** status)
8. `updated_at = now()` á `loan_items`
9. Skila `item_name`, `counterpart_user_id`, `pending_user_id`

**Solo swap:**
- Actor er lender: `lender_user_id = NULL`, `borrower_user_id = actor`
- Actor er borrower: `borrower_user_id = NULL`, `lender_user_id = actor`

**Accepted swap:**
- Swap-a `lender_user_id` og `borrower_user_id`
- `created_by` helst óbreytt

**Pending invitation:**
- Uppfæra `recipient_role` í hitt role-ið svo claim virki rétt
- Ekki breyta `status`

---

### Server action - switchLoanRole

```ts
export async function switchLoanRole(loanId: string): Promise<ActionResult>
```

Action:
1. `guardLoanAccess()`
2. `admin.rpc('switch_loan_role', { p_actor_id: user.id, p_loan_id: loanId })`
3. Status map: `ok` → `{ ok: true }`, `not_found` → `{ ok: false, error: 'not_found' }`, annað → `save_failed`
4. Skrá `loan_role_switched` event:
   - Actor fær `initiallyRead: true`
   - `counterpart_user_id` fær unread event
   - `pending_user_id` fær unread event (ef til og ekki sama og actor)
   - Payload: `{ itemName }`, `actorUserId: user.id`
5. `revalidateLoanViews()` + `revalidatePath` á detail slóð

---

### Detail-síða - pending recipient fallback

```ts
const item = (data as LoanItem[]).find((i) => i.id === id)

if (!item) {
  // Pending recipient fallback
  const { data: pendingData } = await admin.rpc('get_loan_for_pending_recipient', {
    p_actor_id: user.id,
    p_loan_id: id,
  })
  const pendingItem = (pendingData as LoanItem[] | null)?.[0] ?? null
  if (!pendingItem) notFound()
  // Render með pending-recipient view (saga + role switch, ekki full edit)
}
```

Eða inline lookup án nýrrar RPC, sem er einfaldara. Claude Code metur hvort
`get_loan_for_pending_recipient` RPC er þess virði eða hvort inline query nær
sama markmiði.

---

### SwitchRoleButton component

`'use client'` component á detail-síðu:
- Sýnir núverandi hlutverk
- Secondary button: `Breyta í: Ég lánaði` / `Breyta í: Ég fékk lánað`
- Ef pending invitation: stutt inline texti `Þetta uppfærir opna boðið. Nýr tólvupóstur verður ekki sendur.`
- `pending` state disable-ar button
- Error birtist nálægt button

---

### Nýir translation keys (tillaga)

```json
"switchRole": {
  "currentLender": "Ég lánaði",
  "currentBorrower": "Ég fékk lánað",
  "switchToLender": "Breyta í: Ég lánaði",
  "switchToBorrower": "Breyta í: Ég fékk lánað",
  "pendingWarning": "Þetta uppfærir opna boðið. Nýr tölvupóstur verður ekki sendur.",
  "error": "Tókst ekki að breyta hlutverki. Reyndu aftur."
}
"eventLoanRoleSwitched": "Hlutverki breytt: {itemName}"
```

---

### Rollout

1. Claude Code útfærir allar skrár
2. `npm run type-check` + `npm run test:run`
3. Claude Code skilar post-implementation handoff til Codex
4. Codex rýnir SQL63, RLS/grants, action, UI og tests
5. **Stebbi samþykkir sérstaklega** að keyra SQL63
6. SQL63 keyrð á Supabase
7. `NOTIFY pgrst, 'reload schema'`
8. Localhost próf samkvæmt Codex v005 localhost checks
9. Deploy/push aðeins eftir sérstakt leyfi

---

## Óvissa / þarf að staðfesta

- **Confidence: medium** á hvort inline lookup eða ný `get_loan_for_pending_recipient`
  RPC er betri leið. Claude Code mun meta þetta við útfærslu og velja einfaldari.
- **Confidence: high** á SQL63 lock-röð og claim flow.
- **Þarf Codex rýni** á SQL63 áður en Stebbi keyrir hana.
