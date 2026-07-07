# #065 v001 - Prerelease rýni fyrir Codex

## Staða

Allar kóðabreytingar eru tilbúnar á `main` (uncommitted).
243 tests pass, 0 type errors.
**Þetta er prerelease rýni -- Codex á EKKI að commita eða pusha.**

---

## Hvað var gert (Claude Code, 2026-07-01)

Þrír buggar lagaðir í einu releases sem varða `Ólesið`, edit-flæðið og
`loan_invitation_received` merkingar.

### Bug #1 -- `MAX_IDS = 10` í `ackRecentEvents`

**Vandinn:** `ackRecentEvents` server action hafnaði lista yfir 10 IDs með
`invalid_input` án nokkurs villuskilaboðs til notanda. Þegar notandi smellir á
"Allt lesið" eftir að hafa safnað >10 ólesnum events, hreinsast ekkert og
Ólesið-listinn birtist aftur.

**Lagfæring:** `MAX_IDS = 10` → `MAX_IDS = 100` í
`app/auth-mvp/heim/actions.ts`.

**Tests:** `lib/__tests__/mark-recent-read-action.test.ts` uppfærður:
- Endurnefnt próf úr `>10 IDs` → `>100 IDs`
- Nýtt próf: nákvæmlega 100 IDs skilar `{ ok: true }`
- Nýtt próf: 101 IDs skilar `{ ok: false, error: 'invalid_input' }`

---

### Bug #2 -- `isPendingRecipient` sett aldrei í `if (item)` grein

**Vandinn:** Edit-síðan (`app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`)
setti `isPendingRecipient = false` sem sjálfgefið og uppfærði það aðeins í
`else`-greininni (fallback). Þegar `get_my_loans` skilaði pending-recipient
röð (sem gerist þegar hlutur er fundinn), var `isPendingRecipient` alltaf
`false` og `notFound()` var kallað, sem gaf 404.

**Lagfæring:** Bætt við `isPendingRecipient = item.requires_acknowledgement === true`
inni í `if (item)` greininni:

```ts
if (item) {
  activeItem = item
  isPendingRecipient = item.requires_acknowledgement === true  // nýtt
} else {
  // pending-recipient fallback...
  activeItem = pendingItem
  isPendingRecipient = true
}
```

**Tests:** `lib/__tests__/loan-pages.test.tsx`:
- Núverandi próf endurnefnt með `(fallback path)` viðbót
- Nýtt regression próf: `renders only SwitchRoleButton when get_my_loans returns pending-recipient row -- no 404, no edit form`

---

### Bug #3 -- `loan_invitation_received` sýnir alltaf generískan texta

**Vandinn:** `Ólesið` sýndi alltaf "Lánaboð: {itemName}" óháð því hvort
notandinn er lánveitandi eða lántakandi. Notandi sem fær lánað sér "Lánaboð:
Borvél" í stað "Þú varst að fá lánað: Borvél".

**Lagfæring -- þrír þættir:**

**a) `recipientRole` í payload**

`lib/recent-events/types.ts` -- `RecentEventPayload` bætt við:
```ts
recipientRole?: 'lender' | 'borrower'
```

`lib/loans/actions.ts` -- `performInvitationSend()` sendir nú:
```ts
payload: {
  ...(preflight.item_name_snapshot ? { itemName: preflight.item_name_snapshot } : {}),
  recipientRole: preflight.recipient_role as 'lender' | 'borrower',
},
```

`app/auth-mvp/heim/page.tsx` -- event guarantor sendir líka:
```ts
payload: { itemName: loan.item_name, recipientRole: loan.my_role },
```

**b) Hlutverk-meðvæg merking**

`app/auth-mvp/heim/page.tsx` -- label mapping uppfærð:
```ts
if (event.event_type === 'loan_invitation_received' && event.payload.recipientRole) {
  labelKey = event.payload.recipientRole === 'borrower'
    ? 'eventLoanInvitationReceivedBorrower'
    : 'eventLoanInvitationReceivedLender'
} else if (event.event_type === 'loan_updated') {
  labelKey = pickLoanUpdatedLabelKey(event.payload.changes)
} else {
  labelKey = EVENT_TYPE_TO_KEY[event.event_type] ?? event.event_type
}
```

Fallback á generískt `eventLoanInvitationReceived` ef `recipientRole` vantar
(verndar gömul events sem voru skráð áður en þessi breyting kom).

**c) Nýjar messages + display key**

`lib/recent-events/display.ts` -- bætt við `loan_party_added` (vantar tengd
commit-pakka #061):
```ts
loan_party_added: 'eventLoanPartyAdded',
```

`messages/is.json`:
```json
"eventLoanPartyAdded": "Aðila bætt við: {itemName}",
"eventLoanInvitationReceivedBorrower": "Þú varst að fá lánað: {itemName}",
"eventLoanInvitationReceivedLender": "Þú varst að lána: {itemName}"
```

`messages/en.json`:
```json
"eventLoanPartyAdded": "Party added: {itemName}",
"eventLoanInvitationReceivedBorrower": "You were lent: {itemName}",
"eventLoanInvitationReceivedLender": "You lent: {itemName}"
```

**Tests:**
- `lib/__tests__/actions.test.ts`: assertion uppfærð til
  `expect.objectContaining({ itemName: 'Borvél', recipientRole: 'borrower' })`
- `lib/__tests__/home-page.test.tsx`:
  - Nýjar mock messages: `eventLoanPartyAdded`, `eventLoanInvitationReceivedBorrower`, `eventLoanInvitationReceivedLender`
  - Eldra próf endurnefnt: `loan_invitation_received event label -- fallback (no recipientRole)`
  - Nýtt próf: borrower label með `recipientRole: 'borrower'`
  - Nýtt próf: lender label með `recipientRole: 'lender'`

---

## Skrár sem breyttust

| Skrá | Breyting |
|------|----------|
| `app/auth-mvp/heim/actions.ts` | `MAX_IDS` 10 → 100 |
| `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` | `isPendingRecipient` fix í `if (item)` grein |
| `lib/loans/actions.ts` | `recipientRole` í `performInvitationSend` payload |
| `app/auth-mvp/heim/page.tsx` | event guarantor payload + label mapping |
| `lib/recent-events/types.ts` | `recipientRole` í `RecentEventPayload` |
| `lib/recent-events/display.ts` | `loan_party_added` key |
| `messages/is.json` | 3 nýjar messages |
| `messages/en.json` | 3 nýjar messages |
| `lib/__tests__/mark-recent-read-action.test.ts` | MAX_IDS próf uppfært |
| `lib/__tests__/loan-pages.test.tsx` | regression próf Bug #2 |
| `lib/__tests__/home-page.test.tsx` | role-aware label próf + mock messages |
| `lib/__tests__/actions.test.ts` | payload assertion uppfærð |

---

## Próf og gerð

```
npm run test:run -- lib/__tests__/mark-recent-read-action.test.ts \
  lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx \
  lib/__tests__/actions.test.ts
# 243 passed, 5 todo

npm run type-check
# clean
```

---

## Hvað Codex á að gera

### 1. Rýna breytingarnar

Athuga sérstaklega:

- Er `MAX_IDS = 100` eðlilegt hámark, eða er öryggisástæða til að halda því lægra?
- Er `isPendingRecipient = item.requires_acknowledgement === true` rétt í öllum
  tilvikum? Gæti `requires_acknowledgement` verið `true` á skilað láni þar sem
  við viljum EKKI sýna SwitchRoleButton? (Athugaðu `returned_at` check í síðunni.)
- Er fallback-hegðunin fyrir gömul events (án `recipientRole`) eðlileg, þ.e.
  `eventLoanInvitationReceived` key er enn til í messages?
- Er `loan_party_added` key rétt staðsettur í `display.ts`? Þetta var gert sem
  hluti af #061 commit en var ekki sérstaklega rýnt þar.

### 2. Ef vandamál finnast

Búa til `v002` handoff með nákvæmri lýsingu á hverju þarf að leiðrétta.

### 3. Ef allt er eðlilegt

Gefa Stebba leyfi að commita og pusha með tillögu að commit message:

```
fix: max 100 IDs in ackRecentEvents, isPendingRecipient on get_my_loans hit, role-aware invitation labels (#65)
```

---

## Localhost checks fyrir Stebbi (eftir release)

1. **Bug #1:** Safna >10 ólesnum events, smella "Allt lesið" -- listinn á að
   hreinsast í einu.
2. **Bug #2:** Fara á "Leiðrétta hlutverk" á pending lánaboð -- á að sýna
   SwitchRoleButton, EKKI 404.
3. **Bug #3:** Fá lánaboð sem lántakandi -- Ólesið á að sýna "Þú varst að fá
   lánað: {hlutur}" í stað "Lánaboð: {hlutur}".
