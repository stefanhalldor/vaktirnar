# SQL132 — independent events and tagged expenses

SQL132 separates owner-private, mutable event rosters from the canonical
Expenses ledger. It adds optional immutable event tags/provenance to newly
created one-off expenses and a read-only settlement preview. It does not add a
writable event-settlement flow.

Nothing in this folder has been executed by Codex.

## Manual order for Stebbi

Use the same intended database/session and keep each result before continuing:

1. Run `preflight.sql`. Stop unless it returns exactly one row with
   `prerequisites_ok = true`. Save the full one-row result, especially the
   complete `preservation_digests` JSON object. On the diagnosed production
   baseline, `recent_events_acl_safe_entry_ok` must be `true` and
   `recent_events_acl_state` must be
   `legacy_full_requires_normalization`. If the table was already hardened,
   the only other accepted state is `narrow_target`.
2. Run `../../132_independent_events_and_tagged_expenses.sql` once. This is the
   only write step. It is transaction-bound and forward-only. In addition to
   the v2 schema/data work, it atomically normalizes the existing
   `recent_events` table ACL as described below.
3. Run `postflight.sql`. Stop unless it returns exactly one row with
   `postconditions_ok = true`. Compare the complete preflight and postflight
   `preservation_digests` JSON values byte-for-byte; every `row_count`,
   `id_digest` and `content_digest` entry must match exactly. The scripts run in
   separate read-only sessions and therefore cannot perform that cross-session
   comparison for you.
4. Only after steps 1–3 are green, restart/use the existing localhost process
   yourself and run the checks below. App rollout must remain DB-first.

Do not run the migration before a green preflight. Do not run recovery as a
rollback: `recovery.sql` is a read-only inventory and forward-fix guide.

## Data and security effects

- Creates five private tables: independent events, guests, idempotency receipts,
  one-off expense links and immutable participant provenance.
- Backfills only SQL131 event/guest domain rows, deterministically preserving
  legacy event/group IDs, guest/member IDs and order. It creates no tag for any
  legacy expense and rewrites no financial history.
- Replaces only the guarded SQL131 compatibility create RPC and canonical
  account-deletion RPC. The old create RPC retains its signature, fingerprint,
  receipt and `{event_id}` result while atomically dual-writing v2 event rows.
- New tagged expense creation delegates to the exact canonical SQL110 one-off
  mutation in the same transaction. It derives IDs server-side and atomically
  writes one immutable tag and selected participant provenance.
- All new tables are owned by `postgres`, have `ENABLE` and `FORCE` RLS, no
  policies and no table/column privilege for PUBLIC, `anon`, `authenticated` or
  `service_role`. Only the eight exact app RPCs receive `service_role` EXECUTE,
  including exact owner-only `teskeid_event_get_expense_source(uuid,uuid)` so a
  selected event is never inferred from the bounded list endpoint.
- The production diagnostic found SQL46's intended `service_role` CRUD grant
  alongside legacy Supabase default table privileges on `recent_events`.
  Preflight accepts only that exact diagnosed eight-privilege envelope or the
  already-hardened CRUD target. The migration revokes direct table privileges
  from PUBLIC, `anon`, `authenticated` and `service_role`, then grants only
  `SELECT`, `INSERT`, `UPDATE` and `DELETE` back to `service_role`. It removes
  `MAINTAIN`, `REFERENCES`, `TRIGGER` and `TRUNCATE`; it changes no rows, RLS,
  policies, default privileges or identity-sequence privileges. A final
  in-transaction attestation and postflight both require the narrow target.
- No auth user, email, notification, external service or secret is changed by
  the validation scripts. The migration changes schema/data only when Stebbi
  runs it.

## Frozen dependency source map

The preflight and the migration guard compare exact LF-normalized `prosrc` MD5,
owner, security mode, singleton `search_path`, overload set and ACL for every
invoked legacy dependency. The postflight reattests the unchanged chain. The
tracked final sources are:

- SQL56: `normalize_email_canonical` (`3083103976aa8cb3780937b9da1be236`).
- SQL96: beta/access/request/group helpers plus `expense_group_balances`,
  `expense_simplified_settlement` and `expense_touch_updated_at`; the latter is
  deliberately SECURITY INVOKER. SQL102's known-member wrapper is the one
  frozen exception with `search_path=pg_catalog, public`.
- SQL97: the final `expense_record_activity` replacement
  (`ad3e4ade2c93001e2a8b2180288107a5`).
- SQL102/103/105/110/112: terminalization, reported-repayment guard/review,
  final canonical expense mutation, exact participant delegate and unified
  invitation delegate.
- SQL123/124: settlement activity/item/transition, exact trigger helpers and
  the final proposal function.
- SQL131: every event helper/trigger/read/classifier, the pre-SQL132 create body
  and the pre-SQL132 account-deletion body.

The exact per-signature hashes are intentionally duplicated in preflight,
migration and postflight and are mechanically cross-checked by the SQL132
static test. These are static/source gates only: Codex did not run PostgreSQL,
Supabase's SQL parser, preflight, migration or postflight.

## Forward-only recovery

Never drop or rewrite the new tables, receipts, roster, tags, provenance or
financial history to recover. If a defect appears, use the existing external
feature kill-switch only with separate authority, run `recovery.sql` for a
read-only inventory, and ship a new numbered additive migration.

## Localhost checks for Stebbi

Run these only after the manual preflight → migration → postflight sequence is
green. Use synthetic names, test emails and tiny test amounts; do not test
account deletion or real debts.

1. Open `/auth-mvp/vidburdir`, create an event with zero guests and reopen it.
   Expect an independent event and no expense group/ledger UI.
2. Add a known Teskeið relationship, a Unicode manual name and a test email,
   save, reopen, then remove one guest. Expect stable order/IDs, no invitation,
   debt, notification or guest access.
3. Try concurrent/stale roster saves in two tabs. Expect one success and one
   friendly revision conflict without losing the local draft.
4. Open `Nýr útlagður kostnaður` from the event. Expect the ordinary one-off
   form, event source selected but no guest auto-selected. Choose an explicit
   subset plus payer/payments/shares and save.
5. Verify the event detail shows a bounded read-only per-currency preview and
   `Skoða uppgjör`, never a writable `Gera upp viðburð` action.
6. Edit the roster after saving. Expect the historical expense member,
   payments, shares, repayments, tag and provenance to remain unchanged.
7. Test standalone one-off, group/circle, invitations and `Gera allt upp` for
   regression. Test Events-without-Expenses and Expenses-without-Events gates;
   neither path may leak event metadata or amounts.
8. At 360, 390 and 460 px, verify source labels wrap, inputs stay 16 px,
   keyboard/sheet focus returns, pending feedback is visible and there is no
   horizontal overflow or double submit.

If any DB step is not green, do not continue to localhost and do not rerun an
older migration. Keep the outputs and prepare a forward-fix handoff.
