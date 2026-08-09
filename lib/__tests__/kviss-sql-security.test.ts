import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(join(process.cwd(), 'sql', name), 'utf8')
const authoring = read('115_kviss_authoring.sql')
const live = read('116_kviss_live.sql')
const authoringPreflight = read('validation/115-kviss-authoring/preflight.sql')
const authoringPostflight = read('validation/115-kviss-authoring/postflight.sql')
const livePreflight = read('validation/116-kviss-live/preflight.sql')
const livePostflight = read('validation/116-kviss-live/postflight.sql')

function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function expectReadOnlySingleRowContract(sql: string, queryStart: RegExp): void {
  const parsed = statements(sql)
  expect(parsed).toHaveLength(4)
  expect(parsed[0]).toBe('BEGIN')
  expect(parsed[1]).toBe('SET TRANSACTION READ ONLY')
  expect(parsed[2]).toMatch(queryStart)
  expect(parsed[2]).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/im)
  expect(parsed[3]).toBe('ROLLBACK')
}

describe('SQL115-116 static security boundaries', () => {
  it('keeps every new base table forced-RLS and service-role only', () => {
    for (const migration of [authoring, live]) {
      expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i)
      expect(migration).toMatch(/FORCE ROW LEVEL SECURITY/i)
      expect(migration).not.toMatch(/CREATE POLICY[\s\S]*USING\s*\(\s*true\s*\)/i)
      expect(migration).not.toMatch(/GRANT\s+ALL/i)
      expect(migration).not.toMatch(/GRANT[^;]+\bTO\s+(?:anon|authenticated)\b/i)
      expect(migration).toMatch(/SET search_path = ''/)
    }
  })

  it('preserves the existing feature-key union and adds only Kviss', () => {
    expect(authoring).toMatch(/pg_get_expr/)
    expect(authoring).toContain("'kviss'")
    expect(authoring).toContain("pg_catalog.strpos(v_expression, pg_catalog.quote_literal('kviss'))")
  })

  it('makes SQL115 a one-time fail-closed migration', () => {
    expect(authoring).toContain('kviss_authoring_missing_dependency')
    expect(authoring).toContain('kviss_authoring_feature_constraint_missing')
    expect(authoring).toContain('kviss_authoring_owner_cannot_bypass_rls')
    expect(authoring).toContain('kviss_authoring_service_role_unavailable')
    expect(authoring).toContain('kviss_authoring_collision')
    expect(authoring).toMatch(/CREATE TABLE public\.kviss_questions/)
    expect(authoring).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.kviss/)
    expect(authoring).not.toMatch(/CREATE OR REPLACE FUNCTION public\.kviss/)
  })

  it('keeps authoring writes behind RPCs and makes personal data deletion-safe', () => {
    expect(authoring).toMatch(
      /GRANT SELECT ON TABLE public\.kviss_questions,\s+public\.kviss_templates, public\.kviss_template_questions TO service_role/,
    )
    expect(authoring).not.toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON TABLE public\.kviss/i)
    expect(authoring).toMatch(/CONSTRAINT kviss_questions_space_fk[\s\S]*ON DELETE CASCADE/)
    expect(authoring).toMatch(/CONSTRAINT kviss_questions_created_by_fk[\s\S]*ON DELETE CASCADE/)
    expect(authoring).toMatch(/CONSTRAINT kviss_templates_space_fk[\s\S]*ON DELETE CASCADE/)
    expect(authoring).toMatch(/CONSTRAINT kviss_templates_created_by_fk[\s\S]*ON DELETE CASCADE/)
    expect(authoring).not.toMatch(/ON DELETE RESTRICT/)
  })

  it('validates structured authoring payloads again at the SQL RPC boundary', () => {
    expect(authoring).toContain("jsonb_typeof(option_row.value) <> 'string'")
    expect(authoring).toContain('char_length(option_row.value) NOT BETWEEN 1 AND 300')
    expect(authoring).toContain('selected.index_value IS NULL')
    expect(authoring).toContain('char_length(label_row.value) NOT BETWEEN 1 AND 40')
    expect(authoring).toContain("jsonb_typeof(question_row.value) <> 'object'")
    expect(authoring).toContain('char_length(team_row.value) NOT BETWEEN 1 AND 60')
  })

  it('returns the complete SQL115 preflight contract in one read-only result row', () => {
    expectReadOnlySingleRowContract(authoringPreflight, /^WITH required_roles/)
    expect(authoringPreflight).toContain('feature_access_constraints')
    expect(authoringPreflight).toContain('target_objects_absent')
    expect(authoringPreflight).toContain('prerequisites_ok')
    expect(authoringPreflight).toContain('transactions_older_than_five_minutes')
  })

  it('returns one read-only SQL115 postflight row covering the hardened invariants', () => {
    expectReadOnlySingleRowContract(authoringPostflight, /^WITH expected_tables/)
    expect(authoringPostflight).toContain('account_deletion_cascade_fks_ok')
    expect(authoringPostflight).toContain('service_role_select_only_ok')
    expect(authoringPostflight).toContain('service_role_function_scope_ok')
    expect(authoringPostflight).toContain('object_owner_bypasses_rls_ok')
    expect(authoringPostflight).toContain('rpc_payload_guards_ok')
  })

  it('stores hash/digest-only guest credentials and server timestamps', () => {
    expect(live).toContain('password_hash')
    expect(live).toMatch(/crypt\(p_password/i)
    expect(live).toContain('capability_digest')
    expect(live).not.toMatch(/\bpassword\s+text\b/i)
    expect(live).toMatch(/answered_at timestamptz NOT NULL DEFAULT now\(\)/i)
    expect(live).toMatch(/UNIQUE \(participant_id, activation_id\)/i)
  })

  it('makes SQL116 one-time, fail-closed and collision complete', () => {
    expect(live).toContain('kviss_live_missing_dependency')
    expect(live).toContain('kviss_live_owner_cannot_bypass_rls')
    expect(live).toContain('kviss_live_authoring_contract_invalid')
    expect(live).toContain('kviss_live_collision')
    expect(live).toContain("('kviss_join_attempts_id_seq')")
    expect(live).toContain("('kviss_session_messages_participant_id_client_message_id_key')")
    expect(live).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.kviss/)
    expect(live).not.toMatch(/CREATE INDEX IF NOT EXISTS kviss/)
    expect(live).not.toMatch(/CREATE OR REPLACE FUNCTION public\.kviss/)
  })

  it('makes live-session deletion lifecycle safe without broad direct writes', () => {
    expect(live).toMatch(/CONSTRAINT kviss_sessions_created_by_fk[\s\S]*ON DELETE CASCADE/)
    expect(live).toMatch(/CONSTRAINT kviss_sessions_template_fk[\s\S]*ON DELETE CASCADE/)
    expect(live).toMatch(/CONSTRAINT kviss_session_commands_actor_fk[\s\S]*ON DELETE SET NULL/)
    expect(live).not.toMatch(/ON DELETE RESTRICT/)
    expect(live).toMatch(/GRANT SELECT ON TABLE public\.kviss_sessions,[\s\S]*TO service_role;/)
    expect(live).not.toMatch(/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON TABLE public\.kviss/i)
    expect(live).not.toMatch(/GRANT\s+UPDATE\s*(?:\([^)]*\))?\s+ON TABLE public\.kviss/i)
    expect(live).not.toMatch(/GRANT\s+(?:USAGE|SELECT|UPDATE)[^;]*ON SEQUENCE/i)
  })

  it('validates live RPC payloads and exact generated secrets at the SQL boundary', () => {
    expect(live).toContain("broadcast_topic ~ '^[A-Za-z0-9_-]{43}$'")
    expect(live).toContain("p_broadcast_topic !~ '^[A-Za-z0-9_-]{43}$'")
    expect(live).toContain('octet_length(p_password) > 72')
    expect(live).toContain("octet_length(coalesce(p_password, '')) > 72")
    expect(live).toContain('ON CONFLICT (join_code) DO NOTHING')
    expect(live).toContain('p_capability_digest IS NULL')
    expect(live).toContain('p_actor_scope_hash IS NULL')
    expect(live).toContain('p_expected_revision IS NULL')
    expect(live).toContain("p_command_type <> 'activate_question' AND p_question_id IS NOT NULL")
    expect(live).toContain('p_selected_option IS NULL')
    expect(live).toContain('p_client_message_id IS NULL')
    expect(live).toContain('CREATE FUNCTION public.kviss_touch_participant')
    expect(live).toContain("last_seen_at < now() - interval '30 seconds'")
  })

  it('returns the complete SQL116 preflight contract in one read-only result row', () => {
    expectReadOnlySingleRowContract(livePreflight, /^WITH required_roles/)
    expect(livePreflight).toContain('sql115_contract_ok')
    expect(livePreflight).toContain('relation_collisions')
    expect(livePreflight).toContain('function_collisions')
    expect(livePreflight).toContain('target_objects_absent')
    expect(livePreflight).toContain('prerequisites_ok')
    expect(livePreflight).toContain('transactions_older_than_five_minutes')
  })

  it('returns one read-only SQL116 postflight row covering exact security invariants', () => {
    expectReadOnlySingleRowContract(livePostflight, /^WITH expected_live_tables/)
    expect(livePostflight).toContain('exact_foreign_key_lifecycle_ok')
    expect(livePostflight).toContain('account_deletion_lifecycle_ok')
    expect(livePostflight).toContain('no_browser_table_or_column_grants_ok')
    expect(livePostflight).toContain('service_role_select_only_ok')
    expect(livePostflight).toContain('no_service_role_column_mutation_grants_ok')
    expect(livePostflight).toContain('no_direct_sequence_grants_ok')
    expect(livePostflight).toContain('exact_service_role_function_grants_ok')
    expect(livePostflight).toContain('object_owner_bypasses_rls_ok')
    expect(livePostflight).toContain('rpc_payload_guards_ok')
  })

  it('serializes host commands before checking exact idempotency input', () => {
    expect(live).toMatch(/WHERE s\.id = p_session_id FOR UPDATE;[\s\S]*SELECT resulting_revision, command_type, question_id/)
    expect(live).toMatch(/v_existing_question_id IS DISTINCT FROM v_requested_question_id/)
    expect(live).toMatch(/command_type, question_id, resulting_revision/)
  })

  it('bounds opportunistic join-attempt retention work', () => {
    expect(live).toMatch(/kviss_join_attempts_time_idx/)
    expect(live).toMatch(/WHERE attempted_at < now\(\) - interval '7 days'[\s\S]*LIMIT 1000/)
    expect(live).not.toMatch(/CREATE OR REPLACE FUNCTION public\.kviss_random_token/)
  })
})
