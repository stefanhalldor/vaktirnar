import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql123 = readFileSync(
  join(process.cwd(), 'sql/123_expense_settlement_batch.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const sql124 = readFileSync(
  join(process.cwd(), 'sql/124_expense_settlement_proposal_review_guard.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const preflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/124-expense-settlement-proposal-review/preflight.sql',
  ),
  'utf8',
)
const postflight = readFileSync(
  join(
    process.cwd(),
    'sql/validation/124-expense-settlement-proposal-review/postflight.sql',
  ),
  'utf8',
)
const recovery = readFileSync(
  join(
    process.cwd(),
    'sql/validation/124-expense-settlement-proposal-review/recovery.md',
  ),
  'utf8',
)

const proposalSignature =
  'CREATE OR REPLACE FUNCTION public.expense_propose_settlement_batch('

function proposalBody(source: string, label: string): string {
  const start = source.indexOf(proposalSignature)
  expect(start, `${label} proposal RPC must exist`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n$$;', start)
  expect(end, `${label} proposal RPC must terminate`).toBeGreaterThan(start)
  return source.slice(start, end + '\n$$;'.length)
}

const lateReviewGuard = `  -- SQL124 late review guard. The legacy BEFORE INSERT guard cannot see
  -- NEW, so validate the complete post-item reservation state in every
  -- affected group while its canonical group lock is still held. Raising here
  -- rolls back the batch,
  -- obligations, repayments, allocations and idempotency request atomically.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(v_affected_group_ids) AS affected_group(group_id)
    WHERE public.expense_reported_repayments_need_review(
      affected_group.group_id
    )
  ) THEN
    RAISE EXCEPTION 'expense_repayment_review_required';
  END IF;

`

describe('SQL124 settlement proposal late review guard', () => {
  it('freezes the exact SQL123 source that was applied before this forward fix', () => {
    expect(createHash('sha256').update(sql123).digest('hex').toUpperCase()).toBe(
      '03F6676318F388635F70F7AC55531E1A06F343AA75E6E84C20A619AC7F41D3DF',
    )
  })

  it('preserves the SQL123 proposal body exactly apart from the one late guard', () => {
    const before = proposalBody(sql123, 'SQL123')
    const after = proposalBody(sql124, 'SQL124')
    expect(after.split(lateReviewGuard)).toHaveLength(2)
    expect(after.replace(lateReviewGuard, '')).toBe(before)
    expect(
      after.match(/public\.expense_reported_repayments_need_review/g),
    ).toHaveLength(1)
  })

  it('checks affected locked groups after item derivation and before durable side effects', () => {
    const proposal = proposalBody(sql124, 'SQL124')
    const affectedGroupsReady = proposal.indexOf(
      'IF v_affected_group_ids IS NULL',
    )
    const reviewGuard = proposal.indexOf('-- SQL124 late review guard.')
    const versionWrite = proposal.indexOf(
      'UPDATE public.expense_groups AS group_row',
    )
    const activityWrite = proposal.indexOf(
      'PERFORM public.expense_record_settlement_batch_activity',
    )

    expect(reviewGuard).toBeGreaterThan(affectedGroupsReady)
    expect(reviewGuard).toBeLessThan(versionWrite)
    expect(reviewGuard).toBeLessThan(activityWrite)
    expect(proposal).toContain(
      'FROM pg_catalog.unnest(v_affected_group_ids) AS affected_group(group_id)',
    )
    expect(proposal).toContain(
      "RAISE EXCEPTION 'expense_repayment_review_required'",
    )
  })

  it('is transactional, fail closed and restores the narrow RPC security contract', () => {
    expect(sql124).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(sql124.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql124.indexOf('LOCK TABLE public.expense_settlement_batches'))
      .toBeLessThan(sql124.indexOf('SELECT pg_catalog.count(*) INTO v_batch_rows'))
    expect(proposalBody(sql124, 'SQL124')).not.toMatch(/\n(?:STABLE|IMMUTABLE)\b/)
    expect(sql124).toContain('expense_124_unexpected_proposal_contract')
    expect(sql124).toContain('expense_124_unexpected_proposal_acl')
    expect(sql124).toContain('expense_124_existing_batch_state')
    expect(sql124).toContain('expense_124_postflight_guard_invalid')
    expect(sql124).toContain(
      'ALTER FUNCTION public.expense_propose_settlement_batch(',
    )
    expect(sql124).toMatch(
      /REVOKE ALL ON FUNCTION public\.expense_propose_settlement_batch\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql124).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.expense_propose_settlement_batch\([\s\S]*?TO service_role;/,
    )
  })

  it('ships read-only probes and forward-only recovery guidance', () => {
    for (const probe of [preflight, postflight]) {
      expect(probe).toMatch(/BEGIN;\s*SET TRANSACTION READ ONLY;/)
      expect(probe.trimEnd()).toMatch(/ROLLBACK;$/)
      expect(probe).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|truncate)\b/im,
      )
    }
    expect(preflight).toContain('prerequisites_ok')
    expect(preflight).toContain('unapplied_sql123_body_ok')
    expect(postflight).toContain('postconditions_ok')
    expect(postflight).toContain('late_review_guard_ok')
    expect(postflight).toContain('sql123_contract_markers_ok')
    expect(postflight).toContain('exact_service_role_rpc_execute_ok')
    expect(postflight).toContain('no_unexpected_rpc_execute_ok')
    expect(recovery).toContain('forward-only migration')
    expect(recovery).toContain('do not restore the SQL123 proposal body')
  })
})
