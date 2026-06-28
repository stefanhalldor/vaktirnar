# TODO #62 - Codex v010 - rýni á v009 útfærslu

**Created:** 2026-06-28 10:40  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Code review / SQL review - engin framkvæmd

---

## Niðurstaða

**Ekki keyra SQL63 strax.**

Útfærslan er á réttri leið, en ég myndi laga tvo punkta áður en Stebbi keyrir
SQL63 eða schema reload:

1. `pending_user_id` í SQL63 nær bara einum canonical-matching notanda.
2. `SwitchRoleButton` refresh-ar ekki detail-síðuna eftir vel heppnað switch.

Það er líka eitt bulletproof-edge-case í SQL63 varðandi fleiri en eitt pending
boð fyrir sama lán sem Claude Code ætti að loka eða rökstyðja skýrt.

---

## Findings

### 1. High - SQL63 enduropnar canonical-email notification gap

**Skrár/línur:**

- `sql/63_switch_loan_role.sql:245-250`
- `lib/loans/actions.ts:973-985`
- Samanburður: `sql/57_get_user_ids_by_canonical_email.sql:34-46`

SQL63 skilar bara einum `pending_user_id`:

```sql
SELECT au.id INTO v_pending_id
FROM auth.users au
WHERE public.normalize_email_canonical(au.email)
        = public.normalize_email_canonical(v_inv.recipient_email_normalized)
LIMIT 1;
```

Þetta fer gegn þeirri ákvörðun sem við tókum í #37/#57: þegar pending recipient
er fundinn með canonical email match þarf að ná **öllum** matching user ids, ekki
bara einum. Annars geta dotted-Gmail / googlemail / duplicate canonical tilfelli
aftur misst `Ólesið`.

Þetta lekur ekki gögnum beint, en það er product regression í notification
hegðun og var áður merkt sem ekki ásættanlegt.

**Tillaga að lagfæringu:**

- Breyta RPC contract úr `pending_user_id uuid` í `pending_user_ids uuid[]`.
- Í SQL63:
  - `array_agg(au.id ORDER BY au.created_at ASC, au.id ASC)`
  - halda áfram að skila ekki netföngum.
- Í `switchLoanRole`:
  - iterera yfir `pending_user_ids`
  - sleppa `user.id`
  - nota `Set` svo counterpart og pending ids tvíteljist ekki.

Ef Claude Code vill forðast array-return má líka skrá pending notification í
server action með SQL57, en þá þarf RPC að skila nægilegum, öruggum upplýsingum
án þess að leka netfangi til client. `uuid[]` úr RPC er líklega hreinasta leiðin.

---

### 2. High - Role switch virðist ekki uppfæra síðuna eftir success

**Skrár/línur:**

- `components/loans/SwitchRoleButton.tsx:29-36`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx:93-105`

`SwitchRoleButton` kallar server action og sýnir villu ef action failar, en við
success gerist ekkert á client:

```ts
const result = await switchLoanRole(loanId)
if (!result.ok) {
  setErrorMsg(labels.error)
}
```

`switchLoanRole` kallar `revalidatePath`, en það uppfærir ekki sjálfkrafa
núverandi client-renderaða síðu. Notandi getur því smellt, fengið engin villu,
en áfram séð gamla hlutverkið, gamla history-state og gamla takka þar til hann
refresh-ar eða fer af síðunni.

Þetta er sérstaklega slæmt í þessu máli þar sem aðgerðin er ný og notandi þarf
að sjá strax að hlutverkið breyttist.

**Tillaga að lagfæringu:**

- Nota `useRouter` í `SwitchRoleButton`.
- Eftir `result.ok`, kalla `router.refresh()`.
- Halda `isPending` state á meðan action keyrir.
- Helst bæta test eða component-level assertion fyrir success path ef núverandi
  test setup leyfir það.

---

### 3. Medium - SQL63 velur bara nýjasta pending boðið og getur misst rétt boð

**Skrár/línur:**

- `sql/63_switch_loan_role.sql:160-168`
- `sql/63_switch_loan_role.sql:192-199`
- `sql/63_switch_loan_role.sql:235-243`
- `sql/63_switch_loan_role.sql:98-105`

`switch_loan_role` finnur `v_inv_id` með:

```sql
WHERE inv.loan_id = p_loan_id
  AND inv.status = 'pending'
ORDER BY inv.created_at DESC, inv.id DESC
LIMIT 1;
```

Síðan er pending-recipient aðgangur aðeins athugaður á þessu eina boði. Ef það
eru fleiri pending boð fyrir sama lán, eða gögnin verða óhrein út frá eldri bug,
getur pending recipient:

- séð detail-síðu í `get_loan_for_pending_recipient`
- en fengið `not_found` þegar hann reynir að skipta hlutverki

eða actual party getur flipað rangt pending boð.

Við eigum ekki að hanna út frá því að gögnin séu alltaf fullkomin þegar Stebbi
biður um bulletproof leið.

**Tillaga að lagfæringu:**

- Fyrir pending actor: finna og læsa boðið sem canonical-matchar actor.
- Fyrir actual party: annaðhvort:
  - læsa öll pending boð fyrir lánið í stöðugri röð og uppfæra það boð sem
    raunverulega á við, eða
  - skila skýru `invalid_state` ef fleiri en eitt pending boð er til og sýna
    almennilega villu.
- `get_loan_for_pending_recipient` ætti líka að vera deterministic ef fleiri en
  ein row kemur til greina, t.d. með `ORDER BY inv.created_at DESC, inv.id DESC
  LIMIT 1`, eða enn betra: loka slíku ástandi sem `invalid_state`.

---

### 4. Medium - v008 bað um explicit permissions, en útfærslan notar implicit flag

**Skrár/línur:**

- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx:59-76`
- `lib/loans/types.ts:167-195`
- `components/loans/SwitchRoleButton.tsx:6-17`

Í v008 lagði Codex til `accessKind`, `my_role` og explicit `permissions`.
Útfærslan notar í staðinn `requires_acknowledgement: true` sem proxy fyrir
pending recipient. Þetta virðist fela LoanCard-takkana rétt í núverandi kóða,
en það er ekki eins bulletproof og beðið var um.

Ég myndi ekki endilega blokka SQL63 eingöngu út af þessu, en Claude Code þarf að
vera meðvitaður um áhættuna: nýr UI-staður getur síðar gleymt að
`requires_acknowledgement` þýðir "pending recipient með takmörkuð réttindi".

**Tillaga:**

- Að minnsta kosti bæta comment/type helper á detail-layer sem gerir þetta skýrt.
- Betra: setja lítið view-model á detail-síðunni:
  - `accessKind`
  - `canSwitchRole`
  - `canUseLoanCardActions`
- Ekki láta nýja components þurfa að lesa permission út frá raw invitation state.

---

### 5. Low - Loading state breytir líklega breidd takkans

**Skrár/línur:**

- `components/loans/SwitchRoleButton.tsx:50-56`
- `Design.md:254`

Button texti fer úr `Breyta í: ...` yfir í `...`. Design.md segir að loading
state eigi ekki að breyta breidd controls.

**Tillaga:**

- Halda textanum inni og bæta við disabled/pending indicator.
- Eða nota `min-w` sem passar lengsta labelinu.

---

## Það sem lítur vel út

- RLS/grants á nýju RPCs eru þröng: `REVOKE` frá `PUBLIC`, `anon`,
  `authenticated`; `GRANT EXECUTE` til `service_role`.
- SQL63 notar `SET search_path = ''`.
- Detail fallback byggir á canonical email match og skilar `notFound()` fyrir
  óviðkomandi.
- `recordRecentEvent` fær `actorUserId`, þannig history ætti að geta sýnt
  raunverulegan framkvæmdaaðila þegar eventið er skráð.
- Enginn nýr tölvupóstur er sendur við role switch.
- `claim_loan_invitation` les `recipient_role` dynamic, þannig claim eftir
  switch er rétt stefna.

---

## Prófunargöt

Claude Code keyrði stóran test pakka og type-check, sem er gott. En:

- SQL63 virðist ekki vera dekkað í `lib/__tests__/sql-migration.test.ts`.
- Nýju tests eru að mestu mock-based.
- Það vantar próf sem grípur `pending_user_id LIMIT 1` canonical-regression.
- Það vantar test fyrir client success path í `SwitchRoleButton` ef hægt er að
  prófa `router.refresh`.
- Það vantar test eða SQL assertion fyrir fleiri en eitt pending boð á sama láni.

Ég myndi biðja Claude Code um að bæta að minnsta kosti migration-string tests
fyrir:

- service_role-only grants á báðum RPCs
- `switch_loan_role` skili öllum pending canonical users eða noti ekki `LIMIT 1`
- lock order invitation -> loan
- engin email fields í RPC return contract
- pending fallback notar canonical email match

---

## Athugasemd frá Stebba um iPhone/dashboard

Stebbi nefndi áður en v009 kom að sama event og opnaðist ekki á iPhone í gær
opnist nú eðlilega, og sama eigi við um `/dashboard`.

Ég tengi það ekki beint við #62 sem blocker, en það er gott regression check:

- halda þessu í huga í mobile prófun eftir #62
- prófa beinan detail link úr `Ólesið` / history á iPhone
- prófa `/dashboard` áfram eftir deployment svo við opnum ekki sama mobile
  navigation/loading vandamál aftur

---

## Localhost checks for Stebbi

Ekki byrja á þessum checks fyrr en Claude Code hefur lagað findings 1-2,
Codex hefur rýnt aftur ef þarf, og Stebbi hefur sérstaklega samþykkt SQL63 +
schema reload í prófunarumhverfi.

Eftir það:

1. Opna pending boð sem pending recipient.
2. Staðfesta að detail-síða opnist, LoanCard sjáist, en `Breyta`, `Eyða`,
   `Merkja skilað` og `Afturkalla skil` sjáist ekki.
3. Smella á `Breyta í: ...`.
4. Staðfesta strax, án manual refresh:
   - hlutverk breytist á skjánum
   - saga fær `Hlutverki breytt: {itemName}`
   - takkinn sýnir ekki gamla state
5. Velja `Þekki málið` eftir switch.
6. Staðfesta að claim setji pending recipient í réttan lender/borrower dálk.
7. Prófa actual-party switch með mótaðila sem er accepted.
8. Staðfesta að mótaðili fái `Ólesið`.
9. Prófa pending boð þar sem canonical email getur matchað fleiri en einn user
   ef Stebbi á örugg test-gögn fyrir það.
10. Prófa beinan detail link sem óviðkomandi notandi.
11. Prófa iPhone/Safari og mobile breiddir 360, 390 og 460px.
12. Opna `/dashboard` og sama event/link og Stebbi nefndi að væri nú byrjað að
    virka, til að tryggja að #62 valdi ekki regression.

Varúð:

- Ekki keyra SQL63 á production fyrr en findings 1-2 eru löguð.
- Ekki prófa með raunverulegum production mótaðilum nema Stebbi biðji um það.
- SQL63, schema reload, commit, push og deploy þurfa sérstakt samþykki frá
  Stebba.

---

## Tillaga að næsta skrefi

Claude Code lagar findings 1-2 og tekur afstöðu til finding 3. Síðan skilar
Claude Code stuttu v011 handoffi með:

- breyttu SQL63 return contract eða rökstuddri annarri lausn
- staðfestingu á `router.refresh()`
- hvaða tests voru bætt við/keyrð
- hvort SQL63 er enn ókeyrt

