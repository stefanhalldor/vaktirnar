import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/112_expense_member_invitation_email_v3.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/112-expense-member-invitation-email-v3/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/112-expense-member-invitation-email-v3/postflight.sql'),
  'utf8',
)

describe('SQL112 immutable UL invitation email v3 cutover', () => {
  it('adds v3 without rewriting existing invitation rows', () => {
    expect(migration).toContain("CHECK (email_template_version IN ('v1', 'v2', 'v3'))")
    expect(migration).toContain("left(v_inviter_name, 120), 'v3'")
    expect(migration).not.toMatch(/UPDATE\s+public\.expense_member_invitations/i)
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.expense_member_invitations/i)
  })

  it('snapshots the group title and emoji for byte-stable retries', () => {
    expect(migration).toContain("concat_ws(' '")
    expect(migration).toContain('v_group.name')
    expect(migration).toContain('v_group.emoji')
    expect(migration).toContain('context_title_snapshot')
  })

  it('keeps the helper private and security-definer scoped', () => {
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.expense_create_unified_participant_invitation')
  })

  it('ships read-only preflight and postflight checks', () => {
    for (const validation of [preflight, postflight]) {
      expect(validation).not.toMatch(/\b(ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/i)
      expect(validation).toContain('transactions_older_than_five_minutes')
    }
    expect(preflight).toContain('reserved_attempt_rows')
    expect(postflight).toContain('template_constraint_v3_ok')
    expect(postflight).not.toContain("has_function_privilege('PUBLIC'")
  })
})
