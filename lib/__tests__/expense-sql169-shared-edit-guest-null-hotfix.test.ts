import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const normalize = (value: string) => value.replace(/\r\n/g, '\n')
const read = (path: string) => normalize(readFileSync(path, 'utf8'))
const readOptional = (path: string) => existsSync(path) ? read(path) : ''
const md5 = (value: string) => createHash('md5').update(value).digest('hex')

function bodyAfter(source: string, declaration: string): string {
  const declarationStart = source.indexOf(declaration)
  expect(declarationStart, declaration).toBeGreaterThanOrEqual(0)
  const marker = 'AS $function$'
  const bodyStart = source.indexOf(marker, declarationStart)
  expect(bodyStart, `${declaration} body start`).toBeGreaterThan(declarationStart)
  const contentStart = bodyStart + marker.length
  const bodyEnd = source.indexOf('$function$;', contentStart)
  expect(bodyEnd, `${declaration} body end`).toBeGreaterThan(contentStart)
  return source.slice(contentStart, bodyEnd)
}

function withoutFunctionBodies(source: string): string {
  return source.replace(/AS \$function\$[\s\S]*?\$function\$;/g, 'AS $function$<body>$function$;')
}

type SqlBoolean = boolean | null

function sqlEquals(left: string | null, right: string): SqlBoolean {
  return left === null ? null : left === right
}

function sqlOr(left: SqlBoolean, right: SqlBoolean): SqlBoolean {
  if (left === true || right === true) return true
  if (left === null || right === null) return null
  return false
}

const sql168 = read('sql/168_expense_confirmed_edit_revision_lifecycle.sql')
const declaration = 'CREATE OR REPLACE FUNCTION public.expense_share_edit_revision_v1('
const predecessor = bodyAfter(sql168, declaration)
const openEditBody = bodyAfter(
  sql168,
  'CREATE OR REPLACE FUNCTION public.expense_open_edit_revision_v1(',
)
const target = predecessor
  .replace(
    'pg_catalog.btrim(member.display_name), member.user_id = p_actor_id,',
    'pg_catalog.btrim(member.display_name), COALESCE(member.user_id = p_actor_id, false),',
  )
  .replace(
    '          OR member.user_id = p_actor_id,',
    '          OR COALESCE(member.user_id = p_actor_id, false),',
  )

const sql169Path = 'sql/169_expense_shared_edit_guest_boolean_hotfix.sql'
const validationPath = 'sql/validation/169-expense-shared-edit-guest-boolean-hotfix'
const migration = readOptional(sql169Path)
const preflight = readOptional(`${validationPath}/preflight.sql`)
const postflight = readOptional(`${validationPath}/postflight.sql`)
const recovery = readOptional(`${validationPath}/recovery.sql`)
const readme = readOptional(`${validationPath}/README.md`)

describe('SQL169 shared edit guest boolean hotfix', () => {
  it('reconstructs the exact installed predecessor and two-expression target', () => {
    expect(md5(predecessor)).toBe('3314017996b86c4cda29ef1c3b36a1f2')
    expect(md5(target)).toBe('23ffdadcbb51a19fa1e2432e0ee4b402')
    expect(target).not.toBe(predecessor)
    expect(target.split('COALESCE(member.user_id = p_actor_id, false)')).toHaveLength(3)
    expect(target).toContain('member.user_id = p_actor_id\n      OR v_draft.payload')
  })

  it('proves the predecessor can emit NULL and the target makes guest roles total', () => {
    const actorId = 'actor'
    const registeredActor = sqlEquals(actorId, actorId)
    const registeredOther = sqlEquals('other', actorId)
    const guest = sqlEquals(null, actorId)

    expect(registeredActor).toBe(true)
    expect(registeredOther).toBe(false)
    expect(guest).toBeNull()
    expect(guest ?? false).toBe(false)
    expect(sqlOr(true, guest)).toBe(true)
    expect(sqlOr(false, guest)).toBeNull()
    expect(sqlOr(false, guest ?? false)).toBe(false)
  })

  it('adds a complete, clearly labelled SQL169 operator bundle', () => {
    for (const artifact of [migration, preflight, postflight, recovery, readme]) {
      expect(artifact.length).toBeGreaterThan(0)
    }
    expect(migration.trimStart().startsWith('-- SQL169 MIGRATION:')).toBe(true)
    expect(preflight.trimStart().startsWith('-- SQL169 PREFLIGHT:')).toBe(true)
    expect(postflight.trimStart().startsWith('-- SQL169 POSTFLIGHT:')).toBe(true)
    expect(recovery.trimStart().startsWith('-- SQL169 RECOVERY:')).toBe(true)
    expect(readme).toContain('Localhost checks for Stebbi')
  })

  it('replaces only the shared edit helper body and preserves its security contract', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(bodyAfter(migration, declaration)).toBe(target)
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('ALTER FUNCTION public.expense_share_edit_revision_v1')
    expect(migration).toContain('OWNER TO postgres')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.expense_share_edit_revision_v1')
    expect(migration).toContain('TO service_role')
    const operatorSql = withoutFunctionBodies(migration)
    expect(operatorSql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\s+public\./im)
    expect(operatorSql).not.toMatch(/^\s*(CREATE|ALTER|DROP)\s+TABLE\b/im)
  })

  it('keeps null-user guests out of authenticated publication audience', () => {
    expect(target).toContain('AND member.user_id IS NOT NULL')
    expect(target).toContain('AND member.user_id <> p_actor_id')
    expect(target).toContain("VALUES (p_draft_id, p_actor_id, 'author', NULL, NULL, NULL)")
  })

  it('keeps private open separate from the shared publication helper', () => {
    const sharedGuard = openEditBody.indexOf("IF p_mode = 'shared' THEN")
    const shareCall = openEditBody.indexOf('public.expense_share_edit_revision_v1(', sharedGuard)
    const guardEnd = openEditBody.indexOf('END IF;', shareCall)
    expect(sharedGuard).toBeGreaterThanOrEqual(0)
    expect(shareCall).toBeGreaterThan(sharedGuard)
    expect(guardEnd).toBeGreaterThan(shareCall)
    expect(openEditBody.split('public.expense_share_edit_revision_v1(')).toHaveLength(2)
  })

  it('classifies exact predecessor, exact target and all other states fail-closed', () => {
    for (const artifact of [migration, preflight]) {
      expect(artifact).toContain('3314017996b86c4cda29ef1c3b36a1f2')
      expect(artifact).toContain('23ffdadcbb51a19fa1e2432e0ee4b402')
      expect(artifact).toContain('PREDECESSOR_READY')
      expect(artifact).toContain('EXACT_INSTALLED')
      expect(artifact).toContain('STOP_PARTIAL_OR_PREDECESSOR_DRIFT')
    }
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('source_hash_exact')
    expect(postflight).toContain('null_safe_boolean_count_exact')
  })

  it('validates exact metadata, ACL and direct dependencies before and after mutation', () => {
    for (const artifact of [migration, preflight, postflight, recovery]) {
      for (const token of [
        'pg_catalog.pg_get_function_arguments',
        'pg_catalog.pg_get_function_result',
        'pg_catalog.aclexplode',
        'pg_catalog.has_function_privilege',
        'pg_catalog.pg_depend',
        'service_role',
        'authenticated',
        'anon',
      ]) expect(artifact).toContain(token)
    }
  })

  it('does not modify data, schema, RLS, payments, shares or settlement contracts', () => {
    const bundle = [migration, preflight, postflight, recovery].join('\n')
    expect(bundle).not.toMatch(/^\s*(CREATE|ALTER|DROP)\s+TABLE\b/im)
    expect(bundle).not.toMatch(/CREATE POLICY|DROP POLICY|ENABLE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY/i)
    expect(bundle).not.toMatch(/UPDATE\s+public\.expenses|DELETE\s+FROM\s+public\.expenses/i)
    expect(bundle).not.toMatch(/UPDATE\s+public\.expense_(payments|shares|repayments)/i)
    expect(bundle).not.toMatch(/DELETE\s+FROM\s+public\.expense_(payments|shares|repayments)/i)
    expect(bundle).not.toContain('pg_catalog.coalesce(')
    expect(bundle).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
  })

  it('makes operator validation read-only and recovery an explicit guarded predecessor restore', () => {
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(postflight).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(preflight.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(postflight.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(recovery).toContain('SELECT pg_catalog.pg_advisory_xact_lock(104169);')
    expect(recovery).toContain('CREATE OR REPLACE FUNCTION public.expense_share_edit_revision_v1')
    expect(bodyAfter(recovery, declaration)).toBe(predecessor)
    expect(withoutFunctionBodies(recovery)).not.toMatch(/DELETE\s+FROM|TRUNCATE|DROP TABLE/i)
  })
})
