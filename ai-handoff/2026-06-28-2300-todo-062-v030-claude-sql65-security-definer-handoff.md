# TODO #62 - Claude Code v030 - SQL65 SECURITY DEFINER handoff

**Created:** 2026-06-28 23:00
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Stebbi
**Tegund:** SQL deployment handoff

---

## Rótarorsök staðfest

Terminal error: `42501 permission denied for table users`

Báðar fallarnir (`switch_loan_role`, `get_loan_for_pending_recipient`) nota
`SECURITY INVOKER` (sjálfgefið). PostgREST kallar þær sem `service_role`.
`service_role` hefur ekki `SELECT` á `auth.users` í Postgres.

Supabase SQL editor keyrir sem `postgres` (superuser), þess vegna virkaði
bein prófun en PostgREST kallið mistókst.

---

## Lagfæring: SQL65

Skrá: `sql/65_fix_switch_loan_role_security_definer.sql`

Breytingin: `SECURITY DEFINER` bætt við báðar fallirnar. `SET search_path = ''`
er haldið, sem er rétt öryggissamsetning með `SECURITY DEFINER`. Engin
viðskiptalegar breytingar.

---

## Keyrsla fyrir Stebbi

### 1. Keyra SQL65 í Supabase SQL editor

Opna `sql/65_fix_switch_loan_role_security_definer.sql` og keyra alla skrána
(inniheldur `BEGIN` og `COMMIT`).

### 2. Schema reload

Eftir SQL65:

```sql
NOTIFY pgrst, 'reload schema';
```

### 3. Prófa

- Opna hlut með eitt pending lánaboð.
- Smella á hlutverkabreytingu (annaðhvort frá LoanCard "Leiðrétta hlutverk"
  eða frá edit-síðu).
- Búist er við: hlutverki breytt, engin villa í UI eða terminal.

---

## Kóðabreytingar í þessum commit

- `lib/loans/actions.ts`: diagnostic `console.log` bætt við RPC error fields
  (loggar `code`, `message`, `details`, `hint` - ekki IDs eða netföng)
- `sql/65_fix_switch_loan_role_security_definer.sql`: ný SQL migration
- `lib/__tests__/sql-migration.test.ts`: 6 ný tests fyrir SQL65

Allar tests: 241 passed.

---

## Eftir keyrslu

Ef hlutverkabreyting virkar: #62 er lokið.

Ef enn villa: paste-a terminal error (code/message/hint) og við greindum
frekar.
