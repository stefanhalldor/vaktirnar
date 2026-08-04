import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/97_expense_edit_and_member_linking.sql'),
  'utf8',
)
const preflight = readFileSync(
  join(process.cwd(), 'sql/validation/97_expense_edit_and_member_linking_preflight.sql'),
  'utf8',
)
const postflight = readFileSync(
  join(process.cwd(), 'sql/validation/97_expense_edit_and_member_linking_postflight.sql'),
  'utf8',
)

function functionBody(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + marker.length)
  const commit = sql.indexOf('\nCOMMIT;', start + marker.length)
  const candidates = [next, commit].filter((value) => value >= 0)
  const end = candidates.length > 0 ? Math.min(...candidates) : sql.length
  return sql.slice(start, end)
}

function withoutComments(value: string): string {
  return value
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('SQL97 expense editing and identity invitations', () => {
  it('is a single transaction and does not mutate feature/recent source unions', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(sql).not.toMatch(/ALTER TABLE public\.feature_access/i)
    expect(sql).not.toMatch(/ALTER TABLE public\.recent_events/i)
    expect(sql).toContain('sql97_missing_prerequisites')
  })

  it('widens only relationship provenance to loans + expenses', () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT relationship_sources_source_type_check[\s\S]{0,120}source_type IN \('loans', 'expenses'\)/,
    )
  })

  it('creates a durable same-group invitation with a scrubbed terminal lifecycle', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.expense_member_invitations')
    expect(sql).toContain('expense_member_invitations_group_member_fk')
    expect(sql).toContain('REFERENCES public.expense_group_members(group_id, id) ON DELETE CASCADE')
    expect(sql).toMatch(/status = 'pending'[\s\S]{0,220}recipient_email_canonical IS NOT NULL/)
    expect(sql).toContain("status <> 'pending' AND recipient_email_canonical IS NULL")
    expect(sql).toContain('expense_member_invitations_pending_member_unique')
    expect(sql).toContain('expense_member_invitations_pending_email_unique')
  })

  it('keeps the new table service-role read-only and browser-inaccessible', () => {
    expect(sql).toContain('ALTER TABLE public.expense_member_invitations ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(
      /REVOKE ALL ON public\.expense_member_invitations\s+FROM PUBLIC, anon, authenticated, service_role/,
    )
    expect(sql).toContain('GRANT SELECT ON public.expense_member_invitations TO service_role')
    expect(sql).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,80}expense_member_invitations/i,
    )
  })

  it('makes the edit atomic, version checked and settlement safe', () => {
    const body = functionBody('expense_update_expense')
    const groupLock = body.indexOf('FROM public.expense_groups AS group_row')
    const expenseLock = body.indexOf('FROM public.expenses AS expense', groupLock)
    expect(groupLock).toBeGreaterThanOrEqual(0)
    expect(expenseLock).toBeGreaterThan(groupLock)
    expect(body).toContain('FOR UPDATE')
    expect(body).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(body).toContain("repayment.status IN ('reported', 'confirmed')")
    expect(body).toContain('p_preserve_shares')
    expect(body).toContain('p_total_minor IS NULL')
    expect(body).toContain('p_new_guest_members IS NULL')
    expect(body).toContain('jsonb_array_length(p_new_guest_members)')
    expect(body).toMatch(/status = 'active'[\s\S]{0,120}> 50/)
    expect(body).toContain("v_group.kind <> 'one_off'")
    expect(body).toContain('SET name = left(btrim(p_title), 160), default_currency = p_currency')
    expect(body).toContain("'changed', false")
    expect(body.indexOf("'changed', false")).toBeLessThan(
      body.indexOf('DELETE FROM public.expense_payments'),
    )
    expect(body).toContain('INSERT INTO public.expense_group_members')
    expect(body).toContain('historical_payment.amount_minor = (item->>\'amount_minor\')::bigint')
    expect(body).toContain('historical_share.amount_minor = (item->>\'amount_minor\')::bigint')
    expect(body).toContain("'expense_updated'")
  })

  it('never links identity when the email invitation is merely created', () => {
    const body = functionBody('expense_link_guest_member_email')
    expect(body).toContain('public.normalize_email_canonical(p_recipient_email)')
    expect(body).toContain("feature_key = 'utlagt-og-endurgreitt'")
    expect(body).toContain('v_actor_email_canonical = v_recipient_email_canonical')
    expect(body).toContain("v_member.user_id IS NOT NULL")
    expect(body).not.toMatch(/UPDATE public\.expense_group_members[\s\S]{0,100}SET user_id/)
    expect(body).not.toMatch(/jsonb_build_object\([\s\S]{0,250}'recipient_email'/)
  })

  it('accepts only a canonical email match and updates the same durable member', () => {
    const body = functionBody('expense_respond_member_invitation')
    expect(body).toContain(
      'v_invitation.recipient_email_canonical IS DISTINCT FROM v_actor_email_canonical',
    )
    expect(body).toContain('p_action IS NULL')
    expect(body).toContain("p_action NOT IN ('accept', 'decline')")
    expect(body).toContain('existing_member.user_id = p_actor_id')
    expect(body).toMatch(
      /UPDATE public\.expense_group_members AS member[\s\S]{0,180}SET user_id = p_actor_id[\s\S]{0,180}WHERE member\.id = v_member_id/,
    )
    expect(body).toContain("ARRAY[p_invitation_id], 'accepted'")
    expect(body).toContain("ARRAY[p_invitation_id], 'declined'")
    expect(body).toContain('ARRAY[v_invitation.invited_by]')
    expect(body).toContain("coalesce(v_public_display_name, 'Teskeiðarnotandi')")
    expect(body).toContain("'member_id', v_member_id")
    expect(body).not.toContain("'counterpart_email_canonical'")
    expect(body).not.toContain("'guest_display_name'")
    expect(body).toContain('financial_version = group_row.financial_version + 1')
  })

  it('fails closed when a delivery or terminal invitation status is null', () => {
    const delivery = functionBody('expense_update_member_invitation_delivery')
    expect(delivery).toContain('p_status IS NULL')
    expect(delivery).toContain('p_attempt_number IS NULL OR p_attempt_number < 1')
    expect(functionBody('expense_terminalize_member_invitations')).toContain(
      'p_status IS NULL',
    )
  })

  it('does not expose the private guest label before consent', () => {
    const inbox = functionBody('expense_get_my_member_invitations')
    const reserve = functionBody('expense_reserve_member_invitation_send')
    expect(inbox).not.toContain('guest_display_name_snapshot')
    expect(reserve).not.toContain('guest_display_name_snapshot')
  })

  it('uses reserved immutable email payloads and compare-and-set delivery', () => {
    const reserve = functionBody('expense_reserve_member_invitation_send')
    const delivery = functionBody('expense_update_member_invitation_delivery')
    expect(reserve).toContain("attempt_status = 'reserved'")
    expect(reserve).toContain("email_template_version = 'v1'")
    expect(reserve).toContain("interval '5 minutes'")
    expect(reserve).toContain("interval '24 hours'")
    expect(reserve).toContain('v_invitation.attempt_number >= 3')
    expect(reserve).toContain("v_group.status <> 'active'")
    expect(reserve).toContain('v_member.user_id IS NOT NULL')
    expect(delivery).toContain('v_invitation.attempt_number <> p_attempt_number')
    expect(delivery).toContain("v_invitation.attempt_status <> 'reserved'")
    expect(delivery).toContain("WHEN p_status = 'sent' THEN now()")
  })

  it('projects safe invitation events and reauthorizes their targets at click time', () => {
    expect(sql).toContain("'expense_member_invitation_received'")
    expect(sql).toContain("'expense_member_invitation'")
    const activity = functionBody('expense_record_activity')
    expect(activity).toContain('/auth-mvp/utlagt-og-endurgreitt/bod/adili/')
    expect(activity).not.toContain('recipient_email_canonical')
    const resolver = functionBody('expense_resolve_recent_targets')
    expect(resolver).toContain('invitation.recipient_email_canonical')
    expect(resolver).toContain('public.normalize_email_canonical(account.email)')
    expect(resolver).toContain("invitation.status = 'accepted'")
    expect(resolver).toContain('linked_member.user_id = p_actor_id')
    expect(resolver).toContain('resolved.resolved_href IS NOT NULL')
  })

  it('backfills pre-signup invitations and terminalizes dead notifications', () => {
    const sync = functionBody('expense_sync_my_member_invitation_events')
    const terminal = functionBody('expense_terminalize_member_invitations')
    expect(sync).toContain('invitation.recipient_email_canonical = v_actor_email_canonical')
    expect(sync).toContain('ON CONFLICT (user_id, event_key) DO NOTHING')
    expect(sync).not.toMatch(/amount_minor|expense_payments|expense_shares|recipient_email['"]/)
    expect(terminal).toContain('recipient_email_canonical = NULL')
    expect(terminal).toContain("event.event_type = 'expense_member_invitation_received'")
    expect(terminal).toContain('ack_at = coalesce(event.ack_at, now())')
  })

  it('scrubs pending invitations on removal, one-off cancellation and account deletion', () => {
    for (const name of [
      'expense_set_group_status',
      'expense_remove_group_member',
      'expense_cancel_expense',
      'expense_prepare_account_deletion',
    ]) {
      const body = functionBody(name)
      expect(body).toContain('public.expense_member_invitations')
      expect(body).toContain('public.expense_terminalize_member_invitations')
    }
    const deletion = functionBody('expense_prepare_account_deletion')
    expect(deletion).toContain('invitation.invited_by = p_user_id')
    expect(deletion).toContain('invitation.recipient_email_canonical = v_email_canonical')
    expect(deletion).toContain("'invitations_scrubbed'")
    expect(deletion).toContain('guest_display_name_snapshot = NULL')
  })

  it('grants every public SQL97 RPC only to service_role', () => {
    for (const name of [
      'expense_update_expense',
      'expense_link_guest_member_email',
      'expense_get_my_member_invitations',
      'expense_sync_my_member_invitation_events',
      'expense_reserve_member_invitation_send',
      'expense_update_member_invitation_delivery',
      'expense_respond_member_invitation',
      'expense_cancel_member_invitation',
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`))
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]{0,220}TO service_role`,
      ))
    }
    expect(sql).not.toMatch(/TO anon|TO authenticated/)
  })

  it('ships read-only preflight and postflight scripts', () => {
    for (const check of [preflight, postflight]) {
      const statements = withoutComments(check)
      expect(statements).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/im)
    }
    expect(preflight).toContain('transactions_older_than_five_minutes')
    expect(preflight).toContain('unexpected_relationship_source_types')
    expect(postflight).toContain('lifecycle_violations')
    expect(postflight).toContain('browser_function_execute')
    expect(postflight).toContain('service_role_direct_writes')
  })
})
