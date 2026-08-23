import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/148_event_person_source_authority.sql'), 'utf8')
const validationRoot = join(root, 'sql/validation/148-event-person-source-authority')

function functionBody(name: string): string {
  const marker = `CREATE FUNCTION public.${name}(`
  const start = migration.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = migration.indexOf('AS $function$', start) + 'AS $function$'.length
  const bodyEnd = migration.indexOf('$function$;', bodyStart)
  expect(bodyStart).toBeGreaterThan('AS $function$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return migration.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

describe('SQL148 Event person-source authority', () => {
  it('adds exactly the two frozen browse RPC signatures', () => {
    expect(migration.match(/CREATE FUNCTION public\.teskeid_event_[a-z0-9_]+\(/g)).toEqual([
      'CREATE FUNCTION public.teskeid_event_list_person_source_events_v1(',
      'CREATE FUNCTION public.teskeid_event_get_person_source_roster_v1(',
    ])
    expect(migration).toContain('p_before_sort_at timestamptz')
    expect(migration).toContain('p_before_event_id uuid')
    expect(migration).toContain('p_limit integer')
    const expected = [
      ['teskeid_event_list_person_source_events_v1', 'a31fc1caa0cf009e4daad9c3e3ed1875'],
      ['teskeid_event_get_person_source_roster_v1', 'ae418825a7d7f8ebe056272dde9448fd'],
    ] as const
    for (const [name, digest] of expected) {
      expect(md5(functionBody(name))).toBe(digest)
      expect(readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')).toContain(digest)
      expect(readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')).toContain(digest)
    }
  })

  it('uses Event-only authority and performs no read-side mutation or sweep', () => {
    for (const body of [
      functionBody('teskeid_event_list_person_source_events_v1'),
      functionBody('teskeid_event_get_person_source_roster_v1'),
    ]) {
      expect(body).toContain('PERFORM public.teskeid_event_assert_actor(p_actor_id)')
      expect(body).not.toContain('teskeid_event_assert_financial_actor')
      expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/)
      expect(body).not.toMatch(/sweep|expire_pending/i)
      expect(body).not.toMatch(/expense_/i)
    }
  })

  it('enforces accepted active-self attendance, owner precedence and keyset bounds', () => {
    const body = functionBody('teskeid_event_list_person_source_events_v1')
    expect(body).toContain("self_guest.status = 'active'")
    expect(body).toContain('self_guest.linked_user_id = p_actor_id')
    expect(body).toContain('membership.user_id = p_actor_id')
    expect(body).toContain('SELECT DISTINCT ON (candidate.event_id)')
    expect(body).toContain('ORDER BY candidate.event_id, candidate.role_priority')
    expect(body).toContain('(candidate.visible_sort_at, candidate.event_id)')
    expect(body).toContain('< (p_before_sort_at, p_before_event_id)')
    expect(body).toContain('LIMIT p_limit + 1')
    expect(body).toContain('p_limit < 1 OR p_limit > 50')
    expect(body).toContain('NOT pg_catalog.isfinite(p_before_sort_at)')
    expect(body).toContain("'active_person_count'")
    expect(body).toMatch(/1 \+ \(\s*SELECT pg_catalog\.count/)
    expect(body).not.toMatch(/pending|declined|revoked/)
  })

  it('returns organizer plus active guests with owner-private and attendee-coarsened rows', () => {
    const body = functionBody('teskeid_event_get_person_source_roster_v1')
    expect(body).toContain("'organizer'::text AS participant_kind")
    expect(body).toContain("guest.status = 'active'")
    expect(body).toContain("WHEN guest.source_kind = 'manual_email' THEN 'manual_email'")
    expect(body).toMatch(
      /CASE WHEN guest\.source_kind = 'manual_email'\s+AND guest\.linked_user_id IS NULL\s+THEN NULL/,
    )
    expect(body).toContain("ELSE 'unlinked_guest'")
    expect(body).not.toContain("'relationship' AS attendee_source_kind")
    expect(body).not.toContain("'manual_email' AS attendee_source_kind")
    expect(body).toContain("RAISE EXCEPTION 'teskeid_event_not_found'")
    expect(body).toContain("pg_catalog.jsonb_array_length(v_people) > 50")
  })

  it('locks down volatility, search path, ownership and ACL without RLS changes', () => {
    expect(migration.match(/\nSTABLE\nSECURITY DEFINER\nSET search_path = ''/g)).toHaveLength(2)
    expect(migration.match(/OWNER TO postgres/g)).toHaveLength(2)
    expect(migration.match(/TO service_role;/g)).toHaveLength(2)
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(readFileSync(join(validationRoot, 'postflight.sql'), 'utf8'))
      .toContain('pg_catalog.aclexplode')
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|DROP) (?:TABLE|POLICY)\b/)
    expect(migration).not.toMatch(/\b(?:ENABLE|DISABLE|FORCE) ROW LEVEL SECURITY\b/)
    expect(migration).not.toContain('EXECUTE pg_catalog.format')
  })

  it('ships the complete validation and guarded recovery manifest', () => {
    for (const name of ['README.md', 'preflight.sql', 'postflight.sql', 'recovery.sql']) {
      expect(() => readFileSync(join(validationRoot, name), 'utf8')).not.toThrow()
    }
    const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
    const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
    const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
    expect(preflight).toContain('SET TRANSACTION READ ONLY')
    expect(postflight).toContain('SET TRANSACTION READ ONLY')
    expect(`${preflight}\n${postflight}`).not.toContain('pg_catalog.current_user')
    expect(recovery).toContain('sql148_recovery_drift')
    expect(recovery).toContain('DROP FUNCTION IF EXISTS public.teskeid_event_list_person_source_events_v1')
    expect(recovery).toContain('DROP FUNCTION IF EXISTS public.teskeid_event_get_person_source_roster_v1')
  })
})
