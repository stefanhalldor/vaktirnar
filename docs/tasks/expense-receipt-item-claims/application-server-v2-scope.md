# Standalone kvittuskipting v2 — application/server cutover scope

Status 2026-09-16: prepared and tested contracts/server boundary; deliberately
not imported by live routes before SQL184 exact postflight.

## Boundary

- Only standalone `lib/receipt-split` moves to contract version 2 and scale 3000.
- Shared Expense receipt contracts remain scale 1000 and are not edited.
- Browser sends no actor identity. The server resolves the confirmed Teskeið user
  and calls service-role-only RPCs with that actor.
- `receipt_split_read_v2` adapts an unupgraded v1 split exactly (`milli * 3`) and
  exposes `sourceContractVersion`; the first successful v2 write upgrades the
  same stable rows under the parent lock.
- V1 public writers fail closed after a split reaches v2. V1 splits keep working
  until a v2 write upgrades them. SQL184 installation alone upgrades no rows.

## Application cutover after exact postflight

1. Switch detail reads to `receipt_split_read_v2` and `splitViewV2Schema`.
   List reads may remain v1 because their response has no quantities.
2. Parse pasted JSON through `parseSplitExtractionV2Text`. For the existing image
   provider, adapt its legacy standalone extraction through
   `parseSplitExtractionV2`; do not alter the shared Expense provider contract.
3. Send create/review lifecycle payloads with explicit `contractVersion: 2` and
   `quantityScale: 3000`. Review becomes stable item-level add/edit plus
   `save_review`; it must not delete/reinsert item IDs.
4. Use `editSplitV2` for claim, item edit, add item, reference-total edit,
   save-review and confirm. Keep the same request ID on a user-initiated retry;
   never automatically retry an uncertain mutation.
5. Replace the live board with the accepted preview interaction: exact presets,
   Eftir/Búið grouping, canonical participant pills, explanations and pinned
   focused/dirty rows. Keep 8-second/focus refresh and pending/error feedback.
6. Use `splitSummaryV2`: participant totals allocate only actual line totals;
   receipt-reference difference is shown separately. Include the unclaimed share
   when distributing tax/tip/discount adjustments.
7. Map `split_return_claims_first`, `split_quantity_claimed` and `split_conflict`
   to short translated messages. A conflict refreshes authoritative state without
   discarding a dirty control until the user resolves it.

## Concurrency and revisions

- Every writer locks request identity before the split parent row.
- Claim compares item revision, caller's previous own units and total capacity.
  It does not compare the whole split version, so unrelated members can claim
  concurrently after serialization.
- Item edit increments item revision. Any stale claim based on old price or
  quantity is rejected. Owner edits cannot reduce below total claims or set a
  claimed line to zero.
- Reference-total edits use split version. Additions intentionally serialize and
  append without requiring a stale whole-split version, preserving concurrent adds.

## Rollout and rollback limit

SQL184 is additive and lazily upgrades data. Before any v2 write, transaction
rollback/removal is possible by a separately reviewed artifact. After an exact
third or another v2-only value is stored, scale 1000 cannot represent it without
loss. Therefore no automatic downgrade/recovery SQL is supplied. A Production
rollback after v2 usage must keep SQL184 data readable and roll the application
forward; destructive conversion back to milli requires a separate owner decision.

No SQL, commit, push, merge or deploy is authorized by this document.

## Localhost checks for Stebbi

This scope document adds no new live localhost behavior. After SQL184 exact
postflight and the later application cutover, test the existing private split URL
with two confirmed Teskeið users: one takes thirds while the owner edits another
line; verify stable names/claims, conflict feedback and separate totals. Use only
synthetic data and consenting accounts. No ÚL/Expense entry should be created.
