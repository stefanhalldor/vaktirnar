import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath =
  'sql/172_expense_dashboard_private_projection_compatibility.sql'
const validationRoot =
  'sql/validation/172-expense-dashboard-private-projection-compatibility'
const preflightPath = `${validationRoot}/preflight.sql`
const postflightPath = `${validationRoot}/postflight.sql`
const recoveryPath = `${validationRoot}/recovery.sql`
const rehearsalPath = `${validationRoot}/rehearse-migration.sql`
const readmePath = `${validationRoot}/README.md`

const sql159Path = 'sql/159_expense_unconfirmed_publication_and_finalization.sql'
const sql170Path = 'sql/170_expense_dashboard_presentations.sql'
const sql171Path = 'sql/171_expense_dashboard_json_extract_precedence_hotfix.sql'
const v246LineagePath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-projection-helper-aggregate-v245.sql'

const expectedSql159Sha256 =
  '0b96941e54570c74ca035b42067d705c121399263f6676a92f7ee84f812dfa38'
const expectedSql170Sha256 =
  '0b8cbaf747e5aba269122cdfde6180443d387cf22c940e85902e2ca7af3004bf'
const expectedSql171Sha256 =
  'a471c0f0211107ac292ddd84bbf91c8db90bb4e7304e6cdb1fef3bb05d3a3b66'
const expectedV246LineageSha256 =
  '517f22ddb7c7fd311e97c575620ff84f5e4a18d9f4c2a3b4c312e49aca20c415'
const expectedGroupedFunctionManifestSha256 =
  'b37c6ec4f339144cdbbb2de39a073b3b0000e52ce3e746da6a394e4323335185'
const expectedRelationManifestSha256 =
  '2f358eda5c169a33242b9b646cf1735f57b9b476aff672d95d934d4173d02f0a'
const expectedColumnManifestSha256 =
  '613a8d0848d933587ddab12af97b004c5af628a74d1cd590a563e487df9e530b'
const expectedSql170InnerBodyMd5 = 'cfaacddc089a3b7231ffbf48fb39bfac'
const expectedSql170InstalledSourceMd5 = 'dbf8086df87d9574e29a914c7201257b'
const expectedSql171InstalledSourceMd5 = 'aad418eeda9d6b1dfe073c4109723d88'
const expectedSql172TargetSourceMd5 = 'c27e4db0344e21ff660387dab9b3b36c'
const expectedSql172AdapterSourceMd5 = 'f6f261b2f4405afa09c033b7a7b651be'
const obsoleteAdapterSourceMd5s = [
  '654590f801466a729f59c6ac64b00bed',
  '2afc4d1f0efed48494adbc5bf24b7593',
] as const

const targetSignature =
  'public.expense_list_dashboard_presentations_v1(uuid)'
const adapterSignature =
  'public.expense_sql172_project_private_draft(uuid,uuid)'

const sql171InvalidToken = "|| '|' || party.value->>'party_key_hash'"
const sql171CorrectedToken = "|| '|' || (party.value->>'party_key_hash')"

const directContainedMessages = [
  'expense_unconfirmed_invalid_draft',
  'expense_unconfirmed_not_found',
  'expense_unconfirmed_event_unavailable',
  'expense_unconfirmed_source_changed',
  'expense_unconfirmed_duplicate_identity',
  'expense_unconfirmed_author_required',
] as const

const nestedContainedMessages = [
  'teskeid_event_not_found',
  'teskeid_event_unavailable',
] as const

const sourcePatchTags = [
  'sql172_new_declarations',
  'sql172_new_private_title',
  'sql172_old_private_from',
  'sql172_new_private_from',
  'sql172_old_private_normalizer',
  'sql172_new_private_normalizer',
  'sql172_old_private_visibility',
  'sql172_new_private_visibility',
  'sql172_new_private_edit_attention',
  'sql172_new_shared_attention',
  'sql172_new_canonical_attention',
  'sql172_new_output_attention',
] as const

const expectedHelperLineage = [
  ['public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)', '18a6e628bdb1d3c175b515541ab56787'],
  ['public.expense_sql159_amount_minor(text,text,boolean)', '5a4124296ff7e6f19d42342815be8109'],
  ['public.expense_sql159_percentage_basis_points(text)', 'ad0deb049185b7f6519bc0c3154201ac'],
  ['public.expense_sql159_weight(text)', 'c29cee4a8de2c95e138aad00af3fd4fe'],
  ['public.expense_sql159_allocate_weighted(bigint,jsonb,bigint)', '7d38f3ac0f65a2b16aac5a53c9a09e8f'],
  ['public.normalize_email_canonical(text)', '3083103976aa8cb3780937b9da1be236'],
  ['public.teskeid_event_uuid_from_text(text)', '27229cbc71c621e5a8592265b07f874d'],
  ['public.expense_active_member_role(uuid,uuid)', 'b25f994a64dde4a3f94ec8bad8535b17'],
  ['public.expense_sql159_audience_allows(uuid,uuid)', '9c4af07a07906c4dac6f06da94b42b37'],
  ['public.expense_sql159_snapshot_is_valid(uuid)', 'af4b9f8a5f0b422956fc1d664021baff'],
  ['public.expense_has_beta_access(uuid)', 'ebe4628dbda84e79b395c9da0ae39899'],
  ['public.expense_settlement_eligible_balances_v1(uuid,boolean)', 'b58245a47cc0c8e306a8769afa508687'],
  ['public.teskeid_event_assert_session_actor(uuid)', '30238c0def94d573fd8265fd94da0757'],
  ['public.expense_assert_beta_actor(uuid)', 'ea6c329f5c13bd7d0bfbd9df41e5931d'],
  ['public.expense_sql159_event_scope_read_only(uuid,uuid)', '4ba9308ba12eef6405ed24916bc0bb74'],
  ['public.expense_sql159_event_scope_allows(uuid,uuid)', '0be29be5cda2d34bf41dc2f67e0afa2e'],
  ['public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)', 'e6dc71178a96bb4f398d61b44b39c57a'],
  ['public.teskeid_event_get_expense_source_v3(uuid,uuid)', '9fdcb060bd933599b8f04fe42da27874'],
  ['public.teskeid_event_assert_actor(uuid)', '9dd7c34f6cc6c78131e7ebbb9a718ea4'],
  ['public.teskeid_event_assert_financial_actor(uuid)', '7f6ced4f5e7472aff27d9a6d5c624355'],
  ['public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)', '25394edc6b084676921c3a65b1f19a8a'],
  ['public.teskeid_event_private_normalize_shared_name_v2(text)', 'd118ab08bc0346cdf31519344a2f65a7'],
  ['public.teskeid_event_private_valid_shared_name_v2(text)', '7a3223263c138e04713dbc87e7dc6576'],
  ['public.teskeid_event_private_safe_profile_name_v2(uuid)', '53f29b4c6872d3e76d6c9cbc17a767e0'],
  ['public.teskeid_event_private_valid_canonical_email_v2(text)', '3e64bc04485bc06cc544f59f46a2fb0e'],
  ['public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)', 'cfb3afa33af8fd230e6c26930424387f'],
  ['public.teskeid_event_normalize_text(text)', 'ced5cfb2427fe7331f4416497614f7d1'],
  ['public.teskeid_event_valid_text(text,integer,integer)', '28c80b083a90683f15fd04f4d7d547d1'],
  ['public.teskeid_event_has_access(uuid)', '7b69311a107381a1891da01c32780f5f'],
] as const

const expectedRelations = [
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
] as const

const expectedColumns = [
  ['expense_private_drafts', 'id', 'uuid'],
  ['expense_private_drafts', 'actor_user_id', 'uuid'],
  ['expense_private_drafts', 'context_type', 'text'],
  ['expense_private_drafts', 'group_id', 'uuid'],
  ['expense_private_drafts', 'expense_id', 'uuid'],
  ['expense_private_drafts', 'current_step', 'text'],
  ['expense_private_drafts', 'payload', 'jsonb'],
  ['expense_private_drafts', 'version', 'bigint'],
  ['expense_unconfirmed_publications', 'draft_id', 'uuid'],
  ['expense_unconfirmed_publications', 'actor_user_id', 'uuid'],
  ['expense_unconfirmed_publications', 'context_type', 'text'],
  ['expense_unconfirmed_publications', 'group_id', 'uuid'],
  ['expense_unconfirmed_publications', 'is_live', 'boolean'],
  ['expense_unconfirmed_publications', 'source_draft_version', 'bigint'],
  ['expense_edit_revision_bindings', 'draft_id', 'uuid'],
  ['expense_edit_revision_bindings', 'expense_id', 'uuid'],
  ['expense_edit_revision_bindings', 'group_id', 'uuid'],
  ['expense_edit_revision_bindings', 'actor_user_id', 'uuid'],
  ['expense_edit_revision_bindings', 'mode', 'text'],
  ['expense_groups', 'id', 'uuid'],
  ['expense_groups', 'status', 'text'],
  ['expense_group_members', 'id', 'uuid'],
  ['expense_group_members', 'group_id', 'uuid'],
  ['expense_group_members', 'user_id', 'uuid'],
  ['expense_group_members', 'status', 'text'],
  ['expenses', 'id', 'uuid'],
  ['expenses', 'group_id', 'uuid'],
  ['expenses', 'status', 'text'],
  ['expense_member_identity_bindings', 'group_id', 'uuid'],
  ['expense_member_identity_bindings', 'member_id', 'uuid'],
  ['expense_member_identity_bindings', 'target_user_id', 'uuid'],
] as const

function raw(path: string): string {
  return readFileSync(path, 'utf8')
}

function lf(source: string): string {
  return source.replace(/\r\n/g, '\n')
}

function md5(source: string): string {
  return createHash('md5').update(source, 'utf8').digest('hex')
}

function sha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function compact(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`missing or unordered markers: ${start} -> ${end}`)
  }
  return source.slice(startIndex + start.length, endIndex)
}

function replaceExactlyOnce(source: string, before: string, after: string): string {
  if (occurrences(source, before) !== 1) {
    throw new Error(`expected exactly one replacement token: ${before}`)
  }
  return source.replace(before, after)
}

function dollarBody(source: string, tag: string): string {
  return between(source, `$${tag}$`, `$${tag}$`)
}

function manifest(source: string, label: string): string {
  return between(
    source,
    `-- BEGIN EXACT SQL171 ${label} MANIFEST`,
    `-- END EXACT SQL171 ${label} MANIFEST`,
  )
}

function lineageCteBody(source: string, start: string, end: string): string {
  return between(source, start, end)
}

function sql170InstalledSource(source: string): string {
  return between(source, 'AS $function$', '$function$;')
}

function patchTarget(sql171Source: string, migration: string): string {
  const directPatches = [
    ['  v_rows jsonb;', 'sql172_new_declarations'],
    ["      pg_catalog.btrim(draft.payload->>'title') AS title,", 'sql172_new_private_title'],
    ['      binding.expense_total_minor AS total_minor,', 'sql172_new_private_edit_attention'],
    ['      publication.title, publication.total_minor, publication.currency,', 'sql172_new_shared_attention'],
    ['      expense.title, expense.total_minor, expense.currency,', 'sql172_new_canonical_attention'],
    ["      'title', limited.title,", 'sql172_new_output_attention'],
  ] as const
  const dollarPatches = [
    ['sql172_old_private_from', 'sql172_new_private_from'],
    ['sql172_old_private_normalizer', 'sql172_new_private_normalizer'],
    ['sql172_old_private_visibility', 'sql172_new_private_visibility'],
  ] as const

  let result = sql171Source
  result = replaceExactlyOnce(
    result,
    directPatches[0][0],
    dollarBody(migration, directPatches[0][1]),
  )
  result = replaceExactlyOnce(
    result,
    directPatches[1][0],
    dollarBody(migration, directPatches[1][1]),
  )
  for (const [oldTag, newTag] of dollarPatches) {
    result = replaceExactlyOnce(
      result,
      dollarBody(migration, oldTag),
      dollarBody(migration, newTag),
    )
  }
  for (const [before, newTag] of directPatches.slice(2)) {
    result = replaceExactlyOnce(result, before, dollarBody(migration, newTag))
  }
  return result
}

function unpatchTarget(sql172Source: string, recoverySource: string): string {
  const reversePatches = [
    ['sql172_new_output_attention', "      'title', limited.title,"],
    ['sql172_new_canonical_attention', '      expense.title, expense.total_minor, expense.currency,'],
    ['sql172_new_shared_attention', '      publication.title, publication.total_minor, publication.currency,'],
    ['sql172_new_private_edit_attention', '      binding.expense_total_minor AS total_minor,'],
    ['sql172_new_private_visibility', dollarBody(recoverySource, 'sql172_old_private_visibility')],
    ['sql172_new_private_normalizer', dollarBody(recoverySource, 'sql172_old_private_normalizer')],
    ['sql172_new_private_from', dollarBody(recoverySource, 'sql172_old_private_from')],
    ['sql172_new_private_title', "      pg_catalog.btrim(draft.payload->>'title') AS title,"],
    ['sql172_new_declarations', '  v_rows jsonb;'],
  ] as const
  let result = sql172Source
  for (const [newTag, oldValue] of reversePatches) {
    result = replaceExactlyOnce(result, dollarBody(recoverySource, newTag), oldValue)
  }
  return result
}

function assertOneAtomicDo(source: string, tag: string): void {
  const normalized = lf(source)
  expect(occurrences(normalized, `DO $${tag}$`)).toBe(1)
  expect(normalized.trimEnd().endsWith(`$${tag}$;`)).toBe(true)
  expect(normalized).not.toMatch(/^\s*(?:BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)\s*;/im)
}

function assertNoApplicationRowMutation(source: string): void {
  expect(source).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im)
}

const guardedProjectionObjectKeyCount = `
AND (
  SELECT pg_catalog.count(*) = 10
  FROM pg_catalog.jsonb_object_keys(
    CASE
      WHEN pg_catalog.jsonb_typeof(row_value.value) = 'object'
        THEN row_value.value
      ELSE '{}'::jsonb
    END
  ) AS object_key(key)
)
`.trim()

function assertGuardedProjectionObjectKeyCount(source: string): void {
  expect(source).not.toMatch(/\b(?:pg_catalog\.)?jsonb_object_length\s*\(/i)
  expect(occurrences(compact(source), compact(guardedProjectionObjectKeyCount)))
    .toBe(1)
}

function lineageErrors(source: string): string[] {
  const errors: string[] = []
  const normalized = compact(source)
  for (const [signature, hash] of expectedHelperLineage) {
    if (!source.includes(`'${signature}'`) || !source.includes(`'${hash}'`)) {
      errors.push(`helper:${signature}`)
    }
  }
  for (const relation of expectedRelations) {
    if (!source.includes(`'${relation}'`)) errors.push(`relation:${relation}`)
  }
  for (const [relation, column, type] of expectedColumns) {
    if (!source.includes(`('${relation}','${column}','${type}')`)) {
      errors.push(`column:${relation}.${column}`)
    }
  }
  for (const fragment of [
    '= 29',
    '= 17',
    '= 31',
    "pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n'))",
    'actual_overload_count = 1',
    'pg_catalog.pg_get_function_arguments',
    'pg_catalog.pg_get_function_result',
    'routine.proconfig',
    'pg_catalog.aclexplode',
    'acl.grantor',
    'acl.is_grantable',
    'pg_catalog.has_function_privilege',
    'EXCEPT ALL',
    "class_row.relkind = 'r'",
    "class_row.relpersistence = 'p'",
    'class_row.relrowsecurity',
    'class_row.relforcerowsecurity',
    "owner_role.rolname = 'postgres'",
    'attribute.attacl IS NOT NULL',
  ]) {
    if (!normalized.includes(compact(fragment))) errors.push(`guard:${fragment}`)
  }
  if (!normalized.includes("routine.prokind = 'f'")
    && !normalized.includes("observed.prokind = 'f'")) {
    errors.push('guard:prokind')
  }
  for (const dependencyClass of ['pg_catalog.pg_namespace', 'pg_catalog.pg_language']) {
    if (!normalized.includes(
      `dependency.refclassid = '${dependencyClass}'::pg_catalog.regclass`,
    )) errors.push(`guard:dependency:${dependencyClass}`)
  }
  return errors
}

function adapterErrors(source: string): string[] {
  const errors: string[] = []
  const directBlock = between(
    source,
    '    IF v_message IN (',
    '    ) THEN\n      RETURN NULL::jsonb;\n    END IF;',
  )
  const nestedBlock = between(
    source,
    '    IF v_actor_admitted AND v_nested_event_row_local',
    '      RETURN NULL::jsonb;\n    END IF;',
  )
  for (const message of directContainedMessages) {
    if (occurrences(directBlock, `'${message}'`) !== 1) {
      errors.push(`direct:${message}`)
    }
  }
  for (const message of nestedContainedMessages) {
    if (occurrences(nestedBlock, `'${message}'`) !== 1) {
      errors.push(`nested:${message}`)
    }
  }
  if (!nestedBlock.includes('AND v_message IN (')) errors.push('nested:guard')
  if (occurrences(source, "EXCEPTION WHEN SQLSTATE 'P0001' THEN") !== 1) {
    errors.push('exception:p0001')
  }
  if (source.includes('WHEN OTHERS')) errors.push('exception:others')
  if (occurrences(source, '    RAISE;') !== 1) errors.push('exception:rethrow')
  if (/RAISE\s+(?:NOTICE|LOG|INFO|WARNING)|jsonb_build_object|SQLERRM|PG_EXCEPTION_/i.test(source)) {
    errors.push('exception:output')
  }
  const admissionEnd = source.indexOf("RAISE EXCEPTION 'expense_sql172_actor_admission_failed'")
  const handlerStart = source.indexOf('  BEGIN\n    RETURN public.expense_sql159_normalize_private_draft(')
  if (admissionEnd < 0 || handlerStart <= admissionEnd) errors.push('exception:boundary')
  return errors
}

const migrationRaw = raw(migrationPath)
const migration = lf(migrationRaw)
const preflight = lf(raw(preflightPath))
const postflight = lf(raw(postflightPath))
const recovery = lf(raw(recoveryPath))
const rehearsal = lf(raw(rehearsalPath))
const readme = lf(raw(readmePath))
const v246LineageRaw = raw(v246LineagePath)
const v246Lineage = lf(v246LineageRaw)
const sql170Raw = raw(sql170Path)
const sql170 = lf(sql170Raw)
const sql170Prosrc = sql170InstalledSource(sql170)
const sql171Prosrc = replaceExactlyOnce(
  sql170Prosrc,
  sql171InvalidToken,
  sql171CorrectedToken,
)
const sql172Target = patchTarget(sql171Prosrc, migration)
const sql172Adapter = dollarBody(migration, 'sql172_adapter_source')

describe('SQL172 private projection compatibility', () => {
  it('freezes SQL159/170/171 and derives the exact predecessor and SQL172 identities', () => {
    expect(sha256(raw(sql159Path))).toBe(expectedSql159Sha256)
    expect(sha256(sql170Raw)).toBe(expectedSql170Sha256)
    expect(sha256(raw(sql171Path))).toBe(expectedSql171Sha256)
    expect(sha256(v246LineageRaw)).toBe(expectedV246LineageSha256)

    expect(md5(sql170Prosrc.slice(1, -1))).toBe(expectedSql170InnerBodyMd5)
    expect(md5(sql170Prosrc)).toBe(expectedSql170InstalledSourceMd5)
    expect(occurrences(sql170Prosrc, sql171InvalidToken)).toBe(1)
    expect(occurrences(sql171Prosrc, sql171CorrectedToken)).toBe(1)
    expect(md5(sql171Prosrc)).toBe(expectedSql171InstalledSourceMd5)

    expect(md5(sql172Target)).toBe(expectedSql172TargetSourceMd5)
    expect(md5(sql172Adapter)).toBe(expectedSql172AdapterSourceMd5)
    const rehearsalTarget = patchTarget(sql171Prosrc, rehearsal)
    const rehearsalAdapter = dollarBody(rehearsal, 'sql172_adapter_source')
    expect(rehearsalTarget).toBe(sql172Target)
    expect(md5(rehearsalTarget)).toBe(expectedSql172TargetSourceMd5)
    expect(rehearsalAdapter).toBe(sql172Adapter)
    expect(md5(rehearsalAdapter)).toBe(expectedSql172AdapterSourceMd5)
    for (const tag of sourcePatchTags) {
      expect(dollarBody(rehearsal, tag)).toBe(dollarBody(migration, tag))
    }
    for (const obsoleteHash of obsoleteAdapterSourceMd5s) {
      expect(migration).not.toContain(obsoleteHash)
    }
    for (const artifact of [preflight, postflight, recovery, rehearsal]) {
      expect(artifact).toContain(expectedSql171InstalledSourceMd5)
      expect(artifact).toContain(expectedSql172TargetSourceMd5)
      expect(artifact).toContain(expectedSql172AdapterSourceMd5)
      for (const obsoleteHash of obsoleteAdapterSourceMd5s) {
        expect(artifact).not.toContain(obsoleteHash)
      }
    }
  })

  it('is one fail-closed, lock-bounded and idempotent atomic migration', () => {
    assertOneAtomicDo(migration, 'sql172_private_projection_compatibility')
    assertNoApplicationRowMutation(migration)
    expect(migration).toContain("pg_catalog.set_config('lock_timeout', '5s', true)")
    expect(migration).toContain("pg_catalog.set_config('search_path', '', true)")
    const locks = [
      'pg_catalog.pg_try_advisory_xact_lock(159159)',
      'pg_catalog.pg_try_advisory_xact_lock(104170)',
      'pg_catalog.pg_try_advisory_xact_lock(104171)',
      'pg_catalog.pg_try_advisory_xact_lock(104172)',
    ]
    let last = -1
    for (const lock of locks) {
      const position = migration.indexOf(lock)
      expect(position).toBeGreaterThan(last)
      last = position
    }
    expect(migration).toContain("v_state text := 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'")
    expect(occurrences(migration, "v_state := 'PREDECESSOR_READY'")).toBe(1)
    expect(occurrences(migration, "v_state := 'EXACT_INSTALLED'")).toBe(1)
    expect(migration).toContain("IF v_state = 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT' THEN")
    expect(migration.indexOf('expense_sql172_partial_or_predecessor_drift'))
      .toBeLessThan(migration.indexOf('CREATE FUNCTION public.expense_sql172_project_private_draft'))
    expect(occurrences(migration, 'EXECUTE v_lineage_query')).toBe(2)
    expect(migration.lastIndexOf('EXECUTE v_lineage_query'))
      .toBeLessThan(migration.indexOf("RAISE EXCEPTION 'expense_sql172_postcondition_failed'"))
    expect(migration.slice(migration.indexOf('$sql172_adapter_source$', migration.indexOf('$sql172_adapter_source$') + 1)))
      .not.toContain('EXCEPTION WHEN OTHERS')
  })

  it('freezes the full 29-helper and 17-relation/31-column V246 closure pre and post', () => {
    expect(expectedHelperLineage).toHaveLength(29)
    expect(expectedRelations).toHaveLength(17)
    expect(expectedColumns).toHaveLength(31)
    for (const artifact of [migration, preflight, postflight, recovery, rehearsal]) {
      expect(lineageErrors(artifact)).toEqual([])
    }

    const v246Functions = manifest(v246Lineage, 'FUNCTION LINEAGE')
    const targetEntryStart = v246Functions.indexOf(
      "    ('target','public.expense_list_dashboard_presentations_v1(uuid)'",
    )
    const firstUnchangedHelperStart = v246Functions.indexOf(
      "    ('private','public.expense_sql159_normalize_private_draft(uuid,uuid,boolean)'",
    )
    expect(targetEntryStart).toBeGreaterThan(-1)
    expect(firstUnchangedHelperStart).toBeGreaterThan(targetEntryStart)
    const canonicalFunctions = compact(
      v246Functions.slice(0, targetEntryStart)
        + v246Functions.slice(firstUnchangedHelperStart),
    )
    expect(sha256(canonicalFunctions)).toBe(expectedGroupedFunctionManifestSha256)
    for (const artifact of [migration, preflight, postflight, recovery, rehearsal]) {
      expect(compact(manifest(artifact, 'FUNCTION LINEAGE'))).toBe(canonicalFunctions)
    }

    const relationBodies = [migration, preflight, postflight, recovery, rehearsal]
      .map((artifact) => compact(lineageCteBody(
        artifact,
        '), relation_manifest(name, force_rls, expected_nonowner_acl)',
        '), relation_checks AS MATERIALIZED (',
      )))
    const columnBodies = [migration, preflight, postflight, recovery, rehearsal]
      .map((artifact) => compact(lineageCteBody(
        artifact,
        '), required_columns(relation_name, column_name, type_name)',
        '), column_checks AS MATERIALIZED (',
      )))
    for (const body of relationBodies) {
      expect(sha256(body)).toBe(expectedRelationManifestSha256)
      expect(body).toBe(relationBodies[0])
    }
    for (const body of columnBodies) {
      expect(sha256(body)).toBe(expectedColumnManifestSha256)
      expect(body).toBe(columnBodies[0])
    }

    const weakened = migration.replace(expectedHelperLineage[0][1], '0'.repeat(32))
    expect(weakened).not.toBe(migration)
    expect(lineageErrors(weakened)).toContain(`helper:${expectedHelperLineage[0][0]}`)
  })

  it('installs an exact owner-only VOLATILE SECURITY INVOKER adapter', () => {
    expect(migration).toContain(
      'CREATE FUNCTION public.expense_sql172_project_private_draft(p_actor_id uuid, p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY INVOKER NOT LEAKPROOF PARALLEL UNSAFE COST 100 SET search_path = %L AS %L',
    )
    expect(migration).toContain(
      "ALTER FUNCTION public.expense_sql172_project_private_draft(uuid,uuid) OWNER TO postgres",
    )
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.expense_sql172_project_private_draft(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).not.toMatch(/GRANT\s+EXECUTE[\s\S]+expense_sql172_project_private_draft/i)
    expect(occurrences(migration, 'actual_dependencies) = 2')).toBeGreaterThanOrEqual(2)
    expect(migration).toContain("language_row.lanname = 'plpgsql'")
    expect(migration).toContain("owner_role.rolname = 'postgres'")
    for (const role of ['service_role', 'anon', 'authenticated']) {
      expect(migration).toContain(
        `NOT pg_catalog.has_function_privilege(\n          pg_catalog.to_regrole('${role}')::oid, v_adapter_oid, 'EXECUTE'`,
      )
    }
  })

  it('contains only the six direct and two row-local nested P0001 outcomes', () => {
    expect(adapterErrors(sql172Adapter)).toEqual([])
    expect(md5(sql172Adapter)).toBe(expectedSql172AdapterSourceMd5)
    const exactBooleanGuard = `AND CASE
        WHEN pg_catalog.jsonb_typeof(draft.payload->'linkToEvent') = 'boolean'
          THEN (draft.payload->>'linkToEvent')::boolean
        ELSE false
      END`
    expect(sql172Adapter).toContain(exactBooleanGuard)
    expect(sql172Adapter).not.toMatch(
      /jsonb_typeof\(draft\.payload->'linkToEvent'\)\s*=\s*'boolean'\s+AND\s+\(draft\.payload->>'linkToEvent'\)::boolean/i,
    )
    expect(sql172Adapter).toContain("draft.context_type = 'one_off'")
    expect(sql172Adapter).toContain("draft.current_step = 'split'")
    expect(sql172Adapter).toContain('v_actor_admitted AND v_nested_event_row_local')

    const swallowedUnknown = sql172Adapter.replace(
      '    RAISE;\n',
      '    RETURN NULL::jsonb;\n',
    )
    expect(adapterErrors(swallowedUnknown)).toContain('exception:rethrow')
    const broadCatch = sql172Adapter.replace(
      "EXCEPTION WHEN SQLSTATE 'P0001' THEN",
      'EXCEPTION WHEN OTHERS THEN',
    )
    expect(adapterErrors(broadCatch)).toContain('exception:p0001')
    expect(adapterErrors(broadCatch)).toContain('exception:others')
    const leaked = sql172Adapter.replace(
      '    RAISE;\n',
      "    RAISE WARNING '%', v_message;\n    RAISE;\n",
    )
    expect(adapterErrors(leaked)).toContain('exception:output')

    const unsafeCastOrder = sql172Adapter.replace(
      exactBooleanGuard,
      `AND pg_catalog.jsonb_typeof(draft.payload->'linkToEvent') = 'boolean'
      AND (draft.payload->>'linkToEvent')::boolean IS TRUE`,
    )
    expect(unsafeCastOrder).not.toBe(sql172Adapter)
    expect(unsafeCastOrder).toMatch(
      /jsonb_typeof\(draft\.payload->'linkToEvent'\)\s*=\s*'boolean'\s+AND\s+\(draft\.payload->>'linkToEvent'\)::boolean/i,
    )
  })

  it('uses the adapter only for private creation and preserves strict live/settlement paths', () => {
    expect(occurrences(sql172Target, 'public.expense_sql172_project_private_draft(')).toBe(1)
    expect(occurrences(sql172Target, 'public.expense_sql159_normalize_private_draft(')).toBe(1)
    expect(sql172Target).toContain('public.expense_sql159_audience_allows(')
    expect(sql172Target).toContain('public.expense_sql159_snapshot_is_valid(')
    expect(sql172Target).toContain('public.expense_settlement_eligible_balances_v1(')
    const privateCreation = between(sql172Target, '  private_creation AS (', '  private_edit AS (')
    expect(privateCreation).toContain('public.expense_sql172_project_private_draft(')
    expect(privateCreation).not.toContain('public.expense_sql159_normalize_private_draft(')
    const livePublication = between(
      sql172Target,
      '  live_publication_sources AS (',
      '  shared_one_off_sources AS (',
    )
    expect(livePublication).toContain('public.expense_sql159_normalize_private_draft(')
    expect(livePublication).not.toContain('public.expense_sql172_project_private_draft(')
  })

  it('keeps SQL111 group visibility and emits safe nullable title/attention with empty normalized facets', () => {
    const privateCreation = between(sql172Target, '  private_creation AS (', '  private_edit AS (')
    for (const fragment of [
      "draft.context_type IN ('one_off', 'group')",
      "draft.context_type = 'one_off'",
      "draft.context_type = 'group'",
      "expense_group.status = 'active'",
      'public.expense_active_member_role(',
      ') IS NOT NULL',
      "pg_catalog.jsonb_typeof(draft.payload->'title') = 'string'",
      'BETWEEN 1 AND 200',
      "U&'[\\0001-\\001F\\007F-\\009F\\202A-\\202E\\2066-\\2069]'",
      '!~ v_email_shaped_pattern',
      'ELSE NULL::text',
      'safe_title.title AS title',
      'safe_title.title IS NULL',
      'summary.total_minor IS NULL',
      'source.normalized IS NULL',
      'COALESCE((',
      "'[]'::jsonb) AS person_facets",
      "'[]'::jsonb) AS circle_facets",
    ]) expect(compact(privateCreation)).toContain(compact(fragment))
    expect(privateCreation).not.toContain("draft.payload->'participants'")
    expect(sql172Target).toContain("'needs_attention', limited.needs_attention")
    expect(occurrences(sql172Target, 'false AS needs_attention')).toBe(3)

    const rawIdentityInference = privateCreation.replace(
      "'[]'::jsonb) AS person_facets",
      "draft.payload->'participants') AS person_facets",
    )
    expect(rawIdentityInference).not.toBe(privateCreation)
    expect(rawIdentityInference).toContain("draft.payload->'participants'")
  })

  it('keeps preflight and postflight exact, read-only and aligned', () => {
    for (const artifact of [preflight, postflight]) {
      expect(artifact).toMatch(/^-- SQL172 /)
      expect(artifact).toContain('BEGIN TRANSACTION READ ONLY;')
      expect(artifact.trimEnd().endsWith('ROLLBACK;')).toBe(true)
      assertNoApplicationRowMutation(artifact)
      for (const field of [
        'target_contract_exact',
        'target_acl_exact',
        'target_dependencies_exact',
        'predecessor_source_exact',
        'target_source_exact',
        'adapter_absent',
        'adapter_contract_exact',
        'adapter_source_exact',
        'adapter_acl_exact',
        'adapter_dependencies_exact',
        'helper_lineage_exact',
        'relation_lineage_exact',
      ]) expect(artifact).toContain(field)
      expect(artifact).toContain(targetSignature)
      expect(artifact).toContain(adapterSignature)
      expect(artifact).toContain('actual_overload_count = 1')
    }
    expect(preflight).toContain("THEN 'PREDECESSOR_READY'")
    expect(preflight).toContain("THEN 'EXACT_INSTALLED'")
    expect(preflight).toContain("ELSE 'STOP_PARTIAL_OR_PREDECESSOR_DRIFT'")
    expect(postflight).toContain('AS postconditions_ok')
  })

  it('keeps recovery atomic, fail-closed and ordered restore-before-drop', () => {
    assertOneAtomicDo(recovery, 'sql172_recovery')
    assertNoApplicationRowMutation(recovery)
    expect(recovery).not.toMatch(/DROP\s+FUNCTION[^;]+\bCASCADE\b/i)
    const exactRecognition = recovery.indexOf("v_state := 'EXACT_INSTALLED'")
    const reversePatches = recovery.indexOf(
      'Reverse the exact SQL172 target patch manifest in reverse order',
    )
    const restore = recovery.indexOf(
      'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1',
    )
    const restoredPostcondition = recovery.indexOf('expense_sql172_recovery_restore_postcondition_failed')
    const dropAdapter = recovery.indexOf(
      'DROP FUNCTION public.expense_sql172_project_private_draft(uuid,uuid)',
    )
    const finalPostcondition = recovery.indexOf('expense_sql172_recovery_final_postcondition_failed')
    expect(exactRecognition).toBeGreaterThan(-1)
    expect(reversePatches).toBeGreaterThan(exactRecognition)
    expect(restore).toBeGreaterThan(reversePatches)
    expect(restoredPostcondition).toBeGreaterThan(restore)
    expect(dropAdapter).toBeGreaterThan(restoredPostcondition)
    expect(finalPostcondition).toBeGreaterThan(dropAdapter)
    const lineageExecutions = [...recovery.matchAll(/EXECUTE v_lineage_query/g)]
      .map((match) => match.index)
    const finalRecoveryLock = recovery.indexOf(
      'pg_catalog.pg_try_advisory_xact_lock(104172)',
    )
    expect(lineageExecutions).toHaveLength(2)
    expect(finalRecoveryLock).toBeGreaterThan(-1)
    expect(lineageExecutions[0]).toBeGreaterThan(finalRecoveryLock)
    expect(lineageExecutions[0]).toBeLessThan(exactRecognition)
    expect(lineageExecutions[1]).toBeGreaterThan(dropAdapter)
    expect(lineageExecutions[1]).toBeLessThan(finalPostcondition)
    expect(recovery).toContain(expectedSql171InstalledSourceMd5)
    expect(recovery).toContain(expectedSql172TargetSourceMd5)
    expect(recovery).toContain(expectedSql172AdapterSourceMd5)
    expect(unpatchTarget(sql172Target, recovery)).toBe(sql171Prosrc)
    expect(md5(unpatchTarget(sql172Target, recovery)))
      .toBe(expectedSql171InstalledSourceMd5)
    for (const tag of sourcePatchTags) {
      expect(dollarBody(recovery, tag)).toBe(dollarBody(migration, tag))
    }
  })

  it('makes rehearsal one rollback-by-design statement with bounded safe evidence', () => {
    assertOneAtomicDo(rehearsal, 'sql172_rehearsal')
    const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'
    expect(occurrences(rehearsal, placeholder)).toBe(1)
    expect(rehearsal).toContain(`'${placeholder}'::uuid`)
    expect(rehearsal).toContain("ERRCODE = 'P1701'")
    expect(rehearsal).toContain('expense_sql172_rehearsal_rollback')
    expect(rehearsal.indexOf('expense_sql172_rehearsal_rollback'))
      .toBeLessThan(rehearsal.indexOf("ERRCODE = 'P1701'"))
    expect(rehearsal).not.toMatch(/^\s*(?:BEGIN TRANSACTION|START TRANSACTION|COMMIT|ROLLBACK)\b/im)
    assertNoApplicationRowMutation(rehearsal)

    const predecessorAdmission = rehearsal.indexOf(
      "IF v_state <> 'PREDECESSOR_READY' THEN",
    )
    const innerBegin = rehearsal.indexOf(
      "  BEGIN\n    IF v_state = 'PREDECESSOR_READY' THEN",
      predecessorAdmission,
    )
    const createAdapter = rehearsal.indexOf(
      "'CREATE FUNCTION public.expense_sql172_project_private_draft(",
      innerBegin,
    )
    const createTarget = rehearsal.indexOf(
      "'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1(",
      createAdapter,
    )
    const installPostcondition = rehearsal.indexOf(
      "RAISE EXCEPTION 'expense_sql172_postcondition_failed'",
      createTarget,
    )
    const targetInvocation = rehearsal.indexOf(
      'v_projection :=\n      public.expense_list_dashboard_presentations_v1(p_actor_id);',
      installPostcondition,
    )
    const rollbackRaise = rehearsal.indexOf("ERRCODE = 'P1722'", targetInvocation)
    const rollbackHandler = rehearsal.indexOf(
      "  EXCEPTION\n    WHEN SQLSTATE 'P1722' THEN",
      rollbackRaise,
    )
    const rollbackHandlerClosure = rehearsal.indexOf(
      '      v_inner_rolled_back := true;\n  END;\n\n' +
        '  -- The handler entry has rolled back the nested subtransaction.',
      rollbackHandler,
    )
    const rollbackTargetReobservation = rehearsal.indexOf(
      "  v_target_oid := pg_catalog.to_regprocedure(\n" +
        "    'public.expense_list_dashboard_presentations_v1(uuid)'",
      rollbackHandlerClosure,
    )
    const rollbackAdapterReobservation = rehearsal.indexOf(
      "  v_adapter_oid := pg_catalog.to_regprocedure(\n" +
        "    'public.expense_sql172_project_private_draft(uuid,uuid)'",
      rollbackTargetReobservation,
    )
    const rollbackCatalogReobservation = rehearsal.indexOf(
      '  SELECT COALESCE(\n    routine.oid IS NOT NULL',
      rollbackAdapterReobservation,
    )
    const lineageExecutions = [...rehearsal.matchAll(/EXECUTE v_lineage_query/g)]
      .map((match) => match.index)
    const finalRehearsalLock = rehearsal.indexOf(
      'pg_catalog.pg_try_advisory_xact_lock(104172)',
    )
    const rollbackExactGuard = rehearsal.indexOf(
      "RAISE EXCEPTION 'expense_sql172_rehearsal_rollback_not_exact'",
      rollbackCatalogReobservation,
    )
    const finalPublisher = rehearsal.lastIndexOf('  RAISE EXCEPTION USING')
    const orderedMarkers = [
      finalRehearsalLock,
      lineageExecutions[0],
      predecessorAdmission,
      innerBegin,
      createAdapter,
      createTarget,
      lineageExecutions[1],
      installPostcondition,
      targetInvocation,
      rollbackRaise,
      rollbackHandler,
      rollbackHandlerClosure,
      rollbackTargetReobservation,
      rollbackAdapterReobservation,
      rollbackCatalogReobservation,
      lineageExecutions[2],
      rollbackExactGuard,
      finalPublisher,
    ]
    expect(lineageExecutions).toHaveLength(3)
    expect(orderedMarkers[0]).toBeGreaterThan(-1)
    for (let index = 1; index < orderedMarkers.length; index += 1) {
      expect(orderedMarkers[index]).toBeGreaterThan(orderedMarkers[index - 1])
    }
    expect(occurrences(rehearsal,
      'v_projection :=\n      public.expense_list_dashboard_presentations_v1(p_actor_id);'))
      .toBe(1)
    expect(occurrences(rehearsal, "ERRCODE = 'P1722'")).toBe(1)
    expect(occurrences(rehearsal, "ERRCODE = 'P1701'")).toBe(1)
    assertGuardedProjectionObjectKeyCount(rehearsal)
    const invalidObjectLengthMutation = replaceExactlyOnce(
      rehearsal,
      'pg_catalog.jsonb_object_keys(',
      'pg_catalog.jsonb_object_length(',
    )
    expect(() => assertGuardedProjectionObjectKeyCount(
      invalidObjectLengthMutation,
    )).toThrow()
    for (const fragment of [
      "row_value.value ?& ARRAY[",
      "'presentation_key','presentation_state','title'",
      "'needs_attention','total_minor','currency','href','order'",
      "'person_facets','circle_facets'",
      "pg_catalog.jsonb_typeof(row_value.value->'title')",
      "IN ('string', 'null')",
      "row_value.value->'needs_attention' = 'false'::jsonb",
      "row_value.value->>'presentation_state' = 'private_draft'",
      "row_value.value->'needs_attention' = 'true'::jsonb",
      'v_projection_row_count NOT BETWEEN 1 AND 100',
      'COALESCE(v_projection_attention_count, 0) = 0',
    ]) expect(compact(rehearsal)).toContain(compact(fragment))
    const resultPublisher = rehearsal.slice(finalPublisher)
    expect(resultPublisher).not.toMatch(
      /SQLERRM|PG_EXCEPTION_(?:DETAIL|HINT|CONTEXT)|MESSAGE_TEXT/i,
    )
    for (const field of [
      'projection_status',
      'projection_contract_version',
      'projection_row_count',
      'projection_rows_shape_exact',
      'projection_attention_count',
      'rollback_target_exact',
      'rollback_target_acl_exact',
      'rollback_target_dependencies_exact',
      'rollback_adapter_absent',
      'rollback_lineage_exact',
    ]) expect(rehearsal).toContain(`'${field}'`)
  })

  it('documents the same app-first manual validation and recovery contract', () => {
    for (const token of [
      'PREDECESSOR_READY',
      'EXACT_INSTALLED',
      targetSignature,
      adapterSignature,
      'SECURITY INVOKER',
      'owner-only',
      'preflight',
      'rehearsal',
      'migration',
      'postflight',
      'recovery',
      'Localhost checks for Stebbi',
    ]) expect(readme).toContain(token)
    expect(readme.toLowerCase()).toContain('app')
    expect(readme).toContain('standalone')
  })
})
