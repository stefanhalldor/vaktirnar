# Post-release v002: recipient_email í get_my_loans -- migration leiðrétt

**Handoff:** Claude Code → næsti agent / Stebbi
**Dagsetning:** 2026-06-22 17:20
**Fyrri handoff:** `2026-06-22-0820-todo-053-v001-claude-recipient-email-post-release.md`
**Codex rýni:** `2026-06-22-1707-todo-043-047-v002-codex-recipient-email-post-release-review.md`

---

## Hvað var lagað

Codex fann þrjú kritísk vandamál í v001 migration sem voru leiðrétt:

### 1. `CREATE OR REPLACE` virkar ekki við return-shape breytingu

PostgreSQL leyfir ekki `CREATE OR REPLACE FUNCTION` þegar `RETURNS TABLE` breytist. Migration 55 notar nú `DROP FUNCTION IF EXISTS` + `CREATE FUNCTION` í transaction -- sama mynstur og migration 50.

### 2. UNION ALL branch (soft-ack) var glatað

V001 migration var byggð á `sql/32_loan_functions.sql` (gömul útgáfa) en á að byggja á `sql/50_loan_soft_acknowledgement.sql` (núverandi). Ný útgáfa varðveitir:
- `DECLARE v_actor_email / v_actor_norm`
- Branch 2: pending invitation rows þar sem actor email passar við `recipient_email_normalized`
- `requires_acknowledgement boolean` dálkur

### 3. `REVOKE`/`GRANT` vantaði

V001 innihélt ekki permission statements. Nú eru þær til staðar.

---

## Skrár sem breyttust (frá v001)

| Skrá | Breyting |
|------|----------|
| `sql/55_get_my_loans_add_recipient_email.sql` | Endurskrifað: transaction, drop/create, soft-ack branches varðveittar, REVOKE/GRANT |
| `lib/__tests__/sql-migration.test.ts` | 17 ný regression próf fyrir migration 55 |

Allt annað frá v001 handoff er óbreytt (TypeScript type, LoanSummaryCard, LoanCard, LoanDetailPage, fixture fixes).

---

## Rollout order (mandatory)

1. **Keyra migration** `sql/55_get_my_loans_add_recipient_email.sql` í Supabase SQL editor
2. **Reload PostgREST schema cache**: Settings → API → "Reload schema"
3. **Deploya appkóðann** (push til main → Vercel)

Ef rollback þarf: endurdeploya fyrri appútgáfu fyrst, síðan endurskapa fallið úr `sql/50_loan_soft_acknowledgement.sql`.

---

## Teststaða

```
Test Files  42 passed (42)
Tests       1214 passed | 22 skipped | 8 todo
```

TypeScript: hreint.

---

## Localhost checks (sama og v001)

1. **Creator með pending boð** -- opna `/auth-mvp/lanad-og-skilad`:
   - Listaspjald sýnir netfang viðtakanda (t.d. `· jon@example.com`), ekki "Bíður svars"
   - Detail-síða: netfang í haustinum + "Bíður svars" sem stöðulína neðar

2. **Viðtakandi með pending soft-ack boð** -- skrá inn sem viðtakandi:
   - Pending boð birtist áfram á lista
   - "Þekki málið" og "Kannast ekki við þetta" virka
   - Viðtakandi sér EKKI sitt eigið netfang sem `recipient_email` dálk

3. **Samþykkt lán** -- nafn mótaðila birtist, ekki netfang

4. **Lán án boðs** -- engar rangar mótaðilaupplýsingar
