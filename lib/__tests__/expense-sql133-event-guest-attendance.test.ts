import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql96 = readFileSync(join(root, 'sql/96_expenses_core.sql'), 'utf8')
const sql97 = readFileSync(
  join(root, 'sql/97_expense_edit_and_member_linking.sql'),
  'utf8',
)
const sql107 = readFileSync(
  join(root, 'sql/107_expense_encrypted_payment_profile.sql'),
  'utf8',
)
const sql123 = readFileSync(
  join(root, 'sql/123_expense_settlement_batch.sql'),
  'utf8',
)
const sql131 = readFileSync(
  join(root, 'sql/131_expense_events_mvp.sql'),
  'utf8',
)
const sql132 = readFileSync(
  join(root, 'sql/132_independent_events_and_tagged_expenses.sql'),
  'utf8',
)
const migration = readFileSync(
  join(root, 'sql/133_event_guest_identity_linking.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/133-event-guest-identity-linking',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const diagnostic = readFileSync(
  join(validationRoot, 'diagnose-preflight.sql'),
  'utf8',
)
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, start).toBeGreaterThanOrEqual(0)
  expect(endIndex, end).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function functionBodies(source = migration) {
  const bodies = new Map<string, string>()
  const pattern =
    /^CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\([\s\S]*?\)\r?\nRETURNS[\s\S]*?AS \$([a-z0-9_]*)\$([\s\S]*?)\$\2\$;/gm
  for (const match of source.matchAll(pattern)) {
    // pg_proc.prosrc preserves these boundary newlines. Never trim.
    bodies.set(match[1], match[3].replace(/\r\n/g, '\n'))
  }
  return bodies
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex')
}

function normalizeCatalogDefinition(value: string) {
  return value
    .toLowerCase()
    .replace(/::[a-z0-9_]+(?:\[\])?/g, '')
    .replace(/[\s()'"]/g, '')
    .replaceAll('public.', '')
    .replaceAll('pg_catalog.', '')
    // PostgreSQL's analyzed CHECK expression expands BETWEEN before
    // pg_get_constraintdef deparses it.
    .replace(
      /result_attempt_numberbetween1and3/g,
      'result_attempt_number>=1andresult_attempt_number<=3',
    )
}

function checkDefinitions(source: string) {
  const definitions = new Map<string, string>()
  const pattern = /CONSTRAINT\s+([a-z0-9_]+)\s+CHECK\s*\(/g
  for (const match of source.matchAll(pattern)) {
    const openIndex = match.index + match[0].length - 1
    let depth = 0
    let inQuote = false
    let endIndex = -1
    for (let index = openIndex; index < source.length; index += 1) {
      const character = source[index]
      if (character === "'") {
        if (inQuote && source[index + 1] === "'") {
          index += 1
        } else {
          inQuote = !inQuote
        }
      } else if (!inQuote && character === '(') {
        depth += 1
      } else if (!inQuote && character === ')') {
        depth -= 1
        if (depth === 0) {
          endIndex = index
          break
        }
      }
    }
    expect(endIndex, match[1]).toBeGreaterThan(openIndex)
    definitions.set(
      match[1],
      normalizeCatalogDefinition(`CHECK${source.slice(openIndex, endIndex + 1)}`),
    )
  }
  return definitions
}

function triggerDefinitions(source: string) {
  const definitions = new Map<string, string>()
  const pattern =
    /^CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([a-z0-9_]+)\b[\s\S]*?;/gm
  for (const match of source.matchAll(pattern)) {
    // pg_get_triggerdef omits the statement terminator and emits trigger
    // events in canonical INSERT, DELETE, UPDATE order.
    const catalogDefinition = match[0]
      .replace(/;\s*$/, '')
      .replace(
        /\bINSERT\s+OR\s+UPDATE\s+OR\s+DELETE\b/gi,
        'INSERT OR DELETE OR UPDATE',
      )
      .replace(/\bUPDATE\s+OR\s+DELETE\b/gi, 'DELETE OR UPDATE')
    definitions.set(match[1], normalizeCatalogDefinition(catalogDefinition))
  }
  return definitions
}

function mergedTriggerDefinitions() {
  return new Map([
    ...triggerDefinitions(sql96),
    ...triggerDefinitions(sql97),
    ...triggerDefinitions(sql107),
    ...triggerDefinitions(sql123),
    ...triggerDefinitions(sql131),
    ...triggerDefinitions(sql132),
    ...triggerDefinitions(migration),
  ])
}

type TriggerContract = {
  tableName: string
  functionSignature: string
  deferred: boolean
  triggerType: number
}

function fiveFieldTriggerContracts(source: string) {
  return new Map<string, TriggerContract>(
    [...source.matchAll(
      /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'(public\.[a-z0-9_]+\([^']*\))',\s*(true|false),\s*(\d+)::smallint\)/g,
    )].map((row) => [
      row[2],
      {
        tableName: row[1],
        functionSignature: row[3],
        deferred: row[4] === 'true',
        triggerType: Number(row[5]),
      },
    ]),
  )
}

function diagnosticTriggerContracts(source: string) {
  return new Map<string, TriggerContract>(
    [...source.matchAll(
      /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'(public\.[a-z0-9_]+\([^']*\))',\s*(true|false),\s*(\d+)::smallint,\s*'[0-9a-f]{32}'\)/g,
    )].map((row) => [
      row[2],
      {
        tableName: row[1],
        functionSignature: row[3],
        deferred: row[4] === 'true',
        triggerType: Number(row[5]),
      },
    ]),
  )
}

function finalTriggerContracts(source: string) {
  return new Map<string, TriggerContract>(
    [...source.matchAll(
      /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'(public\.[a-z0-9_]+\([^']*\))',\s*(\d+)::smallint,\s*(true|false),\s*(true|false),\s*'[0-9a-f]{32}'\)/g,
    )].map((row) => {
      expect(row[5], `${row[2]} initial deferral`).toBe(row[6])
      return [
        row[2],
        {
          tableName: row[1],
          functionSignature: row[3],
          deferred: row[5] === 'true',
          triggerType: Number(row[4]),
        },
      ]
    }),
  )
}

function threeFieldContracts(source: string) {
  return new Map(
    [...source.matchAll(
      /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'([^']+)'\)/g,
    )].map((row) => [row[2], { tableName: row[1], definition: row[3] }]),
  )
}

function valuesBlockBefore(source: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex, marker).toBeGreaterThan(0)
  const startIndex = source.lastIndexOf('FROM (VALUES', markerIndex)
  expect(startIndex, `${marker} values start`).toBeGreaterThan(0)
  const endIndex = source.indexOf(') AS expected(', startIndex)
  expect(endIndex, `${marker} values end`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function valueTupleArities(source: string) {
  const arities: number[] = []
  let depth = 0
  let commas = 0
  let inQuote = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === "'") {
      if (inQuote && source[index + 1] === "'") {
        index += 1
      } else {
        inQuote = !inQuote
      }
    } else if (!inQuote && character === '(') {
      if (depth === 0) commas = 0
      depth += 1
    } else if (!inQuote && character === ',' && depth === 1) {
      commas += 1
    } else if (!inQuote && character === ')') {
      depth -= 1
      if (depth === 0) arities.push(commas + 1)
    }
  }
  expect(depth).toBe(0)
  expect(inQuote).toBe(false)
  return arities
}

describe('SQL133 consent-gated Event attendance', () => {
  it('is one guarded repeatable-read forward transaction and preserves SQL132 bodies', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    expect(migration).toContain('teskeid_event_identity_dependency_acl_drift')
    expect(migration).toContain('teskeid_event_attendance_existing_data_changed')
    expect(migration).toContain("'8fc1eebd38b5499edc9204991529d2a4'")
    expect(migration).toContain("'5ca3a5428bd45a41b170edf76577d8ca'")
    expect(migration).toContain("'b6f8566f735fc02be284d17aeca68b62'")
    expect(migration).not.toMatch(
      /^\s*(?:DROP\s+(?:TABLE|COLUMN|FUNCTION)|TRUNCATE\s+)/im,
    )
    expect(migration).not.toContain('string_agg(pg_catalog.to_jsonb(row_value)')
    expect(migration).toContain('hashtextextended(')
    expect(migration).toContain('13311')
    expect(migration).toContain('13312')
  })

  it('keeps all five new relations default-deny and the raw-email helper private', () => {
    const tables = [
      'teskeid_event_guest_invitations',
      'teskeid_event_attendance_memberships',
      'teskeid_event_attendance_mutation_requests',
      'teskeid_event_attendance_delivery_requests',
      'teskeid_event_guest_identity_mutation_authorizations',
    ]
    for (const table of tables) {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table}\\s+OWNER TO postgres`),
      )
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table}\\s+FORCE ROW LEVEL SECURITY`),
      )
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON TABLE\\s+public\\.${table}\\s+FROM PUBLIC`),
      )
    }
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.teskeid_event_attendance_lock_user_emails(uuid[])',
    )
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.teskeid_event_attendance_lock_user_emails/,
    )
    expect(postflight).toContain(
      "'public.teskeid_event_attendance_lock_user_emails(uuid[])', 'jsonb'",
    )
    expect(postflight).toContain(
      "'public.teskeid_event_attendance_lock_user_emails(uuid[])', 'p_user_ids uuid[]'",
    )
  })

  it('pins all 30 SQL133 function bodies with the raw prosrc newline convention', () => {
    const bodies = functionBodies()
    const rows = [
      ...postflight.matchAll(
        /\('public\.([a-z0-9_]+)\([^']*\)', '[^']+', '([0-9a-f]{32})', (?:true|false)\)/g,
      ),
    ]
    const finalMap = between(
      migration,
      '-- Same-transaction exact contract gate.',
      '  LOOP\n    IF NOT EXISTS (',
    )
    const finalRows = new Map(
      [...finalMap.matchAll(
        /\('public\.([a-z0-9_]+)\([^']*\)', '[^']+', '([0-9a-f]{32})', (?:true|false), /g,
      )].map((row) => [row[1], row[2]]),
    )
    expect(bodies.size).toBe(30)
    expect(rows).toHaveLength(30)
    expect(finalRows.size).toBe(30)
    for (const row of rows) {
      const body = bodies.get(row[1])
      expect(body, row[1]).toBeDefined()
      expect(md5(body!), row[1]).toBe(row[2])
      expect(finalRows.get(row[1]), row[1]).toBe(row[2])
    }
    expect(postflight).not.toContain('__GET_SOURCE_HASH__')
    const latestEncryptedSnapshotBody = functionBodies(sql123).get(
      'expense_attach_encrypted_payment_snapshot',
    )
    expect(latestEncryptedSnapshotBody).toBeDefined()
    expect(md5(latestEncryptedSnapshotBody!)).toBe(
      '711bcb8e3e204e2164d58849a84fe5a5',
    )
    expect(md5(functionBodies(sql107).get('expense_attach_encrypted_payment_snapshot')!)).not.toBe(
      '711bcb8e3e204e2164d58849a84fe5a5',
    )
    for (const sql of [migration, preflight, postflight]) {
      expect(sql).toMatch(
        /'public\.expense_attach_encrypted_payment_snapshot\(\)'[\s\S]{0,100}'711bcb8e3e204e2164d58849a84fe5a5',\s*true,\s*false,\s*'empty'/,
      )
      expect(sql).not.toContain('6631d3d68c63a6c49e2659c359477c5d')
    }
    for (const sql of [migration, preflight, postflight]) {
      expect(sql).toContain('provolatile')
      expect(sql).toContain('proparallel')
      expect(sql).toContain('proisstrict')
      expect(sql).toContain('proleakproof')
      expect(sql).toContain('pg_language')
      expect(sql).toContain('pg_get_function_result')
      expect(sql).toContain('pg_get_function_arguments')
    }
  })

  it('pins hard-coded CHECK and trigger-definition digests to source DDL', () => {
    for (const sql of [migration, preflight, postflight, recovery]) {
      expect(sql).not.toContain('tgnattr')
    }
    for (const sql of [migration, preflight, postflight, diagnostic, recovery]) {
      expect(sql).not.toMatch(
        /pg_catalog\.pg_get_expr\(\s*trigger_row\.tgqual/,
      )
      expect(sql).not.toMatch(/\bAS\s+authorization\b/i)
      expect(sql).not.toMatch(/\bauthorization\./i)
    }
    expect(migration.match(/\bAS identity_authorization_row\b/g)).toHaveLength(2)
    expect(migration).toContain(
      'RETURNING identity_authorization_row.action INTO v_identity_action',
    )
    for (const sql of [migration, preflight, postflight]) {
      expect(sql).toContain(
        'pg_catalog.cardinality(trigger_row.tgattr::smallint[]) = 1',
      )
      expect(sql).toMatch(
        /pg_catalog\.cardinality\(\s*trigger_row\.tgattr::smallint\[\]\s*\) = 0/,
      )
      expect(sql).toContain('4c18ef1467d6fdbb22c1f4b0fbd1ef4e')
      expect(sql).toContain("'UPDATE OF user_id'")
      expect(sql).toContain('trigger_row.tgqual IS NOT NULL')
    }
    expect(migration.match(/trigger_row\.tgqual IS NOT NULL/g)).toHaveLength(2)
    expect(preflight.match(/trigger_row\.tgqual IS NOT NULL/g)).toHaveLength(1)
    expect(postflight.match(/trigger_row\.tgqual IS NOT NULL/g)).toHaveLength(1)

    const declaredIdentifierPatterns = [
      /^CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)/gm,
      /^CREATE(?: TEMP)? TABLE (?:public|pg_temp)\.([a-z0-9_]+)/gm,
      /^CREATE(?: UNIQUE)? INDEX ([a-z0-9_]+)/gm,
      /^CREATE(?: CONSTRAINT)? TRIGGER\s+([a-z0-9_]+)/gm,
      /\bCONSTRAINT\s+([a-z0-9_]+)/g,
    ]
    const declaredIdentifiers = declaredIdentifierPatterns.flatMap((pattern) =>
      [...migration.matchAll(pattern)].map((match) => match[1]),
    )
    expect(declaredIdentifiers.length).toBeGreaterThan(60)
    for (const identifier of declaredIdentifiers) {
      expect(Buffer.byteLength(identifier, 'utf8'), identifier).toBeLessThanOrEqual(63)
    }
    for (const sql of [migration, preflight, postflight, diagnostic, recovery]) {
      expect(sql).not.toContain(
        'teskeid_event_guest_identity_mutation_authorizations_shape_check',
      )
      expect(sql).not.toContain(
        'teskeid_event_attendance_delivery_requests_invitation_attempt_key',
      )
    }
    expect(
      migration.match(/teskeid_event_guest_identity_authorizations_shape_check/g),
    ).toHaveLength(3)
    expect(
      postflight.match(/teskeid_event_guest_identity_authorizations_shape_check/g),
    ).toHaveLength(1)
    expect(
      migration.match(/teskeid_event_attendance_delivery_invitation_attempt_key/g),
    ).toHaveLength(4)
    expect(
      preflight.match(/teskeid_event_attendance_delivery_invitation_attempt_key/g),
    ).toHaveLength(1)
    expect(
      postflight.match(/teskeid_event_attendance_delivery_invitation_attempt_key/g),
    ).toHaveLength(2)
    expect(migration).toContain('ea49cffc2ae6918ffd37dad725d2ea74')
    expect(postflight).toContain('ea49cffc2ae6918ffd37dad725d2ea74')

    const checks = checkDefinitions(migration)
    const checkMap = between(
      postflight,
      'expected_new_check_constraints(',
      '), new_constraint_semantics AS (',
    )
    const checkRows = [
      ...checkMap.matchAll(
        /\('([a-z0-9_]+)', '([a-z0-9_]+)', '([0-9a-f]{32})'\)/g,
      ),
    ]
    expect(checkRows).toHaveLength(15)
    for (const row of checkRows) {
      const definition = checks.get(row[2])
      expect(definition, row[2]).toBeDefined()
      expect(md5(definition!), row[2]).toBe(row[3])
      expect(migration.match(new RegExp(row[3], 'g'))?.length ?? 0).toBeGreaterThan(1)
    }

    const targetTriggerMap = between(
      postflight,
      'expected_trigger_definition_digests(',
      '), trigger_contract AS (',
    )
    const targetTriggerRows = new Map(
      [...targetTriggerMap.matchAll(/\('([a-z0-9_]+)', '([0-9a-f]{32})'\)/g)].map(
        (row) => [row[1], row[2]],
      ),
    )
    const baselineTriggerMap = between(
      preflight,
      'expected_trigger_definition_digests(',
      '), trigger_contract AS (',
    )
    const baselineTriggerRows = new Map(
      [...baselineTriggerMap.matchAll(/\('([a-z0-9_]+)', '([0-9a-f]{32})'\)/g)].map(
        (row) => [row[1], row[2]],
      ),
    )
    expect(baselineTriggerRows.size).toBe(31)
    expect(targetTriggerRows.size).toBe(37)

    const baselineTriggerContracts = fiveFieldTriggerContracts(
      between(
        preflight,
        '), expected_triggers(',
        '), expected_trigger_definition_digests(',
      ),
    )
    const targetTriggerContracts = fiveFieldTriggerContracts(
      between(
        postflight,
        '), expected_triggers(',
        '), expected_trigger_definition_digests(',
      ),
    )
    expect(baselineTriggerContracts.size).toBe(31)
    expect(targetTriggerContracts.size).toBe(37)

    const preconditionSection = migration.slice(
      0,
      migration.indexOf('-- Constant-memory content attestation'),
    )
    const preconditionTriggerRows = new Map(
      [...preconditionSection.matchAll(
        /WHEN '([a-z0-9_]+)' THEN '([0-9a-f]{32})'/g,
      )].map((row) => [row[1], row[2]]),
    )
    expect(preconditionTriggerRows.size).toBe(31)
    expect(fiveFieldTriggerContracts(preconditionSection)).toEqual(
      baselineTriggerContracts,
    )
    for (const [triggerName, definitionMd5] of baselineTriggerRows) {
      expect(preconditionTriggerRows.get(triggerName), triggerName).toBe(
        definitionMd5,
      )
      expect(targetTriggerRows.get(triggerName), triggerName).toBe(
        definitionMd5,
      )
    }

    const diagnosticTriggerMap = between(
      diagnostic,
      '), expected_triggers(',
      '), trigger_tables(table_name) AS (',
    )
    const diagnosticTriggerRows = new Map(
      [...diagnosticTriggerMap.matchAll(
        /\('(?:[a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'public\.[^']+',\s*(?:true|false),\s*\d+::smallint,\s*'([0-9a-f]{32})'\)/g,
      )].map((row) => [row[1], row[2]]),
    )
    expect(diagnosticTriggerRows).toEqual(baselineTriggerRows)
    expect(diagnosticTriggerContracts(diagnosticTriggerMap)).toEqual(
      baselineTriggerContracts,
    )

    const triggers = mergedTriggerDefinitions()
    for (const [triggerName, definitionMd5] of targetTriggerRows) {
      const definition = triggers.get(triggerName)
      expect(definition, triggerName).toBeDefined()
      expect(md5(definition!), triggerName).toBe(definitionMd5)
    }
    expect(md5(triggers.get('teskeid_events_touch_updated_at')!)).toBe(
      '573d2130576e33a2e0051aa5a53ee8da',
    )
    expect(md5(triggers.get('expense_repayments_encrypted_snapshot')!)).toBe(
      'e5c03e7b03c09a6ab927f1715b4acd95',
    )
    expect(migration).toContain(`'sql133:' || v_expected.definition_md5`)

    const finalGateTail = migration.slice(
      migration.indexOf('teskeid_event_attendance_existing_data_changed:%'),
    )
    const finalTriggerMap = between(
      finalGateTail,
      'FROM (VALUES',
      ') AS expected(\n      table_name, trigger_name, function_signature',
    ).slice('FROM (VALUES'.length)
    expect(valueTupleArities(finalTriggerMap)).toEqual(
      Array.from({ length: 37 }, () => 7),
    )
    const finalTriggerRows = [
      ...finalTriggerMap.matchAll(
        /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',[\s\S]*?'([0-9a-f]{32})'\)/g,
      ),
    ]
    expect(finalTriggerRows).toHaveLength(37)
    expect(finalTriggerContracts(finalTriggerMap)).toEqual(
      targetTriggerContracts,
    )
    for (const row of finalTriggerRows) {
      expect(targetTriggerRows.get(row[2]), row[2]).toBe(row[3])
    }

    expect(migration).toContain("actual.contype IN ('c', 'f', 'p', 'u', 'x')")
    expect(preflight).toContain("actual.contype IN ('c', 'f', 'p', 'u', 'x')")
    expect(postflight).toContain("actual.contype IN ('c', 'f', 'p', 'u', 'x')")
    const preflightBaselineConstraints = threeFieldContracts(
      between(
        preflight,
        '), expected_sql132_event_constraints(',
        '), sql132_event_schema_contract AS (',
      ),
    )
    const postflightBaselineConstraints = threeFieldContracts(
      between(
        postflight,
        '), expected_sql132_event_constraints(',
        '), sql132_event_schema_contract AS (',
      ),
    )
    const migrationBaselineConstraints = threeFieldContracts(
      valuesBlockBefore(
        migration,
        "RAISE EXCEPTION 'teskeid_event_identity_sql132_constraint_drift'",
      ),
    )
    const diagnosticBaselineConstraints = threeFieldContracts(
      between(
        diagnostic,
        'WITH expected_constraints(',
        '), schema_tables(table_name) AS (',
      ),
    )
    expect(preflightBaselineConstraints.size).toBe(32)
    expect(postflightBaselineConstraints.size).toBe(31)
    const unchangedBaselineConstraints = new Map(preflightBaselineConstraints)
    unchangedBaselineConstraints.delete('teskeid_event_guests_identity_shape_check')
    expect(postflightBaselineConstraints).toEqual(unchangedBaselineConstraints)
    expect(migrationBaselineConstraints).toEqual(preflightBaselineConstraints)
    expect(diagnosticBaselineConstraints).toEqual(preflightBaselineConstraints)
    expect(postflight).toContain(
      'checksource_kind=manual_nameandemail_canonicalisnullandrelationship_idisnullorsource_kind=manual_emailandemail_canonicalisnotnullandemail_canonical=normalize_email_canonicalemail_canonicalandteskeid_event_valid_textemail_canonical,3,320andemail_canonical~^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$andrelationship_idisnullorsource_kind=relationshipandemail_canonicalisnull',
    )
    expect(migration).toMatch(
      /actual\.contype IN \('c', 'f', 'p', 'u', 'x'\)[\s\S]*?\) <> 32 THEN/,
    )
    expect(preflight).toMatch(
      /actual\.contype IN \('c', 'f', 'p', 'u', 'x'\)[\s\S]*?\) = 32/,
    )
    expect(postflight).toMatch(
      /actual\.contype IN \('c', 'f', 'p', 'u', 'x'\)[\s\S]*?\) = 34/,
    )
    expect(postflight).toMatch(
      /pg_catalog\.array_agg\(\s*attribute\.attname::text\s+ORDER BY key\.ordinality\s*\)/,
    )
    expect(postflight).not.toMatch(
      /pg_catalog\.array_agg\(\s*attribute\.attname\s+ORDER BY key\.ordinality/,
    )

    const targetKeyConstraints = between(
      postflight,
      '), expected_new_key_constraints(',
      '), expected_new_check_constraints(',
    )
    expect(
      [...targetKeyConstraints.matchAll(
        /\('([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'[^']+',\s*'[cfpux]',\s*(?:true|false),\s*(?:true|false)\)/g,
      )],
    ).toHaveLength(22)
    expect(checkRows).toHaveLength(15)
    expect(migration).toMatch(/actual\.contype IN \('c', 'f', 'p', 'u', 'x'\)[\s\S]*?\) <> 35/)
    expect(postflight).toMatch(/actual\.contype IN \('c', 'f', 'p', 'u', 'x'\)[\s\S]*?\) = 35/)

    const columnGateTail = migration.slice(
      migration.indexOf('teskeid_event_attendance_table_privacy_failed'),
    )
    const columnMap = between(
      columnGateTail,
      'FROM (VALUES',
      ') AS expected(table_name, column_contract_md5)',
    ).slice('FROM (VALUES'.length)
    expect(valueTupleArities(columnMap)).toEqual([2, 2, 2, 2, 2])
  })

  it('freezes the seven-argument delivery request contract and durable replay', () => {
    const reserve = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_reserve_guest_attendance_delivery(',
      'CREATE FUNCTION public.teskeid_event_update_guest_attendance_delivery(',
    )
    expect(reserve).toContain('p_delivery_request_id uuid')
    expect(reserve).toContain('teskeid_event_attendance_delivery_requests')
    expect(reserve).toContain("'already_sent'")
    expect(reserve).toContain("'already_failed'")
    expect(reserve).toContain(
      "v_invitation.attempt_number >= 3\n     AND v_invitation.attempt_status <> 'reserved'",
    )
    expect(reserve).not.toContain("'windowDate'")
    expect(reserve.match(/attempt_at <= pg_catalog\.now\(\) - interval '24 hours'/g)).toHaveLength(2)
    expect(migration).toContain('>= 12')
    expect(migration).toContain('>= 3')
    expect(migration).toMatch(
      /p_actor_total_rate_hash,\s*p_rate_limit_window_date,\s*20/,
    )
    expect(migration).toContain("interval '24 hours'")
    for (const sql of [migration, postflight, recovery]) {
      expect(sql).toContain(
        'teskeid_event_reserve_guest_attendance_delivery(uuid,uuid,uuid,text,text,text,date)',
      )
    }
  })

  it('keeps preview scoped, attendee labels private and list buckets bounded', () => {
    const preview = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get_guest_attendance_preview(',
      'CREATE FUNCTION public.teskeid_event_respond_guest_attendance(',
    )
    expect(preview).toContain("'roster', '[]'::jsonb")
    expect(preview).not.toMatch(/jsonb_agg\([^)]*roster/i)
    expect(migration).toContain("pg_catalog.strpos(v_profile_name, '@') = 0")
    expect(migration).toContain("pg_catalog.strpos(p_display_name_snapshot, '@') = 0")
    expect(migration).not.toContain("RETURN 'Gestur'")
    const list = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_list_for_actor(',
      'CREATE FUNCTION public.teskeid_event_get_attendee_view(',
    )
    expect(list.match(/LIMIT 100/g)).toHaveLength(3)
    expect(migration).toContain('guest.linked_user_id = p_actor_id')
  })

  it('serializes every invitation recipient and account cleanup without a lock inversion', () => {
    const create = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_create_with_attendance_invitations(',
      'CREATE FUNCTION public.teskeid_event_replace_roster_with_attendance_invitations(',
    )
    expect(create.indexOf('13201')).toBeLessThan(create.indexOf('9702'))
    expect(create.indexOf('9702')).toBeLessThan(
      create.indexOf('teskeid_event_attendance_lock_user_emails'),
    )
    const sweep = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_attendance_sweep_expired(',
      'CREATE FUNCTION public.teskeid_event_attendance_create_pending(',
    )
    expect(sweep).toContain('LIMIT p_limit')
    expect(sweep).toContain('FOR UPDATE SKIP LOCKED')
    const deletion = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion(',
      'CREATE OR REPLACE FUNCTION public.teskeid_event_create_tagged_expense(',
    )
    expect(deletion.indexOf('v_current_owner_user_ids')).toBeLessThan(
      deletion.indexOf('FOR UPDATE;\n\n  PERFORM guest.id'),
    )
    expect(deletion).toContain(
      'v_current_owner_user_ids IS DISTINCT FROM v_owner_user_ids',
    )
    expect(deletion).toContain('v_current_event_ids IS DISTINCT FROM v_event_ids')
    expect(deletion).not.toContain('expiry-sweep')
  })

  it('keeps attendance separate from Expense consent and masks provenance fail-closed', () => {
    expect(migration).toContain(
      'CREATE INDEX teskeid_event_expense_participant_sources_group_member_idx',
    )
    const sources = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get_expense_member_sources(',
      'CREATE FUNCTION public.teskeid_event_leave_attendance(',
    )
    expect(sources).toContain('LIMIT 51')
    expect(sources).toContain('> 50')
    expect(sources).toContain("'member_ids'")
    expect(sources).not.toMatch(
      /recipient_email_canonical|event_name_snapshot|guest_display_name_snapshot/i,
    )
    const tagged = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.teskeid_event_create_tagged_expense(',
      'CREATE FUNCTION public.teskeid_event_get_expense_member_sources(',
    )
    expect(tagged).toContain("'user_id', NULL")
    expect(tagged).toContain('v_prelinked_email_snapshot')
    expect(tagged).toContain('v_recipient_emails')
    expect(tagged).toContain('v_relationship_probe')
    expect(tagged).toContain('pg_catalog.pg_column_size(p_payload) > 262144')
    expect(tagged.indexOf('9702')).toBeLessThan(tagged.indexOf('11002'))
    expect(tagged.indexOf('11002')).toBeLessThan(
      tagged.indexOf('teskeid_event_attendance_lock_user_emails'),
    )
  })

  it('ships read-only one-row gates and forward-only operator guidance', () => {
    for (const sql of [preflight, postflight, recovery]) {
      expect(sql).toContain('BEGIN;')
      expect(sql).toContain('SET TRANSACTION READ ONLY;')
      expect(sql).toContain('SET LOCAL search_path = pg_catalog;')
      expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(sql).not.toMatch(
        /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\s/im,
      )
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(recovery).toContain('forward_only_recovery_instruction')
    expect(recovery).not.toMatch(
      /FROM\s+public\.teskeid_event_guest_invitations/i,
    )
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(readme).toContain('Nothing in this folder has been executed by Codex')
    expect(readme).toContain('twelve durable request')
    expect(readme).toContain('32 structural constraints')
    expect(readme).toContain('34 structural constraints')
    expect(readme).toContain('exactly 37')
    expect(readme).toMatch(/Do not deploy the SQL133 app\s+build first/)
    expect(readme).toMatch(
      /both must recover the same attempt and provider idempotency key/,
    )
    expect(readme).toMatch(
      /genuine next attempt is allowed only after an explicit failed outcome/,
    )
    expect(readme).toContain('`key_expired` and require cancel/reinvite')
    expect(readme.indexOf('Run `preflight.sql`')).toBeLessThan(
      readme.indexOf('stage/commit/push'),
    )
  })

  it('ships a bounded catalog-only preflight diagnostic', () => {
    expect(diagnostic.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(diagnostic).toContain('SET TRANSACTION READ ONLY;')
    expect(diagnostic).toContain("SET LOCAL statement_timeout = '30s';")
    expect(diagnostic).toContain('server_version_num')
    expect(diagnostic.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(diagnostic).not.toMatch(
      /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\s/im,
    )
    expect(diagnostic).not.toMatch(/FROM\s+public\./i)
    expect(diagnostic.match(/LIMIT 50/g)).toHaveLength(3)
    expect(diagnostic).toContain("'current_preflight_explicit_map', 32")
    expect(diagnostic).toContain("'canonical_expected'")
    expect(diagnostic).toContain("'actual_by_type'")
    expect(diagnostic).toContain('snapshot_function_contract')
    expect(diagnostic).toContain("'contract_matches_latest_repo'")
    expect(diagnostic).toContain("'711bcb8e3e204e2164d58849a84fe5a5'")
    expect(diagnostic).toContain(
      "'expense_repayments_encrypted_snapshot'",
    )
  })
})
