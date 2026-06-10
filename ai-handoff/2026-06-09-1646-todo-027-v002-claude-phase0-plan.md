# TODO #27 — Soft acknowledgement: Phase 0 technical plan

**Dagsetning:** 2026-06-09
**Agent:** Claude Code
**Staða:** Phase 0 plan — til Codex review áður en útfærsla

## Staðfestar vörulegar ákvarðanir (Stebbi 2026-06-09)

1. Pending boð rennur **ekki** út (expire-logic er fjarlægð fyrir pending rows)
2. Viðtakandi **má** merkja hlut skilaðan áður en hann þekkir málið
3. Viðtakandi **má** breyta item_name og note áður en hann þekkir málið
4. Eftir "Kannast ekki við þetta" hverfur hluturinn **strax**
5. Creator **á** að sjá að viðtakandi hefur ekki þekkt málið ennþá
6. Pending invitations birtast í listanum strax eftir deploy (derived read-model, engin gögn eyðilögð)

---

## Hvað breytist í stuttu máli

Í dag: recipient sér boð á sérstakri pending section og þarf að "claim-a" áður en lánið birtist í lista.

Eftir #27: lánið birtist **strax** í `LoanList` fyrir recipient með tvær aðgerðir: `Þekki málið` / `Kannast ekki við þetta`. Pending section hverfur.

---

## SQL — sql/45_loan_soft_ack.sql

Eitt migration:

### Breyting á `get_my_loans`

Bæta við UNION ALL sem skilar pending invitation rows þar sem `recipient_email_normalized = actor email`:

```sql
-- Existing: lender_user_id = p_actor_id OR borrower_user_id = p_actor_id
-- New UNION ALL: pending invitations where email matches actor AND not expired AND not declined/cancelled

UNION ALL
SELECT
  li.id,
  li.item_name,
  li.note,
  li.loaned_at,
  li.due_at,
  li.returned_at,
  inv.recipient_role                           AS my_role,
  creator_au.display_name                      AS other_display_name,
  inv.id                                       AS invitation_id,
  'pending'::text                              AS invitation_status,
  NULL::text                                   AS invitation_attempt_status,
  false                                        AS can_send_invitation,
  false                                        AS is_creator,
  true                                         AS requires_acknowledgement
FROM public.loan_invitations inv
JOIN public.loan_items li ON li.id = inv.loan_id
JOIN auth.users actor_au ON actor_au.id = p_actor_id
  AND actor_au.email = inv.recipient_email_normalized
LEFT JOIN public.profiles creator_au ON creator_au.id = li.created_by
WHERE inv.status = 'pending'
  AND inv.recipient_email_normalized = (
    SELECT email FROM auth.users au WHERE au.id = p_actor_id
  )
  -- exclude loans where actor is already a direct participant
  AND li.lender_user_id IS DISTINCT FROM p_actor_id
  AND li.borrower_user_id IS DISTINCT FROM p_actor_id
```

### Pending rows expire ekki

Pending invitation rows (þ.e. `requires_acknowledgement = true`) rata inn í listann þar til:
- `inv.status` verður 'accepted' (eftir `Þekki málið`)
- `inv.status` verður 'declined' (eftir `Kannast ekki við þetta`)
- `inv.status` verður 'cancelled' (creator cancels)

Expiry logic (expires_at) heldur áfram að gilda á **send_invitation_email** og **reserve_invitation_send** — þ.e. á email flæðið, ekki á visibility.

`get_my_loans` filter: `inv.status = 'pending'` — engin expires_at check hér.

### Nýr dálkur í return type: `requires_acknowledgement`

Dálkurinn er `boolean`. Default `false` fyrir núverandi rows.

---

## `lib/loans/types.ts`

Bæta við `requires_acknowledgement: boolean` í `LoanItem` interface.

Bæta við `canAcknowledge: boolean` í `LoanCardControls`:
```ts
canAcknowledge: item.requires_acknowledgement === true
```

Bæta við nýjum reglum í `getLoanCardControls`:
- `canEdit`: `item.is_creator && invitation_status !== 'accepted' && !item.requires_acknowledgement`
- `canDelete`: sama
- `canEditItemDetails`: `(item.is_creator || item.my_role === 'lender') && !item.requires_acknowledgement`
  - ATH: Stebbi sagði já við #3 — recipient má breyta — þá er `canEditItemDetails` **true** jafnvel þótt `requires_acknowledgement` sé true. Codex verður að staðfesta þetta.
- `showSendInvite`, `showCancelInvite`, `showAddParty`, `showInviteSent`: óbreytt (þetta eru creator controls)
- Nýtt: `canMarkReturned: item.bothPartiesJoined || item.requires_acknowledgement` — þ.e. viðtakandi má merkja skilað meðan á pending stigi

---

## `lib/loans/actions.ts`

Engar nýjar server actions þarf — `claimInvitation` og `declineInvitation` eru þegar til.

Þarf að revalidatePath('/auth-mvp/heim') bætt við `claimInvitation` og `declineInvitation` (líkt og `updateLoanItemDetails`).

---

## `components/loans/LoanCard.tsx`

Þegar `canAcknowledge` er `true`:

```tsx
{canAcknowledge && (
  <div className="flex gap-2">
    <button onClick={handleClaim} ...>
      {t('acknowledgeYes')}  {/* Þekki málið */}
    </button>
    <button onClick={handleDecline} ...>
      {t('acknowledgeNo')}   {/* Kannast ekki við þetta */}
    </button>
  </div>
)}
```

Þegar `canAcknowledge` er `true`:
- Header sub-text: sýna "Ný skráning frá {other_display_name}" í stað role + name
- `markReturned` button: sýna (Stebbi sagði já við #2)
- `undoReturn` button: sýna
- Edit pencil: sýna ef `canEditItemDetails` (Stebbi sagði já við #3)
- Delete: fela
- Send/cancel invite: fela

LoanCard þarf `handleClaim` og `handleDecline` functions (kallar á `claimInvitation` / `declineInvitation`).

---

## `app/auth-mvp/lanad-og-skilad/page.tsx`

Fjarlægja `get_my_pending_invitations` RPC call og `PendingInvitationCard` section — þetta er nú hluti af `get_my_loans`.

```tsx
// Fjarlægja:
const [loansResult, invitationsResult] = await Promise.all([...])

// Verður:
const { data, error } = await admin.rpc('get_my_loans', { p_actor_id: user.id })
```

`PendingInvitationCard` component verður ónotað — má eyða eða skilja eftir.

---

## `app/auth-mvp/heim/page.tsx` — Nýlegt

`requires_acknowledgement = true` rows eiga að birtast í Nýlegt.

Þetta er sjálfkrafa ef `computeRecentReadKey` inniheldur `invitation_id` og `invitation_status` (sem það gerir núna samkvæmt `recent-read.server.ts`).

`RecentSection` rows þurfa að verða smellanlegar (`<Link>` í staðinn fyrir `<div>`).

Target: `/auth-mvp/lanad-og-skilad` (scrollar notanda til lánalistans). Fancy anchor/highlight er Phase 2 — Phase 1 er bara linkurinn.

---

## `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`

Halda þessari route — email deep links nota hana.

Uppfæra copy: `Þekki málið` / `Kannast ekki við þetta` í stað `Samþykkja` / `Hafna`.

---

## Messages

Bæta við `teskeid.loans`:
```json
"acknowledgeYes": "Þekki málið",
"acknowledgeNo": "Kannast ekki við þetta",
"pendingAckStatus": "Ný skráning frá {name}"
```

```json
"acknowledgeYes": "I know about this",
"acknowledgeNo": "I don't recognise this",
"pendingAckStatus": "New entry from {name}"
```

---

## Öryggi

- Nýi UNION ALL branch í `get_my_loans` les aðeins þar sem `actor.email = inv.recipient_email_normalized` — sama security boundary og `get_my_pending_invitations`
- Engar nýjar GRANT/REVOKE þarf — `get_my_loans` er þegar service_role only
- `claimInvitation` og `declineInvitation` eru óbreyttar — þær framfylgja réttindum sjálfar
- `requires_acknowledgement` rows hafa `is_creator: false` og `can_send_invitation: false` — creator controls birtast ekki

---

## Rollback

Þar sem þetta er UNION ALL viðbót við `get_my_loans` (ekki breyting á grunntöflum), er rollback einfalt: fjarlægja UNION ALL hlutann og endurkeyra. Engin gögn eyðileg.

---

## Prófanaráætlun

- Recipient með pending invitation sér hlutinn í `LoanList` (ekki pending section)
- Recipient sér hlutinn í Nýlegt og getur smellt á linkinn
- Recipient getur smellt `Þekki málið` → hlutur verður accepted loan
- Recipient getur smellt `Kannast ekki við þetta` → hlutur hverfur
- Recipient getur merkt hlut skilaðan á pending stigi (Stebbi #2)
- Recipient getur breytt item_name/note á pending stigi (Stebbi #3)
- Creator sér pending status þar til viðtakandi þekkir málið
- Rangt email getur ekki séð pending rows
- Óviðkomandi notandi getur ekki séð eða breytt pending rows
- Expired/cancelled/declined invitations birtast ekki í LoanList
- Nýlegt key inniheldur invitation_id → ólesið eftir deploy
- tsc og vitest pass

---

## Opið til Codex review

1. Á `canEditItemDetails` að vera `true` fyrir `requires_acknowledgement` rows? (Stebbi sagði já)
2. Á `markReturned` að vera leyfilegt fyrir `requires_acknowledgement` rows? (Stebbi sagði já)
3. Er UNION ALL í `get_my_loans` rétt approach eða ætti að búa til nýtt RPC?
4. Á `get_my_pending_invitations` að haldast til bakhjáls eða má fjarlægja?
5. Expiry: Codex spurði hvort rows ættu að renna út. Stebbi sagði nei. Er þetta rétt að skilja sem "pending rows í LoanList renna ekki út, en email-sending hefur enn expire logic"?
