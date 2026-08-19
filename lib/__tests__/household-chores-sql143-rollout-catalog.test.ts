import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migrationPath = 'sql/143_household_chores_rollout_catalog.sql'
const validationRoot = 'sql/validation/143-household-chores-rollout-catalog'

function textFile(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function sha256(relativePath: string): string {
  return createHash('sha256')
    .update(readFileSync(join(root, relativePath)))
    .digest('hex')
    .toUpperCase()
}

const migration = textFile(migrationPath)
const preflight = textFile(`${validationRoot}/preflight.sql`)
const diagnostic = textFile(`${validationRoot}/diagnose-preflight.sql`)
const postflight = textFile(`${validationRoot}/postflight.sql`)
const recovery = textFile(`${validationRoot}/recovery.sql`)
const readme = textFile(`${validationRoot}/README.md`)

const validators = { preflight, diagnostic, postflight, recovery }

const frozenArtifacts = {
  'sql/142_household_chores_foundation.sql':
    '976D68C9A4859D7D9A596B8A4E431E42DB888CFAF665236DD340246AFF282615',
  'sql/validation/142-household-chores-foundation/preflight.sql':
    '2F72860AFBD7E5851D581C0CD23A9246575CAB421EAB174B85304BFAD4F726E6',
  'sql/validation/142-household-chores-foundation/diagnose-preflight.sql':
    '9C44106B8D36B4CE412295250EC97524CC47AAA182B655A2112AF913F7117D8B',
  'sql/validation/142-household-chores-foundation/diagnose-postflight.sql':
    '39629535A0F30B2CFDA04F841DCC91121F9F3CA75A8A66CD3D6D3E6FE46FEE97',
  'sql/validation/142-household-chores-foundation/postflight.sql':
    '7940597C9EFDBDB80CE950AE329A424F77EC4BB66E527BF90B372884F4015769',
  'sql/validation/142-household-chores-foundation/recovery.sql':
    'B5555B8DCB4133092A85686B7FD5D2DC49D8581E0AFCB322FDC8E27C7F050C2B',
  'sql/validation/142-household-chores-foundation/README.md':
    '18C254AF380CFEE42041938207173A2F31C7FCD55A95DEFAEB300468FB565446',
  'lib/__tests__/household-chores-sql142-foundation.test.ts':
    '3B3C439F00FDA320227FBB16B25537E5C4C758900423BBF2C9DF9E75E225AF58',
  [migrationPath]:
    'FB44D2BCC359A402D8517141ACB94D58E10BBCDF5EBCC5A279A22072AFD2300B',
  [`${validationRoot}/preflight.sql`]:
    '720025D755170D606F615D8BACDC3FB422AF7A7116E42E5D967C0912E576EAB3',
  [`${validationRoot}/diagnose-preflight.sql`]:
    '2F74F6B64CE8A6D4895CB2E757AB770CA86235F2507581C848B60545B99EE8D7',
  [`${validationRoot}/postflight.sql`]:
    '04A7E75384FF6F9E4C5ECDE37C4DFCFEE85787492ED5E5AA9A55E5D77723D5C6',
  [`${validationRoot}/recovery.sql`]:
    'C43922DD1632B014C098E5B450E998A23CEBD6618BD6925B340BC8C4C369AC3D',
  [`${validationRoot}/README.md`]:
    '980D1E5A32AC735616A7D97EEC16CBF7803FDEF1E2A92C5FE000FF626EAF706C',
} as const

type GuardDefinition = {
  name: string
  args: string
  result: string
  language: string
  attributes: string
  body: string
}

function guardDefinitions(): GuardDefinition[] {
  return [...migration.matchAll(
    /^CREATE FUNCTION public\.(feature_access_heimilisverkin_[a-z0-9_]+)\(([\s\S]*?)\)\s*RETURNS\s+([^\n]+)\s*LANGUAGE\s+([a-z]+)([\s\S]*?)AS \$function\$([\s\S]*?)\$function\$;/gm,
  )].map((match) => ({
    name: match[1]!,
    args: match[2]!,
    result: match[3]!.trim(),
    language: match[4]!,
    attributes: match[5]!,
    body: match[6]!,
  }))
}

function guardBody(name: string): string {
  const definition = guardDefinitions().find((candidate) => candidate.name === name)
  if (!definition) throw new Error(`missing guard function ${name}`)
  return definition.body
}

function keysFollowingHash(hash: string): string[] {
  const hashAt = migration.indexOf(`= '${hash}'`)
  if (hashAt < 0) throw new Error(`missing feature constraint hash ${hash}`)
  const arrayAt = migration.indexOf(') = ARRAY[', hashAt)
  const arrayEnd = migration.indexOf(']::text[]', arrayAt)
  if (arrayAt < 0 || arrayEnd < 0) {
    throw new Error(`missing feature key array after ${hash}`)
  }
  return [...migration.slice(arrayAt, arrayEnd).matchAll(/'([^']+)'/g)]
    .map((match) => match[1]!)
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

describe('SQL143 Verkefnin closed rollout catalog', () => {
  it('pins the reviewed SQL142 foundation and every SQL143 operator artifact', () => {
    for (const [path, expectedHash] of Object.entries(frozenArtifacts)) {
      expect(sha256(path), path).toBe(expectedHash)
    }
    expect(readFileSync(join(root, migrationPath)).byteLength).toBe(72_915)
    expect(readme).toContain(
      '`FB44D2BCC359A402D8517141ACB94D58E10BBCDF5EBCC5A279A22072AFD2300B`',
    )
    expect(readme).toContain('byte length `72,915`')
  })

  it('is one atomic migration and keeps all four validators bounded and read-only', () => {
    expect(migration).toMatch(/^-- SQL143:/)
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).not.toMatch(/^ROLLBACK;$/gm)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)

    for (const [name, validator] of Object.entries(validators)) {
      expect(validator.match(/^BEGIN;$/gm), name).toHaveLength(1)
      expect(validator.match(/^SET TRANSACTION READ ONLY;$/gm), name)
        .toHaveLength(1)
      expect(validator.match(/^SELECT\b/gm), name).toHaveLength(1)
      expect(validator.match(/^ROLLBACK;$/gm), name).toHaveLength(1)
      expect(validator, name).not.toMatch(/^COMMIT;$/gm)
      expect(validator.trimEnd(), name).toMatch(/ROLLBACK;$/)
      expect(validator, name).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CALL)\b/im,
      )
      expect(validator, name).not.toMatch(
        /\b(?:PERFORM|SELECT)\s+pg_catalog\.pg_(?:try_)?advisory_(?:xact_)?lock\s*\(|\bFOR\s+(?:UPDATE|SHARE)\b/i,
      )
    }
    expect(preflight).toContain('AS prerequisites_ok')
    expect(postflight).toContain('AS postconditions_ok')
    expect(recovery).toContain('true AS recovery_is_read_only')
  })

  it('extends only the exact reviewed 18-key feature set to the exact 19-key set', () => {
    const oldKeys = keysFollowingHash('97736909cf1a3a5432eeb34275cf3cfc')
    const targetKeys = keysFollowingHash('fefe253894973ff1ee1d7d56da941a07')

    expect(oldKeys).toEqual([
      'afmaeli-og-vidburdir',
      'agent-collaboration-private-beta',
      'auglysandi',
      'bokanir',
      'bokhaldid',
      'elta-vedrid',
      'facebook-oauth',
      'ferdalagid',
      'kviss',
      'road-intelligence-v1',
      'tengsl',
      'teskeid-routing-v1',
      'umonnun',
      'utlagt-og-endurgreitt',
      'vedrid',
      'weather-provider-vedurstofan',
      'weather-provider-vegagerdin',
      'weather-pulse',
    ])
    expect(targetKeys).toEqual([...oldKeys, 'heimilisverkin'].sort())
    expect(targetKeys.filter((key) => !oldKeys.includes(key)))
      .toEqual(['heimilisverkin'])
    expect(preflight).toContain('97736909cf1a3a5432eeb34275cf3cfc')
    expect(postflight).toContain('fefe253894973ff1ee1d7d56da941a07')
  })

  it('performs zero entitlement DML and proves a bidirectional row snapshot diff', () => {
    const publicDml = [...migration.matchAll(
      /^\s*(INSERT INTO|UPDATE|DELETE FROM)\s+(?:ONLY\s+)?public\.([a-z0-9_]+)/gim,
    )].map((match) => `${match[1]!.toUpperCase()}:${match[2]}`)
    expect(publicDml).toEqual(['UPDATE:ideas'])

    expect(migration).toContain(
      'LOCK TABLE public.feature_access IN ACCESS EXCLUSIVE MODE;',
    )
    expect(migration).toContain(
      'CREATE TEMP TABLE sql143_feature_access_rows ON COMMIT DROP AS',
    )
    expect(migration).toContain(
      'CREATE TEMP TABLE sql143_feature_relation_snapshot ON COMMIT DROP AS',
    )
    expect(migration.match(/^\s*EXCEPT ALL$/gm)).toHaveLength(4)
    expect(migration).toContain(
      'FROM pg_temp.sql143_feature_access_rows AS snapshot_row',
    )
    expect(migration).toContain(
      "WHERE access_row.feature_key = 'heimilisverkin'",
    )
    expect(migration).toContain(
      "RAISE EXCEPTION 'household_chore_143_entitlement_rows_changed'",
    )
    expect(preflight).toContain('no_household_entitlements_ok')
    expect(postflight).toContain('no_household_entitlements_ok')
  })

  it('narrows the exact historical service_role default ACL without touching rows', () => {
    const compactMigration = compact(migration)
    const compactPreflight = compact(preflight)
    const compactPostflight = compact(postflight)

    expect(compactPreflight).toContain(')) AS acl_row) = 16')
    expect(compactPreflight).toContain(compact(`
      grantee_role.rolname IS NOT DISTINCT FROM 'service_role'
      AND acl_row.privilege_type IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER', 'MAINTAIN'
      )
    `))
    expect(compactMigration).toContain(compact(`
      REVOKE ALL ON TABLE public.feature_access
        FROM PUBLIC, anon, authenticated, service_role;
      GRANT SELECT, INSERT, DELETE ON TABLE public.feature_access TO service_role;
    `))
    expect(compactMigration).toContain(')) AS acl_row ) = 11')
    expect(compactMigration).toContain(
      "RAISE EXCEPTION 'household_chore_143_feature_security_seal_failed'",
    )
    expect(compactPostflight).toContain(')) AS acl_row) = 11')
    expect(diagnostic).toContain('feature_acl_count')
    expect(recovery).toContain('feature_acl_prestate_exact_ok')
    expect(recovery).toContain('feature_acl_target_exact_ok')
    expect(readme).toContain('16 `feature_access` ACL entries')
    expect(readme).toContain('intended 11-entry ACL')
  })

  it('normalizes CRLF before every exact SQL142 function-body hash check', () => {
    expect(migration).not.toMatch(/md5\(procedure_row\.prosrc\)/)
    expect(migration).toContain(
      "pg_catalog.md5(pg_catalog.replace(\n        procedure_row.prosrc, E'\\r\\n', E'\\n'\n      ))",
    )
    for (const validator of [preflight, postflight]) {
      expect(validator).toContain("prosrc, E'\\r\\n', E'\\n'")
    }
  })

  it('serializes a fresh grant in SQL142 user then canonical-email lock order and rechecks authority', () => {
    const body = guardBody('feature_access_heimilisverkin_insert_guard')
    const firstCandidate = body.indexOf(
      'SELECT pg_catalog.array_agg(account.id ORDER BY account.id)',
    )
    const userLock = body.indexOf(
      'PERFORM public.household_chore_private_lock_user(v_user_id);',
    )
    const emailLock = body.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock(')
    const authRowReread = body.indexOf('WHERE account.id = v_user_id')
    const authRowShare = body.indexOf('FOR SHARE;', authRowReread)
    const secondCandidate = body.lastIndexOf(
      'SELECT pg_catalog.array_agg(account.id ORDER BY account.id)',
    )
    const deletionMarker = body.indexOf(
      'FROM public.household_chore_deletion_markers AS marker_row',
    )

    expect(firstCandidate).toBeGreaterThanOrEqual(0)
    expect(userLock).toBeGreaterThan(firstCandidate)
    expect(emailLock).toBeGreaterThan(userLock)
    expect(authRowReread).toBeGreaterThan(emailLock)
    expect(authRowShare).toBeGreaterThan(authRowReread)
    expect(secondCandidate).toBeGreaterThan(authRowShare)
    expect(deletionMarker).toBeGreaterThan(secondCandidate)
    expect(body.match(
      /SELECT pg_catalog\.array_agg\(account\.id ORDER BY account\.id\)/g,
    )).toHaveLength(2)
    expect(body).toContain('public.normalize_email_canonical(NEW.email)')
    expect(body).toContain('NEW.email IS DISTINCT FROM v_canonical_email')
    expect(body).toContain('pg_catalog.hashtextextended(v_canonical_email, 9702)')
    expect(body).toContain('v_confirmed_at IS NULL')
    expect(body).toContain(
      'v_candidate_ids IS DISTINCT FROM ARRAY[v_user_id]::uuid[]',
    )
    expect(body).toContain('marker_row.user_id = v_user_id')
    expect(postflight).toContain('AS insert_authority_ok')
  })

  it('rejects Household feature-row updates without any SQL read or lock', () => {
    const body = guardBody('feature_access_heimilisverkin_update_guard')
    expect(body).toContain("OLD.feature_key = 'heimilisverkin'")
    expect(body).toContain("NEW.feature_key = 'heimilisverkin'")
    expect(body).toContain('feature_access_heimilisverkin_update_forbidden')
    expect(body).not.toMatch(
      /^\s*(?:SELECT|PERFORM|WITH|INSERT|UPDATE|DELETE|LOCK|CALL)\b/im,
    )
    expect(body).not.toMatch(
      /pg_(?:try_)?advisory|household_chore_private_lock_user|auth\.users|public\.feature_access/i,
    )
    expect(postflight).toContain('AS update_lock_free_ok')
  })

  it('guards auth INSERT with a blocking canonical-email barrier and exact conflict check', () => {
    const body = guardBody('feature_access_heimilisverkin_auth_email_guard')
    const insertStart = body.indexOf("IF TG_OP = 'INSERT' THEN")
    const updateStart = body.indexOf("ELSIF TG_OP = 'UPDATE' THEN")
    const insertBranch = body.slice(insertStart, updateStart)

    const normalize = insertBranch.indexOf(
      'public.normalize_email_canonical(NEW.email)',
    )
    const blockingLock = insertBranch.indexOf(
      'PERFORM pg_catalog.pg_advisory_xact_lock(',
    )
    const conflictRead = insertBranch.indexOf(
      'FROM public.feature_access AS access_row',
    )
    expect(normalize).toBeGreaterThanOrEqual(0)
    expect(blockingLock).toBeGreaterThan(normalize)
    expect(conflictRead).toBeGreaterThan(blockingLock)
    expect(insertBranch).toContain(
      'pg_catalog.hashtextextended(v_canonical_email, 9702)',
    )
    expect(insertBranch).toContain(
      "access_row.feature_key = 'heimilisverkin'",
    )
    expect(insertBranch).toContain('access_row.email = v_canonical_email')
    expect(insertBranch).toContain(
      'feature_access_heimilisverkin_auth_email_conflict',
    )
    expect(insertBranch).not.toContain('pg_try_advisory_xact_lock')
    expect(insertBranch).not.toMatch(/household_chore_private_lock_user|9601/)
  })

  it('guards auth UPDATE with sorted distinct OLD/NEW try-locks and never waits', () => {
    const body = guardBody('feature_access_heimilisverkin_auth_email_guard')
    const updateStart = body.indexOf("ELSIF TG_OP = 'UPDATE' THEN")
    const invalidOperation = body.indexOf(
      "RAISE EXCEPTION 'feature_access_heimilisverkin_auth_operation_invalid'",
    )
    const updateBranch = body.slice(updateStart, invalidOperation)

    expect(updateBranch).toContain('SELECT DISTINCT source_email.canonical_email')
    expect(updateBranch).toContain(
      'ORDER BY candidate.canonical_email COLLATE "C"',
    )
    expect(updateBranch).toContain(
      '(public.normalize_email_canonical(OLD.email))',
    )
    expect(updateBranch).toContain(
      '(public.normalize_email_canonical(NEW.email))',
    )
    expect(updateBranch).toContain(
      'WHERE source_email.canonical_email IS NOT NULL',
    )
    expect(updateBranch).toContain(
      'FOREACH v_canonical_email IN ARRAY COALESCE(',
    )
    expect(updateBranch).toContain(
      'IF NOT pg_catalog.pg_try_advisory_xact_lock(',
    )
    expect(updateBranch).toContain(
      'pg_catalog.hashtextextended(v_canonical_email, 9702)',
    )
    expect(updateBranch).toContain(
      'feature_access_heimilisverkin_auth_email_lock_unavailable',
    )
    expect(updateBranch).toContain(
      'FROM public.feature_access AS access_row',
    )
    expect(updateBranch).toContain(
      'access_row.email = ANY(COALESCE(',
    )
    expect(updateBranch).not.toContain('pg_catalog.pg_advisory_xact_lock(')
    expect(updateBranch).not.toMatch(
      /household_chore_private_lock_user|9601|auth\.users|\bFOR\s+(?:UPDATE|SHARE)\b/i,
    )
    expect(postflight).toContain('AS auth_email_lifecycle_ok')
  })

  it('pins exactly three private owner-only guard functions by body and attributes', () => {
    const expectedBodies = new Map([
      ['feature_access_heimilisverkin_insert_guard',
        'efe89415e70824ed0781f1ed1db88152'],
      ['feature_access_heimilisverkin_update_guard',
        '915995cbf0d7a0104d5303ec1b6026db'],
      ['feature_access_heimilisverkin_auth_email_guard',
        'e0a1f38579e20e80b213e07b59d9d08a'],
    ])
    const definitions = guardDefinitions()
    expect(definitions.map((definition) => definition.name).sort())
      .toEqual([...expectedBodies.keys()].sort())

    const compactMigration = compact(migration)
    for (const definition of definitions) {
      const expectedHash = expectedBodies.get(definition.name)
      expect(expectedHash).toBeDefined()
      expect(createHash('md5').update(definition.body).digest('hex'))
        .toBe(expectedHash)
      expect(definition.args.trim()).toBe('')
      expect(definition.result).toBe('trigger')
      expect(definition.language).toBe('plpgsql')
      expect(definition.attributes.trim())
        .toBe("SECURITY DEFINER\nSET search_path = ''")
      expect(migration).toContain(expectedHash!)
      expect(postflight).toContain(expectedHash!)
      expect(compactMigration).toContain(compact(`
        ALTER FUNCTION public.${definition.name}() OWNER TO postgres;
      `))
      expect(compactMigration).toContain(compact(`
        REVOKE ALL ON FUNCTION public.${definition.name}()
        FROM PUBLIC, anon, authenticated, service_role;
      `))
    }
    expect(migration).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.feature_access_heimilisverkin_/i,
    )
    expect(postflight).toContain("actual.owner_name <> 'postgres'")
    expect(postflight).toContain(
      "actual.prorettype <> pg_catalog.to_regtype('trigger')",
    )
    expect(postflight).toContain('actual.proparallel <> \'u\'')
    expect(postflight).toContain('OR NOT actual.prosecdef')
    expect(postflight).toContain("actual.proconfig[1] NOT IN ('search_path=', 'search_path=\"\"')")
    expect(postflight).toContain('AS guard_functions_exact_ok')
  })

  it('installs and attests exactly four trigger surfaces including update attributes', () => {
    const triggers = [...migration.matchAll(
      /^CREATE TRIGGER (feature_access_heimilisverkin_[a-z0-9_]+)\n([\s\S]*?);$/gm,
    )].map((match) => ({ name: match[1]!, definition: compact(match[2]!) }))

    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'feature_access_heimilisverkin_insert_guard',
      'feature_access_heimilisverkin_update_guard',
      'feature_access_heimilisverkin_auth_email_insert_guard',
      'feature_access_heimilisverkin_auth_email_update_guard',
    ])
    expect(triggers[0]!.definition).toContain(
      'BEFORE INSERT ON public.feature_access FOR EACH ROW',
    )
    expect(triggers[1]!.definition).toContain(
      'BEFORE UPDATE OF feature_key, email ON public.feature_access FOR EACH ROW',
    )
    expect(triggers[2]!.definition).toContain(
      'BEFORE INSERT ON auth.users FOR EACH ROW',
    )
    expect(triggers[3]!.definition).toContain(
      'BEFORE UPDATE OF email ON auth.users FOR EACH ROW',
    )

    const compactMigration = compact(migration)
    const compactPostflight = compact(postflight)
    for (const source of [compactMigration, compactPostflight]) {
      expect(source).toContain(compact(`
        ('feature_access_heimilisverkin_insert_guard',
          'feature_access_heimilisverkin_insert_guard', 7, 0)
      `))
      expect(source).toContain(compact(`
        ('feature_access_heimilisverkin_update_guard',
          'feature_access_heimilisverkin_update_guard', 19, 2)
      `))
      expect(source).toContain(
        "('feature_access_heimilisverkin_auth_email_insert_guard', 7, 0)",
      )
      expect(source).toContain(
        "('feature_access_heimilisverkin_auth_email_update_guard', 19, 1)",
      )
    }
    expect(compactMigration).toContain("attribute_row.attname = 'feature_key'")
    expect(compactMigration).toContain("attribute_row.attname = 'email'")
    expect(compactPostflight).toContain('ARRAY[1, 2]::smallint[]')
    expect(compactPostflight).toContain("attribute_row.attname = 'email'")
    expect(postflight).toContain('AS guard_triggers_exact_ok')
    expect(postflight).toContain('AS auth_email_triggers_exact_ok')
  })

  it('updates only five idea copy fields and preserves identity, state, and references', () => {
    const updateMatch = migration.match(
      /WITH updated_idea AS \(\n\s*UPDATE public\.ideas AS idea_row\n\s*SET\n([\s\S]*?)\n\s*WHERE idea_row\.slug = 'fyrsta-vakt-krakkanna'/,
    )
    expect(updateMatch).not.toBeNull()
    const updatedColumns = [...updateMatch![1]!.matchAll(
      /^\s{4}([a-z_][a-z0-9_]*)\s*=/gm,
    )].map((match) => match[1]!)
    expect(updatedColumns).toEqual([
      'title',
      'short_description',
      'problem_description',
      'possible_solution',
      'category',
    ])
    expect(updateMatch![1]).toContain("title = 'Verkefnin'")
    expect(updateMatch![1]).toContain("category = 'Annað'")
    expect(updateMatch![1]).toContain(
      'Með Verkefnunum geturðu stofnað hringi fyrir mismunandi samhengi',
    )

    expect(migration).toContain('CREATE TEMP TABLE sql143_idea_protected')
    for (const column of [
      'idea_row.id',
      'idea_row.slug',
      'idea_row.status',
      'idea_row.source',
      'idea_row.votes_count',
      'idea_row.followers_count',
      'idea_row.is_public',
      'idea_row.is_featured',
      'idea_row.created_at',
      'idea_row.updated_at',
    ]) {
      expect(migration).toContain(column)
    }
    for (const relation of [
      'votes',
      'followers',
      'submissions',
      'analytics_events',
    ]) {
      expect(migration.match(new RegExp(`SELECT '${relation}'::text`, 'g')))
        .toHaveLength(2)
      expect(migration).not.toMatch(new RegExp(
        `^\\s*(?:INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.${relation}\\b`,
        'im',
      ))
    }
    expect(migration).toContain(
      "RAISE EXCEPTION 'household_chore_143_idea_references_changed'",
    )
    expect(migration).toContain(
      "WHERE idea_row.slug = 'fyrsta-vakt-krakkanna'",
    )
    expect(migration).toContain(
      "WHERE idea_row.slug IN ('heimilisverkin', 'verkefnin')",
    )
    expect(postflight).toContain('AS final_idea_copy_exact_ok')
  })

  it('does not modify the sealed SQL142 Household or recent-event domain', () => {
    expect(migration).not.toMatch(
      /^CREATE(?: OR REPLACE)? FUNCTION public\.household_chore_/im,
    )
    expect(migration).not.toMatch(
      /^\s*(?:CREATE|ALTER|DROP|COMMENT ON)\s+(?:TABLE|INDEX|TRIGGER|FUNCTION|VIEW|TYPE)\s+(?:public\.)?(?:household_chore_|recent_events\b)/im,
    )
    expect(migration).not.toMatch(
      /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.(?:household_chore_[a-z0-9_]+|recent_events)\b/im,
    )
    expect(migration).not.toMatch(
      /COMMENT ON TABLE public\.household_chore_circles/i,
    )
    expect(migration).toContain('CREATE TEMP VIEW sql143_sql142_catalog_digest AS')
    expect(migration).toContain(
      "RAISE EXCEPTION 'household_chore_143_sql142_catalog_changed'",
    )
    expect(postflight).toContain('AS sql142_catalog_unchanged_ok')
  })

  it('keeps every declared PostgreSQL identifier within 63 UTF-8 bytes', () => {
    const identifiers = [...migration.matchAll(
      /\b(?:FUNCTION|CONSTRAINT|TRIGGER|INDEX|TABLE|VIEW)\s+(?:(?:public|pg_temp)\.)?([a-z_][a-z0-9_]*)/gi,
    )].map((match) => match[1]!)
    expect(identifiers.length).toBeGreaterThan(25)
    expect(Math.max(...identifiers.map(
      (identifier) => Buffer.byteLength(identifier, 'utf8'),
    ))).toBeLessThanOrEqual(63)
  })

  it('keeps the manual operator, no-SQL, no-entitlement, and no-email-link boundaries explicit', () => {
    expect(readme).toContain('Stebbi runs every SQL file himself in Supabase.')
    expect(readme).toContain('Codex must not run these files.')
    expect(readme).toContain('final SQL142 `postflight.sql`')
    expect(readme).toContain("run this folder's\n   `preflight.sql`")
    expect(readme).toContain('run only `diagnose-preflight.sql`')
    expect(readme).toContain('Run `sql/143_household_chores_rollout_catalog.sql` exactly once')
    expect(readme).toContain('run `postflight.sql` before adding any Household entitlement')
    expect(readme).toContain('If SQL143 returns any error, stop immediately.')
    expect(readme).toContain('Do not rerun SQL143')
    expect(readme).toContain('run only the read-only `recovery.sql`')
    expect(readme).toContain('does not insert, update or delete any `feature_access` row')
    expect(readme).toContain('does not decide which people are beta testers')
    expect(readme).toContain('does not enable an app route')
    expect(readme).toContain('Stebbi alone manages beta entitlements.')
    expect(readme).toContain('it sends no email and introduces no email link')
    expect(readme).toContain('No SQL, Supabase operation, entitlement mutation')
    expect(readme).toContain('## Localhost checks for Stebbi')
  })
})
