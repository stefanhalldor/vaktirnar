# TODO #62 - Claude Code v002 - scope review fyrir Codex

**Created:** 2026-06-27 22:42
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex
**Tegund:** Review / spurningar - engin framkvæmd

---

## Samhengi

Stebbi las Codex v001 handoff og bætti við tveimur skýringum:

1. **Hann vill geta breytt opnu pending boði** - bæði eigandinn (creator) og sá
   sem á eftir að samþykkja (pending recipient) eiga að geta breytt hlutverki
   þótt boð sé opið.

2. **Events þurfa að koma í Saga hlutarins** - allar hlutverksskipti skulu
   skráðar í history, hvort eð er.

Þetta breyting er í beinni mótsögn við Codex v001 sem mælti með að blokka
pending boð í V1 af öryggisástæðum.

---

## Þær spurningar sem Codex þarf að svara

### 1. Er öruggt að leyfa hlutverksskipti með opið pending boð?

Codex v001 blokkað þetta vegna:
- Boðatexti og `recipient_role` í tölvupósti stemmir ekki lengur við raunverulegt
  hlutverk eftir skipti.
- Mótaðili gæti verið að taka ákvörðun um `Þekki málið` / `Þekki það ekki` út
  frá rangri hlutverksupplýsingu.

Spurning: Hvernig á að leysa þetta með góðu móti? Valkostirnir eru:

**A.** Leyfa skipti og senda nýjan tölvupóst með leiðréttum hlutverksupplýsingum.
(Krefst samspils við tölvupóstflæðið, flóknara.)

**B.** Leyfa skipti en gera boðið óvirkt eða eyða því, og nota glugga sem
útskýrir þetta fyrir actor.
(Einföldara, en actor þarf að endursenda boð.)

**C.** Leyfa skipti og uppfæra `recipient_role` í `loan_invitations` án nýs
tölvupósts.
(Tölvupósturinn er þá villa en hægt er að líta á það sem leiðréttingu á skráningu.)

Codex á að meta hvaða leið er öruggust og einfaldust.

### 2. Pending recipient sem aðili - er þetta leyfilegt?

Codex v001 sagði: "Pending recipient er ekki fullur aðili fyrr en hann velur
`Þekki málið`."

En Stebbi vill að pending recipient geti breytt hlutverki. Þetta þýðir:

- Pending recipient þarf aðgang að edit-flæðinu.
- Edit-flæðið er í dag aðeins opið fyrir confirmed parties.
- SQL63 þarf að veita pending recipient leyfi til að kalla `switch_loan_role`.

Spurning: Er þetta öruggt? Gæti pending recipient gert breytingar sem
eigandinn vill ekki? Þarf samþykki beggja aðila?

### 3. Hvað gerist við `recipient_role` í `loan_invitations` eftir skipti?

Ef pending boð er til og hlutverkum er skipt:
- `loan_invitations.recipient_role` segir hvað pending recipient á að vera.
- Eftir skipti er þetta gildi rangt.
- Á SQL63 að uppfæra `recipient_role` í `loan_invitations`?

### 4. History event - nóg með `loan_role_switched`?

Stebbi staðfestir að events eiga að koma í Saga hlutarins. Codex v001 planið
gerði ráð fyrir `loan_role_switched` event. Þetta virðist rétt. Codex á að
staðfesta:

- Er `loan_role_switched` event type nóg eða þarf actor/counterpart greining?
- Á history að sýna `Breyttu í: Ég lánaði` / `Breyttu í: Ég fékk lánað`
  sem `detailLines`, eða er `Hlutverki breytt: {itemName}` nóg?

### 5. Hvernig á UI að meðhöndla pending boð?

Ef við leyum skipti þótt boð sé opið:
- Á UI að vara við? ("Þetta mun uppfæra opið boð...")
- Á UI að sýna mismunandi state á pending vs. confirmed loan?

---

## Greining Claude Code á áhættu

**Lág áhætta:**
- Solo-lán án boðs. Einfaldur swap, engin mótaðilahagsmunir.
- History event. Þetta er aðeins viðbót við sögu.

**Meðalhátt áhætta:**
- Accepted lán swap. Báðir aðilar halda aðgangi. Mótaðili fær Ólesið.
  Codex v001 planið nær yfir þetta vel.

**Hæst áhætta - þetta þarf Codex að meta:**
- Pending boð + skipti. Tölvupósturinn sem var sendur er þá rangt. Pending
  recipient kann að lesa tölvupóstinn og skilja ekki hvernig hluturinn er
  skráður.
- Pending recipient sem actor. Þetta gefur pending recipient meiri völd en
  samþykkt flæðið gerir ráð fyrir. Hvað ef eigandinn vill ekki skiptin?

---

## Tillaga Claude Code að afmörkun

Ef Codex samþykkir að leyfa pending invitation flæðið:

**Við pending boð:**
- Eigandi (creator) má skipta hlutverki.
- SQL uppfærir `recipient_role` í opnu boði sjálfkrafa.
- Enginn nýr tölvupóstur sendur - þetta er leiðrétting.
- Event skráist í history.

**Pending recipient sem actor:**
- Má skipta hlutverki með sama hætti.
- SQL uppfærir `recipient_role` í boðinu sjálfkrafa.
- Þetta þýðir að pending recipient gæti snúið boðinu við - eigandinn yrði
  þá `borrower` og recipient `lender`.
- Er þetta æskilegt? Þarf samþykki eiganda?

**Confidence:** medium. Claude Code er ekki viss um hvort pending recipient
á að hafa þessa völd án samþykkis eiganda. Codex á að meta þetta.

---

## Óvissa / þarf að staðfesta

- Óvíst hvort Stebbi vill að pending recipient geti snúið hlutverkum
  gegn vilja eiganda, eða hvort báðir þurfi að samþykkja skiptin.
  **Confidence: low.** Þarf skýringu Stebba.
- Óvíst hvort senda eigi nýjan tölvupóst eftir hlutverksskipti með pending boð.
  **Confidence: low.**
- Óvíst hvort útrunnið pending boð (expired) eigi að blokka eða leyfa skipti.
  **Confidence: medium.** Conservative leið: blokka `status='pending'`
  óháð `expires_at`.
