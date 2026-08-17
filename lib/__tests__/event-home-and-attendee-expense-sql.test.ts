import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const readSql = (name: string) => fs.readFileSync(path.join(process.cwd(), 'sql', name), 'utf8')

describe('Event home invitations and attendee-tagged Expenses migrations', () => {
  const homeSql = readSql('134_event_home_invitation_feed.sql')
  const expenseSql = readSql('135_event_attendee_tagged_expenses.sql')
  const organizerSql = readSql('137_event_organizer_expense_projection_and_backlink.sql')
  const detailsSql = readSql('138_event_details.sql')

  it('keeps the home projection session/email scoped, bounded and free of recipient email output', () => {
    expect(homeSql).toContain('teskeid_event_assert_session_actor(p_actor_id)')
    expect(homeSql).toContain('candidate.recipient_email_canonical = v_actor_email')
    expect(homeSql).toContain("candidate.attempt_number > 0")
    expect(homeSql).toContain('LIMIT 100')
    expect(homeSql).toContain("CHECK (source IN ('loans', 'expenses', 'events'))")
    expect(homeSql).not.toMatch(/jsonb_build_object\([\s\S]{0,300}'recipient_email'/)
    expect(homeSql).toContain('TO service_role')
    expect(homeSql).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('accepts both PostgreSQL catalog representations of an empty function search path', () => {
    expect(homeSql).toContain(
      "function_row.proconfig[1] IN ('search_path=', 'search_path=\"\"')",
    )
    expect(homeSql).toMatch(
      /cardinality\(COALESCE\(\s*function_row\.proconfig, ARRAY\[\]::text\[\]\s*\)\) = 1/,
    )
    expect(homeSql).not.toContain("function_row.proconfig = ARRAY['search_path=']::text[]")
  })

  it('keeps attendee Expense creation behind both feature access and accepted membership', () => {
    expect(expenseSql).toContain('teskeid_event_assert_financial_actor(p_actor_id)')
    expect(expenseSql).toContain('teskeid_event_attendance_memberships')
    expect(expenseSql).toContain("self_guest.status = 'active'")
    expect(expenseSql).toContain('self_guest.linked_user_id = membership.user_id')
    expect(expenseSql).toContain("pg_catalog.jsonb_array_length(p_payload->'participant_invitations') <> 0")
    expect(expenseSql).toContain("'invitation_ids', '[]'::jsonb")
  })

  it('preserves owner behavior and keeps Event guests as separate one-off Expense members', () => {
    expect(expenseSql).toContain('RETURN public.teskeid_event_create_tagged_expense(')
    expect(expenseSql).toContain("'viewer_role', CASE WHEN v_is_owner THEN 'owner' ELSE 'attendee' END")
    expect(expenseSql).toContain("'user_id', NULL")
    expect(expenseSql).toContain("'role', 'member'")
    expect(expenseSql).toContain('teskeid_event_expense_participant_sources')
    expect(expenseSql).toContain('teskeid_event_assert_expense_link(p_event_id, v_group_id, v_expense_id)')
  })

  it('fails closed on missing SQL133 dependencies and restores their private ACLs', () => {
    expect(expenseSql).toContain("'public.teskeid_event_get_expense_source(uuid,uuid)'")
    expect(expenseSql).toContain("'public.teskeid_event_assert_expense_link(uuid,uuid,uuid)'")
    expect(expenseSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.teskeid_event_get_expense_source\(uuid,uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    )
    expect(expenseSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.teskeid_event_get_expense_source\(uuid,uuid\)\s+TO service_role;/,
    )
    expect(expenseSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.teskeid_event_assert_expense_link\(uuid,uuid,uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
  })

  it('removes attendee-created Event links before account unlinking can violate history invariants', () => {
    expect(expenseSql).toContain('BEFORE UPDATE OF user_id ON public.expense_group_members')
    expect(expenseSql).toContain('OLD.user_id IS NOT NULL AND NEW.user_id IS NULL')
    expect(expenseSql).toContain('DELETE FROM public.teskeid_event_expense_links')
  })

  it('projects the organizer safely and exposes only an authorized Expense backlink', () => {
    expect(organizerSql).toContain("'participant_kind', projected.participant_kind")
    expect(organizerSql).toContain("'organizer'::text AS participant_kind")
    expect(organizerSql).toContain('WHERE NOT v_is_owner')
    expect(organizerSql).toContain('public.expense_active_member_role(p_actor_id, link.group_id) IS NOT NULL')
    expect(organizerSql).toContain('teskeid_event_attendance_memberships')
    expect(organizerSql).not.toMatch(/'email'\s*,|'user_id'\s*,/)
  })

  it('pins both SQL137 function bodies and their private service-only ACLs', () => {
    const normalized = organizerSql.replace(/\r\n/g, '\n')
    const bodies = [...normalized.matchAll(
      /CREATE(?: OR REPLACE)? FUNCTION public\.(teskeid_event_get_expense_(?:source|event_link))\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g,
    )]
    expect(bodies).toHaveLength(2)
    const hashes = new Map(bodies.map((match) => [
      match[1],
      createHash('md5').update(match[2]!).digest('hex'),
    ]))
    expect(hashes.get('teskeid_event_get_expense_source')).toBe(
      '3d01501bdb03f0f6bca83e0817688006',
    )
    expect(hashes.get('teskeid_event_get_expense_event_link')).toBe(
      'e600e30ddb2660788d0542825e8162ca',
    )
    expect(organizerSql.match(/FROM PUBLIC, anon, authenticated;/g)).toHaveLength(2)
    expect(organizerSql.match(/TO service_role;/g)).toHaveLength(2)
  })

  it('stores optional Event details privately and preserves legacy empty events', () => {
    expect(detailsSql).toContain('CREATE TABLE public.teskeid_event_details')
    expect(detailsSql).toContain('(event_date IS NULL) = (event_time IS NULL)')
    expect(detailsSql).toContain('LEFT JOIN public.teskeid_event_details AS details')
    expect(detailsSql).toContain('ALTER TABLE public.teskeid_event_details ENABLE ROW LEVEL SECURITY')
    expect(detailsSql).toContain('ALTER TABLE public.teskeid_event_details FORCE ROW LEVEL SECURITY')
    expect(detailsSql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(detailsSql).not.toMatch(/CREATE POLICY/i)
  })

  it('keeps details owner-write, attendee-read and request-id replay safe', () => {
    expect(detailsSql).toContain('event_row.owner_user_id = p_actor_id')
    expect(detailsSql).toContain('teskeid_event_attendance_memberships')
    expect(detailsSql).toContain('v_existing.last_request_id = p_request_id')
    expect(detailsSql).toContain("RAISE EXCEPTION 'teskeid_event_request_conflict'")
    expect(detailsSql).toContain('teskeid_event_create_with_attendance_invitations(')
    expect(detailsSql).toContain('teskeid_event_save_details(')
    expect(detailsSql.match(/TO service_role;/g)).toHaveLength(3)
  })
})
