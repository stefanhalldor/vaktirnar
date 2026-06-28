# TODO #62 - Claude Code v007 - opið vafamál til Codex

**Created:** 2026-06-27 23:47
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex
**Tegund:** Opið vafamál - bíður svars áður en framkvæmd hefst

---

## Staða

Implementation plan er tilbúið í v006. Tvö vafamál komu upp við endurlestur:

---

## Vafamál 1 (raunverulegt) - Hvað sér pending recipient á detail-síðunni?

`LoanCard` á detail-síðunni inniheldur action-takka:
- Breyta (opnar edit form)
- Eyða
- Merkja skilað / Afturkalla skil

Pending recipient á **ekki** að sjá þessa takka.

**Spurning til Stebba og Codex:** Á pending recipient að sjá:

**A. Einfaldaðan glugga** - aðeins `Saga hlutarins` og `SwitchRoleButton`.
Engin LoanCard. Einfaldara en krefst sérstaks pending-view í detail-síðu.

**B. Sama detail-síðuna með takka falda** - LoanCard sér að actor er pending
recipient og sýnir ekki edit/delete/return. Flóknara en samræmdara UX.

Codex á að ráðleggja og Stebbi tekur ákvörðun.

---

## Vafamál 2 (raunverulegt) - Hvernig veit SwitchRoleButton hlutverk pending recipient?

Confirmed party les `item.my_role` úr `get_my_loans` niðurstöðum.

Pending recipient er ekki í `loan_items` dálkunum. Hlutverk þeirra er í
`loan_invitations.recipient_role`.

Pending lookup-ið (fallback í detail-síðu) þarf að skila þessum upplýsingum
svo `SwitchRoleButton` viti hvort að sýna:
- "Breyta í: Ég lánaði"
- "Breyta í: Ég fékk lánað"

**Spurning:** Á pending lookup að skila `LoanItem`-líkri niðurstöðu með
`my_role` reiknað út frá `recipient_role`? Eða einfaldlega `recipient_role`
sem auka-reit?

Codex á að ráðleggja hvaða gagnaskipan er skynsamlegust.

---

## Vafamál 3 (minniháttar) - Inline lookup vs ný RPC

Claude Code getur ákveðið þetta við útfærslu. Hefur engin áhrif á öryggis-
eða UX-ákvarðanir. Codex þarf ekki að svara þessu.

---

## Samantekt á öllum ákvarðanatöku til þessa

Allt sem er búið að vera ákveðið (þarf ekki nýja umfjöllun):

| Atriði | Ákvörðun |
|--------|----------|
| Pending recipient má skipta hlutverki | Já, án samþykkis eiganda |
| Enginn nýr tölvupóstur við switch | Staðfest |
| Expired pending blokkar ekki | Staðfest |
| History texti | "Hlutverki breytt: {itemName}" |
| Lock-röð SQL63 | invitation → loan (sama og claim) |
| get_my_loans breytist ekki | Staðfest |
| Role switch á detail-síðu (ekki edit-síðu) | Staðfest |
| Claim virkar eftir switch | Staðfest (les recipient_role dynamically) |

---

## Hvað Codex þarf að svara

1. Vafamál 1: A eða B (eða önnur leið)?
2. Vafamál 2: Hvaða gagnaskipan á pending lookup að skila?

Eftir svör Codex/Stebba er framkvæmd tilbúin að hefjast.
