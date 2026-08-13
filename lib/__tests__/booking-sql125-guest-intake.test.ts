import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSql = (name: string) => readFileSync(join(process.cwd(), 'sql', name), 'utf8')
const migration = readSql('125_booking_guest_intake.sql')
const preflight = readSql('validation/125-booking-guest-intake/preflight.sql')
const postflight = readSql('validation/125-booking-guest-intake/postflight.sql')
const recovery = readSql('validation/125-booking-guest-intake/recovery.sql')
const validationReadme = readFileSync(
  join(process.cwd(), 'sql', 'validation', '125-booking-guest-intake', 'README.md'),
  'utf8',
)

function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function expectReadOnlySingleRowContract(sql: string): void {
  const parsed = statements(sql)
  expect(parsed).toHaveLength(4)
  expect(parsed[0]).toBe('BEGIN')
  expect(parsed[1]).toBe('SET TRANSACTION READ ONLY')
  expect(parsed[2]).toMatch(/^WITH /)
  expect(parsed[2]).not.toMatch(
    /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/im,
  )
  expect(parsed[3]).toBe('ROLLBACK')
}

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )
  expect(match, `missing ${name}`).not.toBeNull()
  return match![0]
}

describe('SQL125 booking guest-intake static production contract', () => {
  it('is a fail-closed one-time transactional migration with exact prerequisites', () => {
    expect(migration).toMatch(/^-- TODO #097 \/ SQL125/)
    expect(migration).toContain('\nBEGIN;')
    expect(migration).toContain('\nCOMMIT;')
    expect(migration).toContain("SET LOCAL search_path = pg_catalog")
    expect(migration).toContain('booking_missing_dependency')
    expect(migration).toContain('booking_business_profile_composite_key_missing')
    expect(migration).toContain("attribute.attname = 'space_id'")
    expect(migration).toContain("attribute.attname = 'id'")
    expect(migration).toContain("procedure_row.prorettype = pg_catalog.to_regtype('pg_catalog.bool')")
    expect(migration).toContain('booking_postgres_owner_unavailable')
    expect(migration).toContain('booking_migration_owner_must_be_postgres_or_superuser')
    expect(migration).toContain('booking_service_role_unavailable')
    expect(migration).toContain('booking_collision')
    expect(migration).toContain(
      "public.check_and_increment_ip_rate_limit(text,date,integer)",
    )
    expect(migration).not.toMatch(/CREATE (?:TABLE|INDEX) IF NOT EXISTS/i)
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
  })

  it('adds bokanir to the existing feature union without replacing prior keys', () => {
    expect(migration).toContain('pg_catalog.pg_get_expr')
    expect(migration).toContain("pg_catalog.quote_literal('auglysandi')")
    expect(migration).toContain("pg_catalog.quote_literal('bokanir')")
    expect(migration).toMatch(
      /ADD CONSTRAINT feature_access_feature_key_check CHECK \(\(%s\) OR feature_key = %L\)/,
    )
    const providerGuard = functionBody('booking_provider_allowed')
    expect(providerGuard).toContain("entitlement.feature_key = 'bokanir'")
    expect(providerGuard).toContain("membership.role = 'owner'")
  })

  it('creates the six private tables with deletion-safe provider snapshots', () => {
    expect(migration.match(/^CREATE TABLE public\.booking_/gm)).toHaveLength(6)
    for (const table of [
      'booking_services',
      'booking_requests',
      'booking_access_members',
      'booking_capability_sessions',
      'booking_messages',
      'booking_events',
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`)
    }
    expect(migration).toMatch(
      /CONSTRAINT booking_services_profile_fk\s+FOREIGN KEY \(space_id, business_profile_id\)\s+REFERENCES public\.business_profiles\(space_id, id\) ON DELETE CASCADE/,
    )
    expect(migration).toContain('service_id_snapshot uuid NOT NULL')
    expect(migration).toMatch(
      /CONSTRAINT booking_requests_service_fk\s+FOREIGN KEY \(space_id, business_profile_id, service_id\)\s+REFERENCES public\.booking_services\(space_id, business_profile_id, id\)\s+MATCH FULL ON DELETE SET NULL/,
    )
    expect(migration).toMatch(
      /CONSTRAINT booking_events_request_fk\s+FOREIGN KEY \(booking_request_id\) REFERENCES public\.booking_requests\(id\) ON DELETE RESTRICT/,
    )
    expect(migration).toMatch(
      /CONSTRAINT booking_messages_session_fk[\s\S]*?booking_capability_sessions\(id\) ON DELETE RESTRICT/,
    )
    expect(migration).toMatch(
      /CONSTRAINT booking_events_subject_member_fk[\s\S]*?booking_access_members\(id\) ON DELETE RESTRICT/,
    )
    expect(migration).toMatch(
      /FOREIGN KEY \(creator_user_id\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    )
    expect(migration).toContain('business_profile_slug_snapshot text NOT NULL')
    expect(migration).toContain('provider_name_snapshot text NOT NULL')
    expect(migration).toContain('service_title_snapshot text NOT NULL')
    expect(migration).toContain('provider_timezone text NOT NULL')
  })

  it('uses forced default-deny RLS, exact postgres owners and RPC-only service access', () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(6)
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(6)
    expect(migration).not.toMatch(/CREATE POLICY/i)
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.booking_services,[\s\S]*public\.booking_events\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(migration).not.toMatch(/GRANT[^;]+ON TABLE public\.booking_/i)
    expect(migration.match(/ALTER TABLE public\.booking_\w+ OWNER TO postgres;/g)).toHaveLength(6)
    expect(migration.match(/ALTER FUNCTION public\.booking_/g)).toHaveLength(20)
    expect(migration.match(/REVOKE ALL ON FUNCTION public\.booking_/g)).toHaveLength(20)
    expect(migration.match(/GRANT EXECUTE ON FUNCTION public\.booking_/g)).toHaveLength(14)
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION[^;]+TO (?:PUBLIC|anon|authenticated)/i,
    )
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(20)
  })

  it('keeps customer creation open while provider authoring remains owner plus flag gated', () => {
    const create = functionBody('booking_create_request')
    const upsert = functionBody('booking_upsert_service')
    const publicResolver = functionBody('booking_resolve_public')
    expect(create).not.toContain('booking_assert_provider(p_creator_user_id')
    expect(create).toContain("service.status = 'published'")
    expect(create).toContain('public.booking_provider_allowed(membership.user_id')
    expect(upsert).toContain('public.booking_assert_provider(p_actor_id, p_space_id)')
    expect(publicResolver).toContain("service.status = 'published'")
    expect(publicResolver).toContain('public.booking_provider_allowed(membership.user_id')
    expect(publicResolver).not.toMatch(/contact_(?:name|email|phone|message)/)
  })

  it('makes create replay semantic, rate-limited and atomic with signed owner membership', () => {
    const create = functionBody('booking_create_request')
    const replayLookup = create.indexOf('request_row.create_request_id = p_request_id')
    const rateLimit = create.indexOf('check_and_increment_ip_rate_limit')
    const requestInsert = create.indexOf('INSERT INTO public.booking_requests')
    const memberInsert = create.indexOf('INSERT INTO public.booking_access_members')
    const returnResult = create.lastIndexOf('RETURN pg_catalog.jsonb_build_object')
    expect(replayLookup).toBeGreaterThan(0)
    expect(rateLimit).toBeGreaterThan(replayLookup)
    expect(create).toContain('booking_rate_limited')
    expect(create).toContain('p_rate_limit_hash')
    expect(create).toContain('p_rate_limit_window_date')
    expect(create).toContain('p_rate_limit_max')
    expect(create).toContain("'requestedLocalDate', p_requested_local_date")
    expect(create).toContain("'requestedLocalTime', p_requested_local_time")
    expect(create).toContain('p_requested_at AT TIME ZONE v_service.timezone')
    expect(create).toContain('p_requested_local_date + p_requested_local_time')
    const fingerprint = create.slice(
      create.indexOf('v_fingerprint := pg_catalog.md5'),
      create.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock'),
    )
    expect(fingerprint).not.toContain("'requestedAt'")
    expect(requestInsert).toBeGreaterThan(rateLimit)
    expect(memberInsert).toBeGreaterThan(requestInsert)
    expect(memberInsert).toBeLessThan(returnResult)
    expect(create).toMatch(/'owner',[\s\S]*'active'/)
    expect(migration).toMatch(
      /access_mode = 'link'[\s\S]*creator_user_id IS NULL[\s\S]*applied_discount_bps IS NULL/,
    )
  })

  it('recovers exact lost create responses before current provider resolution', () => {
    const replay = functionBody('booking_resolve_create_replay')
    expect(replay).toContain('request_row.create_request_id = p_request_id')
    expect(replay).toContain('IF NOT FOUND THEN RETURN NULL')
    expect(replay).toContain("'serviceId', v_request.service_id_snapshot")
    expect(replay).toContain('request_fingerprint IS DISTINCT FROM v_fingerprint')
    expect(replay).toContain('booking_idempotency_conflict')
    expect(replay).toContain('business_profile_slug_snapshot')
    expect(replay).not.toContain('booking_resolve_public')
    expect(replay).not.toContain("service.status = 'published'")
    expect(replay).not.toContain('check_and_increment_ip_rate_limit')
  })

  it('bounds capability storage while supporting independent browser sessions', () => {
    const exchange = functionBody('booking_exchange_capability')
    const existingReplay = exchange.indexOf('session_row.session_token_hash = p_session_hash')
    const cleanup = exchange.indexOf('DELETE FROM public.booking_capability_sessions')
    const cap = exchange.indexOf('>= 16')
    expect(exchange).toContain('p_capability_hash')
    expect(exchange).toContain("p_capability_hash !~ '^[0-9a-f]{64}$'")
    expect(exchange).toContain("p_session_hash !~ '^[0-9a-f]{64}$'")
    expect(exchange).toContain("interval '30 days 5 minutes'")
    expect(existingReplay).toBeGreaterThan(0)
    expect(cleanup).toBeGreaterThan(existingReplay)
    expect(cap).toBeGreaterThan(cleanup)
    expect(exchange).toContain('message.capability_session_id = stale_session.id')
    expect(exchange).toContain('event_row.actor_session_id = stale_session.id')
    expect(exchange).toContain('session_row.revoked_at IS NULL')
    expect(exchange).toContain('session_row.expires_at > pg_catalog.now()')
    expect(exchange).toContain('history never exhausts future link access')
    expect(exchange).toContain("RAISE EXCEPTION 'booking_not_found'")
    expect(migration).toContain(
      'CONSTRAINT booking_capability_sessions_token_hash_key UNIQUE (session_token_hash)',
    )
    expect(migration).not.toMatch(
      /UNIQUE \(booking_request_id, access_version\).*booking_capability_sessions/,
    )
  })

  it('makes claim one-way and applies only the create-time discount snapshot', () => {
    const claim = functionBody('booking_claim_request')
    expect(claim).toContain('FOR UPDATE')
    expect(claim).toContain("v_request.access_mode <> 'link'")
    expect(claim).toContain("v_request.status <> 'requested'")
    expect(claim).toContain('cardinality(COALESCE(p_additional_emails, ARRAY[]::text[])) > 9')
    expect(claim).toContain('v_request.access_version <> p_expected_access_version')
    expect(claim).toContain('v_service_discount := v_request.eligible_discount_bps')
    expect(claim).not.toContain('SELECT service.signed_in_discount_bps')
    expect(claim).not.toMatch(/SET[\s\S]*eligible_discount_bps\s*=/)
    expect(claim).toContain("access_mode = 'members'")
    expect(claim).toContain('guest_capability_hash = NULL')
    expect(claim).toContain('access_version = request_row.access_version + 1')
    expect(claim).toMatch(
      /UPDATE public\.booking_capability_sessions[\s\S]*SET revoked_at = pg_catalog\.now\(\)/,
    )
    expect(claim).toContain("'booking_claimed'")
    expect(claim).toContain("'discount_applied'")
  })

  it('enforces canonical multi-email ownership, no self-revoke and last-owner retention', () => {
    const canonical = functionBody('booking_canonical_email')
    const manage = functionBody('booking_manage_member')
    expect(canonical).toContain('pg_catalog.char_length(v_email) > 254')
    expect(canonical).toContain("v_domain IN ('gmail.com', 'googlemail.com')")
    expect(canonical).toContain("pg_catalog.replace(v_local, '.', '')")
    expect(migration).toContain(
      'public.booking_canonical_email(canonical_email) IS NOT NULL',
    )
    expect(migration).toContain('pg_catalog.char_length(contact_email) BETWEEN 3 AND 254')
    expect(manage).toContain('booking_last_owner')
    expect(manage).not.toContain('v_target_email = v_actor_email OR NOT FOUND')
    expect(manage).toContain("p_action = 'revoke' AND v_target_email = v_actor_email")
    expect(manage).toContain('member.id = p_target_selector::uuid')
    expect(manage).toContain('v_target_email := v_target_member.canonical_email')
    expect(manage).toContain('v_target_member.role = v_role')
    expect(manage).toContain('Self-revoke is intentionally outside the MVP')
    expect(manage.indexOf('event_row.idempotency_key = p_idempotency_key')).toBeLessThan(
      manage.indexOf("member.role = 'owner'"),
    )
  })

  it('shares guest chat limits across cookies and never labels a bearer as the contact', () => {
    const send = functionBody('booking_send_message')
    const replayLookup = send.slice(
      send.indexOf('SELECT message.* INTO v_existing'),
      send.indexOf('IF FOUND THEN'),
    )
    expect(send).toContain("v_sender_key := 'guest:link:' || v_request.access_version::text")
    expect(send).toContain('v_access.capability_session_id')
    expect(send).toContain("recent_message.created_at > pg_catalog.now() - interval '1 minute'")
    expect(send).toContain('booking_message_rate_limited')
    expect(send).toContain('v_author_name := NULL')
    expect(send).not.toContain('v_request.contact_name')
    expect(send).toContain("v_author_name ~ '[[:cntrl:]]'")
    expect(replayLookup).not.toContain('message.sender_key')
    expect(migration).toContain('UNIQUE (booking_request_id, client_message_id)')
    expect(migration).toContain('UNIQUE (booking_request_id, idempotency_key)')
    expect(migration).toMatch(
      /booking_messages_author_name_check CHECK \([\s\S]*author_name_snapshot !~ '\[\[:cntrl:\]\]'/,
    )
  })

  it('gives an entitled provider stable precedence over dual-role customer membership', () => {
    const authorize = functionBody('booking_authorize_request')
    const manage = functionBody('booking_manage_member')
    const providerCheck = authorize.indexOf(
      'public.booking_provider_allowed(p_actor_user_id, v_request.space_id)',
    )
    const memberCheck = authorize.indexOf("v_request.access_mode = 'members'")
    expect(providerCheck).toBeGreaterThanOrEqual(0)
    expect(memberCheck).toBeGreaterThan(providerCheck)
    expect(authorize).toContain("v_request.id, 'provider'::text")
    const manageReplay = manage.indexOf('event_row.idempotency_key = p_idempotency_key')
    const manageProviderGuard = manage.lastIndexOf(
      'public.booking_provider_allowed(p_actor_user_id, v_request.space_id)',
    )
    const manageMutation = manage.indexOf('UPDATE public.booking_requests AS request_row')
    expect(manageReplay).toBeGreaterThan(0)
    expect(manageProviderGuard).toBeGreaterThan(manageReplay)
    expect(manageProviderGuard).toBeLessThan(manageMutation)
  })

  it('replays guest cancellation by stable link principal after cookie renewal', () => {
    const cancel = functionBody('booking_cancel_request')
    expect(cancel).toContain("'guest:link:' || v_request.access_version::text")
    expect(cancel).toContain("'actorPrincipal', v_actor_principal")
    expect(cancel).not.toContain("'actorSessionId', v_access.capability_session_id")
    expect(cancel).not.toContain(
      'v_existing_event.actor_session_id IS DISTINCT FROM v_access.capability_session_id',
    )
    expect(cancel.indexOf('event_row.idempotency_key = p_idempotency_key')).toBeLessThan(
      cancel.indexOf('v_request.revision <> p_expected_revision'),
    )
    expect(cancel).toContain("'replayed', true")
    expect(cancel).toContain('session_row.access_version = v_existing_event.access_version')
    expect(cancel).toContain('auth_user.email_confirmed_at IS NOT NULL')
    // The originating session remains attached to the immutable audit event.
    expect(cancel).toContain('v_access.capability_session_id')
  })

  it('minimizes member PII and resolves mutable slugs canonically for authorized reads', () => {
    const projection = functionBody('booking_request_projection')
    expect(projection).toContain("p_access_kind = 'member'")
    expect(projection).toContain("p_member_role = 'owner'")
    expect(projection).toContain("'members', v_members")
    expect(projection).not.toMatch(/p_access_kind\s*=\s*'provider'[\s\S]*v_members/)
    expect(projection).toContain('profile.slug INTO v_current_profile_slug')
    expect(projection).toContain('profile.archived_at IS NULL')
    expect(projection).toContain('v_request.business_profile_slug_snapshot')
    expect(projection).toContain("'businessProfileSlug', v_current_profile_slug")
    expect(projection).toContain("'slug', v_current_profile_slug")
    const events = functionBody('booking_list_events')
    expect(events).toContain("WHEN 'guest' THEN NULL")
    expect(events).not.toMatch(/contact_(?:email|phone|message)/)
  })

  it('keeps canonical authoritative events immutable and free of client event codes', () => {
    for (const eventType of [
      'request_submitted',
      'booking_claimed',
      'member_added',
      'member_revoked',
      'request_cancelled',
      'discount_applied',
    ]) {
      expect(migration).toContain(`'${eventType}'`)
    }
    expect(migration).not.toContain("'request_created'")
    expect(migration).not.toContain("'request_claimed'")
    expect(migration).not.toMatch(/p_event_(?:type|code)/)
    expect(migration).toMatch(
      /CREATE TRIGGER booking_events_immutable_guard\s+BEFORE UPDATE OR DELETE ON public\.booking_events/,
    )
    const immutable = functionBody('booking_events_immutable')
    expect(immutable).toContain("ARRAY['actor_user_id', 'actor_session_id']")
    expect(immutable).toContain("RAISE EXCEPTION 'booking_event_immutable'")
    expect(migration).toContain('pg_catalog.octet_length(event_data::text) <= 1000')
  })

  it('ships complete single-row read-only validation and forward-only recovery', () => {
    expectReadOnlySingleRowContract(preflight)
    expectReadOnlySingleRowContract(postflight)
    expectReadOnlySingleRowContract(recovery)
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('target_objects_absent')
    expect(preflight).toContain('execution_role_can_assign_postgres_owner')
    expect(postflight).toContain('exact_private_tables_force_rls_owner_ok')
    expect(postflight).toContain('exact_service_role_function_allowlist_ok')
    expect(postflight).toContain('exact_no_non_owner_table_column_privileges_ok')
    expect(postflight).toContain('has_any_column_privilege')
    expect(postflight).toContain('replay_before_rate_and_signed_owner_atomic_ok')
    expect(postflight).toContain('provider_state_independent_create_replay_ok')
    expect(postflight).toContain('one_way_claim_frozen_discount_ok')
    expect(postflight).toContain('owner_only_members_and_current_canonical_slug_ok')
    expect(postflight).toContain('message_replay_across_guest_member_transition_ok')
    expect(postflight).toContain('entitled_provider_precedence_ok')
    expect(postflight).toContain('cancel_replay_stable_bearer_principal_ok')
    expect(postflight).toContain('live_session_cap_preserves_audit_history_ok')
    expect(recovery).toContain('forward_only_recovery_instruction')
    expect(recovery).toContain('query_to_xml')
    expect(recovery).not.toMatch(/FROM public\.booking_(?:services|requests|access_members|capability_sessions|messages|events)/)
    expect(recovery).not.toMatch(/^\s*(?:DROP|DELETE|UPDATE|ALTER|TRUNCATE)\b/im)
    expect(validationReadme).toContain('No SQL in this package was run')
    expect(validationReadme).toContain('Localhost checks for Stebbi')
    expect(validationReadme).toContain('forward-only')
    expect(validationReadme).not.toMatch(/DROP TABLE|DELETE FROM public\.feature_access/i)
  })
})
