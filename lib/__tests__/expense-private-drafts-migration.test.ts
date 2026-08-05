import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(path.join(process.cwd(), 'sql/102_expense_private_drafts.sql'), 'utf8')
const preflight = fs.readFileSync(path.join(process.cwd(), 'sql/validation/102-expense-private-drafts/preflight.sql'), 'utf8')
const postflight = fs.readFileSync(path.join(process.cwd(), 'sql/validation/102-expense-private-drafts/postflight.sql'), 'utf8')

describe('SQL102 private drafts and known-recipient safety', () => {
  it('keeps drafts private, bounded and outside the financial/event ledger', () => {
    expect(sql).toContain('ALTER TABLE public.expense_private_drafts FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('octet_length(payload::text) <= 65536')
    expect(sql).toContain('REVOKE ALL ON TABLE public.expense_private_drafts')
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?expense_private_drafts/i)
    const saveDraftBody = sql.match(/CREATE OR REPLACE FUNCTION public\.expense_save_private_draft[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(saveDraftBody).not.toMatch(/INSERT INTO public\.expense_(?:activity|payments|shares|obligations|repayments)/i)
  })

  it('uses CAS for draft updates and service-role-only RPC access', () => {
    expect(sql).toContain('AND drafts.version = p_expected_version')
    expect(sql).toContain("RAISE EXCEPTION 'expense_draft_conflict'")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.expense_save_private_draft')
    expect(sql).toContain('TO service_role')
    expect(postflight).toContain('browser_function_execute_ok')
  })

  it('wraps SQL96 creation and promotes only an actor-owned registered relationship atomically', () => {
    expect(sql).toContain('v_result := public.expense_create_expense(')
    expect(sql).toContain('relationship.owner_id = p_actor_id')
    expect(sql).toContain('relationship.counterpart_user_id IS NOT NULL')
    expect(sql).toContain("status = 'invited'")
    expect(sql).toContain("'expense_group_invitation_received'")
    expect(sql).toContain('expense_create_expense_with_known_members')
    expect(preflight).toContain("('relationships')")
    expect(postflight).toContain('known_member_wrapper_browser_execute_ok')
  })
})
