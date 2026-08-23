import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseRecentEventRow } from '@/lib/recent-events/types'

const { mockCheckFeatureAccess, mockRpc, mockFrom, mockRecordRecentEvent } = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockRecordRecentEvent: vi.fn(),
}))

vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc, from: mockFrom })),
}))
vi.mock('@/lib/recent-events/helpers.server', () => ({
  recordRecentEvent: mockRecordRecentEvent,
}))

import {
  expenseActivityIdFromEventKey,
  resolveExpenseRecentEventTargets,
  resolveRecentEventSourceAccess,
  syncEventAttendanceInvitationEvents,
} from '@/lib/recent-events/access.server'
import { syncHouseholdChoreRecentEvents } from '@/lib/household-chores/recent.server'

const ACTIVITY_ID = '10000000-0000-4000-8000-000000000001'
const ACTOR_ID = '70000000-0000-4000-8000-000000000001'

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
    delete process.env.HOUSEHOLD_CHORES_ENABLED
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
        householdChoresInboxEnabled: true,
        sources: ['expenses', 'heimilisverkin'],
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
        householdChoresInboxEnabled: true,
        sources: ['loans', 'heimilisverkin'],
      })
  })

  it('keeps only the exact-user Household consent source when the session has no email', async () => {
    await expect(resolveRecentEventSourceAccess({ id: 'user-uuid', email: undefined }))
      .resolves.toEqual({
        loansEnabled: false,
        expensesEnabled: false,
        eventInvitationsEnabled: false,
        householdChoresInboxEnabled: true,
        sources: ['heimilisverkin'],
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
        householdChoresInboxEnabled: true,
        sources: ['events', 'heimilisverkin'],
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
        householdChoresInboxEnabled: true,
        sources: ['expenses', 'heimilisverkin'],
      })
  })

  it('authorizes the Household inbox independently from its rollout flag and entitlement', async () => {
    process.env.HOUSEHOLD_CHORES_ENABLED = 'false'
    mockCheckFeatureAccess.mockResolvedValue(false)

    const access = await resolveRecentEventSourceAccess({
      id: 'user-uuid',
      email: 'user@test.com',
    })

    expect(access.householdChoresInboxEnabled).toBe(true)
    expect(access.sources).toContain('heimilisverkin')
    expect(mockCheckFeatureAccess).not.toHaveBeenCalledWith(
      'user-uuid',
      'user@test.com',
      'heimilisverkin',
    )
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
      targets: new Map(),
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

  it('returns exact preview-authorized canonical targets without reopening acknowledged rows', async () => {
    const invitationId = '30000000-0000-4000-8000-000000000001'
    const eventId = '40000000-0000-4000-8000-000000000001'
    mockRpc
      .mockResolvedValueOnce({
        data: {
          invitations: [{
            invitation_id: invitationId,
            event_name: 'Kvisskvöld',
            inviter_display_name: 'Anna',
            invited_at: '2026-08-16T20:00:00.000Z',
          }],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { invitation_id: invitationId, event_id: eventId },
        error: null,
      })

    await expect(syncEventAttendanceInvitationEvents(ACTOR_ID)).resolves.toEqual({
      ok: true,
      targets: new Map([[invitationId, `/auth-mvp/vidburdir/${eventId}`]]),
    })
    expect(mockRecordRecentEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: ACTOR_ID,
      entityId: invitationId,
      href: `/auth-mvp/vidburdir/${eventId}`,
      updateOnConflict: false,
    }))
  })
})

describe('syncHouseholdChoreRecentEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls only the exact own-user sync RPC and accepts its strict success envelope', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        code: 'recent_synced',
        data: { inserted: 1, updated: 2, removed: 3 },
      },
      error: null,
    })

    await expect(syncHouseholdChoreRecentEvents(ACTOR_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('household_chore_sync_recent', {
      p_actor_id: ACTOR_ID,
    })
  })

  it('rejects malformed actors before RPC and rejects non-exact or unbounded success data', async () => {
    await expect(syncHouseholdChoreRecentEvents('not-a-uuid')).resolves.toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()

    for (const data of [
      { ok: true, code: 'recent_synced', data: { inserted: 0, updated: 0, removed: 0 }, extra: true },
      { ok: true, code: 'recent_synced', data: { inserted: 0, updated: 0 } },
      { ok: true, code: 'recent_synced', data: { inserted: 101, updated: 0, removed: 0 } },
      { ok: true, code: 'recent_synced', data: { inserted: 0.5, updated: 0, removed: 0 } },
    ]) {
      mockRpc.mockResolvedValueOnce({ data, error: null })
      await expect(syncHouseholdChoreRecentEvents(ACTOR_ID)).resolves.toBe(false)
    }
  })

  it('fails quietly while SQL142 is unavailable and never logs provider details', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST202', message: 'private@example.is' },
    })
    await expect(syncHouseholdChoreRecentEvents(ACTOR_ID)).resolves.toBe(false)
    expect(consoleWarn).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'private@example.is' },
    })
    await expect(syncHouseholdChoreRecentEvents(ACTOR_ID)).resolves.toBe(false)
    expect(consoleWarn).toHaveBeenCalledWith(
      '[recent-events] household chores sync unavailable',
    )
    expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain('private@example.is')
    consoleWarn.mockRestore()
  })
})
