import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import { getExpenseEventLinkManagement } from '@/lib/events/repository.server'

const actorId = '10000000-0000-4000-8000-000000000001'
const expenseId = '20000000-0000-4000-8000-000000000001'
const eventId = '30000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
})

describe('Expense event-link management projection', () => {
  it('accepts only the narrow attendee-safe eligible event shape', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        current_event: null,
        events: [{
          event_id: eventId,
          name: 'Kvöldmatur',
          roster_revision: 3,
          viewer_role: 'attendee',
        }],
      },
      error: null,
    })
    await expect(getExpenseEventLinkManagement(actorId, expenseId)).resolves.toEqual({
      currentEvent: null,
      eligibleEvents: [{
        id: eventId,
        name: 'Kvöldmatur',
        rosterRevision: 3,
        viewerRole: 'attendee',
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get_expense_link_management', {
      p_actor_id: actorId,
      p_expense_id: expenseId,
    })
  })

  it('fails closed on email or identity-shaped additions and one-event violations', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        current_event: null,
        events: [{
          event_id: eventId,
          name: 'Kvöldmatur',
          roster_revision: 3,
          viewer_role: 'owner',
          recipient_email: 'private@example.is',
        }],
      },
      error: null,
    })
    await expect(getExpenseEventLinkManagement(actorId, expenseId))
      .rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({
      data: {
        current_event: { event_id: eventId, name: 'Kvöldmatur', can_open: true },
        events: [{
          event_id: '30000000-0000-4000-8000-000000000002',
          name: 'Annar', roster_revision: 2, viewer_role: 'owner',
        }],
      },
      error: null,
    })
    await expect(getExpenseEventLinkManagement(actorId, expenseId))
      .rejects.toThrow('event_load_failed')
  })

  it('keeps a detachable current link opaque when Event access is no longer current', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        current_event: { event_id: eventId, name: null, can_open: false },
        events: [],
      },
      error: null,
    })
    await expect(getExpenseEventLinkManagement(actorId, expenseId)).resolves.toEqual({
      currentEvent: { id: eventId, name: null, canOpen: false },
      eligibleEvents: [],
    })
  })
})
