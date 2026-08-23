import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/149_event_participant_identity_display.sql'), 'utf8')
const validationRoot = join(root, 'sql/validation/149-event-participant-identity-display')

function functionBody(name: string): string {
  const marker = `CREATE FUNCTION public.${name}(`
  const start = migration.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const bodyStart = migration.indexOf('AS $function$', start) + 'AS $function$'.length
  const bodyEnd = migration.indexOf('$function$;', bodyStart)
  expect(bodyStart).toBeGreaterThan('AS $function$'.length - 1)
  expect(bodyEnd).toBeGreaterThan(bodyStart)
  return migration.slice(bodyStart, bodyEnd).replaceAll('\r\n', '\n')
}

describe('SQL149 Event participant identity/display authority', () => {
  it('is additive, transactional and never rewrites the frozen SQL132-SQL148 surface', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(migration).not.toContain('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA')
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM) public\.expense_/)
    expect(migration).not.toMatch(/LOCK TABLE public\.expense_/)
    expect(migration).toContain('sql149_protected_catalog_mismatch')
  })

  it('uses safe human labels without banning real Icelandic names globally', () => {
    const validator = functionBody('teskeid_event_private_valid_shared_name_v2')
    const normalizer = functionBody(
      'teskeid_event_private_normalize_shared_name_v2',
    )
    expect(normalizer).toContain('pg_catalog.regexp_replace')
    expect(normalizer).toContain('\\00A0')
    expect(normalizer).toContain('\\FEFF')
    expect(normalizer).toContain('pg_catalog.normalize')
    expect('\u00a0Alice\u00a0'.trim().normalize('NFC')).toBe('Alice')
    expect('A\u0301'.trim().normalize('NFC')).toBe('Á')
    expect(validator).toContain("pg_catalog.strpos(")
    expect(validator).toContain("'@'")
    expect(validator).toContain('p_value IS NOT DISTINCT FROM')
    expect(validator).not.toMatch(/gestur|teskeiðarnotandi/i)

    const backfill = functionBody('teskeid_event_private_ensure_person_v2')
    expect(backfill).toContain("v_guest.source_kind = 'relationship'")
    expect(backfill).toContain("pg_catalog.lower(v_name) = 'teskeiðarnotandi'")
    expect(backfill).toContain('profile.display_name')
    expect(backfill).toContain("v_guest.source_kind = 'manual_email'")

    const canonical = functionBody('teskeid_event_private_canonical_roster_input_v2')
    expect(canonical).toContain("'shared_display_name'")
    expect(canonical).toContain("item.value->>'source_kind' = 'manual_email'")
    expect(canonical).toContain("(item.value - ARRAY[")
    expect(canonical).toContain("'source_kind', 'email', 'shared_display_name'")

    const emailValidator = functionBody(
      'teskeid_event_private_valid_canonical_email_v2',
    )
    expect(emailValidator).toContain('public.normalize_email_canonical(p_value) = p_value')
    expect(emailValidator).toContain('(?!\\.)')
    expect(emailValidator).toContain('(?!.*\\.\\.)')
    expect(emailValidator).toContain('[A-Za-z]{2,}')
    expect(canonical).toContain('teskeid_event_private_valid_canonical_email_v2')
  })

  it('keeps private relationship data actor-owned, sanitized and structurally separate', () => {
    const body = functionBody('teskeid_event_private_viewer_relationship_v2')
    expect(body).toContain('relationship.owner_id = p_actor_id')
    expect(body).toContain("'kind', 'relationship'")
    expect(body).toContain("'built_in_tags'")
    expect(body).toContain("'custom_labels'")
    expect(body).toContain("'hidden_custom_label_count'")
    expect(body).toContain('SELECT DISTINCT ON (canonical_label.name)')
    expect(body).toContain('ORDER BY canonical_label.name, canonical_label.id')
    expect(body).toContain('LIMIT 20')
    expect(body).toContain('v_candidate_count <> 1')
    expect(body).toContain('p_recipient_user_id IS NOT NULL')
    expect(body).toContain('relationship.counterpart_user_id = p_recipient_user_id')
    expect(body).not.toContain('FROM auth.users')
    expect(body).toContain('teskeid_event_valid_text(v_alias, 1, 120)')
    expect(body).toContain('teskeid_event_private_valid_canonical_email_v2(v_email)')
    expect(body).toMatch(
      /teskeid_event_private_normalize_shared_name_v2\(\s+definition\.name/,
    )
    expect('A\u0301'.normalize('NFC')).toBe('Á')
    expect(new Set(['A\u0301'.normalize('NFC'), 'Á'.normalize('NFC')]).size).toBe(1)
    expect(body).not.toContain("'relationship_id'")
    expect(body).not.toContain("'recipient_user_id'")
  })

  it('bridges final v1 semantics through deferred triggers without RSVP/access conflation', () => {
    for (const trigger of [
      'teskeid_event_guests_sql149_participation_deferred',
      'teskeid_event_guest_invitations_sql149_participation_deferred',
      'teskeid_event_attendance_memberships_sql149_sync_deferred',
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE CONSTRAINT TRIGGER\\s+${trigger}[\\s\\S]*?DEFERRABLE INITIALLY DEFERRED`),
      )
    }
    const bridge = functionBody('teskeid_event_private_v1_participation_bridge_v2')
    expect(bridge).toContain("NEW.status = 'pending'")
    expect(bridge).toContain('participation.identity_claimed_at IS NOT NULL')
    expect(bridge).toContain("participation.access_state <> 'active'")
    expect(bridge).toMatch(
      /participation\.recipient_email_canonical\s+IS DISTINCT FROM/,
    )
    expect(bridge).toContain(
      'COALESCE(v_increment_generation, v_invitation_count > 1)',
    )
    expect(bridge).toContain("NEW.status = 'accepted'")
    expect(bridge).toContain("false, 'active', 'attending'")
    expect(bridge).toContain("NEW.status = 'declined'")
    expect(bridge).toContain("false, 'active', 'not_attending'")
    expect(bridge).toContain("NEW.status = 'cancelled'")
    expect(bridge).toContain("'clear_target'")
    expect(bridge).toContain("false, 'left', NULL")
    expect(bridge).not.toMatch(/expires_at|delivery_status|attempt_number/)
    expect(bridge).toContain('participation.claim_source_invitation_id =')
    expect(bridge).toMatch(/BEGIN\s+PERFORM pg_catalog\.nextval\(/)

    const apply = functionBody('teskeid_event_private_apply_participation_v2')
    expect(apply).toContain('v_row.recipient_user_id IS NOT NULL')
    expect(apply).toContain(
      'v_row.recipient_user_id IS DISTINCT FROM p_recipient_user_id',
    )
    expect(apply).toContain("RAISE EXCEPTION 'teskeid_event_unavailable'")
  })

  it('keeps every new catalog identifier within the PostgreSQL 63-byte limit', () => {
    const identifierPatterns = [
      /\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([a-z0-9_]+)/gi,
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z0-9_]+)/gi,
      /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:public\.)?([a-z0-9_]+)/gi,
      /\bCREATE\s+SEQUENCE\s+(?:public\.)?([a-z0-9_]+)/gi,
      /\bCREATE\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)/gi,
      /\b(?:ADD\s+)?CONSTRAINT\s+(?!TRIGGER\b)([a-z0-9_]+)/gi,
    ]
    const identifiers = identifierPatterns.flatMap((pattern) =>
      [...migration.matchAll(pattern)].map((match) => match[1]),
    )
    const triggerIdentifiers = [
      ...migration.matchAll(
        /\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([a-z0-9_]+)/gi,
      ),
    ].map((match) => match[1])
    const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
    const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
    const oldTruncatedIdentifierSource =
      'teskeid_event_attendance_memberships_sql149_participation_deferred'
    const canonicalTrigger =
      'teskeid_event_attendance_memberships_sql149_sync_deferred'

    expect(identifiers.length).toBeGreaterThan(0)
    expect(triggerIdentifiers).toHaveLength(8)
    expect(new Set(triggerIdentifiers).size).toBe(8)
    for (const identifier of identifiers) {
      expect(
        Buffer.byteLength(identifier, 'utf8'),
        identifier,
      ).toBeLessThanOrEqual(63)
    }
    for (const source of [migration, postflight, recovery]) {
      expect(source).toContain(canonicalTrigger)
      expect(source).not.toContain(oldTruncatedIdentifierSource)
    }
  })

  it('claims only bounded confirmed-email matches and burns the legacy token once', () => {
    const claim = functionBody('teskeid_event_private_claim_participations_v2')
    expect(claim).toContain('account.email_confirmed_at IS NOT NULL')
    expect(claim).toContain('LIMIT 101')
    expect(claim).toContain("RAISE EXCEPTION 'teskeid_event_claim_limit_exceeded'")
    expect(claim).toContain('FOR SHARE OF account')
    expect(claim).toContain('identity_generation = v_candidate.identity_generation')
    expect(claim).toContain('recipient_email_canonical = NULL')
    expect(claim).toContain("'identity_claim'")
    expect(claim).toContain("ARRAY[v_invitation_id], 'cancelled'")
    expect(claim).toContain('pg_catalog.cardinality(v_current_owner_ids) = 0')
    expect(claim).toContain('RETURN 0;')
    expect(claim).toContain('bound_self.recipient_user_id = p_actor_id')
    expect(claim).not.toContain("bound_self.access_state = 'active'")
    expect(claim).toContain('owned_event.owner_user_id = p_actor_id')
    expect(claim).not.toContain("rsvp_state = 'attending'")
  })

  it('preserves a tombstone and removes access when a claimed account is deleted', () => {
    const body = functionBody('teskeid_event_private_auth_delete_participations_v2')
    expect(body).toContain('participation.recipient_user_id = OLD.id')
    expect(body).toContain('ORDER BY participation.event_id, participation.event_guest_id')
    expect(body).toContain('guest.linked_user_id IS DISTINCT FROM OLD.id')
    expect(body).toContain('event_row.owner_user_id <> OLD.id')
    expect(body).toContain('LIMIT 101')
    expect(body).toContain('teskeid_event_private_expire_bound_invitations_v2')
    expect(body).toContain('FOR UPDATE OF participation')
    expect(body).toContain("access_state = 'left'")
    expect(body).not.toMatch(/expense_|pg_advisory/)
    expect(migration).toContain('BEFORE DELETE ON auth.users')
    expect(migration).toContain('teskeid_event_participations_tombstone_access_check')
  })

  it('freezes the strict public mutation ABI with request-bound replay results', () => {
    const signatures = [
      'teskeid_event_create_with_details_and_participations_v2',
      'teskeid_event_replace_roster_with_participations_v2',
      'teskeid_event_repair_person_label_v2',
      'teskeid_event_set_rsvp_v2',
    ]
    for (const name of signatures) {
      const body = functionBody(name)
      expect(body).toContain("'request_id', p_request_id")
      expect(body).toContain('teskeid_event_private_begin_participation_request_v2')
      expect(body).toContain('teskeid_event_private_finish_participation_request_v2')
    }
    expect(migration).toContain("'create_with_participations_v2'")
    expect(migration).toContain("'replace_roster_with_participations_v2'")
    expect(migration).toContain("'repair_person_label_v2'")
    expect(migration).toContain("'set_rsvp_v2'")
    expect(functionBody('teskeid_event_set_rsvp_v2')).toContain(
      'p_rsvp_state IS NULL',
    )
  })

  it('emits exact access-aware management and legacy Expense projections', () => {
    const management = functionBody('teskeid_event_get_roster_management_v2')
    expect(management).toContain("participation.access_state = 'active'")
    expect(management).toContain('participation.recipient_user_id IS NULL')
    expect(management).toContain("'recipient_state'")
    expect(management).not.toContain("'source_kind'")
    expect(management).toContain("'identity_tombstone'")
    expect(management).toContain("'claimed'")
    expect(management).toContain('terminalization.identity_generation =')
    expect(management).toContain('teskeid_event_private_claim_participations_v2')
    expect(migration).toMatch(
      /CREATE FUNCTION public\.teskeid_event_get_roster_management_v2[\s\S]*?LANGUAGE plpgsql\s+VOLATILE/,
    )

    const legacyPerson = functionBody('teskeid_event_private_legacy_person_v2')
    expect(legacyPerson).toContain("'access_state', v_participation.access_state")
    expect(legacyPerson).toContain("v_participation.access_state <> 'active'")
    expect(legacyPerson).toContain("THEN 'not_active'")
    const legacyList = functionBody('teskeid_event_list_legacy_expense_sources_v2')
    expect(legacyList).toContain('owned_event.owner_user_id = p_actor_id')
    expect(legacyList).not.toContain('teskeid_event_private_claim_participations_v2')
    const legacyGet = functionBody('teskeid_event_get_legacy_expense_source_v2')
    expect(legacyGet).toContain('teskeid_event_attendance_memberships')
    expect(legacyGet).toContain('self_guest.linked_user_id = p_actor_id')
    expect(legacyGet).not.toContain('teskeid_event_private_claim_participations_v2')
  })

  it('keeps all new tables FORCE-RLS/no-policy and only exposes public v2 RPCs', () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(4)
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(4)
    expect(migration).not.toMatch(/CREATE POLICY/)
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('TO service_role;')
    expect(migration).not.toContain('TO anon')
    expect(migration).not.toContain('TO authenticated')
  })

  it('serializes auth lifecycle changes and keeps every identity capability bounded', () => {
    const guard = functionBody('teskeid_event_private_guard_bound_invitation_v2')
    expect(guard).toContain('FOR SHARE OF account')
    expect(guard).toContain('teskeid_event_private_valid_canonical_email_v2')
    expect(guard).toContain('teskeid_event_invitation_recipient_unavailable')
    expect(guard).toContain("NEW.invitation_kind = 'access_only'")
    expect(guard).toContain('SELECT guest.linked_user_id')
    expect(guard).toContain("guest.status = 'active'")
    expect(guard.indexOf('SELECT guest.linked_user_id')).toBeLessThan(
      guard.indexOf('IF v_recipient_user_id IS NULL THEN\n    RETURN NEW;'),
    )
    expect(guard).toContain("NEW.invitation_kind = 'identity_and_access'")
    expect(guard.indexOf("NEW.invitation_kind = 'identity_and_access'")).toBeLessThan(
      guard.indexOf('FOR SHARE OF account'),
    )

    const emailHook = functionBody('teskeid_event_private_auth_email_invitations_v2')
    expect(emailHook).toContain('OLD.email_confirmed_at')
    expect(emailHook).toContain('NEW.email_confirmed_at')
    expect(emailHook).toContain('teskeid_event_private_expire_bound_invitations_v2')
    expect(migration).toMatch(
      /CREATE TRIGGER teskeid_event_sql149_participation_account_email\s+AFTER UPDATE OF email, email_confirmed_at ON auth\.users/,
    )

    const apply = functionBody('teskeid_event_private_apply_participation_v2')
    expect(apply).toContain('v_row.identity_claimed_at IS NOT NULL')
    expect(apply).toContain('other_participation.recipient_user_id = v_user_id')
    expect(apply).toContain('other_participation.recipient_email_canonical = v_email')
  })

  it('freezes temporal input and the short auth-first migration lock window', () => {
    const create = functionBody(
      'teskeid_event_create_with_details_and_participations_v2',
    )
    expect(create).toContain("date '0001-01-01'")
    expect(create).toContain("date '9999-12-31'")
    expect(create).toContain("p_event_time >= time '24:00:00'")
    expect(create).toContain('p_event_time::time(0)')
    expect(create).toContain('teskeid_event_private_format_utc_timestamp_v2')

    const formatter = functionBody(
      'teskeid_event_private_format_utc_timestamp_v2',
    )
    expect(formatter).toContain("p_value AT TIME ZONE 'UTC'")
    expect(formatter).toContain('YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    expect(formatter).toContain("timestamptz '0001-01-01 00:00:00+00'")
    for (const reader of [
      'teskeid_event_list_for_actor_v2',
      'teskeid_event_get_actor_view_v2',
      'teskeid_event_list_person_source_events_v2',
    ]) {
      expect(functionBody(reader)).toContain(
        'teskeid_event_private_format_utc_timestamp_v2',
      )
    }
    expect(create).toContain("'invited_at', public.teskeid_event_private_format_utc_timestamp_v2")
    expect(create).toContain(
      'teskeid_event_private_valid_canonical_email_v2(\n     invitation.recipient_email_canonical',
    )
    expect(create).toContain(
      'invitation.recipient_label_snapshot =',
    )
    expect(create).toContain("|| '***@' || pg_catalog.split_part(")
    expect(create).toContain(
      'pg_catalog.substr(invitation.recipient_label_snapshot, 1, 1)',
    )
    expect(functionBody('teskeid_event_replace_roster_with_participations_v2')).toContain(
      "'expires_at', public.teskeid_event_private_format_utc_timestamp_v2",
    )
    expect(functionBody('teskeid_event_replace_roster_with_participations_v2')).toContain(
      "invitation.status = 'pending'",
    )
    const practicalEmail = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
    expect(practicalEmail.test("'a@example.com")).toBe(true)
    expect(practicalEmail.test("'@example.com")).toBe(false)

    const actorView = functionBody('teskeid_event_get_actor_view_v2')
    expect(actorView).toContain('teskeid_event_private_normalize_shared_name_v2')
    expect(actorView).not.toContain("'name', event_row.name")
    expect(actorView).not.toContain("'description', details.description")

    const authLock = migration.indexOf(
      'LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;',
    )
    const eventLock = migration.indexOf(
      'LOCK TABLE public.teskeid_events IN SHARE ROW EXCLUSIVE MODE;',
    )
    const firstCreate = migration.indexOf('CREATE TABLE public.teskeid_event_person_labels')
    expect(authLock).toBeGreaterThan(firstCreate)
    expect(eventLock).toBeGreaterThan(authLock)
  })

  it('marks every legacy bridge attempt before any early return and resets only under locks', () => {
    const bridge = functionBody('teskeid_event_private_v1_participation_bridge_v2')
    expect(bridge).toMatch(/BEGIN\s+PERFORM pg_catalog\.nextval\(/)
    expect(migration).toContain('CREATE SEQUENCE public.teskeid_event_v1_bridge_observation_seq')
    expect(migration).toContain('CACHE 1')
    expect(migration).toContain('OWNED BY NONE')
    const flush = migration.indexOf('teskeid_event_guests_sql149_participation_deferred,')
    const reset = migration.indexOf('pg_catalog.setval(')
    expect(reset).toBeGreaterThan(flush)
  })

  it('source-seals every SQL149 function consistently across migration and validation', () => {
    const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
    const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
    const names = Array.from(
      migration.matchAll(/^CREATE FUNCTION public\.([a-zA-Z0-9_]+)\(/gm),
      (match) => match[1],
    )
    expect(names).toHaveLength(37)
    for (const name of names) {
      const hash = createHash('md5').update(functionBody(name)).digest('hex')
      expect(migration).toContain(`'${name}','${hash}'`)
      expect(postflight).toContain(`'${name}','${hash}'`)
      expect(recovery).toContain(hash)
    }
  })

  it('ships read-only validation and a forward-fix-only guarded recovery', () => {
    for (const name of [
      'README.md',
      'preflight.sql',
      'postflight.sql',
      'diagnostic-function-security.sql',
      'recovery.sql',
    ]) {
      expect(() => readFileSync(join(validationRoot, name), 'utf8')).not.toThrow()
    }
    const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
    const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
    const functionSecurityDiagnostic = readFileSync(
      join(validationRoot, 'diagnostic-function-security.sql'),
      'utf8',
    )
    const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
    expect(`${migration}\n${postflight}\n${recovery}`).not.toMatch(
      /TO_BE_SET|HASH_[A-Z]/,
    )
    expect(preflight).toContain('SET TRANSACTION READ ONLY')
    expect(postflight).toContain('SET TRANSACTION READ ONLY')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(preflight).toContain('invalid_event_text_projection_count')
    expect(preflight).toContain('bound_identity_pending_invitation_count')
    expect(postflight).toContain('event_text_projection_safe_ok')
    expect(postflight).toContain('bound_identity_pending_absent_ok')
    expect(postflight).toContain('AS collation_row')
    expect(postflight).not.toMatch(/\bAS\s+collation\b/i)
    expect(postflight).not.toMatch(/\bcollation\.collname\b/i)
    expect(postflight).toContain('SELECT attribute_row.attname::text')
    expect(postflight).toContain('SELECT operator_class.opcname::text')
    expect(postflight).toContain("SELECT COALESCE(collation_row.collname, '')::text")
    expect(postflight).not.toMatch(/SELECT\s+attribute_row\.attname\s*(?:\r?\n)/)
    expect(postflight).not.toMatch(/SELECT\s+operator_class\.opcname\s*(?:\r?\n)/)
    expect(recovery).toContain('SELECT attribute.attname::text')
    expect(recovery).not.toMatch(/SELECT\s+attribute\.attname\s*(?:\r?\n)/)
    expect(functionSecurityDiagnostic).toContain('SET TRANSACTION READ ONLY')
    expect(functionSecurityDiagnostic).toContain(') IS NOT TRUE')
    expect(functionSecurityDiagnostic).toContain('actual_acl_exact')
    expect(
      functionSecurityDiagnostic.match(/\('public\.teskeid_event_[^']+_v2\(/g),
    ).toHaveLength(37)
    expect(functionSecurityDiagnostic).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/i,
    )
    for (const validationSql of [postflight, functionSecurityDiagnostic, recovery]) {
      expect(validationSql).toMatch(
        /teskeid_event_private_legacy_roster_input_v2\(jsonb\)'[\s\S]{0,100}'jsonb','sql',false,'i'/,
      )
      expect(validationSql).not.toMatch(
        /teskeid_event_private_legacy_roster_input_v2\(jsonb\)'[\s\S]{0,100}'jsonb','plpgsql',false,'i'/,
      )
    }
    expect(`${preflight}\n${postflight}`).not.toContain('pg_catalog.current_user')
    expect(recovery).toContain('sql149_recovery_forward_fix_only')
    expect(recovery.indexOf('LOCK TABLE auth.users')).toBeLessThan(
      recovery.indexOf('LOCK TABLE public.teskeid_events'),
    )
    expect(recovery).toContain('sequence_state.last_value = 1 AND NOT sequence_state.is_called')
    expect(recovery).toContain('pg_catalog.pg_get_indexdef')
    expect(recovery).toContain('expected_identity.recipient_email_canonical')
    expect(recovery).toContain('teskeid_event_sql149_participation_account_email')
    expect(recovery).toContain('DROP TRIGGER teskeid_event_sql149_participation_account_delete')
    expect(recovery).not.toContain('CASCADE')
  })
})
