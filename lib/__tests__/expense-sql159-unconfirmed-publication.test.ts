import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migrationPath = 'sql/159_expense_unconfirmed_publication_and_finalization.sql'
const validationRoot = 'sql/validation/159-expense-unconfirmed-publication'

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n')
}

function bytes(path: string): Buffer {
  return readFileSync(join(root, path))
}

const migration = read(migrationPath)
const preflight = read(`${validationRoot}/preflight.sql`)
const diagnostic = read(`${validationRoot}/diagnose-preflight.sql`)
const lineageDiagnostic = read(`${validationRoot}/diagnose-exact-draft-lineage.sql`)
const postflight = read(`${validationRoot}/postflight.sql`)
const recovery = read(`${validationRoot}/recovery.sql`)
const readme = read(`${validationRoot}/README.md`)
const sql160Path = 'sql/160_expense_sql159_jsonb_input_precedence_fix.sql'
const sql160ValidationRoot = 'sql/validation/160-expense-sql159-jsonb-input-precedence-fix'
const sql160 = read(sql160Path)
const sql160Preflight = read(`${sql160ValidationRoot}/preflight.sql`)
const sql160Postflight = read(`${sql160ValidationRoot}/postflight.sql`)
const sql160Recovery = read(`${sql160ValidationRoot}/recovery.sql`)
const sql160Readme = read(`${sql160ValidationRoot}/README.md`)

function functionBody(name: string): string {
  const match = migration.match(new RegExp(
    `CREATE FUNCTION public\\.${name}\\([\\s\\S]*?`
      + `AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ))
  expect(match, name).not.toBeNull()
  return match?.[1] ?? ''
}

function functionDefinition(name: string): string {
  const start = migration.indexOf(`CREATE FUNCTION public.${name}(`)
  const end = migration.indexOf('AS $function$', start)
  expect(start, name).toBeGreaterThanOrEqual(0)
  expect(end, name).toBeGreaterThan(start)
  return migration.slice(start, end)
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

function sha256(path: string): string {
  return createHash('sha256').update(bytes(path)).digest('hex')
}

function singleColumnValues(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start, startMarker).toBeGreaterThanOrEqual(0)
  expect(end, endMarker).toBeGreaterThan(start)
  return [...source.slice(start, end).matchAll(/\('([^']+)'\)/g)]
    .map((match) => match[1])
}

function expectedIndexNames(source: string) {
  const startMarker = 'expected_indexes(\n'
  const endMarker = '), index_contract AS ('
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start, startMarker).toBeGreaterThanOrEqual(0)
  expect(end, endMarker).toBeGreaterThan(start)
  return [...source.slice(start, end).matchAll(
    /\(\s*'[^']+'\s*,\s*'([^']+)'\s*,/g,
  )].map((match) => match[1])
}

function valuesRowCount(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start, startMarker).toBeGreaterThanOrEqual(0)
  expect(end, endMarker).toBeGreaterThan(start)
  return source.slice(start, end).split('\n')
    .filter((line) => /^\s*\('/.test(line)).length
}

const internalFunctions = [
  'expense_sql159_amount_minor',
  'expense_sql159_probe_event_id',
  'expense_sql159_event_scope_read_only',
  'expense_sql159_event_scope_allows',
  'expense_sql159_audience_allows',
  'expense_sql159_guard_private_draft_insert',
  'expense_sql159_guard_private_draft_delete',
  'expense_sql159_normalize_private_draft',
  'expense_sql159_percentage_basis_points',
  'expense_sql159_weight',
  'expense_sql159_allocate_weighted',
  'expense_sql159_snapshot_is_valid',
  'expense_sql159_private_event_summary',
] as const

const serviceFunctions = [
  'expense_finalize_private_draft',
  'expense_get_private_draft_publication_lifecycle',
  'expense_share_private_draft',
  'expense_unshare_private_draft',
  'expense_list_visible_shared_drafts',
  'expense_get_shared_draft_detail',
  'expense_list_group_shared_drafts',
  'teskeid_event_get_expense_pre_active_v1',
] as const

const allFunctions = [...internalFunctions, ...serviceFunctions]

const functionHashes: Record<(typeof allFunctions)[number], string> = {
  expense_sql159_amount_minor: '5a4124296ff7e6f19d42342815be8109',
  expense_finalize_private_draft: '14ac1abc9046fea4812ac652a9b96088',
  expense_sql159_probe_event_id: '7600bd78711a0296ef545e0595c788b1',
  expense_sql159_event_scope_read_only: '4ba9308ba12eef6405ed24916bc0bb74',
  expense_sql159_event_scope_allows: '0be29be5cda2d34bf41dc2f67e0afa2e',
  expense_sql159_audience_allows: '9c4af07a07906c4dac6f06da94b42b37',
  expense_sql159_guard_private_draft_insert: '739e7c5c77dc08aa64c352627f21120a',
  expense_sql159_guard_private_draft_delete: 'cd349b0ef1810c51deb229ae64eade33',
  expense_get_private_draft_publication_lifecycle: '16fd85b239a880a4c0c12c3b0a078151',
  expense_share_private_draft: 'ca805bbd38dbd013e1c034e0049432ec',
  expense_unshare_private_draft: '9d440591ad52a108f3e6a5212722c1fa',
  expense_sql159_normalize_private_draft: '18a6e628bdb1d3c175b515541ab56787',
  expense_sql159_percentage_basis_points: 'ad0deb049185b7f6519bc0c3154201ac',
  expense_sql159_weight: 'c29cee4a8de2c95e138aad00af3fd4fe',
  expense_sql159_allocate_weighted: '7d38f3ac0f65a2b16aac5a53c9a09e8f',
  expense_sql159_snapshot_is_valid: 'af4b9f8a5f0b422956fc1d664021baff',
  expense_sql159_private_event_summary: 'e75a609fc4f231b0cfda3d5fb2679d9b',
  expense_list_visible_shared_drafts: '59b01785320ce254fb4ac7d6168709bc',
  expense_get_shared_draft_detail: '51a607ab9bc5e5ad5a19f4b9d96aa00b',
  expense_list_group_shared_drafts: '0a06c9d47c9c17dad77c715fbef50d55',
  teskeid_event_get_expense_pre_active_v1: '4332f4ccfd5e58f2e17ebe9389c13311',
}

const predecessorFiles: Record<string, string> = {
  'sql/96_expenses_core.sql': '884eefb28ef7d00f0584296a7bf9a6e15985f9b778d275921622bad7181665c9',
  'sql/102_expense_private_drafts.sql': 'f2a48da7a63439234ff4fba4e055ce968c8aee80507664bbbd7f867ce5fd8195',
  'sql/105_expense_edit_member_reference_fix.sql': 'ac67276cc32f3b8ee049534f2180e5a731a15a895dcd5d92cc21677b2be8f2fc',
  'sql/108_relationship_labels_circles_expense_context.sql': 'fb01f85122d00af113ccad335d7467e159964127ea864ee9f2c747181bdd562a',
  'sql/110_expense_unified_participant_invitations.sql': '3dcf57985f411666dfd0c72dea7bf75ee9816c22bf93c1b8c457572902844bf6',
  'sql/111_expense_incomplete_draft_directory.sql': '3e2a7632108681248bbb11f6dfae9ae61f3f13a6ab6cc3bff4ca8fee8a11c033',
  'sql/132_independent_events_and_tagged_expenses.sql': '51b7976e3b009b462cd046d2c13ee94396b2ecb07b42a07bd5fe0480362b1a61',
  'sql/133_event_guest_identity_linking.sql': '412b6e5f0c539e36689d0986886a83e2e8693ba33b2adc238c11b7f4dcf35386',
  'sql/137_event_organizer_expense_projection_and_backlink.sql': '8d5f9b7b189409211d76d1bf65c05152fd0af1250e9ca69d349063160b7ce90d',
  'sql/141_expense_canonical_identity_and_claim_disputes.sql': 'a658e74c8eb50321cdf0b9d5ec3c2ed68033030730d8a04fed2ab7ae349554d1',
  'sql/149_event_participant_identity_display.sql': '2fd5f001038a3ecb24133c5c424fe5eda02850603ee54aaf283b5b8287aeef39',
  'sql/151_event_viewer_relationship_greatest_hotfix.sql': 'e9cb15930b07296c245389e90ce68330eaaa0b0f7b8edbe92d072f1dd323b174',
  'sql/153_event_opt_out_scoped_participant_access.sql': '74a3cd263df9374470ac28e13ce018d78c701f94417f7e01f4f7cc4e3b07b7ca',
  'sql/157_event_expense_link_visibility.sql': '48e96f7aa5dcb6d61e312a32764904a5985297f5500f960cc1b076a44b41fbb2',
  'sql/158_event_expense_activity_v3.sql': '660ef0e10b7d771351ce75bcdf7d8fc1f25c006d338f5bdd022923bbc841b9aa',
}

const predecessorWriterSignatures = [
  'public.expense_create_expense(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb)',
  'public.expense_create_expense_with_circle_context(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb)',
  'public.expense_create_expense_with_known_members(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
  'public.expense_create_expense_with_participants(uuid,uuid,uuid,uuid,text,bigint,text,date,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)',
  'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
  'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
  'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
] as const

const predecessorDependencySignatures = [
  'public.expense_has_beta_access(uuid)',
  'public.expense_assert_beta_actor(uuid)',
  'public.expense_active_member_role(uuid,uuid)',
  'public.expense_begin_request(uuid,uuid,text,text)',
  'public.expense_finish_request(uuid,uuid,jsonb)',
  'public.expense_assert_private_draft_context(uuid,text,uuid,uuid)',
  'public.expense_identity_request_id(text,uuid)',
  'public.teskeid_event_assert_session_actor(uuid)',
  'public.teskeid_event_assert_actor(uuid)',
  'public.teskeid_event_assert_financial_actor(uuid)',
  'public.teskeid_event_begin_request(uuid,uuid,text,text,boolean)',
  'public.teskeid_event_finish_request(uuid,uuid,jsonb)',
  'public.teskeid_event_private_scope_v3(uuid,uuid)',
  'public.teskeid_event_get_legacy_expense_source_v2(uuid,uuid)',
  'public.teskeid_event_uuid_from_text(text)',
  'public.normalize_email_canonical(text)',
  'public.teskeid_event_normalize_text(text)',
  'public.teskeid_event_valid_text(text,integer,integer)',
  'public.teskeid_event_private_normalize_shared_name_v2(text)',
  'public.teskeid_event_private_valid_shared_name_v2(text)',
  'public.teskeid_event_private_valid_canonical_email_v2(text)',
  'public.teskeid_event_private_safe_profile_name_v2(uuid)',
  'public.teskeid_event_private_viewer_relationship_v2(uuid,uuid,uuid,text)',
  'public.teskeid_event_private_legacy_person_v2(uuid,uuid,uuid,text,integer)',
  'public.teskeid_event_private_legacy_people_v2(uuid,uuid,text)',
] as const

const effectivePredecessorSignatures = [
  ...predecessorWriterSignatures,
  ...predecessorDependencySignatures,
]

function predecessorContractRows(source: string) {
  const baselineMarker = 'baseline_predecessor_expected(signature, is_writer) AS (VALUES'
  const directMarker = 'predecessor_expected(signature, is_writer) AS (VALUES'
  const marker = source.includes(baselineMarker) ? baselineMarker : directMarker
  const start = source.indexOf(marker)
  const endMarker = marker === baselineMarker
    ? '), baseline_predecessor_facts'
    : '), predecessor_facts'
  const end = source.indexOf(endMarker, start)
  expect(start, marker).toBeGreaterThanOrEqual(0)
  expect(end, endMarker).toBeGreaterThan(start)
  return [...source.slice(start, end).matchAll(
    /\('([^']+)',\s*(true|false)\)/g,
  )].map((match) => ({
    signature: match[1],
    isWriter: match[2] === 'true',
  }))
}

function expectReadOnlyValidator(source: string) {
  expect(source.match(/^BEGIN;$/gm)).toHaveLength(1)
  expect(source).toContain('SET TRANSACTION READ ONLY;')
  expect(source).toContain("SET LOCAL search_path = '';")
  expect(source).toContain("SET LOCAL timezone = 'UTC';")
  expect(source.match(/^ROLLBACK;$/gm)).toHaveLength(1)
  expect(source.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  expect(source).not.toMatch(/^COMMIT;$/gm)
  expect(source).not.toMatch(
    /^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|NOTIFY)\b/gim,
  )
  expect(source).not.toMatch(/pg_(?:advisory|try_advisory)_xact_lock/i)
}

describe('SQL159 unconfirmed Expense publication and finalization', () => {
  it('pins every effective predecessor migration byte-for-byte', () => {
    for (const [path, hash] of Object.entries(predecessorFiles)) {
      expect(sha256(path), path).toBe(hash)
    }
  })

  it('freezes all 32 effective predecessor functions and only seven writers', () => {
    const writers = new Set<string>(predecessorWriterSignatures)
    const expectedRows = effectivePredecessorSignatures.map((signature) => ({
      signature,
      isWriter: writers.has(signature),
    }))
    expect(expectedRows).toHaveLength(32)
    expect(predecessorWriterSignatures).toHaveLength(7)
    for (const source of [migration, preflight, diagnostic, postflight]) {
      expect(predecessorContractRows(source)).toEqual(expectedRows)
    }
    expect(migration).toContain(
      'pg_catalog.jsonb_array_length(v_baseline.predecessor_contract) <> 32',
    )
    for (const validator of [preflight, diagnostic, postflight]) {
      expect(validator).toMatch(/predecessor_count_exact[\s\S]*?32|count\(\*\) = 32/)
    }
  })

  it('is one additive atomic migration with exactly six private relations', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(migration).toContain('pg_advisory_xact_lock(159159)')
    expect(migration).toContain("SET LOCAL search_path = '';")
    expect(migration).toContain("SET LOCAL timezone = 'UTC';")
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE)\b/gim)
    expect(migration).not.toContain("NOTIFY pgrst, 'reload schema'")

    const tables = [...migration.matchAll(
      /^CREATE TABLE public\.([a-z0-9_]+) \(/gm,
    )].map((match) => match[1])
    expect(tables).toEqual([
      'expense_unconfirmed_publications',
      'expense_unconfirmed_publication_parties',
      'expense_unconfirmed_publication_audience',
      'expense_unconfirmed_finalizations',
      'expense_private_draft_tombstones',
      'expense_sql159_install_baseline',
    ])
    for (const table of tables) {
      expect(migration).toContain(`to_regclass('public.${table}')`)
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      )
      expect(migration).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      )
      expect(migration).toContain(`ALTER TABLE public.${table} OWNER TO postgres;`)
    }
    for (const validator of [preflight, diagnostic]) {
      expect(singleColumnValues(
        validator,
        'target_relations(name) AS (VALUES\n',
        '), target_relation_state',
      )).toEqual(tables)
    }
    expect(migration).toContain("'TRIGGER', 'MAINTAIN'")
    expect(migration).toMatch(
      /server_version_num'[\s\S]*?>= 170000 THEN 1 ELSE 0 END/,
    )
    expect(migration).not.toMatch(/CREATE POLICY/i)
    expect(migration).not.toMatch(
      /REFERENCES public\.expense_private_drafts\s*\(/i,
    )
    expect(migration).toContain('binding_generation    bigint      NULL')
    expect(migration).not.toMatch(/binding_generation\s+uuid/i)
  })

  it('performs no publication/finalization backfill at install time', () => {
    const withoutFunctions = migration.replace(
      /AS \$function\$[\s\S]*?\$function\$;/g,
      'AS $function$<function body>$function$;',
    )
    expect(withoutFunctions).not.toMatch(
      /INSERT INTO public\.expense_unconfirmed_(?:publications|publication_parties|publication_audience|finalizations)/,
    )
    expect(withoutFunctions).not.toContain(
      'INSERT INTO public.expense_private_draft_tombstones',
    )
    expect(withoutFunctions).toContain(
      'INSERT INTO public.expense_sql159_install_baseline',
    )
    expect(migration).toContain('new_relations_began_empty')
    expect(migration).toContain('new_relations.began_empty')
    expect(migration).toContain("SELECT 'expense_mutation_requests'")
    expect(migration).toContain("SELECT 'teskeid_event_mutation_requests'")
    expect(migration).toContain(
      "to_regclass('public.teskeid_event_mutation_requests')",
    )
  })

  it('creates exactly 21 functions and freezes every normalized body', () => {
    const names = [...migration.matchAll(
      /^CREATE FUNCTION public\.([a-z0-9_]+)\(/gm,
    )].map((match) => match[1])
    expect(names).toHaveLength(21)
    expect(new Set(names)).toEqual(new Set(allFunctions))
    expect(migration.match(/^ALTER FUNCTION public\./gm)).toHaveLength(21)
    for (const name of allFunctions) {
      expect(md5(functionBody(name)), name).toBe(functionHashes[name])
      expect(migration).toContain(`ALTER FUNCTION public.${name}`)
    }
  })

  it('keeps 13 internals owner-only and grants only the eight RPCs to service_role', () => {
    expect(internalFunctions).toHaveLength(13)
    expect(serviceFunctions).toHaveLength(8)
    expect(migration.match(/^GRANT EXECUTE ON FUNCTION$/gm)).toHaveLength(1)
    const grantStart = migration.indexOf('GRANT EXECUTE ON FUNCTION')
    const grantEnd = migration.indexOf('TO service_role;', grantStart)
    const grantBlock = migration.slice(grantStart, grantEnd)
    for (const name of serviceFunctions) expect(grantBlock).toContain(`public.${name}`)
    for (const name of internalFunctions) expect(grantBlock).not.toContain(`public.${name}`)
    expect(migration.match(/^REVOKE ALL ON FUNCTION$/gm)).toHaveLength(1)
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role;')
    expect(migration).not.toMatch(/\bTO (?:PUBLIC|anon|authenticated)\b/)

    for (const validator of [postflight, recovery]) {
      expect(validator).toContain('pg_catalog.aclexplode')
      expect(validator).toContain("grantee_row.rolname = 'service_role'")
      for (const name of serviceFunctions) {
        expect(validator, name).toContain(name)
        expect(validator, name).toContain(functionHashes[name])
      }
    }
  })

  it('uses strict actor-scoped signatures with no defaults or client authority payload', () => {
    const expectedDefinitions: Record<(typeof serviceFunctions)[number], string[]> = {
      expense_finalize_private_draft: [
        'p_actor_id uuid', 'p_request_id uuid', 'p_draft_id uuid',
        'p_expected_draft_version bigint',
        'p_expected_publication_version bigint', 'p_split_confirmed boolean',
      ],
      expense_get_private_draft_publication_lifecycle: [
        'p_actor_id uuid', 'p_draft_id uuid',
      ],
      expense_share_private_draft: [
        'p_actor_id uuid', 'p_request_id uuid', 'p_draft_id uuid',
        'p_expected_draft_version bigint',
        'p_expected_publication_version bigint',
      ],
      expense_unshare_private_draft: [
        'p_actor_id uuid', 'p_request_id uuid', 'p_draft_id uuid',
        'p_expected_draft_version bigint',
        'p_expected_publication_version bigint',
      ],
      expense_list_visible_shared_drafts: ['p_actor_id uuid'],
      expense_get_shared_draft_detail: [
        'p_actor_id uuid', 'p_publication_id uuid',
      ],
      expense_list_group_shared_drafts: ['p_actor_id uuid', 'p_group_id uuid'],
      teskeid_event_get_expense_pre_active_v1: ['p_actor_id uuid', 'p_event_id uuid'],
    }
    for (const name of serviceFunctions) {
      const definition = functionDefinition(name)
      expect(definition).toContain('RETURNS jsonb')
      expect(definition).toContain('SECURITY DEFINER')
      expect(definition).toContain("SET search_path = ''")
      expect(definition).not.toContain(' DEFAULT ')
      for (const argument of expectedDefinitions[name]) {
        expect(definition, `${name}: ${argument}`).toContain(argument)
      }
    }
  })

  it('makes publication generations monotonic across share, unshare and delete/recreate', () => {
    const share = functionBody('expense_share_private_draft')
    const unshare = functionBody('expense_unshare_private_draft')
    const insertGuard = functionBody('expense_sql159_guard_private_draft_insert')
    const deleteGuard = functionBody('expense_sql159_guard_private_draft_delete')
    const lifecycle = functionBody('expense_get_private_draft_publication_lifecycle')

    expect(share).toContain('IF v_publication.draft_id IS NULL THEN')
    expect(share).toContain('IF p_expected_publication_version IS NOT NULL THEN')
    expect(share).toContain('IF p_expected_publication_version IS NULL')
    expect(share).toContain('v_publication.publication_version + 1')
    expect(share).toContain('v_publication.publication_version = 9007199254740991')
    expect(unshare).toContain('p_expected_publication_version IS NULL')
    expect(unshare).toContain('v_publication.publication_version + 1')
    expect(deleteGuard).toContain('v_publication.publication_version + 1')
    expect(deleteGuard).toContain('v_publication.publication_version = 9007199254740991')
    expect(deleteGuard).toContain('finalization.final_publication_version')
    expect(deleteGuard).toContain('AND NOT v_publication.is_live')
    expect(deleteGuard).toContain(
      'INSERT INTO public.expense_private_draft_tombstones (draft_id)',
    )
    expect(deleteGuard).toContain('ON CONFLICT (draft_id) DO NOTHING')
    expect(insertGuard).toContain('expense_unconfirmed_finalizations')
    expect(insertGuard).toContain('expense_private_draft_tombstones')
    expect(insertGuard).toContain('v_existing_actor_id IS DISTINCT FROM NEW.actor_user_id')
    expect(insertGuard).toContain('OR v_existing_actor_id IS NULL')
    expect(insertGuard).not.toContain(
      'publication.is_live\n          AND v_existing_actor_id',
    )
    expect(insertGuard.indexOf('expense_private_draft_tombstones')).toBeLessThan(
      insertGuard.indexOf('expense_assert_private_draft_context'),
    )
    expect(deleteGuard.indexOf('INSERT INTO public.expense_private_draft_tombstones'))
      .toBeLessThan(deleteGuard.indexOf('FROM public.expense_unconfirmed_publications'))

    const audienceTable = migration.slice(
      migration.indexOf('CREATE TABLE public.expense_unconfirmed_publication_audience ('),
      migration.indexOf(
        'CREATE INDEX expense_unconfirmed_publication_audience_user_idx',
      ),
    )
    expect(audienceTable).toContain('user_id               uuid        NOT NULL')
    expect(audienceTable).not.toContain('REFERENCES auth.users')
    expect(preflight).not.toContain(
      'expense_unconfirmed_publication_audience_user_id_fkey',
    )
    expect(postflight).not.toContain(
      'expense_unconfirmed_publication_audience_user_id_fkey',
    )

    expect(lifecycle).toContain("v_sharing_state := 'never_shared'")
    expect(lifecycle).toContain("THEN 'shared' ELSE 'withdrawn' END")
    expect(lifecycle).toContain("'sharing_state', v_sharing_state")
    expect(lifecycle).toContain("'expected_publication_version', CASE")
    expect(lifecycle).not.toContain("'publication_id'")
    expect(lifecycle).not.toMatch(/payload|email|display_name|source_id/i)
  })

  it('normalizes a bounded safe snapshot and requires the author as a selected party', () => {
    const normalize = functionBody('expense_sql159_normalize_private_draft')
    const snapshot = functionBody('expense_sql159_snapshot_is_valid')
    expect(normalize).toContain('v_all_member_count NOT BETWEEN 1 AND 50')
    expect(normalize).toContain('v_selected_count NOT BETWEEN 1 AND 50')
    expect(normalize).toContain(
      'IF v_is_author AND (v_is_payer OR v_is_participant) THEN',
    )
    expect(normalize).toContain('OR NOT v_author_selected')
    expect(normalize).toContain("v_safe_display_name := COALESCE(")
    expect(normalize).toContain("pg_catalog.strpos(v_display_name, '@') = 0")
    expect(normalize).toContain("'balanced_unconfirmed'")
    expect(normalize).toContain("'incomplete'")
    expect(normalize).toContain("'shareable_fingerprint'")
    expect(normalize).toContain("'allocation_fingerprint'")
    expect(snapshot).toContain('party_stats.author_count = 1')
    expect(migration).toContain(
      'CONSTRAINT expense_unconfirmed_publication_audience_identity_unique',
    )
    expect(snapshot).toContain(
      'audience_stats.audience_count BETWEEN 1 AND party_stats.party_count',
    )
    expect(snapshot).toContain('audience_stats.author_audience_count = 1')
    expect(snapshot).toContain(
      'audience.user_id IS DISTINCT FROM publication.actor_user_id',
    )
    expect(snapshot).toContain('party.is_payer OR party.is_participant')
  })

  it('parenthesizes all six nested input objects before JSONB key subtraction', () => {
    const normalize = functionBody('expense_sql159_normalize_private_draft')
    expect(normalize.match(/\(member\.value->'input'\) - ARRAY/g)).toHaveLength(6)
    expect(normalize).not.toMatch(/(?<!\()member\.value->'input' - ARRAY/)
  })

  it('ships a hash-guarded SQL160 forward-fix without authority or schema drift', () => {
    const oldHash = '1d8860f5e38dd9efbefef46c4c47d584'
    const newHash = '18a6e628bdb1d3c175b515541ab56787'
    for (const source of [sql160, sql160Preflight, sql160Recovery]) {
      expect(source).toContain(oldHash)
      expect(source).toContain(newHash)
    }
    expect(sql160Postflight).toContain(newHash)
    expect(sql160).toContain("v_occurrences <> 6")
    expect(sql160).toContain("pg_catalog.replace(v_body, v_old_token, v_new_token)")
    expect(sql160).toContain('CREATE OR REPLACE FUNCTION public.expense_sql159_normalize_private_draft')
    expect(sql160).not.toMatch(/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|POLICY|TRIGGER|TYPE)\b/i)
    expect(sql160).not.toMatch(/\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i)
    expect(sql160).not.toContain('service_role')
    expect(sql160Preflight).toContain('prerequisites_ok')
    expect(sql160Preflight).toContain('exact_installed')
    expect(sql160Postflight).toContain('postconditions_ok')
    expect(sql160Recovery).toContain('expense_sql160_recovery_target_mismatch')
    expect(sql160Recovery).toContain('expense_sql160_recovery_postcondition_failed')
    expect(sql160Readme).toContain('SQL161')
    expect(sql160Readme).toContain('No PostgREST schema-cache reload is required')
    expect(sql160Readme).toContain('## Localhost checks for Stebbi')
  })

  it('uses the safe SQL149 Event source without letting terminal candidates become selected', () => {
    const normalize = functionBody('expense_sql159_normalize_private_draft')
    expect(normalize).toContain('teskeid_event_get_legacy_expense_source_v2')
    expect(normalize).not.toMatch(/teskeid_event_get_expense_source\s*\(/)
    expect(normalize).toMatch(
      /candidate\.value->'shared'->>'access_state'\s+NOT IN \('active', 'left', 'revoked'\)/,
    )
    expect(normalize).toContain(
      "v_event_candidate->'shared'->>'access_state' <> 'active'",
    )
    expect(normalize).toContain(
      "NOT (v_event_candidate->'shared'->>'selectable')::boolean",
    )
    expect(normalize).toContain(
      "v_event_candidate->'shared'->'disabled_reason'",
    )
    expect(normalize).toContain('v_binding_generation bigint;')
    expect(normalize).toContain("::numeric\n             > 9007199254740991")
  })

  it('keeps sharing and withdrawal outside every canonical financial relation', () => {
    for (const name of ['expense_share_private_draft', 'expense_unshare_private_draft'] as const) {
      const body = functionBody(name)
      expect(body).not.toMatch(
        /(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:expenses|expense_payments|expense_shares|expense_obligations|teskeid_event_expense_links)/,
      )
      expect(body).not.toMatch(/public\.expense_create_expense(?:_|\()/)
      expect(body).not.toMatch(/public\.teskeid_event_create_(?:expense|tagged)/)
    }
    expect(functionBody('expense_share_private_draft')).toContain(
      'INSERT INTO public.expense_unconfirmed_publications',
    )
    expect(functionBody('expense_unshare_private_draft')).toContain(
      'DELETE FROM public.expense_unconfirmed_publication_audience',
    )
  })

  it('enforces exact finalization intent, replay, staleness and active-result proof', () => {
    const finalizer = functionBody('expense_finalize_private_draft')
    expect(finalizer).toContain('p_split_confirmed IS DISTINCT FROM true')
    expect(finalizer).toContain("'expectedPublicationVersion', p_expected_publication_version")
    expect(finalizer).toContain("'splitConfirmed', true")
    expect(finalizer.indexOf('expense_begin_request')).toBeLessThan(
      finalizer.indexOf('FROM public.expense_private_drafts'),
    )
    expect(finalizer).toContain("v_replay->>'state' <> 'confirmed'")
    expect(finalizer).toContain('v_replay_group_status IS NULL')
    expect(finalizer).toContain('v_replay_expense_status IS NULL')
    expect(finalizer).not.toContain(
      "v_replay_group_status IS DISTINCT FROM 'active'",
    )
    expect(finalizer).not.toContain(
      "v_replay_expense_status IS DISTINCT FROM 'active'",
    )
    expect(finalizer).toContain("actor_member.status = 'active'")
    expect(finalizer).toContain('IF p_expected_publication_version IS NULL THEN')
    expect(finalizer).toContain('ELSIF NOT COALESCE(v_publication.is_live, false)')
    expect(finalizer).toContain(
      'v_publication.shareable_fingerprint\n       IS DISTINCT FROM v_normalized->>\'shareable_fingerprint\'',
    )
    expect(finalizer).toContain("expense.status = 'active'")
    expect(finalizer).toContain("group_row.status = 'active'")
    expect(finalizer).toContain('INSERT INTO public.expense_unconfirmed_finalizations')
    expect(finalizer).toContain('DELETE FROM public.expense_private_drafts')
    expect(finalizer).toContain('expense_finish_request')
  })

  it('allows only the finalizer to call the frozen canonical create helpers', () => {
    const finalizer = functionBody('expense_finalize_private_draft')
    for (const helper of [
      'teskeid_event_create_expense_from_event_for_actor',
      'expense_create_expense(',
      'expense_create_expense_with_circle_context',
      'expense_create_expense_with_participants',
    ]) expect(finalizer).toContain(helper)
    for (const name of allFunctions.filter(
      (candidate) => candidate !== 'expense_finalize_private_draft',
    )) {
      const body = functionBody(name)
      expect(body, name).not.toMatch(
        /public\.(?:expense_create_expense(?:_with_[a-z_]+)?|teskeid_event_create_(?:expense|tagged_expense))/,
      )
    }
  })

  it('serializes readers with publication replacement and preserves safe DTO boundaries', () => {
    for (const name of [
      'expense_list_visible_shared_drafts',
      'expense_get_shared_draft_detail',
      'expense_list_group_shared_drafts',
      'teskeid_event_get_expense_pre_active_v1',
    ] as const) {
      const body = functionBody(name)
      expect(body, name).toContain('expense_sql159_snapshot_is_valid')
      expect(body, name).toMatch(/FOR SHARE OF (?:publication|candidate)/)
      expect(body, name).not.toMatch(/->\s*'payload'|->>\s*'payload'/)
      expect(body, name).not.toMatch(/raw_|email_address|private_label/i)
    }
    const event = functionBody('teskeid_event_get_expense_pre_active_v1')
    expect(event).toContain('LIMIT 101')
    expect(event).toContain('SELECT publication.* INTO v_locked_publication')
    expect(event).toContain("publication.visibility = 'participants_only'")
    expect(event).toContain("publication.visibility = 'all_event'")
    expect(event).toContain("'detail_target', CASE WHEN v_can_detail")
    expect(event).toContain("ELSE 'null'::jsonb")
    expect(event).toContain("'lifecycle_state', 'private_draft'")
    expect(event).toContain("'lifecycle_state', 'shared_draft'")
  })

  it('ships exact table/function/trigger postconditions and safe install evidence', () => {
    expect(migration.match(/^CREATE TRIGGER /gm)).toHaveLength(2)
    expect(migration).toContain(
      'CREATE TRIGGER expense_sql159_finalized_draft_insert_guard\n'
        + 'BEFORE INSERT ON public.expense_private_drafts',
    )
    expect(migration).toContain(
      'CREATE TRIGGER expense_sql159_private_draft_delete_guard\n'
        + 'BEFORE DELETE ON public.expense_private_drafts',
    )
    expect(migration).toContain('pg_catalog.jsonb_array_length(v_baseline.predecessor_contract) <> 32')
    expect(migration).toContain('expense_sql159_relation_contract_invalid')
    expect(migration).toContain('expense_sql159_function_contract_invalid')
    expect(migration).toContain('expense_sql159_function_collision')
    expect(migration).toContain('expense_sql159_install_state_invalid')
    expect(migration).toContain("expected(trigger_name, trigger_type, function_signature)")
    const collisionStart = migration.indexOf(
      'OR EXISTS (\n       SELECT 1 FROM pg_catalog.pg_trigger AS trigger_row',
    )
    const collisionEnd = migration.indexOf(') THEN', collisionStart)
    const freshTriggerCollision = migration.slice(collisionStart, collisionEnd)
    expect(collisionStart).toBeGreaterThanOrEqual(0)
    expect(freshTriggerCollision).not.toContain('tgisinternal')
    for (const validator of [preflight, diagnostic, postflight]) {
      expect(validator).toMatch(
        /FROM pg_catalog\.pg_trigger AS actual_trigger[\s\S]*?WHERE actual_trigger\.tgname IN/,
      )
    }
    expect(postflight).not.toMatch(
      /WHERE actual_trigger\.tgname IN \([\s\S]*?\)\s+AND NOT actual_trigger\.tgisinternal/,
    )

    const postflightIndexes = expectedIndexNames(postflight)
    expect(postflightIndexes).toHaveLength(18)
    for (const validator of [preflight, diagnostic]) {
      expect(singleColumnValues(
        validator,
        'target_indexes(name) AS (VALUES\n',
        '), target_index',
      )).toEqual(postflightIndexes)
    }
    expect(singleColumnValues(
      migration,
      'FROM (VALUES\n',
      ') AS target_index(name)',
    )).toEqual(postflightIndexes)
    expect(migration).toContain(
      "WHERE pg_catalog.to_regclass('public.' || target_index.name) IS NOT NULL",
    )
    expect(preflight).toContain('target_index_state.present_count = 0')
    expect(preflight).toContain('target_index_state.present_count = 18')
    expect(diagnostic).toContain('AS target_indexes_present')

    for (const validator of [preflight, diagnostic]) {
      expect(singleColumnValues(
        validator,
        'target_relations(name) AS (VALUES\n',
        '), target_relation_state',
      )).toHaveLength(6)
      expect(valuesRowCount(
        validator,
        'installed_expected_columns(\n',
        '), installed_column_checks AS (',
      )).toBe(69)
      expect(valuesRowCount(
        validator,
        'installed_expected_constraints(\n',
        '), installed_constraint_observed AS (',
      )).toBe(38)
      expect(valuesRowCount(
        validator,
        'installed_expected_indexes(\n',
        '), installed_index_checks AS (',
      )).toBe(18)
    }
    expect(valuesRowCount(
      postflight,
      'expected_columns(\n',
      '), column_contract AS (',
    )).toBe(69)
    expect(valuesRowCount(
      postflight,
      'expected_constraints(\n',
      '), normalized_constraints AS (',
    )).toBe(38)
    expect(valuesRowCount(
      postflight,
      'expected_indexes(\n',
      '), index_contract AS (',
    )).toBe(18)
  })

  it('ships read-only preflight, diagnostic and postflight with safe outputs', () => {
    for (const validator of [preflight, diagnostic, postflight]) {
      expectReadOnlyValidator(validator)
      expect(validator).toContain('pg_catalog.to_regclass')
      expect(validator).toContain('pg_catalog.to_regprocedure')
      expect(validator).toContain('COLLATE pg_catalog."C"')
      expect(validator).not.toMatch(/\bprosrc\s+AS\b/i)
      expect(validator).not.toMatch(
        /(?:payload|title|note|email|display_name|private_label)\s+AS\s+[a-z_]/i,
      )
      expect(validator).not.toMatch(/name\[\]\s*(?:=|<>|IS DISTINCT FROM)\s*ARRAY/i)
    }
    expect(preflight).toContain('AS prerequisites_ok')
    expect(preflight).toContain('canonical_targets_absent')
    expect(preflight).toContain('exact_installed')
    expect(preflight).toContain('lost_response_safe')
    expect(preflight).toContain('operator_state_ok')
    expect(preflight).toContain('writer_set_exact')
    expect(preflight).toContain('predecessor_contracts_exact')
    expect(preflight).toContain('baseline_predecessor_shape_exact')
    expect(preflight).toContain('protected_digest')
    expect(preflight).toContain('request_digest')
    expect(preflight).toContain('draft_digest')
    for (const validator of [preflight, diagnostic]) {
      const normalized = validator.replace(/\s+/g, '')
      const serviceRoleAllAcl = [
        'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
        'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE',
      ].map((privilege) => `'service_role:${privilege}'`).join(',')
      const profilesAllAcl = ['anon', 'authenticated', 'service_role']
        .flatMap((role) => [
          'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
          'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE',
        ].map((privilege) => `'${role}:${privilege}'`))
        .join(',')
      expect(normalized).toContain(
        `('public.relationships',true,false,0,ARRAY[${serviceRoleAllAcl}]::text[])`,
      )
      expect(normalized).toContain(
        `('public.relationship_tags',true,false,0,ARRAY[${serviceRoleAllAcl}]::text[])`,
      )
      expect(normalized).toContain(
        `('public.profiles',true,false,3,ARRAY[${profilesAllAcl}]::text[])`,
      )
      expect(normalized).toContain(
        "('public.profiles','profiles_select','r',true,"
          + "ARRAY['authenticated']::text[],'(id=auth.uid())',NULL::text)",
      )

      const authAclStart = validator.indexOf('expected_auth_column_acl(')
      const authAclEnd = validator.indexOf(
        '), auth_column_acl_observed AS (',
        authAclStart,
      )
      expect(authAclStart).toBeGreaterThanOrEqual(0)
      expect(authAclEnd).toBeGreaterThan(authAclStart)
      expect([...validator.slice(authAclStart, authAclEnd).matchAll(
        /\('([^']+)','([^']+)','([^']+)','([^']+)',(true|false)\)/g,
      )].map((match) => match.slice(1))).toEqual([
        ['email', 'service_role', 'SELECT', 'postgres', 'false'],
        ['id', 'service_role', 'SELECT', 'postgres', 'false'],
      ])
      expect(validator.match(
        /FROM expected_auth_column_acl AS expected/g,
      )).toHaveLength(2)
      expect(validator.match(
        /FROM auth_column_acl_observed AS observed/g,
      )).toHaveLength(validator === diagnostic ? 3 : 2)
      expect(validator).toContain(
        "function_row.oid IS DISTINCT FROM pg_catalog.to_regprocedure(\n"
          + "      'public.expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)'",
      )
      expect(validator).toContain(
        "THEN pg_catalog.jsonb_array_length(predecessor_contract) = 32",
      )
      expect(validator).toContain("SELECT 'expense_mutation_requests'")
      expect(validator).toContain("SELECT 'teskeid_event_mutation_requests'")
    }
    expect(diagnostic).toContain('mismatch')
    expect(diagnostic).toContain('source_hash')
    expect(diagnostic).toContain('owner')
    expect(diagnostic).toContain('grantee')
    expect(diagnostic).toContain("'api_role_column_grants'")
    expect(diagnostic).toContain("policy_row.polcmd::text || '|'")
    expect(diagnostic).not.toMatch(/policy_row\.polcmd\s*\|\|/)
    expect(diagnostic.match(
      /COLLATE pg_catalog\."C" AS sort_key/g,
    )).toHaveLength(5)
    expect(diagnostic.match(/^\s*ORDER BY sort_key$/gm)).toHaveLength(5)
    expect(diagnostic).not.toContain('ORDER BY sort_key COLLATE')
    expect(postflight).toContain('AS postconditions_ok')
    expect(postflight).toContain('relations_private_exact')
    expect(postflight).toContain('functions_exact')
    expect(postflight).toContain('triggers_exact')
    expect(postflight).toContain('baseline_and_predecessors_exact')
    expect(postflight).toContain('tombstone_to_active_exact')
    expect(postflight).toContain(
      'FROM public.expense_private_draft_tombstones AS tombstone',
    )
    expect(postflight).toContain(
      'WHERE draft_row.id = tombstone.draft_id',
    )
    expect(postflight).toContain(
      'WHEN pg_catalog.jsonb_typeof(\n'
        + '            baseline.predecessor_contract\n'
        + "          ) = 'array' THEN",
    )
    expect(postflight).toContain("SELECT 'expense_mutation_requests'")
    expect(postflight).toContain("SELECT 'teskeid_event_mutation_requests'")
    for (const validator of [preflight, diagnostic, postflight]) {
      for (const hash of Object.values(functionHashes)) {
        expect(validator, hash).toContain(hash)
      }
    }
  })

  it('keeps recovery revoke-only, fail-closed and non-destructive', () => {
    expect(recovery.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(recovery.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(recovery).toContain('pg_advisory_xact_lock(159159)')
    expect(recovery.match(/^REVOKE EXECUTE ON FUNCTION$/gm)).toHaveLength(1)
    expect(recovery).toContain('FROM service_role;')
    expect(recovery).not.toMatch(
      /^\s*(?:DROP|DELETE|UPDATE|TRUNCATE|NOTIFY)\b/gim,
    )
    expect(recovery).not.toMatch(/\bDROP\s+[^;]*\bCASCADE\b/i)
    expect(recovery).not.toMatch(/\bREVOKE\s+(?:ALL|SELECT|INSERT)/i)
    expect(recovery).toContain('expense_sql159_recovery_target_mismatch')
    expect(recovery).toContain('expense_sql159_recovery_predecessor_mismatch')
    expect(recovery).toContain('expense_sql159_recovery_acl_revoke_failed')
    expect(recovery).toContain("'TRIGGER', 'MAINTAIN'")
    expect(recovery).toMatch(
      /server_version_num'[\s\S]*?>= 170000 THEN 1 ELSE 0 END/,
    )
    for (const name of serviceFunctions) {
      expect(recovery, name).toContain(name)
      expect(recovery, name).toContain(functionHashes[name])
    }
  })

  it('documents the exact manual rollout, lost-response and compatibility gates', () => {
    expect(readme).toContain('preflight.sql')
    expect(readme).toContain('159_expense_unconfirmed_publication_and_finalization.sql')
    expect(readme).toMatch(/PostgREST schema\s+cache/)
    expect(readme).toContain('postflight.sql')
    expect(readme).toContain('diagnose-preflight.sql')
    expect(readme).toContain('do not rerun it')
    expect(readme).toContain('`lost_response_safe = true`')
    expect(readme).toContain('`operator_state_ok = true`')
    expect(readme).toContain('`exact_installed` alone is evidence, not')
    expect(readme).toContain('SQL160')
    expect(readme).toContain('SQL161')
    expect(readme).toContain('SQL159 finalization result → exact canonical')
    expect(readme).toContain('No SQL in this package was run by Codex')
    expect(readme).toContain('## Localhost checks for Stebbi')
  })

  it('keeps the exact draft-lineage diagnostic read-only and privacy-safe', () => {
    expect(lineageDiagnostic).toMatch(/BEGIN TRANSACTION READ ONLY/i)
    expect(lineageDiagnostic).toMatch(/ROLLBACK\s*;/i)
    expect(lineageDiagnostic).toContain("SELECT 'D1'")
    expect(lineageDiagnostic).toContain("SELECT 'D2'")
    expect(lineageDiagnostic).toContain('e_id')
    expect(lineageDiagnostic).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP)\b/i)
    expect(lineageDiagnostic).not.toMatch(/'(?:payload|title|note|display_name|email|event_name)'/i)
    expect(readme).toContain('diagnose-exact-draft-lineage.sql')
    expect(lineageDiagnostic.match(/operator_input\(/g)).toHaveLength(1)
    expect(lineageDiagnostic).toContain('expense_sql159_normalize_private_draft')
    expect(lineageDiagnostic).toContain('party_identity_digest')
    expect(lineageDiagnostic).toContain('same_party_identities')
    expect(lineageDiagnostic).toContain('same_allocation_fingerprint')
    expect(lineageDiagnostic).toContain('multiple_canonical_lineages_require_audit')
  })

  it('keeps all declared PostgreSQL identifiers within 63 UTF-8 bytes', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(0)
    for (const identifier of identifiers) {
      expect(Buffer.byteLength(identifier, 'utf8'), identifier).toBeLessThanOrEqual(63)
    }
  })

  it('has balanced function delimiters and coarse SQL structure', () => {
    expect(migration.match(/\$function\$/g)).toHaveLength(42)
    expect(migration.match(/^CREATE FUNCTION public\./gm)).toHaveLength(21)
    const stripped = migration
      .replace(/--[^\n]*/g, '')
      .replace(/'(?:''|[^'])*'/g, "''")
      .replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, '$$')
    let depth = 0
    for (const character of stripped) {
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
  })
})
