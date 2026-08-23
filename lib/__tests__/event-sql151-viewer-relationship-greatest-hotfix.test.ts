import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql149 = readFileSync(
  join(root, 'sql/149_event_participant_identity_display.sql'),
  'utf8',
)
const sql150 = readFileSync(
  join(root, 'sql/150_event_actor_view_time_format_hotfix.sql'),
  'utf8',
)
const migration = readFileSync(
  join(root, 'sql/151_event_viewer_relationship_greatest_hotfix.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/151-event-viewer-relationship-greatest-hotfix',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

const predecessorMd5 = 'ad66614815b29a02ee3dc928c17886c3'
const targetMd5 = 'cfb3afa33af8fd230e6c26930424387f'
const sql150ActorViewMd5 = 'df539138c44252719575a9d0d090968b'

function body(source: string, marker: string): string {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = source.indexOf('AS $function$', start)
    + 'AS $function$'.length
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyStart).toBeGreaterThan('AS $function$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

describe('SQL151 Event viewer relationship GREATEST hotfix', () => {
  it('characterizes the exact frozen SQL149 runtime defect', () => {
    expect(createHash('sha256').update(sql149, 'utf8').digest('hex')).toBe(
      '2fd5f001038a3ecb24133c5c424fe5eda02850603ee54aaf283b5b8287aeef39',
    )
    const predecessor = body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_viewer_relationship_v2(',
    )
    expect(md5(predecessor)).toBe(predecessorMd5)
    expect(predecessor.match(/pg_catalog\.greatest\(/g)).toHaveLength(1)
    expect(predecessor).not.toContain('pg_catalog.least(')
  })

  it('preserves the applied SQL150 actor-view successor boundary', () => {
    const actorView = body(
      sql150,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_get_actor_view_v2(',
    )
    expect(md5(actorView)).toBe(sql150ActorViewMd5)
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain(sql150ActorViewMd5)
      expect(source).toContain(
        'public.teskeid_event_get_actor_view_v2(uuid,uuid)',
      )
      expect(source).toContain(
        "overload.proname = 'teskeid_event_get_actor_view_v2'",
      )
      expect(source).toContain("procedure_row.provolatile = 'v'")
      expect(source).toContain("'service_role'")
      expect(source).toContain("'anon'")
      expect(source).toContain("'authenticated'")
    }
  })

  it('replaces exactly one function body with the one-token correction', () => {
    expect(migration.match(/^CREATE OR REPLACE FUNCTION /gm)).toHaveLength(1)
    const target = body(
      migration,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_private_viewer_relationship_v2(',
    )
    expect(md5(target)).toBe(targetMd5)
    expect(target.match(/\bGREATEST\(/g)).toHaveLength(1)
    expect(target).not.toContain('pg_catalog.greatest(')
    expect(target).not.toContain('pg_catalog.least(')
    expect(target.replace('GREATEST(', 'pg_catalog.greatest(')).toBe(body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_viewer_relationship_v2(',
    ))
  })

  it('is transactional, bounded and shares the exact SQL150 lineage lock', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'")
    expect(migration).toContain("SET LOCAL statement_timeout = '60s'")
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock(15001)')
    expect(recovery).toContain('pg_catalog.pg_advisory_xact_lock(15001)')
    for (const source of [migration, recovery, readme]) {
      expect(source).not.toContain('15101')
    }
  })

  it('changes no table, data, trigger, index, RLS, auth or Expense state', () => {
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|DROP) TABLE\b/)
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
    expect(migration).not.toMatch(
      /\b(?:CREATE|ALTER|DROP) (?:TRIGGER|POLICY|INDEX)\b/,
    )
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('auth.users')
    expect(migration).not.toContain('expense_')
  })

  it('seals predecessor, replay, target and every direct dependency body', () => {
    for (const source of [migration, preflight]) {
      expect(source).toContain(predecessorMd5)
      expect(source).toContain(targetMd5)
    }
    for (const source of [migration, preflight, postflight, recovery]) {
      for (const hash of [
        sql150ActorViewMd5,
        '2eb6db6c327de83f1bf241f9368c3a0c',
        'dd6d4f6b57c109fb46d6992ce66462e8',
        'd42c11caf87eaac45646535539029977',
        'd118ab08bc0346cdf31519344a2f65a7',
        '3e64bc04485bc06cc544f59f46a2fb0e',
        '28c80b083a90683f15fd04f4d7d547d1',
      ]) {
        expect(source).toContain(hash)
      }
    }
    expect(migration).not.toContain('__SQL151_')
  })

  it('preserves the exact private SECURITY DEFINER boundary', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('procedure_row.prosecdef')
      expect(source).toContain(
        "procedure_row.proconfig = ARRAY['search_path=\"\"']::text[]",
      )
      expect(source).toContain('procedure_row.provolatile')
    }
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).not.toMatch(/GRANT EXECUTE/)
  })

  it('keeps preflight and postflight read-only and reports one final row', () => {
    for (const source of [preflight, postflight]) {
      expect(source.trimStart()).toMatch(/^-- SQL151/)
      expect(source).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/)
      expect(source).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
      expect(source).not.toContain('BEGIN;')
      expect(source).not.toContain('COMMIT;')
      expect(source).toContain('SELECT *,')
      expect(source).not.toContain('SELECT metrics.*')
      expect(source).toContain('sql150_boundary_exact_ok')
      expect(source).toContain('dependency_mismatches')
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
  })

  it('normalizes SQL Editor CRLF catalog bodies before every MD5 comparison', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain("procedure_row.prosrc, E'\\r\\n', E'\\n'")
      expect(source).not.toMatch(/md5\(procedure_row\.prosrc\)/)
      expect(source).not.toMatch(/md5\(prosrc\)/)
    }
  })

  it('uses only exact 32-character hexadecimal MD5 literals', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      const md5Literals = [...source.matchAll(/'([0-9a-f]+)'/g)]
        .map((match) => match[1])
        .filter((value) => value.length >= 30)
      expect(md5Literals.length).toBeGreaterThan(0)
      expect(md5Literals.every((value) => /^[0-9a-f]{32}$/.test(value)))
        .toBe(true)
    }
  })

  it('provides guarded exact recovery without data writes or destructive DDL', () => {
    const restored = body(
      recovery,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_private_viewer_relationship_v2(',
    )
    expect(md5(restored)).toBe(predecessorMd5)
    expect(recovery).toContain(targetMd5)
    expect(recovery).toContain(predecessorMd5)
    expect(recovery).toContain('sql151_recovery_sql150_boundary_mismatch')
    expect(recovery).toContain(
      'sql151_recovery_postflight_sql150_boundary_mismatch',
    )
    expect(recovery).not.toContain('CASCADE')
    expect(recovery).not.toMatch(/\bDROP\b/)
    expect(recovery).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
  })

  it('documents the manual SQL gate and that Codex did not execute SQL', () => {
    expect(readme).toContain('Run each file separately')
    expect(readme).toContain('preflight.sql')
    expect(readme).toContain(
      '151_event_viewer_relationship_greatest_hotfix.sql',
    )
    expect(readme).toContain('postflight.sql')
    expect(readme).toContain('Do not run `recovery.sql` after a green')
    expect(readme).toContain('did not execute SQL')
  })
})
