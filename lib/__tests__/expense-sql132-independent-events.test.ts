import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/132_independent_events_and_tagged_expenses.sql'),
  'utf8',
)
const validationRoot = join(
  root,
  'sql/validation/132-independent-events-tagged-expenses',
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
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function sql132FunctionBodies() {
  const bodies = new Map<string, string>()
  const pattern =
    /^CREATE(?: OR REPLACE)? FUNCTION public\.((?:teskeid_event_[^(]+|expense_create_event_context|expense_prepare_account_deletion))\([\s\S]*?\)\r?\nRETURNS[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/gm
  for (const match of migration.matchAll(pattern)) {
    bodies.set(match[1], match[2].replace(/\r\n/g, '\n'))
  }
  return bodies
}

function exactConstraintDefinitions(source: string) {
  return new Map(
    [...source.matchAll(
      /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:primarykey|foreignkey|unique|check)[^']*)'\s*\)/g,
    )].map((match) => [`${match[1]}.${match[2]}`, match[3]]),
  )
}

function exactIndexDefinitions(source: string) {
  return new Set(
    [...source.matchAll(/'(create(?:unique)?index[^']+)'/g)].map(
      (match) => match[1],
    ),
  )
}

function countOccurrences(source: string, value: string) {
  return source.split(value).length - 1
}

describe('SQL132 independent events and tagged one-off expenses', () => {
  it('is one guarded additive transaction in the free SQL132 slot', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    const guard = migration.indexOf('DO $teskeid_event_preconditions$')
    const firstSchemaWrite = migration.indexOf('CREATE TEMP TABLE')
    expect(guard).toBeGreaterThan(migration.indexOf('BEGIN;'))
    expect(firstSchemaWrite).toBeGreaterThan(guard)
    expect(migration).toContain('teskeid_event_relation_collision')
    expect(migration).toContain('teskeid_event_function_collision')
    expect(migration).toContain('teskeid_event_dependency_acl_drift')
    expect(migration).toContain('teskeid_event_critical_trigger_drift')
    expect(migration).toContain('teskeid_event_canonical_relation_acl_drift')
    expect(migration).toContain('teskeid_event_recent_events_acl_drift')
    expect(migration).toContain('teskeid_event_canonical_constraint_index_drift')
    expect(migration).toContain('pg_catalog.md5(pg_catalog.replace(')
    expect(migration).toContain("procedure_row.prosrc, E'\\r\\n', E'\\n'")
    expect(migration).toContain("'ad3e4ade2c93001e2a8b2180288107a5'")
    expect(migration).toContain("'search_path=pg_catalog, public'")
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|FUNCTION)|TRUNCATE\s+/i)
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+public\.expense_/i)
  })

  it('creates five postgres-owned default-deny private tables', () => {
    const tables = [
      'teskeid_events',
      'teskeid_event_guests',
      'teskeid_event_mutation_requests',
      'teskeid_event_expense_links',
      'teskeid_event_expense_participant_sources',
    ]
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE public.${table}`)
      expect(migration).toContain(`ALTER TABLE public.${table} OWNER TO postgres`)
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      )
      expect(migration).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`,
      )
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table}`)
    }
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('teskeid_event_expense_links_expense_uidx')
    expect(migration).toContain('teskeid_event_expense_sources_link_fk')
    expect(migration).toContain('teskeid_event_expense_sources_guest_fk')
    expect(migration).toContain('teskeid_event_expense_sources_member_fk')
  })

  it('keeps SQL131 private ACL checks independent of canonical service-select fields', () => {
    const sql131PrivateContract = between(
      preflight,
      '), sql131_private_contract AS (',
      '), canonical_relations(table_name, service_select, force_rls) AS (',
    )

    expect(sql131PrivateContract).toContain(
      'WHERE privilege.grantee <> relation.relowner',
    )
    expect(sql131PrivateContract).toContain('OR privilege.is_grantable')
    expect(sql131PrivateContract).toContain('AS expected(table_name)')
    expect(sql131PrivateContract).not.toContain('expected.service_select')
    expect(preflight.match(/expected\.service_select/g)).toHaveLength(2)
  })

  it('accepts only the canonical five-OR feature-key union in C order', () => {
    const migrationFeature = between(
      migration,
      "constraint_row.conname = 'feature_access_feature_key_check'",
      "RAISE EXCEPTION 'teskeid_event_feature_constraint_drift'",
    )
    const preflightFeature = between(
      preflight,
      '), feature_contract AS (',
      '), expected_functions(signature, source_md5, security_definer, service_execute) AS (',
    )
    const postflightFeature = between(
      postflight,
      "constraint_row.conname = 'feature_access_feature_key_check'",
      ') AS feature_constraint_exact_ok',
    )

    for (const featureContract of [
      migrationFeature,
      preflightFeature,
      postflightFeature,
    ]) {
      expect(featureContract).toContain('COLLATE "C"')
      expect(featureContract).toContain("E'\\\\mor\\\\M', 'g'")
      expect(featureContract).toMatch(/\) = 5/)
      expect(featureContract).toContain(
        "'weather-provider-vedurstofan', 'weather-provider-vegagerdin'",
      )
      expect(featureContract).not.toContain('(or|and|case|coalesce)')
      expect(featureContract).toContain('(and|case|coalesce)')
      expect(featureContract).toContain(
        'feature_key[[:space:]]*=[[:space:]]*feature_key',
      )
      expect(featureContract).toContain(
        "'97736909cf1a3a5432eeb34275cf3cfc'",
      )
    }
  })

  it('normalizes only the exact diagnosed recent-events ACL into narrow CRUD', () => {
    const legacyPrivileges =
      "'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',\n            'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'"
    const targetPrivileges = "'DELETE', 'INSERT', 'SELECT', 'UPDATE'"
    const migrationGuard = between(
      migration,
      '-- SQL46 granted CRUD additively',
      "RAISE EXCEPTION 'teskeid_event_recent_events_acl_drift'",
    )
    const normalization = between(
      migration,
      '-- Normalize only the exact legacy Supabase default envelope',
      '-- Snapshot every canonical legacy financial row',
    )
    const preflightContract = between(
      preflight,
      '), recent_events_acl_state AS (',
      '), expected_canonical_columns(table_name, column_name, data_type, is_nullable) AS (',
    )
    const postflightContract = between(
      postflight,
      '), recent_events_contract AS (',
      '), relationship_index_contract AS (',
    )
    const finalAttestation = between(
      migration,
      'DO $teskeid_event_recent_events_acl_attestation$',
      '$teskeid_event_recent_events_acl_attestation$;',
    )
    const compactLegacyPrivileges =
      "'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'"
    const compactTargetPrivileges = "'DELETE','INSERT','SELECT','UPDATE'"

    for (const entryContract of [migrationGuard, preflightContract]) {
      expect(entryContract).toContain(legacyPrivileges)
      expect(entryContract).toContain(targetPrivileges)
      expect(entryContract).toContain('COLLATE "C"')
      expect(entryContract).toContain("'service_role', relation.oid, 'MAINTAIN'")
      expect(entryContract).toContain("('anon'::name), ('authenticated'::name)")
      expect(entryContract).toContain('relation.relrowsecurity')
      expect(entryContract).toContain('NOT relation.relforcerowsecurity')
      expect(entryContract).toContain(
        "pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'",
      )
      expect(entryContract).toContain('FROM pg_catalog.pg_policy AS policy')
      expect(entryContract).toContain('privilege.grantee = 0')
      expect(entryContract).toContain('privilege.is_grantable')
      expect(entryContract).toContain(
        'privilege.grantor <> relation.relowner',
      )
      expect(entryContract).toContain('pg_catalog.aclexplode(attribute.attacl)')
    }
    for (const targetContract of [postflightContract, finalAttestation]) {
      expect(targetContract).toContain(targetPrivileges)
      expect(targetContract).not.toContain(legacyPrivileges)
      expect(targetContract).toContain('COLLATE "C"')
      expect(targetContract).toContain("'service_role', relation.oid, 'MAINTAIN'")
      expect(targetContract).toContain("('anon'::name), ('authenticated'::name)")
      expect(targetContract).toContain('relation.relrowsecurity')
      expect(targetContract).toContain('NOT relation.relforcerowsecurity')
      expect(targetContract).toContain(
        "pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'",
      )
      expect(targetContract).toContain('FROM pg_catalog.pg_policy AS policy')
      expect(targetContract).toContain('privilege.grantee = 0')
      expect(targetContract).toContain('privilege.is_grantable')
      expect(targetContract).toContain(
        'privilege.grantor <> relation.relowner',
      )
      expect(targetContract).toContain('pg_catalog.aclexplode(attribute.attacl)')
    }
    expect(
      countOccurrences(migrationGuard.replace(/\s+/g, ''), compactLegacyPrivileges),
    ).toBe(1)
    expect(
      countOccurrences(migrationGuard.replace(/\s+/g, ''), compactTargetPrivileges),
    ).toBe(1)
    expect(
      countOccurrences(preflightContract.replace(/\s+/g, ''), compactLegacyPrivileges),
    ).toBe(2)
    expect(
      countOccurrences(preflightContract.replace(/\s+/g, ''), compactTargetPrivileges),
    ).toBe(2)
    expect(
      countOccurrences(postflightContract.replace(/\s+/g, ''), compactTargetPrivileges),
    ).toBe(1)
    expect(
      countOccurrences(finalAttestation.replace(/\s+/g, ''), compactTargetPrivileges),
    ).toBe(1)

    expect(preflightContract).toContain('recent_events_acl_safe_entry_ok')
    expect(preflightContract).toContain(
      "THEN 'legacy_full_requires_normalization'",
    )
    expect(preflightContract).toContain("THEN 'narrow_target'")
    expect(normalization).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.recent_events',
    )
    expect(normalization).toContain(
      'FROM PUBLIC, anon, authenticated, service_role;',
    )
    expect(normalization).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recent_events',
    )
    expect(normalization).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+DEFAULT\s+PRIVILEGES)/i,
    )
    expect(normalization).not.toMatch(/^(?:GRANT|REVOKE|ALTER).*\bSEQUENCE\b/im)
    expect(migration.indexOf(normalization)).toBeGreaterThan(
      migration.indexOf("teskeid_event_recent_events_acl_drift"),
    )
    expect(migration.indexOf(normalization)).toBeLessThan(
      migration.indexOf('CREATE TEMP TABLE'),
    )
    const revokeIndex = migration.indexOf(
      'REVOKE ALL PRIVILEGES ON TABLE public.recent_events',
    )
    const grantIndex = migration.indexOf(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recent_events',
    )
    const finalAttestationIndex = migration.indexOf(
      'DO $teskeid_event_recent_events_acl_attestation$',
    )
    expect(revokeIndex).toBeGreaterThan(migration.indexOf('$teskeid_event_preconditions$;'))
    expect(grantIndex).toBeGreaterThan(revokeIndex)
    expect(finalAttestationIndex).toBeGreaterThan(grantIndex)
    expect(migration.lastIndexOf('\nCOMMIT;')).toBeGreaterThan(finalAttestationIndex)
    expect(readme).toContain('legacy_full_requires_normalization')
    expect(readme).toContain('changes no rows, RLS')
  })

  it('keeps the preflight mismatch diagnostic bounded and read only', () => {
    expect(diagnostic.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(diagnostic).toContain('SET TRANSACTION READ ONLY;')
    expect(diagnostic.match(/^ROLLBACK;$/gm)).toHaveLength(1)
    expect(diagnostic).toContain('recent_events_diagnostic')
    expect(diagnostic).toContain('feature_constraint_diagnostic')
    expect(diagnostic).toContain('unexpected_direct_acl')
    expect(diagnostic).toContain("'grantor', grantor")
    expect(diagnostic).toContain("'maintain', (SELECT pg_catalog.has_table_privilege(")
    expect(diagnostic).toContain('missing_expected')
    expect(diagnostic).toContain("E'\\\\mor\\\\M', 'g'")
    expect(diagnostic).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s+|ALTER\s+|CREATE\s+|DROP\s+)\b/i,
    )
  })

  it('backfills only the event domain with exact legacy IDs and no legacy tags', () => {
    const backfill = between(
      migration,
      '-- Deterministic event-domain-only backfill',
      'CREATE FUNCTION public.teskeid_event_create(',
    )
    expect(backfill).toContain('context_row.group_id')
    expect(backfill).toContain('participant.member_id')
    expect(backfill).toContain('participant.position')
    expect(backfill).toContain('teskeid_event_backfill_parity_failed')
    expect(backfill).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:expense_groups|expense_group_members|expenses|expense_payments|expense_shares|expense_obligations|expense_repayments|expense_repayment_allocations|expense_member_invitations|expense_activity|expense_mutation_requests|expense_settlement_batches|expense_settlement_batch_items)/,
    )
    expect(migration).toContain('teskeid_event_legacy_expense_auto_tagged')
    expect(migration).toContain('teskeid_event_financial_content_changed')
    expect(migration).toContain('pg_temp.teskeid_event_legacy_attestation')
  })

  it('implements mutable versioned rosters with strict sources and safe long emails', () => {
    const create = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_create(',
      'CREATE FUNCTION public.teskeid_event_list(',
    )
    const replace = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_replace_roster(',
      'CREATE FUNCTION public.teskeid_event_list_expense_sources(',
    )
    for (const body of [create, replace]) {
      expect(body).toContain("'relationship', 'manual_name', 'manual_email'")
      expect(body).toContain('pg_catalog.jsonb_array_length')
      expect(body).toContain('> 49')
      expect(body).toContain('relationship.owner_id = p_actor_id')
      expect(body).toContain('relationship.counterpart_user_id <> p_actor_id')
      expect(body).toContain('pg_catalog.left(v_email, 120)')
      expect(body).toContain('public.teskeid_event_valid_text(')
      expect(body).not.toMatch(
        /expense_create_unified_participant_invitation|expense_record_activity|recent_events/,
      )
    }
    expect(replace).toContain('p_expected_roster_revision')
    expect(replace).toContain('teskeid_event_revision_conflict')
    expect(replace).toContain("SET status = 'removed', position = NULL")
    expect(replace).toContain("SET status = 'active', position = v_position")
    expect(replace).toContain('roster_revision = event_row.roster_revision + 1')
    expect(migration).toContain('teskeid_event_guests_active_position_uidx')
    expect(migration).toContain('teskeid_event_guests_active_linked_uidx')
    expect(migration).toContain('teskeid_event_guests_active_email_uidx')
  })

  it('returns bounded owner-only event DTOs without linked identity UUIDs', () => {
    const detail = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get(',
      'CREATE FUNCTION public.teskeid_event_replace_roster(',
    )
    expect(detail).toContain("'event_guest_id', guest.id")
    expect(detail).toContain("'source_kind', guest.source_kind")
    expect(detail).toContain("'display_name', guest.display_name_snapshot")
    expect(detail).toContain("'email', CASE WHEN guest.source_kind = 'manual_email'")
    expect(detail).toContain(
      "'is_teskeid_user', guest.linked_user_id IS NOT NULL",
    )
    expect(detail).not.toMatch(/'linked_user_id'|'relationship_id'|'owner_user_id'/)
  })

  it('provides an exact both-gates owner-only expense-source lookup', () => {
    const lookup = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get_expense_source(',
      'CREATE FUNCTION public.teskeid_event_create_tagged_expense(',
    )
    expect(lookup).toContain('public.teskeid_event_assert_financial_actor(p_actor_id)')
    expect(lookup).toContain('event_row.id = p_event_id')
    expect(lookup).toContain('event_row.owner_user_id = p_actor_id')
    expect(lookup).toContain("RAISE EXCEPTION 'teskeid_event_not_found'")
    expect(lookup).toContain("'event_guest_id', guest.id")
    expect(lookup).toContain("guest.status = 'active'")
    expect(lookup).not.toMatch(/email_canonical|linked_user_id|relationship_id/)
  })

  it('keeps the SQL131 old-client contract and atomically dual-writes v2 only there', () => {
    const bridge = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.expense_create_event_context(',
      '-- SQL131 account cleanup preserved',
    )
    expect(bridge).toContain("'expense_create_event_context'")
    expect(bridge).toContain('v_canonical_participants')
    expect(bridge).toContain('v_group_result := public.expense_create_group(')
    expect(bridge).toContain('INSERT INTO public.expense_event_contexts')
    expect(bridge).toContain('INSERT INTO public.expense_event_participants')
    expect(bridge).toContain('INSERT INTO public.teskeid_events')
    expect(bridge).toContain('INSERT INTO public.teskeid_event_guests')
    expect(bridge).toContain("jsonb_build_object('event_id', v_group_id)")
    const v2Create = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_create(',
      'CREATE FUNCTION public.teskeid_event_list(',
    )
    expect(v2Create).not.toMatch(/expense_create_group|expense_event_contexts/)
  })

  it('delegates exact compact tagged payloads atomically with server-derived IDs', () => {
    const tagged = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_create_tagged_expense(',
      'CREATE FUNCTION public.teskeid_event_get_expense_preview(',
    )
    for (const key of [
      'title',
      'total_minor',
      'currency',
      'incurred_on',
      'category',
      'note',
      'split_method',
      'one_off_members',
      'payments',
      'shares',
      'obligations',
      'participant_invitations',
      'event_guest_members',
    ]) expect(tagged).toContain(`'${key}'`)
    expect(tagged).not.toMatch(/p_expense_id|p_group_id|p_draft_id/)
    expect(tagged).toContain("'teskeid-event-expense:'")
    expect(tagged).toContain("'teskeid-event-expense-inner-request:'")
    expect(tagged).toContain('public.expense_create_expense_with_participants(')
    expect(tagged).toContain('INSERT INTO public.teskeid_event_expense_links')
    expect(tagged).toContain(
      'INSERT INTO public.teskeid_event_expense_participant_sources',
    )
    expect(tagged).toContain("'group_id', v_group_id")
    expect(tagged).toContain("'expense_id', v_expense_id")
    expect(tagged).toContain("'invitation_ids'")
    expect(tagged).toContain('v_fingerprint_payload')
    expect(tagged).toContain("'__teskeid_server_event_guest__'")
    expect(tagged).toContain("'__teskeid_server_owner__'")
    expect(tagged).toContain("'__teskeid_server_relationship__'")
    expect(tagged).toContain("'user_id', NULL")
    expect(tagged).toContain("'role', 'member'")
    expect(tagged).toContain("'status', 'active'")
    expect(tagged).toContain("v_fingerprint_payload, '{title}'")
    expect(tagged).toContain('public.normalize_email_canonical(')
    expect(tagged).toContain('v_authoritative_display_name')
    expect(tagged.indexOf('teskeid_event_begin_request')).toBeLessThan(
      tagged.indexOf('SELECT event_row.* INTO v_event'),
    )
    const relationshipGuestFallback = between(
      tagged,
      "ELSIF v_guest.source_kind = 'relationship' THEN",
      '      v_authoritative_display_name := NULL;',
    )
    expect(relationshipGuestFallback).toContain('v_relationship_id := NULL')
    expect(relationshipGuestFallback).toContain(
      'IF v_guest.linked_user_id IS NOT NULL THEN',
    )
    expect(relationshipGuestFallback).toContain(
      'IF v_relationship_id IS NOT NULL THEN',
    )
    expect(relationshipGuestFallback).toContain(
      'retain the snapshot as a null-user financial member',
    )
    expect(relationshipGuestFallback).not.toContain(
      "RAISE EXCEPTION 'teskeid_event_roster_conflict'",
    )
  })

  it('computes a fail-closed preview with obligation provenance only', () => {
    const preview = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get_expense_preview(',
      '-- SQL131 compatibility bridge',
    )
    expect(preview).toContain("'status', 'none_tagged'")
    expect(preview).toContain("'status', 'unavailable'")
    expect(preview).toContain("'status', 'ready'")
    for (const state of [
      'settled',
      'open',
      'pending',
      'review_required',
      'blocked_manual',
    ]) expect(preview).toContain(`'${state}'`)
    expect(preview).toContain('payment.amount_minor::bigint')
    expect(preview).toContain('-share.amount_minor::bigint')
    expect(preview).toContain("repayment.status = 'confirmed'")
    expect(preview).toContain('expense_reported_repayments_need_review')
    expect(preview).toContain('expense.currency')
    expect(preview).toContain('guest.linked_user_id')
    expect(preview).toContain('public.expense_obligations AS obligation')
    expect(preview).toContain('obligation.amount_minor = allocation.amount_minor')
    expect(preview).toContain("expense.status NOT IN ('active', 'cancelled')")
    expect(preview).not.toMatch(/-?obligation\.amount_minor::bigint/)
    expect(preview).not.toMatch(/recipient_email|email_canonical/)
  })

  it('preserves account deletion parity and anonymized relationship snapshots', () => {
    const cleanup = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion',
      'DO $teskeid_event_financial_content_attestation$',
    )
    for (const token of [
      'hashtextextended(p_user_id::text, 9601)',
      'hashtextextended(p_user_id::text, 13201)',
      'hashtextextended(v_email_canonical, 9702)',
      'public.expense_terminalize_member_invitations',
      'hashtextextended(p_user_id::text, 9602)',
      'DELETE FROM public.teskeid_events',
      'DELETE FROM public.teskeid_event_mutation_requests',
      'UPDATE public.expense_event_participants',
      'DELETE FROM public.expense_event_contexts',
      'UPDATE public.expense_group_members',
    ]) expect(cleanup).toContain(token)
    const orderedCleanupTokens = [
      'hashtextextended(p_user_id::text, 9601)',
      'hashtextextended(p_user_id::text, 13201)',
      'hashtextextended(v_email_canonical, 9702)',
      'public.expense_terminalize_member_invitations',
      'hashtextextended(p_user_id::text, 9602)',
      'PERFORM event_row.id',
      'UPDATE public.teskeid_event_guests',
      'DELETE FROM public.teskeid_events',
      'UPDATE public.expense_event_participants',
      'DELETE FROM public.expense_event_contexts',
      'UPDATE public.expense_group_members',
    ]
    for (let index = 1; index < orderedCleanupTokens.length; index += 1) {
      expect(cleanup.indexOf(orderedCleanupTokens[index - 1])).toBeLessThan(
        cleanup.indexOf(orderedCleanupTokens[index]),
      )
    }
    expect(cleanup).toContain('SET linked_user_id = NULL,\n      relationship_id = NULL')
    expect(cleanup).not.toMatch(
      /SET\s+(?:source_kind|display_name_snapshot|email_canonical)\s*=/,
    )
    expect(cleanup).not.toMatch(
      /DELETE FROM public\.(?:expense_groups|expense_group_members|expenses|expense_payments|expense_shares|expense_obligations|expense_repayments|expense_activity)(?:\s|;)/,
    )
  })

  it('grants only eight v2 app RPCs and keeps every helper private', () => {
    const appRpcs = [
      'teskeid_event_create(uuid,uuid,text,jsonb)',
      'teskeid_event_list(uuid)',
      'teskeid_event_get(uuid,uuid)',
      'teskeid_event_replace_roster(uuid,uuid,uuid,bigint,jsonb)',
      'teskeid_event_list_expense_sources(uuid)',
      'teskeid_event_get_expense_source(uuid,uuid)',
      'teskeid_event_create_tagged_expense(uuid,uuid,uuid,bigint,jsonb)',
      'teskeid_event_get_expense_preview(uuid,uuid)',
    ]
    for (const signature of appRpcs) {
      const flexibleSignature = signature
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\(/g, '\\(\\s*')
        .replace(/\\\)/g, '\\s*\\)')
        .replace(/,/g, ',\\s*')
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${flexibleSignature}`),
      )
    }
    expect(migration.match(/GRANT EXECUTE ON FUNCTION public\.teskeid_event_/g)).toHaveLength(8)
    for (const internal of [
      'teskeid_event_normalize_text',
      'teskeid_event_valid_text',
      'teskeid_event_uuid_from_text',
      'teskeid_event_has_access',
      'teskeid_event_assert_actor',
      'teskeid_event_assert_financial_actor',
      'teskeid_event_begin_request',
      'teskeid_event_finish_request',
      'teskeid_event_assert_roster',
      'teskeid_event_immutable_history',
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${internal}`),
      )
    }
  })

  it('keeps tagged financial scope permanently guarded from both sides', () => {
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER teskeid_event_expenses_integrity_deferred',
    )
    expect(migration).toContain(
      'AFTER INSERT OR UPDATE OR DELETE ON public.expenses',
    )
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER teskeid_event_expense_groups_integrity_deferred',
    )
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER teskeid_event_expense_members_integrity_deferred',
    )
    expect(migration).toContain('teskeid_event_financial_parent_integrity_trigger')
    expect(migration).toContain("RAISE EXCEPTION 'teskeid_event_expense_link_invalid'")
    expect(migration).toContain(
      'CONSTRAINT teskeid_event_expense_sources_guest_fk\n    FOREIGN KEY (event_id, event_guest_id)',
    )
    expect(migration).toContain(
      'REFERENCES public.teskeid_event_guests(event_id, id) ON DELETE CASCADE',
    )
    expect(postflight).toContain("29::smallint)")
  })

  it('attests exact legacy preservation and canonical privacy/schema seams', () => {
    expect(migration).toContain('CREATE TEMP TABLE pg_temp.teskeid_event_legacy_attestation')
    expect(migration).toContain('id_digest text NOT NULL')
    expect(migration).toContain('teskeid_event_financial_ids_changed')
    expect(migration).toContain('teskeid_event_financial_content_changed')
    for (const sql of [preflight, postflight]) {
      expect(sql).toContain('preservation_digests')
      expect(sql).toContain('canonical_relation_acl_ok')
      expect(sql).toContain('canonical_columns_ok')
      expect(sql).toContain('canonical_constraints_indexes_ok')
      expect(sql).toContain('expense_activity_audience')
      expect(sql).toContain('expense_event_contexts')
      expect(sql).toContain('expense_event_participants')
      expect(sql).toContain('expense_group_members_registered_unique')
      expect(sql).toContain('expense_group_members_owner_unique')
      expect(sql).toContain('expenses_status_check')
    }
    expect(preflight).toContain('recent_events_acl_safe_entry_ok')
    expect(postflight).toContain('recent_events_acl_exact_ok')
    expect(postflight).toContain('preservation_comparison_required')
    expect(readme).toContain('byte-for-byte')
    expect(readme).toContain('separate read-only sessions')
  })

  it('pins identical normalized prerequisite constraint and index definitions', () => {
    const migrationConstraints = exactConstraintDefinitions(migration)
    const preflightConstraints = exactConstraintDefinitions(preflight)
    const postflightConstraints = exactConstraintDefinitions(postflight)

    expect(migrationConstraints.size).toBe(41)
    expect(preflightConstraints).toEqual(migrationConstraints)
    for (const [key, definition] of migrationConstraints) {
      expect(postflightConstraints.get(key), key).toBe(definition)
    }
    expect(postflightConstraints.size).toBe(55)

    const migrationIndexes = exactIndexDefinitions(migration)
    const preflightIndexes = exactIndexDefinitions(preflight)
    const postflightIndexes = exactIndexDefinitions(postflight)
    expect(migrationIndexes.size).toBe(6)
    expect(preflightIndexes).toEqual(migrationIndexes)
    for (const definition of migrationIndexes) {
      expect(postflightIndexes.has(definition), definition).toBe(true)
    }
    expect(postflightIndexes.size).toBe(12)

    for (const sql of [migration, preflight, postflight]) {
      expect(sql).toContain('pg_catalog.pg_get_constraintdef(')
      expect(sql).toContain('pg_catalog.pg_get_indexdef(')
      expect(sql).toContain(
        'createuniqueindexrelationships_owner_counterpart_user_idxonrelationshipsusingbtreeowner_id,counterpart_user_idwherecounterpart_user_idisnotnull',
      )
      expect(sql).not.toContain('expected.tokens')
    }
    expect(postflight).toContain('sql131_constraints_exact_ok')
    expect(postflight).toContain('sql131_indexes_exact_ok')
  })

  it('pins every final SQL132 function body digest in postflight', () => {
    const bodies = sql132FunctionBodies()
    const expectedRows = [
      ...postflight.matchAll(
        /\('public\.((?:teskeid_event_[^(]+|expense_create_event_context|expense_prepare_account_deletion))\([^']*\)', '[^']+', '([0-9a-f]{32})', (?:true|false)\)/g,
      ),
    ]
    expect(expectedRows.length).toBe(bodies.size)
    expect(expectedRows.length).toBeGreaterThan(20)
    for (const row of expectedRows) {
      const body = bodies.get(row[1])
      expect(body, row[1]).toBeDefined()
      expect(createHash('md5').update(body!).digest('hex'), row[1]).toBe(row[2])
    }
    expect(postflight).not.toContain('__GET_SOURCE_HASH__')
  })

  it('keeps Phase C writes absent', () => {
    expect(migration).not.toMatch(
      /CREATE (?:OR REPLACE )?FUNCTION public\.teskeid_event_(?:settle|report|confirm|reject|cancel)/i,
    )
    expect(migration).not.toMatch(/CREATE TABLE public\.teskeid_event_settlement/i)
    expect(migration).not.toMatch(/'Gera upp viðburð'/)
    const preview = between(
      migration,
      'CREATE FUNCTION public.teskeid_event_get_expense_preview(',
      '-- SQL131 compatibility bridge',
    )
    expect(preview).not.toMatch(/INSERT INTO|UPDATE public\.|DELETE FROM/)
  })

  it('ships one-row read-only validation and forward-only recovery guidance', () => {
    for (const sql of [preflight, postflight, recovery]) {
      expect(sql).toContain('BEGIN;')
      expect(sql).toContain('SET TRANSACTION READ ONLY;')
      expect(sql).toContain('SET LOCAL search_path = pg_catalog;')
      expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(sql).not.toMatch(
        /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\s/im,
      )
    }
    expect(preflight).toContain('target_slots_clear')
    expect(preflight).toContain('legacy_text_nfc_ok')
    expect(preflight).toContain('dependency_functions_exact_ok')
    expect(preflight).toContain('dependency_triggers_exact_ok')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('rls_force_owner_ok')
    expect(postflight).toContain('no_effective_table_or_column_privileges_ok')
    expect(postflight).toContain('unchanged_dependencies_exact_ok')
    expect(postflight).toContain('exact_legacy_event_guest_parity_ok')
    expect(postflight).toContain('no_implicit_legacy_tags_ok')
    expect(postflight).toContain('exact_one_off_link_scope_ok')
    expect(postflight).toContain('exact_provenance_scope_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(recovery).toContain('forward_only_recovery_instruction')
    expect(readme).toContain('preflight → migration → postflight')
    expect(readme).toContain('DB-first')
    expect(readme).toContain('Localhost checks for Stebbi')
    expect(readme).toContain('Nothing in this folder has been executed by Codex')
    expect(readme).toContain('did not run PostgreSQL')
  })
})
