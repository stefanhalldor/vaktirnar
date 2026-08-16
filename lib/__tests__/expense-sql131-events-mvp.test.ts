import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/131_expense_events_mvp.sql'), 'utf8')
const validationRoot = join(root, 'sql/validation/131-expense-events-mvp')
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('SQL131 owner-private expense events MVP', () => {
  it('is one additive transaction with a guard before schema mutation', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    const guard = migration.indexOf('DO $expense_event_preconditions$')
    const firstCreate = migration.indexOf('CREATE TABLE')
    expect(guard).toBeGreaterThan(migration.indexOf('BEGIN;'))
    expect(firstCreate).toBeGreaterThan(guard)
    expect(migration).toContain('expense_event_relation_collision')
    expect(migration).toContain('expense_event_function_collision')
    expect(migration).toContain('expense_event_account_deletion_body_drift')
    expect(migration).toContain('expense_event_group_creator_body_drift')
    expect(migration).toContain("WHERE role_row.rolname IN ('anon', 'authenticated')")
    expect(migration).toContain(') <> 2 THEN')
    expect(migration).not.toMatch(/GROUP BY\s+(?:true|false)\b/i)
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|FUNCTION)|TRUNCATE\s+/i)
    expect(migration.match(/DROP CONSTRAINT feature_access_feature_key_check/g)).toHaveLength(1)
  })

  it('preserves the feature union and adds only the canonical event key', () => {
    expect(migration).toContain("'utlagt-og-endurgreitt'")
    expect(migration).toContain("'afmaeli-og-vidburdir'")
    expect(migration).toContain('expense_event_feature_constraint_changed_during_apply')
    expect(migration).toContain('CHECK ((%s) OR feature_key = %L)')
    expect(migration).not.toContain("feature_key = 'vidburdir'")
  })

  it('creates two default-deny private tables with the frozen FK contract', () => {
    for (const table of ['expense_event_contexts', 'expense_event_participants']) {
      expect(migration).toContain(`CREATE TABLE public.${table}`)
      expect(migration).toContain(`ALTER TABLE public.${table} OWNER TO postgres`)
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
    }
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('expense_event_participants_context_fk')
    expect(migration).toContain('ON DELETE CASCADE\n    DEFERRABLE INITIALLY DEFERRED')
    expect(migration).toContain('expense_event_participants_member_fk')
    expect(migration).toContain('REFERENCES public.expense_group_members(group_id, id)')
    expect(migration).toContain('expense_event_participants_linked_user_fk')
    expect(migration).toContain('ON DELETE SET NULL')
    expect(migration).toContain('UNIQUE (group_id, position)')
    expect(migration).toContain('UNIQUE (group_id, linked_user_id)')
    expect(migration).toContain('CREATE INDEX expense_event_contexts_owner_created_idx')
    expect(migration).toContain('CREATE INDEX expense_event_participants_linked_user_idx')
  })

  it('maps every non-owner member in a contiguous frozen roster', () => {
    const integrity = between(
      migration,
      'CREATE FUNCTION public.expense_event_assert_integrity',
      'CREATE FUNCTION public.expense_event_integrity_trigger',
    )
    expect(integrity).toContain('v_participant_count <> v_member_count - 1')
    expect(integrity).toContain('pg_catalog.min(participant.position)')
    expect(integrity).toContain('pg_catalog.max(participant.position)')
    expect(integrity).toContain('v_participant_count - 1')
    expect(integrity).toContain('member.user_id IS NOT NULL')
    expect(integrity).toContain("member.role <> 'member'")
    expect(integrity).toContain("member.status <> 'active'")
    expect(integrity).toContain('public.expense_member_invitations')
    expect(integrity).toContain('public.expense_share_collaborators')
    expect(migration).toContain('DEFERRABLE INITIALLY DEFERRED\nFOR EACH ROW EXECUTE FUNCTION public.expense_event_integrity_trigger()')
    expect(migration).toContain('expense_event_roster_frozen')
    expect(migration).toContain('expense_event_invitation_blocked')
    expect(migration).toContain('expense_event_group_integrity_deferred')
    expect(migration).toContain('expense_event_group_integrity_trigger')
  })

  it('accepts only manual names or actor-owned relationship IDs', () => {
    const create = between(
      migration,
      'CREATE FUNCTION public.expense_create_event_context',
      'CREATE FUNCTION public.expense_list_event_contexts',
    )
    expect(create).toContain("participant.value->>'type' = 'guest'")
    expect(create).toContain("participant.value->>'type' = 'relationship'")
    expect(create).toContain("ARRAY['type', 'display_name']")
    expect(create).toContain("ARRAY['type', 'relationship_id']")
    expect(create).toContain('pg_catalog.jsonb_array_length(p_participants) > 49')
    expect(create).toContain("participant.value->>'display_name', '@'")
    expect(create).toContain('relationship.owner_id = p_actor_id')
    expect(create).toContain('relationship.counterpart_user_id <> p_actor_id')
    expect(create).toContain('JOIN auth.users AS account')
    expect(create).toContain('LEFT JOIN public.profiles AS profile')
    expect(create).not.toMatch(/private_display_name|email_canonical|relationship_tags|relationship\.note/)
    expect(create).toContain('expense_event_participant_conflict')
    expect(create).toContain('expense_event_participant_invalid')
  })

  it('keeps selected Teskeið users outside canonical financial membership', () => {
    const create = between(
      migration,
      'CREATE FUNCTION public.expense_create_event_context',
      'CREATE FUNCTION public.expense_list_event_contexts',
    )
    expect(create).toContain("'user_id', NULL")
    expect(create).toContain("'role', 'member'")
    expect(create).toContain("'status', 'active'")
    expect(create).toContain("'linked_user_id', v_linked_user_id")
    expect(create).toContain('INSERT INTO public.expense_event_participants')
    expect(create).not.toMatch(/expense_create_unified_participant_invitation|expense_record_activity|expense_activity_audience|recent_events/)
    expect(postflight).toContain('linked_users_not_financial_members_ok')
    expect(migration).toContain('It grants no financial access')
  })

  it('uses an outer receipt and atomic inner canonical group creation', () => {
    const create = between(
      migration,
      'CREATE FUNCTION public.expense_create_event_context',
      'CREATE FUNCTION public.expense_list_event_contexts',
    )
    expect(create).toContain("'expense_create_event_context'")
    expect(create).toContain('v_canonical_participants')
    expect(create).toContain("'relationshipId', (participant.value->>'relationship_id')::uuid")
    expect(create.indexOf('public.expense_begin_request')).toBeLessThan(
      create.indexOf('FROM public.relationships AS relationship'),
    )
    expect(create).toContain('v_inner_request_id uuid := pg_catalog.gen_random_uuid()')
    expect(create).toContain('v_group_result := public.expense_create_group(')
    expect(create).toContain("NULL,\n    NULL,\n    'ISK',\n    true")
    expect(create).toContain('PERFORM public.expense_event_assert_integrity(v_group_id)')
    expect(create).toContain('public.expense_finish_request')
    expect(create).toContain("jsonb_build_object('event_id', v_group_id)")
  })

  it('returns bounded owner-only DTOs with counts but no linked identity', () => {
    const list = between(
      migration,
      'CREATE FUNCTION public.expense_list_event_contexts',
      'CREATE FUNCTION public.expense_get_event_context',
    )
    const detail = between(
      migration,
      'CREATE FUNCTION public.expense_get_event_context',
      'CREATE FUNCTION public.expense_is_event_context',
    )
    expect(list).toContain('participant_count integer')
    expect(list).toContain('expense_count integer')
    expect(list).toContain("expense.status = 'active'")
    expect(list).toContain('context_row.owner_user_id = p_actor_id')
    expect(list).toContain('LIMIT 100')
    expect(detail).toContain("'member_id', participant.member_id")
    expect(detail).toContain("'display_name', member.display_name")
    expect(detail).toContain("'is_teskeid_user', participant.linked_user_id IS NOT NULL")
    expect(detail).toContain("'position', participant.position")
    for (const projection of [list, detail]) {
      expect(projection).not.toMatch(/'linked_user_id'|'email'|'private_display_name'/)
      expect(projection).not.toMatch(/total_minor|amount_minor|payment_preference/)
    }
  })

  it('keeps the classifier expense-authorized and independent of event entitlement', () => {
    const classifier = between(
      migration,
      'CREATE FUNCTION public.expense_is_event_context',
      '-- SQL97 account cleanup',
    )
    expect(classifier).toContain('public.expense_assert_beta_actor(p_actor_id)')
    expect(classifier).toContain('public.expense_active_member_role(p_actor_id, p_group_id) IS NULL')
    expect(classifier).toContain('RETURN false')
    expect(classifier).toContain('FROM public.expense_event_contexts')
    expect(classifier).not.toContain('expense_event_assert_actor')
    expect(classifier).not.toContain('expense_event_participants')
  })

  it('preserves account-cleanup parity and orders event scrubbing before auth unlink', () => {
    const cleanup = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.expense_prepare_account_deletion',
      'ALTER FUNCTION public.expense_event_valid_label',
    )
    for (const token of [
      'hashtextextended(p_user_id::text, 9601)',
      'hashtextextended(v_email_canonical, 9702)',
      'public.expense_terminalize_member_invitations',
      'hashtextextended(p_user_id::text, 9602)',
      'DELETE FROM public.expense_payment_preferences',
      'DELETE FROM public.recent_events',
      'DELETE FROM public.expense_activity_audience',
      'UPDATE public.expense_group_members',
      "'invitations_scrubbed'",
    ]) expect(cleanup).toContain(token)
    expect(cleanup).toContain("'afmaeli-og-vidburdir'")
    expect(cleanup.indexOf('UPDATE public.expense_event_participants')).toBeLessThan(
      cleanup.indexOf('DELETE FROM public.expense_event_contexts'),
    )
    expect(cleanup.indexOf('DELETE FROM public.expense_event_contexts')).toBeLessThan(
      cleanup.indexOf('UPDATE public.expense_group_members'),
    )
    expect(cleanup).not.toMatch(
      /DELETE FROM public\.(expense_groups|expense_group_members|expenses|expense_activity)(?:\s|;)/,
    )
  })

  it('grants service role only the four event RPCs and existing cleanup entrypoint', () => {
    for (const signature of [
      'expense_create_event_context(uuid,uuid,text,jsonb)',
      'expense_list_event_contexts(uuid)',
      'expense_get_event_context(uuid,uuid)',
      'expense_is_event_context(uuid,uuid)',
      'expense_prepare_account_deletion(uuid)',
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}`)
    }
    for (const internal of [
      'expense_event_valid_label',
      'expense_event_has_beta_access',
      'expense_event_assert_actor',
      'expense_event_assert_integrity',
      'expense_event_integrity_trigger',
      'expense_event_group_integrity_trigger',
      'expense_event_context_immutable',
      'expense_event_participant_immutable',
      'expense_event_roster_frozen',
      'expense_event_invitation_blocked',
    ]) {
      const grantPattern = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${internal}`)
      expect(migration).not.toMatch(grantPattern)
    }
  })

  it('ships read-only fail-closed preflight, postflight and recovery', () => {
    for (const sql of [preflight, postflight, recovery]) {
      expect(sql).toContain('BEGIN;')
      expect(sql).toContain('SET TRANSACTION READ ONLY;')
      expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s/im)
    }
    expect(preflight).toContain('target_slots_clear')
    expect(preflight).toContain('baseline_function_acl_owner_ok')
    expect(preflight).toContain('baseline_private_tables_ok')
    expect(preflight).toContain('member_composite_key_ok')
    expect(preflight).toContain('account_deletion_body_ok')
    expect(preflight).toContain('prerequisites_ok')
    expect(postflight).toContain('rls_force_owner_ok')
    expect(postflight).toContain('no_effective_table_or_column_privileges_ok')
    expect(postflight).toContain('critical_constraints_ok')
    expect(postflight).toContain('critical_indexes_ok')
    expect(postflight).toContain('exact_trigger_bindings_ok')
    expect(postflight).toContain('participant_financial_separation_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(recovery).toContain('forward_only_recovery_instruction')
    expect(recovery).toContain('expense_event_recovery_schema_missing')
    expect(preflight).toContain('FROM pg_catalog.pg_roles AS execution_role')
    expect(preflight).toContain("execution_role.rolname = 'postgres' OR execution_role.rolsuper")
    expect(preflight).not.toContain('AS current_role')
    expect(preflight).toContain("('profiles', 'display_name', 'text', 'NO')")
    expect(preflight).toContain('baseline_schema_mismatches')
    expect(preflight).toContain("'DE' || 'LETE FROM public.expense_payment_preferences'")
    expect(preflight).toContain("'UP' || 'DATE public.expense_group_members'")
    expect(preflight).not.toContain("'DELETE FROM public.expense_payment_preferences'")
    expect(preflight).not.toContain("'UPDATE public.expense_group_members'")
    expect(postflight).toContain("'UP' || 'DATE public.expense_event_participants'")
    expect(postflight).toContain("'DE' || 'LETE FROM public.expense_event_contexts'")
    expect(postflight).toContain("'UP' || 'DATE public.expense_group_members'")
    expect(postflight).toContain("'DE' || 'LETE FROM public.expense_payment_preferences'")
    expect(postflight).not.toMatch(/'(?:DELETE FROM|UPDATE public\.)/)
    expect(postflight).toMatch(
      /'UP' \|\| 'DATE public\.expense_event_participants'\s*\n\s*\) > 0/,
    )
    expect(readme).toContain('preflight → SQL131 migration → postflight → localhost')
    expect(readme).toContain('No SQL in this package was run')
  })
})
