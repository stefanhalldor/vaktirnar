import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/122_expense_current_debtor_payment_profile.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/122-expense-current-debtor-payment-profile/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/122-expense-current-debtor-payment-profile/postflight.sql'),
  'utf8',
)
const recovery = readFileSync(
  join(process.cwd(), 'sql/validation/122-expense-current-debtor-payment-profile/recovery.sql'),
  'utf8',
)

function functionBody(source: string) {
  const match = source.match(
    /CREATE OR REPLACE FUNCTION public\.expense_resolve_payment_profile_v2\([\s\S]*?\n\$\$;/,
  )
  expect(match).not.toBeNull()
  return match?.[0] ?? ''
}

describe('SQL122 current-debtor payment profile static security contract', () => {
  it('is a transactional function-only replacement with read-only validation probes', () => {
    expect(migration).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\.expense_resolve_payment_profile_v2/g))
      .toHaveLength(1)
    expect(migration).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i)

    for (const probe of [preflight, postflight]) {
      expect(probe).toMatch(/BEGIN;\s*SET TRANSACTION READ ONLY;/)
      expect(probe.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(probe).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
      )
      expect(probe).toContain('transactions_older_than_five_minutes')
    }
  })

  it('uses the exact current settlement and direct-or-shared debtor authorization', () => {
    const resolver = functionBody(migration)
    expect(resolver).toContain('public.expense_actor_can_act_for_share_member(')
    expect(resolver).toContain('public.expense_simplified_settlement(')
    expect(resolver).toContain('p_group_id, p_currency, true')
    expect(resolver).toContain('settlement.from_member_id = p_from_member_id')
    expect(resolver).toContain('settlement.to_member_id = p_to_member_id')
    expect(resolver).toContain('settlement.amount_minor > 0')
    expect(resolver).not.toContain('public.expense_obligations')
    expect(resolver).not.toContain('expense_payment_preferences')
  })

  it('returns only the exact creditor envelope and remains service-role only', () => {
    const resolver = functionBody(migration)
    expect(resolver).toContain('profile.owner_user_id = v_to_user_id')
    expect(resolver).toContain("'profile_id', v_profile.id")
    expect(resolver).toContain("'owner_user_id', v_profile.owner_user_id")
    expect(resolver).toContain("'envelope', v_profile.encrypted_details")
    expect(resolver).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i)
    expect(resolver).not.toMatch(/decrypt\s*\(/i)
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.expense_resolve_payment_profile_v2\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_resolve_payment_profile_v2\([\s\S]*?TO service_role;/,
    )
  })

  it('checks production prerequisites and ships an explicit SQL119 recovery', () => {
    expect(preflight).toContain('service_role_bypasses_rls')
    expect(preflight).toContain('simplified_settlement_security_ok')
    expect(preflight).toContain('service_role_profile_select_only_ok')
    expect(preflight).toContain('current_resolver_contract_ok')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('exact_current_settlement_context_ok')
    expect(postflight).toContain('exact_shared_debtor_authorization_ok')
    expect(postflight).toContain('no_browser_resolver_execute_ok')
    expect(postflight).toContain('exact_service_role_resolver_execute_ok')
    expect(postflight).toContain('service_role_profile_select_only_ok')
    expect(functionBody(recovery)).toContain('public.expense_obligations')
  })
})
