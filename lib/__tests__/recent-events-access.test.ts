import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseRecentEventRow } from '@/lib/recent-events/types'

const { mockCheckFeatureAccess, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc, from: mockFrom })),
}))

import {
  expenseActivityIdFromEventKey,
  resolveExpenseRecentEventTargets,
  resolveRecentEventSourceAccess,
  syncEventAttendanceInvitationEvents,
} from '@/lib/recent-events/access.server'

const ACTIVITY_ID = '10000000-0000-4000-8000-000000000001'

function expenseEvent(overrides: Partial<ExpenseRecentEventRow> = {}): ExpenseRecentEventRow {
  return {
    id: 1,
    user_id: 'user-uuid',
    source: 'expenses',
    event_type: 'expense_created',
    entity_type: 'expense',
    entity_id: 'expense-uuid',
    event_key: `expenses:activity:${ACTIVITY_ID}`,
    payload: { expenseTitle: 'Matur', actorUserId: 'actor-uuid' },
    href: '/auth-mvp/utlagt-og-endurgreitt',
    occurred_at: '2026-08-04T00:00:00Z',
    ack_at: null,
    ...overrides,
  }
}

describe('resolveRecentEventSourceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.EVENTS_ENABLED
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    })
  })

  it('returns only currently enabled server-side sources', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_id: string, _email: string, key: string) =>
      key === 'utlagt-og-endurgreitt')

    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: 'user@test.com' }))
      .resolves.toEqual({
        loansEnabled: false,
        expensesEnabled: true,
        eventInvitationsEnabled: false,
        sources: ['expenses'],
      })
  })

  it('fails one source closed without suppressing an independently enabled source', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_id: string, _email: string, key: string) => {
      if (key === 'utlagt-og-endurgreitt') throw new Error('feature lookup failed')
      return true
    })

    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: 'user@test.com' }))
      .resolves.toEqual({
        loansEnabled: true,
        expensesEnabled: false,
        eventInvitationsEnabled: false,
        sources: ['loans'],
      })
  })

  it('fails closed before feature checks when the session has no email', async () => {
    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: undefined }))
      .resolves.toEqual({
        loansEnabled: false,
        expensesEnabled: false,
        eventInvitationsEnabled: false,
        sources: [],
      })
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('enables the scoped Event invitation source from the global switch without per-user Events access', async () => {
    process.env.EVENTS_ENABLED = 'true'
    mockCheckFeatureAccess.mockResolvedValue(false)
    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: 'user@test.com' }))
      .resolves.toEqual({
        loansEnabled: false,
        expensesEnabled: false,
        eventInvitationsEnabled: true,
        sources: ['events'],
      })
  })

  it('enables only the Expense source for an exact active member without feature entitlement', async () => {
    mockCheckFeatureAccess.mockResolvedValue(false)
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ id: 'member-uuid' }], error: null }),
          }),
        }),
      }),
    })

    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: 'user@test.com' }))
      .resolves.toEqual({
        loansEnabled: false,
        expensesEnabled: true,
        eventInvitationsEnabled: false,
        sources: ['expenses'],
      })
  })
})

describe('resolveExpenseRecentEventTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  it('extracts only canonical expense activity UUID keys', () => {
    expect(expenseActivityIdFromEventKey(`expenses:activity:${ACTIVITY_ID}`)).toBe(ACTIVITY_ID)
    expect(expenseActivityIdFromEventKey('loans:activity:anything')).toBeNull()
    expect(expenseActivityIdFromEventKey('expenses:activity:not-a-uuid')).toBeNull()
  })

  it('passes bounded activity IDs to the authorization RPC and accepts only local expense hrefs', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { activity_id: ACTIVITY_ID, href: '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-uuid' },
        { activity_id: 'not-requested', href: '/auth-mvp/utlagt-og-endurgreitt/hopar/leak' },
        { activity_id: ACTIVITY_ID, href: '/auth-mvp/utlagt-og-endurgreitt/../heim' },
        { activity_id: ACTIVITY_ID, href: 'https://example.com/leak' },
      ],
      error: null,
    })

    const targets = await resolveExpenseRecentEventTargets('user-uuid', [expenseEvent()])

    expect(mockRpc).toHaveBeenCalledWith('expense_resolve_recent_targets', {
      p_actor_id: 'user-uuid',
      p_activity_ids: [ACTIVITY_ID],
    })
    // The later unsafe duplicate must not overwrite the already validated local target.
    expect(targets.get(ACTIVITY_ID)).toBe('/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-uuid')
  })

  it('fails closed to no links when the authorization RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301' } })
    await expect(resolveExpenseRecentEventTargets('user-uuid', [expenseEvent()]))
      .resolves.toEqual(new Map())
  })
})

describe('syncEventAttendanceInvitationEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails quietly while the additive SQL134 projection is not installed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'function is not in the schema cache' },
    })

    await expect(syncEventAttendanceInvitationEvents('user-uuid')).resolves.toEqual({
      ok: false,
      invitationIds: new Set(),
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()

    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  it('uses a generic warning without exposing unexpected provider details', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'private@example.is should not escape' },
    })

    await expect(syncEventAttendanceInvitationEvents('user-uuid')).resolves.toMatchObject({
      ok: false,
    })
    expect(consoleWarn).toHaveBeenCalledWith(
      '[recent-events] event invitation sync unavailable',
    )
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain('private@example.is')
    consoleWarn.mockRestore()
  })
})
