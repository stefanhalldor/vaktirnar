import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/113_expense_shared_share_collaborators.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/113-expense-shared-share-collaborators/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/113-expense-shared-share-collaborators/postflight.sql'),
  'utf8',
)

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )
  expect(match, `${name} must exist in SQL113`).not.toBeNull()
  return match?.[0] ?? ''
}

describe('SQL113 canonical-share collaborators', () => {
  it('is transactional and ships read-only validation probes', () => {
    expect(migration).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    for (const probe of [preflight, postflight]) {
      expect(probe).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
      )
      expect(probe).toContain('transactions_older_than_five_minutes')
    }
  })

  it('stores identity mappings without a second financial share', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.expense_share_collaborators')
    expect(migration).toContain('expense_share_collaborators_expense_share_fk')
    expect(migration).toContain('expense_share_collaborators_active_actor_unique')
    expect(migration).toContain('expense_share_collaborators_immutable_guard')

    const addCollaborator = functionBody('expense_add_share_collaborator')
    expect(addCollaborator).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.expense_(?:shares|payments|obligations|repayments)\b/i,
    )
    expect(addCollaborator).not.toContain('financial_version =')
    expect(addCollaborator).toContain('expense_share_actor_conflict')
  })

  it('keeps the mapping default-deny and exposes only bounded service RPCs', () => {
    expect(migration).toContain('ALTER TABLE public.expense_share_collaborators FORCE ROW LEVEL SECURITY')
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]+expense_share_collaborators/i)
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.expense_share_collaborators\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toContain('GRANT SELECT ON TABLE public.expense_share_collaborators TO service_role')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
  })

  it('scopes consent and exact action authorization to the canonical share', () => {
    expect(migration).toContain('shared_expense_id')
    expect(migration).toContain('shared_share_member_id')
    expect(migration).toContain('expense_member_invitations_shared_scope_check')
    expect(functionBody('expense_respond_scoped_member_invitation')).toContain(
      "v_invitation.shared_expense_id IS NOT NULL",
    )

    expect(functionBody('expense_report_repayment')).toContain(
      'public.expense_actor_can_act_for_share_member(',
    )
    expect(functionBody('expense_record_received_repayment')).toContain(
      'public.expense_actor_can_act_for_share_member(',
    )
    expect(functionBody('expense_transition_repayment')).toContain(
      'public.expense_actor_can_act_for_share_member(',
    )
  })

  it('records bounded non-financial activity and verifies financial totals postflight', () => {
    expect(migration).toContain("'expense_share_collaborator_added'")
    expect(migration).toContain("'expense_share_collaborator_linked'")
    expect(migration).toContain('ARRAY[]::uuid[], false')
    expect(postflight).toContain('no_financial_columns_ok')
    expect(postflight).toContain('expense_share_amount_total')
    expect(postflight).toContain('expense_payment_amount_total')
    expect(postflight).toContain('expense_obligation_amount_total')
    expect(postflight).toContain('expense_repayment_amount_total')
  })
})
