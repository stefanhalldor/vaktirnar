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
  join(root, 'sql/150_event_actor_view_time_format_hotfix.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/150-event-actor-view-time-format-hotfix',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const diagnostic = readFileSync(join(validationRoot, 'diagnostic.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

const predecessorMd5 = 'eb2da9a9c2c0463f76636ded02a6747a'
const targetMd5 = 'df539138c44252719575a9d0d090968b'

function body(source: string, marker: string): string {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = source.indexOf('AS $function$', start) + 'AS $function$'.length
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyStart).toBeGreaterThan('AS $function$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

describe('SQL150 Event actor-view time-format hotfix', () => {
  it('characterizes the exact SQL149 runtime defect without editing SQL149', () => {
    expect(createHash('sha256').update(sql149, 'utf8').digest('hex')).toBe(
      '2fd5f001038a3ecb24133c5c424fe5eda02850603ee54aaf283b5b8287aeef39',
    )
    const predecessor = body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_get_actor_view_v2(',
    )
    expect(md5(predecessor)).toBe(predecessorMd5)
    expect(predecessor).toContain(
      "pg_catalog.to_char(details.event_time, 'HH24:MI:SS')",
    )
    expect(predecessor).not.toContain("date '2000-01-01' + details.event_time")
  })

  it('replaces exactly one function body and formats a supported timestamp input', () => {
    expect(migration.match(/^CREATE OR REPLACE FUNCTION /gm)).toHaveLength(1)
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.teskeid_event_get_actor_view_v2(',
    )
    const target = body(
      migration,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_get_actor_view_v2(',
    )
    expect(md5(target)).toBe(targetMd5)
    expect(target).toContain("date '2000-01-01' + details.event_time")
    expect(target).not.toContain(
      "pg_catalog.to_char(details.event_time, 'HH24:MI:SS')",
    )
    expect(target.replace(
      /pg_catalog\.to_char\(\s*date '2000-01-01' \+ details\.event_time, 'HH24:MI:SS'\s*\)/,
      "pg_catalog.to_char(details.event_time, 'HH24:MI:SS')",
    )).toBe(body(
      sql149,
      'CREATE FUNCTION public.teskeid_event_get_actor_view_v2(',
    ))
  })

  it('is transactional, bounded and makes no table, data, trigger, RLS or policy change', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'")
    expect(migration).toContain("SET LOCAL statement_timeout = '60s'")
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock(15001)')
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|DROP) TABLE\b/)
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|DROP) (?:TRIGGER|POLICY|INDEX)\b/)
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')
    expect(migration).not.toContain('auth.users')
    expect(migration).not.toContain('expense_')
  })

  it('seals the exact predecessor/replay state and all direct helper bodies', () => {
    for (const source of [migration, preflight]) {
      expect(source).toContain(predecessorMd5)
      expect(source).toContain(targetMd5)
    }
    for (const hash of [
      'd118ab08bc0346cdf31519344a2f65a7',
      '7017190619681901af3813e1fc3b305c',
      'b57bf9fa43754dfcd05cb7e063829bc6',
      '211fbfb65b4edaa4b0307c2fb5878a60',
      '2eb6db6c327de83f1bf241f9368c3a0c',
    ]) {
      expect(migration).toContain(hash)
      expect(preflight).toContain(hash)
      expect(postflight).toContain(hash)
    }
    expect(migration).not.toContain('__SQL150_')
  })

  it('preserves the exact SECURITY DEFINER and service-role-only boundary', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('procedure_row.prosecdef')
      expect(source).toContain("procedure_row.proconfig = ARRAY['search_path=\"\"']::text[]")
      expect(source).toContain("'service_role'")
      expect(source).toContain("'anon'")
      expect(source).toContain("'authenticated'")
    }
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('TO service_role')
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/)
  })

  it('executes constant edge formatting checks in migration and postflight', () => {
    expect(migration).toContain("date '2000-01-01' + time '04:05:06'")
    expect(postflight).toContain("time '00:00:00'")
    expect(postflight).toContain("time '04:05:06'")
    expect(postflight).toContain("time '23:59:59'")
    expect(postflight).toContain('time_formatter_edges_ok')
  })

  it('keeps preflight and postflight read-only', () => {
    for (const source of [preflight, postflight, diagnostic]) {
      expect(source.trimStart()).toMatch(/^-- SQL150/)
      expect(source).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/)
      expect(source).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
      expect(source).not.toContain('BEGIN;')
      expect(source).not.toContain('COMMIT;')
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(preflight).toContain('SELECT *,')
    expect(postflight).toContain('SELECT *,')
    expect(preflight).not.toContain('SELECT metrics.*')
    expect(postflight).not.toContain('SELECT metrics.*')
    expect(diagnostic).toContain('normalized_source_md5')
    expect(diagnostic).not.toMatch(/\b(?:event_id|user_id|email)\b/)
  })

  it('normalizes SQL Editor CRLF catalog bodies before every MD5 comparison', () => {
    for (const source of [migration, preflight, postflight, recovery, diagnostic]) {
      expect(source).toContain("procedure_row.prosrc, E'\\r\\n', E'\\n'")
      expect(source).not.toMatch(/md5\(procedure_row\.prosrc\)/)
      expect(source).not.toMatch(/md5\(prosrc\)/)
    }
    expect(readme).toContain('normalize SQL Editor CRLF')
  })

  it('uses only exact 32-character hexadecimal MD5 literals', () => {
    for (const source of [migration, preflight, postflight, recovery, diagnostic]) {
      const md5Literals = [...source.matchAll(/'([0-9a-f]+)'/g)]
        .map((match) => match[1])
        .filter((value) => value.length >= 30)
      expect(md5Literals.length).toBeGreaterThan(0)
      expect(md5Literals.every((value) => /^[0-9a-f]{32}$/.test(value))).toBe(true)
    }
  })

  it('provides a guarded exact recovery with no destructive cascade', () => {
    const restored = body(
      recovery,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_get_actor_view_v2(',
    )
    expect(md5(restored)).toBe(predecessorMd5)
    expect(recovery).toContain(targetMd5)
    expect(recovery).toContain(predecessorMd5)
    expect(recovery).not.toContain('CASCADE')
    expect(recovery).not.toMatch(/\bDROP\b/)
    expect(recovery).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/)
  })

  it('documents the manual gate and forbids routine recovery after success', () => {
    expect(readme).toContain('Run each file separately')
    expect(readme).toContain('preflight.sql')
    expect(readme).toContain('150_event_actor_view_time_format_hotfix.sql')
    expect(readme).toContain('postflight.sql')
    expect(readme).toContain('`diagnostic.sql`')
    expect(readme).toContain('Do not run `recovery.sql` after a green')
    expect(readme).toContain('controlling successor attestation')
    expect(readme).toContain('did not execute any SQL')
  })
})
