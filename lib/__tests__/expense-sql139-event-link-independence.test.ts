import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = fs.readFileSync(path.join(root, 'sql/139_expense_event_link_independence.sql'), 'utf8')
const preflight = fs.readFileSync(path.join(
  root, 'sql/validation/139-expense-event-link-independence/preflight.sql',
), 'utf8')
const postflight = fs.readFileSync(path.join(
  root, 'sql/validation/139-expense-event-link-independence/postflight.sql',
), 'utf8')
const recovery = fs.readFileSync(path.join(
  root, 'sql/validation/139-expense-event-link-independence/recovery.sql',
), 'utf8')

function body(name: string): string {
  const plain = migration.indexOf(`CREATE FUNCTION public.${name}(`)
  const replaced = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const start = plain >= 0 ? plain : replaced
  if (start < 0) throw new Error(`missing function ${name}`)
  const bodyStart = migration.indexOf('AS $function$', start)
  const bodyEnd = migration.indexOf('$function$;', bodyStart + 13)
  if (bodyStart < 0 || bodyEnd < 0) throw new Error(`missing body ${name}`)
  return migration.slice(bodyStart + 13, bodyEnd)
}

describe('SQL139 independent Expense event links', () => {
  it('is additive, transactional and keeps all operator validators read-only', () => {
    expect(migration).toMatch(/^-- SQL139:/)
    expect(migration).toContain('BEGIN;')
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    for (const validator of [preflight, postflight, recovery]) {
      expect(validator).toContain('BEGIN;')
      expect(validator).toContain('SET TRANSACTION READ ONLY;')
      expect(validator.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(validator).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im)
      expect(validator).not.toContain('pg_catalog.current_user')
    }
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(0)
    expect(identifiers.every((identifier) => Buffer.byteLength(identifier, 'utf8') <= 63))
      .toBe(true)
    expect(migration).not.toMatch(/\bAS\s+authorization\b/i)
  })

  it('turns Event roster provenance into temporary import validation only', () => {
    const create = body('teskeid_event_create_expense_from_event_for_actor')
    const preview = body('teskeid_event_get_expense_preview')
    expect(create).toContain('p_link_to_event')
    expect(create).toContain('teskeid_event_create_tagged_expense_for_actor')
    expect(create).toContain('DELETE FROM public.teskeid_event_expense_participant_sources')
    expect(create).toContain('DELETE FROM public.expense_member_invitations')
    expect(create).toContain('DELETE FROM public.expense_activity')
    expect(create).toContain('DELETE FROM public.recent_events')
    expect(create).toContain("activity.entity_type = 'expense_member_invitation'")
    expect(create).toContain('candidate.value::uuid <> ALL(v_import_invitation_ids)')
    expect(create).toContain('IF NOT p_link_to_event THEN')
    expect(create).toContain('DELETE FROM public.teskeid_event_expense_links')
    expect(create).toContain('teskeid_event_begin_request')
    expect(create).toContain('teskeid_event_finish_request')
    expect(preview).not.toContain('teskeid_event_expense_participant_sources')
    expect(preview).not.toContain('teskeid_event_guests')
    expect(preview).not.toContain('expense_active_member_role')
    expect(preview).toContain("THEN 'user:' || member.user_id::text")
    expect(preview).toContain("'member:' || member.group_id::text || ':' || member.id::text")
    expect(preview).toContain('LEFT JOIN public.profiles AS profile ON profile.id = member.user_id')
    expect(preview).toContain("pg_catalog.strpos(safe_label.display_name, '@') = 0")
  })

  it('attaches and detaches only link metadata under both canonical authorities', () => {
    const attach = body('teskeid_event_attach_expense')
    const detach = body('teskeid_event_detach_expense')
    expect(attach).toContain('p_expected_financial_version')
    expect(attach).toContain('p_expected_roster_revision')
    expect(attach).toContain("'teskeid_event_attach_expense'")
    expect(attach).toContain('teskeid_event_finish_request')
    expect(attach).toContain('expense_active_member_role')
    expect(attach).toContain('teskeid_event_attendance_memberships')
    expect(attach).toContain('INSERT INTO public.teskeid_event_expense_links')
    expect(attach.indexOf('FROM public.expense_groups AS group_row'))
      .toBeLessThan(attach.indexOf('FROM public.teskeid_events AS event_row'))
    expect(attach).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:expenses|expense_payments|expense_shares|expense_obligations|expense_group_members|expense_member_invitations)/)
    expect(detach).toContain('DELETE FROM public.teskeid_event_expense_links')
    expect(detach).toContain('p_expected_event_id')
    expect(detach).toContain("'teskeid_event_detach_expense'")
    expect(detach).toContain('teskeid_event_finish_request')
    expect(detach.indexOf('FROM public.expense_groups AS group_row'))
      .toBeLessThan(detach.indexOf('FROM public.teskeid_events AS event_row'))
    expect(detach).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:expenses|expense_payments|expense_shares|expense_obligations|expense_group_members|expense_member_invitations)/)
  })

  it('keeps picker output attendee-safe and one-event-only', () => {
    const management = body('teskeid_event_get_expense_link_management')
    expect(management).toContain("'current_event'")
    expect(management).toContain("'events'")
    expect(management).toContain("'can_open'")
    expect(management).toContain("'viewer_role'")
    expect(management).toContain('LIMIT 100')
    expect(management).not.toMatch(/email|linked_user_id'|event_guest_id'|expense_member_id'/i)
    expect(migration).toContain("RAISE EXCEPTION 'teskeid_event_link_conflict'")
  })

  it('keeps helpers private and exposes only bounded service RPCs', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.teskeid_event_assert_expense_link(uuid,uuid,uuid)',
    )
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    for (const name of [
      'teskeid_event_create_expense_from_event_for_actor',
      'teskeid_event_get_expense_link_management',
      'teskeid_event_attach_expense',
      'teskeid_event_detach_expense',
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`)
    }
  })
})
