import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql149 = readFileSync(
  join(root, 'sql/149_event_participant_identity_display.sql'),
  'utf8',
)
const migration = readFileSync(
  join(root, 'sql/152_event_people_is_self_boolean_hotfix.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/152-event-people-is-self-boolean-hotfix',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')
const contracts = readFileSync(
  join(root, 'lib/events/participant-identity-v2.contracts.ts'),
  'utf8',
)

const predecessorMd5 = '2eb6db6c327de83f1bf241f9368c3a0c'
const targetMd5 = '7a41340baed779873454dff86889ea9b'

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

describe('SQL152 Event people is_self boolean hotfix', () => {
  it('characterizes the exact frozen SQL149 nullable-boolean defect', () => {
    expect(createHash('sha256').update(sql149, 'utf8').digest('hex')).toBe(
      '2fd5f001038a3ecb24133c5c424fe5eda02850603ee54aaf283b5b8287aeef39',
    )
    const predecessor = body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_people_projection_v2(',
    )
    expect(md5(predecessor)).toBe(predecessorMd5)
    expect(predecessor).toContain(
      'guest_position.recipient_user_id = p_actor_id',
    )
    expect(predecessor).not.toContain(
      'COALESCE(guest_position.recipient_user_id = p_actor_id, false)',
    )
  })

  it('replaces exactly one function with the one-expression correction', () => {
    expect(migration.match(/^CREATE OR REPLACE FUNCTION /gm)).toHaveLength(1)
    const target = body(
      migration,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_private_people_projection_v2(',
    )
    expect(md5(target)).toBe(targetMd5)
    expect(target.match(/\bCOALESCE\(/g)).toHaveLength(2)
    expect(target).toContain(
      'COALESCE(guest_position.recipient_user_id = p_actor_id, false)',
    )
    expect(target).not.toContain(
      'pg_catalog.coalesce(guest_position.recipient_user_id = p_actor_id, false)',
    )
    expect(target.replace(
      'COALESCE(guest_position.recipient_user_id = p_actor_id, false)',
      'guest_position.recipient_user_id = p_actor_id',
    )).toBe(body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_private_people_projection_v2(',
    ))
  })

  it('keeps the strict TypeScript boolean boundary fail closed', () => {
    expect(contracts.match(/is_self: z\.boolean\(\),/g)).toHaveLength(2)
    expect(contracts).not.toMatch(/is_self: z\.boolean\(\)\.nullable\(\)/)
    expect(contracts).not.toMatch(/is_self: z\.coerce\.boolean\(\)/)
  })

  it('is transactional, bounded and shares both predecessor locks', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'")
    expect(migration).toContain("SET LOCAL statement_timeout = '60s'")
    expect(migration).toContain(
      "'teskeid:sql149:event-participant-identity-display', 14901",
    )
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock(15001)')
    expect(recovery).toContain(
      "'teskeid:sql149:event-participant-identity-display', 14901",
    )
    expect(recovery).toContain('pg_catalog.pg_advisory_xact_lock(15001)')
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

  it('seals predecessor, replay, target and every direct caller/helper', () => {
    for (const source of [migration, preflight]) {
      expect(source).toContain(predecessorMd5)
      expect(source).toContain(targetMd5)
    }
    for (const source of [migration, preflight, postflight, recovery]) {
      for (const hash of [
        'df539138c44252719575a9d0d090968b',
        '3c689e2f05035a67d58fbb8ca39dcd40',
        'dd6d4f6b57c109fb46d6992ce66462e8',
        'd42c11caf87eaac45646535539029977',
        'cfb3afa33af8fd230e6c26930424387f',
      ]) {
        expect(source).toContain(hash)
      }
    }
    expect(migration).not.toContain('__SQL152_')
  })

  it('preserves the exact private SECURITY DEFINER boundary', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('procedure_row.prosecdef')
      expect(source).toContain(
        "procedure_row.proconfig = ARRAY['search_path=\"\"']::text[]",
      )
      expect(source).toContain("'service_role'")
      expect(source).toContain("'anon'")
      expect(source).toContain("'authenticated'")
    }
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).not.toMatch(/GRANT EXECUTE/)
  })

  it('keeps preflight and postflight read-only with one final row', () => {
    for (const source of [preflight, postflight]) {
      expect(source.trimStart()).toMatch(/^-- SQL152/)
      expect(source).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/)
      expect(source).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
      expect(source).not.toContain('BEGIN;')
      expect(source).not.toContain('COMMIT;')
      expect(source).toContain('SELECT *,')
      expect(source).not.toContain('SELECT metrics.*')
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

  it('provides exact guarded recovery without destructive state changes', () => {
    const restored = body(
      recovery,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_private_people_projection_v2(',
    )
    expect(md5(restored)).toBe(predecessorMd5)
    expect(recovery).toContain(targetMd5)
    expect(recovery).toContain(predecessorMd5)
    expect(recovery).not.toContain('CASCADE')
    expect(recovery).not.toMatch(/\bDROP\b/)
    expect(recovery).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
  })

  it('documents the manual gate and that Codex did not execute SQL', () => {
    expect(readme).toContain('Run each file separately')
    expect(readme).toContain('preflight.sql')
    expect(readme).toContain(
      '152_event_people_is_self_boolean_hotfix.sql',
    )
    expect(readme).toContain('postflight.sql')
    expect(readme).toContain('Do not run `recovery.sql` after a green')
    expect(readme).toContain('controlling successor attestation')
    expect(readme).toContain('SQL149, SQL150 and SQL151 postflights')
    expect(readme).toContain('must not be expected to remain all-green')
    expect(readme).toContain('did not execute SQL')
  })
})
