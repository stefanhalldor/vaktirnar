# TODO #62 - Codex v005 - full scope, user-first ákvörðun

**Created:** 2026-06-27 23:04  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Scope decision / handoff - engin framkvæmd

---

## Samhengi

Þetta skjal svarar tæknilegri rýni Claude Code:

- `ai-handoff/2026-06-27-2257-todo-062-v004-claude-technical-review.md`

Claude Code benti réttilega á að pending recipient kemst ekki á detail-síðu í
dag með núverandi `get_my_loans`-grunni. Það þýðir að fullur #62 scope er meira
verk en bara SQL63 role-swap RPC.

Stebbi hefur tekið product-ákvörðun:

> Við förum alla leið fyrir notendur okkar... engin shortcuts vegna þess að
> eitthvað er flókið tæknilega.

Þetta lokar valinu milli leiðar A og leiðar B.

---

## Endanleg product-ákvörðun

Velja **leið B**.

Pending recipient á að geta:

1. opnað hlutinn
2. séð samhengi hlutarins
3. séð `Saga hlutarins`
4. skipt hlutverki áður en hann velur `Þekki málið`

Þetta má ekki vera shortcut þar sem pending recipient þarf fyrst að samþykkja
rangt hlutverk og leiðrétta það síðar. Ef hlutverk er rangt, á notandi að geta
leiðrétt það þar sem hann sér málið.

---

## Scope sem Claude Code á að taka með í implementation plan

### 1. Detail access fyrir pending recipient

Núverandi detail-síða notar `get_my_loans` og finnur aðeins actual parties:

- `lender_user_id = actor`
- `borrower_user_id = actor`

Þetta dugar ekki fyrir fullan #62 scope.

Claude Code þarf að bæta öruggum pending-recipient access við detail flæðið.
Tvær mögulegar leiðir:

1. Uppfæra `get_my_loans` þannig að pending recipient rows komi með þar líka.
2. Bæta sér lookup/RPC fyrir detail-síðu sem sameinar actual party og pending
   recipient access.

Codex hallast að sér detail lookup ef það heldur listaflæði einfaldara. Claude
Code má leggja til betri leið ef hún er öruggari og einfaldari.

Skilyrði:

- Pending recipient access verður að byggja á canonical email match, sama mynstri
  og SQL60/SQL61 history access.
- Óviðkomandi notandi má áfram fá `notFound()` eða sambærilegt öruggt svar.
- Ekki leka hvort hlutur sé til ef notandi hefur ekki aðgang.

### 2. Role switch RPC

SQL63 þarf að leyfa role switch fyrir:

- actual party
- pending recipient með canonical email match

SQL63 þarf að:

- nota service-role RPC með `p_actor_id`
- nota atomic transaction/fall
- læsa í öruggri röð
- halda `created_by` óbreyttu
- uppfæra `lender_user_id` / `borrower_user_id`
- uppfæra `loan_invitations.recipient_role` þegar pending/accepted invitation row
  þarf að passa við nýja stöðu
- leyfa switch þótt pending invitation sé útrunnið
- ekki senda tölvupóst
- skila nægum upplýsingum til server action svo hún geti skráð event og
  `Ólesið`

### 3. Lock order

Claude Code v004 benti réttilega á lock-order áhættu.

SQL63 þarf að fylgja sömu lock-röð og `claim_loan_invitation` þegar það snertir
invitation:

1. `loan_invitations FOR UPDATE` ef viðeigandi row er til og þarf að breyta
2. `loan_items FOR UPDATE`

Ef SQL63 þarf að læsa loan fyrst til að finna invitation, þarf Claude Code að
rökstyðja að það valdi ekki deadlock eða endurhanna query-ið.

### 4. Claim eftir role switch

Claude Code staðfesti í v004 að `claim_loan_invitation` les
`recipient_role` dynamically og ætti að virka eftir að SQL63 uppfærir
`recipient_role`.

Implementation plan þarf samt að prófa þetta sérstaklega:

- pending recipient skiptir hlutverki
- pending recipient smellir svo `Þekki málið`
- claim setur user í réttan dálk
- creator heldur réttum aðgangi

### 5. Expired pending invitation

Stebbi hefur ákveðið:

- expired pending invitation má ekki blokka role switch

Claude Code v004 staðfesti að claim skilar áfram `expired` óháð `recipient_role`.

Codex mælir með:

- ef row er `status='pending'`, uppfæra `recipient_role` óháð `expires_at`
- ekki breyta status í SQL63 nema það sé nauðsynlegt

Ástæða: role switch á að leiðrétta skráninguna. Expiry-reglan á áfram að lifa í
claim-flowinu.

---

## Event, history og Ólesið

Event type:

- `loan_role_switched`

Texti:

- `Hlutverki breytt: {itemName}`

Stebbi hefur staðfest að þetta er nóg. Ekki þarf detailLines í V1.

Payload:

```ts
{ itemName }
```

Ekki setja í payload:

- netfang
- raw user id
- raw invitation email
- gamla/nýja role
- `recipient_role`

History:

- Event birtist í `Saga hlutarins`.
- Actor-lína sýnir hver framkvæmdi ef `actorUserId` er sett rétt.

Ólesið:

- Actor fær ekki unread event.
- Actual counterpart fær unread event.
- Pending recipient fær unread event ef actor er creator/actual party og hægt er
  að finna user með canonical email lookup.
- Creator/actual party fær unread event ef pending recipient framkvæmir switch.

---

## UI og product hegðun

Pending recipient á að geta séð role switch action þar sem hann opnar hlutinn.

UI þarf að vera skýrt en ekki of þungt:

- Sýna núverandi hlutverk.
- Sýna aðgerð til að skipta í hitt hlutverkið.
- Ef boð er pending, má sýna stuttan texta:
  - `Þetta uppfærir opna boðið. Nýr tölvupóstur verður ekki sendur.`
- Ekki láta notanda þurfa að samþykkja rangt hlutverk fyrst.

Allur texti fer í:

- `messages/is.json`
- `messages/en.json`

Design.md:

- halda mobile-first
- enginn horizontal overflow
- enginn mobile zoom
- buttons með loading/disabled state
- villa nálægt controlinu
- prófa 360, 390 og 460px

---

## Ráðlagt implementation plan frá Claude Code

Claude Code ætti að skila implementation plan sem inniheldur:

1. Nákvæma leið fyrir pending-recipient detail access.
2. SQL63 RPC contract.
3. Lock-order útfærslu.
4. Hvernig `recipient_role` er uppfært.
5. Hvernig server action skráir history/Ólesið.
6. UI component breytingar.
7. Test plan.
8. Rollout plan fyrir SQL63 + schema reload.
9. Localhost checks fyrir Stebba.

Ekki framkvæma nema Stebbi gefi skýrt framkvæmdarleyfi.

---

## Sérstakar spurningar sem Claude Code á að svara í næsta plani

1. Ætlar Claude Code að breyta `get_my_loans` eða búa til sér detail lookup/RPC?
2. Hvernig verður tryggt að pending recipient sjái aðeins þá hluti sem
   canonical email match gefur honum aðgang að?
3. Hvernig verður role switch action sýnd pending recipient án þess að opna
   óskyld edit réttindi?
4. Hvernig verður `claim_loan_invitation` prófað eftir role switch?
5. Hvernig verður komið í veg fyrir deadlock við claim vs. role switch?
6. Hvaða migration verður SQL63 og hvaða schema reload þarf eftir hana?

---

## Localhost checks for Stebbi

Þessi kafli á við, því fullur #62 scope verður notendasýnilegur í detail/edit
flæði lánaðs hlutar.

Þegar Claude Code hefur útfært og SQL63 hefur verið keyrt í prófunarumhverfi:

1. Opna hlut sem actual party og skipta úr `Ég lánaði` í `Ég fékk lánað`.
2. Vænt niðurstaða:
   - hlutverk breytist á detail og lista
   - `Saga hlutarins` sýnir `Hlutverki breytt: {itemName}`
3. Endurtaka í hina áttina.
4. Opna accepted lán með tveimur prófnotendum.
5. Vænt niðurstaða:
   - báðir halda aðgangi
   - hlutverkin swap-ast rétt
   - mótaðili fær `Ólesið`
6. Opna pending boð sem creator og skipta hlutverki.
7. Vænt niðurstaða:
   - `recipient_role` uppfærist
   - enginn nýr tölvupóstur fer út
   - pending recipient sér breytt samhengi þegar hann opnar hlutinn
8. Opna sama pending boð sem pending recipient áður en hann velur `Þekki málið`.
9. Vænt niðurstaða:
   - pending recipient kemst á detail-síðu
   - pending recipient getur skipt hlutverki
   - creator heldur aðgangi
   - history sýnir actor rétt
10. Láta pending recipient velja `Þekki málið` eftir switch.
11. Vænt niðurstaða:
    - claim virkar
    - pending recipient lendir í réttum lender/borrower dálki
12. Prófa expired pending boð.
13. Vænt niðurstaða:
    - role switch er leyft
    - claim hegðun varðandi expiry helst rétt
14. Prófa óviðkomandi notanda með beinum detail link.
15. Vænt niðurstaða:
    - óviðkomandi sér ekkert
16. Prófa mobile breiddir 360, 390 og 460px.
17. Vænt niðurstaða:
    - enginn horizontal overflow
    - enginn mobile zoom
    - loading/error/confirmation state er skýr

Varúð:

- Ekki prófa á raunverulegum production lánum með mótaðilum nema Stebbi vilji
  það sérstaklega.
- V1 á ekki að senda nýjan tölvupóst við role switch.
- SQL63 og schema reload þurfa sérstakt samþykki áður en þau eru keyrð.

---

## Óvissa / þarf að staðfesta

Product-óvissa er lokuð: Stebbi vill fulla leið B.

Eftir stendur tæknileg útfærsla sem Claude Code þarf að leysa í plani:

- `get_my_loans` vs sér detail lookup/RPC
- nákvæm lock-order útfærsla
- tests fyrir pending recipient detail access og claim eftir switch
- hvort einhver tengslahelper þarf breytingu þegar `recipient_role` uppfærist
