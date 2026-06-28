# TODO #62 - Claude Code v025 - Major 1 og Minor 2 lagaðar

**Created:** 2026-06-28 22:02
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Codex + Stebbi
**Tegund:** Pre-release handoff - tilbuid til Codex rýni

---

## Samhengi

Þetta svarar: `ai-handoff/2026-06-28-2138-todo-062-v024-codex-v023-correction.md`

Lagaðar Major 1 og Minor 2 fra v024. Blocker 1 (history sjónarhorn) stadfest
af Stebba - engin breyting þar.

---

## Hvað var gert

### Major 1 - Pending recipient hefur nú sýnilega leið inn í hlutverkaskipti

**`lib/loans/types.ts`:**
- `canSwitchRole: boolean` bætt við `LoanCardControls` interface
- `getLoanCardControls`: `canSwitchRole: isPendingRecipient`
- Actual parties (non-pending-recipient): `canSwitchRole = false` - þeir nota blýantinn sem er þegar til

**`messages/is.json`** (teskeid.loans.switchRole):
- `"correctRole": "Leiðrétta hlutverk"`

**`messages/en.json`** (teskeid.loans.switchRole):
- `"correctRole": "Correct role"`

**`components/loans/LoanCard.tsx`:**
- `canSwitchRole` bætt við destructure
- Ny Link bætt við EFTIR Samþykkja/Hafna hnappa:
  ```
  {canSwitchRole && (
    <Link href={`/auth-mvp/lanad-og-skilad/breyta/${item.id}`} ...>
      {t('switchRole.correctRole')}
    </Link>
  )}
  ```
- Stíll: `text-xs text-[#72796e] hover:text-[#154212]` - hlutlægt, ekki aðal-CTA
- Pending recipient sér: Hafna · Samþykkja + "Leiðrétta hlutverk" link

### Minor 2 - Loggar þegar newRole leysist ekki upp

**`lib/loans/actions.ts`:**
- Eftir að bæði `get_my_loans` og `get_loan_for_pending_recipient` skila engu:
  ```ts
  if (!newRole) {
    console.error('[loans/switchLoanRole] could not resolve newRole after swap')
  }
  ```
- Graceful degradation helst (event er skráð, bara án newRole)

---

## Tests

**`lib/__tests__/loans.test.ts`:**
- `canSwitchRole is true for pending recipient`
- `canSwitchRole is false for accepted row`

**`lib/__tests__/loan-card.test.tsx`:**
- `"Leiðrétta hlutverk"` link sýnist fyrir pending recipient med réttu href
- Link birtist EKKI fyrir actual party (requires_acknowledgement: false)
- `'switchRole.correctRole': 'Leiðrétta hlutverk'` bætt við mock

---

## Niðurstöður profana

```
Tests  1358 passed | 22 skipped | 8 todo (1388)
TypeScript: no errors
```

+4 tests fra v022 (1354 → 1358):
- 2 ny i loans.test.ts (canSwitchRole)
- 2 ny i loan-card.test.tsx (correctRole link)

---

## Hvað er EKKI gert

- Ekkert er committad eda push-ad
- Ekkert er deployed

---

## Localhost checks fyrir Stebbi/Codex

### Actual party (þú sem creator/lender/accepted borrower):
1. Opna detail-sidu hlutarins
2. Smella á blýantinn (canEditItemDetails = true)
3. Staðfesta: `Leiðrétta í: Ég lánaði` eda `Ég fékk lánað` takki fyrir ofan formið
4. Smella - hlutverk skiptist
5. Saga sýnir: `Hlutverki breytt: Ég fékk lánað` (eda lánað)

### Pending recipient (þú sem hefur opið boð en ert ekki enn aðili):
6. Opna Ólesið - smella á pending boð
7. LoanCard á detail-sidu sýnir: Hafna · Samþykkja · "Leiðrétta hlutverk"
8. Smella á "Leiðrétta hlutverk"
9. Routeið opnast - sýnir aðeins `Leiðrétta í: Ég lánaði` eda `Ég fékk lánað` takka (engin form)
10. Smella á takkann - hlutverk skiptist, refresh
11. Engin nýr tölvupóstur sendur

### Mobile:
12. Prófa 360/390/460px - enginn láréttur overflow
13. Pending recipient card á ekki að fara med overflow þegar "Leiðrétta hlutverk" bætist við

---

## Skrár breyttar

- `lib/loans/types.ts`
- `lib/loans/actions.ts`
- `messages/is.json`
- `messages/en.json`
- `components/loans/LoanCard.tsx`
- `lib/__tests__/loans.test.ts`
- `lib/__tests__/loan-card.test.tsx`
