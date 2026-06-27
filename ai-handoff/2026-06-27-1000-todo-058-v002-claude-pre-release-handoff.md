# #58 v002 - Pre-release handoff til Codex

**TODO:** #58 - Ferill hlutar á detail-síðu

**Agent:** Claude Code

**Staða:** Implementað, commit `4bbee0d` á `main` locally. Óbirt. SQL59 þarf að keyra á Supabase áður en við deployum.

---

## Hvað var implementað

### SQL59 (`sql/59_get_loan_event_history.sql`)

Nýtt RPC `public.get_loan_event_history(p_actor_id uuid, p_loan_id uuid)`:

- Notar `p_actor_id` (ekki `auth.uid()`) - kall kemur með service_role
- Staðfestir actor í `auth.users`
- Staðfestir að actor sé raunverulegur aðili: `created_by OR lender_user_id OR borrower_user_id`
- Skilar engu ef aðgangur vantar (silent, ekki villa)
- Sækir `source='loans'`, `entity_type='loan'`, `entity_id=p_loan_id` úr `recent_events`
- De-duplicatar eftir `event_key` með `DISTINCT ON`
- Raðar elst fyrst (chronological)
- Skilar: `event_key`, `event_type`, `payload`, `occurred_at`
- Skilar EKKI `user_id` (móttakandi, ekki actor)
- Grants: `service_role` eingöngu

Bætti við index: `recent_events_loans_entity_idx` á `(source, entity_type, entity_id, occurred_at ASC, id ASC)`.

### `lib/recent-events/display.ts` (nýtt)

Sameiginlegur formatting module, tekinn úr `heim/page.tsx`:

- `formatDateStr`
- `buildDetailLines`
- `EVENT_TYPE_TO_KEY`
- `formatEventTimestamp`
- `pickLoanUpdatedLabelKey`
- `getDisplayLocale`

`heim/page.tsx` uppfærð til að nota þennan module.

### `lib/loans/history.server.ts` (nýtt)

`getLoanHistory(admin, loanId, actorId, tHome, tLoans, displayLocale)`:

- Kallar `get_loan_event_history` RPC
- De-duplicatar eftir `event_key` í TypeScript sem öryggisnet
- Formatar rows í `LoanHistoryItem[]` með `label`, `occurredAtLabel`, `detailLines`
- Skilar `[]` á villu, kastar aldrei

### `components/loans/LoanHistory.tsx` (nýtt)

`<LoanHistory rows={...} labels={...} />`:

- Section neðst á detail-síðu með `<h2>Ferill hlutarins</h2>`
- Raðar events með label + timestamp + detail lines
- Empty state ef `rows.length === 0`

### `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`

- Sækir `getLoanHistory` eftir access check (loan finnst í `get_my_loans`)
- Sýnir `<LoanHistory>` neðst, neðan `<LoanCard>`
- Hleður `teskeid.home` translations fyrir event labels

### Messages

Bætt við `history.title` og `history.empty` í `teskeid.loans` í `is.json` og `en.json`.

### Prófanir

```
npm run type-check   ✓
1309 tests passed, 8 todo (42 test files)
```

- `loan-pages.test.tsx`: `getLoanHistory` og `LoanHistory` mock-uð, `getLocale` bætt við `next-intl/server` mock.

---

## Spurningar til Codex

### A. Er SQL DISTINCT ON rétt notað?

```sql
SELECT DISTINCT ON (re.event_key)
  re.event_key, re.event_type, re.payload, re.occurred_at
FROM public.recent_events re
WHERE ...
ORDER BY re.event_key, re.occurred_at ASC, re.id ASC
```

`DISTINCT ON (event_key)` krefst `ORDER BY event_key` sem fyrsta dálk. Við viljum elstu færslu per `event_key` (því actor og counterpart geta fengið event með smá tímasetninga mismun). Outer query raðar síðan eftir `occurred_at ASC`.

### B. Á `entity_type = 'invitation'` events að vera í history?

`loan_invitation_received` er geymd með `entity_type='invitation'`, `entity_id=invitation_id`. Hún er EKKI í history queryinu sem stendur (aðeins `entity_type='loan'` events).

`loan_invitation_accepted` og `loan_invitation_declined` eru geymd með `entity_type='loan'` og eru þar af leiðandi í history.

Erum við sammála um þetta scope?

### C. Á history að birtast á öllum lánum eða bara samþykktum?

Eins og implementað: history birtist á öllum lánum þar sem actor er party. Jafnvel pending/declined/cancelled lán sýna history.

Þetta er víðara en Codex v001 nefndi. Er þetta ásættanlegt?

### D. Er index nógu þróaður?

```sql
CREATE INDEX IF NOT EXISTS recent_events_loans_entity_idx
  ON public.recent_events (source, entity_type, entity_id, occurred_at ASC, id ASC);
```

Þessi index ætti að hjálpa bæði history query og `DISTINCT ON` skipanir.

---

## SQL sem Stebbi þarf að keyra

Keyra allt innihald `sql/59_get_loan_event_history.sql` á Supabase SQL editor, síðan reloada schema cache.

**Vandamál:** Þetta er nýtt fall. Engin gögn breytast. Aðeins DDL + index.

---

## Localhost checks fyrir Stebbi

Eftir SQL59 og deploy:

1. Opna detail-síðu samþykkts láns.
   - Vænt: `Ferill hlutarins` birtist neðst.

2. Breyta `Skila fyrir` og fara aftur á detail-síðuna.
   - Vænt: `Breyttur skiladagur: ...` birtist í history.
   - Vænt: sömu breyting kemur ekki tvisvar.

3. Opna sömu detail-síðu sem mótaðili.
   - Vænt: báðir sjá sama feril.

4. Opna detail-síðu sem óviðkomandi notandi.
   - Vænt: `notFound()` - enginn ferill lekur.

5. Prófa eldra lán með fáar skráðar aðgerðir.
   - Vænt: history sýnir það sem er, töm state ef ekkert.

6. Prófa á 360 og 390 px.
   - Vænt: enginn horizontal overflow, history ýtir ekki LoanCard úr stað.
