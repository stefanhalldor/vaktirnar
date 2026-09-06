# TODO #107 — unified creator delete implementation and independent review

Created: 2026-09-06 04:22

Timezone: Atlantic/Reykjavik

## Findings first

1. **PASS for the bounded local implementation candidate.** The corrected
   product contract is implemented across private creation drafts, shared
   creation drafts, confirmed Expenses and confirmed Expenses with an open edit
   revision. The exact creator sees one consistent `Eyða kostnaði` concept;
   lifecycle state selects the safe backend path and confirmation copy.
2. **PASS after independent correction review.** The first whole-candidate
   review found two P2 and three P3/test-documentation findings. All were fixed
   and independently rereviewed with no remaining P0/P1/P2/P3 finding:
   - an ambiguous confirmed-delete outcome can now be closed, reopened and
     reconciled with `Athuga stöðu` without a second delete call;
   - unknown state uses neutral `Loka`, not the unprovable `Halda kostnaði`;
   - malformed SQL175 results with both `group_id` and `event_id` fail closed;
   - the operator README now describes the exact state-conditioned booleans;
   - the static test now freezes all 52 unique constraint tuples across all
     four SQL gates.
3. **PASS for app/static gates on the final bytes.** The final combined matrix
   passed 18 files / 388 tests, `tsc --noEmit` passed, and the Next.js
   production build passed and generated 150 pages. `git diff --check` passed.
4. **PASS for static SQL safety, with a deliberate runtime-proof gap.** SQL175
   migration, preflight, rehearsal and postflight are internally synchronized;
   rollout never calls the delete RPC or mutates application rows. SQL159,
   SQL172 and SQL173 are byte-identical to base. However, no SQL was parsed or
   run by PostgreSQL in this authorized phase. Real catalog, parser and locking
   behavior therefore remains an operator gate, not an established fact.
5. **Release-manifest caution.** The implementation payload contains exactly
   51 paths: 30 tracked modifications and 21 untracked files. It intentionally
   includes accepted/co-travelling SQL174 dashboard/save-error/hydration work
   as well as TODO #107. Ten conceptual mixed-scope files are represented in
   six runtime and four test paths. Broad staging is unsafe; a future release
   must use the exact reviewed allowlist.
6. **TODO #107 is not released or complete.** Nothing was staged, committed,
   pushed, deployed or installed. No Production or Supabase state changed.
   The next gate is repository/release reconciliation under separate authority,
   not manual SQL execution from this transient candidate.

Independent final verdict: **PASS for candidate content and manifest**.
Confidence is high for the reviewed source/static contracts and intentionally
limited for PostgreSQL runtime behavior until the manual gates are run.

## Mannamál

Notandinn fær nú sömu aðgerðina, **Eyða kostnaði**, sama hvort kostnaðurinn er:

- einkadrög;
- deild drög;
- staðfestur kostnaður;
- eða staðfestur kostnaður sem er með opin breytingadrög.

Undir húddinu eru þetta enn mismunandi öruggar leiðir:

- einkadrögum er eytt sem drögum;
- deildum drögum og deilingu þeirra er eytt saman;
- `Hætta að deila` er áfram sérstök, óeyðandi aðgerð sem heldur drögunum;
- staðfestur kostnaður notar áfram óbreytt SQL173 öryggiscontract;
- opin breytingadrög loka tímabundið á varanlega eyðingu. Notandinn þarf fyrst
  að velja sérstaklega að hætta við breytingarnar og má síðan taka nýja,
  aðskilda ákvörðun um eyðingu;
- annar notandi en nákvæmur stofnandi fær aldrei eyðingarheimild, jafnvel þótt
  hann sé Event-owner, group-admin eða hafi edit-heimild.

Eyðing gerist aðeins eftir innskráða UI-aðgerð og staðfestingu. SQL175
rolloutið setur aðeins upp tæknilega möguleikann. Það eyðir engu við
installation, preflight, rehearsal eða postflight.

Þessi hegðun er aðeins í isolated local candidate enn sem komið er. Hún er
ekki komin á localhost hjá Stebba nema hann keyri þennan candidate með réttu
gagnagrunnsumhverfi, og hún er ekki komin í Production.

## Candidate boundary

- Isolated candidate:
  `C:\Users\Lenovo\AppData\Local\Temp\vaktirnar-todo107-release-20260905-0210`
- Detached `HEAD`:
  `a2b00792194b83a7368fb05cafd712fc6fd9f6c7`
- Cached `origin/main`:
  `a2b00792194b83a7368fb05cafd712fc6fd9f6c7`
- Staged paths before this handoff: `0`
- Implementation payload before this handoff: `51` paths
- Canonical implementation manifest SHA-256, calculated over sorted lines of
  `sha256␠␠path` for those 51 paths:
  `5465178b957151c50a8bcf90925c101a634a00b0fae414ab956b69469fca1ff2`
- This handoff is an additional task-owned record ignored by the repository's
  `/ai-handoff/*.md` rule. It does not change the 51-path status count and is
  not part of that circular implementation digest. A future release must make
  an explicit exact-file decision if this record is to be force-added.
- The ambient dirty checkout at
  `C:\Users\Lenovo\Documents\vaktirnar` was not edited.
- `.env.local` was not read or copied. No secret was inspected.
- No fetch was performed in this phase; a future release must verify actual
  remote ancestry before staging.

## Product and technical implementation

### One reusable delete control

`components/expenses/ExpenseDeleteControl.tsx` is now the common destructive
surface for creation drafts and confirmed Expenses. It provides:

- the single trigger `Eyða kostnaði`;
- subject-specific confirmations for private draft, shared draft and confirmed
  Expense;
- a Radix modal / mobile bottom sheet following `Design.md`;
- 44px-class touch targets, wrapping, `100dvh` and safe-area handling;
- initial focus on the least-destructive action, never delete;
- pending locks, focus return and screen-reader live status;
- same-request replay and a read-only `Athuga stöðu` path after an ambiguous
  outcome;
- neutral `Loka` after an unknown outcome because the client cannot then promise
  the cost still exists;
- visible disabled/blocked presentation for an exact creator, while a
  noncreator receives no delete authority or control.

`components/expenses/ExpenseDraftDeleteOnly.tsx` provides the bounded fallback
when a creator can safely delete a persisted draft but the old editing context
can no longer be opened.

### Creation-draft server path

The new server action `deleteOwnExpenseCreationDraft`:

- derives the actor from the authenticated Expense guard;
- accepts only a strict request ID, draft ID, draft version and nullable
  publication version;
- calls only the service-role SQL175 RPC;
- validates an exact seven-key, PII-free result;
- rejects both `group_id` and `event_id` being non-null;
- treats malformed or ambiguous results conservatively as
  `delete_outcome_unknown`;
- preserves the same request identity until authoritative reconciliation;
- treats cache invalidation after a proven commit as follow-up, not as a failed
  write that should be retried.

The form also binds the live delete capability back to the exact persisted
draft, lifecycle context, group identity, draft CAS and publication CAS. A
capability for draft A cannot authorize deleting draft B.

### Routing and read models

| Surface | Creator behavior | Noncreator behavior |
| --- | --- | --- |
| Dashboard | Existing creator management target is retained. | Existing read-only/detail target is retained. |
| Event | Private/shared creation draft opens its authoritative editor when the exact author mapping is known. | Shared participant remains on read-only `/drog/...`; broad Event visibility never grants delete authority. |
| Reusable group | Creator-owned private drafts stay visible; shared creator opens the editor. | Participant remains read-only. |
| Direct `/drog/...` | Exact author is redirected to the authoritative one-off/group editor, or receives a fail-closed management-unavailable state. | Remains read-only with no creator delete control. |
| Confirmed edit route | Exact creator sees `Eyða kostnaði` blocked by `open_revision`. | No delete authority. |

Successful creation-draft deletion no longer trusts returned RPC context IDs as
navigation authority. Default success and uncertain reconciliation go to the
authenticated Expense dashboard. An Event or reusable-group destination is
used only when the rendering server route has separately proven that context
readable. This closes the stale-Event-entitlement redirect found during review.

There is an ordinary time-of-check/time-of-use residual: context access can be
revoked after server render but before the click. Route authorization still
fails closed, though that rare race can show a 404 rather than the dashboard.

### SQL175

SQL175 adds seven functions and no table, column, constraint, index, trigger,
policy or auth configuration:

- internal `expense_sql175_private_group_summary`;
- internal `expense_sql175_begin_event_delete_request`;
- `expense_list_group_creation_drafts_v1`;
- `teskeid_event_get_expense_pre_active_v2`;
- `expense_get_shared_draft_management_target_v1`;
- `expense_get_own_creation_draft_delete_capability_v1`;
- `expense_delete_own_creation_draft_v1`.

The five application entry points grant `EXECUTE` only to `service_role`. The
two internal helpers remain owner-only. `anon` and `authenticated` receive no
direct execution grant. Functions are owned by `postgres`, use an empty
`search_path`, and have exact metadata, ACL and dependency checks.

The mutation:

- accepts only exact creator-owned `one_off` or reusable-group creation drafts;
- rejects edit drafts and any draft already bound to a confirmed Expense;
- serializes request receipts and locks draft → publication → publication
  parties/audience in canonical order;
- checks draft and publication CAS versions, including safe-integer limits;
- uses an Event request/lock when Event context exists, without turning current
  Event ownership into delete authority;
- rejects durable finalization evidence even in corrupt/legacy mixed state;
- performs exactly one delete of the selected private draft;
- reuses SQL159's frozen `BEFORE DELETE` trigger for tombstone, party/audience
  cleanup and publication retirement/version bump;
- returns only contract/state/draft/subject/context IDs, with no title, amount,
  participant, email, note, payload or receipt content;
- never deletes a reusable group or confirmed Expense.

Confirmed Expense deletion stays byte-for-byte on SQL173. That includes its
settlement, repayment, open revision, Event/legacy, receipt/provenance and
one-off-group safety invariants. A confirmed eligible dedicated `one_off`
capsule can still be removed atomically by SQL173; reusable groups remain.

### What was reused unchanged

- SQL173 confirmed Expense capability and permanent-delete mutation.
- SQL159 draft delete trigger, durable draft tombstone and publication cleanup.
- SQL168 discard-edit and unshare semantics.
- Existing authenticated Expense guard, service-role repository boundary,
  request-ID helper and cache revalidation families.
- Existing Expense shell/loading hierarchy and canonical Radix/mobile patterns.

### What was genuinely new

- The SQL175 creation-draft capability, mutation and additive read contracts.
- The reusable lifecycle-aware UI control and deletion-only fallback.
- Creator management routing for Event/group/direct shared-draft surfaces.
- Private creation-draft rows on the reusable group surface.
- Blocked whole-cost delete presentation in confirmed edit routes.
- Strict app DTO/action parsing, CAS/replay and ambiguous-outcome UX.
- Focused route, component, action, repository and SQL static regression proof.

## Exact implementation manifest

The following categories are exhaustive and sum to the 51-path payload.

### A. Pre-existing/co-travelling runtime only — 1

- `components/expenses/ExpenseMutationErrorDialog.tsx`

### B. Mixed pre-existing + TODO #107 runtime — 6

- `app/auth-mvp/utlagt-og-endurgreitt/nytt/page.tsx`
- `components/expenses/ExpenseContextDraftList.tsx`
- `components/expenses/ExpenseForm.tsx`
- `lib/expenses/actions.ts`
- `messages/en.json`
- `messages/is.json`

These include the accepted hydration fix and the co-travelling visible
save-error/member-normalization work as well as unified-delete changes.

### C. TODO #107-only runtime — 13

- `app/auth-mvp/utlagt-og-endurgreitt/drog/[publicationId]/page.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/hopar/[groupId]/nytt-utgjald/page.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/breyta/page.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page.tsx`
- `components/expenses/ExpenseDeleteControl.tsx`
- `components/expenses/ExpenseDraftDeleteOnly.tsx`
- `components/expenses/ExpenseItemActions.tsx`
- `components/expenses/ExpenseItemDetail.tsx`
- `lib/events/repository.server.ts`
- `lib/expenses/contracts.ts`
- `lib/expenses/repository.server.ts`
- `lib/expenses/unconfirmed-publication.ts`
- `lib/expenses/validation.ts`

### D. Pre-existing/co-travelling tests — 4

- `lib/__tests__/expense-event-context-integration.test.ts`
- `lib/__tests__/expense-tes24-runtime-contract.test.ts`
- `lib/__tests__/expense-sql174-dashboard-runtime-diagnostic.test.ts`
- `lib/__tests__/expense-sql174-event-shared-precedence-fix.test.ts`

### E. Mixed tests — 4

- `app/auth-mvp/utlagt-og-endurgreitt/__tests__/event-route-behavior.test.tsx`
- `components/expenses/__tests__/expense-context-draft-list.test.tsx`
- `components/expenses/__tests__/expense-form-multipayer-ui.test.tsx`
- `lib/__tests__/expense-unconfirmed-publication-actions.test.ts`

### F. TODO #107 app tests — 9

- `app/auth-mvp/utlagt-og-endurgreitt/__tests__/expense-edit-route-states.test.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/__tests__/shared-draft-detail-route.test.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/__tests__/group-draft-delete-route.test.tsx`
- `components/expenses/__tests__/expense-delete-control.test.tsx`
- `components/expenses/__tests__/expense-item-actions.test.tsx`
- `lib/__tests__/expense-actions-guard.test.ts`
- `lib/__tests__/expense-unconfirmed-publication-contract.test.ts`
- `lib/__tests__/expense-unconfirmed-publication-repository.test.ts`
- `lib/events/__tests__/actions-repository.test.ts`

### G. SQL175 static test — 1

- `lib/__tests__/expense-sql175-unified-creator-draft-delete.test.ts`

### H. Pre-existing/co-travelling SQL174/dashboard artifacts — 8

- `sql/174_expense_sql159_event_shared_precedence_fix.sql`
- `sql/validation/174-expense-dashboard-runtime-diagnostic/README.md`
- `sql/validation/174-expense-dashboard-runtime-diagnostic/diagnose-runtime-unavailable.sql`
- `sql/validation/174-expense-sql159-event-shared-precedence-fix/README.md`
- `sql/validation/174-expense-sql159-event-shared-precedence-fix/preflight.sql`
- `sql/validation/174-expense-sql159-event-shared-precedence-fix/rehearse-migration.sql`
- `sql/validation/174-expense-sql159-event-shared-precedence-fix/postflight.sql`
- `sql/validation/174-expense-sql159-event-shared-precedence-fix/recovery.sql`

### I. SQL175 artifacts — 5

- `sql/175_expense_unified_creator_draft_delete.sql`
- `sql/validation/175-expense-unified-creator-draft-delete/README.md`
- `sql/validation/175-expense-unified-creator-draft-delete/preflight.sql`
- `sql/validation/175-expense-unified-creator-draft-delete/rehearse-migration.sql`
- `sql/validation/175-expense-unified-creator-draft-delete/postflight.sql`

SQL175 deliberately has no recovery artifact. Recovery was not authorized and
must never be used for application-data cleanup.

## SQL175 reviewed artifacts and hashes

These links open the exact local reviewed artifacts for later copy into a fresh
Supabase SQL Editor tab. They are **not authorization to run them now**. Since
the candidate is uncommitted, no stable exact-commit GitHub link exists yet;
the release gate must produce that remote link before operator execution.

| Gate/artifact | Direct exact-file link | SHA-256 | Run in this phase |
| --- | --- | --- | --- |
| Preflight | [preflight.sql](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/sql/validation/175-expense-unified-creator-draft-delete/preflight.sql) | `5479bda4d6a9f70c30b248882d5e53f8de19a0957b8a1ccae927cdcfd1c5e3ff` | No |
| Rehearsal | [rehearse-migration.sql](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/sql/validation/175-expense-unified-creator-draft-delete/rehearse-migration.sql) | `3eafa0af5f48efccaa4ae41ea354073a9e4d7757b95324996d6eee7b0a2b8e5e` | No |
| Migration | [175_expense_unified_creator_draft_delete.sql](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/sql/175_expense_unified_creator_draft_delete.sql) | `1dc145fbb9d1e9fc757df8b94de193835a1ceb44a1c85180b6e52d5e33d8ad2f` | No |
| Postflight | [postflight.sql](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/sql/validation/175-expense-unified-creator-draft-delete/postflight.sql) | `a73d195ad1fb3d45debc42858592b1fe5d6586c6b39c77e334a90ebdde231f29` | No |
| Operator README | [README.md](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/sql/validation/175-expense-unified-creator-draft-delete/README.md) | `b1abd35144a0e04585eafa90a81e3f7fec62a6477fcfd3980e42a0e9f944fe12` | Read only |
| Static test | [expense-sql175-unified-creator-draft-delete.test.ts](C:/Users/Lenovo/AppData/Local/Temp/vaktirnar-todo107-release-20260905-0210/lib/__tests__/expense-sql175-unified-creator-draft-delete.test.ts) | `9a06f71e417336937be8c527b917f5565efbde6e2fd696d2268198e8359c7006` | Vitest only |

Installed function-body MD5 fingerprints frozen in the artifacts:

- private group summary: `0f6cac7b817e25d7f61ebf8a923e69d2`
- Event delete receipt gate: `ea3732c799f6737cb9dbbe7aebc02a36`
- group creation-draft reader: `578aecf4b838c85b9d70ad4748ea4f6e`
- Event pre-active v2 reader: `65270072a4d257dcdb650cf1715b324f`
- direct management target: `6c5bc595cf9610550dfdd6b1741870c2`
- creation-draft capability: `26b15255fc401c05eb7808917698fe30`
- creation-draft mutation: `4ba7b3a6be41204ec3807c63e37bdeb4`

Protected predecessor evidence against base:

| Artifact | Git blob | SHA-256 |
| --- | --- | --- |
| SQL159 | `6f89af36560a89b4a5113043cbec2619442e5848` | `b08b49aba63c3281c7e41ec44a72efe9b3810f100fdeef8569a32928adedc4ec` |
| SQL172 | `19ce171ea25127cf6e61ce312871f38187471b6e` | `f4634acce5e58c04a884d801fde97cf27ac80a4552c3274dbd42cfe630647e10` |
| SQL173 | `c76e98a36acaed95452dcd7762929f9cc0bae589` | `5cc70dcb100b3e4a31cb6744b16319eb96db961fc221c4881edfe3b08143a319` |

The four SQL175 constraint manifests independently contain 52 rows, 52 unique
full tuples, 52 unique relation/name identities and identical order. Their
canonical tuple digest is
`45026977a2d4384079402e800fd74a6af642886a190c5b4b1ed8eb290fe2c752`.

## Verification and command evidence

### Final green gates

| Command/gate | Exit | Result |
| --- | ---: | --- |
| `npm.cmd run test:run -- <18 exact changed/new test files>` | 0 | 18 files / 388 tests PASS on final bytes |
| `npm.cmd run test:run -- lib/__tests__/expense-sql173-validation-bundle.test.ts lib/__tests__/expense-sql173-owner-hard-delete.test.ts lib/__tests__/expense-sql174-dashboard-runtime-diagnostic.test.ts lib/__tests__/expense-sql174-event-shared-precedence-fix.test.ts lib/__tests__/expense-sql175-unified-creator-draft-delete.test.ts` | 0 | 5 files / 71 tests PASS |
| App correction matrix | 0 | 4 files / 83 tests PASS |
| Earlier full focused app/action/route matrix | 0 | 9 files / 152 tests PASS |
| `npm.cmd run type-check` | 0 | PASS on final bytes |
| `npm.cmd run build` | 0 | PASS; compiled, type/lint phase completed, 150 pages generated |
| `git diff --check` | 0 | PASS; only LF→CRLF notices |
| `git diff --cached --quiet` | 0 | No staged bytes |
| `git diff --exit-code a2b0079 -- <SQL159 SQL172 SQL173>` | 0 | Protected migrations byte-identical |
| `git rev-parse HEAD` and cached `origin/main` | 0 | Both `a2b00792194b83a7368fb05cafd712fc6fd9f6c7` |
| `Get-FileHash -Algorithm SHA256 <SQL175 artifacts>` | 0 | Exact hashes above |
| is/en JSON parse | 0 | PASS |
| Independent final read-only rereview | n/a | PASS; no remaining severity finding |

The exact 18-file command covered:

```text
app/.../__tests__/event-route-behavior.test.tsx
app/.../__tests__/expense-edit-route-states.test.tsx
app/.../__tests__/shared-draft-detail-route.test.tsx
app/.../__tests__/group-draft-delete-route.test.tsx
components/expenses/__tests__/expense-context-draft-list.test.tsx
components/expenses/__tests__/expense-form-multipayer-ui.test.tsx
components/expenses/__tests__/expense-item-actions.test.tsx
components/expenses/__tests__/expense-delete-control.test.tsx
lib/__tests__/expense-actions-guard.test.ts
lib/__tests__/expense-event-context-integration.test.ts
lib/__tests__/expense-tes24-runtime-contract.test.ts
lib/__tests__/expense-unconfirmed-publication-actions.test.ts
lib/__tests__/expense-unconfirmed-publication-contract.test.ts
lib/__tests__/expense-unconfirmed-publication-repository.test.ts
lib/events/__tests__/actions-repository.test.ts
lib/__tests__/expense-sql174-dashboard-runtime-diagnostic.test.ts
lib/__tests__/expense-sql174-event-shared-precedence-fix.test.ts
lib/__tests__/expense-sql175-unified-creator-draft-delete.test.ts
```

### Expected/non-product reds and warnings

- One intermediate four-file test run exited `1` because its new test wrongly
  asserted that safe unknown-outcome reconciliation must not invalidate cache.
  The implementation behavior was correct; the expectation was corrected and
  the final 83/83 and 388/388 runs passed.
- A broader SQL159/173/174/175 static matrix exited `1` with 93/94 tests because
  an existing raw-byte SHA test for unchanged `sql/96_expenses_core.sql` differs
  on Windows (`56070a...` observed versus `884eef...` expected). This is the
  known unrelated Windows/artifact failure explicitly excluded from TODO #107.
- An early plain `npm run` attempt in the preceding candidate work was blocked
  by PowerShell's `npm.ps1` execution policy. All real gates used `npm.cmd`.
- One read-only `git hash-object` probe exited `1` after guessing the wrong
  SQL172 filename. The corrected exact path exited `0` and produced the protected
  blob hashes above.
- Next.js build warnings concern existing hook dependencies in
  `ExpenseDashboardDirectory`, weather components and an existing `<img>` in
  `Avatar`. Build exited `0`; these files are outside this manifest.
- Git emitted only the known inaccessible global-ignore and LF→CRLF warnings.

No test used a real database or destructive fixture. No command invoked a SQL
artifact or RPC.

## Independent review trail

Independent read-only reviewers checked the app, SQL and final manifest.

Initial findings that were fixed:

1. stale RPC context could choose an unreadable Event destination;
2. confirmed ambiguous state could make `Athuga stöðu` unreachable after close;
3. `Halda kostnaði` overstated certainty after an unknown result;
4. dual-context SQL result was accepted by the app parser;
5. README clean-install/exact-installed booleans were contradictory;
6. the 52-constraint static test did not originally prove full tuple equality;
7. one blocked-control test title contradicted its assertion.

Final rereview confirmed:

- exact creator-only UI and mutation authority;
- strict identity, CAS and same-request replay boundaries;
- separate unshare/discard/cancel behavior with no chained destructive action;
- blocked confirmed edit state;
- server-proven navigation destinations;
- migration/rehearsal byte parity and non-destructive rollout;
- exact SQL173-installed 52-constraint closure;
- obsolete finalization FK absence plus replacement function/trigger lineage;
- exact private-draft DELETE-trigger closure;
- null-safe catalog aggregates;
- exact function owner, ACL, metadata, `search_path` and dependency closure;
- protected SQL159/172/173 bytes;
- exact 51-path manifest, no staged bytes and no package/config/TODO/DONE/env
  path.

No likely PostgreSQL grammar hazard was found by static review, but this is not
a substitute for the authorized operator rehearsal on a real PostgreSQL
catalog.

## What was intentionally excluded

- No SQL execution: no preflight, rehearsal, migration, postflight, recovery,
  RPC call, manual `DELETE` or diagnostic was run.
- No Supabase or Production application-data read/write.
- No real Expense, draft, Event, group, receipt or user data was created,
  edited or deleted.
- No auth, RLS, policy, secret, billing or deployment-setting change.
- No dev-server start, stop, restart, port control or browser automation.
- No `.env.local` or secret read/copy.
- No fetch, pull, merge, rebase, stage, commit, push, deployment or history
  rewrite.
- No `TODO.md` or `DONE.md` closeout. TODO #107 remains open.
- No repair of the unrelated SQL96 Windows raw-byte test or build warnings.
- No closure of #104 family acceptance.

## Exact next gate — STOP here

The authorized implementation/review phase is complete. **Do not run SQL175
yet.** The next gate is a separately authorized repository/release
reconciliation:

1. fetch and verify actual `origin/main`;
2. create a fresh isolated checkout from that exact remote commit;
3. reconcile the 51 implementation paths without reissuing already released
   work, and explicitly decide whether this ignored handoff record belongs in
   the release allowlist;
4. classify the co-travelling SQL174/save-error/hydration bytes explicitly;
5. run the focused matrix, type-check, build and exact manifest review again;
6. obtain independent release review;
7. only with explicit authority, stage the exact allowlist, commit, non-force
   push and verify the expected deployment.

That release handoff must provide stable links tied to the exact pushed commit.
Only then should Stebbi, as sole SQL operator, receive/run the sequence below.

### Later SQL operator sequence — not authorized now

1. **Preflight.** Run only the exact linked `preflight.sql` as `postgres` in a
   fresh SQL Editor tab.
   - Clean predecessor branch: all prerequisite/relation/constraint/private
     ACL/predecessor source+contract+ACL/delete-trigger/SQL173-guard flags,
     `prerequisites_exact`, `targets_absent`, `operator_state_ok` and
     `prerequisites_ok` are `true`; target-exact flags and `targets_exact` are
     `false`; state is `PREDECESSOR_READY`.
   - Already installed branch: prerequisite and all target-exact flags,
     `targets_exact` and `operator_state_ok` are `true`; `targets_absent` and
     `prerequisites_ok` are `false`; state is `EXACT_INSTALLED`. Skip rehearsal
     and migration, and run postflight only.
2. **Rehearsal.** From `PREDECESSOR_READY`, run only the exact rehearsal. One
   row must return with `executor_ok`, `candidate_catalog_verified`,
   `installation_rolled_back`, `predecessor_restored` and `rehearsal_pass` all
   `true`.
3. **Migration.** Run only the exact migration. Expected SQL Editor result:
   `Success. No rows returned.`
4. **Postflight.** Every prerequisite and target exactness flag must be `true`,
   `targets_absent = false`, `targets_exact = true`,
   `installation_state = EXACT_INSTALLED`, and `postconditions_ok = true`.

Any branch deviation, `false`/`NULL` where the selected state expects true,
`DRIFT_STOP`, malformed/missing row, PostgreSQL error or timeout means STOP.
Never run recovery automatically. Never call either deletion RPC or issue a
manual `DELETE` from SQL Editor.

## Localhost checks for Stebbi

These checks are for a later matching app + SQL175 non-Production environment.
Codex did not start or manage localhost. Before SQL175 is installed in the
database used by localhost, the new draft-delete RPC is expected to remain
unavailable and this acceptance must not be treated as runnable.

Use only deliberately disposable non-Production costs. Permanent deletion
cannot be undone.

1. **Private creation draft**
   - Sign in as its exact creator and open the authoritative one-off/group
     editor.
   - Verify `Eyða kostnaði` is visible from both form steps.
   - Open the sheet and confirm `Halda kostnaði` has initial focus.
   - Cancel once and verify nothing changes.
   - For a disposable draft, confirm deletion and verify only that draft
     disappears.
2. **Shared creation draft**
   - Verify both `Hætta að deila` and `Eyða kostnaði` are visible and clearly
     distinct.
   - First test `Hætta að deila`: sharing disappears but the private draft
     remains.
   - With another disposable shared draft, confirm permanent deletion: the
     draft and its sharing disappear together.
3. **Noncreator**
   - Open a shared draft as a participant or Event/group admin who is not the
     creator.
   - It stays read-only and no delete authority/control appears.
4. **Confirmed Expense**
   - On an existing safe, eligible creator-owned confirmed Expense, verify the
     same trigger opens the confirmed-cost copy and still uses SQL173.
   - Do not perform the final destructive confirmation on valued data.
5. **Open edit revision**
   - Open a confirmed creator-owned Expense with private/shared edit changes.
   - `Eyða kostnaði` remains visible but disabled with a clear explanation.
   - `Hætta við breytingar` removes only the edit revision and preserves the
     confirmed Expense. Any later permanent deletion requires a fresh,
     separate confirmation.
6. **Routes and stale context**
   - From dashboard, Event and reusable group, confirm creators reach the
     editor and participants reach `/drog/...`.
   - If Event access is missing/stale, confirm delete success or status checking
     falls back to the Expense dashboard rather than trusting an RPC Event ID.
7. **Unknown outcome UX**
   - If a safe test harness can simulate an ambiguous response without deleting
     valued data, verify the dialog says `Loka`, can be closed/reopened, then
     offers only `Athuga stöðu`; edit/cancel remain locked and no second delete
     fires before reconciliation.
8. **Mobile/accessibility/regression**
   - Check 360, 390 and 460px widths, keyboard focus, Escape, focus return,
     safe-area spacing, wrapping and no horizontal overflow/zoom.
   - Verify route loading feedback, the accepted deterministic date formatter,
     and the visible mutation-error overlay.
   - Refresh and navigate away/back; watch for stale-version, duplicate-save,
     unavailable-RPC, hydration, privacy or server errors.

Do not test deletion in Production through SQL Editor, a manual RPC call or a
direct `DELETE`. Any later Production destructive smoke requires a separately
chosen disposable case, explicit authorization and the normal authenticated UI
path.

## Notification note

Stebbi previously asked for an email when Codex next stopped. This session has
no email connector/tool, so no email could be sent. This handoff and the chat
response are the available stop notification.
