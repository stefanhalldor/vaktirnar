import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql157Bytes = readFileSync(
  join(root, 'sql/157_event_expense_link_visibility.sql'),
)
const sql157 = sql157Bytes.toString('utf8').replaceAll('\r\n', '\n')
const migration = readFileSync(
  join(root, 'sql/158_event_expense_activity_v3.sql'),
  'utf8',
).replaceAll('\r\n', '\n')
const validationRoot = join(
  root,
  'sql/validation/158-event-expense-activity-v3',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
  .replaceAll('\r\n', '\n')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
  .replaceAll('\r\n', '\n')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
  .replaceAll('\r\n', '\n')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function functionBody(source: string, name: string): string {
  const pattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?`
      + `AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  )
  const match = source.match(pattern)
  expect(match, name).not.toBeNull()
  return match?.[1] ?? ''
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

function gitBlobSha1(value: Buffer): string {
  const header = Buffer.from(`blob ${value.length}\0`, 'utf8')
  return createHash('sha1').update(header).update(value).digest('hex')
}

function removeV3DetailTargetAdditions(body: string): string {
  const targetCteStart = body.indexOf(
    '  ), detail_targets AS MATERIALIZED (',
  )
  const expensesCteStart = body.indexOf(
    '  ), expenses_json AS MATERIALIZED (',
    targetCteStart,
  )
  expect(targetCteStart).toBeGreaterThan(-1)
  expect(expensesCteStart).toBeGreaterThan(targetCteStart)

  let normalized = body.slice(0, targetCteStart)
    + body.slice(expensesCteStart)
  const targetProperty = [
    "        'currency', detail.currency,",
    "        'detail_target', CASE",
    '          WHEN COALESCE(target.can_open_detail, false)',
    '            THEN pg_catalog.jsonb_build_object(',
    "              'expense_id', detail.expense_id",
    '            )',
    "          ELSE 'null'::jsonb",
    '        END',
  ].join('\n')
  expect(normalized).toContain(targetProperty)
  normalized = normalized.replace(
    targetProperty,
    "        'currency', detail.currency",
  )

  const targetJoin = [
    '    LEFT JOIN detail_targets AS target',
    '      ON target.group_id = detail.group_id',
    '     AND target.expense_id = detail.expense_id',
  ].join('\n')
  expect(normalized).toContain(targetJoin)
  return normalized.replace(`${targetJoin}\n`, '')
}

describe('SQL158 Event expense activity V3', () => {
  it('keeps the released SQL157 source byte-exact and adds one function only', () => {
    expect(createHash('sha256').update(sql157Bytes).digest('hex')).toBe(
      '48e96f7aa5dcb6d61e312a32764904a5985297f5500f960cc1b076a44b41fbb2',
    )
    expect(gitBlobSha1(sql157Bytes)).toBe(
      'b9eb33bb10a8ff114fd37e7eefd37c2c1a8098c6',
    )
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(migration.match(
      /CREATE FUNCTION public\.teskeid_event_get_expense_activity_v3\(/g,
    )).toHaveLength(1)
    expect(migration).not.toMatch(
      /CREATE FUNCTION public\.teskeid_event_get_expense_activity_v2\(/,
    )
    expect(migration).not.toMatch(
      /(?:ALTER FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION)\s+public\.teskeid_event_get_expense_activity_v2/,
    )
    expect(migration).not.toMatch(
      /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|POLICY)\b/i,
    )
    expect(migration).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+public\./i,
    )
    expect(migration).not.toMatch(
      /(?:ENABLE|DISABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/i,
    )
    expect(migration).not.toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('preserves the exact V2 body except for the bounded V3 target additions', () => {
    const v2Body = functionBody(
      sql157,
      'teskeid_event_get_expense_activity_v2',
    )
    const v3Body = functionBody(
      migration,
      'teskeid_event_get_expense_activity_v3',
    )
    expect(md5(v2Body)).toBe('d5422fcda5e1ce93aeb08a4f2c9db91a')
    expect(removeV3DetailTargetAdditions(v3Body)).toBe(v2Body)
  })

  it('freezes argument semantics and the exact service-role app ACL', () => {
    const definition = migration.slice(
      migration.indexOf(
        'CREATE FUNCTION public.teskeid_event_get_expense_activity_v3(',
      ),
      migration.indexOf('AS $function$', migration.indexOf(
        'CREATE FUNCTION public.teskeid_event_get_expense_activity_v3(',
      )),
    )
    expect(definition).toContain(
      'teskeid_event_get_expense_activity_v3(\n'
        + '  p_actor_id uuid,\n'
        + '  p_event_id uuid\n'
        + ')',
    )
    expect(definition).toContain('RETURNS jsonb')
    expect(definition).toContain('LANGUAGE plpgsql')
    expect(definition).toContain('VOLATILE')
    expect(definition).toContain('SECURITY DEFINER')
    expect(definition).toContain("SET search_path = ''")

    const v3Body = functionBody(
      migration,
      'teskeid_event_get_expense_activity_v3',
    )
    const v3Hash = md5(v3Body)
    expect(v3Hash).toBe('ff9ce0a060d5e7c713907881da621f70')
    for (const source of [preflight, postflight, recovery]) {
      expect(source).toContain(v3Hash)
      expect(source).toContain(
        "'p_actor_id uuid, p_event_id uuid'",
      )
      expect(source).toContain('pg_catalog.pg_get_function_arguments')
    }

    expect(migration).toMatch(
      /ALTER FUNCTION public\.teskeid_event_get_expense_activity_v3\(uuid,uuid\)\s+OWNER TO postgres;/,
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.teskeid_event_get_expense_activity_v3\(uuid,uuid\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.teskeid_event_get_expense_activity_v3\(uuid,uuid\)\s+TO service_role;/,
    )
    expect(migration).not.toMatch(/\bTO (?:PUBLIC|anon|authenticated)\b/)
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('pg_catalog.aclexplode')
      expect(source).toContain('privilege.grantee = 0')
      expect(source).toContain('privilege.is_grantable')
      expect(source).toContain("grantee.rolname = 'service_role'")
    }
  })

  it('determines visibility before exact same-row detail authority', () => {
    const body = functionBody(
      migration,
      'teskeid_event_get_expense_activity_v3',
    )
    const visibleStart = body.indexOf('visible_candidates AS MATERIALIZED')
    const visibleCountStart = body.indexOf('visible_count AS MATERIALIZED')
    const projectionGateStart = body.indexOf('projection_gate AS MATERIALIZED')
    const targetStart = body.indexOf('detail_targets AS MATERIALIZED')
    const expensesStart = body.indexOf('expenses_json AS MATERIALIZED')
    expect(visibleStart).toBeGreaterThan(-1)
    expect(visibleStart).toBeLessThan(body.indexOf('expense.total_minor'))
    expect(visibleStart).toBeLessThan(visibleCountStart)
    expect(visibleCountStart).toBeLessThan(projectionGateStart)
    expect(projectionGateStart).toBeLessThan(targetStart)
    expect(targetStart).toBeLessThan(expensesStart)
    expect(body).toContain('LIMIT 101')
    expect(body).toContain('visible_count.value BETWEEN 1 AND 100')
    expect(body).toContain("link.visibility = 'all_event'")
    expect(body).toContain("link.visibility = 'participants_only'")

    const target = body.slice(targetStart, expensesStart)
    expect(target).toContain('FROM projection_gate AS gate')
    expect(target).toContain('JOIN visible_detail AS detail')
    expect(target).toContain('gate.can_project AND detail.is_valid')
    expect(target).toContain(
      'detail_member.group_id = detail.group_id',
    )
    expect(target).toContain('detail_member.user_id = p_actor_id')
    expect(target).toContain("detail_member.status = 'active'")
    expect(target).not.toContain('expense_claim_disputes')

    const expenses = body.slice(
      expensesStart,
      body.indexOf('position_inputs AS MATERIALIZED'),
    )
    expect(expenses).toContain("'detail_target', CASE")
    expect(expenses).toContain("'expense_id', detail.expense_id")
    expect(expenses).toContain("ELSE 'null'::jsonb")
    expect(expenses).toContain('LEFT JOIN detail_targets AS target')
    expect(expenses).toContain('target.group_id = detail.group_id')
    expect(expenses).toContain(
      'target.expense_id = detail.expense_id',
    )
    expect(expenses).not.toMatch(/href/i)

    const participantsVisibility = body.slice(visibleStart, visibleCountStart)
    expect(participantsVisibility).toContain('expense_claim_disputes')
    expect(participantsVisibility).toContain(
      'dispute.expense_id = link.expense_id',
    )
    expect(body).toContain("'status', 'unavailable'")
    expect(body).toContain('INTO v_revalidated_scope, v_result')
  })

  it('ships lost-response-aware read-only validation and bounded recovery', () => {
    for (const validator of [preflight, postflight]) {
      expect(validator.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(validator).toContain('SET TRANSACTION READ ONLY;')
      expect(validator.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(validator).not.toMatch(/^COMMIT;$/gm)
      expect(validator.trimEnd().endsWith('ROLLBACK;')).toBe(true)
      expect(validator).not.toMatch(
        /^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/gim,
      )
      expect(validator).not.toMatch(
        /\b(?:FROM|JOIN)\s+(?:public|auth)\./i,
      )
    }
    expect(preflight).toContain('v3_absent')
    expect(preflight).toContain('v3_exact_installed')
    expect(preflight).toContain('v3_collision')
    expect(preflight).toContain('AS prerequisites_ok')
    expect(postflight).toContain('predecessor_v2_exact')
    expect(postflight).toContain('activity_v3_exact')
    expect(postflight).toContain('AS postconditions_ok')
    expect(readme).toContain('possible successful')
    expect(readme).toContain('do not rerun the migration')

    expect(recovery.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(recovery.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(recovery).toContain('rollback the app from V3 to V2')
    expect(recovery.match(
      /DROP FUNCTION public\.teskeid_event_get_expense_activity_v3\(uuid,uuid\);/g,
    )).toHaveLength(1)
    expect(recovery).not.toMatch(
      /DROP FUNCTION public\.teskeid_event_get_expense_activity_v2/,
    )
    expect(recovery).not.toMatch(/\bCASCADE\b/i)
    expect(recovery).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|ALTER TABLE|DROP TABLE)\b/i,
    )
    const recoveryV2Gate = recovery.slice(
      recovery.indexOf(")) = 'd5422fcda5e1ce93aeb08a4f2c9db91a'"),
      recovery.indexOf(
        "RAISE EXCEPTION 'teskeid_event_sql158_recovery_predecessor_drift'",
      ),
    )
    expect(recoveryV2Gate).toContain('pg_catalog.aclexplode')
    expect(recoveryV2Gate).toContain('privilege.grantee = 0')
    expect(recoveryV2Gate).toContain("grantee.rolname = 'service_role'")
    expect(readme).toContain('Roll the application back from V3')
    expect(readme).toContain('separate explicit approval')
    expect(readme).toContain('PostgREST schema cache')
    expect(readme).toContain('No SQL in this package was run by Codex')
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).not.toContain("NOTIFY pgrst, 'reload schema'")
    }
  })

  it('keeps declared PostgreSQL identifiers within the 63-byte limit', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(0)
    expect(Math.max(...identifiers.map(
      (identifier) => Buffer.byteLength(identifier, 'utf8'),
    ))).toBeLessThanOrEqual(63)
  })
})
