# TODO #62 - Claude Code v004 - tæknileg rýni á Codex v003

**Created:** 2026-06-27 22:57
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex
**Tegund:** Tæknileg rýni - engin framkvæmd

---

## Samhengi

Rýni á Codex v003 handoff með kóðakönnun á:
- `sql/32_loan_functions.sql` (claim_loan_invitation, get_my_loans)
- `sql/60_get_loan_event_history_pending_access.sql`

---

## Svör við spurningum Codex v003

### 1. Er scopið nógu skýrt til að skrifa implementation plan?

Nánast - en eitt stórt tæknilegt gat þarf að leysa fyrst (sjá neðar).

### 2. Hvernig á SQL63 að meðhöndla expired pending invitation?

**Staðfest:** `claim_loan_invitation` (SQL32, lína 446-450) athugar `expires_at <
now()` og skilar 'expired' - óháð `recipient_role`. Þess vegna er öruggt að
uppfæra `recipient_role` á expired invitation þegar role switch á sér stað.
Claim mun samt mistakast rétt vegna expiry-athugunar. Uppfæra `recipient_role`
án tillits til `expires_at` (svo lengi sem `status = 'pending'`).

### 3. Hvernig tryggjum við að claim_loan_invitation virki rétt eftir uppfært recipient_role?

**Góðar fréttir:** `claim_loan_invitation` les `recipient_role` dynamically frá
`loan_invitations` row við claim-tíma (SQL32, línur 472-479):

```sql
IF v_inv.recipient_role = 'lender' THEN
  UPDATE public.loan_items SET lender_user_id = p_actor_id ...
ELSE
  UPDATE public.loan_items SET borrower_user_id = p_actor_id ...
END IF;
```

Ef SQL63 uppfærir `recipient_role` rétt við switch, mun claim setja pending
recipient í réttan dálk sjálfkrafa. **Engin breyting þarf á claim_loan_invitation.**

Self-claim athugun er einnig örugg eftir switch:
- Pending recipient er ekki í `lender_user_id` eða `borrower_user_id` enn þá.
- Eftir switch á solo-láni: creator færist í hinn dálkinn, hinn dálkur verður NULL.
- Claim pending recipient í NULL dálk - sjálfkrafa rétt. ✓

### 4. Þarf get_my_loans eða detail edit access að breytast?

**Þetta er stærsta tæknilega vandinn sem þarf að leysa.**

`get_my_loans` (SQL32, línur 310-311) skilar aðeins lánum þar sem:

```sql
WHERE li.lender_user_id = p_actor_id
   OR li.borrower_user_id = p_actor_id
```

**Pending recipients eru ekki í þessum dálkum.** Þeir eru hvergi í
`get_my_loans` niðurstöðum.

Detail-síðan (`app/auth-mvp/lanad-og-skilad/[id]/page.tsx`) notar:
```ts
const { data } = await admin.rpc('get_my_loans', { p_actor_id: user.id })
const item = (data as LoanItem[]).find((i) => i.id === id)
if (!item) notFound()
```

**Pending recipient sem reynir að opna detail-síðuna fær `notFound()`.**

Þetta þýðir að role switch UI sem Codex v003 leggur til á detail/edit síðunni
er óaðgengilegur pending recipients í dag.

#### Tvær mögulegar lausnir:

**A. Takmarka V1 við confirmed parties einungis**
Role switch leyfist ekki pending recipient í V1. Einfaldara og öruggara.
Pending recipient þarf að bíða eftir claim og gera switch eftir það.

**B. Bæta pending recipient access við detail-síðuna**
Uppfæra detail-síðuna til að athuga pending recipient access samhliða
`get_my_loans`, líkt og `get_loan_event_history` gerir. Þetta er meira verk
og breytir aðgangsreglum á detail-síðunni.

**Confidence: high** að þetta er raunveruleg hindrun. `get_my_loans` inniheldur
pending recipients ekki og detail-síðan kallar `notFound()`.

Codex þarf að ráðleggja Stebba hvora leið hann vill.

### 5. Hvaða tests þarf fyrir pending recipient role switch?

Ef við leyfum pending recipient access (leið B):
- `switchLoanRole` mock test: pending recipient fær `ok`
- `switchLoanRole` mock test: óviðkomandi fær `not_found`
- Detail page test: pending recipient sér role switch action
- claim_loan_invitation eftir switch: pending recipient pristane í réttum dálk

Ef við takmarkum við confirmed parties (leið A):
- `switchLoanRole` mock test: pending recipient fær `not_found` eða sérstaka villu
- Einfaldari test suite

---

## Önnur tæknileg findings

### Claim flow eftir swap á accepted láni - örugt

Þegar bæði `lender_user_id` og `borrower_user_id` eru skráð og swap-ast:
- `loan_invitations.status = 'accepted'` - claim er þegar lokið
- `already_claimed` athugun í claim er óviðeigandi
- Swap hefur engin áhrif á claim flow ✓

### already_claimed eftir switch - örugt

`already_claimed` athugun (SQL32, línur 469-470):
```sql
IF v_inv.recipient_role = 'lender'   AND v_loan.lender_user_id   IS NOT NULL THEN RETURN 'already_claimed';
IF v_inv.recipient_role = 'borrower' AND v_loan.borrower_user_id IS NOT NULL THEN RETURN 'already_claimed';
```

Eftir solo switch: NULL dálkurinn er rétt NULL þar sem pending recipient á
eftir að fylla hann. Þetta virkar rétt ✓

### Lock order í SQL63

SQL32 `claim_loan_invitation` læsir fyrst `loan_invitations FOR UPDATE`, síðan
`loan_items FOR UPDATE`. SQL63 þarf að nota **sömu lock-röð** til að forðast
deadlock: `loan_invitations` fyrst ef við uppfærum `recipient_role`, síðan
`loan_items`.

---

## Tillaga Claude Code

Skýra þarf hvora leið Stebbi vill áður en framkvæmd hefst:

**Leið A (mælt með fyrir V1):** Leyfa aðeins confirmed parties að skipta hlutverki.
Pending recipient þarf að claim fyrst. Einfaldara, öruggara, minni breyting.
Skilaboð í UI: "Þú þarft að samþykkja hlutinn fyrst til að breyta hlutverki."

**Leið B (fullur scope eins og Stebbi lýsti):** Pending recipient fær aðgang
að detail-síðu og role switch. Meiri vinna - þarf access-breytingar á detail
route, öryggisrýni á nýjan aðgangsramma og fleiri tests.

---

## Óvissa / þarf að staðfesta

- **Óvíst hvort Stebbi vill leið A eða B.** Confidence: low. Þarf skýringu.
- **Ef leið B:** Óvíst hvort `get_my_loans` á að breytast eða hvort detail
  page á að nota sérstaka pending-recipient lookup samhliða. Confidence: medium.
- **Lock order:** SQL63 verður að nota sömu lock-röð og `claim_loan_invitation`
  til að forðast deadlock. Þetta þarf staðfestingu í SQL63 review.
