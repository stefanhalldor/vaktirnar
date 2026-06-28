# TODO #62 - Codex v003 - scope decisions fyrir Claude Code rýni

**Created:** 2026-06-27 22:50  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Scope handoff / review request - engin framkvæmd

---

## Samhengi

Þetta skjal svarar opnum spurningum úr:

- `ai-handoff/2026-06-27-2242-todo-062-v002-claude-scope-review.md`

og uppfærir Codex v001 scope út frá skýrum product-ákvörðunum Stebba.

Codex hefur ekki útfært breytinguna, ekki skrifað SQL63, ekki keyrt SQL, ekki
commit-að, ekki push-að og ekki deployað.

---

## Lokaákvarðanir Stebba

### 1. Pending recipient má snúa hlutverkum án samþykkis eiganda

Stebbi staðfesti:

> Þarf ekki samþykki.

Þetta þýðir að SQL63 og UI mega leyfa pending recipient að skipta hlutverkum,
ef hann hefur öruggan aðgang með canonical email match á pending invitation.

Þetta er meðvituð product-ákvörðun um einfalt samstarfsviðmót. Kerfið á ekki að
krefjast tveggja aðila samþykkis í V1.

### 2. Ekki senda nýjan tölvupóst eftir hlutverksskipti með pending boð

Stebbi staðfesti:

> ekki senda nýjan póst... þegar notandi opnar hlutinn þá sést breytingin í sögu
> hlutarins

Þetta þýðir að leið C úr Claude v002 er valin:

- Leyfa skipti.
- Uppfæra `loan_invitations.recipient_role`.
- Ekki senda nýjan tölvupóst.
- Láta `Saga hlutarins` vera sannleikann um hvað breyttist.

### 3. Útrunnið pending boð á ekki að blokka hlutverksskipti

Stebbi staðfesti:

> Leyfum skipti.

Þetta þýðir að SQL63 á ekki að blokka role switch vegna `status='pending'` eða
vegna þess að pending invitation sé útrunnið.

Claude Code þarf samt að passa að uppfæra eða meðhöndla invitation row þannig að
engin dangling eða röng `recipient_role` verði eftir.

### 4. History texti

Stebbi staðfesti:

> Hlutverki breytt: {itemName}  
> þetta er nóg

Þetta þýðir:

- Event type `loan_role_switched` er nóg.
- Label í `Saga hlutarins` og `Ólesið` má vera:
  - `Hlutverki breytt: {itemName}`
- Ekki þarf detailLines á borð við `Breytti í: Ég lánaði` í V1.
- Actor-lína úr history grunninum má áfram sýna `Framkvæmt af {name}`.

---

## Uppfært scope fyrir SQL63

Næsta migration ætti líklega að vera:

- `sql/63_switch_loan_role.sql`

Ekki keyra SQL63 nema Stebbi samþykki það sérstaklega.

### Leyfa role switch þegar

1. Actor er actual party:
   - `loan_items.lender_user_id = p_actor_id`
   - eða `loan_items.borrower_user_id = p_actor_id`

2. Actor er pending recipient með canonical email match:
   - `loan_invitations.loan_id = p_loan_id`
   - `loan_invitations.status = 'pending'`
   - `normalize_email_canonical(auth.users.email) = loan_invitations.recipient_email_normalized`
   - `auth.users.id = p_actor_id`

3. Lán er solo, accepted, pending eða returned.

### Ekki leyfa role switch þegar

1. Actor er óviðkomandi.
2. Actor er ekki til í `auth.users`.
3. Loan finnst ekki.
4. DB state er ómögulegt eða spillt, t.d. hvorki lender né borrower né matching
   pending invitation gefur skýra stöðu.

### Hvernig role switch á að virka

#### Solo actual party

- Actor er `lender_user_id`, `borrower_user_id` er `NULL`:
  - setja `lender_user_id = NULL`
  - setja `borrower_user_id = actor`

- Actor er `borrower_user_id`, `lender_user_id` er `NULL`:
  - setja `borrower_user_id = NULL`
  - setja `lender_user_id = actor`

#### Accepted / both parties present

- Swap-a `lender_user_id` og `borrower_user_id`.
- Báðir aðilar halda aðgangi.
- `created_by` helst óbreytt.

#### Pending invitation

Ef actor er creator/actual party og pending invitation er til:

- Skipta role stöðu lánsins.
- Uppfæra `loan_invitations.recipient_role` í hitt role-ið svo boðið passi við
  nýja stöðu.
- Ekki senda nýjan tölvupóst.

Ef actor er pending recipient:

- Veita aðgang með canonical email match.
- Skipta role stöðu lánsins þannig að pending recipient endi á hinu role-inu
  þegar hann síðar velur `Þekki málið`.
- Uppfæra `loan_invitations.recipient_role`.
- Ekki krefjast samþykkis eiganda.
- Ekki senda nýjan tölvupóst.

Claude Code þarf að hanna SQL þetta vandlega svo claim-flæðið eftir switch
setji pending recipient í réttan dálk (`lender_user_id` eða `borrower_user_id`).

#### Expired pending invitation

- Má ekki blokka role switch.
- Ef invitation row er enn `status='pending'` en `expires_at <= now()`, þá þarf
  SQL63 að ákveða örugga einföldustu meðhöndlun:
  - annað hvort uppfæra `recipient_role` samt
  - eða merkja boðið expired og halda role switch áfram ef það er öruggara

Codex hallast að því að uppfæra `recipient_role` samt ef status er enn
`pending`, því Stebbi sagði að expired pending eigi ekki að blokka skipti. Claude
Code þarf að rýna hvort það hafi áhrif á núverandi expired/claim hegðun.

---

## Event og Ólesið

Bæta við event type:

- `loan_role_switched`

Texti:

- IS: `Hlutverki breytt: {itemName}`
- EN: `Role changed: {itemName}` eða einföld sambærileg enska.

Payload:

```ts
{ itemName }
```

Ekki setja:

- netfang
- raw user id
- raw invitation email
- `recipient_role`
- fyrra/nýtt role

Saga hlutarins:

- Sýnir `Hlutverki breytt: {itemName}`.
- Actor-lína má sýna `Framkvæmt af {name}`.
- Engar detailLines nauðsynlegar í V1.

Ólesið:

- Ef mótaðili er actual party, skrá unread event fyrir hann.
- Ef pending recipient er til og hægt er að finna user id með canonical email
  lookup, skrá unread event fyrir hann.
- Ekki skrá unread event fyrir actor.
- Event má vera read fyrir actor ef það styður history/de-dup mynstur.

---

## UI-scope

UI má leyfa role switch í edit/detail flæðinu.

Vegna nýrrar product-ákvörðunar þarf edit/detail aðgengi einnig að taka tillit
til pending recipient:

- Pending recipient sem sér hlutinn á detail síðu má fá aðgerð til að skipta
  hlutverki.
- Þetta má ekki opna almenna edit heimild til að breyta öllum gögnum nema það sé
  þegar samþykkt í núverandi flæði.

Codex mælir með:

1. Sér `Hlutverk` kafla á detail/edit skjá.
2. Secondary button eða segmented action:
   - `Breyta í: Ég lánaði`
   - `Breyta í: Ég fékk lánað`
3. Stutt confirmation ef pending boð er til, t.d.:
   - `Þetta uppfærir opna boðið. Nýr tölvupóstur verður ekki sendur.`
4. Pending/loading state á button.
5. Error nálægt controlinu.

Notendatexti á að fara í `messages/is.json` og `messages/en.json`.

---

## Öryggis- og gagnaatriði

Claude Code þarf sérstaklega að passa:

- `created_by` má ekki breytast.
- SQL63 þarf að vera atomic, nota `FOR UPDATE` og ekki skilja lánið í hálfskiptu
  role-state.
- Ný RPC skal vera service_role-only.
- Ekki veikja RLS, grants eða policies.
- Pending recipient access má aðeins byggja á canonical email match sem þegar er
  notað í kerfinu.
- Enginn óviðkomandi má geta séð eða breytt láni með beinu RPC-kalli.
- Engin netföng eða user IDs mega leka í event payload, logs eða client texta.

---

## Spurningar sem Claude Code á að rýna áður en framkvæmd hefst

1. Er ofangreint nægilega skýrt til að skrifa implementation plan fyrir SQL63 og
   app-kóða?
2. Hvernig á SQL63 best að meðhöndla `expires_at <= now()` pending invitation
   þegar Stebbi vill leyfa role switch?
3. Hvernig tryggjum við að `claim_loan_invitation` virki rétt eftir að
   `recipient_role` hefur verið uppfært?
4. Þarf `get_my_loans` eða pending/detail access að breytast svo pending
   recipient sjái role switch action?
5. Hvaða tests þarf að bæta við fyrir pending recipient role switch?

---

## Ráðlagt næsta skref

Claude Code ætti að skila implementation plan fyrir SQL63 + app-kóða áður en
framkvæmd hefst, nema Stebbi gefi sérstaklega skýrt framkvæmdarleyfi.

Ekki keyra SQL, commit-a, push-a eða deploya nema Stebbi samþykki það sérstaklega.

---

## Localhost checks for Stebbi

Þessi kafli á við, því breytingin verður notendasýnileg í lána-detail/edit
flæðinu.

Þegar feature hefur verið útfært og SQL63 keyrt í prófunarumhverfi:

1. Prófa solo-lán þar sem Stebbi er `Ég lánaði`.
2. Skipta yfir í `Ég fékk lánað`.
3. Vænt niðurstaða:
   - listi/detail sýnir rétt hlutverk
   - `Saga hlutarins` sýnir `Hlutverki breytt: {itemName}`
4. Prófa hina áttina á solo-láni.
5. Prófa accepted lán með tveimur prófnotendum.
6. Vænt niðurstaða:
   - báðir halda aðgangi
   - hlutverkin swap-ast hjá báðum
   - mótaðili fær `Ólesið`
7. Prófa opið pending boð sem creator.
8. Vænt niðurstaða:
   - hægt er að skipta hlutverki
   - `recipient_role` uppfærist
   - enginn nýr tölvupóstur fer út
   - pending recipient sér breytt samhengi þegar hann opnar hlutinn
9. Prófa pending recipient sem actor.
10. Vænt niðurstaða:
    - pending recipient getur skipt hlutverki án samþykkis creator
    - creator missir ekki aðgang
    - history skráir actor rétt
11. Prófa expired pending boð.
12. Vænt niðurstaða:
    - role switch er ekki blokkað vegna expired boðs
13. Prófa mobile breiddir 360, 390 og 460px.
14. Vænt niðurstaða:
    - enginn horizontal overflow
    - enginn mobile zoom
    - loading/error/confirmation state er skýr

Varúð:

- Ekki nota raunveruleg production lán með mótaðilum nema Stebbi vilji það
  sérstaklega.
- Ekki senda prófunarpósta nema það sé markmið prófsins. V1 á ekki að senda
  nýjan póst við role switch.
- SQL63 þarf sérstakt samþykki áður en það er keyrt.

---

## Óvissa / þarf að staðfesta

Eftir svör Stebba eru product-óvissurnar úr Claude v002 lokaðar.

Eftir stendur tæknileg óvissa sem Claude Code þarf að leysa í implementation
planinu:

- nákvæm SQL-meðhöndlun á expired pending invitation row
- hvort `get_my_loans` / detail edit access þurfi aukna pending recipient heimild
- hvaða tests tryggja að claim-flæðið virki eftir uppfært `recipient_role`
