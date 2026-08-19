import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(
  join(root, 'sql/145_household_chore_priority_list.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const [preflight, postflight] = [
  'sql/validation/145-household-chore-priority-list/preflight.sql',
  'sql/validation/145-household-chore-priority-list/postflight.sql',
].map((path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n'))

describe('SQL145 priority list contract', () => {
  it('is one atomic additive migration with global legacy semantics', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration).toContain('ADD COLUMN cadence_days integer NULL')
    expect(migration).toContain(
      "ADD COLUMN completion_scope text NOT NULL DEFAULT 'global'",
    )
    expect(migration).toContain("'global', 'per_participant'")
    expect(migration).not.toContain("SET completion_scope = 'global'")
  })

  it('uses one exhaustive quick-completion origin and preserves undo compatibility', () => {
    expect(migration).toContain("'quick_completed'")
    expect(migration).not.toContain('member_quick_completed')
    expect(migration).not.toContain('self_quick_completed')
    expect(migration).toContain('household_chore_private_create_assignment')
    expect(migration).toContain('household_chore_private_complete_locked_assignment')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.household_chore_undo_completion')
  })

  it('keeps global and participant-specific effective completion authoritative', () => {
    expect(migration).toContain(
      "definition_row.completion_scope = 'global'",
    )
    expect(migration).toContain(
      'OR completed_row.participant_id = participant_row.id',
    )
    expect(migration).toContain(
      'OR completed_row.participant_id = p_participant_id',
    )
    expect(migration).toContain(
      'definition_row.created_at, value_row.created_at',
    )
    expect(migration).toContain('household_chore_private_priority_token')
    expect(migration).toContain("false, 'stale_version', p_request_id")
  })

  it('preserves the child self-service rate boundary for quick-created work', () => {
    expect(migration).toContain('household_chore_private_prune_rates')
    expect(migration).toContain("rate_row.rate_kind = 'self_assign_created'")
    expect(migration).toContain(
      "'self_assign_created', p_actor_id, p_circle_id",
    )
    expect(migration).toContain("false, 'rate_limited', p_request_id")
  })

  it('ships a strict child projection without the full participant matrix', () => {
    expect(migration).toContain("'viewer_type', 'child'")
    expect(migration).toContain("'own_state'")
    const childReturn = migration.slice(
      migration.indexOf("'viewer_type', 'child'"),
      migration.indexOf("'viewer_type', 'child'") + 500,
    )
    expect(childReturn).not.toContain("'participants'")
    expect(childReturn).not.toContain("'participant_states'")
  })

  it('limits public functions to service_role and keeps private helpers private', () => {
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).toContain("SET search_path = ''")
  })

  it('ships read-only preflight and postflight checks', () => {
    for (const validator of [preflight, postflight]) {
      expect(validator.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(validator.match(/^SET TRANSACTION READ ONLY;$/gm)).toHaveLength(1)
      expect(validator.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(validator).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CALL)\b/im,
      )
    }
    expect(preflight).toContain('AS prerequisites_ok')
    expect(postflight).toContain('AS postconditions_ok')
  })
})
