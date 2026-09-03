import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const diagnosticPath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-projection-helper-aggregate-v245.sql'
const v242DiagnosticPath =
  'sql/validation/171-expense-dashboard-json-extract-precedence-hotfix/diagnose-projection-helper-p0001-v242.sql'

const diagnosticRaw = readFileSync(diagnosticPath, 'utf8')
const v242DiagnosticRaw = readFileSync(v242DiagnosticPath, 'utf8')
const diagnostic = diagnosticRaw.replace(/\r\n/g, '\n')
const v242Diagnostic = v242DiagnosticRaw.replace(/\r\n/g, '\n')
const placeholder = '__STEBBI_PRIVATE_ACTOR_UUID__'
const expectedDiagnosticSha256 =
  '517f22ddb7c7fd311e97c575620ff84f5e4a18d9f4c2a3b4c312e49aca20c415'
const expectedFunctionManifestSha256 =
  '9d8cd97932f97a6cfab075943737e233143b6997047a2d0ccb93ecf50380e70d'
const expectedPrivateClassifierSha256 =
  '0b03bd34e8cb62f5897c2961de0c0398e582b09b3e0a5f448e7634880a832247'
const expectedCatalogGateSha256 =
  '13e9f379a3d145588eee34f2aff695649d616fc6f9fae92b4c7f6e7dc333a0f1'
const reviewedV242DiagnosticSha256 =
  '8ceb4326577a44a5825fb3ecd973e9a297a63d356e59d0f13c3bf5b6f44db8e7'

const domainNames = [
  'PRIVATE-CREATION NORMALIZER',
  'LIVE-PUBLICATION NORMALIZER',
  'SETTLEMENT-CONSISTENCY',
] as const

const expectedPublisherKeys = [
  'diagnostic_contract_version',
  'classification',
  'repair_gate',
  'stop_reason',
  'stage',
  'executor_exact',
  'source_hashes_exact',
  'function_metadata_exact',
  'function_acls_exact',
  'catalog_lineage_exact',
  'relation_lineage_exact',
  'actor_account_exists',
  'actor_beta_access',
  'identity_binding_conflict',
  'private_row_domain_status',
  'private_row_count',
  'private_stale_group_context_count',
  'private_unsafe_title_count',
  'private_creation_domain_status',
  'private_creation_probe_count',
  'private_creation_attempted_count',
  'private_creation_success_count',
  'private_creation_known_rejection_count',
  'private_invalid_draft_count',
  'private_not_found_count',
  'private_event_unavailable_count',
  'private_source_changed_count',
  'private_duplicate_identity_count',
  'private_author_required_count',
  'private_event_dependency_not_found_count',
  'private_event_dependency_unavailable_count',
  'private_unexpected_p0001_count',
  'private_non_p0001_count',
  'live_publication_domain_status',
  'live_publication_probe_count',
  'live_publication_attempted_count',
  'live_publication_success_count',
  'live_publication_p0001_count',
  'live_publication_non_p0001_count',
  'settlement_domain_status',
  'settlement_probe_count',
  'settlement_attempted_count',
  'settlement_success_count',
  'settlement_p0001_count',
  'settlement_non_p0001_count',
  'diagnostic_invariants_exact',
  'sqlstate',
  'error_category',
] as const

const directPrivateRejections = [
  'expense_unconfirmed_not_found',
  'expense_unconfirmed_invalid_draft',
  'expense_unconfirmed_event_unavailable',
  'expense_unconfirmed_source_changed',
  'expense_unconfirmed_duplicate_identity',
  'expense_unconfirmed_author_required',
] as const

const nestedEventRejections = [
  'teskeid_event_not_found',
  'teskeid_event_unavailable',
] as const

const mandatoryStopMessages = [
  'expense_unconfirmed_invalid_input',
  'expense_unconfirmed_split_not_ready',
  'teskeid_event_invalid_input',
] as const

const expectedPrivateRowDomain = `
WITH private_creation_row_domain AS MATERIALIZED (
  SELECT draft.id AS draft_id,
    draft.context_type,
    draft.group_id,
    pg_catalog.btrim(draft.payload->>'title') AS emitted_title
  FROM public.expense_private_drafts AS draft
  WHERE draft.actor_user_id = p_actor_id
    AND draft.context_type IN ('one_off', 'group')
    AND NOT EXISTS (
      SELECT 1
      FROM public.expense_unconfirmed_publications AS publication
      WHERE publication.draft_id = draft.id
        AND publication.is_live
    )
)`

const expectedLineagePairs = [
  ['public.expense_list_dashboard_presentations_v1(uuid)', 'aad418eeda9d6b1dfe073c4109723d88'],
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

const requiredCatalogGuardFragments = [
  "pg_catalog.md5(pg_catalog.replace(routine.prosrc, E'\\r\\n', E'\\n'))",
  "observed.prokind = 'f'",
  'observed.actual_overload_count = 1',
  'observed.actual_arguments = observed.exact_arguments',
  'observed.actual_result = observed.result_type',
  'observed.lanname = observed.language_name',
  'observed.provolatile::text = observed.volatility',
  'observed.prosecdef = observed.security_definer',
  'observed.proisstrict = observed.is_strict',
  'NOT observed.proleakproof',
  'observed.proparallel::text = observed.parallel_safety',
  'observed.proretset = observed.returns_set',
  'observed.pronargdefaults = observed.default_count',
  'observed.proconfig = ARRAY[\'search_path=""\']::text[]',
  'observed.proowner = roles.postgres_oid',
  "dependency.refclassid = 'pg_catalog.pg_namespace'::pg_catalog.regclass",
  "observed.language_name = 'sql' OR EXISTS",
  "dependency.refclassid = 'pg_catalog.pg_language'::pg_catalog.regclass",
  "dependency.deptype = 'e'",
  "WHEN observed.language_name = 'plpgsql' THEN 2 ELSE 1",
  "dependency.deptype = 'n'",
  "acl.privilege_type = 'EXECUTE'",
  'acl.grantor = roles.postgres_oid',
  'NOT acl.is_grantable',
  'WHERE acl.grantee = roles.postgres_oid',
  'WHERE acl.grantee = roles.service_role_oid',
  "class_row.relkind = 'r'",
  "class_row.relpersistence = 'p'",
  'class_row.relrowsecurity',
  'class_row.relforcerowsecurity = manifest.force_rls',
  "owner_role.rolname = 'postgres'",
  'acl.grantor <> class_row.relowner OR acl.is_grantable',
  'attribute.attacl IS NOT NULL',
] as const

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function compact(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

function sha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`missing or unordered markers: ${start} -> ${end}`)
  }
  return source.slice(startIndex + start.length, endIndex)
}

function marked(source: string, label: string): string {
  return between(
    source,
    `-- BEGIN EXACT SQL171 ${label} DOMAIN\n`,
    `\n      -- END EXACT SQL171 ${label} DOMAIN`,
  )
}

function exactCtePrefix(source: string): string {
  const collectionStart = source.search(/\n\s*SELECT COALESCE\(/)
  return compact(collectionStart < 0 ? source : source.slice(0, collectionStart))
}

function sectionAfterDomain(source: string, label: string, endNeedle: RegExp): string {
  const marker = `-- END EXACT SQL171 ${label} DOMAIN`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`missing domain end marker: ${label}`)
  const remainder = source.slice(start + marker.length)
  const endMatch = endNeedle.exec(remainder)
  if (!endMatch || endMatch.index < 0) {
    throw new Error(`missing bounded consumer boundary: ${label}`)
  }
  return remainder.slice(0, endMatch.index)
}

function publisher(source: string): string {
  return between(
    source,
    '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER\n',
    '\n  -- END SAFE CONTROLLED EXCEPTION PUBLISHER',
  )
}

function catalogGate(source: string): string {
  return between(
    source,
    '      -- BEGIN EXACT SQL171 CATALOG LINEAGE GATE\n',
    '\n      -- END EXACT SQL171 CATALOG LINEAGE GATE',
  )
}

function functionManifest(source: string): string {
  return between(
    source,
    '        -- BEGIN EXACT SQL171 FUNCTION LINEAGE MANIFEST\n',
    '\n        -- END EXACT SQL171 FUNCTION LINEAGE MANIFEST',
  )
}

function publisherKeys(source: string): string[] {
  const block = publisher(source)
  const objectStart = block.indexOf('MESSAGE = pg_catalog.jsonb_build_object(\n')
  const objectEnd = block.lastIndexOf(')::text;')
  if (objectStart < 0 || objectEnd <= objectStart) {
    throw new Error('missing publisher jsonb_build_object')
  }
  const object = block.slice(
    objectStart + 'MESSAGE = pg_catalog.jsonb_build_object(\n'.length,
    objectEnd,
  )
  return [...object.matchAll(/^\s*'([^']+)'\s*,/gm)].map((match) => match[1])
}

function replaceInsideMarkedDomain(
  source: string,
  label: string,
  before: string,
  after: string,
): string {
  const startMarker = `-- BEGIN EXACT SQL171 ${label} DOMAIN\n`
  const endMarker = `\n      -- END EXACT SQL171 ${label} DOMAIN`
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end <= start) throw new Error(`missing domain: ${label}`)
  const bodyStart = start + startMarker.length
  const body = source.slice(bodyStart, end)
  const changed = body.replace(before, after)
  if (changed === body) throw new Error(`mutation source missing in domain: ${label}`)
  return source.slice(0, bodyStart) + changed + source.slice(end)
}

function validateDiagnostic(source: string): string[] {
  const errors: string[] = []

  try {
    if (compact(marked(source, 'PRIVATE-CREATION ROW')) !== compact(expectedPrivateRowDomain)) {
      errors.push('domain-drift:PRIVATE-CREATION ROW')
    }
  } catch {
    errors.push('domain-drift:PRIVATE-CREATION ROW')
  }

  for (const label of domainNames) {
    try {
      if (exactCtePrefix(marked(source, label)) !== exactCtePrefix(marked(v242Diagnostic, label))) {
        errors.push(`domain-drift:${label}`)
      }
    } catch {
      errors.push(`domain-drift:${label}`)
    }
  }

  for (const label of [
    'PRIVATE-CREATION ROW',
    ...domainNames,
  ] as const) {
    try {
      const consumer = sectionAfterDomain(
        source,
        label,
        /^\s*EXCEPTION WHEN OTHERS THEN$/m,
      )
      if (!/ORDER BY[\s\S]+LIMIT 101\b/i.test(consumer)) {
        errors.push(`unbounded-domain:${label}`)
      }
      if (!/(?:cardinality|count)[\s\S]*(?:=|>=|>)\s*101|(?:cardinality|count)[\s\S]*>\s*100/i.test(consumer)) {
        errors.push(`missing-over-limit-gate:${label}`)
      }
      if (!/over_limit/.test(consumer)) {
        errors.push(`missing-over-limit-status:${label}`)
      }
    } catch {
      errors.push(`unbounded-domain:${label}`)
    }
  }

  let classifier = ''
  try {
    classifier = between(
      source,
      '    -- BEGIN PRIVATE ROW-LOCAL CLASSIFIER\n',
      '\n    -- END PRIVATE ROW-LOCAL CLASSIFIER',
    )
  } catch {
    errors.push('private-classifier-missing')
  }
  if (classifier) {
    if (sha256(classifier) !== expectedPrivateClassifierSha256) {
      errors.push('private-classifier-bytes')
    }
    for (const message of [...directPrivateRejections, ...nestedEventRejections]) {
      if (occurrences(classifier, `'${message}'`) !== 1) {
        errors.push(`private-allowlist:${message}`)
      }
    }
    for (const message of mandatoryStopMessages) {
      if (new RegExp(`['"]${message}['"][\\s\\S]{0,180}(?:known|success)`, 'i').test(classifier)) {
        errors.push(`unsafe-private-allowlist:${message}`)
      }
    }
    if (/WHEN\s+(?:SQLSTATE\s+'P0001'|v_[a-z0-9_]*sqlstate\s*=\s*'P0001')[\s\S]{0,160}(?:known_rejection|success)/i.test(classifier)) {
      errors.push('catch-all-private-p0001')
    }
    const classifiedMessages = [...classifier.matchAll(/^\s*WHEN '([^']+)' THEN$/gm)]
      .map((match) => match[1])
    if (classifiedMessages.join('|') !== [
      'expense_unconfirmed_invalid_draft',
      'expense_unconfirmed_not_found',
      'expense_unconfirmed_event_unavailable',
      'expense_unconfirmed_source_changed',
      'expense_unconfirmed_duplicate_identity',
      'expense_unconfirmed_author_required',
      'teskeid_event_not_found',
      'teskeid_event_unavailable',
    ].join('|')) {
      errors.push('private-allowlist-shape')
    }
    if (occurrences(classifier, 'draft.actor_user_id = p_actor_id') !== 2
      || occurrences(classifier, "draft.context_type = 'one_off'") !== 2
      || occurrences(classifier, "draft.payload->'linkToEvent'") !== 2
      || classifier.includes("(draft.payload->>'linkToEvent')::boolean")
      || occurrences(classifier, "pg_catalog.jsonb_typeof(draft.payload->'eventId') = 'string'") !== 2
      || occurrences(classifier, "draft.payload->'eventRosterRevision'") !== 2
      || occurrences(classifier, "draft.payload->>'eventRosterRevision'") !== 6
      || occurrences(classifier, "~ '^[1-9][0-9]*$'") !== 2
      || occurrences(classifier, '<= 9007199254740991') !== 2
      || occurrences(classifier, 'FROM auth.users AS account') !== 2
      || occurrences(classifier, 'COALESCE(public.expense_has_beta_access(p_actor_id), false)') !== 2
      || occurrences(classifier, 'INTO v_nested_event_row_local;') !== 2) {
      errors.push('nested-event-guard')
    }
    if (!/(?:ELSE|NOT FOUND)[\s\S]{0,180}(?:unexpected_p0001|repair_gate|stop_reason)/i.test(classifier)) {
      errors.push('unknown-private-p0001-not-stopped')
    }
  }

  const firstDomain = source.indexOf('-- BEGIN EXACT SQL171 PRIVATE-CREATION ROW DOMAIN')
  const firstApplicationRead = source.indexOf('SELECT 1 FROM auth.users AS account')
  const firstHelperCall = source.indexOf('PERFORM public.expense_sql159_normalize_private_draft(')
  const lineageSignals = [
    'aad418eeda9d6b1dfe073c4109723d88',
    '18a6e628bdb1d3c175b515541ab56787',
    '9c4af07a07906c4dac6f06da94b42b37',
    'b58245a47cc0c8e306a8769afa508687',
    '4ba9308ba12eef6405ed24916bc0bb74',
    '25394edc6b084676921c3a65b1f19a8a',
    '9fdcb060bd933599b8f04fe42da27874',
    'e6dc71178a96bb4f398d61b44b39c57a',
  ]
  if (firstDomain < 0 || firstHelperCall < 0
    || lineageSignals.some((hash) => {
      const position = source.indexOf(hash)
      return position < 0 || position > firstApplicationRead
        || position > firstDomain || position > firstHelperCall
    })) {
    errors.push('lineage-before-data')
  }
  for (const signal of [
    'source_hashes_exact',
    'function_metadata_exact',
    'function_acls_exact',
    'catalog_lineage_exact',
    'relation_lineage_exact',
  ]) {
    if (!source.includes(signal)) errors.push(`missing-lineage:${signal}`)
  }
  if (!/pg_catalog\.aclexplode|information_schema\.role_routine_grants/i.test(source)
    || !/proconfig|prosecdef|provolatile|proparallel/i.test(source)
    || !/relrowsecurity|relforcerowsecurity/i.test(source)) {
    errors.push('incomplete-catalog-lineage')
  }

  const expectedFunctions = functionManifest(source)
  try {
    if (sha256(functionManifest(source)) !== expectedFunctionManifestSha256) {
      errors.push('function-manifest-bytes')
    }
  } catch {
    errors.push('function-manifest-bytes')
  }
  const manifestCount = [...expectedFunctions.matchAll(/(?:^|\n)\s*\('/g)].length
  const frozenCounts = [...source.matchAll(/pg_catalog\.count\(check_row\.oid\) = (\d+)/g)]
    .map((match) => Number(match[1]))
  if (manifestCount < 1 || frozenCounts.length !== 4
    || frozenCounts.some((count) => count !== manifestCount)) {
    errors.push('function-manifest-count')
  }
  if (expectedLineagePairs.length !== manifestCount
    || expectedLineagePairs.some(([signature, hash]) =>
      occurrences(expectedFunctions, `'${signature}'`) !== 1
        || occurrences(expectedFunctions, `'${hash}'`) !== 1)) {
    errors.push('function-manifest-drift')
  }
  let guardedCatalog = ''
  try {
    guardedCatalog = catalogGate(source)
    if (sha256(guardedCatalog) !== expectedCatalogGateSha256) {
      errors.push('catalog-gate-bytes')
    }
  } catch {
    errors.push('catalog-gate-boundary')
  }
  if (!guardedCatalog || requiredCatalogGuardFragments.some(
    (fragment) => !compact(guardedCatalog).includes(compact(fragment)),
  )) {
    errors.push('catalog-guard-weakened')
  }

  try {
    const privateRowConsumer = sectionAfterDomain(
      source,
      'PRIVATE-CREATION ROW',
      /^\s*EXCEPTION WHEN OTHERS THEN$/m,
    )
    for (const fragment of [
      "domain.context_type = 'group'",
      "expense_group.status = 'active'",
      'public.expense_active_member_role(',
      ') IS NOT NULL',
      'domain.emitted_title IS NULL',
      'pg_catalog.btrim(domain.emitted_title, v_js_whitespace)',
      "U&'[\\+010000-\\+10FFFF]'",
      'NOT BETWEEN 1 AND 200',
      "U&'[\\0001-\\001F\\007F-\\009F\\202A-\\202E\\2066-\\2069]'",
      'domain.emitted_title ~ v_email_shaped_pattern',
    ]) {
      if (!compact(privateRowConsumer).includes(compact(fragment))) {
        errors.push('private-row-classification-drift')
        break
      }
    }
  } catch {
    errors.push('private-row-classification-drift')
  }

  try {
    const output = publisher(source)
    if (publisherKeys(source).join('|') !== expectedPublisherKeys.join('|')) {
      errors.push('publisher-schema')
    }
    if (/p_actor_id|v_(?:probe|candidate)_(?:actor|draft|group|expense|event)_id|MESSAGE_TEXT|v_[a-z0-9_]*message|SQLERRM|PG_EXCEPTION_(?:DETAIL|HINT|CONTEXT)|\b(?:DETAIL|HINT|CONTEXT)\s*=/i.test(output)) {
      errors.push('publisher-private-flow')
    }
  } catch {
    errors.push('publisher-schema')
  }

  if (/RAISE NOTICE/i.test(source)
    || occurrences(source, 'RAISE EXCEPTION') !== 1
    || occurrences(source, 'RAISE EXCEPTION USING') !== 1
    || occurrences(source, "ERRCODE = 'P1701'") !== 1) {
    errors.push('controlled-transport')
  }
  if (/^\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|NOTIFY|COMMIT|BEGIN TRANSACTION|START TRANSACTION)\b/im.test(source)
    || /\b(?:set_config|current_setting|request\.jwt|pg_advisory|nextval|setval)\b/i.test(source)
    || /\bEXECUTE\s+(?:FORMAT|v_|')/i.test(source)
    || /(?:PERFORM|CALL|FROM|JOIN)\s+public\.expense_list_dashboard_presentations_v1\s*\(/i.test(source)) {
    errors.push('not-read-only')
  }
  if (/'[ \t]*(?:\r?\n[ \t]*)+(?:U&|E|B|X|N)'/i.test(source)) {
    errors.push('adjacent-prefixed-string-literal')
  }

  return [...new Set(errors)]
}

describe('SQL171 aggregate projection-helper diagnostic', () => {
  it('freezes the exact operator-delivery template bytes', () => {
    expect(sha256(diagnosticRaw)).toBe(expectedDiagnosticSha256)
  })

  it('uses explicit operators between every prefixed Unicode literal fragment', () => {
    const unicodeConstants = between(
      diagnostic,
      '  v_js_whitespace constant text :=\n',
      '\n\n  v_executor_exact boolean',
    )
    expect(occurrences(unicodeConstants, "' ||\n    U&'")).toBe(6)
    expect(validateDiagnostic(diagnostic))
      .not.toContain('adjacent-prefixed-string-literal')

    for (const prefix of ['U&', 'E', 'B', 'X', 'N']) {
      const invalid = diagnostic.replace(
        " ||\n    U&'",
        `\n    ${prefix}'`,
      )
      expect(invalid).not.toBe(diagnostic)
      expect(validateDiagnostic(invalid))
        .toContain('adjacent-prefixed-string-literal')
    }
  })

  it('is one bounded, private-input anonymous diagnostic', () => {
    expect(diagnostic).toMatch(/^-- SQL171 .*DIAGNOSTIC TEMPLATE:/)
    expect(occurrences(diagnostic, placeholder)).toBe(1)
    expect(diagnostic).toContain(`p_actor_id := '${placeholder}'::uuid;`)
    expect(occurrences(diagnostic, 'DO $sql171_aggregate_diagnostic$')).toBe(1)
    expect(diagnostic.trimEnd().endsWith('$sql171_aggregate_diagnostic$;')).toBe(true)
    expect(diagnostic).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
    expect(validateDiagnostic(diagnostic)).toEqual([])
  })

  it('freezes the exact SQL171 candidate domains and the private base-row domain', () => {
    expect(sha256(v242DiagnosticRaw)).toBe(reviewedV242DiagnosticSha256)
    for (const label of domainNames) {
      expect(exactCtePrefix(marked(diagnostic, label)))
        .toBe(exactCtePrefix(marked(v242Diagnostic, label)))
    }
    const privateRows = marked(diagnostic, 'PRIVATE-CREATION ROW')
    expect(compact(privateRows)).toBe(compact(expectedPrivateRowDomain))
    for (const exactClause of [
      'FROM public.expense_private_drafts AS draft',
      'WHERE draft.actor_user_id = p_actor_id',
      "draft.context_type IN ('one_off', 'group')",
      'publication.draft_id = draft.id',
      'publication.is_live',
    ]) expect(compact(privateRows)).toContain(compact(exactClause))
    expect(privateRows).not.toContain("draft.current_step = 'split'")
    expect(privateRows).not.toContain('summary.total_minor IS NOT NULL')
  })

  it('bounds all domains at 101 and rejects predicate broadening or lost bounds', () => {
    for (const [label, before, after] of [
      [
        'PRIVATE-CREATION ROW',
        'WHERE draft.actor_user_id = p_actor_id',
        'WHERE (draft.actor_user_id = p_actor_id OR draft.actor_user_id IS DISTINCT FROM p_actor_id)',
      ],
      [
        'PRIVATE-CREATION NORMALIZER',
        'WHERE draft.actor_user_id = p_actor_id',
        'WHERE (draft.actor_user_id = p_actor_id OR draft.actor_user_id IS DISTINCT FROM p_actor_id)',
      ],
      [
        'LIVE-PUBLICATION NORMALIZER',
        'publication.actor_user_id = p_actor_id',
        '(publication.actor_user_id = p_actor_id OR publication.actor_user_id IS DISTINCT FROM p_actor_id)',
      ],
      [
        'SETTLEMENT-CONSISTENCY',
        'member.user_id = p_actor_id',
        '(member.user_id = p_actor_id OR member.user_id IS DISTINCT FROM p_actor_id)',
      ],
    ] as const) {
      const broadened = replaceInsideMarkedDomain(diagnostic, label, before, after)
      expect(broadened).not.toBe(diagnostic)
      expect(validateDiagnostic(broadened)).toContain(`domain-drift:${label}`)
    }

    const unbounded = diagnostic.replace(/\n\s*LIMIT 101\b/g, '')
    expect(unbounded).not.toBe(diagnostic)
    expect(validateDiagnostic(unbounded).some((error) => error.startsWith('unbounded-domain:')))
      .toBe(true)

    const overLimitGate = diagnostic.indexOf("v_stop_reason := 'domain_over_limit';")
    const firstLoop = diagnostic.indexOf('FOREACH v_probe_draft_id')
    expect(overLimitGate).toBeGreaterThan(
      diagnostic.indexOf("v_settlement_domain_status := CASE"),
    )
    expect(firstLoop).toBeGreaterThan(overLimitGate)
    expect(diagnostic.slice(overLimitGate, firstLoop)).toContain(
      'IF v_stop_reason IS NULL THEN',
    )
  })

  it('allows only exact row-local private P0001 messages with nested Event gates', () => {
    const classifier = between(
      diagnostic,
      '    -- BEGIN PRIVATE ROW-LOCAL CLASSIFIER\n',
      '\n    -- END PRIVATE ROW-LOCAL CLASSIFIER',
    )
    expect(sha256(classifier)).toBe(expectedPrivateClassifierSha256)
    for (const message of [...directPrivateRejections, ...nestedEventRejections]) {
      expect(occurrences(classifier, `'${message}'`)).toBe(1)
    }
    for (const message of mandatoryStopMessages) {
      expect(classifier).not.toMatch(
        new RegExp(`['"]${message}['"][\\s\\S]{0,180}(?:known|success)`, 'i'),
      )
    }
    expect(validateDiagnostic(diagnostic)).not.toContain('nested-event-guard')
    expect(occurrences(classifier, "WHEN SQLSTATE 'P0001' THEN")).toBe(1)
    expect(occurrences(classifier, 'WHEN OTHERS THEN')).toBe(1)
    expect(occurrences(classifier, 'GET STACKED DIAGNOSTICS')).toBe(1)
    expect(occurrences(classifier, "draft.payload->'linkToEvent'")).toBe(2)
    expect(classifier).not.toContain("(draft.payload->>'linkToEvent')::boolean")
    expect(occurrences(classifier, "draft.payload->'eventRosterRevision'")).toBe(2)
    expect(occurrences(classifier, "draft.payload->>'eventRosterRevision'")).toBe(6)
    const privateCall = classifier.indexOf(
      'PERFORM public.expense_sql159_normalize_private_draft(',
    )
    const successIncrement = classifier.indexOf(
      'v_private_creation_success_count + 1;',
    )
    expect(privateCall).toBeGreaterThan(-1)
    expect(successIncrement).toBeGreaterThan(privateCall)

    const catchAll = diagnostic.replace(
      "          WHEN SQLSTATE 'P0001' THEN\n            GET STACKED DIAGNOSTICS",
      "          WHEN SQLSTATE 'P0001' THEN\n            v_private_creation_known_rejection_count :=\n              COALESCE(v_private_creation_known_rejection_count, 0) + 1;\n            GET STACKED DIAGNOSTICS",
    )
    expect(catchAll).not.toBe(diagnostic)
    expect(validateDiagnostic(catchAll)).toContain('catch-all-private-p0001')
  })

  it('keeps live-publication and settlement failures fail-closed', () => {
    for (const counter of [
      'v_live_publication_p0001_count',
      'v_live_publication_non_p0001_count',
      'v_settlement_p0001_count',
      'v_settlement_non_p0001_count',
    ]) expect(diagnostic).toContain(counter)
    expect(diagnostic).toMatch(/live_publication_failure/)
    expect(diagnostic).toMatch(/settlement_failure/)
    expect(diagnostic).toContain("v_repair_gate text := 'stop';")
    expect(occurrences(diagnostic, "v_repair_gate := 'pass';")).toBe(1)
  })

  it('gates catalog source, metadata, ACL and relation lineage before all probes', () => {
    expect(validateDiagnostic(diagnostic)).not.toContain('lineage-before-data')
    expect(validateDiagnostic(diagnostic)).not.toContain('incomplete-catalog-lineage')
    const firstDomain = diagnostic.indexOf('-- BEGIN EXACT SQL171 PRIVATE-CREATION ROW DOMAIN')
    expect(diagnostic.indexOf('aad418eeda9d6b1dfe073c4109723d88')).toBeLessThan(firstDomain)
    expect(diagnostic.indexOf('18a6e628bdb1d3c175b515541ab56787')).toBeLessThan(firstDomain)
    expect(diagnostic.indexOf('b58245a47cc0c8e306a8769afa508687')).toBeLessThan(firstDomain)
    expect(validateDiagnostic(diagnostic)).not.toContain('function-manifest-count')
    expect(validateDiagnostic(diagnostic)).not.toContain('function-manifest-drift')
    expect(validateDiagnostic(diagnostic)).not.toContain('function-manifest-bytes')
    expect(sha256(functionManifest(diagnostic))).toBe(expectedFunctionManifestSha256)
    expect(validateDiagnostic(diagnostic)).not.toContain('catalog-guard-weakened')
    expect(diagnostic.indexOf("v_stop_reason := 'lineage_mismatch';"))
      .toBeLessThan(diagnostic.indexOf("v_stage := 'actor_admission';"))
    expect(diagnostic.indexOf('-- BEGIN EXACT SQL171 CATALOG LINEAGE GATE'))
      .toBeLessThan(diagnostic.indexOf("v_stage := 'actor_admission';"))
    expect(sha256(catalogGate(diagnostic))).toBe(expectedCatalogGateSha256)

    const weakened = diagnostic.replace(
      'AND observed.prosecdef = observed.security_definer',
      'AND true',
    )
    expect(weakened).not.toBe(diagnostic)
    expect(validateDiagnostic(weakened)).toContain('catalog-guard-weakened')
  })

  it('publishes one fixed aggregate-only P1701 object with no private flow', () => {
    expect(publisherKeys(diagnostic)).toEqual(expectedPublisherKeys)
    expect(expectedPublisherKeys.length * 2).toBeLessThanOrEqual(100)
    expect(occurrences(diagnostic, 'RAISE NOTICE')).toBe(0)
    expect(occurrences(diagnostic, 'RAISE EXCEPTION')).toBe(1)
    expect(occurrences(diagnostic, 'RAISE EXCEPTION USING')).toBe(1)
    expect(occurrences(diagnostic, "ERRCODE = 'P1701'")).toBe(1)
    expect(validateDiagnostic(diagnostic)).not.toContain('publisher-private-flow')

    const leaked = diagnostic.replace(
      "      'error_category', v_error_category\n    )::text;",
      "      'error_category', v_error_category,\n      'actor_uuid', p_actor_id\n    )::text;",
    )
    expect(leaked).not.toBe(diagnostic)
    expect(validateDiagnostic(leaked)).toContain('publisher-private-flow')
    expect(validateDiagnostic(leaked)).toContain('publisher-schema')

    const publisherStart = diagnostic.indexOf(
      '  -- BEGIN SAFE CONTROLLED EXCEPTION PUBLISHER',
    )
    expect(publisherStart).toBeGreaterThan(diagnostic.lastIndexOf('EXCEPTION WHEN'))
    expect(publisherStart).toBeGreaterThan(diagnostic.lastIndexOf('END LOOP;'))
    const publisherEnd = diagnostic.indexOf(
      '  -- END SAFE CONTROLLED EXCEPTION PUBLISHER',
    )
    expect(diagnostic.slice(
      publisherEnd + '  -- END SAFE CONTROLLED EXCEPTION PUBLISHER'.length,
    )).toMatch(/^\nEND;\n\$sql171_aggregate_diagnostic\$;\n?$/)
  })

  it('is catalog/application-row read-only and never invokes the installed dashboard target', () => {
    expect(validateDiagnostic(diagnostic)).not.toContain('not-read-only')
    expect(diagnostic).toContain('GET STACKED DIAGNOSTICS')
    expect(diagnostic).toContain('MESSAGE_TEXT')
    expect(publisher(diagnostic)).not.toMatch(/MESSAGE_TEXT|v_[a-z0-9_]*message/i)
  })

  it('freezes SQL111 stale-group and parser-equivalent unsafe-title evidence', () => {
    expect(validateDiagnostic(diagnostic)).not.toContain('private-row-classification-drift')

    const staleGroupWeakened = diagnostic.replace(
      "expense_group.status = 'active'",
      'true',
    )
    expect(staleGroupWeakened).not.toBe(diagnostic)
    expect(validateDiagnostic(staleGroupWeakened))
      .toContain('private-row-classification-drift')

    const titleWeakened = diagnostic.replace(
      'domain.emitted_title ~ v_email_shaped_pattern',
      'false',
    )
    expect(titleWeakened).not.toBe(diagnostic)
    expect(validateDiagnostic(titleWeakened))
      .toContain('private-row-classification-drift')
  })
})
