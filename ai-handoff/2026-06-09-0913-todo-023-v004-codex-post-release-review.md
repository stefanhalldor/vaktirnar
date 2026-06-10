# TODO #23/#24/#25 - Codex post-release review

**Dagsetning:** 2026-06-09 09:13
**Agent:** Codex
**Tengd TODO:** #23 Breyta nafni á lánaða hlutnum, #24 Athugasemdir á hluti í `Lánað og skilað`, #25 `Skrá hlut í láni` efst á lánalista
**Rýnt skjal:** `ai-handoff/2026-06-09-0905-todo-023-024-025-v003-codex-post-release-review.md`
**Rýndur kóði:** commit/status samkvæmt local workspace, þar á meðal `sql/44_loan_item_details_edit.sql`
**Niðurstaða:** Kóðinn er að mestu í lagi, en production rollout er ekki lokið fyrr en `sql/44` hefur verið apply-að með réttu leyfi/ferli.

## Findings

### High - Appið hefur shipped en `sql/44` er enn ókeyrt í Supabase

Post-release review segir að breytingin sé shipped en að DB migration `sql/44` þurfi enn að apply-a í Supabase.

Á meðan production app kallar `update_loan_item_details` en database function er ekki komin inn, mun details-only edit leiðin bila með RPC/transport error og notandi fær generic save failure.

Áhrif:

- Creator post-acceptance details edit getur bilað.
- Lender non-creator details edit getur bilað.
- #25 CTA og eldri full-edit leiðir virka samt áfram.

Mælt næsta skref:

- Stebbi þarf að samþykkja sérstakt SQL apply skref.
- Claude Code eða Stebbi keyrir `sql/44_loan_item_details_edit.sql` í réttu Supabase umhverfi.
- Ekki biðja Codex að apply-a SQL nema Stebbi biðji skýrt um það og samþykki leyfisbeiðni.

### Medium - Handoffið segir "What Codex should do: Apply sql/44 to Supabase"

Þetta fer gegn hlutverkaskiptingunni nema Stebbi biðji sérstaklega um SQL keyrslu.

Codex má rýna migration og útskýra áhættu, en Codex á ekki að keyra SQL/deployment sem sjálfgefið næsta skref.

Mælt:

- Breyta orðalagi í næsta Claude Code/Stebbi handoff í:
  - "Stebbi approves and applies sql/44, or explicitly asks Claude Code/Codex to do it with full permission request."

### Low - SQL item_name length check er ekki alveg eins og Codex mælti með

Í `sql/44_loan_item_details_edit.sql` er:

```sql
char_length(trim(p_item_name)) = 0 OR char_length(p_item_name) > 200
```

Codex hafði mælt með `char_length(trim(p_item_name)) > 200`.

Áhætta er lítil, því Zod trim-ar input áður en appið kallar RPC. Direct service_role RPC með leading/trailing spaces gæti þó hafnað input sem hefði orðið <= 200 eftir trim.

Þetta er ekki blocker fyrir release, en má laga ef `sql/44` er ekki búið að apply-a.

### Low - `/auth-mvp/heim` revalidation var aðeins bætt við nýju details action

`updateLoanItemDetails` revalidate-ar bæði:

- `/auth-mvp/lanad-og-skilad`
- `/auth-mvp/heim`

En eldri loan mutations gera enn bara `revalidatePath(LOANS_PATH)`, t.d. `createLoan`, `updateLoan`, `markReturned`, `undoReturn`, `deleteLoan`, `claimInvitation`, `declineInvitation`, `cancelInvitation`.

Þetta er ekki blocker fyrir #23/#24/#25, en tengist TODO #19 og getur skýrt af hverju `Nýlegt` var ótraust. Það ætti að fara í sér #19 fix, ekki blanda inn í þessa release nema Stebbi vilji það.

## Það sem leit vel út

- `sql/44` uppfærir ekki `loan_invitations.item_name_snapshot`.
- RPC permission regla notar `created_by OR lender_user_id`, annars `not_found`.
- RPC uppfærir aðeins `loan_items.item_name`, `note`, `updated_at`.
- Function execute er revoked frá `PUBLIC`, `anon`, `authenticated` og granted til `service_role`.
- `LoanItemDetailsForm` er þröngt: bara `item_name` og `note`.
- Edit route heldur full edit fyrir creator pre-acceptance og details-only fyrir creator accepted / lender non-creator.
- Borrower non-creator fær `notFound()`.
- #25 CTA er efst og ekki lengur tvítekin í `LoanList`.
- Exact CTA test notar `+ Skrá hlut í láni`, ekki substring.

## Verification

Codex keyrði local:

```powershell
npm run type-check
npm run test:run
```

Niðurstaða:

- `type-check`: exit 0
- `test:run`: exit 0
- Vitest: 30 test files passed, 859 tests passed, 22 skipped, 8 todo

Codex keyrði enga SQL og hafði engin áhrif á Supabase eða production gögn.

## Final recommendation

Kóðinn má standa með einni varúð:

1. Apply-a `sql/44` í Supabase áður en Stebbi treystir details-edit í production.
2. Ef `sql/44` er ekki enn apply-að, merkja þetta sem release follow-up/blocker.
3. Ekki breyta snapshot behavior.
4. Taka víðari `/auth-mvp/heim` revalidation/server-side read-state undir TODO #19, ekki sem hluta af #23/#24/#25 nema Stebbi biðji sérstaklega um það.
