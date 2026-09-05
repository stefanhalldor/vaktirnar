import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/173_expense_creator_safe_hard_delete.sql'),
  'utf8',
)
const detailSource = readFileSync(
  join(process.cwd(), 'components/expenses/ExpenseItemDetail.tsx'),
  'utf8',
)

function functionBody(name: string) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const endMarker = '\n$function$;'
  const end = sql.indexOf(endMarker, start + marker.length)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end + endMarker.length)
}

describe('SQL173 creator-only safe hard delete', () => {
  it('retains only an opaque immutable tombstone and keeps internal authorization default-deny', () => {
    expect(sql).toMatch(/CREATE TABLE public\.expense_deleted_expense_tombstones \([\s\S]*?expense_id uuid PRIMARY KEY,[\s\S]*?deleted_at timestamptz/)
    const tombstoneDefinition = sql.slice(
      sql.indexOf('CREATE TABLE public.expense_deleted_expense_tombstones'),
      sql.indexOf('ALTER TABLE public.expense_deleted_expense_tombstones ENABLE'),
    )
    expect(tombstoneDefinition).not.toMatch(/title|amount|member|email|payload|actor|group_id/i)
    expect(sql).toContain('expense_deleted_tombstones_immutable_guard')
    expect(sql).toContain('REVOKE ALL ON TABLE public.expense_deleted_expense_tombstones')
    expect(sql).toContain('REVOKE ALL ON TABLE public.expense_hard_delete_authorizations')
    expect(sql).not.toMatch(/GRANT .* ON TABLE public\.(?:expense_deleted_expense_tombstones|expense_hard_delete_authorizations)/)
  })

  it('prevents deleted IDs from being recreated and preserves finalization replay integrity', () => {
    expect(sql).toContain('expenses_deleted_id_reuse_guard')
    expect(sql).toContain('expense_deleted_id_reuse')
    const reuseGuard = functionBody('expense_reject_deleted_id_reuse')
    const groupLock = reuseGuard.indexOf('FROM public.expense_groups AS group_row')
    const idLock = reuseGuard.indexOf('pg_catalog.hashtextextended(NEW.id::text, 173107)')
    expect(groupLock).toBeGreaterThanOrEqual(0)
    expect(groupLock).toBeLessThan(idLock)
    expect(idLock).toBeLessThan(
      reuseGuard.indexOf('FROM public.expense_deleted_expense_tombstones'),
    )
    expect(sql).toContain('DROP CONSTRAINT expense_unconfirmed_finalizations_expense_fk')
    const referenceGuard = functionBody('expense_validate_finalization_expense_reference')
    expect(referenceGuard).toContain('public.expenses')
    expect(referenceGuard).toContain('public.expense_deleted_expense_tombstones')
  })

  it('freezes the exact FK and trigger closure rather than trusting object names', () => {
    expect(sql).toContain('expense_sql173_object_collision')
    expect(sql).toContain('expense_sql173_predecessor_fk_catalog_drift')
    expect(sql).toContain('expense_sql173_installed_fk_catalog_drift')
    expect(sql).toContain('pg_catalog.pg_get_constraintdef(constraint_row.oid)')
    expect(sql).toContain('actual.convalidated')
    expect(sql).toContain('actual.condeferrable = expected.is_deferrable')
    expect(sql).toContain('actual.condeferred = expected.is_initially_deferred')
    expect(sql).toContain('pg_catalog.count(*) = 48')
    expect(sql).toContain('pg_catalog.count(*) = 47')
    expect(sql).toContain("'expense_edit_revision_bindings_expense_id_fkey'")
    expect(sql).toContain("'teskeid_event_expense_links_expense_fk'")
    expect(sql).toContain("'expense_event_contexts_group_fk'")
    expect(sql).toContain('expense_sql173_predecessor_trigger_catalog_drift')
    expect(sql).toContain('expense_sql173_installed_trigger_catalog_drift')
    expect(sql).toContain('trigger_row.tgenabled <> \'D\'')
    expect(sql).toContain('actual.function_signature = expected.function_signature')
    expect(sql).toContain('actual.trigger_type = expected.trigger_type')
    expect(sql).toContain('actual.tgdeferrable = expected.is_deferrable')
    expect(sql).toContain('actual.update_columns = expected.update_columns')
    expect(sql).toContain('pg_catalog.count(*) = 35')
    expect(sql).toContain('pg_catalog.count(*) = 39')
    expect(sql).toContain("('expense_activity_audience')")
    expect(sql).toContain("('expense_repayment_allocations')")
  })

  it('returns authority only for the exact creator and fails closed on every unsafe state', () => {
    const capability = functionBody('expense_get_own_delete_capability')
    expect(capability).toContain('v_expense.created_by IS DISTINCT FROM p_actor_id')
    expect(capability).toContain("RETURN pg_catalog.jsonb_build_object('visible', false)")
    expect(capability).toContain('public.expense_edit_revision_bindings')
    expect(capability).toContain('public.expense_private_drafts')
    expect(capability).toContain('FROM public.expense_repayments AS repayment')
    expect(capability).toContain('public.expense_settlement_batch_items')
    expect(capability).toContain("THEN 'unsafe_context'")
    expect(capability).not.toMatch(/expense_active_member_role|owner|admin/)
  })

  it('blocks every group-scoped draft or edit binding before deleting a one-off group', () => {
    for (const body of [
      functionBody('expense_get_own_delete_capability'),
      functionBody('expense_delete_own_unsettled_expense'),
    ]) {
      expect(body).toMatch(/binding\.expense_id = v_expense\.id\s+OR \(v_group\.kind = 'one_off'\s+AND binding\.group_id = v_group\.id\)/)
      expect(body).toMatch(/draft\.expense_id = v_expense\.id\s+OR \(v_group\.kind = 'one_off'\s+AND draft\.group_id = v_group\.id\)/)
      expect(body).toMatch(/FROM public\.expense_unconfirmed_publications AS publication\s+WHERE publication\.group_id = v_group\.id/)
    }
  })

  it('never cascade-deletes an append-only claim dispute', () => {
    for (const body of [
      functionBody('expense_get_own_delete_capability'),
      functionBody('expense_delete_own_unsettled_expense'),
    ]) {
      expect(body).toMatch(/FROM public\.expense_claim_disputes AS dispute\s+WHERE dispute\.group_id = v_group\.id\s+AND dispute\.expense_id = v_expense\.id/)
    }
  })

  it('treats any group obligation as settlement history and leaves RESTRICT as defense', () => {
    for (const body of [
      functionBody('expense_get_own_delete_capability'),
      functionBody('expense_delete_own_unsettled_expense'),
    ]) {
      expect(body).toMatch(/FROM public\.expense_obligations AS obligation\s+WHERE obligation\.group_id = v_group\.id/)
    }
    expect(functionBody('expense_delete_own_unsettled_expense')).not.toContain(
      'DELETE FROM public.expense_obligations',
    )
  })

  it('starts idempotency before lookup, then locks group before expense and rechecks all gates', () => {
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    const recoveryLock = mutation.indexOf('pg_advisory_xact_lock(173, 107)')
    const begin = mutation.indexOf('public.expense_begin_request')
    const locator = mutation.indexOf('FROM public.expenses AS expense')
    const groupLock = mutation.indexOf('FROM public.expense_groups AS group_row')
    const idLock = mutation.indexOf('pg_catalog.hashtextextended(p_expense_id::text, 173107)')
    const expenseLock = mutation.indexOf('FROM public.expenses AS expense', locator + 1)
    expect(recoveryLock).toBeGreaterThanOrEqual(0)
    expect(recoveryLock).toBeLessThan(begin)
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(begin).toBeLessThan(locator)
    expect(groupLock).toBeLessThan(expenseLock)
    expect(groupLock).toBeLessThan(idLock)
    expect(idLock).toBeLessThan(expenseLock)
    expect(mutation).toContain('v_expense.created_by IS DISTINCT FROM p_actor_id')
    expect(mutation).toContain('v_expense.group_id IS DISTINCT FROM v_group.id')
    expect(mutation).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(mutation).toContain('expense_delete_open_revision')
    expect(mutation).toContain('expense_delete_settlement_history')
    expect(mutation).toContain('expense_delete_one_off_shape_conflict')
    expect(mutation).toContain('expense_delete_one_off_owner_conflict')
    expect(mutation).toContain('expense_delete_legacy_event_context')
  })

  it('does not reveal whether an expense ID exists before creator authority is established', () => {
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    const locator = mutation.indexOf('FROM public.expenses AS expense')
    const groupLock = mutation.indexOf('FROM public.expense_groups AS group_row')
    const authorityLocator = mutation.slice(locator, groupLock)
    expect(locator).toBeGreaterThanOrEqual(0)
    expect(groupLock).toBeGreaterThan(locator)
    expect(authorityLocator).toContain('AND expense.created_by = p_actor_id')
    expect(authorityLocator).toContain("RAISE EXCEPTION 'expense_delete_not_allowed'")
    expect(mutation).not.toContain('expense_not_found')
  })

  it('purges backlinks and private snapshots before the expense, then checks postconditions', () => {
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    const recentWriterLock = mutation.indexOf('LOCK TABLE public.recent_events IN SHARE MODE')
    expect(recentWriterLock).toBeGreaterThan(
      mutation.indexOf("RAISE EXCEPTION 'expense_delete_settlement_history'"),
    )
    expect(recentWriterLock).toBeLessThan(
      mutation.indexOf('pg_catalog.array_agg(invitation.id ORDER BY invitation.id)'),
    )
    for (const table of [
      'recent_events',
      'teskeid_event_expense_links',
      'expense_member_invitations',
      'expense_share_collaborators',
      'expense_member_name_revisions',
      'expense_revisions',
      'expense_activity',
      'expenses',
    ]) {
      expect(mutation).toContain(`DELETE FROM public.${table}`)
    }
    expect(mutation.indexOf('DELETE FROM public.expense_revisions')).toBeLessThan(
      mutation.indexOf('DELETE FROM public.expenses'),
    )
    expect(mutation).toContain('expense_delete_postcondition_failed')
    expect(mutation).toMatch(/v_group\.kind = 'one_off'[\s\S]+?FROM public\.expense_unconfirmed_publications AS publication[\s\S]+?publication\.group_id = v_group\.id/)
    expect(mutation).toContain('public.expense_finish_request')
  })

  it('deletes a dedicated one-off container but never a reusable group', () => {
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    const oneOffDelete = mutation.lastIndexOf("IF v_group.kind = 'one_off' THEN")
    const sourceDelete = mutation.indexOf('DELETE FROM public.relationship_sources', oneOffDelete)
    const groupDelete = mutation.indexOf('DELETE FROM public.expense_groups', oneOffDelete)
    expect(mutation).toContain('v_group_member_ids uuid[]')
    expect(mutation).toMatch(/FROM public\.expense_group_members AS member[\s\S]+?FOR UPDATE/)
    expect(mutation.match(/DELETE FROM public\.relationship_sources/g)).toHaveLength(1)
    expect(sourceDelete).toBeGreaterThan(oneOffDelete)
    expect(sourceDelete).toBeLessThan(groupDelete)
    expect(mutation).toContain("source.source_type = 'expenses'")
    expect(mutation).toContain('source.source_id = ANY(v_group_member_ids)')
    expect(mutation).toMatch(/IF v_group\.kind = 'one_off' THEN[\s\S]+?DELETE FROM public\.relationship_circle_expense_contexts/)
    expect(mutation).toMatch(/IF v_group\.kind = 'one_off' THEN[\s\S]+?DELETE FROM public\.expense_groups/)
    expect(mutation).toContain('v_group_expense_count <> 1')
    expect(mutation).not.toMatch(/DELETE FROM public\.expense_groups[\s\S]+?ELSE/)
  })

  it('serializes exact-group Expense provenance behind database locks', () => {
    const source = functionBody('expense_insert_relationship_source')
    const group = source.indexOf('FROM public.expense_groups AS group_row')
    const member = source.indexOf('FROM public.expense_group_members AS member')
    const relationship = source.indexOf('FROM public.relationships AS relationship')
    const insert = source.indexOf('INSERT INTO public.relationship_sources')
    expect(group).toBeGreaterThanOrEqual(0)
    expect(group).toBeLessThan(member)
    expect(member).toBeLessThan(relationship)
    expect(relationship).toBeLessThan(insert)
    expect(source.match(/FOR SHARE/g)).toHaveLength(4)
    expect(source).toContain('relationship.owner_id = p_owner_user_id')
    expect(source).toContain('relationship.counterpart_user_id = v_member_user_id')
    expect(source).toContain('FROM public.expense_member_invitations AS invitation')
    expect(source).toContain('invitation.group_id = p_group_id')
    expect(source).toContain('invitation.member_id = p_member_id')
    expect(source).toContain("invitation.status = 'accepted'")
    expect(source).toContain('invitation.invited_by = p_owner_user_id')
    expect(source).toContain("VALUES (p_relationship_id, 'expenses', p_member_id)")
    expect(source).not.toMatch(/p_source_type/)
  })

  it('enforces live Expense provenance for direct INSERT and UPDATE table writers', () => {
    const guard = functionBody('expense_validate_relationship_source_live_context')
    const group = guard.indexOf('FROM public.expense_groups AS group_row')
    const member = guard.indexOf('FROM public.expense_group_members AS member', group)
    const expense = guard.indexOf('FROM public.expenses AS expense', member)
    const relationship = guard.indexOf('FROM public.relationships AS relationship', expense)
    expect(guard).toContain("IF NEW.source_type <> 'expenses' THEN")
    expect(group).toBeGreaterThanOrEqual(0)
    expect(group).toBeLessThan(member)
    expect(member).toBeLessThan(expense)
    expect(expense).toBeLessThan(relationship)
    expect(guard).toContain("group_row.status IN ('active', 'settling', 'settled')")
    expect(guard).toContain("expense.status = 'active'")
    expect(guard).toContain("member.status = 'active'")
    expect(guard).toContain('member.user_id IS NOT NULL')
    expect(guard).toContain('relationship.counterpart_user_id = v_member_user_id')
    expect(guard).toContain('FROM public.expense_member_invitations AS invitation')
    expect(guard).toContain('invitation.group_id = v_group_id')
    expect(guard).toContain('invitation.member_id = NEW.source_id')
    expect(guard).toContain("invitation.status = 'accepted'")
    expect(guard).toContain('invitation.invited_by = v_relationship_owner_id')
    expect(sql).toMatch(/CREATE TRIGGER relationship_sources_expense_live_context_guard\s+BEFORE INSERT OR UPDATE OF relationship_id, source_type, source_id\s+ON public\.relationship_sources\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.expense_validate_relationship_source_live_context\(\)/)
    expect(sql).toContain("('relationship_sources','relationship_sources_expense_live_context_guard','public.expense_validate_relationship_source_live_context()',23::smallint,false,false,false,ARRAY['relationship_id','source_id','source_type']::text[],false,false)")
  })

  it('classifies and removes only exact related private mutation receipts', () => {
    const classifier = functionBody('expense_hard_delete_receipt_shape_known')
    const classification = functionBody('expense_hard_delete_receipts_classified')
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    const requestLock = mutation.indexOf(
      'LOCK TABLE public.expense_mutation_requests IN SHARE ROW EXCLUSIVE MODE',
    )
    const groupLock = mutation.indexOf('FROM public.expense_groups AS group_row')
    const receiptDelete = mutation.indexOf('DELETE FROM public.expense_mutation_requests')
    const expenseDelete = mutation.indexOf('DELETE FROM public.expenses')
    expect(classifier).toContain("'expense_rename_guest_member'")
    expect(classifier).toContain("'display_name'")
    expect(classifier).toContain("'expense_share_edit_revision_v1'")
    expect(classifier).toContain("'allocation_state'")
    expect(classifier).toContain('pg_catalog.jsonb_object_keys(')
    expect(classifier).toContain("CASE WHEN pg_catalog.jsonb_typeof(p_result) = 'object'")
    expect(classification).toContain('p_invitation_ids uuid[]')
    expect(classification).toContain("request.result->>'invitation_id' = invitation_id::text")
    expect(classification).toContain("request.result->'invitation_ids'")
    expect(classification).not.toContain('request.result::text')
    expect(classification).not.toContain('pg_catalog.strpos(')
    expect(requestLock).toBeGreaterThanOrEqual(0)
    expect(requestLock).toBeLessThan(groupLock)
    expect(mutation).toContain('v_receipt_draft_ids uuid[]')
    expect(mutation).toContain('v_invitation_ids uuid[]')
    const invitationSnapshot = mutation.indexOf('INTO v_invitation_ids')
    const receiptClassification = mutation.indexOf('public.expense_hard_delete_receipts_classified')
    expect(invitationSnapshot).toBeGreaterThanOrEqual(0)
    expect(invitationSnapshot).toBeLessThan(receiptClassification)
    expect(mutation).toContain('p_invitation_ids => v_invitation_ids')
    expect(mutation).toContain('public.expense_hard_delete_receipt_shape_known')
    expect(mutation).toContain("RAISE EXCEPTION 'expense_delete_receipt_shape_unknown'")
    expect(mutation).toContain('receipt.actor_user_id = p_actor_id')
    expect(mutation).toContain('receipt.request_id = p_request_id')
    expect(receiptDelete).toBeGreaterThan(requestLock)
    expect(receiptDelete).toBeLessThan(expenseDelete)
    const receiptCleanup = mutation.slice(receiptDelete, expenseDelete)
    expect(receiptCleanup).toContain("receipt.result->>'expense_id'")
    expect(receiptCleanup).toContain("receipt.result->>'group_id'")
    expect(receiptCleanup).toContain("receipt.result->>'draft_id'")
    expect(receiptCleanup).toContain("receipt.result->>'invitation_id'")
    expect(receiptCleanup).not.toContain('receipt.result::text')
    expect(mutation.slice(requestLock, expenseDelete)).not.toContain('receipt.result::text')
    const postcondition = mutation.slice(mutation.indexOf('IF EXISTS (SELECT 1 FROM public.expenses'))
    expect(postcondition).toContain("receipt.result->>'invitation_id'")
    expect(postcondition).toContain("receipt.result->'invitation_ids'")
    expect(mutation).toMatch(/expense_delete_postcondition_failed[\s\S]*public\.expense_finish_request/)
  })

  it('keeps delete versions inside the JavaScript safe-integer contract', () => {
    const capability = functionBody('expense_get_own_delete_capability')
    const mutation = functionBody('expense_delete_own_unsettled_expense')
    expect(capability).toContain('v_group.financial_version >= 9007199254740991')
    expect(mutation).toContain('p_expected_financial_version >= 9007199254740991')
    expect(mutation).toContain('group_row.financial_version = p_expected_financial_version')
    expect(mutation).toContain('group_row.financial_version < 9007199254740991')
    expect(mutation).toContain("IF NOT FOUND THEN RAISE EXCEPTION 'expense_financial_version_conflict'; END IF;")
  })

  it('installs deletion code without invoking it or deleting application rows', () => {
    const mutationStart = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.expense_delete_own_unsettled_expense',
    )
    const mutationEnd = sql.indexOf('\nALTER FUNCTION ', mutationStart)
    const rollout = sql.slice(0, mutationStart) + sql.slice(mutationEnd)
    expect(rollout).not.toMatch(/\bDELETE FROM public\.(?:expenses|expense_groups|expense_group_members|expense_activity|expense_repayments)\b/i)
    expect(rollout).not.toMatch(/(?:PERFORM|SELECT)\s+public\.expense_delete_own_unsettled_expense\s*\(/i)
  })

  it('exposes only the three bounded RPCs to service_role', () => {
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain("pg_catalog.acldefault('r', relation.relowner)")
    expect(sql).not.toContain('information_schema.role_table_grants')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.expense_insert_relationship_source(uuid,uuid,uuid,uuid) TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.expense_get_own_delete_capability(uuid,uuid) TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.expense_delete_own_unsettled_expense(uuid,uuid,bigint,uuid) TO service_role')
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.expense_(?:insert_relationship_source|get_own_delete_capability|delete_own_unsettled_expense)[^\n]+ TO (?:anon|authenticated)/)
  })

  it('freezes every installed function source in all state-changing/catalog gates', () => {
    const expected = {
      expense_deleted_tombstone_immutable: '4eb040d0bdeb874c2cb22c844bab1ca4',
      expense_reject_deleted_id_reuse: '0d0da15e31183448a4382466e84c216c',
      expense_validate_finalization_expense_reference: '3124b6233c3045627463f49487a49c59',
      expense_hard_delete_authorized: '9381e225abe7cea9f582afb62c774d00',
      expense_revisions_immutable: '01e24a341ffc1f83be0c92235ba76a6b',
      expense_member_name_revision_immutable: '756c28d816b3ad4f5eb66209cb061b94',
      expense_guard_share_collaborator_mutation: '6dc57dd8a7871fed6299d345ddda3df7',
      expense_validate_relationship_source_live_context: 'de5c6904c63278360cf0f2c9796bb5c7',
      expense_insert_relationship_source: 'e2415ab3ef58b15709627f530f0f6003',
      expense_hard_delete_receipt_shape_known: 'edb8a21d01ffdbbb8e9aa2b94c7c2594',
      expense_hard_delete_receipts_classified: '9def695d70fc38b63011cb2bd12e2e67',
      expense_get_own_delete_capability: 'ffbd530e2f759d85809a34045ac15a1e',
      expense_delete_own_unsettled_expense: '41bc44fc718a17fc4fc8c0777e0a0a67',
    }
    const validationRoot = join(
      process.cwd(),
      'sql/validation/173-expense-creator-safe-hard-delete',
    )
    const gates = ['preflight.sql', 'rehearse-migration.sql', 'postflight.sql', 'recovery.sql']
      .map((name) => readFileSync(join(validationRoot, name), 'utf8'))
      .join('\n')
    for (const [name, hash] of Object.entries(expected)) {
      const installedHash = createHash('md5')
        .update(functionBody(name).match(/AS \$function\$([\s\S]*?)\$function\$;/)![1].replace(/\r\n/g, '\n'))
        .digest('hex')
      expect(installedHash, name).toBe(hash)
      expect(sql, name).toContain(hash)
      expect(gates, name).toContain(hash)
    }
  })

  it('never schema-qualifies the COALESCE SQL special form', () => {
    const validationRoot = join(
      process.cwd(),
      'sql/validation/173-expense-creator-safe-hard-delete',
    )
    const executableSql = [
      sql,
      ...['preflight.sql', 'rehearse-migration.sql', 'postflight.sql', 'recovery.sql']
        .map((name) => readFileSync(join(validationRoot, name), 'utf8')),
    ].join('\n')

    expect(executableSql).not.toMatch(/pg_catalog\.coalesce\s*\(/i)
  })

  it('does not use the PostgreSQL AUTHORIZATION keyword as an unquoted alias', () => {
    expect(sql).not.toMatch(/\bAS\s+authorization\b/i)
  })

  it('keeps the server-derived delete capability visible across saved detail views', () => {
    expect(detailSource).toContain("deleteCapability.status === 'available'")
    expect(detailSource).toContain("deleteCapability.status === 'blocked'")
    expect(detailSource).toContain("canCancel={view === 'review' && canCancel}")
  })
})
