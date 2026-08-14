import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/127_loan_private_counterparty_name.sql'),
  'utf8',
)
const aclHardeningSql = readFileSync(
  join(process.cwd(), 'sql/128_loan_private_counterparty_trigger_acl.sql'),
  'utf8',
)

describe('sql/127 private loan counterparty name', () => {
  it('adds a bounded nullable creator-private field without a backfill', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS creator_counterparty_name text')
    expect(sql).toContain('char_length(creator_counterparty_name) BETWEEN 1 AND 120')
    expect(sql).not.toMatch(/ADD COLUMN[^;]*DEFAULT/i)
  })

  it('keeps the old email create signature and adds separate service-role-only name RPCs', () => {
    expect(sql).toContain("to_regprocedure('public.create_loan(uuid,text,text,date,date,text,text,uuid)')")
    expect(sql).not.toContain('DROP FUNCTION public.create_loan')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_loan_with_counterparty_name(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_loan_counterparty_name(')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_loan_counterparty_name\([\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_loan_counterparty_name\([\s\S]*TO service_role/)
  })

  it('requires creator ownership, a vacant party slot and no active invitation', () => {
    expect(sql).toContain('v_loan.created_by IS DISTINCT FROM p_actor_id')
    expect(sql).toContain("invitation.status IN ('pending', 'accepted')")
    expect(sql).toContain("RAISE EXCEPTION 'already_has_party'")
    expect(sql).toContain("RAISE EXCEPTION 'already_has_invitation'")
  })

  it('clears the private placeholder when a real invitation is inserted', () => {
    expect(sql).toContain('CREATE TRIGGER loan_clear_private_counterparty_name_on_invitation')
    expect(sql).toContain('AFTER INSERT ON public.loan_invitations')
    expect(sql).toMatch(/UPDATE public\.loan_items[\s\S]*SET creator_counterparty_name = NULL[\s\S]*WHERE id = NEW\.loan_id/)
  })

  it('projects the private label only through the creator branch and never the pending-recipient branch', () => {
    const projection = sql.slice(sql.indexOf('CREATE FUNCTION public.get_my_loans'))
    expect(projection).toContain('CASE WHEN item.created_by = p_actor_id THEN item.creator_counterparty_name END')
    const pendingBranch = projection.slice(projection.indexOf('UNION ALL'))
    expect(pendingBranch).not.toContain('creator_counterparty_name')
    const returnShape = projection.slice(
      projection.indexOf('RETURNS TABLE ('),
      projection.indexOf('LANGUAGE plpgsql'),
    )
    expect(returnShape).not.toContain('creator_counterparty_name')
  })
})

describe('sql/128 private counterparty trigger ACL hardening', () => {
  it('removes every app-role execute grant from the trigger-only function', () => {
    expect(aclHardeningSql).toContain('BEGIN;')
    expect(aclHardeningSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.loan_clear_private_counterparty_name_on_invitation\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(aclHardeningSql).not.toMatch(
      /^GRANT EXECUTE ON FUNCTION public\.loan_clear_private_counterparty_name_on_invitation/m,
    )
    expect(aclHardeningSql).toContain('COMMIT;')
  })
})
