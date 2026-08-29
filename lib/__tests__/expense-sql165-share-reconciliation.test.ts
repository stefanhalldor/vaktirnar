import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => {
  const absolute = join(root, path)
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
}

const migration = read('sql/165_expense_share_in_place_reconciliation.sql')
const validationRoot = 'sql/validation/165-expense-share-reconciliation'
const preflight = read(`${validationRoot}/preflight.sql`)
const postflight = read(`${validationRoot}/postflight.sql`)
const recovery = read(`${validationRoot}/recovery.sql`)
const readme = read(`${validationRoot}/README.md`)
const actions = read('lib/expenses/actions.ts')
const contracts = read('lib/expenses/contracts.ts')
const form = read('components/expenses/ExpenseForm.tsx')
const isMessages = read('messages/is.json')
const enMessages = read('messages/en.json')
const sql105 = read('sql/105_expense_edit_member_reference_fix.sql')
const sql141 = read('sql/141_expense_canonical_identity_and_claim_disputes.sql')

type AclTuple = readonly [
  grantee: number,
  grantor: number,
  privilege: 'EXECUTE',
  isGrantable: boolean,
]

const ownerOid = 10
const serviceRoleOid = 20
const publicOid = 0
const customRoleOid = 30
const exactAcl: readonly AclTuple[] = [
  [ownerOid, ownerOid, 'EXECUTE', false],
  [serviceRoleOid, ownerOid, 'EXECUTE', false],
]

function aclTupleSetExact(actual: readonly AclTuple[]) {
  const normalize = (rows: readonly AclTuple[]) =>
    rows.map((row) => JSON.stringify(row)).sort()
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(exactAcl))
}

function taggedBlock(source: string, tag: string) {
  const marker = `$${tag}$`
  const start = source.indexOf(marker)
  const end = source.indexOf(marker, start + marker.length)
  expect(start, `${tag} start`).toBeGreaterThanOrEqual(0)
  expect(end, `${tag} end`).toBeGreaterThan(start)
  return source.slice(start + marker.length, end)
}

function sql105UpdateBody() {
  const normalized = sql105.replace(/\r\n/g, '\n')
  const signature = 'CREATE OR REPLACE FUNCTION public.expense_update_expense('
  const signatureStart = normalized.indexOf(signature)
  const bodyStart = normalized.indexOf('AS $$', signatureStart) + 'AS $$'.length
  const bodyEnd = normalized.indexOf('\n$$;', bodyStart)
  expect(signatureStart).toBeGreaterThanOrEqual(0)
  expect(bodyStart).toBeGreaterThan('AS $$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return normalized.slice(bodyStart, bodyEnd + 1)
}

const md5 = (value: string) => createHash('md5').update(value).digest('hex')

function literalCount(source: string, value: string) {
  return source.split(value).length - 1
}

function migrationPostconditionFailures(targetBody: string) {
  const oldGate = taggedBlock(migration, 'old_gate')
  const newGate = taggedBlock(migration, 'new_gate')
  const oldMutation = taggedBlock(migration, 'old_mutation')
  const newMutation = taggedBlock(migration, 'new_mutation')
  const failures: string[] = []

  if (md5(targetBody) !== '30ba02f3b79d2c7a9387ee504d198d12') {
    failures.push('target_hash_mismatch')
  }
  if (!targetBody.includes(newGate)) failures.push('new_gate_missing')
  if (!targetBody.includes(newMutation)) failures.push('new_mutation_missing')
  if (targetBody.includes(oldMutation)) failures.push('old_mutation_present')

  const rejectsOldGate = migration.includes(
    'OR pg_catalog.strpos(v_post_body, v_old_gate) <> 0',
  )
  if (rejectsOldGate && targetBody.includes(oldGate)) {
    failures.push('forbidden_old_gate_present')
  }

  return failures
}

describe('SQL165 durable Expense share reconciliation', () => {
  it('ships one guarded forward function-source replacement', () => {
    expect(migration).toMatch(/^-- SQL165:[\s\S]*\nBEGIN;/)
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\.expense_update_expense/g)).toHaveLength(1)
    expect(migration).toContain('expense_sql165_predecessor_mismatch')
    expect(migration).toContain('expense_sql165_fixed_source_mismatch')
    expect(migration).toContain('COMMIT;')
  })

  it('locks current share identities deterministically before reference checks and mutations', () => {
    const lock = migration.indexOf('ORDER BY share.member_id\n    FOR UPDATE')
    const collaborator = migration.indexOf('public.expense_share_collaborators')
    const invitation = migration.indexOf('public.expense_member_invitations')
    const mutation = migration.indexOf('UPDATE public.expense_shares AS share')
    expect(lock).toBeGreaterThan(-1)
    expect(collaborator).toBeGreaterThan(lock)
    expect(invitation).toBeGreaterThan(lock)
    expect(mutation).toBeGreaterThan(invitation)
  })

  it('checks both durable reference classes without lifecycle filtering', () => {
    expect(migration).toContain('expense_share_has_durable_reference')
    expect(migration).toContain('collaborator_reference.share_member_id = obsolete_share.member_id')
    expect(migration).toContain('invitation_reference.shared_share_member_id = obsolete_share.member_id')
    expect(migration).not.toMatch(/collaborator_reference\.status\s*=/)
    expect(migration).not.toMatch(/invitation_reference\.status\s*=/)
  })

  it('updates retained rows, inserts new rows, and deletes only obsolete rows', () => {
    const targetMutation = migration.match(/\$new_mutation\$([\s\S]*?)\$new_mutation\$/)?.[1] ?? ''
    expect(targetMutation).toContain('UPDATE public.expense_shares AS share')
    expect(targetMutation).toContain('SET amount_minor = (submitted.value->>\'amount_minor\')::bigint')
    expect(targetMutation).toContain('INSERT INTO public.expense_shares (group_id, expense_id, member_id, amount_minor)')
    expect(targetMutation).toContain('WHERE NOT EXISTS (\n        SELECT 1 FROM public.expense_shares AS current_share')
    expect(targetMutation).toContain('DELETE FROM public.expense_shares AS share')
    expect(targetMutation).toContain('WHERE share.expense_id = p_expense_id\n      AND NOT EXISTS (')
    expect(targetMutation).not.toContain('DELETE FROM public.expense_shares AS share WHERE share.expense_id = p_expense_id;')
  })

  it('keeps the preserve-shares branch and SQL141 base dependency', () => {
    expect(migration).toContain('IF NOT p_preserve_shares THEN')
    expect(sql141).toContain('v_result := public.expense_update_expense(')
    expect(sql141).not.toContain('expense_share_has_durable_reference')
  })

  it('classifies predecessor-ready, exact-installed, and every other state as STOP', () => {
    for (const classification of [
      'PREDECESSOR_READY',
      'EXACT_INSTALLED',
      'STOP_PARTIAL_OR_PREDECESSOR_DRIFT',
    ]) expect(preflight).toContain(`'${classification}'`)
    expect(preflight).toContain('function_exists')
    expect(preflight).toContain('predecessor_exact')
    expect(preflight).toContain('target_exact')
    expect(preflight).not.toContain("'ABSENT_READY'")
  })

  it('verifies exact target source, contract, ACL, dependencies, and SQL113 FKs', () => {
    for (const source of [preflight, postflight]) {
      expect(source).toContain('source_hash')
      expect(source).toContain('contract_exact')
      expect(source).toContain('acl_exact')
      expect(source).toContain('wrapper_contract_exact')
      expect(source).toContain('wrapper_acl_exact')
      expect(source).toContain('wrapper_source_exact')
      expect(source).toContain('wrapper_base_call_exact')
      expect(source).toContain('share_foreign_keys_exact')
      expect(source).toContain('public_schema_acl_exact')
    }
    expect(postflight).toContain('postconditions_ok')
  })

  it('defines the exact ACL tuple truth table without losing PUBLIC OID zero', () => {
    expect(aclTupleSetExact(exactAcl)).toBe(true)
    expect(aclTupleSetExact([
      [ownerOid, ownerOid, 'EXECUTE', false],
      [publicOid, ownerOid, 'EXECUTE', false],
    ])).toBe(false)
    expect(aclTupleSetExact([...exactAcl, [publicOid, ownerOid, 'EXECUTE', false]])).toBe(false)
    expect(aclTupleSetExact([...exactAcl, [customRoleOid, ownerOid, 'EXECUTE', false]])).toBe(false)
    expect(aclTupleSetExact([
      [ownerOid, ownerOid, 'EXECUTE', false],
      [serviceRoleOid, customRoleOid, 'EXECUTE', false],
    ])).toBe(false)
    expect(aclTupleSetExact([
      [ownerOid, ownerOid, 'EXECUTE', false],
      [serviceRoleOid, ownerOid, 'EXECUTE', true],
    ])).toBe(false)
    expect(aclTupleSetExact([[ownerOid, ownerOid, 'EXECUTE', false]])).toBe(false)
    expect(aclTupleSetExact([
      [ownerOid, ownerOid, 'EXECUTE', false],
      [ownerOid, ownerOid, 'EXECUTE', false],
    ])).toBe(false)
  })

  it('uses one NULL-safe raw-OID ACL tuple-set contract in every operator gate', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain("pg_catalog.to_regrole('postgres')::oid")
      expect(source).toContain("pg_catalog.to_regrole('service_role')::oid")
      expect(source).toContain('privilege_row.grantee')
      expect(source).toContain('privilege_row.grantor')
      expect(source).toContain('privilege_row.privilege_type')
      expect(source).toContain('privilege_row.is_grantable')
      expect(source).toContain('EXCEPT ALL')
      expect(source).toContain('expected_function_acl')
      expect(source).not.toContain("grantee_role.rolname IN ('postgres', 'service_role')")
    }
  })

  it('freezes the complete wrapper contract, ACL, source, and one exact base call', () => {
    const wrapperArguments =
      'p_actor_id uuid, p_request_id uuid, p_expense_id uuid, p_expected_financial_version bigint, p_title text, p_total_minor bigint, p_currency text, p_incurred_on date, p_category text, p_note text, p_split_method text, p_preserve_shares boolean, p_new_guest_members jsonb, p_new_participant_invitations jsonb, p_removed_member_ids uuid[], p_payments jsonb, p_shares jsonb'
    for (const source of [migration, preflight, postflight, recovery]) {
      for (const token of [
        "wrapper.prokind = 'f'",
        "wrapper.prorettype = 'jsonb'::pg_catalog.regtype",
        'NOT wrapper.proretset',
        "wrapper.provolatile = 'v'",
        'wrapper.prosecdef',
        'NOT wrapper.proisstrict',
        'NOT wrapper.proleakproof',
        "wrapper.proparallel = 'u'",
        'wrapper.pronargdefaults = 0',
        'wrapper.proargdefaults IS NULL',
        'wrapper.proallargtypes IS NULL',
        'wrapper.proargmodes IS NULL',
        "wrapper.proconfig = ARRAY['search_path=\"\"']::text[]",
        "pg_catalog.pg_get_userbyid(wrapper.proowner) = 'postgres'",
        wrapperArguments,
        'c3a1ab7746d50ed552c625bbc95efbab',
        'wrapper_acl_exact',
        'wrapper_base_call_exact',
      ]) expect(source).toContain(token)
      expect(source).not.toMatch(
        /wrapper_dependency_exact\s+AS\s+direct_dependencies_exact/,
      )
    }
  })

  it('freezes immediate non-deferrable SQL113 inbound FK behavior everywhere', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain("constraint_row.contype = 'f'")
      expect(source).toContain('NOT constraint_row.condeferrable')
      expect(source).toContain('NOT constraint_row.condeferred')
      expect(source).toContain("constraint_row.confdeltype = 'r'")
      expect(source).toContain("constraint_row.confupdtype = 'a'")
      expect(source).toContain("constraint_row.confmatchtype = 's'")
      expect(source).toContain('inbound_share_foreign_key_count_exact')
      const scopedInventory = source.match(
        /WHERE \(\s*\(constraint_row\.conrelid = 'public\.expense_share_collaborators'::pg_catalog\.regclass\s*AND constraint_row\.conname = 'expense_share_collaborators_expense_share_fk'\)\s*OR\s*\(constraint_row\.conrelid = 'public\.expense_member_invitations'::pg_catalog\.regclass\s*AND constraint_row\.conname = 'expense_member_invitations_shared_share_fk'\)/g,
      ) ?? []
      expect(scopedInventory.length).toBeGreaterThanOrEqual(source === recovery ? 2 : 1)
    }
  })

  it('recovery revokes first, restores only the exact predecessor, and performs no data cleanup', () => {
    const revoke = recovery.indexOf('REVOKE EXECUTE ON FUNCTION public.expense_update_expense')
    const replace = recovery.indexOf('CREATE OR REPLACE FUNCTION public.expense_update_expense')
    expect(revoke).toBeGreaterThan(-1)
    expect(replace).toBeGreaterThan(revoke)
    expect(recovery).toContain('expense_sql165_recovery_target_mismatch')
    const executable = recovery
      .replace(/\$old_mutation\$[\s\S]*?\$old_mutation\$/g, '')
      .replace(/\$new_mutation\$[\s\S]*?\$new_mutation\$/g, '')
    expect(executable).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM|MERGE INTO|TRUNCATE(?: TABLE)?)\s+public\.(?:expenses|expense_shares|expense_payments|expense_obligations|expense_share_collaborators|expense_member_invitations|expense_revisions|expense_activity|expense_mutation_requests)\b/i,
    )
    const topLevelMutators = executable
      .match(/^\s*(?:REVOKE|GRANT|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/gm)
      ?.map((statement) => statement.trim())
    expect(topLevelMutators).toEqual(['REVOKE', 'GRANT'])
    expect(recovery).toContain('expense_sql165_recovery_identity_mismatch')
  })

  it('recovery proves the complete exact target before its first mutation', () => {
    const revoke = recovery.indexOf('REVOKE EXECUTE ON FUNCTION public.expense_update_expense')
    const validateEnd = recovery.indexOf('$validate$;', recovery.indexOf('DO $validate$'))
    expect(validateEnd).toBeGreaterThan(-1)
    expect(revoke).toBeGreaterThan(validateEnd)
    const precondition = recovery.slice(0, revoke)
    for (const token of [
      '30ba02f3b79d2c7a9387ee504d198d12',
      'contract_exact',
      'function_acl_exact',
      'wrapper_contract_exact',
      'wrapper_acl_exact',
      'wrapper_source_exact',
      'wrapper_base_call_exact',
      'share_foreign_keys_exact',
      'inbound_share_foreign_key_count_exact',
      'public_schema_acl_exact',
      'expense_sql165_recovery_target_mismatch',
    ]) expect(precondition).toContain(token)
    for (const predicate of [
      'privilege_row.grantee',
      'privilege_row.grantor',
      'EXCEPT ALL',
      "wrapper.prokind = 'f'",
      'wrapper.pronargdefaults = 0',
      'pg_catalog.length(wrapper.prosrc)',
      "constraint_row.contype = 'f'",
      'NOT constraint_row.condeferrable',
      'NOT constraint_row.condeferred',
      'expected_schema_acl',
    ]) expect(precondition).toContain(predicate)
    expect(precondition).not.toMatch(
      /^\s*(?:REVOKE|GRANT|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im,
    )
  })

  it('recovery proves the complete predecessor and exact ACL before commit', () => {
    const postconditionStart = recovery.indexOf('DO $postcondition$')
    const commit = recovery.lastIndexOf('COMMIT;')
    expect(postconditionStart).toBeGreaterThan(-1)
    expect(commit).toBeGreaterThan(postconditionStart)
    const postcondition = recovery.slice(postconditionStart, commit)
    for (const token of [
      '675891833b4bb9aeb130f74da94994b3',
      'contract_exact',
      'function_acl_exact',
      'wrapper_contract_exact',
      'wrapper_acl_exact',
      'wrapper_source_exact',
      'wrapper_base_call_exact',
      'share_foreign_keys_exact',
      'inbound_share_foreign_key_count_exact',
      'public_schema_acl_exact',
      'expense_sql165_recovery_postcondition_failed',
    ]) expect(postcondition).toContain(token)
    for (const predicate of [
      'privilege_row.grantee',
      'privilege_row.grantor',
      'EXCEPT ALL',
      "wrapper.prokind = 'f'",
      'wrapper.pronargdefaults = 0',
      'pg_catalog.length(wrapper.prosrc)',
      "constraint_row.contype = 'f'",
      'NOT constraint_row.condeferrable',
      'NOT constraint_row.condeferred',
      'expected_schema_acl',
    ]) expect(postcondition).toContain(predicate)
    expect(recovery).not.toContain('REVOKE ALL ON FUNCTION public.expense_update_expense')
    expect(recovery).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.expense_update_expense\([\s\S]*?\) FROM service_role;/,
    )
  })

  it('accepts the exact target while rejecting genuinely malformed postcondition states', () => {
    const predecessor = sql105UpdateBody()
    const oldGate = taggedBlock(migration, 'old_gate')
    const newGate = taggedBlock(migration, 'new_gate')
    const oldMutation = taggedBlock(migration, 'old_mutation')
    const newMutation = taggedBlock(migration, 'new_mutation')
    const target = predecessor
      .replace(oldGate, newGate)
      .replace(oldMutation, newMutation)

    expect(md5(predecessor)).toBe('675891833b4bb9aeb130f74da94994b3')
    expect(md5(target)).toBe('30ba02f3b79d2c7a9387ee504d198d12')
    expect(newGate.endsWith(oldGate)).toBe(true)
    expect(target).toContain(newGate)
    expect(target).toContain(oldGate)
    expect(literalCount(target, newGate)).toBe(1)
    expect(literalCount(target, oldGate)).toBe(1)

    for (const requiredPredicate of [
      'OR pg_catalog.strpos(v_post_body, v_new_gate) = 0',
      'OR pg_catalog.strpos(v_post_body, v_new_mutation) = 0',
      'OR pg_catalog.strpos(v_post_body, v_old_mutation) <> 0',
    ]) expect(migration).toContain(requiredPredicate)

    expect(migrationPostconditionFailures(target)).toEqual([])

    expect(migrationPostconditionFailures(`${target}\n-- drift`)).toContain(
      'target_hash_mismatch',
    )

    const missingNewGate = target.replace(newGate, '')
    expect(migrationPostconditionFailures(missingNewGate)).toEqual(
      expect.arrayContaining(['target_hash_mismatch', 'new_gate_missing']),
    )

    const missingNewMutation = target.replace(newMutation, '')
    expect(migrationPostconditionFailures(missingNewMutation)).toEqual(
      expect.arrayContaining(['target_hash_mismatch', 'new_mutation_missing']),
    )

    const retainedOldMutation = `${target}\n${oldMutation}`
    expect(migrationPostconditionFailures(retainedOldMutation)).toEqual(
      expect.arrayContaining(['target_hash_mismatch', 'old_mutation_present']),
    )

    const duplicatedNewMutation = target.replace(
      newMutation,
      `${newMutation}\n${newMutation}`,
    )
    expect(literalCount(duplicatedNewMutation, newMutation)).toBe(2)
    expect(migrationPostconditionFailures(duplicatedNewMutation)).toContain(
      'target_hash_mismatch',
    )

    expect(migrationPostconditionFailures(target)).not.toContain(
      'forbidden_old_gate_present',
    )
  })

  it('keeps the generated predecessor and reconciliation target bodies frozen', () => {
    const predecessor = sql105UpdateBody()
    const target = predecessor
      .replace(taggedBlock(migration, 'old_gate'), taggedBlock(migration, 'new_gate'))
      .replace(taggedBlock(migration, 'old_mutation'), taggedBlock(migration, 'new_mutation'))
    expect(md5(predecessor)).toBe('675891833b4bb9aeb130f74da94994b3')
    expect(md5(target)).toBe('30ba02f3b79d2c7a9387ee504d198d12')
  })

  it('documents operator sequence, no SQL execution, and the concurrency gap', () => {
    expect(readme).toContain('PREDECESSOR_READY')
    expect(readme).toContain('EXACT_INSTALLED')
    expect(readme).toContain('STOP_PARTIAL_OR_PREDECESSOR_DRIFT')
    expect(readme).toContain('No SQL in this bundle was run by Codex')
    expect(readme).toMatch(/no disposable PostgreSQL concurrency\s+harness/)
  })

  it('maps the bounded database reason to a dedicated action code', () => {
    expect(contracts).toContain("| 'referenced_participant'")
    expect(actions).toContain("message.includes('expense_share_has_durable_reference')")
    expect(actions).toContain("? 'referenced_participant'")
    expect(form).toContain("case 'referenced_participant':")
  })

  it('ships privacy-safe Icelandic and English recovery copy', () => {
    expect(isMessages).toContain('"referenced_participant"')
    expect(isMessages).toContain('Haltu þátttakandanum inni í skiptingunni')
    expect(enMessages).toContain('"referenced_participant"')
    expect(enMessages).toContain('Keep the participant in the allocation')
    for (const source of [isMessages, enMessages]) {
      expect(source).not.toContain('expense_share_has_durable_reference')
      expect(source).not.toContain('expense_share_collaborators_expense_share_fk')
    }
  })
})
