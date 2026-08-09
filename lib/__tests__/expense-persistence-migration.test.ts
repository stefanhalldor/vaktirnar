import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'sql/96_expenses_core.sql'),
  'utf8',
)

const pendingSql95 = readFileSync(
  join(process.cwd(), 'sql/95_teskeid_agent_collaboration.sql'),
  'utf8',
)

const TABLES = [
  'expense_groups',
  'expense_group_members',
  'expenses',
  'expense_payments',
  'expense_shares',
  'expense_obligations',
  'expense_repayments',
  'expense_repayment_allocations',
  'expense_activity',
  'expense_activity_audience',
  'expense_payment_preferences',
  'expense_payment_preference_assignments',
  'expense_mutation_requests',
] as const

const RPCS = [
  'expense_create_group',
  'expense_create_expense',
  'expense_add_group_member',
  'expense_respond_group_invitation',
  'expense_leave_group',
  'expense_remove_group_member',
  'expense_cancel_expense',
  'expense_set_group_status',
  'expense_report_repayment',
  'expense_transition_repayment',
  'expense_save_payment_preference',
  'expense_deactivate_payment_preference',
  'expense_resolve_payment_instruction',
  'expense_resolve_recent_targets',
  'expense_prepare_account_deletion',
] as const

function functionBody(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + marker.length)
  return sql.slice(start, next < 0 ? sql.length : next)
}

function fingerprintBlock(name: string): string {
  const body = functionBody(name)
  const start = body.indexOf('v_fingerprint := md5(jsonb_build_object(')
  const end = body.indexOf('v_replay := public.expense_begin_request', start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return body.slice(start, end)
}

describe('sql/96_expenses_core.sql — migration boundary and schema', () => {
  it('is transactional and widens the live feature union without replacing it', () => {
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
    expect(sql).toContain('pg_catalog.pg_get_expr(constraint_row.conbin')
    expect(sql).toContain("v_expression NOT LIKE '%utlagt-og-endurgreitt%'")
    expect(sql).toContain('CHECK ((%s) OR feature_key = %L)')
    expect(sql).toContain("'utlagt-og-endurgreitt'")
    expect(sql).toContain('SQL96 as a whole must not be rerun after SQL97')
  })

  it('keeps the expense entitlement valid if pending migration 95 runs later', () => {
    const featureBlock = pendingSql95.slice(0, pendingSql95.indexOf('-- Conversations'))

    expect(featureBlock).toContain('feature_access_feature_key_check')
    expect(featureBlock).toContain("'agent-collaboration-private-beta'")
    expect(featureBlock).toContain("'utlagt-og-endurgreitt'")
  })

  it('creates every dedicated persistence table idempotently', () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table}\\b`,
        'i',
      ))
    }
  })

  it('models one-offs as groups and keeps durable nullable auth links', () => {
    expect(sql).toMatch(/expense_groups_kind_check[\s\S]{0,100}'group'[\s\S]{0,40}'one_off'/i)
    expect(sql).toMatch(/user_id\s+uuid\s+NULL\s+REFERENCES auth\.users\(id\) ON DELETE SET NULL/i)
    expect(sql).toMatch(/status IN \('invited', 'active', 'declined', 'removed', 'left'\)/i)
    expect(sql).toMatch(/CASE WHEN v_user_id = p_actor_id OR v_user_id IS NULL THEN 'active' ELSE 'invited' END/i)
    expect(functionBody('expense_create_expense')).toContain("v_group_id, 'one_off'")
    expect(functionBody('expense_create_expense')).toMatch(
      /WHEN v_member->>'user_id' = p_actor_id::text THEN p_actor_id[\s\S]{0,80}ELSE NULL/i,
    )
  })

  it('bounds money, currencies, split methods, and list sizes', () => {
    expect(sql).toContain('9007199254740991')
    expect(sql).toMatch(/currency ~ '\^\[A-Z\]\{3\}\$'/)
    for (const method of [
      'equal',
      'percentage',
      'fixed',
      'mixed_equal_remainder',
      'mixed_percentage_remainder',
      'weighted',
    ]) {
      expect(sql).toContain(`'${method}'`)
    }
    expect(functionBody('expense_create_group')).toContain(
      'jsonb_array_length(p_members) NOT BETWEEN 1 AND 50',
    )
    expect(functionBody('expense_create_expense')).toContain(
      'jsonb_array_length(p_payments) NOT BETWEEN 1 AND 50',
    )
  })

  it('enforces same-group integrity for every financial edge', () => {
    for (const constraint of [
      'expense_payments_group_expense_fk',
      'expense_payments_group_member_fk',
      'expense_shares_group_expense_fk',
      'expense_shares_group_member_fk',
      'expense_obligations_group_from_member_fk',
      'expense_obligations_group_to_member_fk',
      'expense_repayments_group_from_member_fk',
      'expense_repayments_group_to_member_fk',
      'expense_repayment_allocations_group_repayment_fk',
      'expense_repayment_allocations_group_obligation_fk',
    ]) {
      expect(sql).toContain(`CONSTRAINT ${constraint}`)
    }
  })

  it('adds immutable activity ordering and bounded typed summaries', () => {
    expect(sql).toMatch(/sequence_no\s+bigint\s+GENERATED ALWAYS AS IDENTITY UNIQUE/i)
    expect(sql).toContain("'payment_preference'")
    expect(sql).toMatch(/expense_activity_summary_code_check[\s\S]{0,180}BETWEEN 1 AND 80/i)
    expect(sql).toContain("'expense_payment_preference_saved'")
    expect(sql).toContain("'expense_payment_preference_deactivated'")
  })
})

describe('sql/96_expenses_core.sql — default-deny access', () => {
  it('enables RLS, revokes every direct client privilege, and defines no client policy', () => {
    for (const table of TABLES) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(
        `REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
      )
      expect(sql).not.toMatch(new RegExp(
        `GRANT\\s+[^;]*ON\\s+public\\.${table}[^;]*TO\\s+(?:anon|authenticated)`,
        'i',
      ))
      expect(sql).not.toMatch(new RegExp(
        `GRANT\\s+[^;]*(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON\\s+public\\.${table}[^;]*TO\\s+service_role`,
        'i',
      ))
    }
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })

  it('makes every externally callable expense RPC service-role-only', () => {
    for (const rpc of RPCS) {
      const body = functionBody(rpc)
      expect(body).toContain('SECURITY DEFINER')
      expect(body).toContain("SET search_path = ''")
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\([\\s\\S]*?\\)\\s+FROM PUBLIC, anon, authenticated;`,
      ))
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([\\s\\S]*?\\)\\s+TO service_role;`,
      ))
      expect(sql).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^;]*TO (?:anon|authenticated)`,
        'i',
      ))
    }
  })

  it('repeats canonical-email feature entitlement inside mutations', () => {
    const access = functionBody('expense_has_beta_access')
    const begin = functionBody('expense_begin_request')
    expect(access).toContain('public.normalize_email_canonical(access.email)')
    expect(access).toContain("access.feature_key = 'utlagt-og-endurgreitt'")
    expect(begin).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(begin).toContain('public.expense_has_beta_access(p_actor_id)')
  })
})

describe('sql/96_expenses_core.sql — atomicity and settlement authority', () => {
  it('provides payload-bound idempotency with conflict detection and bounded results', () => {
    const begin = functionBody('expense_begin_request')
    const finish = functionBody('expense_finish_request')
    expect(sql).toContain('PRIMARY KEY (actor_user_id, request_id)')
    expect(begin).toContain('ON CONFLICT (actor_user_id, request_id) DO NOTHING')
    expect(begin).toContain("RAISE EXCEPTION 'expense_idempotency_conflict'")
    expect(begin).toContain('v_existing.fingerprint <> p_fingerprint')
    expect(finish).toContain('completed_at = now()')
    for (const rpc of RPCS.slice(0, 12)) {
      expect(functionBody(rpc)).toContain('expense_begin_request')
      expect(functionBody(rpc)).toContain('expense_finish_request')
    }
  })

  it('canonicalizes generated IDs without dropping semantic payload changes', () => {
    const createGroup = functionBody('expense_create_group')
    const createGroupFingerprint = fingerprintBlock('expense_create_group')
    expect(createGroup).toContain('INTO v_canonical_members')
    expect(createGroup).toContain("'guestDisplayName'")
    expect(createGroupFingerprint).toContain("'members', v_canonical_members")
    expect(createGroupFingerprint).not.toContain("'members', p_members")
    for (const field of ['name', 'description', 'emoji', 'currency', 'includeCreator']) {
      expect(createGroupFingerprint).toContain(`'${field}'`)
    }

    const createExpense = functionBody('expense_create_expense')
    const createExpenseFingerprint = fingerprintBlock('expense_create_expense')
    expect(createExpense).toContain("'memberOrdinal', member.ordinal")
    expect(createExpense).toContain('INTO v_canonical_payments')
    expect(createExpense).toContain('INTO v_canonical_shares')
    expect(createExpenseFingerprint).not.toContain("'expenseId'")
    expect(createExpenseFingerprint).not.toContain("'oneOffMembers', p_one_off_members")
    for (const field of [
      'title', 'totalMinor', 'currency', 'incurredOn', 'category', 'note',
      'splitMethod', 'payments', 'shares',
    ]) {
      expect(createExpenseFingerprint).toContain(`'${field}'`)
    }

    const addMemberFingerprint = fingerprintBlock('expense_add_group_member')
    expect(addMemberFingerprint).not.toContain("'memberId'")
    expect(addMemberFingerprint).toContain("'groupId'")
    expect(addMemberFingerprint).toContain("'userId'")
    expect(addMemberFingerprint).toContain("'guestDisplayName'")

    const preferenceFingerprint = fingerprintBlock('expense_save_payment_preference')
    expect(preferenceFingerprint).toContain('WHEN p_expected_version IS NULL THEN NULL')
    for (const field of [
      'expectedVersion', 'title', 'kind', 'supportedCurrencies',
      'details', 'visibility', 'assignment',
    ]) {
      expect(preferenceFingerprint).toContain(`'${field}'`)
    }
  })

  it('never trusts or persists client obligations during expense creation', () => {
    const create = functionBody('expense_create_expense')
    expect(create).toContain("'obligationsContract', 'ignored_server_rederived'")
    expect(create).toContain('p_obligations is retained only for RPC compatibility')
    expect(create).toMatch(
      /item \?& ARRAY\[[\s\S]{0,180}'from_member_id'[\s\S]{0,180}'to_member_id'[\s\S]{0,180}'amount_minor'[\s\S]{0,180}'currency'/,
    )
    expect(create).not.toMatch(/INSERT INTO public\.expense_obligations/i)
    expect(create).toContain('v_payment_sum <> p_total_minor OR v_share_sum <> p_total_minor')
  })

  it('locks the group, checks CAS, and rederives deterministic available settlement', () => {
    const report = functionBody('expense_report_repayment')
    const groupLock = report.indexOf('FOR UPDATE;')
    const versionCheck = report.indexOf('v_group.financial_version <> p_expected_financial_version')
    const settlement = report.indexOf('public.expense_simplified_settlement')
    const obligation = report.indexOf('INSERT INTO public.expense_obligations')
    expect(groupLock).toBeGreaterThanOrEqual(0)
    expect(versionCheck).toBeGreaterThan(groupLock)
    expect(settlement).toBeGreaterThan(versionCheck)
    expect(obligation).toBeGreaterThan(settlement)
    expect(report).toContain('p_amount_minor > v_available')
    expect(report).toContain('v_from.user_id IS NULL')
    expect(report).toContain("coalesce(v_role, '') IN ('owner', 'admin')")
    expect(functionBody('expense_simplified_settlement')).toContain(
      'ORDER BY -balance.amount_minor DESC, balance.member_id',
    )
  })

  it('reserves reported transfers but applies only confirmed repayments to the ledger', () => {
    const balances = functionBody('expense_group_balances')
    expect(balances).toContain("repayment.status = 'confirmed'")
    expect(balances).toContain("p_include_reported AND repayment.status = 'reported'")
    expect(functionBody('expense_report_repayment')).toContain(
      "'reported', p_actor_id, v_snapshot",
    )
    expect(functionBody('expense_transition_repayment')).toContain(
      "IF v_repayment.status <> 'reported'",
    )
  })

  it('rejects null lifecycle actions instead of falling through to destructive defaults', () => {
    expect(functionBody('expense_respond_group_invitation')).toContain(
      "p_action IS NULL OR p_action NOT IN ('accept', 'decline')",
    )
    expect(functionBody('expense_set_group_status')).toContain(
      "p_status IS NULL OR p_status NOT IN ('settling', 'settled')",
    )
    expect(functionBody('expense_transition_repayment')).toContain(
      "p_action IS NULL OR p_action NOT IN ('confirm', 'reject', 'cancel')",
    )
  })

  it('makes confirmed repayment terminal and increments the group version on status changes', () => {
    const transition = functionBody('expense_transition_repayment')
    expect(transition).toContain('Confirmed is terminal')
    expect(transition).not.toMatch(/status\s*=\s*'confirmed'[\s\S]{0,120}'cancelled'/i)
    expect(transition).toContain('financial_version = group_row.financial_version + 1')
  })
})

describe('sql/96_expenses_core.sql — payment privacy and activity projection', () => {
  it('strictly allowlists and bounds payment fields, including HTTPS links', () => {
    const details = functionBody('expense_valid_payment_details')
    for (const key of [
      'accountNumber',
      'nationalId',
      'phoneNumber',
      'paymentLink',
      'instructions',
      'defaultReference',
    ]) {
      expect(details).toContain(`'${key}'`)
    }
    expect(details).toContain("item.key = 'paymentLink'")
    expect(details).toContain("!~ '^https://'")
    expect(sql).toContain('expense_valid_payment_snapshot(payment_preference_snapshot)')
  })

  it('uses optimistic CAS for save/deactivate and never snapshots private details', () => {
    const save = functionBody('expense_save_payment_preference')
    const deactivate = functionBody('expense_deactivate_payment_preference')
    const report = functionBody('expense_report_repayment')
    expect(save).toContain('p_expected_version bigint')
    expect(save).toContain('FOR UPDATE;')
    expect(save).toContain('v_existing.version <> p_expected_version')
    expect(save).toContain('v_existing.version + 1')
    expect(deactivate).toContain('v_preference.version <> p_expected_version')
    expect(deactivate).toContain('SET active = false')
    expect(report).toContain("preference.visibility = 'debt_context'")
    expect(report).not.toContain("preference.visibility = 'private'")
  })

  it('serializes preference snapshots with edits and excludes admin-managed guest debtors', () => {
    const report = functionBody('expense_report_repayment')
    const save = functionBody('expense_save_payment_preference')
    const deactivate = functionBody('expense_deactivate_payment_preference')
    const cleanup = functionBody('expense_prepare_account_deletion')
    const ownerLock = 'pg_catalog.hashtextextended(p_actor_id::text, 9602)'

    expect(report).toContain(
      'IF v_to.user_id IS NOT NULL AND v_from.user_id = p_actor_id THEN',
    )
    expect(report).toContain(
      'pg_catalog.hashtextextended(v_to.user_id::text, 9602)',
    )
    expect(report.indexOf('FOR UPDATE;')).toBeLessThan(
      report.indexOf('pg_catalog.hashtextextended(v_to.user_id::text, 9602)'),
    )
    expect(report.indexOf('pg_catalog.hashtextextended(v_to.user_id::text, 9602)')).toBeLessThan(
      report.indexOf('SELECT assignment.preference_id'),
    )

    for (const body of [save, deactivate]) {
      expect(body).toContain(ownerLock)
      expect(body.indexOf('expense_begin_request')).toBeLessThan(body.indexOf(ownerLock))
      expect(body.indexOf(ownerLock)).toBeLessThan(body.indexOf('FOR UPDATE;'))
    }

    expect(cleanup).toContain('pg_catalog.hashtextextended(p_user_id::text, 9602)')
    expect(cleanup.indexOf('FOR UPDATE OF group_row')).toBeLessThan(
      cleanup.indexOf('pg_catalog.hashtextextended(p_user_id::text, 9602)'),
    )
    expect(cleanup.indexOf('pg_catalog.hashtextextended(p_user_id::text, 9602)')).toBeLessThan(
      cleanup.indexOf('DELETE FROM public.expense_payment_preferences'),
    )
  })

  it('rejects a scoped assignment outside the preference currency allowlist', () => {
    const save = functionBody('expense_save_payment_preference')
    expect(save).toContain('v_currency IS NOT NULL')
    expect(save).toContain('p_supported_currencies IS NOT NULL')
    expect(save).toContain('NOT (v_currency = ANY(p_supported_currencies))')
    expect(save).toContain("RAISE EXCEPTION 'expense_payment_assignment_invalid'")
  })

  it('provides a fail-closed service boundary for current payment instructions', () => {
    const resolver = functionBody('expense_resolve_payment_instruction')
    expect(resolver).toMatch(
      /expense_resolve_payment_instruction\(\s*p_actor_id uuid,\s*p_group_id uuid,\s*p_from_member_id uuid,\s*p_to_member_id uuid,\s*p_currency text\s*\)\s*RETURNS jsonb/i,
    )
    expect(resolver).toContain("v_group.status NOT IN ('active', 'settling')")
    expect(resolver).toContain("member.status = 'active'")
    expect(resolver).toContain('v_from.user_id IS DISTINCT FROM p_actor_id')
    expect(resolver).toContain('v_to.user_id IS NULL')
    expect(resolver).toContain('public.expense_has_beta_access(v_to.user_id)')
    expect(resolver).toContain('public.expense_simplified_settlement(')
    expect(resolver).toContain('settlement.from_member_id = p_from_member_id')
    expect(resolver).toContain('settlement.to_member_id = p_to_member_id')
    expect(resolver).toContain('settlement.amount_minor > 0')

    const groupLock = resolver.indexOf('FOR SHARE;')
    const ownerLock = resolver.indexOf(
      'pg_catalog.hashtextextended(v_to.user_id::text, 9602)',
    )
    const assignmentRead = resolver.indexOf('SELECT assignment.preference_id')
    expect(groupLock).toBeGreaterThanOrEqual(0)
    expect(ownerLock).toBeGreaterThan(groupLock)
    expect(assignmentRead).toBeGreaterThan(ownerLock)
  })

  it('uses exact scope precedence and never falls back after a matched suppression', () => {
    const resolver = functionBody('expense_resolve_payment_instruction')
    const assignmentRead = resolver.slice(
      resolver.indexOf('SELECT assignment.preference_id'),
      resolver.indexOf('SELECT preference.*'),
    )
    expect(assignmentRead).toContain("assignment.scope_type = 'group_currency'")
    expect(assignmentRead).toContain("assignment.scope_type = 'currency'")
    expect(assignmentRead).toContain("assignment.scope_type = 'general'")
    expect(assignmentRead).toMatch(
      /WHEN 'group_currency' THEN 1[\s\S]*WHEN 'currency' THEN 2[\s\S]*ELSE 3/,
    )
    expect(assignmentRead).toContain('LIMIT 1')
    expect(resolver).toContain('IF v_preference_id IS NULL THEN')
    expect(resolver).toContain('OR NOT v_preference.active')
    expect(resolver).toContain("v_preference.visibility <> 'debt_context'")
    expect(resolver).toContain(
      'NOT (p_currency = ANY(v_preference.supported_currencies))',
    )
  })

  it('returns only the bounded payment-snapshot envelope and per-kind details', () => {
    const resolver = functionBody('expense_resolve_payment_instruction')
    expect(resolver).toContain('PAYMENT_DETAIL_KEYS_BY_KIND')
    for (const key of [
      'accountNumber', 'nationalId', 'phoneNumber', 'paymentLink',
      'instructions', 'defaultReference',
    ]) {
      expect(resolver).toContain(`'${key}'`)
    }

    const snapshot = resolver.slice(
      resolver.indexOf('v_snapshot := jsonb_build_object('),
      resolver.indexOf('IF NOT public.expense_valid_payment_snapshot',
        resolver.indexOf('v_snapshot := jsonb_build_object(')),
    )
    for (const key of [
      'title', 'kind', 'currency', 'details', 'visibility', 'captured_at',
      'owner_user_id', 'source_preference_id', 'source_version',
    ]) {
      expect(snapshot).toContain(`'${key}'`)
    }
    expect(snapshot).toContain("'visibility', 'debt_context'")
    expect(snapshot).not.toMatch(/'amount|'note|'email/i)
    expect(resolver).toContain('public.expense_valid_payment_snapshot(v_snapshot)')
  })

  it('writes sanitized recent payloads and keeps preference audit activity-only', () => {
    const activity = functionBody('expense_record_activity')
    const payloadStart = activity.indexOf('v_payload := jsonb_strip_nulls')
    const payloadEnd = activity.indexOf('INSERT INTO public.recent_events', payloadStart)
    const payload = activity.slice(payloadStart, payloadEnd)
    expect(payload).toContain("'expenseTitle'")
    expect(payload).toContain("'groupTitle'")
    expect(payload).toContain("'actorUserId'")
    expect(payload).not.toMatch(/amount|note|email|payment|member(?:s|_ids)/i)

    for (const name of [
      'expense_save_payment_preference',
      'expense_deactivate_payment_preference',
    ]) {
      const body = functionBody(name)
      expect(body).toMatch(/ARRAY\[p_actor_id\], false/)
      expect(body).not.toContain('INSERT INTO public.recent_events')
    }
  })

  it('uses one timestamp and a transactionally snapshotted, feature-gated audience', () => {
    const activity = functionBody('expense_record_activity')
    expect(activity).toContain('v_created_at timestamptz := now()')
    expect(activity).toMatch(/group_title, created_at[\s\S]{0,300}v_created_at/i)
    expect(activity).toMatch(/payload, href, occurred_at, ack_at[\s\S]{0,500}v_created_at/i)
    expect(activity).toContain("member.status = 'active'")
    expect(activity).toContain("p_event_type <> 'expense_group_invitation_received'")
    expect(activity).toContain('unnest(coalesce(p_extra_user_ids')
    expect(activity).toContain('public.expense_has_beta_access(recipient.user_id)')
  })

  it('preserves loans while adding the expense recent-event source', () => {
    expect(sql).toMatch(/recent_events_source_check[\s\S]{0,100}source IN \('loans', 'expenses'\)/i)
    const activity = functionBody('expense_record_activity')
    expect(activity).toContain("'expenses:activity:' || v_activity_id::text")
    expect(activity).toContain('ON CONFLICT (user_id, event_key) DO NOTHING')
  })
})

describe('sql/96_expenses_core.sql — current authorization and erasure', () => {
  it('resolves invitations through consent, then canonicalizes accepted access', () => {
    const resolver = functionBody('expense_resolve_recent_targets')
    expect(resolver).toContain('cardinality(p_activity_ids) > 100')
    expect(resolver).toContain('public.expense_activity_audience AS audience')
    expect(resolver).toContain("membership.status IN ('invited', 'active')")
    expect(resolver).toContain("activity.entity_type = 'expense_group_invitation'")
    expect(resolver).toContain("activity.entity_type <> 'expense_group_invitation'")
    expect(resolver).toContain("WHEN 'invited' THEN")
    expect(resolver).toContain('/auth-mvp/utlagt-og-endurgreitt/bod/')
    expect(resolver).toContain("AND membership.status = 'active'")
    expect(resolver).toContain("activity.entity_type <> 'payment_preference'")
    expect(resolver).toContain('/auth-mvp/utlagt-og-endurgreitt/hopar/')
    expect(resolver).not.toMatch(/membership\.status IN \([^)]*'(?:declined|removed|left)'/)
  })

  it('removes private data while preserving shared ledger rows for account deletion', () => {
    const cleanup = functionBody('expense_prepare_account_deletion')
    expect(cleanup).toContain("access.feature_key = 'utlagt-og-endurgreitt'")
    expect(cleanup).toContain('SET payment_preference_snapshot = NULL')
    expect(cleanup).toContain('DELETE FROM public.expense_payment_preferences')
    expect(cleanup).toContain('DELETE FROM public.recent_events')
    expect(cleanup).toContain('SET user_id = NULL')
    expect(cleanup).not.toMatch(
      /DELETE FROM public\.(?:expense_groups|expense_group_members|expenses|expense_payments|expense_shares|expense_obligations|expense_repayments|expense_repayment_allocations|expense_activity)\b/i,
    )
  })
})
