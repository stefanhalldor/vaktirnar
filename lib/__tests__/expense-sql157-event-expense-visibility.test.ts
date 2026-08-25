import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/157_event_expense_link_visibility.sql'),
  'utf8',
).replaceAll('\r\n', '\n')
const validationRoot = join(
  root,
  'sql/validation/157-event-expense-link-visibility',
)
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const closedBetaSmoke = readFileSync(
  join(validationRoot, 'closed-beta-smoke.sql'),
  'utf8',
)
const diagnosePreflight = readFileSync(
  join(validationRoot, 'diagnose-preflight.sql'),
  'utf8',
).replaceAll('\r\n', '\n')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function functionBody(source: string, name: string): string {
  const pattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?` +
      `AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  )
  const match = source.match(pattern)
  expect(match, name).not.toBeNull()
  return match?.[1] ?? ''
}

function expectedFunctionRegister(source: string): string {
  const normalized = source.replaceAll('\r\n', '\n')
  const start = normalized.indexOf('expected_functions(')
  const end = normalized.indexOf('), function_catalog AS (', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return normalized.slice(start, end + 1)
}

describe('SQL157 focused Event expense visibility contract', () => {
  it('stores a fail-closed policy on the link with a strict revision guard', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).toContain(
      "ADD COLUMN visibility text NOT NULL DEFAULT 'participants_only'",
    )
    const schemaInstall = migration.slice(
      0,
      migration.indexOf(
        'CREATE FUNCTION public.teskeid_event_guard_expense_link_visibility_update',
      ),
    )
    expect(schemaInstall).not.toMatch(
      /UPDATE public\.teskeid_event_expense_links[\s\S]*?SET visibility/,
    )
    expect(migration).toContain(
      "CHECK (visibility IN ('participants_only', 'all_event'))",
    )
    expect(migration).toContain('CHECK (link_revision >= 1)')
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('DISABLE ROW LEVEL SECURITY')

    const guard = functionBody(
      migration,
      'teskeid_event_guard_expense_link_visibility_update',
    )
    for (const immutableColumn of [
      'event_id',
      'group_id',
      'expense_id',
      'linked_by_user_id',
      'linked_at',
    ]) {
      expect(guard).toContain(
        `NEW.${immutableColumn} IS DISTINCT FROM OLD.${immutableColumn}`,
      )
    }
    expect(guard).toContain(
      'NEW.visibility IS NOT DISTINCT FROM OLD.visibility',
    )
    expect(guard).toContain(
      'NEW.link_revision IS DISTINCT FROM OLD.link_revision + 1',
    )
    expect(guard).toContain('OLD.link_revision = 9223372036854775807')
  })

  it('keeps V1 reads and attach byte-stable while extending both create paths', () => {
    expect(migration).not.toMatch(
      /CREATE (?:OR REPLACE )?FUNCTION public\.teskeid_event_get_expense_activity\(/,
    )
    expect(migration).not.toMatch(
      /CREATE (?:OR REPLACE )?FUNCTION public\.teskeid_event_get_expense_link_management\(/,
    )
    expect(migration).not.toMatch(
      /CREATE (?:OR REPLACE )?FUNCTION public\.teskeid_event_attach_expense\(/,
    )

    for (const name of [
      'teskeid_event_create_tagged_expense',
      'teskeid_event_create_tagged_expense_for_actor',
    ]) {
      const body = functionBody(migration, name)
      expect(body).toContain("p_payload ? 'event_visibility'")
      expect(body).toContain(
        "NOT IN ('participants_only', 'all_event')",
      )
      expect(body).toContain(
        "COALESCE(p_payload->>'event_visibility', 'participants_only')",
      )
      expect(body).toContain("'payload'")
      expect(body).toContain('v_fingerprint')
      expect(body).toContain("'invitation_ids'")
    }
    expect(migration).toContain('activity_v1_hash')
    expect(postflight).toContain('baseline_data_and_v1_exact')
    expect(migration).toContain(
      'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
    )
    expect(migration).toContain('22425321bf1c82698f5739f24111c068')
  })

  it('re-proves current create authority before returning stored receipts', () => {
    const owner = functionBody(
      migration,
      'teskeid_event_create_tagged_expense',
    )
    const attendee = functionBody(
      migration,
      'teskeid_event_create_tagged_expense_for_actor',
    )
    const wrapper = functionBody(
      migration,
      'teskeid_event_create_expense_from_event_for_actor',
    )
    const replayBranch = (body: string) => {
      const start = body.indexOf('IF v_replay IS NOT NULL THEN')
      const end = body.indexOf('RETURN v_replay;', start)
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      return body.slice(start, end + 'RETURN v_replay;'.length)
    }

    for (const body of [owner, attendee, wrapper]) {
      expect(body.indexOf('teskeid_event_begin_request')).toBeLessThan(
        body.indexOf('IF v_replay IS NOT NULL THEN'),
      )
      const replay = replayBranch(body)
      expect(replay).toContain('FROM public.expense_groups AS group_row')
      expect(replay).toContain('FROM public.expenses AS expense')
      expect(replay).toContain('expense_active_member_role')
      expect(replay).toContain("v_replay_expense.status <> 'active'")
      expect(replay).toContain("NOT IN ('owner', 'admin')")
      expect(replay).toContain('FROM public.teskeid_event_expense_links AS link')
      expect(replay.indexOf('FROM public.expense_groups AS group_row')).toBeLessThan(
        replay.indexOf('FROM public.expenses AS expense'),
      )
      expect(replay.indexOf('FROM public.expenses AS expense')).toBeLessThan(
        replay.indexOf('FROM public.teskeid_events AS event_row'),
      )
    }

    expect(replayBranch(owner)).toContain(
      'v_event.owner_user_id <> p_actor_id',
    )
    const attendeeReplay = replayBranch(attendee)
    expect(attendeeReplay).toContain(
      'self_guest.linked_user_id = membership.user_id',
    )
    expect(attendeeReplay).toContain("invitation.status = 'accepted'")
    expect(attendeeReplay).toContain('v_membership.event_id IS NULL')
    const wrapperReplay = replayBranch(wrapper)
    expect(wrapperReplay).toContain('v_has_event_authority')
    expect(wrapperReplay).toContain('p_link_to_event')
    expect(wrapperReplay).toContain(
      'public.teskeid_event_expense_participant_sources',
    )
  })

  it('derives visibility before amounts and returns only the minimal V2 DTO', () => {
    const body = functionBody(
      migration,
      'teskeid_event_get_expense_activity_v2',
    )
    const definition = migration.slice(
      migration.indexOf(
        'CREATE FUNCTION public.teskeid_event_get_expense_activity_v2(',
      ),
      migration.indexOf('AS $function$', migration.indexOf(
        'CREATE FUNCTION public.teskeid_event_get_expense_activity_v2(',
      )),
    )
    expect(definition).toContain('VOLATILE')
    expect(body.match(/teskeid_event_private_scope_v3/g)).toHaveLength(1)
    expect(body).not.toContain('teskeid_event_assert_financial_actor')
    expect(body).toContain('scope_evidence AS MATERIALIZED')
    expect(body).toContain('scope AS MATERIALIZED')
    expect(body).toContain('visible_candidates AS MATERIALIZED')
    expect(body).toContain('visible_detail AS MATERIALIZED')
    expect(body).toContain('position_inputs AS MATERIALIZED')
    expect(body.indexOf('v_scope := public.teskeid_event_private_scope_v3')).toBeLessThan(
      body.indexOf('WITH scope_evidence AS MATERIALIZED'),
    )
    expect(body.indexOf('scope AS MATERIALIZED')).toBeLessThan(
      body.indexOf('visible_candidates AS MATERIALIZED'),
    )
    expect(body.indexOf('visible_candidates AS MATERIALIZED')).toBeLessThan(
      body.indexOf('expense.total_minor'),
    )
    expect(body).toContain("evidence.value->>'viewer_role' = 'owner'")
    expect(body).toContain('event_row.owner_user_id = p_actor_id')
    expect(body).toContain("evidence.value->>'viewer_role' = 'attendee'")
    expect(body).toContain('participation.recipient_user_id = p_actor_id')
    expect(body).toContain("participation.access_state = 'active'")
    expect(body).toContain("guest.status = 'active'")
    expect(body).toContain(
      'decision.decision_version = participation.rsvp_version',
    )
    expect(body).toContain("link.visibility = 'all_event'")
    expect(body).toContain("link.visibility = 'participants_only'")
    expect(body).toContain('public.expense_claim_disputes')
    expect(body).toContain("group_row.kind = 'one_off'")
    expect(body).toContain('group_expense.group_id = candidate.group_id')
    expect(body).toContain("expense.status = 'active'")
    expect(body).not.toContain('v_visible_expense_ids')
    expect(body).toContain("'status', 'none'")
    expect(body).toContain("'status', 'unavailable'")
    expect(body).toContain("'status', 'ready'")
    expect(body).toContain("'title', detail.title")
    expect(body).toContain("'total_minor', detail.total_minor")
    expect(body).toContain("'currency', detail.currency")
    for (const forbidden of [
      "'description'",
      "'payers'",
      "'display_name'",
      "'email'",
      "'note'",
      "'expense_id'",
      "'group_id'",
    ]) {
      expect(body).not.toContain(forbidden)
    }
    expect(body).toContain('actor_member.user_id = p_actor_id')
    expect(body).toContain("'state', CASE")
    expect(body).toContain("WHEN position.pending THEN 'pending'")
    expect(body).toContain('INTO v_revalidated_scope, v_result')
  })

  it('keeps mutation authority operation-specific with no all-event owner gate', () => {
    const attach = functionBody(
      migration,
      'teskeid_event_attach_expense_v2',
    )
    const setVisibility = functionBody(
      migration,
      'teskeid_event_set_expense_visibility',
    )
    for (const body of [attach, setVisibility]) {
      expect(body).toContain('expense_active_member_role')
      expect(body).toContain("IN ('owner', 'admin')")
      expect(body).toContain('teskeid_event_attendance_memberships')
      expect(body).toContain('guest.linked_user_id = membership.user_id')
      expect(body).not.toContain('teskeid_event_private_scope_v3')
      expect(body).not.toMatch(
        /p_visibility\s*=\s*'all_event'[\s\S]{0,240}owner_user_id/,
      )
    }
    expect(attach).toContain("'visibility', p_visibility")
    expect(migration).not.toContain(
      "p_visibility text DEFAULT 'participants_only'",
    )
    expect(attach).toContain("'link_revision', v_existing.link_revision::text")
    expect(attach).toContain("'teskeid_event_attach_expense_v2'")
    expect(attach).not.toContain("RAISE EXCEPTION 'expense_not_found'")
    expect(attach).toContain("RAISE EXCEPTION 'expense_update_not_allowed'")
    expect(attach).toContain(
      'event_id, group_id, expense_id, linked_by_user_id, link_revision, visibility',
    )
    expect(attach).toContain(
      'p_event_id, v_group.id, p_expense_id, p_actor_id, 1, p_visibility',
    )
    expect(attach).toContain('ON CONFLICT DO NOTHING')
    expect(attach).toContain('v_existing.link_revision <> 1')
    expect(attach.indexOf('teskeid_event_begin_request')).toBeLessThan(
      attach.indexOf('FROM public.expenses AS expense'),
    )
    expect(attach.indexOf('FROM public.teskeid_events AS event_row')).toBeLessThan(
      attach.indexOf('IF v_replay IS NOT NULL THEN'),
    )
    expect(attach.indexOf('FROM public.teskeid_event_expense_links AS link')).toBeLessThan(
      attach.indexOf('IF v_replay IS NOT NULL THEN'),
    )
    expect(attach.indexOf('IF v_replay IS NOT NULL THEN')).toBeLessThan(
      attach.indexOf('v_group.financial_version <> p_expected_financial_version'),
    )
    expect(setVisibility).toContain(
      'v_link.link_revision <> p_expected_link_revision',
    )
    expect(setVisibility.indexOf('FROM public.expenses AS expense')).toBeLessThan(
      setVisibility.indexOf('FROM public.teskeid_event_expense_links AS link'),
    )
    expect(setVisibility).toContain(
      'link_revision = link.link_revision + 1',
    )
    expect(setVisibility).toContain("'previous_visibility'")
    expect(setVisibility).toContain("'previous_link_revision'")
    expect(setVisibility).toContain(
      "'teskeid_event_set_expense_visibility'",
    )
    expect(setVisibility.indexOf('teskeid_event_begin_request')).toBeLessThan(
      setVisibility.indexOf('FROM public.expenses AS expense'),
    )
    expect(setVisibility.indexOf('FROM public.teskeid_event_expense_links AS link')).toBeLessThan(
      setVisibility.indexOf('IF v_replay IS NOT NULL THEN RETURN v_replay'),
    )
    expect(setVisibility.indexOf('IF v_replay IS NOT NULL THEN RETURN v_replay')).toBeLessThan(
      setVisibility.indexOf('v_link.link_revision <> p_expected_link_revision'),
    )
  })

  it('publishes the exact additive management ABI and service-role boundary', () => {
    const management = functionBody(
      migration,
      'teskeid_event_get_expense_link_management_v2',
    )
    for (const key of [
      "'current_event'",
      "'events'",
      "'event_id'",
      "'name'",
      "'can_open'",
      "'visibility'",
      "'link_revision'",
      "'roster_revision'",
      "'viewer_role'",
    ]) {
      expect(management).toContain(key)
    }
    expect(management).toContain('link.link_revision::text')
    expect(management).toContain('candidate.roster_revision::text')

    for (const signature of [
      'teskeid_event_get_expense_activity_v2(uuid,uuid)',
      'teskeid_event_get_expense_link_management_v2(uuid,uuid)',
      'teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)',
      'teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)',
    ]) {
      expect(migration).toContain(`public.${signature}`)
    }
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role;',
    )
    for (const createName of [
      'teskeid_event_create_tagged_expense',
      'teskeid_event_create_tagged_expense_for_actor',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION\\s+public\\.${createName}` +
            `[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;` +
            `[\\s\\S]*?GRANT EXECUTE ON FUNCTION\\s+public\\.${createName}` +
            `[\\s\\S]*?TO service_role;`,
        ),
      )
    }
    expect(migration).toContain('TO service_role;')
    expect(migration).not.toMatch(/\bTO (?:anon|authenticated)\b/)
    expect(migration).not.toContain("NOTIFY pgrst, 'reload schema';")
  })

  it('pins the complete Event-read and financial-authority function chain in every gate', () => {
    const authorityChain = [
      'public.teskeid_event_private_scope_v3(uuid,uuid)',
      'public.teskeid_event_private_claim_scoped_v3(uuid,uuid)',
      'public.teskeid_event_assert_session_actor(uuid)',
      'public.teskeid_event_assert_actor(uuid)',
      'public.teskeid_event_has_access(uuid)',
      'public.teskeid_event_private_valid_canonical_email_v2(text)',
      'public.teskeid_event_attendance_terminalize_invitations(uuid[],text)',
      'public.teskeid_event_assert_financial_actor(uuid)',
      'public.expense_has_beta_access(uuid)',
      'public.normalize_email_canonical(text)',
    ]
    for (const source of [migration, preflight, postflight, recovery]) {
      for (const signature of authorityChain) expect(source).toContain(signature)
    }
    expect(migration).toContain('SELECT pg_catalog.count(*) = 29')
    expect(preflight).toContain('SELECT pg_catalog.count(*) = 29')
    expect(postflight).toContain('SELECT pg_catalog.count(*) = 34')
    expect(recovery).toContain('SELECT pg_catalog.count(*) = 34')
  })

  it('pins the SQL155+ private-claim body in every SQL157 catalog gate', () => {
    const canonicalHash = '41487888c688c3280904d78772443b07'
    const staleHash = '5b7eecb3f7e9aebb6a376ffd312989be'
    for (const source of [
      migration,
      preflight,
      postflight,
      recovery,
      diagnosePreflight,
    ]) {
      expect(source).toContain(canonicalHash)
      expect(source).not.toContain(staleHash)
    }
  })

  it('separates structural constraints from the deferred constraint trigger', () => {
    const structuralTypeFilter =
      "AND constraint_row.contype IN ('c', 'f', 'p', 'u', 'x')"
    const migrationLinkConstraintGate = migration.slice(
      migration.indexOf(
        "RAISE EXCEPTION 'teskeid_event_sql157_link_column_drift'",
      ),
      migration.indexOf(
        "RAISE EXCEPTION 'teskeid_event_sql157_link_constraint_drift'",
      ),
    )
    const preflightConstraintCatalog = preflight.slice(
      preflight.indexOf('), constraint_catalog AS ('),
      preflight.indexOf('), constraint_contract AS ('),
    )
    const postflightConstraintCatalog = postflight.slice(
      postflight.indexOf('), constraint_catalog AS ('),
      postflight.indexOf('), constraint_contract AS ('),
    )
    const diagnosticConstraintCatalog = diagnosePreflight.slice(
      diagnosePreflight.indexOf('), actual_constraints AS ('),
      diagnosePreflight.indexOf('), constraint_checks_raw AS ('),
    )
    for (const source of [
      migrationLinkConstraintGate,
      preflightConstraintCatalog,
      postflightConstraintCatalog,
      diagnosticConstraintCatalog,
    ]) {
      expect(source).toContain(structuralTypeFilter)
    }
    for (const source of [preflight, postflight]) {
      expect(source).toContain("trigger_catalog.trigger_constraint_type = 't'")
    }
    for (const source of [migration, recovery]) {
      expect(source).toContain("trigger_constraint.contype = 't'")
    }
  })

  it('uses locale-independent C ordering for every writer comparison array', () => {
    const catalogWriterOrder =
      /ORDER BY \(function_row\.oid::pg_catalog\.regprocedure::text\)\s+COLLATE pg_catalog\."C"/g
    for (const [source, expectedCount] of [
      [migration, 1],
      [preflight, 1],
      [postflight, 2],
      [recovery, 2],
    ] as const) {
      expect(source.match(catalogWriterOrder)).toHaveLength(expectedCount)
    }
    expect(
      diagnosePreflight.match(
        /writer_functions\.signature COLLATE pg_catalog\."C"/g,
      ),
    ).toHaveLength(3)
    expect(
      diagnosePreflight.match(
        /expected_signature COLLATE pg_catalog\."C"/g,
      ),
    ).toHaveLength(1)
    expect(
      diagnosePreflight.match(
        /actual_signature COLLATE pg_catalog\."C"/g,
      ),
    ).toHaveLength(2)
  })

  it('uses a parser-safe alias for the index collation catalog in every gate', () => {
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain(
        "COALESCE(collation_row.collname, '')::text",
      )
      expect(source).toContain(
        'LEFT JOIN pg_catalog.pg_collation AS collation_row',
      )
      expect(source).toContain(
        'ON collation_row.oid = key_collation.collation_oid',
      )
      expect(source).not.toContain("COALESCE(collation.collname, '')::text")
      expect(source).not.toMatch(/AS collation\s*$/m)
    }
  })

  it('keeps the preflight link-column aggregate independent of its outer aggregate', () => {
    const relationContract = preflight.slice(
      preflight.indexOf('), relation_contract AS ('),
      preflight.indexOf('), receipt_contract AS ('),
    )
    expect(relationContract).toContain(
      "ON attribute.attrelid = pg_catalog.to_regclass(\n" +
        "           'public.teskeid_event_expense_links'\n" +
        '         )',
    )
    expect(relationContract).not.toContain(
      'ON attribute.attrelid = relation.oid',
    )
  })

  it('casts receipt catalog names before comparing them with a text array', () => {
    const receiptContract = migration.slice(
      migration.indexOf('-- New V2 receipts contain Event/Expense IDs'),
      migration.indexOf(
        "RAISE EXCEPTION 'teskeid_event_sql157_receipt_contract_drift'",
      ),
    )
    expect(receiptContract).toContain(
      'pg_catalog.array_agg(\n' +
        '         attribute.attname::text ORDER BY attribute.attnum\n' +
        '       )',
    )
    expect(receiptContract).not.toContain(
      'array_agg(attribute.attname ORDER BY attribute.attnum)',
    )
    expect(receiptContract).toContain(
      "'created_at', 'completed_at'\n     ]::text[]",
    )
  })

  it('ships a catalog-only diagnostic that exactly mirrors failed preflight expectations', () => {
    expect(diagnosePreflight.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(diagnosePreflight).toContain('SET TRANSACTION READ ONLY;')
    expect(diagnosePreflight).toContain("SET LOCAL search_path = '';")
    expect(diagnosePreflight.match(/^ROLLBACK;$/gm)).toHaveLength(1)
    expect(diagnosePreflight).not.toMatch(/^COMMIT;$/gm)
    expect(diagnosePreflight.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(diagnosePreflight).not.toMatch(
      /^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/gim,
    )
    expect(diagnosePreflight).not.toMatch(
      /\b(?:FROM|JOIN)\s+(?:public|auth)\./i,
    )
    expect(expectedFunctionRegister(diagnosePreflight)).toBe(
      expectedFunctionRegister(preflight),
    )
    expect(diagnosePreflight).toContain(
      "pg_catalog.md5(pg_catalog.replace(\n      function_catalog.prosrc, E'\\r\\n', E'\\n'",
    )
    expect(diagnosePreflight).not.toContain("'source', function_checks.prosrc")
    expect(diagnosePreflight).not.toContain("'body',")
    expect(diagnosePreflight).not.toContain("'actual_body',")
    const finalProjection = diagnosePreflight.slice(
      diagnosePreflight.lastIndexOf('\nSELECT executor_contract.executor_ok'),
    )
    expect(finalProjection).not.toContain('prosrc')
    expect(diagnosePreflight).not.toContain(
      'ON attribute.attrelid = relation.oid',
    )
    for (const output of [
      'function_mismatch_count',
      'function_mismatches',
      'canonical_functions_exact_diagnostic',
      'constraint_mismatch_count',
      'constraint_mismatches',
      'link_constraints_exact_diagnostic',
      'missing_insert_writers',
      'unexpected_insert_writers',
      'unexpected_update_writers',
      'writer_details',
      'link_writer_set_exact_diagnostic',
    ]) {
      expect(diagnosePreflight).toContain(output)
    }
    for (const constraint of [
      'teskeid_event_expense_links_pkey',
      'teskeid_event_expense_links_scope_key',
      'teskeid_event_expense_links_event_fk',
      'teskeid_event_expense_links_expense_fk',
      'teskeid_event_expense_links_actor_fk',
      'teskeid_event_expense_links_revision_check',
    ]) {
      expect(diagnosePreflight).toContain(constraint)
    }
    for (const writer of [
      'public.teskeid_event_attach_expense(uuid,uuid,uuid,uuid,bigint,bigint)',
      'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
    ]) {
      expect(diagnosePreflight).toContain(writer)
    }
  })

  it('ships read-only validation and a fail-closed unused-install recovery', () => {
    for (const source of [preflight, postflight]) {
      expect(source.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(source).toContain('SET TRANSACTION READ ONLY;')
      expect(source.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(source).not.toMatch(
        /^(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/gm,
      )
    }
    expect(preflight).toContain('AS prerequisites_ok')
    expect(preflight).toContain("current_user = 'postgres' AND session_user = 'postgres' AS executor_ok")
    expect(preflight).toContain('executor_contract.executor_ok')
    expect(migration).toContain('teskeid_event_sql157_executor_mismatch')
    expect(preflight).toContain('link_digest')
    expect(preflight).toContain('protected_digest')
    expect(preflight).toContain('canonical_functions_exact')
    expect(preflight).toContain('public.normalize_email_canonical(text)')
    expect(preflight).toContain(
      'public.expense_create_expense_with_participants',
    )
    expect(preflight).toContain('link_expense_unique_index_exact')
    expect(preflight).toContain('receipt_contract AS')
    expect(preflight).toContain('receipt_columns_exact')
    expect(preflight).toContain('receipt_constraints_exact')
    expect(preflight).toContain('receipt_trigger_exact')
    expect(postflight).toContain('AS postconditions_ok')
    expect(postflight).toContain('all_event_count = 0')
    expect(postflight).toContain('installed_protected_digest')
    expect(postflight).toContain('functions_exact')
    expect(postflight).toContain('relations_private_exact')
    expect(postflight).toContain('link_expense_unique_index_exact')
    expect(postflight).toContain('receipt_contract AS')
    expect(postflight).toContain('baseline.wrapper_create_source')
    expect(recovery).toContain('teskeid_event_sql157_recovery_forward_fail_closed')
    expect(recovery).toContain('teskeid_event_sql157_recovery_unused_install_rolled_back')
    expect(recovery).toContain('installed_link_count')
    expect(recovery).toContain('installed_link_digest')
    expect(recovery).toContain('installed_request_count')
    expect(recovery).toContain('installed_request_digest')
    expect(recovery).toContain('installed_protected_digest')
    expect(recovery).toContain('v_owner_source')
    expect(recovery).toContain('v_attendee_source')
    expect(recovery).toContain('v_wrapper_source')
    expect(recovery).toContain('EXECUTE pg_catalog.format')
    for (const signature of [
      'public.teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'public.teskeid_event_create_tagged_expense_for_actor(uuid,uuid,uuid,bigint,jsonb)',
      'public.teskeid_event_create_expense_from_event_for_actor(uuid,uuid,uuid,bigint,boolean,jsonb)',
      'public.teskeid_event_get_expense_activity_v2(uuid,uuid)',
      'public.teskeid_event_get_expense_activity(uuid,uuid)',
      'public.teskeid_event_get_expense_link_management_v2(uuid,uuid)',
      'public.teskeid_event_attach_expense_v2(uuid,uuid,uuid,uuid,bigint,bigint,text)',
      'public.teskeid_event_set_expense_visibility(uuid,uuid,uuid,uuid,bigint,text)',
    ]) expect(recovery).toContain(signature)
    expect(recovery).toContain('CROSS JOIN LATERAL pg_catalog.aclexplode')
    expect(recovery).toContain(
      'ALTER FUNCTION %s OWNER TO postgres',
    )
    expect(recovery).toContain(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC CASCADE',
    )
    expect(recovery).toContain(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE',
    )
    expect(recovery).toContain('teskeid_event_sql157_recovery_acl_revoke_failed')
    for (const source of [migration, preflight, postflight, recovery]) {
      expect(source).toContain('ARRAY[\'pg_catalog.uuid_ops\']::text[]')
      expect(source).toContain('constraint_row.conindid = index_row.indexrelid')
    }
    expect(recovery).not.toMatch(/\bDROP[^;]*\bCASCADE\b/i)
    expect(recovery).not.toContain("NOTIFY pgrst, 'reload schema';")
    expect(readme).toContain('reload the PostgREST schema cache')
    expect(readme).toContain('separate explicit approval')
    expect(readme.indexOf('reload the PostgREST schema cache')).toBeLessThan(
      readme.indexOf('Run `postflight.sql`'),
    )
    expect(readme).toContain('Closed-beta behavioral probe gate')
    expect(readme).toContain('one database statement/snapshot')
    expect(readme).toContain('Deferred broad-release concurrency matrix')
    expect(readme).toContain('broad rollout remains blocked')
    expect(readme).toContain('SQL153 V3 scope is used')
    expect(readme).toContain('only by the V2 Event-read projection')
    expect(readme).toContain('`recovery.sql` is not normal rollout work')
    expect(readme).toContain('external dependency aborts and rolls')
    expect(readme).toMatch(/do not\s+retry with `DROP \.\.\. CASCADE`/)
    expect(readme).toContain('No SQL in this package was executed by Codex')
  })

  it('ships a fail-closed rollback-only closed-beta privacy and authority probe', () => {
    expect(closedBetaSmoke.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(closedBetaSmoke.match(/^ROLLBACK;$/gm)).toHaveLength(1)
    expect(closedBetaSmoke).not.toMatch(/^COMMIT;$/gm)
    expect(closedBetaSmoke.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(closedBetaSmoke).toContain(
      "'EDIT_ME_DISPOSABLE_LOCAL_OR_STAGING_ONLY'",
    )
    expect(closedBetaSmoke).toContain(
      "'I_CONFIRM_DISPOSABLE_LOCAL_OR_STAGING_ONLY'",
    )
    expect(closedBetaSmoke).toContain(
      "current_user <> 'postgres' OR session_user <> 'postgres'",
    )
    expect(closedBetaSmoke).toContain('SET LOCAL ROLE service_role;')
    expect(closedBetaSmoke).toContain("current_user <> 'service_role'")
    expect(closedBetaSmoke).toContain(
      'public.teskeid_event_get_expense_activity_v2',
    )
    expect(closedBetaSmoke).toContain(
      'public.teskeid_event_get_expense_link_management_v2',
    )
    expect(closedBetaSmoke).toContain(
      'public.teskeid_event_set_expense_visibility',
    )
    expect(closedBetaSmoke).toContain("'participants_only'")
    expect(closedBetaSmoke).toContain("'all_event'")
    expect(closedBetaSmoke).toContain(
      'sql157_probe_private_nonparticipant_leak',
    )
    expect(closedBetaSmoke).toContain(
      "v_viewer_activity->'positions' <> '[]'::jsonb",
    )
    expect(closedBetaSmoke).toContain(
      "ARRAY['title', 'total_minor', 'currency']::text[]",
    )
    expect(closedBetaSmoke).toContain(
      "v_error <> 'expense_update_not_allowed'",
    )
    expect(closedBetaSmoke).toContain(
      "v_error <> 'teskeid_event_link_revision_conflict'",
    )
    expect(closedBetaSmoke).toContain(
      'sql157_probe_lost_response_replay_failed',
    )
    expect(closedBetaSmoke).toContain(
      "RAISE NOTICE 'sql157_closed_beta_smoke_ok'",
    )
    expect(closedBetaSmoke).not.toMatch(
      /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+)?public\./gm,
    )
    expect(readme).toContain('closed-beta-smoke.sql')
    expect(readme).toContain('contains no `COMMIT` and ends in `ROLLBACK`')
    expect(readme).toContain(
      'intentionally not a multi-session race harness',
    )
  })
})
