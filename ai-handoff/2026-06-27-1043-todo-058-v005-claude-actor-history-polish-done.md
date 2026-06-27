# #58 v005 - Actor í ferli og fallegri history-rammi -- lokið

**TODO:** #58 - Ferill hlutar á detail-síðu
**Agent:** Claude Code
**Tilefni:** Handoff v004 frá Codex -- actor metadata og UI-polish.
**Staða:** Implementað og type-check + tests fóru í gegn. SQL60 þarf að keyra.

---

## Hvað var implementað

### 1. actorUserId í event payloads

`RecordEventArgs` fékk optional `actorUserId?: string`. Inni í `recordRecentEvent`
er það merge-að inn í payload:

```ts
const mergedPayload = args.actorUserId
  ? { ...args.payload, actorUserId: args.actorUserId }
  : args.payload
```

`actorUserId: user.id` bætt við öll viðeigandi `recordRecentEvent` köll í
`lib/loans/actions.ts`:

- `createLoan` -- `loan_created`
- `updateLoan` -- `loan_updated` (actor + pending recipients)
- `markReturned` -- `loan_returned` (actor + counterpart)
- `undoReturn` -- `loan_return_undone` (actor + counterpart)
- `deleteLoan` -- `loan_deleted`
- `claimInvitation` -- `loan_invitation_accepted` (actor er sá sem samþykkir)
- `declineInvitation` -- `loan_invitation_declined` (actor er sá sem hafnar)
- `updateLoanItemDetails` -- `loan_updated` (actor + counterpart)

`loan_invitation_received` fær EKKI actorUserId -- hún birtist ekki í history
(entity_type='invitation').

### 2. SQL60 uppfært

`sql/60_get_loan_event_history_pending_access.sql` var uppfært til að:

- Bæta `actor_display_name text` við RETURNS TABLE
- Nota LATERAL filter til að lesa `actorUserId` úr payload á öruggan hátt
  (UUID regex validate)
- LEFT JOIN `public.profiles` til að fá `display_name`

SQL60 inniheldur nú bæði:
- Pending recipient access (upprunalegt markmið SQL60)
- Actor display name í niðurstöðu

### 3. history.server.ts uppfært

- `RawHistoryRow` fékk `actor_display_name: string | null`
- `LoanHistoryItem` fékk `actorLabel?: string`
- `tLoans` parameter updated to `(key: string, params?: Record<string, string>) => string`
- `actorLabel` er reiknað úr `tLoans('history.actor', { name: row.actor_display_name })`
- Ef actor vantar (gömul events) -- `actorLabel` er `undefined` og línan birtist ekki

### 4. LoanHistory.tsx -- hvítur rammi og actor lína

Nýr design:
```tsx
<section className="bg-white border border-black/5 rounded-2xl p-4 flex flex-col gap-3">
  <h2 className="text-sm font-semibold text-[#1b1c19]">...</h2>
  ...
  <p className="text-sm font-medium text-[#1b1c19]">{row.label}</p>
  <p className="text-xs text-[#72796e]">{row.occurredAtLabel}</p>
  {row.actorLabel && <p className="text-xs text-[#72796e]">{row.actorLabel}</p>}
  ...
</section>
```

Passar sjónrænt við LoanCard (rounded-2xl, hvítur, létt border).

### 5. Messages

Bætt við `history.actor` í bæði `is.json` og `en.json`:

```json
"actor": "Framkvæmt af {name}"   // is
"actor": "Done by {name}"        // en
```

### 6. Detail page

`tLoansFn` uppfærð til að senda params:
```ts
const tLoansFn = (key: string, params?: Record<string, string>) =>
  tLoans(key as Parameters<typeof tLoans>[0], params as Parameters<typeof tLoans>[1])
```

---

## SQL sem Stebbi þarf að keyra

**Keyra `sql/60_get_loan_event_history_pending_access.sql` á Supabase SQL editor.**

Þetta er `CREATE OR REPLACE` -- breyting á `get_loan_event_history` function sem
SQL59 bjó til. Eftir að SQL60 er keyrt þarf að reloada PostgREST schema cache
(eins og venjulega eftir DDL breytingar).

Mikilvægt: SQL60 breytir return type á function (bætir við `actor_display_name`).
App-kóðinn gerir ráð fyrir þessum dálki. Ef SQL60 hefur EKKI verið keyrt
þegar app er deployað mun history hleðsla mistakast (en ekki brjóta detail-síðuna
-- `getLoanHistory` skilar `[]` á villu).

---

## Prófanir

```
npm run type-check   ✓  (exit 0)
npm run test:run     ✓  (42 test files, 1309 passed, 22 skipped, 8 todo)
```

Engar breaking changes á existing tests -- `actorUserId` er separate field á
`RecordEventArgs`, ekki inni í `payload` sem tests skoða, svo payload checks eru
óbreyttar.

---

## Localhost checks fyrir Stebbi

Eftir SQL60 og schema cache reload (og deploy):

1. Smella á `Merkja sem skilað` á samþykktu láni.
   - Vænt: ný history-færsla birtist með `Framkvæmt af [þitt nafn]`.

2. Breyta nafni eða athugasemd via `LoanItemDetailsForm`.
   - Vænt: breyting í history sýnir actor-nafn.

3. Opna sama lán sem mótaðili.
   - Vænt: mótaðili sér sömu history með sama actor-nafni.
   - Vænt: engin netföng eða user-IDs birtast.

4. Skoða eldra lán (events frá því áður en actor metadata var til).
   - Vænt: history birtist -- `Framkvæmt af` línan vantar bara þar sem
     actorUserId er ekki í payload. Ekkert brotnar.

5. Prófa pending lánaboð sem viðtakandi.
   - Vænt: detail-síða opnast og history birtist (SQL60 gefur access).

6. Prófa 360 px og 390 px.
   - Vænt: hvítur history-rammi ýtir ekki LoanCard úr stað, enginn overflow.

---

## Skrár breyttar

- `lib/recent-events/types.ts` -- `actorUserId` í `RecentEventPayload`
- `lib/recent-events/helpers.server.ts` -- `actorUserId` í `RecordEventArgs`, merge í payload
- `lib/loans/actions.ts` -- `actorUserId: user.id` á öll viðeigandi events
- `sql/60_get_loan_event_history_pending_access.sql` -- pending access + actor_display_name
- `lib/loans/history.server.ts` -- `actorLabel` í `LoanHistoryItem`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` -- `tLoansFn` með params
- `components/loans/LoanHistory.tsx` -- hvítur rammi, actor lína
- `messages/is.json` + `messages/en.json` -- `history.actor`
- `lib/__tests__/loan-pages.test.tsx` -- `history.actor` í mock

---

## Næstu skref

1. Stebbi keyrir `sql/60_get_loan_event_history_pending_access.sql` á Supabase.
2. Stebbi reloadar PostgREST schema cache.
3. Stebbi samþykkir localhost checks.
4. Claude Code committar og pushar #58.
5. Codex flytur #56 og #58 í DONE.md.
