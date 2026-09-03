import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql170Path = join(
  process.cwd(),
  'sql/170_expense_dashboard_presentations.sql',
)
const sql171Path = join(
  process.cwd(),
  'sql/171_expense_dashboard_json_extract_precedence_hotfix.sql',
)
const readmePath = join(
  process.cwd(),
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/README.md',
)
const runtimeDiagnosticPath = join(
  process.cwd(),
  'sql/validation/170-expense-dashboard-presentations/diagnose-runtime-unavailable-branch.sql',
)
const immutableDiagnosticPath = join(
  process.cwd(),
  'sql/validation/170-expense-dashboard-presentations/diagnose-runtime-unavailable-branch-v236-d915b7c8-operator-copy.sql',
)

const predecessorInnerHash = 'cfaacddc089a3b7231ffbf48fb39bfac'
const predecessorInstalledHash = 'dbf8086df87d9574e29a914c7201257b'
const targetInnerHash = '3696e4c099e8b2c0de407bd880c105ef'
const targetInstalledHash = 'aad418eeda9d6b1dfe073c4109723d88'
const invalidToken = "|| '|' || party.value->>'party_key_hash'"
const correctedToken = "|| '|' || (party.value->>'party_key_hash')"

const normalize = (value: string) => value.replace(/\r\n/g, '\n')
const readRaw = (path: string) => readFileSync(path, 'utf8')
const read = (path: string) => normalize(readRaw(path))
const md5 = (value: string) => createHash('md5').update(value).digest('hex')
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function installedProsrc(source: string): string {
  const match = source.match(
    /CREATE OR REPLACE FUNCTION public\.expense_list_dashboard_presentations_v1\([\s\S]*?\nAS \$function\$([\s\S]*?)\$function\$;/,
  )
  expect(match, 'SQL170 installed pg_proc.prosrc shape').not.toBeNull()
  return match![1]!
}

function exactTokenCount(source: string, token: string): number {
  return source.split(token).length - 1
}

const finalPostconditionTokens = [
  'v_post_oid IS DISTINCT FROM v_oid',
  'NOT COALESCE(v_post_metadata_exact, false)',
  'NOT COALESCE(v_post_acl_exact, false)',
  'NOT COALESCE(v_post_dependencies_exact, false)',
  'v_post_source_hash IS DISTINCT FROM v_target_hash',
  'v_post_invalid_count <> 0',
  'v_post_corrected_count <> 1',
  'v_post_source IS DISTINCT FROM v_target_source',
] as const

function finalPostconditionIsFailClosed(source: string): boolean {
  const block = source.match(
    /IF v_post_oid IS DISTINCT FROM v_oid[\s\S]*?RAISE EXCEPTION 'expense_sql171_postcondition_failed';[\s\S]*?END IF;/,
  )?.[0] ?? ''
  const exactOrChain = new RegExp(
    finalPostconditionTokens
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+OR\\s+'),
  )
  return exactOrChain.test(block)
}

describe('SQL171 dashboard JSON extraction precedence hotfix', () => {
  const sql170 = read(sql170Path)
  const sql171 = read(sql171Path)
  const readme = read(readmePath)
  const predecessorProsrc = installedProsrc(sql170)
  const predecessorInner = predecessorProsrc.slice(1, -1)
  const targetProsrc = predecessorProsrc.replace(invalidToken, correctedToken)
  const targetInner = targetProsrc.slice(1, -1)

  it('derives one exact parenthesization without changing any other body byte', () => {
    expect(predecessorProsrc).toBe(`\n${predecessorInner}\n`)
    expect(md5(predecessorInner)).toBe(predecessorInnerHash)
    expect(md5(predecessorProsrc)).toBe(predecessorInstalledHash)
    expect(exactTokenCount(predecessorProsrc, invalidToken)).toBe(1)
    expect(exactTokenCount(predecessorProsrc, correctedToken)).toBe(0)

    expect(exactTokenCount(targetProsrc, invalidToken)).toBe(0)
    expect(exactTokenCount(targetProsrc, correctedToken)).toBe(1)
    expect(targetProsrc.replace(correctedToken, invalidToken)).toBe(predecessorProsrc)
    expect(md5(targetInner)).toBe(targetInnerHash)
    expect(md5(targetProsrc)).toBe(targetInstalledHash)
    expect(md5(targetProsrc.replace(/\n/g, '\r\n'))).toBe(
      '915cb9ab4520d95bbaccf89f2f62cff5',
    )
    expect(md5(targetProsrc.replace(/\r\n/g, '\n'))).toBe(targetInstalledHash)
    expect(
      md5(targetProsrc.replace(/\n/g, '\r\n').replace(/\r\n/g, '\n')),
    ).toBe(targetInstalledHash)
  })

  it('ships one standalone atomic and fail-closed function-only statement', () => {
    expect(sql171.startsWith('-- SQL171 MIGRATION:')).toBe(true)
    expect(sql171.match(/^DO \$sql171_hotfix\$/gm)).toHaveLength(1)
    expect(sql171.trimEnd().endsWith('$sql171_hotfix$;')).toBe(true)
    expect(sql171).not.toMatch(/^BEGIN;$/gm)
    expect(sql171).not.toMatch(/^COMMIT;$/gm)
    expect(sql171).not.toMatch(/^ROLLBACK;$/gm)
    expect(sql171).not.toMatch(/EXCEPTION\s+WHEN/i)
    expect(sql171).toContain(
      "IF current_user <> 'postgres' OR session_user <> 'postgres' THEN",
    )
    expect(sql171).toContain(
      "pg_catalog.set_config('lock_timeout', '5s', true)",
    )
    expect(sql171).not.toContain("pg_catalog.set_config('statement_timeout'")

    const sql170Lock = sql171.indexOf('pg_catalog.pg_try_advisory_xact_lock(104170)')
    const sql171Lock = sql171.indexOf('pg_catalog.pg_try_advisory_xact_lock(104171)')
    const firstAdmission = sql171.indexOf('SELECT routine.prosrc,')
    const mutation = sql171.indexOf('EXECUTE pg_catalog.format(')
    const postcondition = sql171.indexOf('v_post_oid := pg_catalog.to_regprocedure(')
    expect(sql170Lock).toBeGreaterThan(-1)
    expect(sql171Lock).toBeGreaterThan(sql170Lock)
    expect(firstAdmission).toBeGreaterThan(sql171Lock)
    expect(mutation).toBeGreaterThan(firstAdmission)
    expect(postcondition).toBeGreaterThan(mutation)
    expect(sql171).toContain('expense_sql171_sql170_lock_unavailable')
    expect(sql171).toContain('expense_sql171_lock_unavailable')
  })

  it('admits only the exact SQL170 predecessor or the exact SQL171 target', () => {
    expect(sql171).toContain(`v_predecessor_hash constant text := '${predecessorInstalledHash}'`)
    expect(sql171).toContain(`v_target_hash constant text := '${targetInstalledHash}'`)
    expect(sql171).toContain(`v_invalid_token constant text := '${invalidToken.replaceAll("'", "''")}'`)
    expect(sql171).toContain(`v_corrected_token constant text := '${correctedToken.replaceAll("'", "''")}'`)
    expect(sql171).toContain("v_state := 'PREDECESSOR_READY'")
    expect(sql171).toContain("v_state := 'EXACT_INSTALLED'")
    expect(sql171).toContain('expense_sql171_partial_or_predecessor_drift')
    expect(sql171).toContain('expense_sql171_target_derivation_failed')
    expect(sql171).toContain('expense_sql171_postcondition_failed')
    expect(sql171.match(
      /pg_catalog\.md5\(pg_catalog\.replace\(routine\.prosrc, E'\\r\\n', E'\\n'\)\)/g,
    )).toHaveLength(2)
    expect(sql171).toContain(
      "pg_catalog.md5(pg_catalog.replace(v_target_source, E'\\r\\n', E'\\n'))",
    )
    expect(sql171).toMatch(
      /pg_catalog\.replace\(v_target_source, v_corrected_token, v_invalid_token\)\s+IS DISTINCT FROM v_source/,
    )
  })

  it('preserves the exact function metadata, ACL and direct dependencies', () => {
    const mutationStart = sql171.indexOf('EXECUTE pg_catalog.format(')
    const postconditionStart = sql171.indexOf(
      'v_post_oid := pg_catalog.to_regprocedure(',
    )
    const precondition = sql171.slice(0, mutationStart)
    const postcondition = sql171.slice(postconditionStart)
    expect(mutationStart).toBeGreaterThan(-1)
    expect(postconditionStart).toBeGreaterThan(mutationStart)

    for (const token of [
      "routine.prokind = 'f'",
      'routine.pronargs = 1',
      "routine.proargnames = ARRAY['p_actor_id']::text[]",
      'routine.proargmodes IS NULL',
      "pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'",
      "pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'",
      "routine.provolatile = 'v'::\"char\"",
      'routine.prosecdef',
      'NOT routine.proisstrict',
      'NOT routine.proleakproof',
      "routine.proparallel = 'u'::\"char\"",
      'routine.pronargdefaults = 0',
      'routine.proargdefaults IS NULL',
      'routine.proallargtypes IS NULL',
      'routine.provariadic = 0::oid',
      'routine.procost = 100',
      'routine.prorows = 0',
      'routine.prosupport = 0::oid',
      'routine.protrftypes IS NULL',
      'routine.probin IS NULL',
      'routine.prosqlbody IS NULL',
      "routine.proconfig = ARRAY['search_path=\"\"']::text[]",
      "language_row.lanname = 'plpgsql'",
      "owner_role.rolname = 'postgres'",
    ]) {
      expect(precondition, `precondition: ${token}`).toContain(token)
      expect(postcondition, `postcondition: ${token}`).toContain(token)
    }

    for (const scope of [precondition, postcondition]) {
      expect(scope).toContain(
        'expected_acl(grantee, grantor, privilege_type, is_grantable)',
      )
      expect(scope).toMatch(
        /SELECT actual\.\* FROM actual_acl AS actual\s+EXCEPT ALL\s+SELECT expected\.\* FROM expected_acl AS expected/,
      )
      expect(scope).toMatch(
        /SELECT expected\.\* FROM expected_acl AS expected\s+EXCEPT ALL\s+SELECT actual\.\* FROM actual_acl AS actual/,
      )
      expect(scope.match(/pg_catalog\.has_function_privilege/g)).toHaveLength(4)
      expect(scope).toContain(
        "'pg_catalog.pg_namespace'::pg_catalog.regclass",
      )
      expect(scope).toContain(
        "'pg_catalog.pg_language'::pg_catalog.regclass",
      )
      expect(scope).toContain(
        'expected_dependencies(\n    classid, objid, objsubid, refclassid, refobjid, refobjsubid, deptype',
      )
      expect(scope).toContain("0, 'n'::\"char\"")
      expect(scope).toContain(
        '(SELECT pg_catalog.count(*) FROM expected_dependencies) = 2',
      )
      expect(scope).toContain(
        '(SELECT pg_catalog.count(*) FROM actual_dependencies) = 2',
      )
      expect(scope).toMatch(
        /SELECT actual\.\* FROM actual_dependencies AS actual\s+EXCEPT ALL\s+SELECT expected\.\* FROM expected_dependencies AS expected/,
      )
      expect(scope).toMatch(
        /SELECT expected\.\* FROM expected_dependencies AS expected\s+EXCEPT ALL\s+SELECT actual\.\* FROM actual_dependencies AS actual/,
      )
    }
    expect(sql171).toContain('v_post_oid IS DISTINCT FROM v_oid')
    expect(finalPostconditionIsFailClosed(sql171)).toBe(true)
    for (const token of finalPostconditionTokens) {
      expect(
        finalPostconditionIsFailClosed(sql171.replace(token, 'false')),
        `removed final guard: ${token}`,
      ).toBe(false)
    }
    expect(finalPostconditionIsFailClosed(sql171.replace(
      'OR NOT COALESCE(v_post_acl_exact, false)',
      'AND NOT COALESCE(v_post_acl_exact, false)',
    ))).toBe(false)
  })

  it('changes no application rows, relation contract, RLS, auth or ACL', () => {
    expect(sql171.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(sql171).toContain(
      'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1(p_actor_id uuid)',
    )
    expect(sql171).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(sql171).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+TABLE\b/im)
    expect(sql171).not.toMatch(/\b(?:GRANT|REVOKE)\b/i)
    expect(sql171).not.toMatch(/\b(?:FROM|JOIN)\s+public\./i)
    expect(sql171).not.toMatch(
      /CREATE POLICY|DROP POLICY|ENABLE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY/i,
    )
    expect(sql171).not.toMatch(/\b(?:auth\.users|auth\.identities)\b/i)
    expect(sql171).not.toMatch(/\bPERFORM\s+public\.expense_list_dashboard_presentations_v1/i)
    expect(sql171).not.toMatch(/\bSELECT\s+public\.expense_list_dashboard_presentations_v1/i)
  })

  it('documents standalone execution and no automatic broken-body recovery', () => {
    expect(readme.startsWith('# SQL171')).toBe(true)
    expect(readme).toContain('standalone')
    expect(readme).toContain('Do not wrap it in `BEGIN` / `COMMIT`')
    expect(readme).toContain('No automatic recovery SQL')
    expect(readme).toContain(predecessorInstalledHash)
    expect(readme).toContain(targetInstalledHash)
    expect(readme).toContain('Localhost checks for Stebbi')
  })

  it('leaves executed SQL170 and its immutable diagnostic evidence byte-exact', () => {
    expect(sha256(readRaw(sql170Path))).toBe(
      '0b8cbaf747e5aba269122cdfde6180443d387cf22c940e85902e2ca7af3004bf',
    )
    expect(sha256(readRaw(runtimeDiagnosticPath))).toBe(
      'd915b7c8858237831b37ea1c24acb12e2dce84945933eb0650e113aa29307735',
    )
    expect(readRaw(immutableDiagnosticPath)).toBe(readRaw(runtimeDiagnosticPath))
  })
})
