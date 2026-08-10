import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'sql/119_expense_shared_debtor_payment_profile.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/119-expense-shared-debtor-payment-profile/preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/119-expense-shared-debtor-payment-profile/postflight.sql'),
  'utf8',
)

function functionBody(name: string) {
  const match = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )
  expect(match, `${name} must exist in SQL119`).not.toBeNull()
  return match?.[0] ?? ''
}

describe('SQL119 canonical shared-debtor payment profile', () => {
  it('is transactional, idempotent and ships read-only validation probes', () => {
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

  it('reuses the exact SQL113 actor authorization for direct and canonical debtors', () => {
    const resolver = functionBody('expense_resolve_payment_profile_v2')
    expect(resolver).toContain('public.expense_actor_can_act_for_share_member(')
    expect(resolver).not.toContain('v_from_user_id IS DISTINCT FROM p_actor_id')
    expect(resolver).toContain("debtor.status = 'active'")
    expect(resolver).toContain("creditor.status = 'active'")
    expect(resolver).toContain('creditor.user_id IS NOT NULL')
    expect(migration).toContain('sql119_incompatible_share_authorization')
    expect(migration).toContain('sql119_incompatible_share_authorizer_security')
  })

  it('fails closed unless the exact creditor debt is still positive', () => {
    const resolver = functionBody('expense_resolve_payment_profile_v2')
    expect(resolver).toContain('p_from_member_id = p_to_member_id')
    expect(resolver).toContain("p_currency !~ '^[A-Z]{3}$'")
    expect(resolver).toContain('public.expense_obligations')
    expect(resolver).toContain('public.expense_repayment_allocations')
    expect(resolver).toContain('public.expense_repayments')
    expect(resolver).toContain("repayment.status IN ('reported', 'confirmed')")
    expect(resolver).toContain('IF v_outstanding <= 0 THEN')
  })

  it('returns only the exact creditor encrypted profile and never mutates or decrypts data', () => {
    const resolver = functionBody('expense_resolve_payment_profile_v2')
    expect(resolver).toContain('profile.owner_user_id = v_to_user_id')
    expect(resolver).toContain("'profile_id', v_profile.id")
    expect(resolver).toContain("'owner_user_id', v_profile.owner_user_id")
    expect(resolver).toContain("'version', v_profile.version")
    expect(resolver).toContain("'envelope', v_profile.encrypted_details")
    expect(resolver).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i)
    expect(resolver).not.toMatch(/decrypt\s*\(/i)
    expect(resolver).not.toContain('expense_payment_preferences')
  })

  it('keeps the resolver service-only with fixed empty search path', () => {
    expect(migration).toMatch(
      /SECURITY DEFINER\s+SET search_path = ''/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.expense_resolve_payment_profile_v2\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_resolve_payment_profile_v2\([\s\S]*?TO service_role;/,
    )
    expect(postflight).toContain('exact_shared_debtor_authorization_ok')
    expect(postflight).toContain('exact_positive_debt_context_ok')
    expect(postflight).toContain('read_only_encrypted_payload_ok')
    expect(postflight).toContain('exact_service_role_resolver_execute_ok')
    expect(postflight).toContain('resolver_owner_bypasses_rls_ok')
    expect(preflight).toContain('current_resolver_contract_ok')
    expect(preflight).toContain('resolver_profile_owner_alignment_ok')
  })
})
