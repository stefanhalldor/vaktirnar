import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const sql = readFileSync('sql/163_expense_existing_member_relationship_identity.sql', 'utf8')
const preflight = readFileSync('sql/validation/163-expense-existing-member-relationship-identity/preflight.sql', 'utf8')
const postflight = readFileSync('sql/validation/163-expense-existing-member-relationship-identity/postflight.sql', 'utf8')
const recovery = readFileSync('sql/validation/163-expense-existing-member-relationship-identity/recovery.sql', 'utf8')
describe('SQL163 existing member Relationship identity', () => {
  it('keeps discovery and mutation service-role-only and uses the canonical helper', () => {
    expect(sql).toContain('expense_get_relationship_identity_management_v1')
    expect(sql).toContain('expense_bind_member_relationship_identity_v1')
    expect(sql).toContain('expense_apply_identity_binding')
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = ''/g)
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).not.toMatch(/UPDATE\s+public\.expense_group_members/i)
    expect(sql).toContain('expense_claim_disputes')
    expect(sql).toMatch(/dispute\.status\s*=\s*'disputed'/)
  })
  it('has exact lost-response, postflight and guarded revoke evidence', () => {
    expect(preflight).toContain('clean_initial_state')
    expect(preflight).toContain('lost_response_safe')
    expect(preflight).toContain('partial_or_inconsistent_stop')
    expect(preflight).toContain('819b2e024aac1e00c7e14145b0d6b373')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('source_hash_ok')
    expect(recovery).toContain('sql163_app_rollback_confirmed')
    expect(recovery.indexOf('target_mismatch')).toBeLessThan(recovery.indexOf('REVOKE EXECUTE'))
    expect(recovery).not.toMatch(/^\s*DROP\s+/mi)
  })

  it('uses PostgreSQL catalog spelling for an empty function search_path', () => {
    for (const validator of [preflight, postflight, recovery]) {
      expect(validator).toContain("ARRAY['search_path=\"\"']::text[]")
      expect(validator).not.toContain("ARRAY['search_path=']::text[]")
    }
  })
})
