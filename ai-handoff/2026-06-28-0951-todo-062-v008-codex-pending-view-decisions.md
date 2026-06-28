# TODO #62 - Codex v008 - svör við pending-view vafamálum

**Created:** 2026-06-28 09:51  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Ákvörðun / svar við opnum vafamálum - engin framkvæmd

---

## Samhengi

Þetta skjal svarar:

- `ai-handoff/2026-06-27-2347-todo-062-v007-claude-pending-view-question.md`

Claude Code bað um niðurstöðu á tveimur vafamálum áður en framkvæmd hefst.
Stebbi hefur nú svarað:

- Vafamál 1: **B**
- Vafamál 2: **Gerum það sem er mest bullet proof**

Codex setur það hér í tæknilegt handoff til að minnka líkur á misskilningi í
framkvæmd.

---

## Vafamál 1 - hvað sér pending recipient á detail-síðunni?

Velja **B: sama detail-síðan með tökkum földum**.

Pending recipient á að fá sömu grunnupplifun og aðrir aðilar á detail-síðu, en
ekki sjá takka sem gefa honum réttindi sem hann hefur ekki enn:

- ekki `Breyta`
- ekki `Eyða`
- ekki `Merkja skilað`
- ekki `Afturkalla skil`

Hann á samt að sjá:

- LoanCard / hlutarammann með samhengi hlutarins
- hvort hann er skráður sem sá sem lánaði eða fékk lánað
- `SwitchRoleButton`
- `Saga hlutarins`

Ástæða:

- Þetta er samræmdara UX.
- Notandi fær samhengi áður en hann ákveður hvort hlutverkið sé rétt.
- Við förum alla leið fyrir notandann og forðumst shortcut þar sem pending
  recipient sér bara sérstakan minimal-glugga vegna þess að full leið er flókin.

Skilyrði:

- `LoanCard` má ekki fá óskýrt permission flag sem getur fyrir mistök birt
  edit/delete/return.
- Permission-ákvörðun verður að vera explicit, t.d. `canEdit`, `canDelete`,
  `canChangeReturnStatus`, `canSwitchRole`.
- Pending recipient má aðeins fá `canSwitchRole: true` og ekki önnur actual
  party réttindi.
- Ef núverandi `LoanCard` gerir ráð fyrir að allir sem sjái card geti gert
  allt, þá er betra að brjóta permissions skýrt út heldur en að fela hluti með
  óskýrri aðferð.

---

## Vafamál 2 - gagnaskipan fyrir pending lookup

Codex mælir með mest bullet proof leið:

Pending lookup á að skila **sérstöku detail view-model**, ekki bara hráum
`loan_items` gögnum og ekki bara aukareit sem components þurfa að túlka lauslega.

Tillaga:

```ts
type LoanDetailViewModel = LoanItem & {
  accessKind: 'actual_party' | 'pending_recipient'
  my_role: 'lender' | 'borrower'
  invitationStatus?: 'pending' | 'accepted' | 'declined' | 'expired'
  isPendingRecipient: boolean
  permissions: {
    canEdit: boolean
    canDelete: boolean
    canChangeReturnStatus: boolean
    canSwitchRole: boolean
  }
}
```

Fyrir pending recipient:

```ts
{
  accessKind: 'pending_recipient',
  my_role: recipient_role,
  invitationStatus: inv.status,
  isPendingRecipient: true,
  permissions: {
    canEdit: false,
    canDelete: false,
    canChangeReturnStatus: false,
    canSwitchRole: true
  }
}
```

Fyrir actual party:

```ts
{
  accessKind: 'actual_party',
  my_role: existingComputedRole,
  isPendingRecipient: false,
  permissions: {
    canEdit: true,
    canDelete: true, // eða fylgja núverandi reglu nákvæmlega
    canChangeReturnStatus: true,
    canSwitchRole: true
  }
}
```

Ef Claude Code vill hafa minna type-yfirborð má ná sama markmiði með svipuðum
reitum án nákvæmlega þessa type-nafns. Meginatriðin eru:

1. UI má ekki reikna réttindi úr dreifðum boolum og null checks.
2. `my_role` verður alltaf til fyrir `SwitchRoleButton`.
3. Pending role kemur frá `loan_invitations.recipient_role`.
4. Actual-party role kemur frá núverandi loan role reikningi.
5. Permissions eru explicit og prófanleg.

---

## Af hverju ekki bara `recipient_role` sem aukareitur?

Að skila aðeins `recipient_role` er of auðvelt að nota rangt:

- `SwitchRoleButton` þyrfti að vita of mikið um pending vs actual party.
- `LoanCard` þyrfti að túlka hvort action-takkar eigi að birtast.
- Nýir UI-staðir gætu seinna tekið `item.my_role` og gleymt pending tilfellinu.

Bullet proof leiðin er að sameina gögnin í eitt view-model á server/detail
layer og láta components fá skýrt:

- hvaða hlutverk notandinn hefur
- hvaða access tegund hann hefur
- hvaða aðgerðir hann má framkvæma

Þetta minnkar líkur á privilege bug og UX regression.

---

## Öryggiskröfur sem mega ekki losna

- `get_my_loans` á ekki að breytast fyrir #62.
- Pending recipient detail access verður að byggja á canonical email match.
- Óviðkomandi notandi má ekki fá vísbendingu um hvort loan id sé til.
- Pending recipient má ekki fá edit/delete/return réttindi.
- Role switch má ekki senda nýjan tölvupóst.
- Expired pending invitation má ekki blokka role switch.
- SQL63 má ekki veikja RLS, grants eða auth boundaries.
- SQL63 og schema reload má ekki keyra nema Stebbi gefi sérstakt leyfi.

---

## Beiðni til Claude Code

Claude Code má halda áfram með implementation plan/framkvæmd út frá eftirfarandi:

1. Nota B fyrir pending detail view.
2. Smíða skýrt detail view-model með `accessKind`, `my_role` og explicit
   `permissions`.
3. Gera pending recipient view samræmt actual detail view, en fela alla takka
   sem pending recipient má ekki nota.
4. Halda `SwitchRoleButton` einföldum: hann á að lesa `my_role` og
   `permissions.canSwitchRole`, ekki túlka invitation-state sjálfur nema til að
   birta pending warning.
5. Skila post-implementation handoff til Codex áður en Stebbi keyrir SQL63 eða
   gefur út.

---

## Localhost checks for Stebbi

Þetta á við, því ákvörðunin breytir því hvað pending recipient sér á detail-síðu.

Eftir að Claude Code hefur útfært breytinguna, SQL63 hefur verið keyrt í
prófunarumhverfi og schema cache hefur verið endurhlaðið:

1. Opna pending boð sem pending recipient.
2. Vænt niðurstaða:
   - sama detail-upplifun og fyrir aðra aðila
   - hlutarammur/LoanCard sýnir samhengi hlutarins
   - `Breyta`, `Eyða`, `Merkja skilað` og `Afturkalla skil` sjást ekki
   - `SwitchRoleButton` sést
   - `Saga hlutarins` sést
3. Smella á role switch sem pending recipient.
4. Vænt niðurstaða:
   - hlutverkið breytist
   - enginn nýr tölvupóstur fer út
   - saga sýnir `Hlutverki breytt: {itemName}`
5. Velja svo `Þekki málið`.
6. Vænt niðurstaða:
   - claim virkar eftir switch
   - pending recipient lendir í réttum lender/borrower dálki
7. Opna sama hlut sem creator/actual party.
8. Vænt niðurstaða:
   - creator heldur aðgangi
   - creator sér role switch event í sögu
   - creator missir ekki ótengd edit-réttindi
9. Opna beinan detail link sem óviðkomandi notandi.
10. Vænt niðurstaða:
    - ekkert lekur, síðan hegðar sér eins og hlutur finnist ekki
11. Prófa mobile breiddir 360, 390 og 460px.
12. Vænt niðurstaða:
    - enginn horizontal overflow
    - enginn mobile zoom
    - faldir takkar skilja ekki eftir skrítna eyðu eða broken layout

Varúð:

- Ekki prófa á raunverulegum production lánum með mótaðila nema Stebbi vilji
  það sérstaklega.
- SQL63, schema reload og deployment krefjast sérstaks leyfis frá Stebba.

