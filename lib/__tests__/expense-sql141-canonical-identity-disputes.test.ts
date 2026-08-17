import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/141_expense_canonical_identity_and_claim_disputes.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/141-expense-canonical-identity-and-claim-disputes',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function functionBody(name: string): string {
  const plain = migration.indexOf(`CREATE FUNCTION public.${name}(`)
  const replaced = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const start = plain >= 0 ? plain : replaced
  const bodyStart = migration.indexOf('AS $function$', start)
  const bodyEnd = migration.indexOf('$function$;', bodyStart + 13)
  if (start < 0 || bodyStart < 0 || bodyEnd < 0) throw new Error(`missing ${name}`)
  return migration.slice(bodyStart + 13, bodyEnd).replace(/\r\n/g, '\n')
}

describe('SQL141 canonical Expense identity and claim disputes', () => {
  it('is transactional and keeps every operator validator read-only', () => {
    expect(migration).toMatch(/^-- SQL141:/)
    expect(migration).toContain('BEGIN;')
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    for (const validator of [preflight, postflight, recovery]) {
      expect(validator).toContain('BEGIN;')
      expect(validator).toContain('SET TRANSACTION READ ONLY;')
      expect(validator.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(validator).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im,
      )
    }
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(readme).toContain('does **not** recreate SQL139 participant-source history')
    expect(readme).toContain('legacy private rows are ignored rather than treated as proof')
    expect(readme).toContain('Financial/ledger invariants')
    expect(readme).toContain('Provenance/context invariants')
    expect(readme).toContain('reserved future state')
  })

  it('keeps proof and dispute storage private and implements only disputed', () => {
    for (const table of [
      'expense_member_identity_bindings',
      'expense_claim_disputes',
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role`,
      ))
    }
    expect(migration).toContain("CHECK (status = 'disputed')")
    expect(migration).not.toMatch(/status\s*=\s*'resolved'|resolve_expense_claim|expense_resolve_claim/i)
    expect(postflight).toContain("LIKE '%status = ''disputed''::text%'")
    const privateRecent = functionBody('expense_record_private_recent')
    expect(privateRecent).toContain('INSERT INTO public.expense_activity(')
    expect(privateRecent).toContain('INSERT INTO public.expense_activity_audience')
    expect(privateRecent).not.toContain('public.expense_record_activity(')
    expect(privateRecent).not.toMatch(/expense_group_members|recipient_email|actorUserId/i)
    expect(migration).toContain("RAISE EXCEPTION 'expense_141_unexpected_historical_backfill'")
  })

  it('binds only from server-owned durable Relationship proof in ordinary flows', () => {
    for (const name of [
      'expense_create_expense_with_participants',
      'expense_update_expense_with_participants',
      'expense_add_participant',
      'expense_add_share_collaborator',
    ]) {
      const body = functionBody(name)
      expect(body).toContain('public.relationships AS relationship')
      expect(body).toContain('relationship.counterpart_user_id')
      expect(body).toContain('relationship.owner_id = p_actor_id')
      expect(body).toContain("'relationship'")
      expect(body).toContain('expense_apply_identity_binding')
      expect(body).not.toMatch(/display_name\s*=\s*.*(?:user_id|email)|lower\([^)]*display_name/i)
    }
    const share = functionBody('expense_add_share_collaborator')
    expect(share).toContain("ELSIF p_recipient_email IS NOT NULL THEN")
    expect(share).toContain("NULL, 'manual_email'")
  })

  it('uses current exact Event eligibility for manual repair, never removed provenance', () => {
    const candidates = functionBody('expense_get_event_identity_candidates')
    const repair = functionBody('expense_bind_member_event_identity')
    for (const body of [candidates, repair]) {
      expect(body).toContain('teskeid_event_expense_links')
      expect(body).toContain('teskeid_event_attendance_memberships')
      expect(body).toContain('teskeid_event_guests')
      expect(body).toContain("invitation.status = 'accepted'")
      expect(body).toContain("guest.status = 'active'")
      expect(body).not.toContain('teskeid_event_expense_participant_sources')
      expect(body).not.toMatch(/normalize_email_canonical|display_name\s*=|ILIKE/i)
    }
    expect(candidates).toContain('guest.linked_user_id IS DISTINCT FROM v_owner_id')
    expect(repair).toContain('guest.linked_user_id IS DISTINCT FROM v_event.owner_user_id')
    expect(repair).toContain("'event_current_repair'")
    expect(repair).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(repair).toContain('FOR SHARE OF actor_membership, actor_guest, actor_invitation')
    expect(repair).toContain('FOR SHARE OF guest, membership, invitation')
    expect(preflight).toContain('AS historical_participant_sources_present')
    expect(preflight).not.toContain('historical_participant_sources_clear')
    expect(postflight).toContain('AS historical_participant_sources_ignored_ok')
    expect(postflight).not.toContain('participant_provenance_removed')
  })

  it('bypasses Event consent only for a current accepted canonical identity', () => {
    const wrapper = functionBody('teskeid_event_create_expense_from_event_for_actor')
    expect(wrapper).toContain('Only a current, accepted Event identity bypasses consent')
    expect(wrapper).toContain('invitation.member_id = v_source.expense_member_id')
    expect(wrapper).toContain("invitation.status = 'pending'")
    expect(wrapper).not.toMatch(
      /SELECT COALESCE\(pg_catalog\.array_agg\(invitation\.id[\s\S]*JOIN public\.teskeid_event_expense_participant_sources/,
    )
  })

  it('records a dispute without unlinking identity or rewriting financial truth', () => {
    const dispute = functionBody('expense_dispute_claim')
    expect(dispute).toContain('INSERT INTO public.expense_claim_disputes')
    expect(dispute).toContain('v_member.user_id IS DISTINCT FROM p_actor_id')
    expect(dispute).toContain('direct_share.amount_minor > 0')
    expect(dispute).toContain('expense_share_collaborators AS collaboration')
    expect(dispute).toContain('shared_share.amount_minor > 0')
    expect(dispute).toContain('v_expense.created_by IS NOT DISTINCT FROM p_actor_id')
    expect(dispute).toContain("'expense_claim_disputed'")
    expect(dispute).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.(?:expenses|expense_payments|expense_shares|expense_obligations|expense_repayments|expense_group_members|expense_member_identity_bindings|teskeid_event_expense_links)\b/i,
    )
    expect(dispute).not.toMatch(/SET\s+user_id\s*=\s*NULL|DELETE FROM public\.expense_member_identity_bindings/i)
    expect(dispute).not.toMatch(/SET\s+created_by\s*=|SET\s+incurred_on\s*=/i)
  })

  it('fails settlement closed while leaving reject and cancel transitions available', () => {
    const guard = functionBody('expense_guard_disputed_settlement')
    expect(guard).toContain("TG_OP = 'INSERT'")
    expect(guard).toContain("NEW.status = 'confirmed'")
    expect(guard).toContain("dispute.status = 'disputed'")
    expect(guard).toContain("RAISE EXCEPTION 'expense_claim_requires_review'")
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF status ON public.expense_repayments')
  })

  it('keeps exact member navigation available without granting feature-wide access', () => {
    const resolver = functionBody('expense_resolve_recent_targets')
    expect(resolver).toContain('public.expense_has_beta_access(p_actor_id)')
    expect(resolver).toContain('member.user_id = p_actor_id')
    expect(resolver).toContain("member.status = 'active'")
    expect(resolver).toContain("'/auth-mvp/utlagt-og-endurgreitt/utgjold/'")
  })

  it('keeps all declared identifiers within PostgreSQL limits', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(0)
    expect(Math.max(...identifiers.map((identifier) => Buffer.byteLength(identifier, 'utf8'))))
      .toBeLessThanOrEqual(63)
  })

  it('pins every changed function body in the read-only postflight', () => {
    const names = [
      'expense_identity_request_id',
      'expense_record_private_recent',
      'expense_apply_identity_binding',
      'expense_create_expense_with_participants',
      'expense_update_expense_with_participants',
      'expense_add_participant',
      'expense_add_share_collaborator',
      'teskeid_event_create_expense_from_event_for_actor',
      'expense_get_event_identity_candidates',
      'expense_bind_member_event_identity',
      'expense_dispute_claim',
      'expense_get_claim_context',
      'expense_guard_disputed_settlement',
      'expense_resolve_recent_targets',
    ]
    for (const name of names) {
      const hash = createHash('md5').update(functionBody(name)).digest('hex')
      expect(postflight).toContain(hash)
    }
    expect(postflight).toContain('pg_catalog.count(*) = 14')
  })
})
