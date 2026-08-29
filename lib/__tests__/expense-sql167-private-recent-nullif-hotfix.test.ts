import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const normalize = (value: string) => value.replace(/\r\n/g, '\n')
const read = (path: string) => normalize(readFileSync(path, 'utf8'))
const readOptional = (path: string) => existsSync(path) ? read(path) : ''
const md5 = (value: string) => createHash('md5').update(value).digest('hex')

function section(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start)
  if (startAt < 0) return ''
  const endAt = source.indexOf(end, startAt + start.length)
  if (endAt < 0) return ''
  return source.slice(startAt, endAt)
}

function replaceLast(source: string, search: string, replacement: string): string {
  const at = source.lastIndexOf(search)
  if (at < 0) return source
  return source.slice(0, at) + replacement + source.slice(at + search.length)
}

const versionAdaptiveOwnerAclMarker = 'CROSS JOIN LATERAL pg_catalog.aclexplode(\n'
  + "      pg_catalog.acldefault('r', relation.relowner)\n"
  + '    ) AS owner_acl'

function ownerAclIsVersionAdaptive(source: string, expectedCount: number): boolean {
  return source.split(versionAdaptiveOwnerAclMarker).length - 1 === expectedCount
    && source.split('WHERE owner_acl.grantee = relation.relowner').length - 1
      === expectedCount
}

function postMutationGateIsFailClosed(source: string): boolean {
  const postMutation = source.slice(source.indexOf('v_post_oid :='))
  const contractAssignment = section(
    postMutation,
    'WITH expected(',
    'INTO v_post_contracts_exact',
  )
  const aclAssignment = section(
    postMutation,
    'WITH roles AS MATERIALIZED',
    'INTO v_post_acl_exact',
  )
  const boundaryAssignment = section(
    postMutation,
    'WITH expected_relation(',
    'INTO v_post_boundaries_exact',
  )
  const finalGate = section(
    postMutation,
    'IF v_post_oid IS DISTINCT FROM v_helper_oid',
    "RAISE EXCEPTION 'expense_sql167_postcondition_failed'",
  )
  return contractAssignment.includes('pg_catalog.count(oid) = 5')
    && contractAssignment.includes('= expected.direct_helper_calls AS exact')
    && aclAssignment.includes('(SELECT pg_catalog.count(*) FROM expected_acl) = 8')
    && aclAssignment.includes('(SELECT pg_catalog.count(*) FROM actual_acl) = 8')
    && aclAssignment.includes('pg_catalog.has_function_privilege')
    && boundaryAssignment.includes('pg_catalog.count(oid) = 3')
    && boundaryAssignment.includes('pg_catalog.bool_and(NOT relforcerowsecurity)')
    && boundaryAssignment.includes('FROM pg_catalog.pg_policy AS policy')
    && boundaryAssignment.includes('EXCEPT ALL SELECT expected.* FROM expected_acl AS expected')
    && finalGate.includes('OR NOT COALESCE(v_post_contracts_exact, false)')
    && finalGate.includes('OR NOT COALESCE(v_post_acl_exact, false)')
    && finalGate.includes('OR NOT COALESCE(v_post_boundaries_exact, false)')
    && finalGate.includes('OR v_boundary_after IS DISTINCT FROM v_boundary_before')
    && finalGate.includes("OR pg_catalog.md5(pg_catalog.replace(v_post_body, E'\\r\\n', E'\\n')) <> v_target_hash")
}

function recoveryGateIsFailClosed(source: string): boolean {
  const contract = section(
    source,
    'contract AS MATERIALIZED (',
    ')\nSELECT CASE WHEN exact',
  )
  const result = source.slice(source.indexOf('SELECT CASE WHEN exact'))
  const exactPolicyAbsence = 'AND NOT EXISTS (\n'
    + '        SELECT 1 FROM pg_catalog.pg_policy AS policy\n'
    + '        JOIN relations AS relation ON relation.oid = policy.polrelid\n'
    + '      )'
  return source.startsWith('BEGIN TRANSACTION READ ONLY;')
    && source.trimEnd().endsWith('ROLLBACK;')
    && contract.includes('pg_catalog.count(oid) = 5')
    && contract.includes('pg_catalog.bool_and(exact) FROM functions')
    && contract.includes('(SELECT pg_catalog.count(*) FROM expected_acl) = 8')
    && contract.includes('(SELECT pg_catalog.count(*) FROM actual_acl) = 8')
    && contract.includes('pg_catalog.bool_and(service_exact AND anon_denied AND authenticated_denied)')
    && contract.includes('pg_catalog.count(oid) = 3')
    && contract.includes('pg_catalog.bool_and(NOT relforcerowsecurity)')
    && contract.includes(exactPolicyAbsence)
    && contract.includes('EXCEPT ALL SELECT expected.* FROM expected_relation_acl AS expected')
    && result.includes("CASE WHEN exact\n    THEN 'NO_AUTOMATIC_SQL167_RECOVERY_AVAILABLE'")
    && result.includes("ELSE 'STOP_SQL167_RECOVERY_STATE_DRIFT'")
    && result.includes('exact AS exact_target_and_boundaries')
    && result.includes('false AS mutation_performed')
}

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

const sql141Path = 'sql/141_expense_canonical_identity_and_claim_disputes.sql'
const sql149Path = 'sql/149_event_participant_identity_display.sql'
const sql151Path = 'sql/151_event_viewer_relationship_greatest_hotfix.sql'
const sql163Path = 'sql/163_expense_existing_member_relationship_identity.sql'
const sql166Path = 'sql/166_expense_relationship_identity_coalesce_hotfix.sql'
const sql163DiagnosticPath =
  'sql/validation/163-expense-existing-member-relationship-identity/diagnose-runtime-read.sql'
const sql167Path = 'sql/167_expense_private_recent_nullif_hotfix.sql'
const validationPath = 'sql/validation/167-expense-private-recent-nullif-hotfix'

const sql141 = read(sql141Path)
const sql149 = read(sql149Path)
const sql151 = read(sql151Path)
const sql163 = read(sql163Path)
const sql166 = read(sql166Path)
const sql163Diagnostic = read(sql163DiagnosticPath)

const helperDeclaration = 'CREATE FUNCTION public.expense_record_private_recent('
const applyDeclaration = 'CREATE FUNCTION public.expense_apply_identity_binding('
const disputeDeclaration = 'CREATE FUNCTION public.expense_dispute_claim('
const sql149GreatestDeclaration =
  'CREATE FUNCTION public.teskeid_event_private_viewer_relationship_v2('
const sql151GreatestDeclaration =
  'CREATE OR REPLACE FUNCTION public.teskeid_event_private_viewer_relationship_v2('
const sql163DiscoveryDeclaration =
  'CREATE FUNCTION public.expense_get_relationship_identity_management_v1'
const sql163MutationDeclaration =
  'CREATE FUNCTION public.expense_bind_member_relationship_identity_v1'

const helperPredecessor = bodyAfter(sql141, helperDeclaration)
const helperTarget = helperPredecessor.replace('pg_catalog.nullif(', 'NULLIF(')
const applyBody = bodyAfter(sql141, applyDeclaration)
const disputeBody = bodyAfter(sql141, disputeDeclaration)
const sql149Greatest = bodyAfter(sql149, sql149GreatestDeclaration)
const sql151Greatest = bodyAfter(sql151, sql151GreatestDeclaration)
const sql163Discovery = bodyAfter(sql163, sql163DiscoveryDeclaration)
const sql163Mutation = bodyAfter(sql163, sql163MutationDeclaration)
const sql166Discovery = sql163Discovery.replace('pg_catalog.coalesce(', 'COALESCE(')

const migration = readOptional(sql167Path)
const preflight = readOptional(`${validationPath}/preflight.sql`)
const postflight = readOptional(`${validationPath}/postflight.sql`)
const recovery = readOptional(`${validationPath}/recovery.sql`)
const diagnostic = readOptional(`${validationPath}/diagnose-binding-state.sql`)
const readme = readOptional(`${validationPath}/README.md`)

describe('SQL167 private recent NULLIF runtime hotfix', () => {
  it('reconstructs the exact effective helper predecessor and one-token target', () => {
    expect(md5(helperPredecessor)).toBe('46a55ef53d35e1385cce6b9689705856')
    expect(helperPredecessor.split('pg_catalog.nullif(')).toHaveLength(2)
    expect(md5(helperTarget)).toBe('d87efae16a77f09eb82ca8ec2a1fca35')
    expect(helperTarget).not.toContain('pg_catalog.nullif(')
    expect(helperTarget.split('NULLIF(')).toHaveLength(2)
    expect(helperTarget.replace('NULLIF(', 'pg_catalog.nullif(')).toBe(helperPredecessor)
    expect(helperTarget).toContain("NULLIF(pg_catalog.btrim(p_expense_title), '')")
  })

  it('builds an effective lineage manifest instead of banning frozen history', () => {
    expect(sql149Greatest).toContain('pg_catalog.greatest(')
    expect(sql151Greatest).not.toContain('pg_catalog.greatest(')
    expect(sql151Greatest).toContain('GREATEST(')
    expect(sql151Greatest.replace('GREATEST(', 'pg_catalog.greatest(')).toBe(sql149Greatest)
    expect(sql163Discovery).toContain('pg_catalog.coalesce(')
    expect(sql166Discovery).not.toContain('pg_catalog.coalesce(')
    expect(md5(sql166Discovery)).toBe('d97158cb09a138b962382747c6badbca')
    expect(sql141).toContain('pg_catalog.nullif(')
    expect(migration).toContain('d87efae16a77f09eb82ca8ec2a1fca35')
    expect(migration).toContain('effective latest-function manifest')
  })

  it('freezes the two direct callers and protected SQL163/166 bodies', () => {
    expect(md5(applyBody)).toBe('819b2e024aac1e00c7e14145b0d6b373')
    expect(md5(disputeBody)).toBe('7e6426c8e43efa3bb7d725bf6b1c807c')
    expect(applyBody.split('public.expense_record_private_recent(')).toHaveLength(2)
    expect(disputeBody.split('public.expense_record_private_recent(')).toHaveLength(2)
    expect(md5(sql163Mutation)).toBe('257e4ad0dc53277b984272baadd8a3bf')
    expect(md5(sql166Discovery)).toBe('d97158cb09a138b962382747c6badbca')
  })

  it('proves the failed binding path is one uncaught PostgreSQL transaction', () => {
    const beginRequest = sql163Mutation.indexOf('public.expense_begin_request(')
    const apply = sql163Mutation.indexOf('public.expense_apply_identity_binding(')
    const finishRequest = sql163Mutation.indexOf('public.expense_finish_request(')
    expect(beginRequest).toBeGreaterThanOrEqual(0)
    expect(apply).toBeGreaterThan(beginRequest)
    expect(finishRequest).toBeGreaterThan(apply)
    expect(sql163Mutation).not.toMatch(/\n\s*EXCEPTION\s+WHEN\b/)

    const memberUpdate = applyBody.indexOf('UPDATE public.expense_group_members')
    const proofInsert = applyBody.indexOf('INSERT INTO public.expense_member_identity_bindings')
    const versionUpdate = applyBody.indexOf('UPDATE public.expense_groups')
    const activityCall = applyBody.indexOf('public.expense_record_private_recent(')
    expect(memberUpdate).toBeGreaterThanOrEqual(0)
    expect(proofInsert).toBeGreaterThan(memberUpdate)
    expect(versionUpdate).toBeGreaterThan(proofInsert)
    expect(activityCall).toBeGreaterThan(versionUpdate)
    expect(applyBody).not.toMatch(/\n\s*EXCEPTION\s+WHEN\b/)
    expect(helperPredecessor).not.toMatch(/\n\s*EXCEPTION\s+WHEN\b/)
    expect(helperPredecessor).toContain('INSERT INTO public.expense_activity(')
  })

  it('adds the complete SQL167 migration and operator bundle', () => {
    for (const artifact of [migration, preflight, postflight, recovery, diagnostic, readme]) {
      expect(artifact.length).toBeGreaterThan(0)
    }
    expect(migration.trimStart().startsWith('-- SQL167 MIGRATION:')).toBe(true)
    expect(migration).toContain('SELECT pg_catalog.pg_advisory_xact_lock(104167);')
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(readme).toContain('closed beta')
    expect(readme).toContain('Localhost checks for Stebbi')
  })

  it('fails closed around helper, callers, protected bodies and ACL boundaries', () => {
    for (const artifact of [migration, preflight, postflight]) {
      for (const evidence of [
        'd87efae16a77f09eb82ca8ec2a1fca35',
        '819b2e024aac1e00c7e14145b0d6b373',
        '7e6426c8e43efa3bb7d725bf6b1c807c',
        '257e4ad0dc53277b984272baadd8a3bf',
        'd97158cb09a138b962382747c6badbca',
        'pg_catalog.pg_get_function_arguments',
        'pg_catalog.aclexplode',
        'pg_catalog.has_function_privilege',
        'public.expense_activity',
        'public.expense_activity_audience',
        'public.recent_events',
      ]) expect(artifact).toContain(evidence)
    }
    for (const predecessorAwareArtifact of [migration, preflight]) {
      expect(predecessorAwareArtifact).toContain('46a55ef53d35e1385cce6b9689705856')
    }
    expect(migration).toContain('expense_sql167_partial_or_predecessor_drift')
    expect(migration).toContain('expense_sql167_postcondition_failed')
  })

  it('derives owner table ACL from the PostgreSQL-version catalog default', () => {
    for (const [name, artifact, expectedCount] of [
      ['migration', migration, 2],
      ['preflight', preflight, 1],
      ['postflight', postflight, 1],
      ['recovery', recovery, 1],
    ] as const) {
      expect(ownerAclIsVersionAdaptive(artifact, expectedCount), name).toBe(true)
      const legacyOwnerAclMutant = artifact.replace(
        versionAdaptiveOwnerAclMarker,
        "CROSS JOIN pg_catalog.unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',"
          + "'TRUNCATE','REFERENCES','TRIGGER']::text[]) AS owner_acl",
      )
      expect(ownerAclIsVersionAdaptive(legacyOwnerAclMutant, expectedCount), name)
        .toBe(false)
    }
  })

  it('independently revalidates the complete contract after migration mutation', () => {
    expect(postMutationGateIsFailClosed(migration)).toBe(true)
    const mutants = {
      disconnectedContract: migration.replace('INTO v_post_contracts_exact', 'INTO v_contracts_exact'),
      disconnectedAcl: migration.replace('INTO v_post_acl_exact', 'INTO v_acl_exact'),
      disconnectedBoundary: migration.replace('INTO v_post_boundaries_exact', 'INTO v_boundaries_exact'),
      ungatedContract: migration.replace('OR NOT COALESCE(v_post_contracts_exact, false)', ''),
      ungatedAcl: migration.replace('OR NOT COALESCE(v_post_acl_exact, false)', ''),
      ungatedBoundary: migration.replace('OR NOT COALESCE(v_post_boundaries_exact, false)', ''),
      ungatedDigest: migration.replace('OR v_boundary_after IS DISTINCT FROM v_boundary_before', ''),
      forcedRlsAccepted: replaceLast(
        migration, 'AND pg_catalog.bool_and(NOT relforcerowsecurity)', '',
      ),
    }
    for (const [name, mutant] of Object.entries(mutants)) {
      expect(postMutationGateIsFailClosed(mutant), name).toBe(false)
    }
  })

  it('implements exact predecessor, installed and drift classifications', () => {
    expect(preflight).toMatch(/^BEGIN TRANSACTION READ ONLY;/)
    expect(preflight.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    for (const classification of [
      'PREDECESSOR_READY',
      'EXACT_INSTALLED',
      'STOP_PARTIAL_OR_PREDECESSOR_DRIFT',
    ]) expect(preflight).toContain(classification)
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('source_hash_exact')
    expect(postflight).toContain('invalid_token_absent')
  })

  it('replaces only the helper and performs no table or user-data mutation', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.expense_record_private_recent')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.expense_apply_identity_binding')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.expense_dispute_claim')
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(migration).not.toMatch(/^\s*(CREATE|ALTER|DROP)\s+TABLE\b/im)
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY|CREATE POLICY|DROP POLICY/i)
    expect(postflight).toContain('migration_contains_no_data_dml')
    expect(postflight).not.toContain('no_data_drift')
  })

  it('makes recovery read-only, guard-only and explicitly unavailable', () => {
    expect(recovery).toMatch(/^BEGIN TRANSACTION READ ONLY;/)
    expect(recovery.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(recovery).toContain('NO_AUTOMATIC_SQL167_RECOVERY_AVAILABLE')
    expect(recovery).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im)
    expect(recovery).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(readme).toContain('No automatic SQL167 recovery is available')
    expect(recoveryGateIsFailClosed(recovery)).toBe(true)
    const mutants = {
      writableTransaction: recovery.replace('BEGIN TRANSACTION READ ONLY;', 'BEGIN;'),
      commitInsteadOfRollback: recovery.replace('ROLLBACK;', 'COMMIT;'),
      functionsNotExact: recovery.replace(
        'AND pg_catalog.bool_and(exact) FROM functions', 'FROM functions',
      ),
      rawAclNotExact: recovery.replace(
        '(SELECT pg_catalog.count(*) FROM actual_acl) = 8', 'true',
      ),
      forcedRlsAccepted: recovery.replace(
        'AND pg_catalog.bool_and(NOT relforcerowsecurity)', '',
      ),
      policiesAccepted: recovery.replace(
        'AND NOT EXISTS (\n        SELECT 1 FROM pg_catalog.pg_policy AS policy\n'
          + '        JOIN relations AS relation ON relation.oid = policy.polrelid\n'
          + '      )',
        'AND EXISTS (\n        SELECT 1 FROM pg_catalog.pg_policy AS policy\n'
          + '        JOIN relations AS relation ON relation.oid = policy.polrelid\n'
          + '      )',
      ),
      exactIgnored: recovery.replace('CASE WHEN exact', 'CASE WHEN true'),
      mutationReported: recovery.replace(
        'false AS mutation_performed', 'true AS mutation_performed',
      ),
    }
    for (const [name, mutant] of Object.entries(mutants)) {
      expect(recoveryGateIsFailClosed(mutant), name).toBe(false)
    }
  })

  it('provides a privacy-safe read-only pre/post binding diagnostic', () => {
    expect(diagnostic).toMatch(/^BEGIN TRANSACTION READ ONLY;/)
    expect(diagnostic.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    for (const classification of [
      'READY_NO_PARTIAL_BINDING',
      'BOUND_EXACTLY_ONCE',
      'STOP_PARTIAL_OR_AMBIGUOUS_BINDING_STATE',
    ]) expect(diagnostic).toContain(classification)
    for (const placeholder of [
      '<REPLACE_WITH_EXACT_EXPENSE_UUID>',
      '<REPLACE_WITH_EXACT_MEMBER_UUID>',
      '<REPLACE_WITH_EXACT_RELATIONSHIP_UUID>',
      '<REPLACE_WITH_EXPECTED_PRE_BIND_FINANCIAL_VERSION_OR_EMPTY>',
    ]) expect(diagnostic).toContain(placeholder)
    expect(diagnostic).toContain('evidence_token')
    expect(diagnostic).toContain('v_proof_count = 0')
    expect(diagnostic).toContain('v_proof_count = 1')
    expect(diagnostic).toContain('v_exact_proof_count = 1')
    expect(diagnostic).toContain("'exact_proof_count', v_exact_proof_count")
    expect(diagnostic).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/im)
    expect(diagnostic).not.toMatch(/display_name|email|expense_title|payload|request_id/i)
  })

  it('preserves the generic SQL163 diagnostic and excludes live identifiers', () => {
    expect(sql163Diagnostic.split('<REPLACE_WITH_EXACT_EXPENSE_UUID>')).toHaveLength(2)
    const releaseArtifacts = [migration, preflight, postflight, recovery, diagnostic, readme].join('\n')
    expect(releaseArtifacts).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )
    expect(releaseArtifacts).not.toMatch(/NOTIFY\s+pgrst/i)
    expect(releaseArtifacts).not.toMatch(/GRANT EXECUTE[^;]+TO\s+(PUBLIC|anon|authenticated)/i)
  })
})
