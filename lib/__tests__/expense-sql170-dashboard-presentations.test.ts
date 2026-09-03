import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'sql/170_expense_dashboard_presentations.sql')
const validationRoot = join(
  process.cwd(),
  'sql/validation/170-expense-dashboard-presentations',
)
const diagnosticPath = join(validationRoot, 'diagnose-predecessor-drift.sql')
const profileBootstrapPaths = [
  join(process.cwd(), 'app/api/teskeid/weather/preferences/thresholds/route.ts'),
  join(process.cwd(), 'app/api/teskeid/weather/preferences/chase/route.ts'),
] as const

const protectedHelpers = [
  ['public.teskeid_event_assert_session_actor(uuid)', 'plpgsql', '30238c0def94d573fd8265fd94da0757'],
  ['public.expense_assert_beta_actor(uuid)', 'plpgsql', 'ea6c329f5c13bd7d0bfbd9df41e5931d'],
  ['public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', 'plpgsql', '18a6e628bdb1d3c175b515541ab56787'],
  ['public.expense_sql159_snapshot_is_valid(uuid)', 'sql', 'af4b9f8a5f0b422956fc1d664021baff'],
  ['public.expense_sql159_audience_allows(uuid,uuid)', 'sql', '9c4af07a07906c4dac6f06da94b42b37'],
  ['public.expense_settlement_eligible_balances_v1(uuid,boolean)', 'plpgsql', 'b58245a47cc0c8e306a8769afa508687'],
] as const

function read(path: string) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function functionBody(source: string) {
  const match = source.match(
    /CREATE OR REPLACE FUNCTION public\.expense_list_dashboard_presentations_v1\([\s\S]*?\nAS \$function\$\n([\s\S]*?)\n\$function\$;/,
  )
  expect(match, 'SQL170 target function body').not.toBeNull()
  return match![1]!
}

function installedProsrc(source: string) {
  const match = source.match(
    /CREATE OR REPLACE FUNCTION public\.expense_list_dashboard_presentations_v1\([\s\S]*?\nAS \$function\$([\s\S]*?)\$function\$;/,
  )
  expect(match, 'SQL170 installed pg_proc.prosrc shape').not.toBeNull()
  return match![1]!
}

function readDiagnostic() {
  expect(existsSync(diagnosticPath), 'SQL170 predecessor diagnostic exists').toBe(true)
  return existsSync(diagnosticPath) ? read(diagnosticPath) : ''
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expectDetailedHelperLanguages(source: string) {
  const manifest = source.match(
    /expected_helpers\([\s\S]*?\) AS MATERIALIZED \(([\s\S]*?)\n\s*\), observed_helpers/,
  )?.[1]
  expect(manifest, 'detailed helper manifest').toBeDefined()
  expect(manifest!.match(/'(?:sql|plpgsql)'/g)).toHaveLength(6)
  for (const [signature, language, sourceHash] of protectedHelpers) {
    expect(manifest).toMatch(new RegExp(
      `\\('${escapeRegExp(signature)}',[\\s\\S]*?'${language}',\\s*'${sourceHash}'`,
    ))
  }
}

function expectHelperDependencyBlock(source: string) {
  const dependencyBlock = source.match(
    /EXISTS \(SELECT 1 FROM pg_catalog\.pg_depend AS dependency[\s\S]*?dependency\.refclassid = 'pg_catalog\.pg_namespace'::pg_catalog\.regclass[\s\S]*?dependency\.refobjid = pg_catalog\.to_regnamespace\('public'\)\)[\s\S]*?AND \(helper\.language_name = 'sql' OR EXISTS \([\s\S]*?dependency\.refclassid = 'pg_catalog\.pg_language'::pg_catalog\.regclass[\s\S]*?language_row\.lanname = helper\.language_name[\s\S]*?AND NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_depend AS dependency[\s\S]*?dependency\.deptype = 'e'\)/,
  )?.[0]
  expect(dependencyBlock, 'bound helper dependency block').toBeDefined()
  expect(dependencyBlock!.match(/pg_catalog\.pg_namespace/g)).toHaveLength(1)
  expect(dependencyBlock).toContain('JOIN pg_catalog.pg_language AS language_row')
  expect(dependencyBlock).toContain("'pg_catalog.pg_language'::pg_catalog.regclass")
  expect(dependencyBlock!.match(/dependency\.deptype = 'e'/g)).toHaveLength(1)
}

describe('SQL170 dashboard presentation projection', () => {
  it('ships one additive, read-only, service-only projection contract', () => {
    const source = read(migrationPath)
    const body = functionBody(source)

    expect(source.startsWith('-- SQL170 MIGRATION:')).toBe(true)
    expect(source).toContain('public.expense_list_dashboard_presentations_v1(\n  p_actor_id uuid\n)')
    expect(source).toContain('RETURNS jsonb')
    expect(source).toContain('LANGUAGE plpgsql')
    expect(source).toContain('VOLATILE')
    expect(source).toContain('SECURITY DEFINER')
    expect(source).toContain("SET search_path = ''")
    expect(source).toContain('ALTER FUNCTION public.expense_list_dashboard_presentations_v1(uuid) OWNER TO postgres')
    expect(source).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(source).toContain('TO service_role')
    expect(source.match(/LEFT JOIN pg_catalog\.pg_roles AS grantee_role/g)).toHaveLength(3)
    expect(source.match(/COALESCE\(grantee_role\.rolname, 'PUBLIC'\)/g)).toHaveLength(4)
    expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i)
    expect(body).not.toMatch(/\bEXECUTE\b/i)
  })

  it('keeps one-visible, outsider-zero and complete-universe semantics in SQL', () => {
    const body = functionBody(read(migrationPath))

    expect(body).toContain("'private_draft'")
    expect(body).toContain("'shared_draft'")
    expect(body).toContain("'confirmed'")
    expect(body).toContain("'settled'")
    expect(body).toContain("'cancelled'")
    expect(body).toContain('expense_edit_revision_bindings')
    expect(body).toContain('invalid_visible_bindings')
    expect(body).toContain("binding.actor_user_id = p_actor_id\n        OR public.expense_sql159_audience_allows(p_actor_id, binding.draft_id)")
    expect(body).toContain('invalid_visible_private_edits')
    expect(body).toContain('visible_live_publications')
    expect(body).toContain('invalid_visible_publications')
    expect(body.match(/FROM visible_live_publications AS publication/g)).toHaveLength(2)
    expect(body).toContain('v_candidate_count IS DISTINCT FROM v_distinct_candidate_count')
    expect(body).toContain('expense_unconfirmed_publication_audience')
    expect(body).toContain('LIMIT 101')
    expect(body.match(/YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"/g)).toHaveLength(7)
    expect(body).not.toMatch(/(?:updated_at|created_at|published_at)::text AS order_/)
    expect(body).toContain("'unavailable'")
    expect(body).toContain("'rows', '[]'::jsonb")
    expect(body).toContain('binding.expense_total_minor AS total_minor')
    expect(body).toContain('binding.expense_currency AS currency')
    expect(body).not.toContain('NULL::bigint AS total_minor, NULL::text AS currency')
    expect(body).not.toContain('lower(display_name)')
    expect(body).not.toContain('email_canonical')
  })

  it('separates durable and entry-scoped manual identity from display labels', () => {
    const body = functionBody(read(migrationPath))

    expect(body).toContain('expense-sql170-durable-person-v1')
    expect(body).toContain('expense-sql170-manual-person-v1')
    expect(body.match(/expense-sql170-presentation-v1\|'/g)).toHaveLength(5)
    expect(body.match(/expense-sql170-presentation-v1\|'\s*\n\s*\|\| p_actor_id::text/g)).toHaveLength(5)
    expect(body.match(/\|draft\|/g)).toHaveLength(2)
    expect(body.match(/\|expense\|/g)).toHaveLength(4)
    expect(body).toContain('relationship.private_display_name')
    expect(body).toContain("'kind', CASE WHEN")
    expect(body).toContain("THEN 'manual' ELSE 'durable' END")
    expect(body).toContain('party_key_hash')
    expect(body).not.toContain("ELSE audience.value->>'user_id' END::uuid")
    expect(body).toContain("ELSE (audience.value->>'user_id')::uuid END AS target_user_id")
    expect(body).toContain("U&'\\202A\\202B\\202C\\202D\\202E\\2066\\2067\\2068\\2069'")
    expect(body).not.toContain('pg_catalog.lower(')
    expect(body).not.toMatch(/identity_token_hash\s*=\s*(?:party\.)?display_name/i)
  })

  it('implements Option A without reading a stale private circle into a shared row', () => {
    const body = functionBody(read(migrationPath))

    expect(body).toContain('source_draft_version')
    expect(body).toContain("normalized->>'circle_id'")
    expect(body).toContain("'circle_facets', limited.circle_facets")
    expect(body).toContain('shared_one_off_sources AS')
    expect(body).toContain(
      'WHEN publication.source_draft_version = draft.version\n          THEN public.expense_sql159_normalize_private_draft',
    )
    expect(body).toContain('ELSE NULL::jsonb')
    expect(body).toContain('source.normalized IS NOT NULL')
    expect(body).toContain('LEFT JOIN exact_bindings AS binding\n      ON binding.draft_id = publication.draft_id')
    expect(body).toContain('WHERE binding.draft_id IS NULL')
    expect(body).toMatch(
      /source\.normalized->>'shareable_fingerprint'\s*= publication\.shareable_fingerprint/,
    )
    expect(body).toMatch(
      /source\.normalized->>'authority_fingerprint'\s*= publication\.authority_fingerprint/,
    )
    expect(body).toContain("source.normalized->>'title' = publication.title")
    expect(body).toContain("(source.normalized->>'total_minor')::bigint = publication.total_minor")
    expect(body).toContain("source.normalized->>'currency' = publication.currency")
    expect(body).toMatch(
      /FROM pg_catalog\.jsonb_array_elements\(\s*source\.normalized->'audience'\s*\) AS normalized_audience\(value\)/,
    )
    expect(body).toContain(
      "ORDER BY normalized_audience.value->>'user_id' COLLATE pg_catalog.\"C\"",
    )
    expect(body).toContain(
      "ORDER BY audience.user_id::text COLLATE pg_catalog.\"C\"",
    )
    expect(body).not.toContain(
      'CROSS JOIN LATERAL public.expense_sql159_normalize_private_draft(\n            publication.actor_user_id',
    )
    expect(body).not.toContain("'label', pg_catalog.btrim(context.circle_name_snapshot)")
    expect(body).toContain("'label', pg_catalog.btrim(circle.name)")
    expect(body).toContain("'label', pg_catalog.btrim(authorized_circle.name)")
  })

  it('fails closed for malformed actor-owned live publications without exposing outsider clues', () => {
    const body = functionBody(read(migrationPath))

    expect(body).toContain('actor_relevant_live_publications AS')
    expect(body).toContain(
      'publication.actor_user_id = p_actor_id\n        OR public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)',
    )
    expect(body).toContain('FROM actor_relevant_live_publications AS publication')
    expect(body).toContain(
      'NOT public.expense_sql159_audience_allows(p_actor_id, publication.draft_id)',
    )
    expect(body).toContain('FROM visible_live_publications AS publication')
  })

  it('ships fail-closed operator artifacts with exact file roles', () => {
    const migration = read(migrationPath)
    const preflight = read(join(validationRoot, 'preflight.sql'))
    const postflight = read(join(validationRoot, 'postflight.sql'))
    const recovery = read(join(validationRoot, 'recovery.sql'))
    const readme = read(join(validationRoot, 'README.md'))

    expect(preflight.startsWith('-- SQL170 PREFLIGHT:')).toBe(true)
    expect(postflight.startsWith('-- SQL170 POSTFLIGHT:')).toBe(true)
    expect(recovery.startsWith('-- SQL170 RECOVERY:')).toBe(true)
    expect(preflight).toContain('ABSENT_READY')
    expect(preflight).toContain('EXACT_INSTALLED')
    expect(preflight).toContain('STOP_PARTIAL_OR_PREDECESSOR_DRIFT')
    expect(postflight).toContain('postconditions_ok')
    expect(recovery).toMatch(
      /REVOKE EXECUTE ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*COMMIT;[\s\S]*DROP FUNCTION/,
    )
    expect(recovery).toContain("COALESCE(grantee_role.rolname, 'PUBLIC') = 'postgres'")
    expect(recovery).toContain('LEFT JOIN pg_catalog.pg_roles AS grantee_role')
    expect(recovery).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
    expect(recovery.match(/^BEGIN;$/gm)).toHaveLength(2)
    expect(recovery.match(/^COMMIT;$/gm)).toHaveLength(2)
    expect(
      recovery.match(/^SELECT pg_catalog\.pg_advisory_xact_lock\(104170\);$/gm),
    ).toHaveLength(2)

    const firstLock = recovery.indexOf('SELECT pg_catalog.pg_advisory_xact_lock(104170);')
    const preMutationGuardIndex = recovery.indexOf('DO $pre_mutation_guard$')
    const revokeIndex = recovery.indexOf('REVOKE EXECUTE ON FUNCTION')
    const firstCommit = recovery.indexOf('COMMIT;', revokeIndex)
    const secondLock = recovery.indexOf(
      'SELECT pg_catalog.pg_advisory_xact_lock(104170);',
      firstCommit,
    )
    const postRevokeGuardIndex = recovery.indexOf('DO $guard$', secondLock)
    const dropIndex = recovery.indexOf('DROP FUNCTION', postRevokeGuardIndex)
    expect(firstLock).toBeGreaterThan(-1)
    expect(preMutationGuardIndex).toBeGreaterThan(firstLock)
    expect(revokeIndex).toBeGreaterThan(preMutationGuardIndex)
    expect(firstCommit).toBeGreaterThan(revokeIndex)
    expect(secondLock).toBeGreaterThan(firstCommit)
    expect(postRevokeGuardIndex).toBeGreaterThan(secondLock)
    expect(dropIndex).toBeGreaterThan(postRevokeGuardIndex)

    const preMutationGuard = recovery.match(
      /DO \$pre_mutation_guard\$[\s\S]*?\$pre_mutation_guard\$;/,
    )?.[0]
    const postRevokeGuard = recovery.match(/DO \$guard\$[\s\S]*?\$guard\$;/)?.[0]
    expect(preMutationGuard).toBeDefined()
    expect(postRevokeGuard).toBeDefined()
    for (const exactMetadata of [
      "pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n'))\n        = 'dbf8086df87d9574e29a914c7201257b'",
      "routine.provolatile = 'v'::\"char\"",
      'routine.prosecdef',
      "routine.prokind = 'f'",
      'routine.pronargs = 1',
      "routine.proargnames = ARRAY['p_actor_id']::text[]",
      'routine.proargmodes IS NULL',
      "pg_catalog.pg_get_function_arguments(routine.oid) = 'p_actor_id uuid'",
      "pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'",
      'NOT routine.proisstrict',
      'NOT routine.proleakproof',
      "routine.proparallel = 'u'::\"char\"",
      'routine.pronargdefaults = 0',
      "routine.proconfig = ARRAY['search_path=\"\"']::text[]",
      "owner_role.rolname = 'postgres'",
      "language_row.lanname = 'plpgsql'",
    ]) {
      expect(preMutationGuard, exactMetadata).toContain(exactMetadata)
      expect(postRevokeGuard, exactMetadata).toContain(exactMetadata)
    }
    expect(preMutationGuard).toContain('SELECT pg_catalog.count(*) = 2')
    expect(preMutationGuard).toContain(
      "COALESCE(grantee_role.rolname::text, 'PUBLIC')",
    )
    expect(preMutationGuard).toContain(
      "ARRAY['postgres','service_role']::text[]",
    )
    expect(preMutationGuard).toContain("grantor_role.rolname = 'postgres'")
    expect(preMutationGuard).toContain("acl.privilege_type = 'EXECUTE'")
    expect(preMutationGuard).toContain('AND NOT acl.is_grantable')
    expect(postRevokeGuard).toContain('SELECT pg_catalog.count(*) = 1')
    expect(postRevokeGuard).toContain(
      "COALESCE(grantee_role.rolname, 'PUBLIC') = 'postgres'",
    )
    expect(postRevokeGuard).not.toContain("'service_role'")
    expect(readme).toContain('preflight.sql')
    expect(readme).toContain('170_expense_dashboard_presentations.sql')
    expect(readme).toContain('postflight.sql')
    expect(readme).toContain('recovery.sql')

    for (const source of [migration, preflight, postflight]) {
      const relationManifest = source.match(
        /relation_manifest\(name, force_rls, expected_nonowner_acl\)[\s\S]*?\), relation_state/,
      )?.[0]
      expect(relationManifest).toBeDefined()
      const compactManifest = relationManifest!.replace(/\s+/g, '')
      expect(compactManifest).toContain(
        "('relationships',false,ARRAY['service_role:DELETE','service_role:INSERT','service_role:SELECT','service_role:UPDATE']::text[])",
      )
      expect(compactManifest).toContain(
        "('profiles',false,ARRAY['authenticated:INSERT','authenticated:SELECT','authenticated:UPDATE','service_role:INSERT','service_role:SELECT']::text[])",
      )
      expectDetailedHelperLanguages(source)
      expectHelperDependencyBlock(source)
      expect(source).toContain('helper_contracts_exact')
      expect(source).toContain('helper_acls_exact')
      expect(source).toContain('helper_dependencies_exact')
      expect(source).toContain('security_relations_exact')
      expect(source).toContain('relation_columns_exact')
      expect(source).toContain('relation_acls_exact')
      expect(source).toContain('relation_keys_exact')
      expect(source).toContain('relation_indexes_exact')
      expect(source.replace(/\s+/g, '')).toContain(
        "pg_catalog.replace(pg_catalog.lower(pg_catalog.pg_get_indexdef(index_row.indexrelid)),'public.','')",
      )
      expect(source).toContain('expense_edit_revision_bindings_draft_id_fkey')
      expect(source).toContain('expense_member_identity_bindings_member_fk')
      expect(source).toContain("('profiles_pkey','profiles','PRIMARY KEY (id)')")
      expect(source).toContain(
        "('relationship_circles_pkey','relationship_circles','PRIMARY KEY (id)')",
      )
      expect(source).toContain('relationship_circle_expense_contexts_circle_id_fkey')
      for (const [signature, , sourceHash] of protectedHelpers) {
        expect(source).toContain(signature)
        expect(source).toContain(sourceHash)
      }
      for (const relation of [
        'expense_private_drafts',
        'expense_unconfirmed_publications',
        'expense_unconfirmed_publication_parties',
        'expense_unconfirmed_publication_audience',
        'expense_edit_revision_bindings',
        'expense_groups',
        'expense_group_members',
        'expenses',
        'expense_payments',
        'expense_shares',
        'expense_repayments',
        'expense_member_identity_bindings',
        'relationships',
        'profiles',
        'relationship_circles',
        'relationship_circle_members',
        'relationship_circle_expense_contexts',
      ]) {
        expect(source).toContain(`'${relation}'`)
      }
    }
  })

  it('preserves profile privileges required by both active admin bootstrap upserts', () => {
    for (const path of profileBootstrapPaths) {
      const source = read(path)
      expect(source).toMatch(
        /const admin = getAdmin\(\)[\s\S]*?admin\s*\n\s*\.from\('profiles'\)\s*\n\s*\.upsert\(\{ id: user\.id, display_name: '' \}, \{ onConflict: 'id', ignoreDuplicates: true \}\)/,
      )
    }
  })

  it('separates canonical inner-body identity from exact installed prosrc identity', () => {
    const migration = read(migrationPath)
    const innerBody = functionBody(migration)
    const prosrc = installedProsrc(migration)
    const crlfProsrc = prosrc.replace(/\n/g, '\r\n')
    const innerBodyHash = createHash('md5').update(innerBody).digest('hex')
    const installedProsrcHash = createHash('md5').update(prosrc).digest('hex')
    const crlfProsrcHash = createHash('md5').update(crlfProsrc).digest('hex')
    const installedSourceArtifacts = [
      [migration, 2],
      [read(join(validationRoot, 'preflight.sql')), 1],
      [read(join(validationRoot, 'postflight.sql')), 1],
      [read(join(validationRoot, 'recovery.sql')), 2],
      [read(join(validationRoot, 'rehearse-migration-postcondition.sql')), 2],
    ] as const

    expect(prosrc).toBe(`\n${innerBody}\n`)
    expect(innerBodyHash).toBe('cfaacddc089a3b7231ffbf48fb39bfac')
    expect(installedProsrcHash).toBe('dbf8086df87d9574e29a914c7201257b')
    expect(crlfProsrcHash).toBe('49614f4549dc300db1b098023be53d71')
    expect(createHash('md5').update(prosrc.replace(/\r\n/g, '\n')).digest('hex'))
      .toBe(installedProsrcHash)
    expect(createHash('md5').update(crlfProsrc.replace(/\r\n/g, '\n')).digest('hex'))
      .toBe(installedProsrcHash)
    for (const [source, expectedCount] of installedSourceArtifacts) {
      expect(source.match(new RegExp(installedProsrcHash, 'g'))).toHaveLength(
        expectedCount,
      )
      expect(source).not.toContain(innerBodyHash)
      expect(source).not.toContain(crlfProsrcHash)
      expect(source).not.toMatch(
        /pg_catalog\.md5\(pg_catalog\.(?:btrim|trim|regexp_replace)\(/,
      )
    }
    const normalizedRoutineHash =
      "pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n'))"
    const normalizedProcedureHash =
      "pg_catalog.md5(pg_catalog.replace(procedure_row.prosrc, E'\\r\\n', E'\\n'))"
    const normalizedTargetHash =
      "pg_catalog.md5(pg_catalog.replace(target.prosrc, E'\\r\\n', E'\\n'))"
    expect(migration).toContain(
      `${normalizedRoutineHash}\n          = '${installedProsrcHash}'`,
    )
    expect(migration).toContain(
      `${normalizedProcedureHash}\n           = '${installedProsrcHash}'`,
    )
    expect(installedSourceArtifacts[1][0]).toContain(
      `${normalizedRoutineHash} AS source_hash`,
    )
    expect(installedSourceArtifacts[2][0]).toContain(
      `${normalizedRoutineHash}\n      = '${installedProsrcHash}' AS source_hash_exact`,
    )
    expect(installedSourceArtifacts[3][0].match(new RegExp(
      `${escapeRegExp(normalizedRoutineHash)}\\s*= '${installedProsrcHash}'`,
      'g',
    ))).toHaveLength(2)
    expect(installedSourceArtifacts[4][0]).toContain(
      `${normalizedRoutineHash}\n          = '${installedProsrcHash}'`,
    )
    expect(installedSourceArtifacts[4][0]).toContain(
      `${normalizedTargetHash}\n        = '${installedProsrcHash}'`,
    )
    for (const source of installedSourceArtifacts.slice(0, 4).map(([value]) => value)) {
      expect(source).not.toMatch(
        /pg_catalog\.md5\((?:routine|procedure_row|target)\.prosrc\)/,
      )
    }
  })

  it('keeps incomplete owner creation drafts available without invoking the strict normalizer', () => {
    const body = functionBody(read(migrationPath))
    const privateCreation = body.match(/private_creation AS \(([\s\S]*?)\n  \),\n  private_edit AS/)

    expect(privateCreation).not.toBeNull()
    expect(privateCreation![1]).not.toContain(
      'CROSS JOIN LATERAL public.expense_sql159_normalize_private_draft',
    )
    expect(privateCreation![1]).toContain('LEFT JOIN LATERAL')
    expect(privateCreation![1]).toContain('summary.total_minor AS total_minor')
    expect(privateCreation![1]).toContain('CASE WHEN summary.total_minor IS NULL')
    expect(privateCreation![1]).toContain('ELSE NULL::jsonb')
  })

  it('ships a catalog-only, bounded and rollback-only predecessor diagnostic', () => {
    const diagnostic = readDiagnostic()

    expect(diagnostic.startsWith('-- SQL170 DIAGNOSTIC:')).toBe(true)
    expect(diagnostic).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(diagnostic).toContain("SET LOCAL statement_timeout = '30s';")
    expect(diagnostic).toContain("SET LOCAL search_path = '';")
    expect(diagnostic.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(diagnostic.match(/^SELECT /gm)).toHaveLength(1)
    expect(diagnostic).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
    expect(diagnostic).not.toMatch(/\bEXECUTE\b/i)
    expect(diagnostic).not.toMatch(/\b(?:FROM|JOIN)\s+public\./i)
    expect(diagnostic).not.toContain('routine.prosrc')
    expect(diagnostic).not.toContain('email')
  })

  it('diagnoses the exact frozen helper dependency and relation ACL manifests', () => {
    const diagnostic = readDiagnostic()
    const helperManifest = diagnostic.match(
      /helper_manifest\(signature, expected_language\)[\s\S]*?\), helper_observed/,
    )?.[0]
    const relationManifest = diagnostic.match(
      /relation_manifest\(name, expected_nonowner_acl\)[\s\S]*?\), relation_observed/,
    )?.[0]

    expect(helperManifest).toBeDefined()
    expect(helperManifest!.match(/\('public\./g)).toHaveLength(6)
    expect(helperManifest!.match(/'(?:sql|plpgsql)'::text/g)).toHaveLength(6)
    for (const [signature, language] of protectedHelpers) {
      expect(helperManifest).toContain(`('${signature}', '${language}'::text)`)
    }
    expect(relationManifest).toBeDefined()
    expect(relationManifest!.match(/\('(?:expense|relationship|profiles)/g)).toHaveLength(17)
    expect(relationManifest!.replace(/\s+/g, '')).toContain(
      "('relationships',ARRAY['service_role:DELETE','service_role:INSERT','service_role:SELECT','service_role:UPDATE']::text[])",
    )
    expect(relationManifest!.replace(/\s+/g, '')).toContain(
      "('profiles',ARRAY['authenticated:INSERT','authenticated:SELECT','authenticated:UPDATE','service_role:INSERT','service_role:SELECT']::text[])",
    )
    const observedBlock = diagnostic.match(
      /helper_observed AS MATERIALIZED \(([\s\S]*?)\n\), helper_items/,
    )?.[1]
    expect(observedBlock, 'diagnostic helper dependency block').toBeDefined()
    expect(observedBlock).toContain("manifest.expected_language <> 'sql' AS language_dependency_required")
    expect(observedBlock).toContain("'pg_catalog.pg_namespace'::pg_catalog.regclass")
    expect(observedBlock).toContain("'pg_catalog.pg_language'::pg_catalog.regclass")
    expect(observedBlock).toContain("dependency.deptype = 'e'")
    for (const token of [
      'namespace_dependency_present',
      'language_dependency_present',
      'language_dependency_required',
      'extension_dependency_absent',
      'expected_nonowner_acl',
      'actual_nonowner_acl',
      'unexpected_grantor_or_grantable',
      'column_acl_count',
      'item_exact',
    ]) {
      expect(diagnostic).toContain(token)
    }
    expect(diagnostic).toContain("'item_kind', 'helper_dependency'")
    expect(diagnostic).toContain("'item_kind', 'relation_acl'")
    expect(diagnostic.replace(/\s+/g, '')).toContain(
      'AND(NOTobserved.language_dependency_requiredORobserved.language_dependency_present)',
    )
    expect(diagnostic).toContain('COLLATE pg_catalog."C"')
  })

  it('fails incomplete diagnostics closed and documents the reviewed operator sequence', () => {
    const diagnostic = readDiagnostic()
    const readme = read(join(validationRoot, 'README.md'))

    for (const classification of [
      'DIAGNOSTIC_EXPECTATIONS_EXACT',
      'STOP_HELPER_DEPENDENCY_DRIFT',
      'STOP_RELATION_ACL_DRIFT',
      'STOP_HELPER_DEPENDENCY_AND_RELATION_ACL_DRIFT',
      'STOP_DIAGNOSTIC_INCOMPLETE',
    ]) {
      expect(diagnostic).toContain(classification)
    }
    expect(diagnostic).toContain('expected_helper_count')
    expect(diagnostic).toContain('expected_relation_count')
    expect(diagnostic).toContain('helper_drift_count')
    expect(diagnostic).toContain('relation_drift_count')
    expect(diagnostic).not.toMatch(/'\s*(?:oid|uuid|payload|source|email)\s*'/i)
    expect(readme).toContain('diagnose-predecessor-drift.sql')
    expect(readme).toMatch(/preflight[^\n]*STOP[\s\S]*diagnostic[\s\S]*review[\s\S]*correction authority/i)
    expect(readme).toContain('Do not run preflight, diagnostic and migration as one operator step')
    expect(readme).toContain('pinned `sql` language')
    expect(readme.replace(/\s+/g, ' ')).toContain(
      '`service_role:INSERT` and `service_role:SELECT` on `profiles`',
    )
  })
})
