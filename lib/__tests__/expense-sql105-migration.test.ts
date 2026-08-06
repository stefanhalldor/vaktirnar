import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql96 = readFileSync(join(process.cwd(), 'sql/96_expenses_core.sql'), 'utf8')
const sql97 = readFileSync(
  join(process.cwd(), 'sql/97_expense_edit_and_member_linking.sql'),
  'utf8',
)
const sql103 = readFileSync(
  join(process.cwd(), 'sql/103_expense_revisions_and_recalculation.sql'),
  'utf8',
)
const sql105 = readFileSync(
  join(process.cwd(), 'sql/105_expense_edit_member_reference_fix.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/105-expense-participant-consent-fix/preflight.sql',
  ),
  'utf8',
)
const postflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/105-expense-participant-consent-fix/postflight.sql',
  ),
  'utf8',
)

const canonicalFunctions = [
  [sql96, 'expense_create_expense'],
  [sql96, 'expense_respond_group_invitation'],
  [sql96, 'expense_report_repayment'],
  [sql96, 'expense_transition_repayment'],
  [sql103, 'expense_update_expense'],
  [sql97, 'expense_cancel_expense'],
  [sql97, 'expense_set_group_status'],
  [sql97, 'expense_link_guest_member_email'],
  [sql97, 'expense_get_my_member_invitations'],
  [sql97, 'expense_reserve_member_invitation_send'],
  [sql97, 'expense_sync_my_member_invitation_events'],
  [sql97, 'expense_respond_member_invitation'],
  [sql97, 'expense_cancel_member_invitation'],
] as const

function functionDefinition(source: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = source.indexOf(marker)
  expect(start, `${name} start`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n$$;', start)
  expect(end, `${name} end`).toBeGreaterThan(start)
  return source.slice(start, end + '\n$$;'.length)
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizedDefinition(source: string, name: string): string {
  return functionDefinition(source, name).replace(/\s+/g, ' ')
}

function executableSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''")
    .trim()
}

describe('SQL105 expense participant consent repair', () => {
  it('copies the latest canonical definitions into one ordered repair migration', () => {
    expect(sql105.match(/^CREATE OR REPLACE FUNCTION public\./gm)).toHaveLength(13)
    for (const [canonical, name] of canonicalFunctions) {
      expect(normalizedDefinition(sql105, name)).toBe(
        normalizedDefinition(canonical, name),
      )
      const definition = functionDefinition(sql105, name)
      expect(definition).toContain('SECURITY DEFINER')
      expect(definition).toContain("SET search_path = ''")
    }
  })

  it('fixes all member-reference expressions and keeps invited parties financial', () => {
    const update = functionDefinition(sql105, 'expense_update_expense')
    expect(update.match(/'existing:' \|\| \(payment\.value->>'member_id'\)/g)).toHaveLength(2)
    expect(update.match(/'existing:' \|\| \(share\.value->>'member_id'\)/g)).toHaveLength(2)
    expect(update).not.toMatch(/'existing:' \|\| payment\.value->>'member_id'/)
    expect(update).not.toMatch(/'existing:' \|\| share\.value->>'member_id'/)
    expect(update.match(/member\.status IN \('active', 'invited'\)/g)).toHaveLength(3)
    expect(update).toContain("member.status NOT IN ('active', 'invited')")
    expect(update).toContain('OR v_role IS NULL')

    const create = functionDefinition(sql105, 'expense_create_expense')
    expect(create.match(/member\.status IN \('active', 'invited'\)/g)).toHaveLength(2)
    const cancel = functionDefinition(sql105, 'expense_cancel_expense')
    expect(cancel).toContain("member.status NOT IN ('active', 'invited')")
    expect(cancel).toContain('OR v_role IS NULL')
  })

  it('allows only narrow manager repayment proxying without leaking payment preferences', () => {
    const report = functionDefinition(sql105, 'expense_report_repayment')
    expect(report.match(/member\.status IN \('active', 'invited'\)/g)).toHaveLength(2)
    expect(report).toContain("(v_from.status = 'active' AND v_from.user_id = p_actor_id)")
    expect(report).toContain("(v_from.user_id IS NULL OR v_from.status = 'invited')")
    expect(report).toContain("coalesce(v_role, '') IN ('owner', 'admin')")
    expect(report).toContain('IF v_to.user_id IS NOT NULL AND v_from.user_id = p_actor_id THEN')

    const transition = functionDefinition(sql105, 'expense_transition_repayment')
    expect(transition).toContain("v_from.status NOT IN ('active', 'invited')")
    expect(transition).toContain("v_to.status NOT IN ('active', 'invited')")
    expect(transition).toContain("(v_to.status = 'active' AND v_to.user_id = p_actor_id)")
    expect(transition).toContain("(v_to.user_id IS NULL OR v_to.status = 'invited')")
  })

  it('preserves identity invitations and the durable member through settlement', () => {
    const setStatus = functionDefinition(sql105, 'expense_set_group_status')
    expect(setStatus).toContain('expense_group_not_settled')
    expect(setStatus).not.toContain('expense_member_invitations')

    const allowlist = "('active', 'settling', 'settled')"
    for (const name of [
      'expense_link_guest_member_email',
      'expense_get_my_member_invitations',
      'expense_reserve_member_invitation_send',
      'expense_sync_my_member_invitation_events',
      'expense_respond_member_invitation',
    ]) {
      expect(functionDefinition(sql105, name)).toContain(allowlist)
    }
    const sync = functionDefinition(sql105, 'expense_sync_my_member_invitation_events')
    expect(sync.match(/group_row\.status IN \('active', 'settling', 'settled'\)/g)).toHaveLength(2)

    const respond = functionDefinition(sql105, 'expense_respond_member_invitation')
    expect(respond).toContain('WHERE member.id = v_member_id AND member.group_id = v_group_id')
    expect(respond).not.toMatch(/(?:INSERT INTO|DELETE FROM) public\.expense_group_members/)

    const directRespond = functionDefinition(sql105, 'expense_respond_group_invitation')
    expect(directRespond).toContain("v_group.kind NOT IN ('group', 'one_off')")
    expect(directRespond).toContain("v_group.status NOT IN ('active', 'settling', 'settled')")
    expect(directRespond).toContain('public.expense_member_can_exit')
    expect(directRespond).toContain('SET user_id = NULL')
  })

  it('is transactional, idempotent and restores the service-only boundary', () => {
    expect(sql105.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(sql105.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(sql105).toContain('expense_participant_repair_prerequisites_missing')
    expect(sql105).toContain('expense_participant_repair_unexpected_lineage')
    expect(sql105.match(/^REVOKE ALL ON FUNCTION public\./gm)).toHaveLength(13)
    expect(sql105.match(/^GRANT EXECUTE ON FUNCTION public\./gm)).toHaveLength(13)
    expect(sql105).toContain('Stebbi alone runs this migration')
  })

  it.each([
    ['preflight', preflight],
    ['postflight', postflight],
  ])('%s is one read-only query', (_name, source) => {
    const executable = executableSql(source)
    expect(source.trimEnd().endsWith(';')).toBe(true)
    expect((executable.match(/;/g) ?? [])).toHaveLength(1)
    expect(executable).not.toMatch(
      /\b(?:BEGIN|COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i,
    )
  })

  it('preflight and postflight cover the repair and permission boundaries', () => {
    for (const label of [
      'prerequisites_ok',
      'target_configuration_ok',
      'member_reference_repair_needed',
      'invited_financial_repair_needed',
      'identity_lifecycle_repair_needed',
      'unexpected_operator_form',
      'invited_financial_member_rows',
    ]) expect(preflight).toContain(label)

    for (const label of [
      'member_reference_precedence_ok',
      'member_reference_probe_ok',
      'invited_financial_participation_ok',
      'manager_repayment_proxy_ok',
      'active_actor_boundary_ok',
      'pending_identity_survives_settlement_ok',
      'post_settlement_identity_link_ok',
      'direct_invitation_lifecycle_ok',
    ]) expect(postflight).toContain(label)

    for (const source of [preflight, postflight]) {
      expect(source).toContain('browser_execute_grants')
      expect(source).toContain('missing_service_role_execute')
      expect(source).toContain('unexpected_target_overloads')
      expect(source).toContain('transactions_older_than_five_minutes')
    }
  })
})
