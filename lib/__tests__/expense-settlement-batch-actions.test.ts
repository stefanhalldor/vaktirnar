import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardExpenseAccess,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/expenses/guard', () => ({
  guardExpenseAccess: mockGuardExpenseAccess,
  guardExpenseSession: mockGuardExpenseAccess,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: vi.fn(),
  resolveExpenseMembers: vi.fn(),
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: vi.fn(),
  getExpenseEditMembersForActor: vi.fn(),
}))

import {
  proposeExpenseSettlementBatch,
  transitionExpenseSettlementBatch,
} from '@/lib/expenses/actions'
import {
  ProposeExpenseSettlementBatchSchema,
  TransitionExpenseSettlementBatchSchema,
} from '@/lib/expenses/validation'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_A_ID = '20000000-0000-4000-8000-000000000001'
const GROUP_B_ID = '20000000-0000-4000-8000-000000000002'
const ACTOR_A_MEMBER_ID = '30000000-0000-4000-8000-000000000001'
const COUNTERPARTY_A_MEMBER_ID = '30000000-0000-4000-8000-000000000002'
const ACTOR_B_MEMBER_ID = '30000000-0000-4000-8000-000000000003'
const COUNTERPARTY_B_MEMBER_ID = '30000000-0000-4000-8000-000000000004'
const PROFILE_ID = '40000000-0000-4000-8000-000000000001'
const PROFILE_STATE_TOKEN = '0123456789abcdef0123456789abcdef'
const BATCH_ID = '50000000-0000-4000-8000-000000000001'
const REQUEST_ID = '60000000-0000-4000-8000-000000000001'
const TRANSITION_REQUEST_ID = '60000000-0000-4000-8000-000000000002'
const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'

const expectedContexts = [
  {
    group_id: GROUP_A_ID,
    from_member_id: ACTOR_A_MEMBER_ID,
    to_member_id: COUNTERPARTY_A_MEMBER_ID,
    expected_financial_version: 7,
    amount_minor: 30_000,
  },
  {
    group_id: GROUP_B_ID,
    from_member_id: COUNTERPARTY_B_MEMBER_ID,
    to_member_id: ACTOR_B_MEMBER_ID,
    expected_financial_version: 4,
    amount_minor: 5_000,
  },
]

function proposalInput(overrides: Record<string, unknown> = {}) {
  return {
    anchor: {
      group_id: GROUP_A_ID,
      from_member_id: ACTOR_A_MEMBER_ID,
      to_member_id: COUNTERPARTY_A_MEMBER_ID,
    },
    currency: 'ISK',
    expected_contexts: expectedContexts,
    expected_payment_profile: {
      profile_id: PROFILE_ID,
      version: 3,
      state_token: PROFILE_STATE_TOKEN,
    },
    cash_amount: '25000',
    use_offset: true,
    occurred_on: '2026-08-11',
    note: 'Greitt með millifærslu',
    request_id: REQUEST_ID,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardExpenseAccess.mockResolvedValue({
    user: { id: ACTOR_ID, email: 'actor@example.is' },
  })
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('expense settlement-batch validation boundary', () => {
  it('accepts a bounded exact context vector and nullable profile expectation', () => {
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput()).success).toBe(true)
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput({
      expected_payment_profile: null,
      cash_amount: '0',
    })).success).toBe(true)
  })

  it('rejects an anchor outside the vector, duplicate contexts, and unsafe profile versions', () => {
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput({
      anchor: {
        group_id: GROUP_B_ID,
        from_member_id: ACTOR_B_MEMBER_ID,
        to_member_id: COUNTERPARTY_B_MEMBER_ID,
      },
    })).success).toBe(false)
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput({
      expected_contexts: [expectedContexts[0], expectedContexts[0]],
    })).success).toBe(false)
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput({
      expected_payment_profile: {
        profile_id: PROFILE_ID,
        version: 0,
        state_token: PROFILE_STATE_TOKEN,
      },
    })).success).toBe(false)
    expect(ProposeExpenseSettlementBatchSchema.safeParse(proposalInput({
      expected_payment_profile: {
        profile_id: PROFILE_ID,
        version: 3,
        state_token: 'not-opaque',
      },
    })).success).toBe(false)
    expect(TransitionExpenseSettlementBatchSchema.safeParse({
      batch_id: BATCH_ID,
      action: 'approve',
      request_id: TRANSITION_REQUEST_ID,
    }).success).toBe(false)
  })
})

describe('expense settlement-batch server actions', () => {
  it('maps only the session actor, exact anchor/vector, and profile token to the proposal RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        batch_id: BATCH_ID,
        status: 'proposed',
        group_ids: [GROUP_A_ID, GROUP_A_ID, GROUP_B_ID],
      },
      error: null,
    })

    await expect(proposeExpenseSettlementBatch(proposalInput())).resolves.toEqual({
      ok: true,
      data: { batchId: BATCH_ID, status: 'proposed' },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_propose_settlement_batch', {
      p_actor_id: ACTOR_ID,
      p_anchor_group_id: GROUP_A_ID,
      p_anchor_from_member_id: ACTOR_A_MEMBER_ID,
      p_anchor_to_member_id: COUNTERPARTY_A_MEMBER_ID,
      p_currency: 'ISK',
      p_expected_contexts: expectedContexts,
      p_expected_profile_id: PROFILE_ID,
      p_expected_profile_version: 3,
      p_expected_profile_state_token: PROFILE_STATE_TOKEN,
      p_cash_minor: 25_000,
      p_use_offset: true,
      p_occurred_on: '2026-08-11',
      p_note: 'Greitt með millifærslu',
      p_request_id: REQUEST_ID,
    })
    expect(mockRpc.mock.calls[0]?.[1]).not.toHaveProperty('p_counterparty_user_id')
    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual([
      EXPENSES_PATH,
      '/auth-mvp/heim',
      `${EXPENSES_PATH}/gera-upp`,
      `${EXPENSES_PATH}/hopar/${GROUP_A_ID}`,
      `${EXPENSES_PATH}/hopar/${GROUP_B_ID}`,
    ])
  })

  it('passes an explicit absent-profile state and zero cash without inventing identity', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { batch_id: BATCH_ID, status: 'proposed', group_ids: [GROUP_A_ID] },
      error: null,
    })

    const result = await proposeExpenseSettlementBatch(proposalInput({
      expected_payment_profile: null,
      cash_amount: '0',
      use_offset: true,
    }))

    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(
      'expense_propose_settlement_batch',
      expect.objectContaining({
        p_actor_id: ACTOR_ID,
        p_expected_profile_id: null,
        p_expected_profile_version: null,
        p_expected_profile_state_token: null,
        p_cash_minor: 0,
      }),
    )
  })

  it('rejects a proposal response with a non-proposed status before revalidation', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { batch_id: BATCH_ID, status: 'confirmed', group_ids: [GROUP_A_ID] },
      error: null,
    })

    await expect(proposeExpenseSettlementBatch(proposalInput())).resolves.toEqual({
      ok: false,
      error: 'save_failed',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('maps transition status exactly and rejects a mismatched RPC status', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { status: 'confirmed', group_ids: [GROUP_A_ID] },
      error: null,
    })
    await expect(transitionExpenseSettlementBatch({
      batch_id: BATCH_ID,
      action: 'confirm',
      request_id: TRANSITION_REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { status: 'confirmed' } })
    expect(mockRpc).toHaveBeenLastCalledWith('expense_transition_settlement_batch', {
      p_actor_id: ACTOR_ID,
      p_batch_id: BATCH_ID,
      p_action: 'confirm',
      p_request_id: TRANSITION_REQUEST_ID,
    })

    mockRpc.mockResolvedValueOnce({
      data: { status: 'cancelled', group_ids: [GROUP_A_ID] },
      error: null,
    })
    await expect(transitionExpenseSettlementBatch({
      batch_id: BATCH_ID,
      action: 'confirm',
      request_id: TRANSITION_REQUEST_ID,
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
  })

  it('fails validation before RPC and maps a stale profile response to conflict', async () => {
    await expect(proposeExpenseSettlementBatch(proposalInput({
      expected_payment_profile: {
        profile_id: PROFILE_ID,
        version: 0,
        state_token: PROFILE_STATE_TOKEN,
      },
    }))).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'expense_payment_profile_conflict' },
    })
    await expect(proposeExpenseSettlementBatch(proposalInput())).resolves.toEqual({
      ok: false,
      error: 'conflict',
    })
  })
})
