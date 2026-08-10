import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(join(process.cwd(), 'sql', name), 'utf8')
const migration = read('120_advertiser_foundation.sql')
const preflight = read('validation/120-advertiser-foundation/preflight.sql')
const postflight = read('validation/120-advertiser-foundation/postflight.sql')
const recovery = read('validation/120-advertiser-foundation/recovery.sql')

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

describe('SQL120 advertiser static production contract', () => {
  it('is a one-time fail-closed migration with complete collision guards', () => {
    expect(migration).toContain('advertiser_missing_dependency')
    expect(migration).toContain('advertiser_feature_constraint_missing')
    expect(migration).toContain('advertiser_kviss_prerequisite_missing')
    expect(migration).toContain('advertiser_owner_cannot_bypass_rls')
    expect(migration).toContain('advertiser_service_role_unavailable')
    expect(migration).toContain('advertiser_service_role_cannot_bypass_rls')
    expect(migration).toContain('advertiser_collision')
    expect(migration).toContain("('advertiser_audit_events_idempotency_key')")
    expect(migration).toContain("'advertiser_audit_immutable_guard'")
    expect(migration).toMatch(/CREATE TABLE public\.business_profiles/)
    expect(migration).toMatch(/CREATE TABLE public\.advertiser_creatives/)
    expect(migration).toMatch(/CREATE TABLE public\.advertiser_audit_events/)
    expect(migration).not.toMatch(/CREATE (?:TABLE|INDEX) IF NOT EXISTS/i)
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION/i)
  })

  it('preserves the feature union and adds only the exact advertiser key', () => {
    expect(migration).toMatch(/pg_get_expr/)
    expect(migration).toContain("pg_catalog.quote_literal('kviss')")
    expect(migration).toContain("pg_catalog.quote_literal('auglysandi')")
    expect(migration).toMatch(
      /ADD CONSTRAINT feature_access_feature_key_check CHECK \(\(%s\) OR feature_key = %L\)/,
    )
  })

  it('uses forced default-deny RLS and keeps direct writes behind exact RPCs', () => {
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3)
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(3)
    expect(migration).not.toMatch(/CREATE POLICY/i)
    expect(migration).not.toMatch(/GRANT\s+ALL/i)
    expect(migration).not.toMatch(/GRANT[^;]+\bTO\s+(?:PUBLIC|anon|authenticated)\b/i)
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE public\.business_profiles,[\s\S]*public\.advertiser_audit_events[\s\S]*TO service_role;/,
    )
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*ON TABLE/i,
    )
    expect(migration).not.toMatch(/GRANT[^;]*ON SEQUENCE/i)
    expect(migration.match(/GRANT EXECUTE ON FUNCTION public\.advertiser_/g)).toHaveLength(5)
    expect(migration).toMatch(/SET search_path = ''/)
  })

  it('has deletion-safe ownership and an update-only audit guard', () => {
    expect(migration).toMatch(
      /CONSTRAINT business_profiles_space_fk\s+FOREIGN KEY \(space_id\) REFERENCES public\.spaces\(id\) ON DELETE CASCADE/,
    )
    expect(migration).toMatch(
      /CONSTRAINT business_profiles_created_by_fk\s+FOREIGN KEY \(created_by\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    )
    expect(migration).toMatch(
      /CONSTRAINT advertiser_creatives_profile_fk\s+FOREIGN KEY \(space_id, business_profile_id\)\s+REFERENCES public\.business_profiles\(space_id, id\) ON DELETE CASCADE/,
    )
    expect(migration).toMatch(
      /CONSTRAINT advertiser_creatives_reviewer_fk\s+FOREIGN KEY \(reviewed_by\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    )
    expect(migration).toMatch(
      /CONSTRAINT advertiser_audit_events_creative_fk\s+FOREIGN KEY \(creative_id\) REFERENCES public\.advertiser_creatives\(id\) ON DELETE CASCADE/,
    )
    expect(migration).toMatch(
      /CONSTRAINT advertiser_audit_events_actor_fk\s+FOREIGN KEY \(actor_user_id\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    )
    expect(migration).not.toMatch(/ON DELETE RESTRICT/)
    expect(migration).toMatch(
      /CREATE TRIGGER advertiser_audit_immutable_guard\s+BEFORE UPDATE ON public\.advertiser_audit_events/,
    )
    expect(migration).not.toMatch(
      /CREATE TRIGGER advertiser_audit_immutable_guard[\s\S]*BEFORE UPDATE OR DELETE/,
    )
  })

  it('binds idempotency keys to actor, scope, action and content revision', () => {
    expect(migration).toContain("v_existing.command_scope <> 'owner'")
    expect(migration).toContain('v_existing.request_action <> p_action')
    expect(migration).toContain('v_existing.actor_user_id IS DISTINCT FROM p_actor_id')
    expect(migration).toContain('v_existing.creative_revision <> p_expected_revision')
    expect(migration).toContain("v_existing.command_scope <> 'admin'")
    expect(migration).toContain('v_existing.request_action <> p_decision')
    expect(migration).toContain('v_existing.actor_user_id IS DISTINCT FROM p_reviewer_id')
    expect(migration).toContain("v_existing.note IS DISTINCT FROM NULLIF(pg_catalog.btrim(p_note), '')")
    expect(migration.match(/advertiser_idempotency_conflict/g)).toHaveLength(2)
    expect(migration).toMatch(
      /WHERE creative\.id = p_creative_id[\s\S]*FOR UPDATE;[\s\S]*idempotency_key = p_idempotency_key/,
    )
  })

  it('allows only FK actor redaction through the audit update guard', () => {
    expect(migration).toContain('OLD.actor_user_id IS NOT NULL')
    expect(migration).toContain('NEW.actor_user_id IS NULL')
    expect(migration).toContain("pg_catalog.to_jsonb(NEW) - 'actor_user_id'")
    expect(migration).toContain("pg_catalog.to_jsonb(OLD) - 'actor_user_id'")
    expect(migration).toContain('RETURN NEW')
    expect(migration).toContain("RAISE EXCEPTION 'advertiser_audit_immutable'")
  })

  it('publishes only the exact approved revision for a currently entitled owner', () => {
    expect(migration).toContain('approved_snapshot = submitted_snapshot')
    expect(migration).toContain('approved_revision = revision')
    expect(migration).toContain('approved_snapshot = creative.submitted_snapshot')
    expect(migration).toContain('approved_revision = creative.revision')
    expect(migration).toContain("membership.role = 'owner'")
    expect(migration).toContain("entitlement.feature_key = 'auglysandi'")
    expect(migration).toContain("jsonb_build_object('disclosure', 'Auglýsing')")
    expect(migration.toLowerCase()).not.toContain('quizbador')
  })

  it('returns a complete one-row read-only preflight contract', () => {
    expectReadOnlySingleRowContract(preflight)
    expect(preflight).toContain('server_address')
    expect(preflight).toContain('required_roles_ok')
    expect(preflight).toContain('execution_role_bypasses_rls')
    expect(preflight).toContain('service_role_bypasses_rls')
    expect(preflight).toContain('service_role_public_schema_usage')
    expect(preflight).toContain('feature_constraint_contains_kviss')
    expect(preflight).toContain('feature_constraint_already_contains_auglysandi')
    expect(preflight).toContain('relation_collisions')
    expect(preflight).toContain('function_collisions')
    expect(preflight).toContain('trigger_collisions')
    expect(preflight).toContain('target_objects_absent')
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('transactions_older_than_five_minutes')
  })

  it('returns a complete one-row read-only postflight contract', () => {
    expectReadOnlySingleRowContract(postflight)
    expect(postflight).toContain('exact_column_contract_ok')
    expect(postflight).toContain('exact_validated_constraints_ok')
    expect(postflight).toContain('exact_indexes_ok')
    expect(postflight).toContain('exact_foreign_key_lifecycle_ok')
    expect(postflight).toContain('force_rls_ok')
    expect(postflight).toContain('default_deny_no_policies_ok')
    expect(postflight).toContain('no_browser_table_or_column_grants_ok')
    expect(postflight).toContain('service_role_select_only_ok')
    expect(postflight).toContain('service_role_bypasses_rls_ok')
    expect(postflight).toContain('no_direct_sequence_grants_ok')
    expect(postflight).toContain('exact_service_role_function_grants_ok')
    expect(postflight).toContain('object_owner_bypasses_rls_ok')
    expect(postflight).toContain('update_only_audit_immutability_ok')
    expect(postflight).toContain('semantic_idempotency_guards_ok')
    expect(postflight).toContain('approved_snapshot_and_owner_eligibility_ok')
    expect(postflight).toContain('rpc_revision_and_payload_guards_ok')
  })

  it('keeps recovery destructive, empty-beta-only and feature-union-safe', () => {
    expect(recovery).toContain('DESTRUCTIVE and NOT RUN')
    expect(recovery).toContain('advertiser_recovery_contract_missing')
    expect(recovery).toContain('advertiser_recovery_non_empty')
    expect(recovery).toMatch(/DROP TABLE public\.advertiser_audit_events/)
    expect(recovery).toMatch(/DROP TABLE public\.advertiser_creatives/)
    expect(recovery).toMatch(/DROP TABLE public\.business_profiles/)
    expect(recovery).not.toMatch(
      /DROP CONSTRAINT feature_access_feature_key_check|DELETE FROM public\.feature_access/i,
    )
  })
})
