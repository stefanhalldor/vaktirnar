/**
 * Static checks for sql/46_recent_events.sql and sql/47_fix_href_constraint.sql
 *
 * Verifies security properties of the migrations without running SQL.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'sql/46_recent_events.sql'),
  'utf8'
)

const sql47 = readFileSync(
  join(process.cwd(), 'sql/47_fix_href_constraint.sql'),
  'utf8'
)

describe('sql/46_recent_events.sql — static checks', () => {
  it('creates the recent_events table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.recent_events/)
  })

  it('enables RLS on the table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.recent_events ENABLE ROW LEVEL SECURITY/)
  })

  it('does not grant access to anon', () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM.*anon|REVOKE ALL.*anon/)
    expect(sql).not.toMatch(/GRANT.*TO anon/)
  })

  it('does not grant access to authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM.*authenticated|REVOKE ALL.*authenticated/)
    expect(sql).not.toMatch(/GRANT.*TO authenticated/)
  })

  it('grants narrow access to service_role only', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.recent_events TO service_role/)
  })

  it('enforces payload as JSON object', () => {
    expect(sql).toMatch(/jsonb_typeof\(payload\)\s*=\s*'object'/)
  })

  it('enforces href must be a local path (weakly — tightened in migration 47)', () => {
    expect(sql).toMatch(/href LIKE '\/%'/)
  })

  it('has UNIQUE constraint on (user_id, event_key)', () => {
    expect(sql).toMatch(/UNIQUE\s*\(user_id,\s*event_key\)/)
  })

  it('has an unread partial index', () => {
    expect(sql).toMatch(/WHERE ack_at IS NULL/)
  })

  it('wraps in a transaction', () => {
    expect(sql).toMatch(/BEGIN/)
    expect(sql).toMatch(/COMMIT/)
  })
})

describe('sql/47_fix_href_constraint.sql — static checks', () => {
  it('drops and re-adds the href constraint', () => {
    expect(sql47).toMatch(/DROP CONSTRAINT IF EXISTS recent_events_href_local/)
    expect(sql47).toMatch(/ADD CONSTRAINT recent_events_href_local/)
  })

  it('rejects protocol-relative URLs', () => {
    expect(sql47).toMatch(/href NOT LIKE '\/\/%'/)
  })

  it('still requires local path prefix', () => {
    expect(sql47).toMatch(/href LIKE '\/%'/)
  })

  it('wraps in a transaction', () => {
    expect(sql47).toMatch(/BEGIN/)
    expect(sql47).toMatch(/COMMIT/)
  })
})

const sql50 = readFileSync(
  join(process.cwd(), 'sql/50_loan_soft_acknowledgement.sql'),
  'utf8'
)

describe('sql/50_loan_soft_acknowledgement.sql — static checks', () => {
  it('drops get_my_loans before recreating (return-shape migration safety)', () => {
    expect(sql50).toMatch(/DROP FUNCTION IF EXISTS public\.get_my_loans\(uuid\)/)
  })

  it('recreates get_my_loans with CREATE FUNCTION (not CREATE OR REPLACE) after drop', () => {
    // After DROP IF EXISTS, plain CREATE FUNCTION is used — no return-type conflict
    const dropPos = sql50.indexOf('DROP FUNCTION IF EXISTS public.get_my_loans')
    const createPos = sql50.indexOf('CREATE FUNCTION public.get_my_loans', dropPos)
    expect(createPos).toBeGreaterThan(dropPos)
  })

  it('returns requires_acknowledgement boolean column', () => {
    expect(sql50).toMatch(/requires_acknowledgement\s+boolean/)
  })

  it('has a UNION ALL branch for pending invitation rows', () => {
    expect(sql50).toMatch(/UNION ALL/)
  })

  it('pending branch matches actor email to recipient_email_normalized', () => {
    expect(sql50).toMatch(/recipient_email_normalized\s*=\s*v_actor_norm/)
  })

  it('pending branch does not expose recipient_email_normalized as a selected column', () => {
    // recipient_email_normalized must only appear in the WHERE clause, not as a SELECT column.
    // We find the SELECT...FROM block for branch 2 and check its column expressions.
    const branch2 = sql50.slice(sql50.indexOf('UNION ALL'))
    // Isolate between SELECT keyword and the FROM keyword that follows the column list
    const selectKeyword = branch2.indexOf('SELECT\n')
    const fromKeyword = branch2.indexOf('  FROM public.loan_invitations', selectKeyword)
    const columnList = branch2.slice(selectKeyword, fromKeyword)
    // The column list must not reference recipient_email_normalized
    expect(columnList).not.toMatch(/recipient_email_normalized/)
  })

  it('pending branch requires inv.status = pending', () => {
    expect(sql50).toMatch(/inv\.status\s*=\s*'pending'/)
  })

  it('pending branch excludes rows where actor is already lender or borrower', () => {
    expect(sql50).toMatch(/IS DISTINCT FROM p_actor_id/)
  })

  it('existing participant rows return requires_acknowledgement = false', () => {
    // Branch 1 must end with false for requires_acknowledgement
    const branch1 = sql50.slice(0, sql50.indexOf('UNION ALL'))
    // false appears at the end of the SELECT list before FROM (may have spaces/CRLF)
    expect(branch1).toMatch(/false[\s\r\n]+FROM public\.loan_items/)
  })

  it('pending invitation rows return requires_acknowledgement = true', () => {
    const branch2 = sql50.slice(sql50.indexOf('UNION ALL'))
    expect(branch2).toMatch(/true[\s\r\n]+FROM public\.loan_invitations/)
  })

  it('function uses SET search_path = empty string', () => {
    expect(sql50).toMatch(/SET search_path = ''/)
  })

  it('revokes execute from PUBLIC, anon, authenticated', () => {
    expect(sql50).toMatch(/REVOKE EXECUTE.*FROM PUBLIC, anon, authenticated/)
  })

  it('grants execute to service_role only', () => {
    expect(sql50).toMatch(/GRANT\s+EXECUTE.*TO service_role/)
    expect(sql50).not.toMatch(/GRANT.*TO authenticated/)
    expect(sql50).not.toMatch(/GRANT.*TO anon/)
  })

  it('wraps in a transaction', () => {
    expect(sql50).toMatch(/BEGIN/)
    expect(sql50).toMatch(/COMMIT/)
  })

  it('drops claim_loan_invitation before recreating', () => {
    expect(sql50).toMatch(/DROP FUNCTION IF EXISTS public\.claim_loan_invitation\(uuid, uuid\)/)
  })

  it('recreates claim_loan_invitation without expires_at expiry check', () => {
    const claimFnStart = sql50.indexOf('CREATE FUNCTION public.claim_loan_invitation')
    const claimFnEnd = sql50.indexOf('$$;', claimFnStart)
    const claimFnBody = sql50.slice(claimFnStart, claimFnEnd)
    expect(claimFnBody).not.toMatch(/expires_at/)
  })

  it('claim_loan_invitation still checks status = pending', () => {
    const claimFnStart = sql50.indexOf('CREATE FUNCTION public.claim_loan_invitation')
    const claimFnEnd = sql50.indexOf('$$;', claimFnStart)
    const claimFnBody = sql50.slice(claimFnStart, claimFnEnd)
    expect(claimFnBody).toMatch(/status\s*!=\s*'pending'/)
  })

  it('claim_loan_invitation grants remain service_role only', () => {
    const claimGrant = sql50.slice(sql50.indexOf('GRANT  EXECUTE ON FUNCTION public.claim_loan_invitation'))
    expect(claimGrant).toMatch(/TO service_role/)
  })
})
