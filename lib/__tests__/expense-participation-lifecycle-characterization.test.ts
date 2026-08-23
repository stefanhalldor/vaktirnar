import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const sql105 = readFileSync(
  join(root, 'sql/105_expense_edit_member_reference_fix.sql'),
  'utf8',
)
const sql108 = readFileSync(
  join(root, 'sql/108_relationship_labels_circles_expense_context.sql'),
  'utf8',
)
const sql141 = readFileSync(
  join(root, 'sql/141_expense_canonical_identity_and_claim_disputes.sql'),
  'utf8',
)
const actions = readFileSync(join(root, 'lib/expenses/actions.ts'), 'utf8')
const topLevelExpenseSql = readdirSync(join(root, 'sql'))
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .map((name) => readFileSync(join(root, 'sql', name), 'utf8'))
  .join('\n')

function functionBody(source: string, name: string) {
  const signatureIndex = source.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`),
  )
  expect(signatureIndex, name).toBeGreaterThanOrEqual(0)
  const sourceAfterSignature = source.slice(signatureIndex)
  const delimiterMatch = /\bAS\s+(\$[a-z0-9_]*\$)\r?\n/i.exec(sourceAfterSignature)
  expect(delimiterMatch, `${name} delimiter`).not.toBeNull()
  const delimiter = delimiterMatch![1]
  const bodyStart = signatureIndex + delimiterMatch!.index + delimiterMatch![0].length
  const bodyEnd = source.indexOf(`${delimiter};`, bodyStart)
  expect(bodyEnd, `${name} end`).toBeGreaterThan(bodyStart)
  return source.slice(bodyStart, bodyEnd)
}

describe('current Expense participation and identity boundaries', () => {
  it('binds a verified Relationship identity onto the same active durable member', () => {
    const createBody = functionBody(sql141, 'expense_create_expense_with_participants')
    const bindingBody = functionBody(sql141, 'expense_apply_identity_binding')

    expect(createBody).toContain("v_target_user_id, 'relationship'")
    expect(createBody).toContain('(v_item->>\'member_id\')::uuid')
    expect(bindingBody).toContain('WHERE member.group_id = p_group_id AND member.id = p_member_id')
    expect(bindingBody).toContain('SET user_id = p_target_user_id,')
    expect(bindingBody).toContain("status = 'active'")
    expect(bindingBody).toContain('INSERT INTO public.expense_member_identity_bindings')
  })

  it('creates manual-name or email financial members active before any identity claim', () => {
    const body = functionBody(sql141, 'expense_add_participant')

    expect(body).toContain('v_result := public.expense_add_group_member(')
    expect(body).toContain("'display_name', p_member->>'display_name', 'status', 'active'")
    expect(body).toContain('ELSIF p_recipient_email IS NOT NULL THEN')
    expect(body).toContain('public.expense_create_unified_participant_invitation(')
    expect(body.indexOf('expense_add_group_member')).toBeLessThan(
      body.indexOf('expense_create_unified_participant_invitation'),
    )
  })

  it('keeps email identity acceptance and decline on the existing member without deleting financial truth', () => {
    const body = functionBody(sql105, 'expense_respond_member_invitation')

    expect(body).toContain("IF p_action = 'decline' THEN")
    expect(body).toContain("ARRAY[p_invitation_id], 'declined'")
    expect(body).toContain('WHERE member.id = v_member_id AND member.group_id = v_group_id')
    expect(body).toContain('SET user_id = p_actor_id,')
    expect(body).toContain("status = 'active'")
    expect(body).not.toContain('DELETE FROM public.expense_group_members')
    expect(body).not.toContain('INSERT INTO public.expense_group_members')
  })

  it('documents current legacy circle exact-expense invited state pending Phase 6', () => {
    const body = functionBody(sql108, 'expense_create_expense_with_circle_context')

    expect(body).toContain("member.status = 'active'")
    expect(body).toContain('SET user_id = v_circle_member.user_id,')
    expect(body).toContain("display_name = left(v_display_name, 120), status = 'invited'")
  })

  it('binds only accepted current Event identities onto the existing Expense member', () => {
    const body = functionBody(sql141, 'teskeid_event_create_expense_from_event_for_actor')

    expect(body).toContain('public.expense_apply_identity_binding(')
    expect(body).toContain("'event_organizer'")
    expect(body).toContain("'event_guest'")
    expect(body).toContain('source.expense_member_id')
    expect(body).toContain('membership.user_id')
  })
})

describe('current Expense dispute, removal and collaborator boundaries', () => {
  it('derives the dispute actor from the guarded session in the server action', () => {
    const start = actions.indexOf('export async function disputeExpenseClaim(')
    expect(start).toBeGreaterThanOrEqual(0)
    const body = actions.slice(start, actions.indexOf('\nexport async function', start + 1))

    expect(body).toContain('const { user } = await guardExpenseSession()')
    expect(body).toContain('p_actor_id: user.id')
    expect(body).not.toContain('p_actor_id: value.')
  })

  it('keeps exact dispute identity, versioning and idempotent replay', () => {
    const body = functionBody(sql141, 'expense_dispute_claim')

    expect(body).toContain("'expenseId', p_expense_id, 'memberId', p_member_id")
    expect(body).toContain("'expectedFinancialVersion', p_expected_financial_version")
    expect(body).toContain("v_existing.operation <> 'expense_dispute_claim'")
    expect(body).toContain('v_group.financial_version <> p_expected_financial_version')
    expect(body).toContain('v_member.user_id IS DISTINCT FROM p_actor_id')
    expect(body).toContain('ON CONFLICT (expense_id, member_id) DO NOTHING')
  })

  it('documents current group-wide dispute blockade pending Phase 7', () => {
    const body = functionBody(sql141, 'expense_guard_disputed_settlement')

    expect(body).toContain('WHERE dispute.group_id = NEW.group_id')
    expect(body).toContain("dispute.status = 'disputed'")
    expect(body).not.toContain('dispute.expense_id =')
    expect(body).not.toContain('currency')
    expect(body).toContain("RAISE EXCEPTION 'expense_claim_requires_review'")
  })

  it('documents the absence of a canonical remove-collaborator mutation pending Phase 4', () => {
    expect(topLevelExpenseSql).not.toMatch(
      /CREATE(?: OR REPLACE)? FUNCTION public\.expense_remove_share_collaborator\(/,
    )
  })

  it('adds collaborator access without inserting or changing the canonical share amount', () => {
    const body = functionBody(sql141, 'expense_add_share_collaborator')

    expect(body).toContain('INSERT INTO public.expense_share_collaborators')
    expect(body).toContain("v_member_id, 'active', p_actor_id")
    expect(body).not.toContain('INSERT INTO public.expense_shares')
    expect(body).not.toContain('UPDATE public.expense_shares')
    expect(body).not.toContain('SET total_minor')
  })
})
