# TODO #65 - Codex v001 - Ólesið, pending role switch 404 og betri lánaboðatexti

**Created:** 2026-06-30 22:11  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Claude Code  
**Tegund:** Bugfix / implementation handoff  

---

## Samhengi frá Stebba

Stebbi tilkynnti tvær villur og eina textaósk:

1. Þegar mörg skilaboð eru í `Ólesið` og smellt er á `Allt lesið`, hverfa þau í
   hálfa sekúndu en birtast svo aftur. Engin console villa.
2. Ef pending recipient, sem hefur ekki enn smellt á `Þekki málið`, smellir á
   `Leiðrétta hlutverk`, lendir hann á 404.
3. Textinn `Lánaboð: {itemName}` er ekki nógu góður. Betra væri t.d.
   `Þú varst að lána: {itemName}` eða `Þú varst að fá lánað: {itemName}`.

Codex á ekki að framkvæma þessa kóðabreytingu sjálfur samkvæmt hlutverkaskiptingu.
Þetta skjal er handoff til Claude Code.

---

## Design.md rýni

Viðeigandi reglur lesnar:

- Mobile-first og app-upplifun: `Design.md` línur 141-173.
- Touch targets minnst um 40x40 px: lína 168.
- Navigation/link feedback: línur 304-320.
- Texti og controls mega ekki overflowa: línur 123-127 og 163.
- Allur notendatexti á að vera í messages: lína 127.

Þessi bugfix á að vera lítið, afmarkað correction-pass, ekki nýtt stórt UI.

---

## Root cause mat

### Bug #1 - `Allt lesið` kemur aftur

**Skrár:**

- `app/auth-mvp/heim/actions.ts`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/__tests__/mark-recent-read-action.test.ts`
- `lib/__tests__/home-page.test.tsx`

Líkleg root cause:

`ackRecentEvents` hefur `MAX_IDS = 10`:

```ts
const MAX_IDS = 10
...
if (raw.length > MAX_IDS) return { ok: false, error: 'invalid_input' }
```

`RecentSection.handleMarkAll()` sendir hins vegar öll unread event IDs:

```ts
const allIds = rows.map((r) => r.id)
setAckedIds(new Set(allIds))
const result = await ackRecentEvents({ event_ids: allIds })
```

Ef unread rows eru fleiri en 10:

1. UI felur þau optimistic.
2. Server action skilar `invalid_input`.
3. Client fer í `else` og setur `ackedIds` aftur í tómt set.
4. Skilaboðin birtast aftur.
5. Engin console villa, því `invalid_input` er expected branch.

### Bug #2 - pending recipient fer á 404 úr `Leiðrétta hlutverk`

**Skrár:**

- `components/loans/LoanCard.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `lib/loans/types.ts`
- `lib/__tests__/loan-pages.test.tsx`
- `lib/__tests__/loan-card.test.tsx`

`LoanCard` sýnir pending-recipient link:

```tsx
{canSwitchRole && (
  <Link href={`/auth-mvp/lanad-og-skilad/breyta/${item.id}`}>
    {t('switchRole.correctRole')}
  </Link>
)}
```

`getLoanCardControls` setur:

```ts
canSwitchRole: isPendingRecipient
```

Edit-síðan hefur vissulega fallback í `get_loan_for_pending_recipient`, en hún
notar fallbackið aðeins ef item finnst ekki í `get_my_loans`.

Eftir núverandi pending-recipient vinnu getur `get_my_loans` skilað pending row.
Þá gerist þetta:

1. `item` finnst í `get_my_loans`.
2. `isPendingRecipient` helst `false`, því kóðinn setur það bara í fallback branch.
3. `getLoanCardControls(activeItem)` skilar `canEditItemDetails = false`.
4. Lína með `if (!isPendingRecipient && !canEditItemDetails) notFound()` kallar 404.

Fixið er að edit-síðan á að setja `isPendingRecipient` út frá
`activeItem.requires_acknowledgement`, ekki bara út frá fallback branch.

### Textaósk - `Lánaboð`

**Skrár:**

- `messages/is.json`
- `messages/en.json`
- `lib/recent-events/types.ts`
- `lib/recent-events/display.ts`
- `app/auth-mvp/heim/page.tsx`
- `lib/loans/actions.ts`
- `lib/__tests__/home-page.test.tsx`
- mögulega `lib/__tests__/actions.test.ts`

Til að geta sagt rétt:

- `Þú varst að fá lánað: {itemName}`
- `Þú varst að lána: {itemName}`

þarf `loan_invitation_received` event payload að vita hlutverk viðtakanda.
Það má geyma `recipientRole: 'lender' | 'borrower'` í payload. Þetta er ekki PII.

Athugið að eventið er búið til á tveimur stöðum:

1. `performInvitationSend` í `lib/loans/actions.ts`
2. event guarantor á `/heim` í `app/auth-mvp/heim/page.tsx`

Báðir staðir þurfa að setja sama role field, annars gæti textinn orðið generic
eða inconsistent.

---

## Implementation plan

### 1. Laga `Allt lesið`

Mælt einfalt fix:

- Hækka batch-limit í `app/auth-mvp/heim/actions.ts`, t.d. úr `10` í `100` eða
  `200`.
- Halda input validation og ownership check eins og er.
- Bæta test sem sýnir að >10 IDs eru samþykkt.
- Uppfæra eða fjarlægja núverandi test:
  `returns invalid_input when more than 10 IDs provided`.

Möguleg betri útgáfa:

- Nota `MAX_IDS = 100`.
- Ef `raw.length > MAX_IDS`, skila sértækri villu og láta client sýna
  villumeldinguna, ekki bara láta allt birtast aftur þögult.

Ekki þarf SQL.

### 2. Laga pending-recipient 404

Í `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`:

- Setja `isPendingRecipient` eftir að `activeItem` er fundið, t.d.

```ts
let activeItem: LoanItem

if (item) {
  activeItem = item
} else {
  ...
  activeItem = pendingItem
}

const isPendingRecipient = activeItem.requires_acknowledgement
```

eða passa að `isPendingRecipient = item.requires_acknowledgement` þegar `item`
finnst í `get_my_loans`.

Markmið:

- Pending recipient má opna edit-síðuna.
- Pending recipient sér aðeins role-switch control, ekki `LoanForm` eða
  `LoanItemDetailsForm`.
- Actual parties halda sömu edit-reglum og áður.

Bæta regression test í `lib/__tests__/loan-pages.test.tsx`:

- `get_my_loans` skilar pending-recipient row með `requires_acknowledgement: true`.
- `EditLoanPage` á að rendera `SwitchRoleButton`.
- Hún á ekki að rendera edit form.
- Hún á ekki að kasta `NEXT_NOT_FOUND`.

Athugið: Núverandi test coverar bara fallback-tilfellið þar sem `get_my_loans`
skilar ekki item.

### 3. Breyta `Lánaboð` texta í role-aware texta

Mælt íslenskt orðalag:

- Ef recipient role er `borrower`: `Þú varst að fá lánað: {itemName}`
- Ef recipient role er `lender`: `Þú varst að lána: {itemName}`
- Fallback ef role vantar: `Ný skráning: {itemName}` eða halda `Lánaboð: {itemName}`

Mælt enskt orðalag:

- borrower: `You were lent: {itemName}` eða `You borrowed: {itemName}`
- lender: `You lent: {itemName}`
- fallback: `Loan invitation: {itemName}`

Tæknilega:

1. Bæta við payload field í `RecentEventPayload`:

```ts
recipientRole?: 'lender' | 'borrower'
```

2. Í `performInvitationSend`, þar sem `preflight.recipient_role` er þegar til:

```ts
payload: preflight.item_name_snapshot
  ? { itemName: preflight.item_name_snapshot, recipientRole: preflight.recipient_role as 'lender' | 'borrower' }
  : { recipientRole: preflight.recipient_role as 'lender' | 'borrower' }
```

3. Í `/heim` event guarantor, nota `loan.my_role` eða equivalent úr pending row:

```ts
payload: { itemName: loan.item_name, recipientRole: loan.my_role }
```

4. Í `app/auth-mvp/heim/page.tsx` label mapping:

Fyrir `loan_invitation_received`, velja labelKey út frá
`event.payload.recipientRole`.

Möguleg keys:

```json
"eventLoanInvitationReceivedBorrower": "Þú varst að fá lánað: {itemName}",
"eventLoanInvitationReceivedLender": "Þú varst að lána: {itemName}",
"eventLoanInvitationReceived": "Lánaboð: {itemName}"
```

5. Uppfæra `messages/en.json` samhliða.

6. Uppfæra tests:
   - Home renderar borrower texta.
   - Home renderar lender texta.
   - Fallback role-less event renderar generic texta.
   - Existing tests sem leita að `Lánaboð: Borvél` uppfærast eða fá role í payload.

---

## Out of scope

- Ekki breyta SQL.
- Ekki breyta `switch_loan_role` RPC.
- Ekki breyta #64 pillu-UI í þessum pakka nema Stebbi biðji um það sérstaklega.
- Ekki breyta `Þekki málið` / `Kannast ekki við þetta` flæðinu sjálfu.
- Ekki bæta netfangi við recent_events payload.

---

## Suggested tests / commands

Keyra:

```bash
npm run test:run -- lib/__tests__/mark-recent-read-action.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-card.test.tsx
npm run type-check
```

Ef snert er við `lib/loans/actions.ts` payload event creation, bæta við:

```bash
npm run test:run -- lib/__tests__/actions.test.ts
```

---

## Localhost checks for Stebbi

### A. `Allt lesið`

Pre-state:

- Vera með fleiri en 10 unread events í `Ólesið`, helst 12+.

Skref:

1. Opna `/auth-mvp/heim`.
2. Smella á `Allt lesið`.
3. Bíða í 2-3 sekúndur og refresh-a síðuna.

Vænt:

- Events hverfa og birtast ekki aftur.
- Done state birtist.
- Engin console villa.
- Ready Teskeiðar kaflinn helst sýnilegur.

Regression:

- Ef aðeins 1-3 unread events eru til virkar `Allt lesið` áfram.
- `Skoða` / mark one read virkar áfram.

### B. Pending recipient `Leiðrétta hlutverk`

Pre-state:

- Notandi sér pending loan card með `Þekki málið`, `Kannast ekki við þetta` og
  `Leiðrétta hlutverk`.
- Notandi hefur ekki smellt á `Þekki málið`.

Skref:

1. Smella á `Leiðrétta hlutverk`.
2. Staðfesta að `/breyta/[id]` opnist.
3. Smella á role-switch action.
4. Fara til baka á detail/lista.

Vænt:

- Engin 404.
- Pending recipient sér bara role correction, ekki item edit form.
- Eftir role switch sést breytt hlutverk í card/sögu.
- `Þekki málið` og `Kannast ekki við þetta` virka áfram eftir role switch.

Regression:

- Actual party getur áfram breytt hlut.
- Óviðkomandi notandi fær áfram 404/notFound.

### C. Betri boðatexti

Pre-state:

- Búa til tvö pending boð:
  - eitt þar sem Stebbi er borrower / fær lánað
  - eitt þar sem Stebbi er lender / lánar

Skref:

1. Opna `/auth-mvp/heim`.
2. Skoða `Ólesið`.

Vænt:

- Borrower case sýnir `Þú varst að fá lánað: {itemName}`.
- Lender case sýnir `Þú varst að lána: {itemName}`.
- Ekki sést recipient email í unread label eða drawer.
- Texti passar á 360-460 px án overflow.

---

## Notes for Codex review after implementation

Sérstaklega rýna:

- Hvort `MAX_IDS` fixið sé nóg og ekki of opið.
- Hvort pending-recipient edit fixið veikir ekki edit access fyrir óviðkomandi.
- Hvort `recipientRole` payload leki engu persónugreinanlegu.
- Hvort role-aware label notar fallback fyrir eldri `loan_invitation_received`
  events sem vantar role.
- Hvort tests ná bæði `get_my_loans` pending-row og pending fallback.
