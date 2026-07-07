# #065 v003 - Post-release handoff fyrir Codex

## Staða

Commit `a0d5c1e` er á `main` og push-að.
Vercel build í gangi -- staðfesta að það klárist án villu áður en Localhost checks eru gerðar.

---

## Hvað var gert (Claude Code, 2026-07-01)

### Bug #1 -- `Allt lesið` virkar án ID-caps

**Vandinn:** `ackRecentEvents` hafnaði lista yfir 10 IDs. `Allt lesið` hreinsaði ekkert
ef notandi var með fleiri en 10 ólesin atriði.

**Codex correction (v002):** Hækka cap í 100 er ekki lausn -- það færir buggið
bara á 101 events. Rétt lausn er sér server-side action sem notar ekki client-sent IDs.

**Lausn:**
- Nýr helper `ackAllUnreadRecentEventsForUser(userId)` í `helpers.server.ts` --
  uppfærir allar rows með `user_id = userId AND ack_at IS NULL`, engin ID-listi frá client.
- Nýtt server action `ackAllRecentEvents()` í `actions.ts` -- kallar helpera, revalidatar.
- `RecentSection.handleMarkAll` kallar nú `ackAllRecentEvents()` í stað
  `ackRecentEvents({ event_ids: allIds })`.
- `MAX_IDS` í `ackRecentEvents` er afturbakað í 10 (drawer/single ack þarf aldrei meira).

### Bug #2 -- `isPendingRecipient` 404 á pending lán úr `get_my_loans`

**Vandinn:** Edit-síðan setti `isPendingRecipient = false` og uppfærði það aðeins
í `else`-greininni. Þegar `get_my_loans` skilaði pending-recipient röð (hlutur
fundinn), var flaggið aldrei sett og `notFound()` var kallað.

**Lausn:** Bætt við `isPendingRecipient = item.requires_acknowledgement === true`
inni í `if (item)` greininni.

### Bug #3 -- `loan_invitation_received` sýnir hlutverk-meðvægan texta

**Vandinn:** Alltaf "Lánaboð: {itemName}" óháð hlutverki.

**Lausn:**
- `recipientRole?: 'lender' | 'borrower'` bætt við `RecentEventPayload`.
- `performInvitationSend` setur `recipientRole: preflight.recipient_role`.
- Event guarantor á `/heim` setur `recipientRole: loan.my_role`.
- Label mapping á `/heim` notar role-aware keys:
  - `'borrower'` → `eventLoanInvitationReceivedBorrower` = "Þú varst að fá lánað: {itemName}"
  - `'lender'` → `eventLoanInvitationReceivedLender` = "Þú varst að lána: {itemName}"
  - Fallback (engin `recipientRole`) → `eventLoanInvitationReceived` = "Lánaboð: {itemName}"

---

## Skrár sem breyttust

| Skrá | Breyting |
|------|----------|
| `lib/recent-events/helpers.server.ts` | Nýr `ackAllUnreadRecentEventsForUser` |
| `app/auth-mvp/heim/actions.ts` | `MAX_IDS` → 10, nýtt `ackAllRecentEvents` |
| `app/auth-mvp/heim/RecentSection.tsx` | `handleMarkAll` → `ackAllRecentEvents` |
| `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` | `isPendingRecipient` í `if (item)` |
| `lib/loans/actions.ts` | `recipientRole` í `performInvitationSend` payload |
| `app/auth-mvp/heim/page.tsx` | Guarantor payload + role-aware label mapping |
| `lib/recent-events/types.ts` | `recipientRole` í `RecentEventPayload` |
| `lib/recent-events/display.ts` | `loan_party_added` key (frá #061 pakka) |
| `messages/is.json` | 3 nýjar messages |
| `messages/en.json` | 3 nýjar messages |
| `lib/__tests__/mark-recent-read-action.test.ts` | `ackAllRecentEvents` tests |
| `lib/__tests__/loan-pages.test.tsx` | Regression test Bug #2 |
| `lib/__tests__/home-page.test.tsx` | `ackAllRecentEvents` mock + role-aware tests |
| `lib/__tests__/actions.test.ts` | `recipientRole` í payload assertion |

---

## Próf og gerð

```
248 passed, 5 todo
npm run type-check → clean
```

---

## Hvað Codex á að gera

### 1. Uppfæra TODO.md

Atriðið #65 er ekki skráð í TODO -- það var óformlegur bugfix-pakki.
Engin breyting á TODO þarf nema Stebbi óski eftir því.

### 2. Uppfæra DONE.md

Bæta við:

> **#65** -- Þrír buggar lagaðir: (1) `Allt lesið` virkar án ID-cap með
> server-side `ackAllRecentEvents`. (2) `isPendingRecipient` 404 á pending
> lán úr `get_my_loans` lagað. (3) `loan_invitation_received` sýnir nú
> "Þú varst að fá lánað" / "Þú varst að lána" eftir hlutverki.

### 3. Engin kóðabreyting nema Stebbi tilkynni villa

---

## Localhost checks fyrir Stebbi

### A. `Allt lesið` án caps

1. Búa til fleiri en 10 ólesin atriði (eða prófa með 2-3 og staðfesta að það virki).
2. Smella `Allt lesið`.
3. Listinn á að hverfa strax (optimistic).
4. Eftir refresh: engin atriði komin til baka.
5. Engin console villa.

### B. Pending role-switch -- engin 404

1. Vera viðtakandi á pending lánaboði (ekki smellt á `Þekki málið`).
2. Fara á detail/lista og smella `Leiðrétta hlutverk`.
3. Á: SwitchRoleButton, ekkert edit form.
4. Ekki á: 404.

### C. Role-aware boðatexti í Ólesið

- Fá lánaboð sem **lántakandi**: á að sýna "Þú varst að fá lánað: {hlutur}".
- Fá lánaboð sem **lánveitandi**: á að sýna "Þú varst að lána: {hlutur}".
- Gömul events án `recipientRole`: mega sýna "Lánaboð: {hlutur}" (fallback).
