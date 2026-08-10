import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'sql/121_expense_member_invitation_preview.sql'), 'utf8')
const preflight = readFileSync(join(process.cwd(), 'sql/validation/121-expense-member-invitation-preview/preflight.sql'), 'utf8')
const postflight = readFileSync(join(process.cwd(), 'sql/validation/121-expense-member-invitation-preview/postflight.sql'), 'utf8')

describe('SQL121 invitation preview static security contract', () => {
  it('keeps the preview recipient-scoped, pending, unexpired and service-role only', () => {
    expect(migration).toContain("i.status = 'pending'")
    expect(migration).toContain('i.expires_at > now()')
    expect(migration).toContain('i.recipient_email_canonical IS NOT DISTINCT FROM v_actor_email')
    expect(migration).toContain('invited_member.user_id IS NULL')
    expect(migration).not.toContain('e.note')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid)')
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_get_scoped_member_invitation_preview\(uuid,uuid\)\r?\n  TO service_role/,
    )
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]{0,180}TO (?:anon|authenticated)/)
  })

  it('fails closed to one exact active expense and preserves the SQL113 responder', () => {
    expect(migration).toContain('HAVING count(*) = 1')
    expect(migration).toContain("c.status = 'active'")
    expect(migration).toContain('expense_respond_scoped_member_invitation_v120')
    expect(migration).toContain("v_result ->> 'status' = 'accepted'")
    expect(migration).toContain("RAISE EXCEPTION 'expense_invitation_conflict'")
    expect(migration).toContain("jsonb_build_object('expense_id', v_expense_id)")
  })

  it('gates apply and validates grants, scoping and preserved rollback target', () => {
    expect(preflight).toContain('service_role_bypasses_rls')
    expect(preflight).toContain('target_objects_absent')
    expect(postflight).toContain('no_browser_preview_execute_ok')
    expect(postflight).toContain('legacy_not_directly_executable_ok')
    expect(postflight).toContain('exact_recipient_preview_scope_ok')
    expect(postflight).toContain('exact_response_redirect_contract_ok')
  })
})
