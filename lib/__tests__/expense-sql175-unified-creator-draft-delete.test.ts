import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sqlRoot = join(process.cwd(), 'sql')
const validationRoot = join(
  sqlRoot,
  'validation/175-expense-unified-creator-draft-delete',
)
const migration = readFileSync(
  join(sqlRoot, '175_expense_unified_creator_draft_delete.sql'),
  'utf8',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const rehearsal = readFileSync(
  join(validationRoot, 'rehearse-migration.sql'),
  'utf8',
)
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

const functionNames = [
  'expense_sql175_private_group_summary',
  'expense_sql175_begin_event_delete_request',
  'expense_list_group_creation_drafts_v1',
  'teskeid_event_get_expense_pre_active_v2',
  'expense_get_shared_draft_management_target_v1',
  'expense_get_own_creation_draft_delete_capability_v1',
  'expense_delete_own_creation_draft_v1',
] as const

const bodyHashes: Record<(typeof functionNames)[number], string> = {
  expense_sql175_private_group_summary: '0f6cac7b817e25d7f61ebf8a923e69d2',
  expense_sql175_begin_event_delete_request: 'ea3732c799f6737cb9dbbe7aebc02a36',
  expense_list_group_creation_drafts_v1: '578aecf4b838c85b9d70ad4748ea4f6e',
  teskeid_event_get_expense_pre_active_v2: '65270072a4d257dcdb650cf1715b324f',
  expense_get_shared_draft_management_target_v1: '6c5bc595cf9610550dfdd6b1741870c2',
  expense_get_own_creation_draft_delete_capability_v1: '26b15255fc401c05eb7808917698fe30',
  expense_delete_own_creation_draft_v1: '4ba7b3a6be41204ec3807c63e37bdeb4',
}

function functionBody(source: string, name: string) {
  const declaration = `CREATE OR REPLACE FUNCTION public.${name}`
  const declarationIndex = source.indexOf(declaration)
  expect(declarationIndex, `${name} declaration`).toBeGreaterThanOrEqual(0)
  const delimiter = 'AS $function$'
  const bodyStart = source.indexOf(delimiter, declarationIndex) + delimiter.length
  const bodyEnd = source.indexOf('$function$;', bodyStart)
  expect(bodyEnd, `${name} body terminator`).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd).replace(/\r\n/g, '\n')
}

function stripFunctionBodies(source: string) {
  return source.replace(
    /AS \$function\$[\s\S]*?\$function\$;/g,
    'AS $function$<definition only>$function$;',
  )
}

function md5(value: string) {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

function constraintManifest(source: string) {
  return Array.from(
    source.matchAll(
      /^\s*\('([^']+)','([^']+)','([cfpux])','([0-9a-f]{32})'\),?\s*$/gm,
    ),
    (match) => [match[1], match[2], match[3], match[4]] as const,
  )
}

describe('SQL175 unified creator creation-draft deletion', () => {
  it('is one atomic additive migration with COMMIT last', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(migration.match(/^CREATE OR REPLACE FUNCTION public\./gm)).toHaveLength(7)
    expect(migration).not.toMatch(/^CREATE (?:TABLE|TRIGGER|POLICY|INDEX)\b/gm)
    expect(migration).not.toMatch(/^ALTER TABLE\b/gm)
    expect(migration).not.toMatch(/^DROP\b/gm)
  })

  it('installs only the frozen versioned signatures and exact ACL boundary', () => {
    expect(migration).toContain(
      'expense_get_own_creation_draft_delete_capability_v1(uuid,uuid)',
    )
    expect(migration).toContain(
      'expense_delete_own_creation_draft_v1(uuid,uuid,uuid,bigint,bigint)',
    )
    expect(migration).toContain(
      'expense_list_group_creation_drafts_v1(uuid,uuid)',
    )
    expect(migration).toContain(
      'teskeid_event_get_expense_pre_active_v2(uuid,uuid)',
    )
    expect(migration).toContain(
      'expense_get_shared_draft_management_target_v1(uuid,uuid)',
    )
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.expense_sql175_begin_event_delete_request\(uuid,uuid,text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_sql175_(?:private_group_summary|begin_event_delete_request)/,
    )
    for (const name of [
      'expense_get_own_creation_draft_delete_capability_v1',
      'expense_delete_own_creation_draft_v1',
      'expense_list_group_creation_drafts_v1',
      'teskeid_event_get_expense_pre_active_v2',
      'expense_get_shared_draft_management_target_v1',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?\\)\\s+TO service_role;`,
        ),
      )
    }
    expect(migration).not.toMatch(/\bTO (?:anon|authenticated)\b/)
  })

  it('freezes every SQL175 body hash in migration and operator gates', () => {
    for (const name of functionNames) {
      const actual = md5(functionBody(migration, name))
      expect(actual, name).toBe(bodyHashes[name])
      expect(migration.match(new RegExp(actual, 'g'))).toHaveLength(2)
      expect(preflight).toContain(actual)
      expect(postflight).toContain(actual)
      expect(md5(functionBody(rehearsal, name)), `${name} rehearsal`).toBe(actual)
    }
  })

  it('keeps SQL159 readers and the SQL173 confirmed-delete contract byte-frozen', () => {
    for (const name of [
      'expense_list_group_shared_drafts',
      'teskeid_event_get_expense_pre_active_v1',
      'expense_get_shared_draft_detail',
      'expense_get_own_delete_capability',
      'expense_delete_own_unsettled_expense',
      'expense_hard_delete_receipt_shape_known',
      'expense_hard_delete_receipts_classified',
    ]) {
      expect(migration).not.toContain(`CREATE OR REPLACE FUNCTION public.${name}(`)
    }
    for (const hash of [
      '0a06c9d47c9c17dad77c715fbef50d55',
      '4332f4ccfd5e58f2e17ebe9389c13311',
      '51a607ab9bc5e5ad5a19f4b9d96aa00b',
      '3124b6233c3045627463f49487a49c59',
      'ffbd530e2f759d85809a34045ac15a1e',
      '41bc44fc718a17fc4fc8c0777e0a0a67',
      'edb8a21d01ffdbbb8e9aa2b94c7c2594',
      '9def695d70fc38b63011cb2bd12e2e67',
    ]) {
      expect(migration).toContain(hash)
      expect(preflight).toContain(hash)
      expect(postflight).toContain(hash)
    }
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.expense_list_dashboard_presentations_v1',
    )
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.expense_sql172_project_private_draft',
    )
  })

  it('advertises only exact creator-owned, non-edit, safe-version drafts', () => {
    const capability = functionBody(
      migration,
      'expense_get_own_creation_draft_delete_capability_v1',
    )
    expect(capability).toContain('draft.actor_user_id = p_actor_id')
    expect(capability).toContain("v_draft.context_type NOT IN ('one_off', 'group')")
    expect(capability).toContain('v_draft.expense_id IS NOT NULL')
    expect(capability).toContain('v_draft.version NOT BETWEEN 1 AND 9007199254740991')
    expect(capability).toContain('v_publication.publication_version = 9007199254740991')
    expect(capability).toContain("'context_type', v_draft.context_type")
    expect(capability).toContain("'group_id', v_draft.group_id")
    expect(capability).toContain("'expected_draft_version', v_draft.version")
    expect(capability).toContain(
      "'expected_publication_version', v_publication.publication_version",
    )
    expect(capability).not.toMatch(/FOR (?:UPDATE|SHARE)/)
    expect(capability).not.toContain('expense_group_members')
    expect(capability).not.toContain("group_row.status = 'active'")
  })

  it('serializes and validates the exact draft/publication CAS before one delete', () => {
    const mutation = functionBody(
      migration,
      'expense_delete_own_creation_draft_v1',
    )
    const order = [
      'pg_advisory_xact_lock(175, 107)',
      'public.expense_begin_request(',
      'public.expense_sql175_begin_event_delete_request(',
      'FROM public.expense_private_drafts AS draft',
      'FOR UPDATE;',
      'FROM public.expense_unconfirmed_publications AS publication',
      'FROM public.expense_unconfirmed_publication_parties AS party',
      'FROM public.expense_unconfirmed_publication_audience AS audience',
      'FROM public.expense_unconfirmed_finalizations AS finalization',
      'DELETE FROM public.expense_private_drafts AS draft',
      'public.teskeid_event_finish_request(',
      'public.expense_finish_request(',
    ].map((token) => mutation.indexOf(token))
    order.forEach((index) => expect(index).toBeGreaterThanOrEqual(0))
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index]).toBeGreaterThan(order[index - 1])
    }
    expect(mutation.match(/DELETE FROM public\.expense_private_drafts AS draft/g)).toHaveLength(1)
    expect(mutation).not.toMatch(
      /DELETE FROM public\.(?:expense_unconfirmed_publications|expense_unconfirmed_publication_parties|expense_unconfirmed_publication_audience)/,
    )
    expect(mutation).toContain('draft.actor_user_id = p_actor_id')
    expect(mutation).toContain("v_draft.context_type NOT IN ('one_off', 'group')")
    expect(mutation).toContain('v_draft.expense_id IS NOT NULL')
    expect(mutation).toContain('v_draft.version <> p_expected_draft_version')
    expect(mutation).toContain(
      'v_publication.publication_version <> p_expected_publication_version',
    )
    expect(mutation).toContain('v_publication.publication_version = 9007199254740991')
    expect(mutation).toContain('p_expected_publication_version + 1')
    expect(mutation).toContain('expense_private_draft_tombstones')
    expect(mutation).toMatch(
      /expense_unconfirmed_finalizations AS finalization[\s\S]*?expense_creation_draft_delete_not_allowed/,
    )
  })

  it('uses a deletion-only Event receipt gate without current Event entitlement', () => {
    const gate = functionBody(
      migration,
      'expense_sql175_begin_event_delete_request',
    )
    expect(gate).toContain('hashtextextended(p_actor_id::text, 9601)')
    expect(gate).toContain('hashtextextended(p_actor_id::text, 13201)')
    expect(gate).toContain('FROM auth.users AS account')
    expect(gate).toContain('public.expense_has_beta_access(p_actor_id)')
    expect(gate).toContain("'expense_sql175_delete_gate_v1'")
    expect(gate).not.toContain('teskeid_event_assert_actor')
    expect(gate).not.toContain('teskeid_event_assert_financial_actor')
    expect(gate).not.toContain('teskeid_event_begin_request')
    expect(gate.indexOf('9601')).toBeLessThan(gate.indexOf('13201'))
  })

  it('has strict replay and a PII-free exact result', () => {
    const mutation = functionBody(
      migration,
      'expense_delete_own_creation_draft_v1',
    )
    expect(mutation).toContain(
      "'contract_version','state','deleted','draft_id','subject',",
    )
    expect(mutation).toContain("'group_id','event_id'")
    expect(mutation).toContain("v_replay - ARRAY[")
    expect(mutation).toContain("v_replay ?& ARRAY[")
    expect(mutation).toContain(
      "v_replay->'group_id' <> 'null'::jsonb\n         AND v_replay->'event_id' <> 'null'::jsonb",
    )
    const resultStart = mutation.indexOf('v_result := pg_catalog.jsonb_build_object(')
    const resultEnd = mutation.indexOf(');', resultStart)
    const result = mutation.slice(resultStart, resultEnd)
    for (const key of [
      'contract_version',
      'state',
      'deleted',
      'draft_id',
      'subject',
      'group_id',
      'event_id',
    ]) {
      expect(result).toContain(`'${key}'`)
    }
    expect(result).not.toMatch(
      /(?:title|note|payload|email|participant|member|invitation|receipt)/i,
    )
  })

  it('adds zero-downtime group/Event/direct management read contracts', () => {
    const group = functionBody(migration, 'expense_list_group_creation_drafts_v1')
    expect(group).toContain("'lifecycle_state', 'private_draft'")
    expect(group).toContain("'lifecycle_state', 'shared_draft'")
    expect(group).toContain("'publication_version', v_shared.publication_version")
    expect(group).toContain("'draft_version', v_private.version")
    expect(group).toContain("'viewer_role', 'author'")
    expect(group).toContain("THEN 'author' ELSE 'participant' END")
    expect(group).toContain("'kind', 'private_draft'")
    expect(group).toContain("'kind', 'shared_draft'")
    expect(group).toContain('EXCEPTION WHEN OTHERS THEN')

    const summary = functionBody(migration, 'expense_sql175_private_group_summary')
    expect(summary).toContain('EXCEPTION WHEN OTHERS THEN')
    expect(summary).toContain('v_total_minor := NULL')
    expect(summary).not.toContain("v_draft.payload->>'note'")

    const event = functionBody(migration, 'teskeid_event_get_expense_pre_active_v2')
    expect(event).toContain('public.teskeid_event_get_expense_pre_active_v1(')
    expect(event).toContain('publication.actor_user_id = p_actor_id')
    expect(event).toContain("ARRAY['detail_target']::text[]")
    expect(event).toContain("'kind', 'private_draft'")

    const direct = functionBody(
      migration,
      'expense_get_shared_draft_management_target_v1',
    )
    expect(direct).toContain('draft.expense_id IS NULL')
    expect(direct).toContain('publication.actor_user_id = p_actor_id')
    expect(direct).toContain("'viewer_role', 'participant'")
    expect(direct).toMatch(
      /expense_sql159_audience_allows\([\s\S]*?\);\s+IF v_publication\.draft_id IS NULL/,
    )
    expect(direct).not.toMatch(/FOR (?:UPDATE|SHARE)/)
  })

  it('defines deletion capability without performing rollout-time data DML', () => {
    for (const [name, source] of [
      ['migration', migration],
      ['preflight', preflight],
      ['rehearsal', rehearsal],
      ['postflight', postflight],
    ] as const) {
      const outsideDefinitions = stripFunctionBodies(source)
      expect(outsideDefinitions, name).not.toMatch(
        /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(?:public|auth)\./i,
      )
      expect(outsideDefinitions, name).not.toMatch(
        /(?:PERFORM|SELECT)\s+public\.expense_delete_own_creation_draft_v1\s*\(/i,
      )
      expect(source, name).not.toMatch(/pg_catalog\.coalesce/i)
      expect(source, name).not.toMatch(/\bAS authorization\b/i)
    }
    expect(preflight).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(postflight).not.toContain('CREATE OR REPLACE FUNCTION')
  })

  it('rehearses the exact migration and rolls every catalog change back', () => {
    const migrationBody = migration.slice(
      migration.indexOf('BEGIN;'),
      migration.lastIndexOf('\nCOMMIT;'),
    )
    const rehearsalBody = rehearsal.slice(
      rehearsal.indexOf('BEGIN;'),
      rehearsal.lastIndexOf('\nROLLBACK;'),
    )
    expect(rehearsalBody).toBe(migrationBody)
    expect(rehearsal).not.toContain('\nCOMMIT;')
    expect(rehearsal).toContain('candidate_catalog_verified')
    expect(rehearsal).toContain('installation_rolled_back')
    expect(rehearsal).toContain('predecessor_restored')
    expect(rehearsal).toContain('rehearsal_pass')
  })

  it('parenthesizes CASE inside the PL/pgSQL target-source IF condition', () => {
    const parenthesizedCase =
      /\) IS DISTINCT FROM \(\s*CASE v_name[\s\S]*?\sEND\s*\) THEN/
    const unparenthesizedCase = /\) IS DISTINCT FROM CASE v_name/

    for (const [name, source] of [
      ['migration', migration],
      ['rehearsal', rehearsal],
    ] as const) {
      expect(source, name).toMatch(parenthesizedCase)
      expect(source, name).not.toMatch(unparenthesizedCase)
    }
  })

  it('uses catalog-only exact preflight/postflight and ships no recovery', () => {
    for (const source of [preflight, postflight]) {
      expect(source).toContain('predecessor_contracts_exact')
      expect(source).toContain('target_overloads_exact')
      expect(source).toContain('target_contracts_exact')
      expect(source).toContain('target_sources_exact')
      expect(source).toContain('target_acls_exact')
      expect(source).toContain('target_dependencies_exact')
      expect(source).toContain('private_relation_acls_exact')
      expect(source).toContain('relation_constraints_exact')
      expect(source).toContain('delete_trigger_exact')
      expect(source).toContain('sql173_finalization_guard_exact')
      expect(source).toContain('expense_sql159_private_draft_delete_guard')
      expect(source).toContain('expense_private_drafts_context_check')
      expect(source).toContain('expense_unconfirmed_publications_live_shape_check')
      expect(source).toContain(
        'expense_unconfirmed_publication_parties_publication_fk',
      )
      expect(source).toContain(
        'expense_unconfirmed_publication_audience_party_fk',
      )
      expect(source).toContain('expense_unconfirmed_finalizations_pkey')
      expect(source).toContain('expense_private_draft_tombstones_pkey')
      expect(source).toContain('expense_mutation_requests_result_check')
      expect(source).toContain('teskeid_event_mutation_requests_result_check')
      expect(source).toContain('pg_get_function_arguments')
      expect(source).toContain('pg_get_function_result')
      expect(source).toContain("observed.proconfig = ARRAY['search_path=\"\"']")
      expect(source).toContain('pg_catalog.aclexplode')
      expect(source).toContain("COALESCE(pg_catalog.bool_and(")
      expect(source).not.toMatch(/\bFROM public\.(?!pg_)/i)
    }
    expect(preflight).toContain("THEN 'PREDECESSOR_READY'")
    expect(preflight).toContain("THEN 'EXACT_INSTALLED'")
    expect(postflight).toContain('AS postconditions_ok')
    expect(
      existsSync(join(validationRoot, 'recovery.sql')),
    ).toBe(false)
  })

  it('freezes the SQL173-installed 52-constraint relation closure in every SQL gate', () => {
    const gates = [
      ['migration', migration],
      ['preflight', preflight],
      ['rehearsal', rehearsal],
      ['postflight', postflight],
    ] as const
    const expectedManifest = constraintManifest(migration)

    expect(expectedManifest).toHaveLength(52)
    expect(new Set(expectedManifest.map((row) => row.join('\u0000'))).size).toBe(
      52,
    )
    expect(
      new Set(
        expectedManifest.map(
          ([relation, constraint]) => `${relation}\u0000${constraint}`,
        ),
      ).size,
    ).toBe(52)

    for (const [name, source] of gates) {
      const actualManifest = constraintManifest(source)
      expect(actualManifest, `${name} constraint count`).toHaveLength(52)
      expect(
        new Set(actualManifest.map((row) => row.join('\u0000'))).size,
        `${name} unique constraint tuples`,
      ).toBe(52)
      expect(
        new Set(
          actualManifest.map(
            ([relation, constraint]) => `${relation}\u0000${constraint}`,
          ),
        ).size,
        `${name} unique relation/constraint identities`,
      ).toBe(52)
      expect(actualManifest, `${name} exact constraint sequence`).toEqual(
        expectedManifest,
      )
      expect(source, name).toContain("actual.contype IN ('c','f','p','u','x')")
      if (name === 'migration' || name === 'rehearsal') {
        expect(source, name).toContain(') <> 52 OR EXISTS (')
      } else {
        expect(source, name).toContain('count(observed.oid) = 52')
        expect(source, name).toContain('count(*) = 52')
      }
      expect(source, name).toContain('expense_private_drafts_context_check')
      expect(source, name).toContain('expense_unconfirmed_publications_live_shape_check')
      expect(source, name).toContain('expense_unconfirmed_finalizations_expense_fk')
      expect(source, name).not.toContain(
        "'expense_unconfirmed_finalizations_expense_fk','f'",
      )
      expect(source, name).toContain(
        'expense_unconfirmed_finalizations_expense_reference_guard',
      )
      expect(source, name).toContain(
        'expense_validate_finalization_expense_reference',
      )
      expect(source, name).toContain('3124b6233c3045627463f49487a49c59')
      expect(source, name).toContain('expense_private_draft_tombstones_pkey')
      expect(source, name).toContain('expense_mutation_requests_pkey')
      expect(source, name).toContain('teskeid_event_mutation_requests_pkey')
      expect(source, name).toContain('convalidated')
      expect(source, name).toContain('condeferrable')
      expect(source, name).toContain('condeferred')
      expect(source, name).toContain('connoinherit')
    }
  })

  it('rejects any additional private-draft DELETE trigger', () => {
    for (const [name, source] of [
      ['migration', migration],
      ['preflight', preflight],
      ['rehearsal', rehearsal],
      ['postflight', postflight],
    ] as const) {
      expect(source, name).toContain('(delete_trigger.tgtype::integer & 8) = 8')
      expect(source, name).toMatch(
        /expense_private_drafts[\s\S]*?delete_trigger[\s\S]*?count\(\*\)(?:\s*=\s*1|[\s\S]*?<>\s*1)/,
      )
    }
  })

  it('freezes predecessor overloads, metadata, search_path and exact ACLs', () => {
    for (const [name, source] of [
      ['migration', migration],
      ['preflight', preflight],
      ['rehearsal', rehearsal],
      ['postflight', postflight],
    ] as const) {
      expect(source, name).toContain('pg_get_function_arguments')
      expect(source, name).toContain('pg_get_function_result')
      expect(source, name).toMatch(/proargmodes IS (?:NOT )?NULL/)
      expect(source, name).toMatch(/proparallel (?:=|<>) 'u'/)
      expect(source, name).toMatch(
        /proconfig (?:=|IS DISTINCT FROM) ARRAY\['search_path=""'\]/,
      )
      expect(source, name).toContain('pg_catalog.aclexplode')
      expect(source, name).toContain("privilege_row.privilege_type = 'EXECUTE'")
      expect(source, name).toContain('privilege_row.grantee =')
      expect(source, name).toContain('overload.proname')
    }
  })

  it('matches canonical predecessor strictness and constraint inheritance metadata', () => {
    for (const [name, source] of [
      ['migration', migration],
      ['rehearsal', rehearsal],
    ] as const) {
      expect(source, name).toContain(
        "observed.proisstrict <> (\n         observed.signature =\n           'public.expense_identity_request_id(text,uuid)'\n       )",
      )
      expect(source, name).toContain(
        "observed.connoinherit <> (\n         observed.constraint_type IN ('p', 'u', 'f')\n       )",
      )
    }

    for (const [name, source] of [
      ['preflight', preflight],
      ['postflight', postflight],
    ] as const) {
      expect(source, name).toContain(
        "observed.proisstrict = (\n            observed.signature =\n              'public.expense_identity_request_id(text,uuid)'\n          )",
      )
      expect(source, name).toContain(
        "observed.connoinherit = (\n            observed.constraint_type IN ('p', 'u', 'f')\n          )",
      )
    }
  })

  it('fails closed when any nullable catalog field participates in exactness', () => {
    for (const [name, source] of [
      ['preflight', preflight],
      ['postflight', postflight],
    ] as const) {
      expect(source, name).toContain('bool_and(COALESCE((')
      expect(source, name).toContain('COALESCE(acl.acl_exact, false)')
      expect(source, name).toContain(
        'COALESCE(dependency.dependencies_exact, false)',
      )
      expect(source, name).not.toMatch(
        /bool_and\(\s*(?:observed|privilege_row|trigger_row)\./,
      )
      expect(source, name).not.toMatch(
        /bool_and\(\s*(?:acl\.acl_exact|dependency\.dependencies_exact)\s*\)/,
      )
    }
  })

  it('documents UI-only runtime deletion and operator/local safety', () => {
    expect(readme).toContain('SQL rollout = install deletion capability')
    expect(readme).toContain('UI confirmation = creator decides to delete')
    expect(readme).toContain('runtime RPC = delete one exact eligible creation draft')
    expect(readme).toContain('Do not call either deletion RPC from SQL Editor')
    expect(readme).toContain('No recovery artifact is included')
    expect(readme).toContain('Preflight `PREDECESSOR_READY`')
    expect(readme).toContain('Preflight `EXACT_INSTALLED`')
    expect(readme).toContain('Postflight `EXACT_INSTALLED`')
    expect(readme).toContain('unexpected true/false value')
    expect(readme).toContain('## Localhost checks for Stebbi')
  })
})
