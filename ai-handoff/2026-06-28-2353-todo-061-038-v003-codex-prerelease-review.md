# TODO #61 + #38 - Codex v003 - Prerelease review fyrir Claude Code

**Created:** 2026-06-28 23:53  
**Timezone:** Atlantic/Reykjavik  
**Fra:** Codex  
**Til:** Claude Code  
**Tegund:** Prerelease rýni á `2026-06-28-2348-todo-061-038-v002-claude-prerelease-handoff.md`

---

## Findings

### Minor 1 - `loan_party_added` ætti að nota first-write-wins idempotency

**Skrá:** `lib/loans/actions.ts`

Claude bætir við `loan_party_added` í `addLoanInvitation` og notar stable
`eventKey` byggðan á `invitation_id`, sem er rétt stefna. En
`recordRecentEvent` notar sjálfgefið `updateOnConflict: true`, þannig að retry
eða double-submit á sama invitation getur uppfært `occurred_at` og fært sama
`Aðila bætt við` event framar í sögu hlutarins.

Þetta er ekki release-blocker, en betra og hreinna fyrir history-logg að fyrsta
skráningin vinni.

**Beiðni til Claude Code:**

Bæta við:

```ts
updateOnConflict: false,
```

í `recordRecentEvent` kallið fyrir `loan_party_added`.

Mælt form:

```ts
await recordRecentEvent({
  userId:        user.id,
  source:        'loans',
  eventType:     'loan_party_added',
  entityType:    'loan',
  entityId:      loanId,
  eventKey:      `loans:loan:${loanId}:party-added:${row.invitation_id}`,
  payload:       partyAddedItemName ? { itemName: partyAddedItemName } : {},
  href:          '/auth-mvp/lanad-og-skilad',
  updateOnConflict: false,
  initiallyRead: true,
  actorUserId:   user.id,
})
```

Athugið: `row.invitation_id` ætti alltaf að vera til eftir successful
`add_loan_invitation`; fallback með `new Date().toISOString()` virðist óþarfur
og væri verri idempotency. Ef Claude vill halda fallbackinu þarf að rökstyðja það.

---

## Mat á v002

Enginn blocker fannst.

Það er rétt hjá Claude að:

- `loan_party_added` þarf að vera loan-scoped event svo það birtist í
  `Saga hlutarins`.
- Ekki þarf SQL migration fyrir nýja event type: `recent_events.event_type` er
  `text` með length-check, ekki enum eða value-check.
- `fetchLoanEventContext(admin, loanId)` er rétt helper fyrir þetta event þar sem
  þetta er loan-scoped history.
- `initiallyRead: true` er rétt fyrir actor, svo eigin aðgerð verði ekki ólesin.
- `loan_invitation_accepted` og `loan_invitation_declined` eru nú þegar
  loan-scoped og ættu að birtast í history gegnum `get_loan_event_history`.
- Payload lekur ekki recipient email.

---

## Svar við spurningum Claude

1. **`fetchLoanEventContext` vs `fetchInvitationContext`:**
   Nota `fetchLoanEventContext`. Þetta event lýsir stöðu hlutarins, ekki email
   boðinu sem slíku.

2. **`initiallyRead: true`:**
   Já. Actor á ekki að fá eigin aðgerð sem ólesna.

3. **Event key:**
   `loans:loan:${loanId}:party-added:${invitation_id}` er rétt og stable. Forðast
   timestamp fallback ef hægt er.

4. **Vantar edge case í tests:**
   Já, bæta við litlu test-i sem tryggir að `loan_party_added` notar
   `updateOnConflict: false`.

---

## Suggested follow-up patch

1. Uppfæra `lib/loans/actions.ts`:
   - bæta `updateOnConflict: false` í `loan_party_added` event call;
   - helst fjarlægja timestamp fallback úr `eventKey`, eða tryggja að function
     skili `save_failed` ef `invitation_id` vantar í successful response.

2. Uppfæra `lib/__tests__/actions.test.ts`:
   - víkka testið `records loan_party_added event with loan scope after success`
     þannig að það asserti:

```ts
updateOnConflict: false,
eventKey: `loans:loan:${LOAN_ID}:party-added:${ADD_INV_ID}`,
```

3. Keyra:

```bash
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/history-server.test.ts
npm run type-check
```

---

## Commands run by Codex

```bash
npm run test:run -- lib/__tests__/actions.test.ts lib/__tests__/history-server.test.ts
npm run type-check
```

Niðurstaða:

- Targeted tests: `2 passed`, `113 passed | 5 todo`
- Type-check: passed

Ég keyrði ekki fulla test suite eftir v002.

---

## Files reviewed by Codex

- `ai-handoff/2026-06-28-2348-todo-061-038-v002-claude-prerelease-handoff.md`
- `TODO.md`
- `DONE.md`
- `lib/loans/actions.ts`
- `lib/recent-events/helpers.server.ts`
- `lib/recent-events/types.ts`
- `lib/recent-events/display.ts`
- `lib/loans/history.server.ts`
- `lib/__tests__/actions.test.ts`
- `lib/__tests__/history-server.test.ts`
- `messages/is.json`
- `messages/en.json`
- `sql/46_recent_events.sql`
- `sql/56_normalize_email_canonical.sql`

---

## SQL / Supabase impact

Engin SQL breyting í þessum pakka.

Rýni:

- `recent_events.event_type` er frjáls `text` dálkur með length-check.
- Engin RLS/grant/auth breyting.
- Engin migration þarf fyrir `loan_party_added`.
- Engin ný persónugögn fara í payload.

---

## Localhost checks for Stebbi

Stebbi prófar eftir að Claude hefur tekið Minor 1 og breytingin er keyrð á
localhost:

1. Opna localhost sem notandi sem má nota `Lánað og skilað`.
2. Búa til hlut án mótaðila.
3. Fara á edit-síðu hlutarins og bæta við aðila með netfangi.
4. Opna detail-síðu hlutarins.
5. Vænt:
   - `Saga hlutarins` sýnir `Aðila bætt við: {nafn hlutar}`.
   - Undirlína sýnir `Framkvæmt af {displayName}`.
   - Netfang viðtakanda birtist ekki í history.
6. Endurhlaða detail-síðuna.
   - Eventið á ekki að tvöfaldast.
7. Prófa að smella aftur/send action ekki meðvitað nema það sé öruggt test-gögn.
   - Ef sama invitation er endurnýtt má history-event ekki færast til í tíma.
8. Sem viðtakandi:
   - Opna pending boð.
   - Velja `Þekki málið`.
   - Vænt: `Lánaboð samþykkt: {nafn}` birtist í `Saga hlutarins`.
9. Endurtaka með öðru test-boði og velja `Kannast ekki við þetta`.
   - Vænt: sendandi fær Ólesið event.
   - Vænt: `Lánaboði hafnað: {nafn}` birtist í sögu hlutarins hjá sendanda.
10. Mobile 360-460 px:
    - Enginn horizontal overflow.
    - History textar passa.
    - Actor line og event label skarast ekki.

Ekki prófa þetta kæruleysislega á mikilvægum production lánum þar sem
history-eventin eru varanleg recent_events rows.

---

## Recommendation

Claude Code: taktu Minor 1, keyrðu targeted tests + type-check, og skilaðu
stuttu v004 handoff. Eftir það ætti þetta að vera tilbúið í Stebba-localhost
prófun og mögulega færa #61/#38 í DONE ef niðurstaðan stenst.
