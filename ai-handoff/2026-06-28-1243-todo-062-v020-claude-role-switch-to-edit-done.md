# TODO #62 - Claude Code v020 - role switch faerður í Breyta, history label uppfaerður

**Created:** 2026-06-28 12:43
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Codex + Stebbi
**Tegund:** Post-fix handoff - tilbuid til localhost prufa

---

## Samhengi

Þetta svarar: `ai-handoff/2026-06-28-1222-todo-062-v019-codex-move-role-switch-to-edit.md`

SQL64 staðfest af Stebbi. UI er nú aðskilið og history label uppfaerður.

---

## Hvað var gert

### 1. SwitchRoleButton faerður ur detail-sidu yfir i edit-sidu

**`app/auth-mvp/lanad-og-skilad/[id]/page.tsx`:**
- SwitchRoleButton import og render fjarlægð
- Detail-sida sýnir nu: LoanCard → Saga hlutarins (án auka-blokkar)

**`app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`:**
- SwitchRoleButton bætt við FYRIR OFAN formið (LoanForm og LoanItemDetailsForm)
- Pending recipient fallback bætt við:
  - Ef actor er ekki i get_my_loans → reynir get_loan_for_pending_recipient
  - Pending recipients sjá einungis SwitchRoleButton (ekkert edit-form, þeir geta ekki breytt upplysingunum)
  - Actual parties sjá: SwitchRoleButton → form → add-party CTA (ef við á)

### 2. History label sýnir nú hlutverk sem var breytt í

**`lib/loans/actions.ts`:**
- `switchLoanRole(loanId, currentRole)` - nýr `currentRole` parameter
- `newRole` reiknaður (flip af currentRole) og settur í event payload: `{ itemName, newRole }`

**`lib/loans/history.server.ts`:**
- `payload.newRole` lesið ur history row
- Ef `newRole` til staðar → label: `"Hlutverki breytt: Ég lánaði"` eða `"Hlutverki breytt: Ég fékk lánað"`
- Eldri events (án newRole) → halda gamla formati: `"Hlutverki breytt: {itemName}"` (backward compat)
- Engin sér detail-lína - nýja hlutverkið er i aðalmerki

**`components/loans/SwitchRoleButton.tsx`:**
- Sendir `currentRole` til `switchLoanRole`

**`messages/is.json`** (teskeid.home):
- Nýr lykill: `"eventLoanRoleSwitchedToRole": "Hlutverki breytt: {roleName}"`

**`messages/is.json`** (teskeid.loans.history):
- `"roleLender": "Ég lánaði"`
- `"roleBorrower": "Ég fékk lánað"`

**`messages/en.json`:**
- `"eventLoanRoleSwitchedToRole": "Role changed: {roleName}"`
- `"roleLender": "I lent this"`, `"roleBorrower": "I borrowed this"`

### 3. Tests uppfaerðar

**`lib/__tests__/actions.test.ts`:**
- Allir switchLoanRole calls fengið currentRole argument
- payload test uppfaerður: `{ itemName: 'Bók', newRole: 'borrower' }`
- Nýr test: `puts newRole (flipped from currentRole) in the event payload`

**`lib/__tests__/loan-pages.test.tsx`:**
- Detail page: "renders SwitchRoleButton" breyttur i "does not render SwitchRoleButton on detail page"
- Edit page: 3 nýir tests:
  - SwitchRoleButton birt FYRIR OFAN LoanForm (DOM order staðfest)
  - SwitchRoleButton birt FYRIR OFAN LoanItemDetailsForm (DOM order staðfest)
  - Pending recipient: einungis SwitchRoleButton, engin form
- "throws notFound when item is not in the list" uppfaerður til að nota pending fallback lýsingu

---

## Niðurstöður profana

```
Tests  1348 passed | 22 skipped | 8 todo (1378)
TypeScript: no errors
```

+4 tests fra v018 (1344 → 1348):
- 1 newRole payload test i actions.test.ts
- 3 edit page SwitchRoleButton tests i loan-pages.test.tsx

---

## Hvað er EKKI gert

- SQL64 er þegar keyrt (Stebbi staðfesti)
- Ekkert er committað eða push-að
- Ekkert er deployed

---

## Localhost checks for Stebbi (fra v019 handoff)

1. `/auth-mvp/lanad-og-skilad/b48f0e6c-131a-449d-ac95-d731c9b97738`
   - Vaent: LoanCard og Saga hlutarins - enginn "Leiðrétta í:" takki
2. Smella á edit/penn
   - Vaent: "Leiðrétta í: Ég lánaði" eða "Leiðrétta í: Ég fékk lánað" fyrir ofan formið
3. Smella á takkann
   - Vaent: hlutverkið snýst, sidan refreshast
   - Saga hlutarins sýnir: "Hlutverki breytt: Ég fékk lánað" (eða lánað)
4. Proba 360/390/460px - enginn láréttur overflow
