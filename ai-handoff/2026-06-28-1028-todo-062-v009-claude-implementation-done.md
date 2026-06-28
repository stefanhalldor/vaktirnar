# TODO #62 - Claude Code v009 - útfærsla lokið

**Created:** 2026-06-28 10:28
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex + Stebbi
**Tegund:** Post-implementation handoff - bíður Codex rýni á SQL63

---

## Samhengi

Þetta skjal svarar:

- `ai-handoff/2026-06-28-0951-todo-062-v008-codex-pending-view-decisions.md`

Stebbi gaf framkvæmdarleyfi: "Claude Code, framkvæmdu #62".

---

## Hvað var samþykkt

Útfærsla á loan role switch (#62) með:

- Detail access fyrir pending recipients (via pending recipient fallback)
- `switch_loan_role` RPC með lock order sem passar `claim_loan_invitation`
- `get_loan_for_pending_recipient` RPC með canonical email match
- `SwitchRoleButton` component á detail-síðu
- Explicit permissions via `requires_acknowledgement: true` (frá v008/Codex)
- Saga hlutarins event (`loan_role_switched`)
- Ólesið notifications (counterpart og pending recipient)

---

## Hvað var gert

### Nýjar skrár

**`sql/63_switch_loan_role.sql`**
Tvær RPCs:
- `get_loan_for_pending_recipient(p_actor_id, p_loan_id)` — skilar LoanItem-löguðum row fyrir pending recipients
- `switch_loan_role(p_actor_id, p_loan_id)` — skilar `(status, item_name, counterpart_user_id, pending_user_id)`

**`components/loans/SwitchRoleButton.tsx`**
Client component. Sýnir núverandi hlutverk og "Breyta í: ..." takka. Tekur `labels` frá server component (enginn `useTranslations` inni í client component).

### Breyttar skrár

**`lib/recent-events/types.ts`**
Bætti `'loan_role_switched'` við `RecentEventType`.

**`lib/recent-events/display.ts`**
Bætti `loan_role_switched: 'eventLoanRoleSwitched'` við `EVENT_TYPE_TO_KEY`.

**`lib/loans/actions.ts`**
Bætti `switchLoanRole` action við. Kallar `switch_loan_role` RPC, skráir events fyrir actor (initiallyRead: true), counterpart og pending recipient (báðir ef !== actor).

**`messages/is.json`**
- `eventLoanRoleSwitched: "Hlutverki breytt: {itemName}"` (í teskeid.home)
- `switchRole: { currentLender, currentBorrower, switchToLender, switchToBorrower, pendingWarning, error }` (í teskeid.loans)

**`messages/en.json`**
Sömu nýju lyklar á ensku.

**`app/auth-mvp/lanad-og-skilad/[id]/page.tsx`**
- Pending recipient fallback: ef `get_my_loans` finnur ekki hlutinn, kallar `get_loan_for_pending_recipient`
- `SwitchRoleButton` sýnd á milli `LoanCard` og `LoanHistory` fyrir alla notendur með aðgang
- `activeItem` notar annaðhvort actual party row eða pending recipient row

**`lib/__tests__/actions.test.ts`**
6 ný tests fyrir `switchLoanRole`.

**`lib/__tests__/loan-pages.test.tsx`**
- Mock fyrir `SwitchRoleButton`
- Mock fyrir `switchLoanRole`
- 3 ný tests: pending recipient fallback, notFound á tveimur tómum svörum, SwitchRoleButton sýnd

---

## Tæknileg útfærsla

### Permission model

Pending recipient fær `requires_acknowledgement: true` frá `get_loan_for_pending_recipient`. `getLoanCardControls` túlkar þetta sem `isPendingRecipient = true` og felur edit/delete/return. Engar breytingar þurftu á `LoanCard` eða `getLoanCardControls`.

### Lock order í SQL63

`switch_loan_role` leitar að invitation án lás fyrst, læsir svo invitation FOR UPDATE → loan_items FOR UPDATE. Þetta passar `claim_loan_invitation` og kemur í veg fyrir deadlock.

### Pending recipient check

Canonical email match: `public.normalize_email_canonical(au.email) = public.normalize_email_canonical(inv.recipient_email_normalized)`. Sama mynstur og SQL60/SQL62.

### Notifications

- Actor: `initiallyRead: true` (sér í sögu, fær ekki Ólesið)
- Counterpart (actual party): fær unread event ef `counterpart_user_id !== actor`
- Pending user: fær unread event ef `pending_user_id !== null && !== actor`

SQL skilar `pending_user_id = NULL` ef engin pending invitation er til (t.d. accepted tilfelli). TypeScript action skoðar og sendir ekki ef null.

---

## Hvað er EKKI gert (og þarf sérstakt leyfi)

- SQL63 er EKKI keyrð á Supabase
- Schema reload er EKKI keyrt
- Ekkert er committa eða push-að
- Ekkert er deployed

---

## Niðurstöður prófana

```
Tests  1318 passed | 22 skipped | 8 todo (1348)
TypeScript: no errors
```

---

## Beiðni til Codex

Rýna SQL63, einkum:

1. Lock order í `switch_loan_role` - er hann rétt miðað við `claim_loan_invitation`?
2. Pending recipient check - er canonical email match rétt útfærð?
3. Er `get_loan_for_pending_recipient` samræmd við Branch 2 í `get_my_loans`?
4. Flippin á `recipient_role` - er hún rétt bæði fyrir actual party og pending recipient?
5. `pending_user_id` lookup - er hún öruggt? (LIMIT 1, no data leak)
6. RLS/grants - báðar RPCs eru REVOKE frá PUBLIC/anon/authenticated, GRANT til service_role
7. Er hægt að villa permission á detailpage? (T.d. get óviðkomandi via pending fallback?)

---

## Localhost checks (frá Codex v008)

Þessar athuganir er hægt að keyra eftir að SQL63 hefur verið keyrt og schema reloadað:

1. Opna pending boð sem pending recipient - lítur út eins og detail-síðan, Breyta/Eyða/Merkja skilað sjást EKKI, SwitchRoleButton sést
2. Smella á role switch sem pending recipient - hlutverkið breytist, enginn nýr tölvupóstur
3. Velja "Þekki málið" eftir switch - claim virkar, pending recipient lendir í réttum dálk
4. Opna sama hlut sem creator - creator heldur aðgangi, sér switch event í sögu
5. Opna beinan detail link sem óviðkomandi - notFound
6. Prófa mobile breiddir 360, 390 og 460px

---

## Óvissa / þarf að staðfesta

- **Confidence: high** á TypeScript kóðanum (type-check hrein, tests grænir)
- **Confidence: medium** á SQL63 - þarf Codex rýni áður en Stebbi keyrir hana
- **Þarf Stebbi samþykki** á: SQL63 keyrslu, schema reload, commit, push, deploy
