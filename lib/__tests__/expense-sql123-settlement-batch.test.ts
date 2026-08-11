import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/123_expense_settlement_batch.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/123-expense-settlement-batch/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/123-expense-settlement-batch/postflight.sql'),
  'utf8',
)
const recovery = readFileSync(
  join(process.cwd(), 'sql/validation/123-expense-settlement-batch/recovery.md'),
  'utf8',
)

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )
  expect(match, `${name} must exist in SQL123`).not.toBeNull()
  return match?.[0] ?? ''
}

describe('SQL123 atomic bilateral settlement batch', () => {
  it('is transactional and ships read-only validation plus forward recovery', () => {
    expect(migration).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;[\s\S]*$/)
    for (const probe of [preflight, postflight]) {
      expect(probe).toMatch(/BEGIN;\s*SET TRANSACTION READ ONLY;/)
      expect(probe.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(probe).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
      )
    }
    expect(recovery).toMatch(/forward-only corrective\s+migration/)
    expect(recovery).toContain('do not drop')
  })

  it('fails closed on partial SQL123 state and an incompatible SQL107 snapshot contract', () => {
    expect(migration).toContain('expense_123_partial_state_detected')
    expect(migration).toContain('v_metadata_column_count')
    expect(migration).toContain('v_sql123_function_count')
    expect(migration).toContain('v_sql123_trigger_count')
    expect(migration).toContain('column_row.udt_name = required.udt_name')
    expect(migration).toContain('column_row.is_nullable = required.is_nullable')
    for (const constraint of [
      'expense_payment_profiles_v2_owner_user_id_fkey',
      'expense_payment_profiles_v2_envelope_check',
      'expense_payment_profiles_v2_fingerprint_check',
      'expense_payment_profiles_v2_version_check',
      'expense_repayments_encrypted_snapshot_check',
    ]) {
      expect(migration).toContain(constraint)
    }
    expect(migration).toContain("constraint_row.confdeltype = 'c'")
    expect(migration).toContain("trigger_row.tgname = 'expense_repayments_encrypted_snapshot'")
    expect(migration).toContain('trigger_row.tgtype = 7')
    expect(migration).toContain("trigger_row.tgenabled = 'O'")
    expect(preflight).toContain('sql107_columns_ok')
    expect(preflight).toContain('sql107_constraints_ok')
    expect(preflight).toContain('sql107_owner_fk_ok')
    expect(preflight).toContain('encrypted_snapshot_trigger_ok')
    expect(preflight).toContain('existing_sql123_metadata_columns')
  })

  it('derives the exact registered counterparty from an outgoing anchor', () => {
    const proposal = functionBody('expense_propose_settlement_batch')
    expect(proposal).toContain('p_anchor_group_id uuid')
    expect(proposal).toContain('p_anchor_from_member_id uuid')
    expect(proposal).toContain('actor_member.user_id = p_actor_id')
    expect(proposal).toContain('counterparty_member.id = p_anchor_to_member_id')
    expect(proposal).toContain('v_counterparty_user_id')
    expect(proposal).not.toContain('p_counterparty_user_id')
    expect(proposal).toContain('expected.group_id IS NULL')
    expect(proposal).toContain('current_context.group_id IS NULL')
  })

  it('locks and verifies the exact global payment profile before cash snapshotting', () => {
    const proposal = functionBody('expense_propose_settlement_batch')
    const resolver = functionBody('expense_resolve_payment_profile_v2')
    expect(proposal).toContain('p_expected_profile_id uuid')
    expect(proposal).toContain('p_expected_profile_version bigint')
    expect(proposal).toContain('p_expected_profile_state_token text')
    expect(proposal).toContain('pg_catalog.hashtextextended(v_counterparty_user_id::text, 9602)')
    expect(proposal).toContain('v_current_profile.id IS DISTINCT FROM p_expected_profile_id')
    expect(proposal).toContain(
      'v_current_profile.version IS DISTINCT FROM p_expected_profile_version',
    )
    expect(proposal).toContain(
      'IS DISTINCT FROM p_expected_profile_state_token',
    )
    expect(migration).toContain('expense_payment_profiles_v2_owner_lock')
    expect(migration).toContain("NEW.settlement_method = 'debt_offset'")
    expect(resolver).toContain("'state_token'")
    expect(resolver).toContain('v_profile.payload_fingerprint')
    expect(resolver).toContain('public.expense_simplified_settlement(')
  })

  it('allocates two offset directions first and cash by remaining capacity', () => {
    const proposal = functionBody('expense_propose_settlement_batch')
    expect(migration).not.toMatch(/pg_catalog\.(?:least|greatest)\s*\(/i)
    expect(migration.match(/\bLEAST\s*\(/g)).toHaveLength(5)
    expect(proposal.match(/'debt_offset', v_allocation/g)).toHaveLength(2)
    expect(proposal).toContain("'external_payment', v_allocation")
    const firstOffset = proposal.indexOf("'debt_offset', v_allocation")
    const cash = proposal.indexOf("'external_payment', v_allocation")
    expect(firstOffset).toBeGreaterThan(-1)
    expect(cash).toBeGreaterThan(firstOffset)
    expect(proposal).toContain('ORDER BY current_context.remaining_minor DESC')
    expect(proposal).toContain('ORDER BY group_row.id')
  })

  it('keeps confirmation review-clean and validates every durable ledger link', () => {
    const transition = functionBody('expense_transition_settlement_batch')
    expect(transition).toContain('public.expense_reported_repayments_need_review')
    expect(transition).toContain('repayment.settlement_method IS DISTINCT FROM item.method')
    expect(transition).toContain('allocation.amount_minor IS DISTINCT FROM item.amount_minor')
    expect(transition).toContain('v_external_payment_total <> v_batch.cash_minor')
    expect(transition).toContain('v_outgoing_offset_total <> v_batch.offset_minor')
    expect(transition).toContain('v_incoming_offset_total <> v_batch.offset_minor')
    expect(migration).toContain('expense_repayment_batch_managed')
    expect(migration).toContain('settlement_method IS NOT NULL')
    expect(migration).toContain('settlement_sequence IS NOT NULL')
  })

  it('cancels account-unlink batches via items with groups locked before batches', () => {
    const unlink = functionBody('expense_cancel_batches_before_user_unlink')
    expect(unlink).toContain('item.from_member_id = OLD.id')
    expect(unlink).toContain('item.to_member_id = OLD.id')
    expect(unlink).not.toContain('batch_row.proposed_by_user_id = OLD.user_id')
    expect(unlink.indexOf('PERFORM group_row.id'))
      .toBeLessThan(unlink.indexOf('PERFORM batch_row.id'))
    expect(unlink).toContain("SET status = 'cancelled'")
    expect(unlink).toContain('durable cancellation audit')
  })

  it('is default-deny and keeps batch activity free of financial details', () => {
    expect(migration).toContain(
      'ALTER TABLE public.expense_settlement_batches FORCE ROW LEVEL SECURITY',
    )
    expect(migration).toContain(
      'ALTER TABLE public.expense_settlement_batch_items FORCE ROW LEVEL SECURITY',
    )
    expect(migration).toMatch(
      /REVOKE ALL ON public\.expense_settlement_batches\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_propose_settlement_batch\([\s\S]*?TO service_role;/,
    )
    const activity = functionBody('expense_record_settlement_batch_activity')
    expect(activity).not.toContain('amount_minor')
    expect(activity).not.toContain('note')
    expect(activity).not.toContain('email')
    expect(postflight).toContain('no_browser_table_grants_ok')
    expect(postflight).toContain('exact_service_role_rpc_execute_ok')
    expect(postflight).toContain('expense_settlement_batches_immutable_guard')
    expect(postflight).toContain('expense_settlement_batch_items_immutable_guard')
    expect(postflight).toContain('expense_repayments_encrypted_snapshot')
  })
})
