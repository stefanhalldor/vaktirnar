import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/142_household_chores_foundation.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const validationRoot = join(
  root,
  'sql/validation/142-household-chores-foundation',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const diagnostic = readFileSync(
  join(validationRoot, 'diagnose-preflight.sql'),
  'utf8',
)
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const postflightDiagnostic = readFileSync(
  join(validationRoot, 'diagnose-postflight.sql'),
  'utf8',
)
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

const md5 = (value: string) => createHash('md5').update(value).digest('hex')

type FunctionDefinition = {
  name: string
  args: string
  result: string
  language: string
  attributes: string
  body: string
}

function functionDefinitions(): FunctionDefinition[] {
  return [...migration.matchAll(
    /CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\)\s*RETURNS\s+([^\n]+)\s*LANGUAGE\s+([a-z]+)([\s\S]*?)AS \$function\$([\s\S]*?)\$function\$;/g,
  )].map((match) => ({
    name: match[1]!,
    args: match[2]!,
    result: match[3]!.trim(),
    language: match[4]!,
    attributes: match[5]!,
    body: match[6]!,
  }))
}

function functionBody(name: string): string {
  const found = functionDefinitions().find((definition) => definition.name === name)
  if (!found) throw new Error(`missing function ${name}`)
  return found.body
}

type TableDefinition = { name: string; body: string }

type ColumnDefinition = { name: string; type: string; spec: string }

function tableDefinitions(): TableDefinition[] {
  return [...migration.matchAll(
    /^CREATE TABLE public\.(household_chore_[a-z0-9_]+) \(\n([\s\S]*?)^\);/gm,
  )].map((match) => ({ name: match[1]!, body: match[2]! }))
}

function columnDefinitions(table: TableDefinition): ColumnDefinition[] {
  const columns: ColumnDefinition[] = []
  let current: ColumnDefinition | undefined
  for (const line of table.body.split('\n')) {
    if (/^  CONSTRAINT /.test(line)) break
    const start = line.match(
      /^  ([a-z_][a-z0-9_]*)\s+([a-z]+(?:\s+precision)?)\s+(.*)$/,
    )
    if (start) {
      if (current) columns.push(current)
      current = { name: start[1]!, type: start[2]!, spec: line.trim() }
    } else if (current) {
      current.spec += ` ${line.trim()}`
    }
  }
  if (current) columns.push(current)
  return columns
}

type ExplicitConstraint = {
  name: string
  definition: string
}

function explicitConstraints(table: TableDefinition): ExplicitConstraint[] {
  const bodyWithSentinel = `${table.body}\n  CONSTRAINT __end__ CHECK (true)`
  return [...bodyWithSentinel.matchAll(
    /^  CONSTRAINT (household_chore_[a-z0-9_]+)\s+([\s\S]*?)(?=^  CONSTRAINT )/gm,
  )].map((match) => ({ name: match[1]!, definition: match[2]! }))
}

function coalescedPrimaryConstraint(
  table: TableDefinition,
): ExplicitConstraint | undefined {
  const primaryColumns = columnDefinitions(table).filter((column) =>
    /\bPRIMARY KEY\b/.test(column.spec),
  )
  if (primaryColumns.length !== 1) return undefined
  const columnName = primaryColumns[0]!.name
  return explicitConstraints(table).find((constraint) =>
    new RegExp(`^\\s*UNIQUE\\s*\\(\\s*${columnName}\\s*\\)`).test(
      constraint.definition,
    ),
  )
}

function columnContract(table: TableDefinition): { count: number; hash: string } {
  const columns = columnDefinitions(table)
  const contract = columns.map((column) => {
    const type = column.type === 'timestamptz'
      ? 'timestamp with time zone'
      : column.type
    const notNull = /\b(?:NOT NULL|PRIMARY KEY)\b/.test(column.spec)
    const identity = /GENERATED ALWAYS AS IDENTITY/.test(column.spec) ? 'a' : ''
    return `${column.name}:${type}:${String(notNull)}:${identity}`
  }).join(',')
  return { count: columns.length, hash: md5(contract) }
}

function constraintContract(table: TableDefinition): { count: number; hash: string } {
  const contracts: string[] = []
  const coalescedPrimary = coalescedPrimaryConstraint(table)
  for (const column of columnDefinitions(table)) {
    if (/\bPRIMARY KEY\b/.test(column.spec)) {
      contracts.push(
        `${coalescedPrimary?.name ?? `${table.name}_pkey`}:p:false:false`,
      )
    }
    if (/\bUNIQUE\b/.test(column.spec)) {
      contracts.push(`${table.name}_${column.name}_key:u:false:false`)
    }
    if (/\bREFERENCES\b/.test(column.spec)) {
      contracts.push(`${table.name}_${column.name}_fkey:f:false:false`)
    }
  }
  for (const constraint of explicitConstraints(table)) {
    if (constraint.name === coalescedPrimary?.name) continue
    const definition = constraint.definition
    const type = /^\s*FOREIGN KEY/.test(definition)
      ? 'f'
      : /^\s*UNIQUE/.test(definition)
        ? 'u'
        : /^\s*CHECK/.test(definition)
          ? 'c'
          : '?'
    expect(type).not.toBe('?')
    const deferrable = /\bDEFERRABLE\b/.test(definition)
    const initiallyDeferred = /\bINITIALLY DEFERRED\b/.test(definition)
    contracts.push(
      `${constraint.name}:${type}:${String(deferrable)}:${String(initiallyDeferred)}`,
    )
  }
  contracts.sort()
  return { count: contracts.length, hash: md5(contracts.join(',')) }
}

function indexContracts(): Map<string, { count: number; hash: string }> {
  const names = new Map<string, string[]>()
  for (const table of tableDefinitions()) {
    const tableIndexes: string[] = []
    const coalescedPrimary = coalescedPrimaryConstraint(table)
    for (const column of columnDefinitions(table)) {
      if (/\bPRIMARY KEY\b/.test(column.spec)) {
        tableIndexes.push(coalescedPrimary?.name ?? `${table.name}_pkey`)
      }
      if (/\bUNIQUE\b/.test(column.spec)) {
        tableIndexes.push(`${table.name}_${column.name}_key`)
      }
    }
    for (const constraint of explicitConstraints(table)) {
      if (constraint.name === coalescedPrimary?.name) continue
      if (/^\s*UNIQUE/.test(constraint.definition)) {
        tableIndexes.push(constraint.name)
      }
    }
    names.set(table.name, tableIndexes)
  }
  for (const match of migration.matchAll(
    /^CREATE (?:UNIQUE )?INDEX (household_chore_[a-z0-9_]+)\s+ON public\.(household_chore_[a-z0-9_]+)/gm,
  )) {
    names.get(match[2]!)!.push(match[1]!)
  }
  return new Map([...names].map(([name, values]) => {
    values.sort()
    return [name, { count: values.length, hash: md5(values.join(',')) }]
  }))
}

describe('SQL142 Household Chores private foundation', () => {
  it('is one atomic migration and keeps every operator validator read-only', () => {
    expect(migration).toMatch(/^-- SQL142:/)
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)

    for (const validator of [
      preflight,
      diagnostic,
      postflight,
      postflightDiagnostic,
      recovery,
    ]) {
      expect(validator).toContain('BEGIN;')
      expect(validator).toContain('SET TRANSACTION READ ONLY;')
      expect(validator.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(validator).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/im,
      )
    }
    expect(diagnostic).toContain('LIMIT 100')
    expect(postflightDiagnostic).toContain('function_mismatches')
    expect(postflightDiagnostic).not.toContain('FROM public.feature_access AS access_row')
    expect(recovery).toContain('No destructive recovery is provided')
    expect(recovery).toContain(')[1:100]')
    expect(readme).toContain('## Localhost checks for Stebbi')
    expect(readme).toContain('Codex must not run these files')
    expect(readme).toContain('Run without RLS')
    expect(readme).toContain('If SQL142 returns any error')
  })

  it('fails closed on every SQL142 baseline column and recent-event conflict key', () => {
    for (const sql of [migration, preflight, diagnostic]) {
      expect(sql).toContain("('auth.users', 'email_confirmed_at',")
      expect(sql).toContain("('public.relationships', 'counterpart_user_id',")
      expect(sql).toContain("('public.feature_access', 'feature_key',")
      expect(sql).toContain("('public.recent_events', 'ack_at',")
      expect(sql).toContain("('public.recent_events', 'created_at',")
      expect(sql).toContain('index_row.indkey[0]')
      expect(sql).toContain('index_row.indkey[1]')
      expect(sql).toContain("first_attribute.attname = 'user_id'")
      expect(sql).toContain("second_attribute.attname = 'event_key'")
      expect(sql).toContain('index_row.indisunique')
      expect(sql).toContain('index_row.indisvalid')
      expect(sql).toContain('index_row.indisready')
      expect(sql).toContain("= 'now()'")
    }
    expect(preflight).toContain('baseline_columns_ok')
    expect(preflight).toContain('recent_defaults_ok')
    expect(preflight).toContain('baseline_parent_keys_ok')
    expect(preflight).toContain('recent_conflict_key_ok')
    expect(preflight).toContain('target_types_clear')
    expect(preflight).toContain('server_version_ok')
    expect(migration).toContain(
      "pg_catalog.current_setting('server_version_num') <> '170006'",
    )
    expect(migration).toContain('SELECT pg_catalog.count(*) FILTER (')
    expect(migration).not.toMatch(/GROUP BY\s+(?:true|false)\b/i)
    expect(migration).toContain(
      'CASE WHEN p_actor_id = p_target_user_id THEN 1 ELSE 2 END\n  ) THEN',
    )
    expect(migration).not.toMatch(/IF[^;]*<>\s*CASE[\s\S]*?END\s+THEN/i)
    expect(diagnostic).toContain('missing_columns')
  })

  it('pins every security-critical legacy dependency and keeps diagnosis catalog-only', () => {
    for (const sql of [migration, preflight, diagnostic, postflight]) {
      expect(sql).toContain('3083103976aa8cb3780937b9da1be236')
      expect(sql).toContain('extensions.digest(bytea,text)')
      expect(sql).toContain("procedure_row.prosrc = 'pg_digest'")
      expect(sql).toContain("procedure_row.probin = '$libdir/pgcrypto'")
      expect(sql).toContain("extension_row.extname = 'pgcrypto'")
      expect(sql).toContain('0562edbfaa608cead23d23d49ec36a66')
      expect(sql).toContain("grantee_role.rolname IS DISTINCT FROM 'service_role'")
    }
    expect(migration).toContain(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(migration).toContain('extensions.digest(')
    expect(migration).not.toContain('public.digest(')
    expect(preflight).toContain('functions_ok')
    expect(postflight).toContain('dependencies_exact_ok')
    for (const validator of [preflight, diagnostic, recovery]) {
      expect(validator).not.toContain('FROM public.feature_access AS access_row')
      expect(validator).toContain('97736909cf1a3a5432eeb34275cf3cfc')
    }
  })

  it('freezes the exact table, function, trigger, and grant surfaces', () => {
    expect(tableDefinitions()).toHaveLength(17)
    expect(functionDefinitions()).toHaveLength(66)
    expect([
      ...migration.matchAll(
        /^CREATE (?:CONSTRAINT )?TRIGGER (household_chore_[a-z0-9_]+)/gm,
      ),
    ]).toHaveLength(20)
    expect([
      ...migration.matchAll(
        /^GRANT EXECUTE ON FUNCTION public\.household_chore_[^(]+\([^;]+\) TO service_role;$/gm,
      ),
    ]).toHaveLength(38)
    expect(migration).toContain('v_function_count <> 66')
    expect(migration).toContain('v_relation_count <> 17')
    expect(migration).toContain('v_expected_service_signatures) <> 38')
  })

  it('pins every column, structural constraint, and index-name contract', () => {
    const indexes = indexContracts()
    for (const table of tableDefinitions()) {
      const columns = columnContract(table)
      const constraints = constraintContract(table)
      const tableIndexes = indexes.get(table.name)!
      expect(postflight).toContain(
        `'${table.name}', ${columns.count}, '${columns.hash}', ${constraints.count}, '${constraints.hash}', ${tableIndexes.count}, '${tableIndexes.hash}'`,
      )
    }
    expect(postflight).toContain('object_row.relname::text, 16')
    expect(postflight).toContain(') = 98 AS private_relations_ok')
  })

  it('stores and independently recomputes the full PostgreSQL catalog snapshot', () => {
    for (const sql of [migration, postflight]) {
      expect(sql).toContain("'contract_version', 1")
      expect(sql).toContain("'relations'")
      expect(sql).toContain("'columns'")
      expect(sql).toContain("'constraints'")
      expect(sql).toContain("'indexes'")
      expect(sql).toContain("'shared_indexes'")
      expect(sql).toContain("'sequences'")
      expect(sql).toContain("'functions'")
      expect(sql).toContain("'triggers'")
      expect(sql).toContain('pg_catalog.pg_get_expr(')
      expect(sql).toContain('pg_catalog.pg_get_constraintdef(')
      expect(sql).toContain('pg_catalog.pg_get_indexdef(')
      expect(sql).toContain('pg_catalog.pg_get_function_arguments(')
      expect(sql).toContain('pg_catalog.pg_get_functiondef(')
      expect(sql).toContain('pg_catalog.pg_get_triggerdef(')
      expect(sql).toContain('pg_catalog.sha256(')
      expect(sql).toContain("pg_catalog.current_setting('server_version_num')")
    }
    expect(migration).toContain('DO $catalog_snapshot$')
    expect(migration).toContain(
      'COMMENT ON TABLE public.household_chore_circles IS %L',
    )
    expect(postflight).toContain('catalog_unchanged_since_sql142_ok')
    expect(postflight).not.toContain('columns_exact_ok')
    expect(postflight).not.toContain('constraints_exact_ok')
    expect(postflight).not.toContain('indexes_exact_ok')
  })

  it('pins all function bodies and the exact service-only execute surface', () => {
    for (const definition of functionDefinitions()) {
      expect(postflight).toContain(md5(definition.body))
    }
    for (const validator of [postflight, postflightDiagnostic]) {
      expect(validator).toContain("actual.prosrc, E'\\r\\n', E'\\n'")
      expect(validator).not.toMatch(/'pg_catalog\.(?:boolean|integer)'/)
      expect(validator).toContain("'pg_catalog.bool'")
      expect(validator).toContain("'pg_catalog.int4'")
    }
    expect(postflight).toContain('(SELECT pg_catalog.count(*) FROM expected_functions) = 66')
    expect(postflight).toContain('WHERE expected.service_execute\n    ) = 38')
    expect(postflight).toContain("grantee_role.rolname = 'service_role'")
    expect(postflight).toContain("owner_name <> 'postgres'")
    expect(postflight).toContain("actual.proparallel <> 'u'")
    expect(postflight).toContain("actual.proconfig[1] NOT IN ('search_path=', 'search_path=\"\"')")
  })

  it('keeps every Household table postgres-owned, FORCE RLS, policy-free, and private', () => {
    expect(migration).toContain(
      "'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'",
    )
    expect(migration).toContain(
      "'ALTER TABLE public.%I FORCE ROW LEVEL SECURITY'",
    )
    expect(migration).toContain(
      "'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role'",
    )
    for (const table of tableDefinitions()) {
      expect(migration).toContain(`'${table.name}'`)
    }
    expect(migration).not.toMatch(/CREATE POLICY\s+household_chore_/i)
    expect(postflight).toContain("pg_catalog.acldefault('r'")
    expect(postflight).toContain("pg_catalog.acldefault('s'")
    expect(postflight).toContain("'REFERENCES', 'TRIGGER', 'MAINTAIN'")
    expect(migration).toContain('attribute_row.attacl IS NOT NULL')
    expect(migration).toContain('acl_row.grantor <> relation_row.relowner')
    expect(migration).toContain('acl_row.grantor <> sequence_row.relowner')
    expect(migration).toContain('acl_row.grantor = function_row.proowner')
    expect(migration).toContain('AND NOT acl_row.is_grantable')
  })

  it('proves typed invitation consent and never derives access from a Relationship alone', () => {
    expect(migration).toContain(
      'FOREIGN KEY (circle_id, user_id, initial_type, accepted_invitation_id)',
    )
    expect(migration).toContain(
      'REFERENCES public.household_chore_invitations(\n      circle_id, invitee_user_id, requested_type, id',
    )
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(migration).toContain("initial_type IN ('member', 'child')")
    expect(migration).toContain("membership_type IN ('member', 'child')")
    expect(migration).toContain('relationship_row.counterpart_user_id')
    expect(migration).not.toMatch(/normalize_email_canonical\([^)]*relationship/i)
  })

  it('sanitizes every profile-derived label before it reaches a Household projection', () => {
    const safeLabel = functionBody('household_chore_private_safe_user_label')
    expect(safeLabel).toContain("pg_catalog.strpos(candidate.label, '@') > 0")
    expect(safeLabel).toContain("candidate.label ~ '[[:cntrl:]]'")
    expect(safeLabel).toContain(
      "~ U&'[\\0080-\\009F\\061C\\200E\\200F\\202A-\\202E\\2066-\\2069]'",
    )
    expect(safeLabel).toContain("THEN 'Teskeiðarnotandi'")
    expect(safeLabel).toContain('ELSE pg_catalog.left(candidate.label, 120)')
  })

  it('derives leave and delete capabilities from the exact active full-member set', () => {
    const memberships = functionBody('household_chore_get_memberships')
    expect(memberships).toContain("'can_leave'")
    expect(memberships).toContain("membership_row.membership_type = 'child'")
    expect(memberships).toContain("'can_delete_circle'")
    expect(memberships).toContain("membership_row.membership_type = 'member'")
    expect(memberships.match(/other_membership\.id <> membership_row\.id/g))
      .toHaveLength(2)
    expect(memberships.match(/other_membership\.status = 'active'/g))
      .toHaveLength(2)
    expect(memberships.match(/other_membership\.membership_type = 'member'/g))
      .toHaveLength(2)
  })

  it('marks exactly the actor membership in the member management projection', () => {
    const circle = functionBody('household_chore_get_circle')
    expect(circle).toContain("'is_viewer', membership_row.user_id = p_actor_id")
    expect(circle).not.toContain("'user_id', membership_row.user_id")
  })

  it('allows either active membership type to self-assign only to its exact mapping', () => {
    for (const name of [
      'household_chore_get_self_service',
      'household_chore_self_assign',
    ]) {
      const body = functionBody(name)
      expect(body).toContain("membership_row.status = 'active'")
      expect(body).toContain(
        "membership_row.membership_type IN ('member', 'child')",
      )
      expect(body).toContain('participant_row.linked_user_id = p_actor_id')
      expect(body).not.toContain("membership_row.membership_type = 'child'")
    }
    const selfService = functionBody('household_chore_get_self_service')
    expect(selfService).toContain(
      'value_row.participant_id = v_membership.participant_id',
    )
    expect(selfService).toContain(
      'participant_row.id = value_row.participant_id',
    )
    const selfAssign = functionBody('household_chore_self_assign')
    expect(selfAssign).toContain(
      'participant_row.id = v_membership.participant_id',
    )
    expect(selfAssign).toContain(
      "p_actor_id, v_definition, v_participant, v_value,\n    'self_assigned', NULL",
    )
  })

  it('keeps child reads and writes server-bounded to the approved projection', () => {
    const circle = functionBody('household_chore_get_circle')
    expect(circle).toContain("v_membership.membership_type = 'child'")
    expect(circle).toContain("'own_participant_id', v_membership.participant_id")
    expect(circle).toContain("OR participant_row.status = 'active'")
    expect(circle).toContain("OR definition_row.status = 'active'")
    expect(circle).toContain("'can_cancel',\n              assignment_row.participant_id = v_membership.participant_id")
    expect(circle).toContain("'display_reference', v_circle.display_reference")

    const rootBody = functionBody('household_chore_get_root')
    expect(rootBody).not.toContain("'circle_version'")
    expect(rootBody).not.toContain("'member_count'")

    const ownCancel = functionBody('household_chore_cancel_own_assignment')
    expect(ownCancel).toContain("membership_row.membership_type = 'child'")
    expect(ownCancel).toContain(
      'v_assignment.participant_id <> v_membership.participant_id',
    )
    expect(ownCancel).toContain("v_assignment.status <> 'open'")
  })

  it('keeps child cancellation origin-neutral, point-free, terminal-safe, and replayable', () => {
    const ownCancel = functionBody('household_chore_cancel_own_assignment')
    const memberCancel = functionBody('household_chore_cancel_assignment')
    const privateCancel = functionBody('household_chore_private_cancel_assignment')

    expect(ownCancel).toContain(
      "p_actor_id, p_request_id, 'cancel_own_assignment', v_fingerprint",
    )
    expect(ownCancel).toContain(
      "IF v_started->>'code' <> 'started' THEN RETURN v_started; END IF;",
    )
    expect(ownCancel).toContain('household_chore_private_finish_request(')
    expect(ownCancel).toContain(
      'v_assignment.participant_id <> v_membership.participant_id',
    )
    expect(ownCancel).not.toContain('v_assignment.origin')
    expect(ownCancel).not.toContain("'self_assigned'")
    expect(ownCancel).not.toContain("'member_assigned'")
    expect(ownCancel).toContain("v_assignment.status <> 'open'")
    expect(ownCancel).toContain("false, 'terminal_state', p_request_id")
    expect(ownCancel).toContain("'points_delta', 0")
    expect(ownCancel).not.toContain('household_chore_point_entries')
    expect(privateCancel).not.toContain('household_chore_point_entries')

    expect(memberCancel).toContain("membership_row.membership_type = 'member'")
    expect(memberCancel).toContain("'member_cancelled'")
    expect(memberCancel).not.toContain(
      'v_assignment.participant_id <> v_membership.participant_id',
    )
    expect(ownCancel).toContain("'child_cancelled'")
  })

  it('exposes the bounded full-member definition ABI without identity leakage', () => {
    const detail = functionBody('household_chore_get_definition_detail')
    expect(detail).toContain(
      'NOT public.household_chore_private_actor_ready(p_actor_id)',
    )
    expect(detail).toContain("membership_row.status = 'active'")
    expect(detail).toContain("membership_row.membership_type = 'member'")
    expect(detail.match(/false, 'not_found', '\{\}'::jsonb/g)).toHaveLength(2)
    expect(detail).toContain('COALESCE(participant_row.display_name_snapshot, \'\') AS sort_label')
    expect(detail).toContain(
      'item.payload ORDER BY item.sort_label, item.participant_id',
    )
    expect(detail).toContain('LIMIT 100')
    expect(detail).not.toContain("AND participant_row.status = 'active'")
    expect(detail).toContain("'participant_status', participant_row.status")
    expect(detail).toContain("'participant_version', participant_row.version::text")
    expect(detail).toContain("WHEN value_row.id IS NULL THEN 'missing'")
    expect(detail).toContain("WHEN value_row.id IS NULL THEN '0'")
    expect(detail).toContain("'value_version'")
    expect(detail).toContain("'points', value_row.points")
    expect(detail).toContain("'get_definition_detail_loaded'")
    expect(detail).not.toContain("'value_id'")
    expect(detail).not.toContain('linked_user_id')
    expect(detail).not.toContain('auth.users')
    expect(detail).not.toContain('relationships')
    expect(detail).not.toMatch(/email/i)
  })

  it('builds discriminated member and child assignment DTOs server-side', () => {
    const assignment = functionBody('household_chore_get_assignment')
    expect(assignment).toContain(
      'NOT public.household_chore_private_actor_ready(p_actor_id)',
    )
    expect(assignment).toContain(
      'participant_row.id = membership_row.participant_id',
    )
    expect(assignment).toContain(
      'participant_row.linked_user_id = membership_row.user_id',
    )
    expect(assignment).toContain("membership_row.status = 'active'")
    expect(assignment).toContain("participant_row.status = 'active'")
    expect(assignment).toContain(
      "participant_row.identity_marker = 'current'",
    )
    expect(assignment).toContain(
      "IF v_membership.membership_type = 'member' THEN",
    )
    expect(assignment).toContain(
      "'participant_id', v_assignment.participant_id",
    )
    expect(assignment).toContain(
      "ELSIF v_membership.membership_type = 'child' THEN",
    )
    expect(assignment).toContain(
      "'viewer_type', v_membership.membership_type",
    )
    expect(assignment).toContain("'assignment', v_assignment_payload")
    expect(assignment).toContain(
      "'timeline_preview', COALESCE(v_timeline->'items', '[]'::jsonb)",
    )

    const childStart = assignment.indexOf(
      "ELSIF v_membership.membership_type = 'child' THEN",
    )
    const childEnd = assignment.indexOf(
      "\n  ELSE\n    RETURN public.household_chore_private_read_result(",
      childStart,
    )
    expect(childStart).toBeGreaterThan(-1)
    expect(childEnd).toBeGreaterThan(childStart)
    const childBranch = assignment.slice(childStart, childEnd)
    expect(childBranch).toContain(
      'v_assignment.participant_id = v_membership.participant_id',
    )
    expect(childBranch).toContain("AND v_assignment.status = 'open'")
    expect(childBranch).toContain(
      "'own_assignment',\n        v_assignment.participant_id = v_membership.participant_id",
    )
    expect(childBranch).toContain(
      'WHEN v_is_own_open THEN v_assignment.version::text ELSE NULL',
    )
    expect(childBranch).toContain("'can_complete', v_is_own_open")
    expect(childBranch).toContain("'can_cancel', v_is_own_open")
    for (const forbiddenKey of [
      'circle_id',
      'definition_id',
      'participant_id',
      'completion_sequence',
    ]) {
      expect(childBranch).not.toContain(`'${forbiddenKey}',`)
    }

    const childPayloadStart = childBranch.indexOf(
      'v_assignment_payload := pg_catalog.jsonb_build_object(',
    )
    const childPayloadEnd = childBranch.indexOf('\n    );', childPayloadStart)
    const childPayload = childBranch.slice(childPayloadStart, childPayloadEnd)
    expect([...childPayload.matchAll(/'([a-z_]+)',/g)].map(
      (match) => match[1],
    )).toEqual([
      'assignment_id',
      'title',
      'description',
      'materials',
      'participant_label',
      'participant_identity_marker',
      'points',
      'origin',
      'status',
      'created_at',
      'completed_at',
      'cancelled_at',
      'own_assignment',
      'version',
      'can_complete',
      'can_cancel',
    ])
  })

  it('returns only current completed dashboard rows with safe history context', () => {
    const circle = functionBody('household_chore_get_circle')

    expect(circle).toContain("'title', assignment_row.title_snapshot")
    expect(circle).toContain(
      "event_row.event_type IN ('completed', 'recompleted')",
    )
    expect(circle).toContain("assignment_row.status = 'completed'")
    expect(circle).toContain(
      'assignment_row.completion_sequence = event_row.completion_sequence',
    )
    expect(circle).not.toContain("event_row.event_type <> 'created'")
    expect(circle).toMatch(
      /WHERE membership_row\.circle_id = p_circle_id\s+AND membership_row\.status = 'active'\s+ORDER BY membership_row\.joined_at/,
    )

    const history = functionBody('household_chore_private_history_page')
    expect(history).toContain(
      'assignment_row.title_snapshot AS assignment_title',
    )
    expect(history).toContain("'title', visible.assignment_title")
    expect(history).toContain(
      "'participant_identity_marker', visible.participant_identity_marker",
    )

    const decline = functionBody('household_chore_decline_invitation')
    expect(decline).toContain(
      "p_actor_id, p_request_id, 'decline_invitation', v_fingerprint, false",
    )
  })

  it('seals deletion, target privacy, idempotency, and recent-event lock boundaries', () => {
    const target = functionBody('household_chore_private_start_target_mutation')
    expect(target).toContain("marker_row.user_id = p_actor_id")
    expect(target).toContain("false, 'deletion_pending', p_request_id")
    expect(target).toContain("marker_row.user_id = p_target_user_id")
    expect(target).toContain("false, 'not_found', p_request_id")

    const invite = functionBody('household_chore_create_invitation')
    expect(invite).toContain("marker_row.user_id = v_user_id")
    expect(invite).toContain("false, 'feature_unavailable', p_request_id")
    expect(invite).toContain('WITH locked_access AS MATERIALIZED')
    expect(invite).toContain('FOR SHARE OF access_row')

    const sync = functionBody('household_chore_sync_recent')
    expect(sync).toContain('LIMIT 20')
    expect(sync).toContain('LIMIT 50')
    expect(sync).toContain('FOREACH v_circle_id IN ARRAY v_circle_ids')
    expect(sync).toContain('FOR UPDATE;')

    expect(migration).toContain('household_chore_delete_tombstones')
    expect(migration).toContain('household_chore_deletion_markers')
    expect(migration).toContain('household_chore_auth_delete_guard')
  })

  it('keeps SQL142 rollout-neutral and leaves labels/classification for later', () => {
    expect(migration).not.toMatch(/ALTER TABLE public\.feature_access/i)
    expect(migration).not.toMatch(/INSERT INTO public\.feature_access/i)
    expect(migration).toContain(
      "CHECK (source IN ('loans', 'expenses', 'events', 'heimilisverkin'))",
    )
    expect(migration).toContain('recent_events_household_chore_entity_idx')
    expect(migration).not.toMatch(
      /household_chore_(?:definition_)?labels|household_chore_label_id/i,
    )
    expect(postflight).toContain('rollout_state_unchanged_ok')
    expect(postflight).toContain('checks.executor_ok')
    expect(postflight).toContain('AND role_row.rolsuper')
    expect(postflight).toContain('checks.recent_columns_contract_ok')
    expect(postflight).toContain('checks.recent_defaults_contract_ok')
    expect(postflight).toContain('checks.recent_conflict_key_contract_ok')
    expect(postflight).toContain("('id', 'bigint', true)")
    expect(postflight).toContain("attribute_row.attidentity = 'a'")
    expect(postflight).toContain(") = 'now()'")
    expect(postflight).toContain("first_attribute.attname = 'user_id'")
    expect(postflight).toContain("second_attribute.attname = 'event_key'")
  })

  it('keeps all declared PostgreSQL identifiers within 63 UTF-8 bytes', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(100)
    expect(Math.max(...identifiers.map(
      (identifier) => Buffer.byteLength(identifier, 'utf8'),
    ))).toBeLessThanOrEqual(63)
  })
})
