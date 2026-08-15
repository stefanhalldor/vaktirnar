import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'sql/130_booking_custom_workflows.sql'), 'utf8')
const validationRoot = join(root, 'sql/validation/130-booking-custom-workflows')
const preflight = readFileSync(join(validationRoot, 'preflight.sql'), 'utf8')
const postflight = readFileSync(join(validationRoot, 'postflight.sql'), 'utf8')
const recovery = readFileSync(join(validationRoot, 'recovery.sql'), 'utf8')
const readme = readFileSync(join(validationRoot, 'README.md'), 'utf8')

function bodyBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('SQL130 customizable booking workflows', () => {
  it('is one additive transaction with fail-closed SQL126/129 and live-scope guards', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.indexOf('BEGIN;')).toBeLessThan(migration.indexOf('CREATE TABLE'))
    expect(migration.lastIndexOf('COMMIT;')).toBeGreaterThan(migration.lastIndexOf('GRANT EXECUTE'))
    expect(migration).toContain('booking_requests_require_contact_phone')
    expect(migration).toContain('booking_workflow_sql129_contract_drift')
    expect(migration).toContain('booking_workflow_sql129_delegation_drift')
    expect(migration).toContain("COALESCE((v_result ->> 'created')::boolean, false)")
    expect(migration).toContain('booking_workflow_backfill_scope_invalid')
    expect(migration).not.toMatch(/DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+/i)
  })

  it('creates private default-deny workflow storage with exact service identity', () => {
    for (const table of [
      'booking_workflows',
      'booking_workflow_versions',
      'booking_workflow_states',
      'booking_workflow_transitions',
      'booking_workflow_mutations',
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`)
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(migration).toContain(`ALTER TABLE public.${table} OWNER TO postgres`)
    }
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).not.toMatch(/CREATE\s+POLICY/i)
    expect(migration).toContain('service_id_snapshot uuid NOT NULL')
    expect(migration).toContain('booking_workflows_scope_service_id_key')
    expect(migration).toContain('FOREIGN KEY (space_id, business_profile_id, id, workflow_id)')
    expect(migration).toContain('AND service_id = service_id_snapshot')
  })

  it('keeps lifecycle status separate and pins every request to a published graph state', () => {
    expect(migration).not.toMatch(/ALTER\s+COLUMN\s+status/i)
    expect(migration).toContain("workflow_version_status text NOT NULL DEFAULT 'published'")
    expect(migration).toContain("workflow_version_status = 'published'")
    expect(migration).toContain('booking_requests_workflow_version_fk')
    expect(migration).toContain('booking_requests_workflow_state_fk')
    expect(migration).toContain('booking_requests_workflow_live_scope_check')
    expect(migration).toContain('BEFORE INSERT ON public.booking_requests')
    expect(migration).toContain('NEW.service_id_snapshot IS DISTINCT FROM NEW.service_id')
    expect(migration).toContain('FOR SHARE OF state, version_row')
  })

  it('provisions and validates the frozen default graph and editor limits', () => {
    for (const key of [
      'new_request', 'under_review', 'waiting_customer', 'waiting_provider', 'confirmed',
    ]) expect(migration).toContain(`'${key}'`)
    expect(migration).toContain('sort_order BETWEEN 0 AND 19')
    expect(migration).toContain('v_state_count NOT BETWEEN 1 AND 20')
    expect(migration).toContain('v_edge_count > 100')
    expect(migration).toContain('v_initial_count <> 1')
    expect(migration).toContain('v_confirmed_count <> 1')
    expect(migration).toContain('v_reachable_count <> v_state_count')
    expect(migration).toContain("source.semantic_kind = 'confirmed'")
    expect(migration).toContain('booking_workflow_transitions_no_self_check')
    expect(migration).toContain('booking_workflow_versions_one_draft_idx')
    expect(migration).toContain("provider_label !~ '[<>`*_#~()]'")
    expect(migration).toContain("customer_label !~ '[<>`*_#~()]'")
    expect(migration).toContain("pg_catalog.strpos(provider_label, '[') = 0")
    expect(migration).toContain("pg_catalog.strpos(customer_label, ']') = 0")
  })

  it('keeps published versions immutable and cannot move published graph rows into drafts', () => {
    const graphGuard = bodyBetween(
      migration,
      'CREATE FUNCTION public.booking_workflow_graph_mutable()',
      'CREATE FUNCTION public.booking_workflow_mutation_immutable()',
    )
    expect(migration).toContain('booking_workflow_published_immutable')
    expect(graphGuard).toContain("TG_OP = 'UPDATE'")
    expect(graphGuard).toContain('OLD.workflow_version_id IS DISTINCT FROM NEW.workflow_version_id')
    expect(graphGuard).toContain("v_status <> 'draft'")
    expect(migration).toContain('booking_workflow_versions_immutable_guard')
    expect(migration).toContain('booking_workflow_states_mutable_guard')
    expect(migration).toContain('booking_workflow_transitions_mutable_guard')
  })

  it('uses TS-aligned RPC argument names and durable replay-before-auth receipts', () => {
    expect(migration).toContain('p_expected_workflow_revision integer')
    expect(migration.match(/p_expected_version_revision integer/g)).toHaveLength(2)
    expect(migration).toContain('p_requested_reason text')
    expect(migration).toContain('p_state_logical_key text')
    expect(migration).toContain('booking_workflow_mutations_idempotency_key')
    expect(migration).toContain('operation_fingerprint')
    for (const functionName of [
      'booking_provider_ensure_workflow_draft',
      'booking_provider_save_workflow_draft',
      'booking_provider_publish_workflow_draft',
    ]) {
      const nextMarker = functionName === 'booking_provider_ensure_workflow_draft'
        ? 'CREATE FUNCTION public.booking_workflow_graph_fingerprint'
        : functionName === 'booking_provider_save_workflow_draft'
          ? 'CREATE FUNCTION public.booking_provider_publish_workflow_draft'
          : 'CREATE FUNCTION public.booking_transition_request'
      const body = bodyBetween(migration, `CREATE FUNCTION public.${functionName}`, nextMarker)
      expect(body.indexOf('FROM public.booking_workflow_mutations')).toBeLessThan(
        body.indexOf('NOT public.booking_provider_allowed'),
      )
      expect(body).toContain('v_service.archived_at IS NOT NULL')
      expect(body).toContain("RAISE EXCEPTION 'booking_not_found'")
    }
  })

  it('enforces provider transitions and the typed terminal cancellation matrix', () => {
    const transition = bodyBetween(
      migration,
      'CREATE FUNCTION public.booking_transition_request',
      'CREATE FUNCTION public.booking_cancel_request_with_reason',
    )
    const cancel = bodyBetween(
      migration,
      'CREATE FUNCTION public.booking_cancel_request_with_reason',
      'CREATE OR REPLACE FUNCTION public.booking_request_projection',
    )
    expect(transition).toContain("v_access.access_kind <> 'provider'")
    expect(transition).toContain('booking_workflow_transitions AS edge')
    expect(transition).toContain("'workflow_state_changed'")
    expect(cancel).toContain("'customer_cancelled', 'provider_unavailable', 'other'")
    expect(cancel).toContain("v_access.member_role = 'owner'")
    expect(cancel).toContain("v_actor_kind = 'guest'")
    expect(cancel).toContain("v_actor_kind = 'provider'")
    expect(cancel).toMatch(/IS DISTINCT FROM \(\s*CASE\s+WHEN v_actor_kind/)
    expect(cancel).not.toMatch(/IS DISTINCT FROM CASE/)
    expect(cancel).not.toMatch(/legacy_unspecified'\s*\)/)
    expect(migration).toContain('cancellation_reason IS NOT NULL')
    expect(migration).toContain("'legacy_unspecified'")
    expect(migration).toContain('request_row.revision + 1')
  })

  it('keeps customer projections free of workflow identifiers and provider targets', () => {
    const projection = bodyBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.booking_request_projection',
      'CREATE OR REPLACE FUNCTION public.booking_list_events',
    )
    const customerProjection = bodyBetween(
      projection,
      '-- Customer/member/guest projections deliberately contain no workflow,',
      'END IF;',
    )
    expect(customerProjection).toContain("'systemLabelKey'")
    expect(customerProjection).toContain("'label'")
    expect(customerProjection).toContain("'attentionSide'")
    expect(customerProjection).toContain("'semanticKind'")
    expect(customerProjection).not.toMatch(/workflowId|versionId|stateId|logicalKey|allowed/i)
    expect(projection).toContain("THEN v_allowed_targets ELSE '[]'::jsonb")

    const events = bodyBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.booking_list_events',
      'CREATE OR REPLACE FUNCTION public.booking_provider_list_services',
    )
    const customerEvent = bodyBetween(
      events,
      "ELSE pg_catalog.jsonb_build_object(\n          'from'",
      'END\n    ) ORDER BY',
    )
    expect(customerEvent).not.toMatch(/versionId|stateId|logicalKey/)
    expect(customerEvent).toContain("'systemLabelKey'")
  })

  it('returns identical workflow service projections and exact provider filters', () => {
    const serviceList = bodyBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.booking_provider_list_services',
      'CREATE FUNCTION public.booking_provider_list_requests',
    )
    const upsert = bodyBetween(
      migration,
      'CREATE OR REPLACE FUNCTION public.booking_upsert_service',
      'ALTER TABLE public.booking_workflows OWNER TO postgres',
    )
    for (const field of ['id', 'revision', 'activeVersionId', 'activeVersionNumber']) {
      expect(serviceList).toContain(`'${field}'`)
      expect(upsert).toContain(`'${field}'`)
    }
    expect(migration).toContain("'items', v_items")
    expect(migration).toContain("'states', v_state_facets")
    expect(migration).toContain("'attention', v_attention_facets")
    expect(migration).toContain("request_row.status = 'requested'")
  })

  it('grants only exact app RPCs and revokes both SQL125 bypass signatures', () => {
    expect(migration).toContain('ALTER FUNCTION public.booking_workflow_graph_projection(uuid) OWNER TO postgres')
    expect(migration).toContain('public.booking_cancel_request(uuid,uuid,text,integer,uuid)')
    expect(migration).toContain(
      'public.booking_provider_list_requests(\n  uuid,uuid,uuid,timestamp with time zone,uuid,integer',
    )
    expect(migration).toContain('TO service_role;')
    const grant = bodyBetween(migration, 'GRANT EXECUTE ON FUNCTION', 'TO service_role;')
    expect(grant).toContain('booking_provider_read_workflow')
    expect(grant).toContain('booking_cancel_request_with_reason')
    expect(grant).not.toContain('booking_workflow_graph_projection')
    expect(grant).not.toContain('booking_provision_default_workflow')
  })

  it('ships fail-closed read-only pre/post/recovery gates and exact run order', () => {
    for (const sql of [preflight, postflight, recovery]) {
      expect(sql).toContain('BEGIN;')
      expect(sql).toContain('SET TRANSACTION READ ONLY;')
      expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\s/im)
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('sql129_functions_ok')
    expect(preflight).toContain('baseline_private_tables_ok')
    expect(preflight).toContain('baseline_function_acl_owner_ok')
    expect(preflight).toContain('null_scope')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('sql130_function_acl_owner_ok')
    expect(postflight).toContain('old_callable_bypasses_revoked_ok')
    expect(postflight).toContain('no_unexpected_sensitive_overloads_ok')
    expect(postflight).toContain('critical_constraints_ok')
    expect(postflight).toContain('critical_partial_unique_indexes_ok')
    expect(postflight).toContain('sql129_chain_ok')
    expect(recovery).toContain('forward_only_recovery_instruction')
    expect(readme).toContain('preflight → SQL130 migration →')
    expect(readme).toContain('postflight → localhost')
    expect(readme).toContain('No SQL in this package was run')
  })
})
