import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
  .replace(/\r\n/g, '\n')
const functionNames = (source: string) => [...source.matchAll(
  /CREATE OR REPLACE FUNCTION public\.(household_chore_[a-z0-9_]+)/g,
)].map(match => match[1])
const sql142 = read('sql/142_household_chores_foundation.sql')
const sql145 = read('sql/145_household_chore_priority_list.sql')
const migration = read('sql/146_household_chore_performed_dates.sql')
const preflight = read(
  'sql/validation/146-household-chore-performed-dates/preflight.sql',
)
const postflight = read(
  'sql/validation/146-household-chore-performed-dates/postflight.sql',
)
const recovery = read(
  'sql/validation/146-household-chore-performed-dates/recovery.sql',
)
const readme = read(
  'sql/validation/146-household-chore-performed-dates/README.md',
)

const historicalHashes = {
  'sql/142_household_chores_foundation.sql':
    '976d68c9a4859d7d9a596b8a4e431e42db888cfaf665236dd340246aff282615',
  'sql/143_household_chores_rollout_catalog.sql':
    'fb44d2bcc359a402d8517141acb94d58e10bbcdf5ebcc5a279a22072afd2300b',
  'sql/144_household_chore_guest_identity.sql':
    '4baeee51edb3bda43a0e30ffcbff7b22bb296f3c467fcbfe204ac3dcf9c22032',
  'sql/145_household_chore_priority_list.sql':
    'c2f941d2787a7121c2f508aafa7b4f5be5522aab6a72e9d9abc842fee283cc64',
}

describe('SQL146 performed-date contract', () => {
  it('preserves every applied SQL142-145 source file byte for byte', () => {
    for (const [path, expected] of Object.entries(historicalHashes)) {
      const digest = createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex')
      expect(digest, path).toBe(expected)
    }
  })

  it('is one atomic migration with the dedicated advisory lock', () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1)
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration).toContain('teskeid:household-chores:sql146')
    expect(migration.match(/\$function\$/g)?.length).toBeGreaterThan(0)
    expect((migration.match(/\$function\$/g)?.length ?? 0) % 2).toBe(0)
  })

  it('keeps the exact two-function SQL145 replacement allowlist', () => {
    const declarations = functionNames(migration)
    const sql142Names = new Set(functionNames(sql142))
    const sql145Names = new Set(functionNames(sql145))
    expect(declarations.filter(name => sql142Names.has(name))).toEqual([])
    expect(declarations.filter(name => sql145Names.has(name))).toEqual([
      'household_chore_complete_definition',
      'household_chore_get_priority_dashboard',
    ])
  })

  it('adds date-only assignment and immutable event audit shapes', () => {
    expect(migration).toContain('ADD COLUMN performed_on date NULL')
    expect(migration).toContain('ADD COLUMN previous_performed_on date NULL')
    expect(migration).toContain('ADD COLUMN reversed_performed_on date NULL')
    expect(migration).toContain("'completion_date_corrected'")
    expect(migration).toContain('performed_on <> previous_performed_on')
    expect(migration).toContain(
      "completed_at AT TIME ZONE 'Atlantic/Reykjavik'",
    )
    expect(migration).toContain(
      "occurred_at AT TIME ZONE 'Atlantic/Reykjavik'",
    )
    expect(migration).toContain('Add circle.time_zone')
  })

  it('pauses only the exact immutable event trigger around legacy backfill', () => {
    const disable = migration.indexOf(
      'DISABLE TRIGGER household_chore_assignment_events_immutable',
    )
    const completionBackfill = migration.indexOf(
      'UPDATE public.household_chore_assignment_events AS event_row',
    )
    const reversalBackfill = migration.indexOf(
      'UPDATE public.household_chore_assignment_events AS reversal_row',
    )
    const enable = migration.indexOf(
      'ENABLE TRIGGER household_chore_assignment_events_immutable',
    )
    expect(disable).toBeGreaterThan(0)
    expect(completionBackfill).toBeGreaterThan(disable)
    expect(reversalBackfill).toBeGreaterThan(completionBackfill)
    expect(enable).toBeGreaterThan(reversalBackfill)
    expect(migration).not.toContain('DISABLE TRIGGER USER')
    expect(migration).not.toContain('DISABLE TRIGGER ALL')
    expect(preflight).toContain('AS immutable_guard_ready')
    expect(postflight).toContain('AS immutable_guard_preserved_ok')
    expect(recovery).toContain('AS immutable_guard_enabled')
  })

  it('keeps legacy complete/undo compatible through additive guards', () => {
    expect(migration).toContain(
      'household_chore_assignments_performed_date_guard',
    )
    expect(migration).toContain('household_chore_events_performed_date_guard')
    expect(migration).toContain(
      'household_chore_private_complete_locked_assignment_v2',
    )
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.household_chore_undo_completion(',
    )
    expect(migration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.household_chore_complete_assignment(',
    )
    expect(migration).toContain('-- Legacy rollout fields')
  })

  it('keeps the strict legacy dashboard shape behind a v2 read model', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.household_chore_get_priority_dashboard_v2(',
    )
    const legacy = migration.slice(
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION public.household_chore_get_priority_dashboard(\n',
      ),
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION public.household_chore_private_history_page_v2(',
      ),
    )
    expect(legacy).toContain('household_chore_get_priority_dashboard_v2')
    expect(legacy).toContain("'get_priority_dashboard_loaded'")
    expect(legacy).not.toContain("'server_today'")
    expect(legacy).not.toContain("'baseline_on'")
    expect(legacy).not.toContain("'latest_performed_on'")
    expect(legacy).not.toContain("'is_remaining'")
  })

  it('uses performed date for scoped cadence and an append-only event seal', () => {
    expect(migration).toContain('completed_row.performed_on DESC')
    expect(migration).toContain("v_definition.completion_scope = 'global'")
    expect(migration).toContain(
      'OR completed_row.participant_id = p_participant_id',
    )
    expect(migration).toContain("'effective_performed_on'")
    expect(migration).toContain("'latest_relevant_event_id'")
    expect(migration).toContain("'latest_relevant_event_at'")
    expect(migration).toContain("false, 'stale_version', p_request_id")
  })

  it('implements date-aware oldest-open reuse and server-time rate limits', () => {
    expect(migration).toContain(
      "open_row.created_at AT TIME ZONE 'Atlantic/Reykjavik'",
    )
    expect(migration).toContain('<= p_performed_on')
    expect(migration).toContain('ORDER BY open_row.created_at, open_row.id')
    expect(migration).toContain("'quick_completed', NULL")
    expect(migration).toContain("rate_row.rate_kind = 'self_assign_created'")
    expect(migration).toContain(
      'rate_row.occurred_at > v_now - interval \'24 hours\'',
    )
  })

  it('separates idempotent date conflict, correction and points authority', () => {
    expect(migration).toContain("'performed_on', v_performed_on")
    expect(migration).toContain("false, 'fingerprint_mismatch', p_request_id")
    expect(migration).toContain('household_chore_correct_completion_date')
    expect(migration).toContain("'completion_date_corrected', 'completed'")
    const correction = migration.slice(
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION public.household_chore_correct_completion_date',
      ),
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION public.household_chore_get_priority_dashboard',
      ),
    )
    expect(correction).not.toContain(
      'INSERT INTO public.household_chore_point_entries',
    )
    expect(correction).toContain("'points_delta', 0")
  })

  it('ships strict own-only child read paths and bounded member state', () => {
    expect(migration).toContain("'viewer_type', 'child'")
    expect(migration).toContain(
      "v_membership.membership_type = 'member'",
    )
    expect(migration).toContain(
      'event_row.participant_id = v_membership.participant_id',
    )
    expect(migration).toContain(
      "v_membership.membership_type = 'child' AND NOT v_is_own",
    )
    expect(migration).toContain("'is_remaining'")
    expect(migration).toContain("'server_today'")
    expect(migration).toContain("'next_day_boundary_at'")
  })

  it('keeps public RPCs service-role-only and private helpers private', () => {
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]*?TO (?:anon|authenticated);/)
  })

  it('ships read-only preflight, postflight and recovery assessment', () => {
    for (const validator of [preflight, postflight, recovery]) {
      expect(validator.match(/^BEGIN;$/gm)).toHaveLength(1)
      expect(validator.match(/^SET TRANSACTION READ ONLY;$/gm)).toHaveLength(1)
      expect(validator.match(/^ROLLBACK;$/gm)).toHaveLength(1)
      expect(validator).not.toMatch(
        /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CALL)\b/im,
      )
    }
    expect(preflight).toContain('AS prerequisites_ok')
    expect(preflight).toContain('ambiguous_reversal_mapping_count')
    expect(preflight).toContain('assignment_reykjavik_utc_date_shift_count')
    expect(postflight).toContain('AS postconditions_ok')
    expect(postflight).toContain('missing_reversal_performed_on_count')
    expect(recovery).toContain("'forward_fix_requires_review'")
    expect(readme).toContain('There is no automatic destructive down-migration')
  })
})
