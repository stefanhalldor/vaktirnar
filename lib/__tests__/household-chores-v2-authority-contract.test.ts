import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql146 = readFileSync(
  join(process.cwd(), 'sql/146_household_chore_performed_dates.sql'),
  'utf8',
).replace(/\r\n/g, '\n')

function functionBody(name: string, nextName: string): string {
  const start = sql146.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = sql146.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
  if (start < 0 || end < 0) throw new Error(`missing SQL146 function boundary: ${name}`)
  return sql146.slice(start, end)
}

describe('SQL146 v2 authority contract consumed by Phase 2', () => {
  it('lets members complete only active eligible work and binds children to own participant', () => {
    const core = functionBody(
      'household_chore_private_complete_definition_core_v2',
      'household_chore_complete_definition',
    )
    expect(core).toContain("v_membership.membership_type = 'child'")
    expect(core).toContain('v_membership.participant_id IS DISTINCT FROM p_participant_id')
    expect(core).toContain("v_definition.status <> 'active'")
    expect(core).toContain("v_participant.status <> 'active'")
    expect(core).toContain("v_value.status <> 'active'")
    expect(core).toContain('v_participant.linked_user_id IS DISTINCT FROM p_actor_id')
    expect(core).toContain("false, 'not_allowed', p_request_id")
    expect(core).toContain("false, 'not_available', p_request_id")
  })

  it('keeps assignment completion child-owned and version/terminal-state guarded', () => {
    const body = functionBody(
      'household_chore_complete_assignment_v2',
      'household_chore_correct_completion_date',
    )
    expect(body).toContain('v_assignment.version IS DISTINCT FROM p_expected_version')
    expect(body).toContain("v_assignment.status <> 'open'")
    expect(body).toContain("v_membership.membership_type = 'child'")
    expect(body).toContain('v_assignment.participant_id <> v_membership.participant_id')
    expect(body).toContain('v_participant.linked_user_id IS NOT NULL')
  })

  it('allows member correction but restricts child correction to own latest effective completion', () => {
    const body = functionBody(
      'household_chore_correct_completion_date',
      'household_chore_get_priority_dashboard_v2',
    )
    expect(body).toContain("IF v_membership.membership_type = 'child' THEN")
    expect(body).toContain('v_assignment.participant_id IS DISTINCT FROM v_membership.participant_id')
    expect(body).toContain('v_participant.linked_user_id IS DISTINCT FROM p_actor_id')
    expect(body).toContain('ORDER BY effective_row.performed_on DESC')
    expect(body).toContain('IF v_effective_id IS DISTINCT FROM v_assignment.id THEN')
    expect(body).toContain("ELSIF v_membership.membership_type <> 'member' THEN")
  })

  it('changes only date/version metadata and never rewrites points or recorded completion time', () => {
    const body = functionBody(
      'household_chore_correct_completion_date',
      'household_chore_get_priority_dashboard_v2',
    )
    const update = body.slice(
      body.indexOf('UPDATE public.household_chore_assignments'),
      body.indexOf('RETURNING assignment_row.* INTO v_assignment'),
    )
    expect(update).toContain('SET performed_on = p_performed_on')
    expect(update).toContain('version = assignment_row.version + 1')
    expect(update).not.toContain('points_snapshot =')
    expect(update).not.toContain('participant_id =')
    expect(update).not.toContain('completed_by_user_id =')
    expect(update).not.toContain('completed_at =')
    expect(body).not.toContain('INSERT INTO public.household_chore_point_entries')
    expect(body).toContain("'recorded_at', v_assignment.completed_at")
    expect(body).toContain("'points_delta', 0")
  })

  it('filters child history and assignment reads before TypeScript projection', () => {
    const history = functionBody(
      'household_chore_private_history_page_v2',
      'household_chore_get_definition_history_v2',
    )
    const assignment = functionBody(
      'household_chore_get_assignment_v2',
      'household_chore_get_definition_detail_v3',
    )
    expect(history).toContain('event_row.participant_id = v_membership.participant_id')
    expect(history).toContain('participant_row.linked_user_id = p_actor_id')
    expect(assignment).toContain("v_membership.membership_type = 'child' AND NOT v_is_own")
    expect(assignment).toContain("'own_assignment', true")
  })
})
