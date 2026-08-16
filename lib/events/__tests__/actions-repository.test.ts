import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardEventAccess,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardEventAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/events/guard', () => ({ guardEventAccess: mockGuardEventAccess }))

import { createEvent, saveEventRoster } from '@/lib/events/actions'
import {
  createEventContext,
  getEventContext,
  getEventExpensePreview,
  getOwnedEventExpenseSource,
  isExpenseEventContext,
  listEventExpenseSources,
  listEvents,
  replaceEventRoster,
} from '@/lib/events/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const GUEST_ID = '40000000-0000-4000-8000-000000000001'
const RELATIONSHIP_ID = '50000000-0000-4000-8000-000000000001'
const PARTY_A = '60000000-0000-4000-8000-000000000001'
const PARTY_B = '60000000-0000-4000-8000-000000000002'

const validInput = {
  request_id: REQUEST_ID,
  name: '  Kvisskvöld  ',
  guests: [
    { source_kind: 'manual_name', display_name: '  Anna  ' },
    { source_kind: 'manual_email', email: ' GESTUR@EXAMPLE.IS ' },
    { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('event action boundaries', () => {
  it('normalizes and sends the exact strict v2 create payload', async () => {
    mockRpc.mockResolvedValue({
      data: { event_id: EVENT_ID, roster_revision: 1 },
      error: null,
    })

    await expect(createEvent(validInput)).resolves.toEqual({
      ok: true,
      data: { eventId: EVENT_ID, rosterRevision: 1 },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_create', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_name: 'Kvisskvöld',
      p_guests: [
        { source_kind: 'manual_name', display_name: 'Anna' },
        { source_kind: 'manual_email', email: 'gestur@example.is' },
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
      ],
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}`)
  })

  it('saves one ordered full replacement with revision and retained stable IDs', async () => {
    mockRpc.mockResolvedValue({
      data: { event_id: EVENT_ID, roster_revision: 3 },
      error: null,
    })
    const input = {
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 2,
      guests: [
        { event_guest_id: GUEST_ID },
        { source_kind: 'manual_email', email: 'NEW@example.is' },
      ],
    }

    await expect(saveEventRoster(input)).resolves.toEqual({
      ok: true,
      data: { eventId: EVENT_ID, rosterRevision: 3 },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_replace_roster', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
      p_request_id: REQUEST_ID,
      p_expected_roster_revision: 2,
      p_guests: [
        { event_guest_id: GUEST_ID },
        { source_kind: 'manual_email', email: 'new@example.is' },
      ],
    })
  })

  it.each([
    { ...validInput, extra: 'not allowed' },
    { ...validInput, guests: [{ source_kind: 'relationship', relationship_id: RELATIONSHIP_ID, user_id: ACTOR_ID }] },
    { ...validInput, guests: [{ source_kind: 'manual_name', display_name: 'anna@example.is' }] },
    { ...validInput, guests: [{ source_kind: 'manual_email', email: 'not-an-email' }] },
    { ...validInput, guests: Array.from({ length: 50 }, () => ({ source_kind: 'manual_name', display_name: 'Gestur' })) },
    { ...validInput, name: 'Bad\u202ename' },
  ])('rejects non-contract or unsafe create input before any RPC', async (input) => {
    await expect(createEvent(input)).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects duplicate retained IDs, Relationships and canonical emails before any roster RPC', async () => {
    for (const guests of [
      [{ event_guest_id: GUEST_ID }, { event_guest_id: GUEST_ID }],
      [
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
        { source_kind: 'relationship', relationship_id: RELATIONSHIP_ID },
      ],
      [
        { source_kind: 'manual_email', email: 'same@example.is' },
        { source_kind: 'manual_email', email: ' SAME@example.is ' },
      ],
    ]) {
      await expect(saveEventRoster({
        event_id: EVENT_ID,
        request_id: REQUEST_ID,
        expected_roster_revision: 1,
        guests,
      })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('preserves guard redirects and maps stale conflicts without logging private details', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/')
    mockGuardEventAccess.mockRejectedValueOnce(redirectSignal)
    await expect(createEvent(validInput)).rejects.toBe(redirectSignal)

    mockGuardEventAccess.mockResolvedValue({ user: { id: ACTOR_ID } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'teskeid_event_roster_conflict private@example.is' },
    })
    await expect(saveEventRoster({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ ok: false, error: 'conflict' })
    expect(consoleError).toHaveBeenCalledWith('[events] roster save failed')
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('private@example.is'))
  })

  it('maps a semantic duplicate-guest conflict to correctable invalid input', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'teskeid_event_guest_conflict' },
    })

    await expect(saveEventRoster({
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(consoleError).toHaveBeenCalledWith('[events] roster save failed')
  })
})

describe('owner-safe independent event repository', () => {
  it('maps the exact bounded list projection with no expense metadata', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        active_guest_count: 2,
        roster_revision: 4,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
      }],
      error: null,
    })

    await expect(listEvents(ACTOR_ID)).resolves.toEqual([{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      guestCount: 2,
      rosterRevision: 4,
      createdAt: '2026-08-15T21:53:00.000Z',
      updatedAt: '2026-08-16T08:00:00.000Z',
    }])
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_list', { p_actor_id: ACTOR_ID })
  })

  it('maps ordered owner detail and exposes raw email only for manual_email', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 2,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
        guests: [{
          event_guest_id: GUEST_ID,
          source_kind: 'manual_email',
          display_name: 'gestur@example.is',
          email: 'GESTUR@example.is',
          is_teskeid_user: false,
          position: 0,
        }],
      },
      error: null,
    })

    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toEqual({
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 2,
      createdAt: '2026-08-15T21:53:00.000Z',
      updatedAt: '2026-08-16T08:00:00.000Z',
      guests: [{
        id: GUEST_ID,
        sourceKind: 'manual_email',
        displayName: 'gestur@example.is',
        email: 'gestur@example.is',
        isTeskeidUser: false,
        position: 0,
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
  })

  it('keeps an anonymized relationship snapshot readable after linked-attendee deletion', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 2,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-16T08:00:00.000Z',
        guests: [{
          event_guest_id: GUEST_ID,
          source_kind: 'relationship',
          display_name: 'Varðveitt nafn',
          email: null,
          is_teskeid_user: false,
          position: 0,
        }],
      },
      error: null,
    })

    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toMatchObject({
      guests: [{
        id: GUEST_ID,
        sourceKind: 'relationship',
        displayName: 'Varðveitt nafn',
        email: null,
        isTeskeidUser: false,
      }],
    })
  })

  it.each(['teskeid_event_not_found', 'teskeid_event_not_allowed'])(
    'collapses %s to null for IDOR safety',
    async (message) => {
      mockRpc.mockResolvedValue({ data: { private: true }, error: { message } })
      await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toBeNull()
    },
  )

  it.each(['linked_user_id', 'relationship_id', 'owner_id', 'recipient_email'])(
    'rejects sensitive list projection key %s',
    async (forbiddenKey) => {
      mockRpc.mockResolvedValue({
        data: [{
          event_id: EVENT_ID,
          name: 'Kvisskvöld',
          active_guest_count: 0,
          roster_revision: 1,
          created_at: '2026-08-15T21:53:00.000Z',
          updated_at: '2026-08-15T21:53:00.000Z',
          [forbiddenKey]: 'private',
        }],
        error: null,
      })
      await expect(listEvents(ACTOR_ID)).rejects.toThrow('event_load_failed')
    },
  )

  it('fails closed when an exact event RPC returns another event ID', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: PARTY_A,
        name: 'Wrong event',
        roster_revision: 1,
        created_at: '2026-08-15T21:53:00.000Z',
        updated_at: '2026-08-15T21:53:00.000Z',
        guests: [],
      },
      error: null,
    })
    await expect(getEventContext(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_load_failed')
  })

  it('returns null for malformed IDs without an RPC', async () => {
    await expect(getEventContext(ACTOR_ID, 'not-a-uuid')).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('owner-safe financial event projections', () => {
  it('maps picker sources without emails or linked identities', async () => {
    mockRpc.mockResolvedValue({
      data: {
        events: [{
          event_id: EVENT_ID,
          name: 'Kvisskvöld',
          roster_revision: 2,
          guests: [{
            event_guest_id: GUEST_ID,
            display_name: 'Anna',
            source_kind: 'manual_name',
            position: 0,
          }],
        }],
      },
      error: null,
    })
    const expected = [{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      rosterRevision: 2,
      guests: [{ id: GUEST_ID, displayName: 'Anna', sourceKind: 'manual_name' }],
    }]
    await expect(listEventExpenseSources(ACTOR_ID)).resolves.toEqual(expected)
    mockRpc.mockClear()
    mockRpc.mockResolvedValue({ data: {
      event_id: EVENT_ID,
      name: 'Kvisskvöld',
      roster_revision: 2,
      guests: [{
        event_guest_id: GUEST_ID,
        display_name: 'Anna',
        source_kind: 'manual_name',
        position: 0,
      }],
    }, error: null })
    await expect(getOwnedEventExpenseSource(ACTOR_ID, EVENT_ID)).resolves.toEqual(expected[0])
    expect(mockRpc).toHaveBeenLastCalledWith('teskeid_event_get_expense_source', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
  })

  it('uses an exact owner-scoped lookup rather than the bounded recent-event directory', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        name: 'Elsti viðburðurinn',
        roster_revision: 8,
        guests: [],
      },
      error: null,
    })

    await expect(getOwnedEventExpenseSource(ACTOR_ID, EVENT_ID)).resolves.toMatchObject({
      id: EVENT_ID,
      name: 'Elsti viðburðurinn',
      rosterRevision: 8,
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_get_expense_source', expect.any(Object))
  })

  it('maps exact ready preview status, transfers, pending counts and blocked reasons', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 2,
        currencies: [{
          currency: 'ISK',
          state: 'open',
          transfers: [{
            from_party_id: PARTY_A,
            to_party_id: PARTY_B,
            from_display_name: 'Anna',
            to_display_name: 'Bjarni',
            amount_minor: 12500,
          }],
          pending_repayment_count: 0,
          blocked_parties: [],
        }, {
          currency: 'EUR',
          state: 'pending',
          transfers: [],
          pending_repayment_count: 1,
          blocked_parties: [{
            party_id: PARTY_A,
            display_name: 'Anna',
            reason: 'unresolved_identity',
          }],
        }],
      },
      error: null,
    })

    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).resolves.toEqual({
      eventId: EVENT_ID,
      status: 'ready',
      taggedExpenseCount: 2,
      currencies: [{
        currency: 'ISK',
        state: 'open',
        transfers: [{
          fromPartyId: PARTY_A,
          toPartyId: PARTY_B,
          fromDisplayName: 'Anna',
          toDisplayName: 'Bjarni',
          amountMinor: 12500,
        }],
        pendingRepaymentCount: 0,
        blocked: [],
      }, {
        currency: 'EUR',
        state: 'pending',
        transfers: [],
        pendingRepaymentCount: 1,
        blocked: [{
          partyId: PARTY_A,
          displayName: 'Anna',
          reason: 'unresolved_identity',
        }],
      }],
    })
  })

  it('rejects source email leaks and inconsistent preview states', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { events: [{
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        roster_revision: 1,
        guests: [{
          event_guest_id: GUEST_ID,
          display_name: 'Anna',
          source_kind: 'manual_email',
          position: 0,
          email: 'private@example.is',
        }],
      }] },
      error: null,
    })
    await expect(listEventExpenseSources(ACTOR_ID)).rejects.toThrow('event_load_failed')

    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        status: 'none_tagged',
        tagged_expense_count: 1,
        currencies: [],
      },
      error: null,
    })
    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_preview_failed')

    mockRpc.mockResolvedValueOnce({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 2,
        currencies: [],
      },
      error: null,
    })
    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID)).rejects.toThrow('event_preview_failed')
  })

  it.each([
    {
      name: 'an open state without an actionable transfer',
      currency: {
        currency: 'ISK', state: 'open', transfers: [],
        pending_repayment_count: 0, blocked_parties: [],
      },
    },
    {
      name: 'a blocked state with a pending repayment',
      currency: {
        currency: 'ISK', state: 'blocked_manual', transfers: [],
        pending_repayment_count: 1,
        blocked_parties: [{
          party_id: PARTY_A, display_name: 'Anna', reason: 'unresolved_identity',
        }],
      },
    },
    {
      name: 'a pending state with no pending repayment',
      currency: {
        currency: 'ISK', state: 'pending', transfers: [],
        pending_repayment_count: 0, blocked_parties: [],
      },
    },
    {
      name: 'a self-transfer',
      currency: {
        currency: 'ISK', state: 'open', pending_repayment_count: 0, blocked_parties: [],
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_A,
          from_display_name: 'Anna', to_display_name: 'Anna', amount_minor: 100,
        }],
      },
    },
    {
      name: 'duplicate transfers for the same bilateral pair',
      currency: {
        currency: 'ISK', state: 'open', pending_repayment_count: 0, blocked_parties: [],
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_B,
          from_display_name: 'Anna', to_display_name: 'Bjarni', amount_minor: 50,
        }, {
          from_party_id: PARTY_B, to_party_id: PARTY_A,
          from_display_name: 'Bjarni', to_display_name: 'Anna', amount_minor: 50,
        }],
      },
    },
    {
      name: 'a blocked party included in a transfer',
      currency: {
        currency: 'ISK', state: 'pending', pending_repayment_count: 1,
        transfers: [{
          from_party_id: PARTY_A, to_party_id: PARTY_B,
          from_display_name: 'Anna', to_display_name: 'Bjarni', amount_minor: 50,
        }],
        blocked_parties: [{
          party_id: PARTY_A, display_name: 'Anna', reason: 'unresolved_identity',
        }],
      },
    },
  ])('rejects $name in a ready preview', async ({ currency }) => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        status: 'ready',
        tagged_expense_count: 1,
        currencies: [currency],
      },
      error: null,
    })

    await expect(getEventExpensePreview(ACTOR_ID, EVENT_ID))
      .rejects.toThrow('event_preview_failed')
  })
})

describe('legacy SQL131 classifier and direct mutation contracts', () => {
  it('preserves only the bounded legacy classifier RPC', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await expect(isExpenseEventContext(ACTOR_ID, EVENT_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('expense_is_event_context', {
      p_actor_id: ACTOR_ID,
      p_group_id: EVENT_ID,
    })
  })

  it('returns exact create and roster mutation identities', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: { event_id: EVENT_ID, roster_revision: 1 }, error: null })
      .mockResolvedValueOnce({ data: { event_id: EVENT_ID, roster_revision: 2 }, error: null })
    await expect(createEventContext(ACTOR_ID, {
      request_id: REQUEST_ID,
      name: 'Kvisskvöld',
      guests: [],
    })).resolves.toEqual({ eventId: EVENT_ID, rosterRevision: 1 })
    await expect(replaceEventRoster(ACTOR_ID, {
      event_id: EVENT_ID,
      request_id: REQUEST_ID,
      expected_roster_revision: 1,
      guests: [],
    })).resolves.toEqual({ eventId: EVENT_ID, rosterRevision: 2 })
  })
})
