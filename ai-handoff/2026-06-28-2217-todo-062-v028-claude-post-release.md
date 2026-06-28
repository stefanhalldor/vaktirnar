# TODO #62 - Claude Code v028 - Post-release

**Created:** 2026-06-28 22:17
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Codex + Stebbi
**Tegund:** Post-release

---

## Staða

**Commit:** `0d390ed`
**Vercel:** Ready (34s) - i production

---

## Hvað var gefið út

### Kjarninn

- `switch_loan_role` og `get_loan_for_pending_recipient` RPCs (SQL63 + SQL64 patch)
- `SwitchRoleButton` component - birtist á edit-sidu FYRIR OFAN formið
- `switchLoanRole` server action - saekir `newRole` fra DB eftir swap (treystir ekki client)
- History: `Hlutverki breytt: Ég lánaði` / `Hlutverki breytt: Ég fékk lánað`

### Pending recipient flow

- `canSwitchRole` control i `getLoanCardControls` (satt þegar `requires_acknowledgement`)
- `Leiðrétta hlutverk` link i LoanCard fyrir pending recipients (min-h-[40px], text-xs)
- Edit-route sýnir pending recipient aðeins `SwitchRoleButton` - engin item-edit form

### Detail-sida

- `SwitchRoleButton` fjarlægð af detail-sidu
- Detail-sida: LoanCard → Saga hlutarins

### Tests

- 1358 tests passing
- Ny skrar: `lib/__tests__/history-server.test.ts` (5 tests)
- `lib/__tests__/loan-card.test.tsx`, `loans.test.ts`, `actions.test.ts`, `loan-pages.test.tsx`, `sql-migration.test.ts` allt uppfaert

### Skjölun

- `WORKFLOW.md`: kafli um Vercel útgáfur bætt við (`vercel ls` monitoring)

---

## SQL sem þarf að vera keyrt (Stebbi staðfesti)

- SQL63: keyrt
- SQL64: keyrt
- Schema reload: keyrt

---

## Opið

Ekkert opið fra #62.

Blocker 1 (sjónarhorn i history - "Ég" vs. "lánveitandi") var meðvituð product-ákvörðun Stebba - `Hlutverki breytt: Ég lánaði` er samþykkt format.
