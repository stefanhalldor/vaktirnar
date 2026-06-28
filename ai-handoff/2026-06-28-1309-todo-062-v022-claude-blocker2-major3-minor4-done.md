# TODO #62 - Claude Code v022 - Blocker 2, Major 3, Minor 4 lagaðar

**Created:** 2026-06-28 13:09
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Stebbi
**Tegund:** Pre-release handoff

---

## Samhengi

Þetta svarar: `ai-handoff/2026-06-28-1247-todo-062-v021-codex-v020-review.md`

Blocker 1 (sjónarhorn í history) var sett til hliðar - Stebbi ræður í það.
Blocker 2, Major 3 og Minor 4 lagaðar.

---

## Hvað var gert

### Blocker 2 - `newRole` kemur nu fra serveri, ekki client

**`lib/loans/actions.ts`:**
- `switchLoanRole(loanId: string)` - `currentRole` parameter fjarlægður
- Eftir successful `switch_loan_role` RPC:
  1. Kallar `get_my_loans` - ef loan finnst, notar `my_role` sem `newRole`
  2. Ef ekki fundist (pending recipient) - kallar `get_loan_for_pending_recipient` og notar `my_role` thadan
  3. Ef ekkert finnst - `newRole` er undefined (kemur ekki i payload)

**`components/loans/SwitchRoleButton.tsx`:**
- `switchLoanRole(loanId)` - `currentRole` argument fjarlægt

### Major 3 - Tests fyrir history rendering

**`lib/__tests__/history-server.test.ts`** (ny skra):
- 5 tests fyrir `getLoanHistory`:
  - `loan_role_switched` med `newRole: 'lender'` → label: `Hlutverki breytt: Ég lánaði`
  - `loan_role_switched` med `newRole: 'borrower'` → label: `Hlutverki breytt: Ég fékk lánað`
  - Gamalt event (engin `newRole`) → label: `Hlutverki breytt: Bók` (backward compat)
  - `actor_display_name` → `actorLabel` birtist
  - RPC error → skilar `[]` (aldrei thrower)

### Minor 4 - Spacing á edit-sidu

**`app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`:**
- Baðar greinar (LoanForm og LoanItemDetailsForm) nú med `<div className="mb-5">` utan um `switchRoleButton`

### Uppfaert tests i actions.test.ts

**`lib/__tests__/actions.test.ts`:**
- Allir `switchLoanRole` calls fengið `currentRole` argument fjarlægt
- Test 1 (`returns ok and records actor event`): notar `mockResolvedValueOnce` par - fyrst `switch_loan_role`, sidan `get_my_loans` med `{ id, my_role: 'borrower' }`
- Test 9 endurnefnt: `fetches newRole from DB after swap and puts it in the event payload`
- Nytt test 10: `falls back to get_loan_for_pending_recipient for newRole when not in get_my_loans`

---

## Niðurstöður profana

```
Tests  1354 passed | 22 skipped | 8 todo (1384)
TypeScript: no errors
```

+6 tests fra v020 (1348 → 1354):
- 5 ny i history-server.test.ts
- 1 ny i actions.test.ts (pending fallback test)

---

## Hvað er EKKI gert

- Blocker 1 (sjónarhorn/"Ég" i history) - Stebbi ræður i þetta
- Ekkert er committad eda push-ad
- Ekkert er deployed

---

## Localhost checks fyrir Stebbi

1. Opna edit-sidu hlutarins
2. Staðfesta: bil milli `Leiðrétta í: ...` takka og `Hvað var lánað?` formsins
3. Smella á takkann
4. Staðfesta: nýtt history event birtist med `Hlutverki breytt: Ég lánaði` eða `Ég fékk lánað`
5. Prófa 360/390/460px - enginn láréttur overflow

Þegar Stebbi er sáttur → `commit og push`
