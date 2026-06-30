# TODO #61 + #38 - Claude Code v002 - Prerelease handoff til Codex

**Created:** 2026-06-28 23:48
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Codex
**Tegund:** Prerelease rýni

---

## Pre-check niðurstaða

### Hvað var þegar til og þarf ekki breytingar

- `claimInvitation` - skráir `loan_invitation_accepted` med `entityType:'loan'`,
  `entityId: loanId`, `actorUserId: user.id` (claimer). Birtist i Saga hlutarins
  via `get_loan_event_history` sem sækir ALL loan-scoped events óháð user_id.
  Ekkert vantar.

- `declineInvitation` - skráir `loan_invitation_declined` med loan scope. Creator
  fær Ólesið event. Recipient `received`-event er ACK-að med
  `ackRecentEventByKey`. Ekkert vantar.

- `performInvitationSend` - skráir `loan_invitation_received` med
  `entityType:'invitation'` (rétt fyrir Ólesið, á ekki i Saga hlutarins).

### Aðalvandi: `addLoanInvitation` skráði ekkert loan-scoped event

Þegar aðila var bætt við hlut (eftir stofnun) birtist ekkert i Saga hlutarins.
Þetta er nú lagað.

---

## Breytingar

### `lib/recent-events/types.ts`
- `loan_party_added` bætt i `RecentEventType` union.

### `lib/recent-events/display.ts`
- `loan_party_added: 'eventLoanPartyAdded'` bætt i `EVENT_TYPE_TO_KEY`.

### `messages/is.json`
- `"eventLoanPartyAdded": "Aðila bætt við: {itemName}"` bætt i `teskeid.home`.

### `messages/en.json`
- `"eventLoanPartyAdded": "Party added: {itemName}"` bætt i `teskeid.home`.

### `lib/loans/actions.ts` — `addLoanInvitation`
Eftir email-send og upsertRelationship:

```ts
const { itemName: partyAddedItemName } = await fetchLoanEventContext(admin, loanId)
await recordRecentEvent({
  userId:        user.id,
  source:        'loans',
  eventType:     'loan_party_added',
  entityType:    'loan',
  entityId:      loanId,
  eventKey:      `loans:loan:${loanId}:party-added:${row.invitation_id ?? new Date().toISOString()}`,
  payload:       partyAddedItemName ? { itemName: partyAddedItemName } : {},
  href:          '/auth-mvp/lanad-og-skilad',
  initiallyRead: true,
  actorUserId:   user.id,
})
```

Athugasemdir:
- `recipient_email` er aldrei i payload.
- `initiallyRead: true` - actor sér ekki sína eigin aðgerð i Ólesið.
- `eventKey` notar `invitation_id` sem stable key til að forðast tviskráningu.
- Eitt event nægir; `get_loan_event_history` skilar þvi bædi aðilum via entity_id join.

### `lib/__tests__/actions.test.ts`
- `setupMockFromForAdd` uppfærð med `maybeSingle` i chain (þarf `fetchLoanEventContext`).
- 2 nýir tests:
  - `records loan_party_added event with loan scope after success`
  - `loan_party_added payload does not include recipient email`

### `lib/__tests__/history-server.test.ts`
- `makeTHome` uppfærð med keys fyrir `eventLoanPartyAdded`,
  `eventLoanInvitationAccepted`, `eventLoanInvitationDeclined`.
- 5 nýir tests:
  - `loan_party_added`: label og actor label
  - `loan_invitation_accepted`: label og actor label
  - `loan_invitation_declined`: label

---

## Test niðurstöður

```
Tests: 1372 passed | 22 skipped | 8 todo (1402)
type-check: clean
```

---

## Engar SQL-breytingar

`get_loan_event_history` (SQL62) sækir nú þegar ALL recent_events med
`source='loans'`, `entity_type='loan'`, `entity_id=<loan_id>` - óháð user_id.
Þetta thar sem eitt event fyrir actor nægir til ad birtast i Saga hlutarins
fyrir bædi aðila.

---

## Spurningar til Codex

1. Er `fetchLoanEventContext` réttur aðferðafræðinn til ad fá itemName, eða
   ætti ad nota `fetchInvitationContext` i staðinn (sem er þegar kallað med
   `row.invitation_id`)?
2. Er `initiallyRead: true` rétt val? Actor er alltaf creator/sendandi, svo
   þeir eiga ekki ad fá ólesin boð frá eigin aðgerð.
3. Er eventKey stabilt og einkvæmt? `loans:loan:${loanId}:party-added:${invitation_id}`
   - invitation_id er UUIDv4 per loan, svo ekki er hægt ad bæta tveim
   invitation_id per loan. Correct?
4. Vantar einhver edge case i tests?

---

## Localhost checks for Stebbi (eftir útgáfu)

1. Búa til hlut án mótaðila.
2. Fara i edit-síðu og bæta við aðila (netfang).
3. Opna detail-síðu hlutarins.
4. Væntar niðurstöður:
   - `Saga hlutarins` sýnir `Aðila bætt við: {nafn hlutarins}`.
   - Actor-lína sýnir hvern framkvæmdi aðgerðina.
   - Netfang viðtakanda birtist EKKI.
5. Sem viðtakandi: opna pending boð og velja `Þekki málið`.
   - `Saga hlutarins` sýnir `Lánaboð samþykkt: {nafn}`.
6. Endurtaka med `Kannast ekki við þetta`.
   - `Saga hlutarins` sýnir `Lánaboði hafnað: {nafn}`.
   - Sendandi fær Ólesið event.
7. Prófa mobile 360-460px: enginn overflow, textar passa.
