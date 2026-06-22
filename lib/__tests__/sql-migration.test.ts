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

// ============================================================
// Static SQL regression tests — sql/51 pending creator return
// ============================================================

const sql51 = readFileSync(
  join(process.cwd(), 'sql/51_allow_pending_creator_return.sql'),
  'utf8'
)

describe('sql/51_allow_pending_creator_return.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql51).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql51).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('redefines mark_returned with CREATE OR REPLACE', () => {
    expect(sql51).toContain('CREATE OR REPLACE FUNCTION public.mark_returned')
  })

  it('redefines undo_return with CREATE OR REPLACE', () => {
    expect(sql51).toContain('CREATE OR REPLACE FUNCTION public.undo_return')
  })

  it('mark_returned does not contain the both-parties NULL guard', () => {
    const fnStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.mark_returned')
    const fnEnd   = sql51.indexOf('$$;', fnStart)
    const fnBody  = sql51.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('invitation_not_accepted')
    expect(fnBody).not.toMatch(/lender_user_id IS NULL OR v_loan\.borrower_user_id IS NULL/)
  })

  it('undo_return does not contain the both-parties NULL guard', () => {
    const fnStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.undo_return')
    const fnEnd   = sql51.indexOf('$$;', fnStart)
    const fnBody  = sql51.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain('invitation_not_accepted')
    expect(fnBody).not.toMatch(/lender_user_id IS NULL OR v_loan\.borrower_user_id IS NULL/)
  })

  it('mark_returned still checks actor is direct participant', () => {
    const fnStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.mark_returned')
    const fnEnd   = sql51.indexOf('$$;', fnStart)
    const fnBody  = sql51.slice(fnStart, fnEnd)
    expect(fnBody).toContain('lender_user_id IS DISTINCT FROM p_actor_id')
    expect(fnBody).toContain('borrower_user_id IS DISTINCT FROM p_actor_id')
  })

  it('undo_return still checks actor is direct participant', () => {
    const fnStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.undo_return')
    const fnEnd   = sql51.indexOf('$$;', fnStart)
    const fnBody  = sql51.slice(fnStart, fnEnd)
    expect(fnBody).toContain('lender_user_id IS DISTINCT FROM p_actor_id')
    expect(fnBody).toContain('borrower_user_id IS DISTINCT FROM p_actor_id')
  })

  it('grants remain service_role only — no anon or authenticated', () => {
    const grantLines = sql51.split('\n').filter(l => /^\s*GRANT\b/.test(l))
    for (const line of grantLines) {
      expect(line).not.toMatch(/\b(PUBLIC|anon|authenticated)\b/)
    }
  })

  it('revokes execute from PUBLIC, anon, authenticated for both functions', () => {
    expect(sql51).toContain('REVOKE EXECUTE ON FUNCTION public.mark_returned(uuid, uuid) FROM PUBLIC, anon, authenticated')
    expect(sql51).toContain('REVOKE EXECUTE ON FUNCTION public.undo_return(uuid, uuid)   FROM PUBLIC, anon, authenticated')
  })

  it('grants execute to service_role for both functions', () => {
    expect(sql51).toContain('GRANT EXECUTE ON FUNCTION public.mark_returned(uuid, uuid) TO service_role')
    expect(sql51).toContain('GRANT EXECUTE ON FUNCTION public.undo_return(uuid, uuid)   TO service_role')
  })

  it('uses SET search_path on both functions', () => {
    const markStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.mark_returned')
    const markEnd   = sql51.indexOf('$$;', markStart)
    expect(sql51.slice(markStart, markEnd)).toContain("SET search_path = ''")

    const undoStart = sql51.indexOf('CREATE OR REPLACE FUNCTION public.undo_return')
    const undoEnd   = sql51.indexOf('$$;', undoStart)
    expect(sql51.slice(undoStart, undoEnd)).toContain("SET search_path = ''")
  })
})

// ============================================================
// Static SQL regression tests — sql/52 feature_access table
// ============================================================

const sql52 = readFileSync(
  join(process.cwd(), 'sql/52_feature_access.sql'),
  'utf8'
)

describe('sql/52_feature_access.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql52).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql52).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('creates the feature_access table', () => {
    expect(sql52).toMatch(/CREATE TABLE IF NOT EXISTS public\.feature_access/)
  })

  it('enables RLS on the table', () => {
    expect(sql52).toMatch(/ALTER TABLE public\.feature_access ENABLE ROW LEVEL SECURITY/)
  })

  it('restricts feature_key to umonnun in Phase A', () => {
    expect(sql52).toMatch(/CHECK\s*\(feature_key IN \('umonnun'\)\)/)
  })

  it('primary key covers (feature_key, email)', () => {
    expect(sql52).toMatch(/PRIMARY KEY\s*\(feature_key,\s*email\)/)
  })

  it('revokes all access from PUBLIC, anon, authenticated', () => {
    expect(sql52).toMatch(/REVOKE ALL ON public\.feature_access FROM PUBLIC, anon, authenticated/)
  })

  it('grants only to service_role', () => {
    expect(sql52).toMatch(/GRANT SELECT, INSERT, DELETE ON public\.feature_access TO service_role/)
    expect(sql52).not.toMatch(/GRANT.*TO anon/)
    expect(sql52).not.toMatch(/GRANT.*TO authenticated/)
  })

  it('does not define any RLS policies (service_role only)', () => {
    expect(sql52).not.toMatch(/CREATE POLICY/)
  })
})

// ============================================================
// Static SQL regression tests — sql/53 feature_access tengsl
// ============================================================

const sql53 = readFileSync(
  join(process.cwd(), 'sql/53_feature_access_tengsl.sql'),
  'utf8'
)

describe('sql/53_feature_access_tengsl.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql53).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql53).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('drops the old constraint before adding the new one', () => {
    const dropPos = sql53.indexOf('DROP CONSTRAINT IF EXISTS feature_access_feature_key_check')
    const addPos  = sql53.indexOf('ADD CONSTRAINT feature_access_feature_key_check', dropPos)
    expect(dropPos).toBeGreaterThan(-1)
    expect(addPos).toBeGreaterThan(dropPos)
  })

  it('new constraint allows umonnun and tengsl', () => {
    expect(sql53).toMatch(/CHECK\s*\(feature_key IN \('umonnun',\s*'tengsl'\)\)/)
  })

  it('does not touch grants, RLS, or data', () => {
    expect(sql53).not.toMatch(/GRANT/)
    expect(sql53).not.toMatch(/REVOKE/)
    expect(sql53).not.toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql53).not.toMatch(/INSERT|UPDATE|DELETE/)
  })
})

// ============================================================
// Static SQL regression tests — sql/54 relationships tables
// ============================================================

const sql54 = readFileSync(
  join(process.cwd(), 'sql/54_relationships.sql'),
  'utf8'
)

describe('sql/54_relationships.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql54).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql54).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('creates the relationships table', () => {
    expect(sql54).toMatch(/CREATE TABLE public\.relationships/)
  })

  it('creates the relationship_tags table', () => {
    expect(sql54).toMatch(/CREATE TABLE public\.relationship_tags/)
  })

  it('creates the relationship_sources table', () => {
    expect(sql54).toMatch(/CREATE TABLE public\.relationship_sources/)
  })

  it('has has_identifier CHECK to prevent fully anonymous rows', () => {
    expect(sql54).toMatch(/relationships_has_identifier/)
  })

  it('has not_self CHECK to prevent self-relationships', () => {
    expect(sql54).toMatch(/relationships_not_self/)
  })

  it('uses partial unique index for counterpart_user_id (not UNIQUE NULLS NOT DISTINCT)', () => {
    expect(sql54).toContain('relationships_owner_counterpart_user_idx')
    expect(sql54).toMatch(/WHERE counterpart_user_id IS NOT NULL/)
  })

  it('uses partial unique index for email_canonical', () => {
    expect(sql54).toContain('relationships_owner_email_canonical_idx')
    expect(sql54).toMatch(/WHERE email_canonical IS NOT NULL/)
  })

  it('relationship_tags enforces canonical tag values', () => {
    expect(sql54).toMatch(/CHECK\s*\(tag IN \('unclassified', 'family', 'friends', 'recipients'\)\)/)
  })

  it('relationship_sources source_type is restricted to loans in v1', () => {
    expect(sql54).toMatch(/CHECK\s*\(source_type IN \('loans'\)\)/)
  })

  it('relationship_sources has UNIQUE on (relationship_id, source_type, source_id) for idempotency', () => {
    expect(sql54).toMatch(/UNIQUE\s*\(relationship_id,\s*source_type,\s*source_id\)/)
  })

  it('enables RLS on all three tables', () => {
    expect(sql54).toMatch(/ALTER TABLE public\.relationships\s+ENABLE ROW LEVEL SECURITY/)
    expect(sql54).toMatch(/ALTER TABLE public\.relationship_tags\s+ENABLE ROW LEVEL SECURITY/)
    expect(sql54).toMatch(/ALTER TABLE public\.relationship_sources\s+ENABLE ROW LEVEL SECURITY/)
  })

  it('revokes all access from PUBLIC, anon, authenticated for all three tables', () => {
    expect(sql54).toMatch(/REVOKE ALL ON public\.relationships\s+FROM PUBLIC, anon, authenticated/)
    expect(sql54).toMatch(/REVOKE ALL ON public\.relationship_tags\s+FROM PUBLIC, anon, authenticated/)
    expect(sql54).toMatch(/REVOKE ALL ON public\.relationship_sources\s+FROM PUBLIC, anon, authenticated/)
  })

  it('grants only to service_role for all three tables', () => {
    expect(sql54).toMatch(/GRANT.*ON public\.relationships\s+TO service_role/)
    expect(sql54).toMatch(/GRANT.*ON public\.relationship_tags\s+TO service_role/)
    expect(sql54).toMatch(/GRANT.*ON public\.relationship_sources\s+TO service_role/)
    expect(sql54).not.toMatch(/GRANT.*TO anon/)
    expect(sql54).not.toMatch(/GRANT.*TO authenticated/)
  })

  it('does not define any RLS policies (service_role bypasses RLS)', () => {
    expect(sql54).not.toMatch(/CREATE POLICY/)
  })

  it('does not use UNIQUE NULLS NOT DISTINCT (wrong for multi-private-entry case)', () => {
    expect(sql54).not.toMatch(/UNIQUE NULLS NOT DISTINCT/)
  })

  it('attaches updated_at trigger using existing teskeid_set_updated_at function', () => {
    expect(sql54).toMatch(/EXECUTE FUNCTION public\.teskeid_set_updated_at\(\)/)
  })
})

// ============================================================
// Static SQL regression tests — sql/55 get_my_loans recipient_email
// ============================================================

const sql55 = readFileSync(
  join(process.cwd(), 'sql/55_get_my_loans_add_recipient_email.sql'),
  'utf8'
)

describe('sql/55_get_my_loans_add_recipient_email.sql — static checks', () => {
  it('wraps in a transaction', () => {
    expect(sql55).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql55).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('drops get_my_loans before recreating (return-shape migration safety)', () => {
    expect(sql55).toMatch(/DROP FUNCTION IF EXISTS public\.get_my_loans\(uuid\)/)
  })

  it('uses CREATE FUNCTION (not CREATE OR REPLACE) after drop', () => {
    const dropPos = sql55.indexOf('DROP FUNCTION IF EXISTS public.get_my_loans')
    const createPos = sql55.indexOf('CREATE FUNCTION public.get_my_loans', dropPos)
    expect(createPos).toBeGreaterThan(dropPos)
    // Must not use CREATE OR REPLACE (would fail on return-shape change)
    expect(sql55).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_my_loans/)
  })

  it('returns requires_acknowledgement boolean column (preserved from sql/50)', () => {
    expect(sql55).toMatch(/requires_acknowledgement\s+boolean/)
  })

  it('returns new recipient_email text column', () => {
    expect(sql55).toMatch(/recipient_email\s+text/)
  })

  it('has a UNION ALL branch (soft-ack preserved from sql/50)', () => {
    expect(sql55).toMatch(/UNION ALL/)
  })

  it('pending branch still matches actor email to recipient_email_normalized', () => {
    expect(sql55).toMatch(/recipient_email_normalized\s*=\s*v_actor_norm/)
  })

  it('pending branch still requires inv.status = pending', () => {
    const branch2 = sql55.slice(sql55.indexOf('UNION ALL'))
    expect(branch2).toMatch(/inv\.status\s*=\s*'pending'/)
  })

  it('pending branch still excludes rows where actor is already lender or borrower', () => {
    const branch2 = sql55.slice(sql55.indexOf('UNION ALL'))
    expect(branch2).toMatch(/IS DISTINCT FROM p_actor_id/)
  })

  it('branch 1 returns requires_acknowledgement = false', () => {
    const branch1 = sql55.slice(0, sql55.indexOf('UNION ALL'))
    // false for requires_acknowledgement appears before recipient_email CASE expression
    const falsePos = branch1.lastIndexOf('\n    false,')
    const casePos = branch1.indexOf('CASE WHEN li.created_by = p_actor_id THEN inv.recipient_email_normalized')
    expect(falsePos).toBeGreaterThan(-1)
    expect(casePos).toBeGreaterThan(falsePos)
  })

  it('branch 2 returns requires_acknowledgement = true', () => {
    const branch2 = sql55.slice(sql55.indexOf('UNION ALL'))
    expect(branch2).toMatch(/true,[\s\r\n]+NULL::text[\s\r\n]+FROM public\.loan_invitations/)
  })

  it('branch 1 exposes recipient_email only to creator (CASE WHEN created_by)', () => {
    const branch1 = sql55.slice(0, sql55.indexOf('UNION ALL'))
    expect(branch1).toMatch(/CASE WHEN li\.created_by\s*=\s*p_actor_id\s+THEN inv\.recipient_email_normalized/)
  })

  it('branch 1 returns NULL for non-creator (ELSE NULL::text)', () => {
    const branch1 = sql55.slice(0, sql55.indexOf('UNION ALL'))
    expect(branch1).toMatch(/ELSE NULL::text\s+END/)
  })

  it('branch 2 returns NULL::text for recipient_email (recipient sees their own email, not exposed here)', () => {
    const branch2 = sql55.slice(sql55.indexOf('UNION ALL'))
    // NULL::text must appear in the column list (recipient_email)
    expect(branch2).toContain('NULL::text')
    // inv.recipient_email_normalized (qualified) must not appear as a selected column
    // — it only belongs in the WHERE clause. Comments use the unqualified name.
    const fromStart = branch2.indexOf('FROM public.loan_invitations')
    const selectPart = branch2.slice(0, fromStart)
    expect(selectPart).not.toMatch(/inv\.recipient_email_normalized/)
  })

  it('function uses SET search_path = empty string', () => {
    expect(sql55).toMatch(/SET search_path = ''/)
  })

  it('revokes execute from PUBLIC, anon, authenticated', () => {
    expect(sql55).toMatch(/REVOKE EXECUTE.*FROM PUBLIC, anon, authenticated/)
  })

  it('grants execute to service_role only', () => {
    expect(sql55).toMatch(/GRANT\s+EXECUTE.*TO service_role/)
    expect(sql55).not.toMatch(/GRANT.*TO authenticated/)
    expect(sql55).not.toMatch(/GRANT.*TO anon/)
  })
})
