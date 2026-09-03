import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const readOptional = (path: string) => existsSync(path)
  ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  : ''

const migration = readOptional('sql/168_expense_confirmed_edit_revision_lifecycle.sql')
const validationRoot = 'sql/validation/168-expense-confirmed-edit-revision'
const preflight = readOptional(`${validationRoot}/preflight.sql`)
const postflight = readOptional(`${validationRoot}/postflight.sql`)
const recovery = readOptional(`${validationRoot}/recovery.sql`)
const catalogDiagnostic = readOptional(`${validationRoot}/diagnose-postflight-function-contract.sql`)
const readme = readOptional(`${validationRoot}/README.md`)

const targetFunctions = [
  'expense_edit_revision_allocation_digest_v1',
  'expense_settlement_eligible_balances_v1',
  'expense_simplified_settlement',
  'expense_can_open_edit_revision_v1',
  'expense_get_eligible_settlement_context_v1',
  'expense_guard_edit_revision_expense_lifecycle_v1',
  'expense_guard_edit_revision_group_lifecycle_v1',
  'expense_guard_edit_revision_member_authority_v1',
  'expense_guard_repayment_confirmation_eligibility_v1',
  'expense_assert_private_draft_context',
  'expense_list_visible_shared_drafts',
  'expense_get_edit_revision_publication_lifecycle_v1',
  'expense_share_edit_revision_v1',
  'expense_unshare_edit_revision_v1',
  'expense_save_private_draft',
  'expense_delete_private_draft',
  'expense_open_edit_revision_v1',
  'expense_get_legacy_edit_draft_state_v1',
  'expense_discard_legacy_edit_draft_v1',
  'expense_get_edit_revision_state_v1',
  'expense_list_visible_edit_revisions_v1',
  'expense_get_shared_edit_revision_v1',
  'expense_discard_edit_revision_v1',
  'expense_reconfirm_edit_revision_v1',
] as const

describe('SQL168 confirmed Expense edit-revision lifecycle', () => {
  it('ships one clearly labelled additive operator bundle', () => {
    expect(migration.startsWith('-- SQL168 MIGRATION:')).toBe(true)
    expect(preflight.startsWith('-- SQL168 PREFLIGHT:')).toBe(true)
    expect(postflight.startsWith('-- SQL168 POSTFLIGHT:')).toBe(true)
    expect(recovery.startsWith('-- SQL168 RECOVERY:')).toBe(true)
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(migration).toContain('SELECT pg_catalog.pg_advisory_xact_lock(104168);')
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
  })

  it('never schema-qualifies the SQL COALESCE expression', () => {
    for (const artifact of [migration, preflight, postflight]) {
      expect(artifact).not.toContain('pg_catalog.coalesce(')
    }
  })

  it('ships a privacy-safe read-only diagnostic for postflight function drift', () => {
    expect(catalogDiagnostic.startsWith('-- SQL168 DIAGNOSTIC:')).toBe(true)
    expect(catalogDiagnostic).toContain('BEGIN TRANSACTION READ ONLY;')
    expect(catalogDiagnostic.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(catalogDiagnostic).toContain('expected_function_count')
    expect(catalogDiagnostic).toContain('target_exists')
    expect(catalogDiagnostic).toContain('argument_names_exact')
    expect(catalogDiagnostic).toContain('arguments_exact')
    expect(catalogDiagnostic).toContain('result_type_exact')
    expect(catalogDiagnostic).toContain('source_hash_exact')
    expect(catalogDiagnostic).toContain('namespace_dependency_exact')
    expect(catalogDiagnostic).toContain('language_dependency_present')
    expect(catalogDiagnostic).toContain('extension_dependency_absent')
    expect(catalogDiagnostic).toContain('metadata_exact')
    expect(catalogDiagnostic).toContain('direct_dependencies_exact')
    expect(catalogDiagnostic).not.toMatch(/FROM public\.(?:expenses|expense_private_drafts|expense_edit_revision_bindings|expense_repayments)/)
    expect(catalogDiagnostic).not.toMatch(/SELECT[\s\S]{0,200}\b(?:prosrc|proacl|payload|actor_user_id|draft_id|expense_id)\b/i)
  })

  it('models TABLE output names and pinned SQL-language dependencies exactly', () => {
    const expectedSettlementArgumentNames =
      /expense_settlement_eligible_balances_v1\(uuid,boolean\)'[\s\S]{0,180}?ARRAY\['p_group_id','p_include_reported','member_id','currency','amount_minor'\]::text\[\]/
    expect(postflight).toMatch(expectedSettlementArgumentNames)
    expect(catalogDiagnostic).toMatch(expectedSettlementArgumentNames)

    expect(postflight).toMatch(
      /language_name = 'sql'[\s\S]{0,80}?OR EXISTS \([\s\S]+?refclassid = 'pg_catalog\.pg_language'/,
    )
    expect(catalogDiagnostic).toMatch(
      /language_name = 'sql' OR language_dependency_present/,
    )
  })

  it('validates exact bound lifecycle while preserving unbound legacy rows inert', () => {
    const lifecycleState = postflight.match(
      /lifecycle_state AS MATERIALIZED \(([\s\S]+?)\), predecessor_contract/,
    )?.[1] ?? ''
    expect(lifecycleState).toContain('public.expense_edit_revision_bindings AS binding')
    expect(lifecycleState).toContain('draft.context_type IS DISTINCT FROM \'edit\'')
    expect(lifecycleState).toContain('draft.expense_id IS DISTINCT FROM binding.expense_id')
    expect(lifecycleState).toContain('draft.group_id IS DISTINCT FROM binding.group_id')
    expect(lifecycleState).toContain('draft.actor_user_id IS DISTINCT FROM binding.actor_user_id')
    expect(lifecycleState).not.toContain("draft.context_type = 'edit' AND binding.draft_id IS NULL")
  })

  it('keeps one durable edit identity and immutable server-owned base evidence', () => {
    expect(migration).toContain('expense_edit_revision_bindings')
    expect(migration).toContain('base_financial_version')
    expect(migration).toContain('base_allocation_digest')
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? expense_private_drafts_one_open_edit_per_expense_idx/)
    expect(migration).toMatch(/WHERE (?:draft\.)?context_type = 'edit'/)
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_open_edit_revision_v1/)
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('public.expense_assert_private_draft_context')
    expect(migration).not.toContain("RAISE EXCEPTION 'expense_sql168_legacy_edit_revisions_open'")
    expect(migration).toContain("current_user <> 'postgres'")
  })

  it('hardens every generic draft writer while keeping legacy edit rows inert', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.expense_save_private_draft[\s\S]+?IF p_context_type = 'edit' AND p_expected_version IS NULL THEN[\s\S]+?expense_edit_revision_required/,
    )
    expect(migration).toMatch(
      /expense_save_private_draft[\s\S]+?p_context_type = 'edit'[\s\S]+?expense_edit_revision_bindings[\s\S]+?expense_legacy_edit_draft_unbound/,
    )
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.expense_delete_private_draft[\s\S]+?v_draft\.context_type = 'edit'[\s\S]+?expense_edit_revision_delete_required[\s\S]+?DELETE FROM public\.expense_private_drafts/,
    )
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_get_legacy_edit_draft_state_v1/)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_discard_legacy_edit_draft_v1/)
    expect(migration).toMatch(
      /expense_discard_legacy_edit_draft_v1[\s\S]+?FOR UPDATE[\s\S]+?binding\.draft_id IS NULL[\s\S]+?DELETE FROM public\.expense_private_drafts/,
    )
    const legacyDiscardBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.expense_discard_legacy_edit_draft_v1\([^;]+?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] ?? ''
    expect(legacyDiscardBody).toContain('teskeid_event_assert_session_actor(p_actor_id)')
    expect(legacyDiscardBody).toContain('expense_assert_beta_actor(p_actor_id)')
    expect(legacyDiscardBody).not.toContain('expense_begin_request')
    expect(legacyDiscardBody).not.toContain('expense_finish_request')
    expect(migration).toContain("RAISE EXCEPTION 'expense_legacy_edit_draft_unbound'")
  })

  it('freezes the complete direct draft-writer and EXECUTE manifest', () => {
    const writerHashes = new Map([
      ['expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', '4c55e9caaabb3a287dfa06ed55ab1fe7'],
      ['expense_delete_private_draft(uuid,uuid)', '767759a756a52c8b90a57af6de1b9a6f'],
      ['expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'],
      ['expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'a1bba12665e8651121bac578d7e936d4'],
      ['expense_open_edit_revision_v1(uuid,uuid,uuid,text,uuid,jsonb)', '732375dc60f72f95f8232677b2ae0f89'],
      ['expense_discard_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint)', '2a7bbc7fda11f3393a55171e56bf3614'],
      ['expense_reconfirm_edit_revision_v1(uuid,uuid,uuid,uuid,bigint,bigint,bigint,jsonb)', 'd8cd26c2d1b07475de60846222e6734a'],
      ['expense_discard_legacy_edit_draft_v1(uuid,uuid,uuid,uuid,bigint)', 'b25d37dd096e08a402161c1301c23fc8'],
    ])
    for (const artifact of [migration, preflight, postflight]) {
      expect(artifact).toContain('expected_direct_draft_writer')
      const writerManifest = artifact.match(
        /expected_direct_draft_writer[\s\S]+?\), actual_direct_draft_writer AS/,
      )?.[0] ?? ''
      for (const [signature, sourceHash] of writerHashes) {
        expect(writerManifest).toContain(signature)
        expect(writerManifest).toMatch(new RegExp(
          `${signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*${sourceHash}`,
        ))
      }
      expect(artifact).toContain('STOP_WRITER_DRIFT')
      expect(artifact).toContain("routine.prosrc ~* '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)")
      expect(artifact).toContain('public[.]expense_private_drafts')
      expect(artifact).toContain('metadata_acl_exact')
      expect(artifact).toContain('has_function_privilege(')
    }
    expect((migration.match(/EXCEPT ALL/g) ?? [])).toHaveLength(2)
    expect(preflight).toContain('missing_predecessor_writer_count')
    expect(preflight).toContain('missing_installed_writer_count')
    expect(preflight).toContain('target_writer_candidate_count')
    expect(postflight).toMatch(/writer_state AS MATERIALIZED \([\s\S]+?EXCEPT ALL[\s\S]+?EXCEPT ALL/)

    for (const [path, functionName, expectedHash] of [
      [
        'sql/102_expense_private_drafts.sql',
        'expense_delete_private_draft',
        '6cb30e799507447b2f73a977a7cc437e',
      ],
      [
        'sql/164_expense_single_edit_draft_identity.sql',
        'expense_save_private_draft',
        'e655a802f4fe1cd5f98b2f0d22815178',
      ],
      [
        'sql/159_expense_unconfirmed_publication_and_finalization.sql',
        'expense_finalize_private_draft',
        '14ac1abc9046fea4812ac652a9b96088',
      ],
      [
        'sql/162_event_expense_bidirectional_context_contract.sql',
        'expense_set_private_draft_event_relation_v1',
        'a1bba12665e8651121bac578d7e936d4',
      ],
    ] as const) {
      const predecessor = readOptional(path)
      const body = predecessor.match(new RegExp(
        `CREATE (?:OR REPLACE )?FUNCTION public\\.${functionName}\\([^;]*?AS (\\$[A-Za-z_]*\\$)(.*?)\\1;`,
        's',
      ))?.[2]
      expect(body, functionName).toBeDefined()
      expect(createHash('md5').update(body!, 'utf8').digest('hex')).toBe(expectedHash)
    }
  })

  it('classifies exact predecessor and installed writer hashes independently', () => {
    const manifest = preflight.match(
      /expected_direct_draft_writer\(\s*signature, predecessor_source_hash, target_source_hash, is_new_candidate\s*\) AS \([\s\S]+?\), actual_direct_draft_writer AS/,
    )?.[0] ?? ''
    expect(manifest).not.toBe('')

    const rows = [...manifest.matchAll(
      /\('public\.([^']+)',\s*(NULL|'[a-f0-9]{32}'),\s*'([a-f0-9]{32})',\s*(true|false)\)/g,
    )].map((match) => ({
      signature: match[1],
      predecessorHash: match[2] === 'NULL' ? null : match[2].slice(1, -1),
      targetHash: match[3],
      isNew: match[4] === 'true',
    }))
    expect(rows).toHaveLength(8)

    const predecessor = new Map([
      ['expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)', 'e655a802f4fe1cd5f98b2f0d22815178'],
      ['expense_delete_private_draft(uuid,uuid)', '6cb30e799507447b2f73a977a7cc437e'],
      ['expense_finalize_private_draft(uuid,uuid,uuid,bigint,bigint,boolean)', '14ac1abc9046fea4812ac652a9b96088'],
      ['expense_set_private_draft_event_relation_v1(uuid,uuid,uuid,bigint,bigint,boolean,uuid,bigint,uuid,bigint)', 'a1bba12665e8651121bac578d7e936d4'],
    ])
    const installed = new Map(rows.map((row) => [row.signature, row.targetHash]))
    const classify = (actual: Map<string, string>) => {
      const signatures = [...actual.keys()]
      const predecessorRows = rows.filter((row) => !row.isNew)
      const predecessorExact = signatures.length === predecessorRows.length
        && predecessorRows.every((row) => actual.get(row.signature) === row.predecessorHash)
      const installedExact = signatures.length === rows.length
        && rows.every((row) => actual.get(row.signature) === row.targetHash)
      if (installedExact) return 'WRITER_INSTALLED_EXACT'
      if (predecessorExact) return 'WRITER_PREDECESSOR_EXACT'
      return 'STOP_WRITER_DRIFT'
    }

    expect(classify(predecessor)).toBe('WRITER_PREDECESSOR_EXACT')
    expect(classify(installed)).toBe('WRITER_INSTALLED_EXACT')
    expect(classify(new Map([...predecessor, [
      'expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      '4c55e9caaabb3a287dfa06ed55ab1fe7',
    ]]))).toBe('STOP_WRITER_DRIFT')

    const writerState = preflight.match(
      /writer_state AS \([\s\S]+?\), function_contract AS/,
    )?.[0] ?? ''
    expect(writerState).toContain('predecessor_source_hash')
    expect(writerState).toContain('target_source_hash')
    expect(writerState).toContain('predecessor_metadata_acl_exact')
    expect(writerState).toContain('installed_metadata_acl_exact')
    expect(preflight).toMatch(
      /ABSENT_READY[\s\S]*?writer_state\.predecessor_metadata_acl_exact|writer_state\.predecessor_metadata_acl_exact[\s\S]*?ABSENT_READY/,
    )
    expect(preflight).toMatch(
      /EXACT_INSTALLED[\s\S]*?writer_state\.installed_metadata_acl_exact|writer_state\.installed_metadata_acl_exact[\s\S]*?EXACT_INSTALLED/,
    )
  })

  it('reuses publication and audience rows through an explicit edit-only branch', () => {
    expect(migration).toContain('public.expense_unconfirmed_publications')
    expect(migration).toContain('public.expense_unconfirmed_publication_audience')
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_share_edit_revision_v1/)
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_unshare_edit_revision_v1/)
    expect(migration).toContain("v_draft.context_type <> 'edit'")
    expect(migration).not.toContain('CREATE TABLE public.expense_edit_revision_publications')
    expect(migration).not.toContain('CREATE TABLE public.expense_edit_revision_audience')
  })

  it('opens only a clean active group+currency scope and never reinterprets legacy history', () => {
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_can_open_edit_revision_v1/)
    expect(migration).toContain("v_group.status NOT IN ('active', 'settling')")
    expect(migration).toMatch(/repayment\.group_id = v_expense\.group_id[\s\S]+?repayment\.currency = v_expense\.currency[\s\S]+?repayment\.status IN \('reported', 'confirmed'\)/)
    expect(migration).toContain("'ineligible_history'")
    expect(migration).not.toMatch(/^\s*(UPDATE|DELETE)\s+public\.expense_repayments/im)
    expect(migration).not.toMatch(/backfill|historical[_ ]allocation|source[_ ]manifest/i)
    const canOpenBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.expense_can_open_edit_revision_v1\([^;]+?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] ?? ''
    expect(canOpenBody).toMatch(
      /draft\.context_type = 'edit'[\s\S]+?draft\.expense_id = p_expense_id[\s\S]+?draft\.actor_user_id = p_actor_id[\s\S]+?binding\.draft_id IS NULL/,
    )
  })

  it('fails malformed binding-to-draft detail state closed', () => {
    const stateBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.expense_get_edit_revision_state_v1\([^;]+?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] ?? ''
    expect(stateBody).toMatch(
      /v_draft\.id IS NULL[\s\S]+?v_draft\.context_type <> 'edit'[\s\S]+?v_draft\.expense_id IS DISTINCT FROM v_binding\.expense_id[\s\S]+?v_draft\.group_id IS DISTINCT FROM v_binding\.group_id[\s\S]+?v_draft\.actor_user_id IS DISTINCT FROM v_binding\.actor_user_id[\s\S]+?'status', 'unavailable'/,
    )
    expect(stateBody).toMatch(
      /v_binding\.mode = 'shared'[\s\S]+?v_publication\.is_live IS DISTINCT FROM true[\s\S]+?'status', 'unavailable'/,
    )
  })

  it('uses one server settlement projection that excludes only exact open edit identities', () => {
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_settlement_eligible_balances_v1/)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_simplified_settlement/)
    expect(migration).toMatch(/NOT EXISTS \([\s\S]+?expense_edit_revision_bindings AS binding[\s\S]+?binding\.expense_id = expense\.id/)
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_get_eligible_settlement_context_v1/)
    expect(migration).toContain('expense_reported_repayments_need_review')
    expect(migration).toContain('DROP TRIGGER IF EXISTS expense_tes24_repayment_write_guard')
    expect(migration).not.toContain('CREATE TRIGGER expense_tes24_repayment_write_guard')
    expect(migration).toContain("RAISE EXCEPTION 'expense_edit_revision_state_inconsistent'")
    expect(migration).toMatch(
      /binding\.group_id = p_group_id\s+OR draft\.group_id = p_group_id\s+OR expense\.group_id = p_group_id/,
    )
    const eligibleBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.expense_settlement_eligible_balances_v1\([^;]+?AS \$function\$([\s\S]*?)\$function\$;/,
    )?.[1] ?? ''
    expect(eligibleBody).not.toMatch(/binding\.draft_id IS NULL/)
  })

  it('blocks every legacy canonical Expense update while an edit binding is open', () => {
    expect(migration).toMatch(
      /CREATE TRIGGER expense_tes24_edit_expense_lifecycle_guard\s+BEFORE UPDATE ON public\.expenses/,
    )
    expect(migration).not.toMatch(
      /CREATE TRIGGER expense_tes24_edit_expense_lifecycle_guard\s+BEFORE UPDATE OF status/,
    )
    expect(migration).toMatch(
      /expense_guard_edit_revision_expense_lifecycle_v1\(\)[\s\S]+?IF EXISTS \([\s\S]+?binding\.expense_id = OLD\.id[\s\S]+?RAISE EXCEPTION 'expense_edit_revision_lifecycle_conflict'/,
    )
  })

  it('makes edit-identity deletion explicit instead of depending on FK cascades', () => {
    expect(migration).toMatch(/draft_id\s+uuid\s+PRIMARY KEY[\s\S]+?ON DELETE RESTRICT/)
    expect(migration).toMatch(/actor_user_id\s+uuid\s+NOT NULL REFERENCES auth\.users\(id\) ON DELETE RESTRICT/)
    expect(migration).toMatch(
      /expense_discard_edit_revision_v1[\s\S]+?DELETE FROM public\.expense_edit_revision_bindings[\s\S]+?DELETE FROM public\.expense_private_drafts/,
    )
    expect(migration).toMatch(
      /expense_reconfirm_edit_revision_v1[\s\S]+?DELETE FROM public\.expense_edit_revision_bindings[\s\S]+?DELETE FROM public\.expense_private_drafts/,
    )
  })

  it('uses the existing monotonic financial version for eligibility CAS without synthetic finance', () => {
    expect(migration).toMatch(/expense_open_edit_revision_v1[\s\S]+?financial_version = group_row\.financial_version \+ 1/)
    expect(migration).toMatch(/expense_discard_edit_revision_v1[\s\S]+?financial_version = group_row\.financial_version \+ 1/)
    expect(migration).toContain("'unchanged_reconfirmed'")
    expect(migration).not.toMatch(/INSERT INTO public\.expense_(revisions|activity)[\s\S]{0,300}'edit_revision_(opened|discarded)'/)
    expect(migration).not.toMatch(/INSERT INTO public\.expense_(payments|shares|repayments)[\s\S]{0,400}'unchanged_reconfirmed'/)
  })

  it('makes discard and reconfirm the only lifecycle exits that remove the lock', () => {
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_discard_edit_revision_v1/)
    expect(migration).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.expense_reconfirm_edit_revision_v1/)
    expect(migration).toContain('public.expense_update_expense_with_participants(')
    expect(migration).toContain("'unchanged_reconfirmed'")
    expect(migration).toContain("'reconfirmed'")
    expect(migration).toContain("'discarded'")
    expect(migration).toContain('DELETE FROM public.expense_private_drafts')
    expect(migration).toContain('base_allocation_digest')
    expect(migration).toContain('expected_publication_version')
    expect(migration).not.toContain('DELETE FROM public.expense_payments')
    expect(migration).not.toContain('DELETE FROM public.expense_repayments')
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_guard_edit_revision_expense_lifecycle_v1[\s\S]+?expense_edit_revision_bindings/)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_guard_edit_revision_member_authority_v1[\s\S]+?expense_edit_revision_bindings/)
    expect(migration).toContain('expense_tes24_edit_expense_lifecycle_guard')
    expect(migration).toContain('expense_tes24_edit_member_authority_guard')
  })

  it('separates edit publications before the SQL159 creation snapshot gate', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.expense_list_visible_shared_drafts/)
    expect(migration).toMatch(/WHERE publication\.is_live[\s\S]+?draft\.context_type <> 'edit'[\s\S]+?expense_sql159_snapshot_is_valid/)
  })

  it('keeps capabilities narrow and recovery data-preserving', () => {
    for (const artifact of [migration, preflight, postflight]) {
      expect(artifact).toContain('service_role')
      expect(artifact).toContain('anon')
      expect(artifact).toContain('authenticated')
      expect(artifact).toContain('search_path')
    }
    expect(migration).not.toMatch(/GRANT EXECUTE[^;]+TO\s+(PUBLIC|anon|authenticated)/i)
    expect(recovery).toContain('REVOKE EXECUTE')
    expect(recovery).toContain('STOP_OPEN_EDIT_REVISIONS_EXIST')
    expect(recovery).not.toMatch(/^\s*DELETE\s+FROM/im)
    expect(recovery).not.toMatch(/^\s*DROP\s+TABLE/im)
  })

  it('validates exact lifecycle, lock, index, RLS, ACL and dependency state', () => {
    for (const artifact of [preflight, postflight]) {
      for (const token of [
        'pg_catalog.pg_get_function_identity_arguments',
        'pg_catalog.pg_get_function_result',
        'proconfig',
        'pg_catalog.aclexplode',
        'pg_catalog.pg_depend',
        'relrowsecurity',
        'relforcerowsecurity',
      ]) expect(artifact).toContain(token)
    }
    expect(preflight).toContain('ABSENT_READY')
    expect(preflight).toContain('EXACT_INSTALLED')
    expect(preflight).toContain('STOP_PARTIAL_OR_PREDECESSOR_DRIFT')
    expect(preflight).not.toContain('STOP_LEGACY_EDIT_REVISIONS_OPEN')
    expect(preflight).toContain('target_functions_exact')
    expect(preflight).toMatch(/WHEN installed\.exact_candidate\s+AND target_state\.target_functions_exact/)
    expect(preflight).toContain('source_md5 = source_hash')
    expect(postflight).toContain('source_hash')
    expect(postflight).toContain('source_md5 = source_hash')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toMatch(/expense_private_drafts_one_open_edit_per_expense_idx'[\s\S]{0,80}?IS NULL AS exact/)
    expect(preflight).toContain('unexpected_repayment_dml_grant_count')
    expect(postflight).toContain('unexpected_repayment_dml_grant_count')
    expect(recovery).toContain('STOP_OPEN_EDIT_REVISIONS_EXIST')
    expect(migration).toContain('constraint_definitions_exact')
    expect(migration).toContain('trigger_update_columns_exact')
    expect(preflight).toContain('binding_relation_exact')
    expect(preflight).toContain('target_metadata_acl_dependencies_exact')
    expect(postflight).toContain('constraint_definitions_exact')
    expect(postflight).toContain('trigger_update_columns_exact')
    expect(preflight).toContain('trigger_row.tgqual IS NULL')
    expect(postflight).toContain('trigger_row.tgqual IS NULL')
    expect(migration).toContain('trigger_row.tgqual IS NULL')
    expect(preflight).not.toMatch(/pg_get_constraintdef\(constraint_row\.oid\) LIKE/)
    expect(postflight).not.toMatch(/pg_get_constraintdef\(constraint_row\.oid\) LIKE/)
    expect(migration).not.toMatch(/pg_get_constraintdef\(constraint_row\.oid\) LIKE/)
    for (const artifact of [migration, preflight, postflight]) {
      expect(artifact).toMatch(
        /expense_edit_revision_bindings_pkey[\s\S]{0,300}?constraint_row\.conkey = ARRAY\[\(SELECT attnum/,
      )
      expect((artifact.match(/constraint_row\.confupdtype = 'a'/g) ?? [])).toHaveLength(4)
      expect((artifact.match(/constraint_row\.confmatchtype = 's'/g) ?? [])).toHaveLength(4)
    }
    expect(migration).not.toContain('CASE WHEN expected.service_execute')
  })

  it('uses predecessor-specific search paths and relation-specific forced RLS in preflight', () => {
    expect(preflight).toContain(
      'required_function(signature, source_hash, expected_config, expected_service_execute)',
    )
    expect(preflight).toMatch(
      /expense_save_private_draft\(uuid,uuid,text,uuid,uuid,text,jsonb,bigint\)'[\s\S]{0,120}?ARRAY\['search_path=pg_catalog, public'\]::text\[\]/,
    )
    expect(preflight).toMatch(
      /expense_update_expense_with_participants\(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid\[\],jsonb,jsonb\)'[\s\S]{0,120}?ARRAY\['search_path=""'\]::text\[\]/,
    )
    expect(preflight).toContain('procedure.proconfig = required_function.expected_config')
    expect(preflight).toContain('expected_relation(relation_oid, force_rls)')
    expect(preflight).toMatch(/expense_private_drafts'\), true/)
    expect(preflight).toMatch(/expense_unconfirmed_publications'\), true/)
    expect(preflight).toMatch(/expense_repayments'\), false/)
    expect(preflight).toContain('relforcerowsecurity = force_rls')
    expect(preflight).not.toMatch(
      /relrowsecurity AND NOT relforcerowsecurity AND owner_name = 'postgres'/,
    )
    const targetMetadata = preflight.match(
      /target_metadata_acl_dependencies_state AS \([\s\S]+?\), expected_relation/,
    )?.[0] ?? ''
    const stableSignatures = targetMetadata.match(
      /function_row\.provolatile = CASE[\s\S]+?\) THEN 's'::"char"/,
    )?.[0] ?? ''
    expect(stableSignatures).toContain(
      'public.expense_get_legacy_edit_draft_state_v1(uuid,uuid)',
    )
  })

  it('pins direct EXECUTE ACLs per predecessor function and exposes bounded gate evidence', () => {
    expect(preflight).toContain(
      'required_function(signature, source_hash, expected_config, expected_service_execute)',
    )
    expect(preflight).toMatch(
      /expense_save_private_draft\(uuid,uuid,text,uuid,uuid,text,jsonb,bigint\)'[\s\S]{0,180}?ARRAY\['search_path=pg_catalog, public'\]::text\[\],[\s\S]{0,30}?true/,
    )
    expect(preflight).toMatch(
      /expense_update_expense_with_participants\(uuid,uuid,uuid,bigint,text,bigint,text,date,text,text,text,boolean,jsonb,jsonb,uuid\[\],jsonb,jsonb\)'[\s\S]{0,180}?ARRAY\['search_path=""'\]::text\[\],[\s\S]{0,30}?true/,
    )
    expect(preflight).toMatch(
      /expense_begin_request\(uuid,uuid,text,text\)'[\s\S]{0,180}?ARRAY\['search_path=""'\]::text\[\],[\s\S]{0,30}?false/,
    )
    expect(preflight).toMatch(
      /expense_finish_request\(uuid,uuid,jsonb\)'[\s\S]{0,180}?ARRAY\['search_path=""'\]::text\[\],[\s\S]{0,30}?false/,
    )
    expect(preflight).toContain('expected_function_acl AS')
    expect(preflight).toContain('function_acl_state AS')
    expect((preflight.match(/EXCEPT ALL/g) ?? [])).toHaveLength(2)
    expect(preflight).toContain(
      'service_role_execute = expected_service_execute',
    )
    expect(preflight).not.toContain(
      'pg_catalog.count(*) = 8 FROM function_acl',
    )
    expect(preflight).toContain('pass_predecessor_source_and_metadata')
    expect(preflight).toContain('pass_predecessor_acl')
    expect(preflight).toContain('pass_predecessor_dependencies')
  })

  it('does not classify required replacement predecessors as partial SQL168 artifacts', () => {
    const manifest = preflight.match(
      /expected_target_function\(signature, source_hash, is_new_candidate\) AS \(\s*VALUES([\s\S]*?)\n\), target_function_contract AS/,
    )?.[1]
    expect(manifest).toBeDefined()

    const rows = [...manifest!.matchAll(
      /\('public\.([^']+)'\s*,\s*'[0-9a-f]{32}'\s*,\s*(true|false)\)/g,
    )].map((match) => ({ signature: match[1], isNewCandidate: match[2] === 'true' }))
    expect(rows).toHaveLength(24)

    const replacementPredecessors = new Set([
      'expense_simplified_settlement(uuid,text,boolean)',
      'expense_assert_private_draft_context(uuid,text,uuid,uuid)',
      'expense_list_visible_shared_drafts(uuid)',
      'expense_save_private_draft(uuid,uuid,text,uuid,uuid,text,jsonb,bigint)',
      'expense_delete_private_draft(uuid,uuid)',
    ])
    expect(rows.filter((row) => !row.isNewCandidate).map((row) => row.signature).sort())
      .toEqual([...replacementPredecessors].sort())

    const cleanPredecessorHasNewCandidate = rows.some(
      (row) => row.isNewCandidate && replacementPredecessors.has(row.signature),
    )
    expect(cleanPredecessorHasNewCandidate).toBe(false)
    expect(preflight).toContain('new_target_function_candidate_count')
    expect(preflight).toContain('binding_candidate_present')
    expect(preflight).toContain('index_candidate_present')
    expect(preflight).toContain('trigger_candidate_count')
    expect(preflight).toContain('target_state.any_new_target_function')
    expect(preflight).not.toContain('target_state.any_target_function')
    expect(preflight).toContain('pass_legacy_rows_preserved_inert')
    expect(preflight).toMatch(
      /ELSE\s+SELECT pg_catalog\.count\(\*\)::integer INTO v_unbound_count[\s\S]+?draft\.context_type = 'edit'/,
    )
  })

  it('fails clean eligibility closed for an itemless or mismatched proposed batch', () => {
    expect(migration).toMatch(/batch_row\.status = 'proposed'[\s\S]+?NOT EXISTS \([\s\S]+?expense_settlement_batch_items/)
    expect(migration).toMatch(/binding\.expense_id = p_expense_id[\s\S]+?draft\.expense_id IS DISTINCT FROM binding\.expense_id[\s\S]+?RETURN 'unavailable'/)
  })

  it('keeps migration postconditions and both validators pinned to every generated body', () => {
    for (const functionName of targetFunctions) {
      const match = migration.match(new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([^;]*?AS \\$function\\$(.*?)\\$function\\$;`,
        's',
      ))
      expect(match?.[1], functionName).toBeDefined()
      const sourceHash = createHash('md5').update(match![1], 'utf8').digest('hex')
      expect(migration, `${functionName} migration postcondition`).toContain(sourceHash)
      expect(preflight, `${functionName} preflight`).toContain(sourceHash)
      expect(postflight, `${functionName} postflight`).toContain(sourceHash)
    }
  })

  it('returns bounded named postcondition evidence while preserving rollback', () => {
    const postcondition = migration.match(
      /DO \$postcondition\$([\s\S]+?)\$postcondition\$;/,
    )?.[1] ?? ''
    expect(postcondition).toContain('v_binding_relation_security_exact boolean;')
    expect(postcondition).toContain('v_replaced_global_index_absent boolean;')
    expect(postcondition).toMatch(
      /SELECT EXISTS \([\s\S]+?public\.expense_edit_revision_bindings[\s\S]+?relrowsecurity[\s\S]+?relforcerowsecurity[\s\S]+?aclexplode\(COALESCE\([\s\S]+?INTO v_binding_relation_security_exact;/,
    )
    expect(postcondition).toMatch(
      /pg_catalog\.to_regclass\([\s\S]+?expense_private_drafts_one_open_edit_per_expense_idx[\s\S]+?IS NULL[\s\S]+?INTO v_replaced_global_index_absent;/,
    )
    expect(postcondition).toContain('OR NOT v_binding_relation_security_exact')
    expect(postcondition).toContain('OR NOT v_replaced_global_index_absent')
    expect(postcondition).toMatch(
      /RAISE EXCEPTION 'expense_sql168_postcondition_failed'[\s\S]+?USING DETAIL =/,
    )

    const detail = postcondition.match(
      /USING DETAIL = ([\s\S]+?);/,
    )?.[1] ?? ''
    for (const field of [
      'function_count',
      'bad_function_count',
      'bad_acl_count',
      'trigger_count',
      'unexpected_repayment_dml_grant_count',
      'binding_relation_exact',
      'constraint_definitions_exact',
      'trigger_update_columns_exact',
      'target_metadata_acl_dependencies_exact',
      'public_schema_acl_exact',
      'binding_relation_security_exact',
      'replaced_global_index_absent',
    ]) {
      expect(detail).toContain(`'${field}'`)
    }
    expect(detail).toContain("'contract_version', 1")
    expect(detail).not.toMatch(/uuid|actor|draft_id|expense_id|prosrc|function_source|grantee|email|payload/i)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
  })

  it('derives matching default-argument contracts for every target function', () => {
    const declaredDefaults = new Map(targetFunctions.map((functionName) => {
      const parameters = migration.match(new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\(([\\s\\S]*?)\\)\\s*RETURNS`,
      ))?.[1] ?? ''
      return [functionName, (parameters.match(/\bDEFAULT\b/g) ?? []).length] as const
    }))
    const expectedDeclaredDefaults: Array<[string, number]> = [
      ['expense_save_private_draft', 1],
      ['expense_settlement_eligible_balances_v1', 1],
      ['expense_simplified_settlement', 1],
    ]
    expect(
      [...declaredDefaults.entries()]
        .filter(([, count]) => count > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual(expectedDeclaredDefaults.sort(
      ([left], [right]) => left.localeCompare(right),
    ))

    const expectedDefaultSignatures = new Set(
      [...declaredDefaults.entries()]
        .filter(([, count]) => count === 1)
        .map(([name]) => `public.${name}`),
    )
    const migrationDefaultCase = migration.match(
      /pronargdefaults <> CASE[\s\S]+?THEN 1 ELSE 0 END/,
    )?.[0] ?? ''
    const preflightDefaultCase = preflight.match(
      /pronargdefaults = CASE[\s\S]+?THEN 1 ELSE 0 END/,
    )?.[0] ?? ''
    for (const signaturePrefix of expectedDefaultSignatures) {
      expect(migrationDefaultCase).toContain(signaturePrefix)
      expect(preflightDefaultCase).toContain(signaturePrefix)
    }
    expect((migrationDefaultCase.match(/public\.expense_/g) ?? [])).toHaveLength(3)
    expect((preflightDefaultCase.match(/public\.expense_/g) ?? [])).toHaveLength(3)

    expect(postflight).toMatch(
      /expense_save_private_draft\(uuid,uuid,text,uuid,uuid,text,jsonb,bigint\)'[\s\S]{0,700}?'plpgsql', '4c55e9caaabb3a287dfa06ed55ab1fe7', true, 1\)/,
    )
  })
})
