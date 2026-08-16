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

import { createEvent } from '@/lib/events/actions'
import {
  createEventContext,
  getEventContext,
  isExpenseEventContext,
  listEvents,
} from '@/lib/events/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'
const EVENT_ID = '30000000-0000-4000-8000-000000000001'
const MEMBER_ID = '40000000-0000-4000-8000-000000000001'
const RELATIONSHIP_ID = '50000000-0000-4000-8000-000000000001'

const validInput = {
  request_id: REQUEST_ID,
  name: '  Kvisskvöld  ',
  participants: [
    { type: 'guest', display_name: '  Anna  ' },
    { type: 'relationship', relationship_id: RELATIONSHIP_ID },
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

describe('createEvent action boundary', () => {
  it('sends only guest names and owner-scoped relationship IDs to the atomic RPC', async () => {
    mockRpc.mockResolvedValue({ data: { event_id: EVENT_ID }, error: null })

    await expect(createEvent(validInput)).resolves.toEqual({
      ok: true,
      data: { eventId: EVENT_ID },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_create_event_context', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_name: 'Kvisskvöld',
      p_participants: [
        { type: 'guest', display_name: 'Anna' },
        { type: 'relationship', relationship_id: RELATIONSHIP_ID },
      ],
    })
    const payload = mockRpc.mock.calls[0]![1]
    expect(JSON.stringify(payload)).not.toMatch(/user_id|linked_user|email|picker_label|private_display_name/i)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/auth-mvp/vidburdir/${EVENT_ID}`)
  })

  it.each([
    { ...validInput, extra: 'not allowed' },
    { ...validInput, participants: [{ type: 'relationship', relationship_id: RELATIONSHIP_ID, user_id: ACTOR_ID }] },
    { ...validInput, participants: [{ type: 'guest', display_name: 'Anna', email: 'anna@example.is' }] },
    { ...validInput, participants: [{ type: 'guest', display_name: 'anna@example.is' }] },
    { ...validInput, participants: Array.from({ length: 50 }, () => ({ type: 'guest', display_name: 'Gestur' })) },
    { ...validInput, name: 'Bad\u202ename' },
  ])('rejects non-contract or unsafe input before any RPC', async (input) => {
    await expect(createEvent(input)).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not translate a guard redirect into an action result', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/')
    mockGuardEventAccess.mockRejectedValue(redirectSignal)

    await expect(createEvent(validInput)).rejects.toBe(redirectSignal)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('maps a same-key changed-payload conflict without logging database details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'expense_idempotency_conflict private@example.is' },
    })

    await expect(createEvent(validInput)).resolves.toEqual({ ok: false, error: 'conflict' })
    expect(consoleError).toHaveBeenCalledWith('[events] create failed')
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('private@example.is'))
  })

  it('maps the SQL participant conflict without exposing its database label', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'expense_event_participant_conflict' },
    })

    await expect(createEvent(validInput)).resolves.toEqual({ ok: false, error: 'conflict' })
  })
})

describe('owner-safe event repository projections', () => {
  it('maps the exact bounded list projection without exposing identity links', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        participant_count: 2,
        expense_count: 1,
        created_at: '2026-08-15T21:53:00.000Z',
      }],
      error: null,
    })

    await expect(listEvents(ACTOR_ID)).resolves.toEqual([{
      id: EVENT_ID,
      name: 'Kvisskvöld',
      participantCount: 2,
      expenseCount: 1,
      createdAt: '2026-08-15T21:53:00.000Z',
    }])
    expect(mockRpc).toHaveBeenCalledWith('expense_list_event_contexts', {
      p_actor_id: ACTOR_ID,
    })
  })

  it('maps detail member IDs to opaque app IDs and preserves canonical ordering', async () => {
    mockRpc.mockResolvedValue({
      data: {
        event_id: EVENT_ID,
        name: 'Kvisskvöld',
        created_at: '2026-08-15T21:53:00.000Z',
        participants: [{
          member_id: MEMBER_ID,
          display_name: 'Anna',
          is_teskeid_user: true,
          position: 0,
        }],
      },
      error: null,
    })

    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toEqual({
      id: EVENT_ID,
      name: 'Kvisskvöld',
      createdAt: '2026-08-15T21:53:00.000Z',
      participants: [{ id: MEMBER_ID, displayName: 'Anna', isTeskeidUser: true, position: 0 }],
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_get_event_context', {
      p_actor_id: ACTOR_ID,
      p_event_id: EVENT_ID,
    })
  })

  it.each(['expense_event_not_found', 'expense_event_not_allowed'])('collapses %s to null for IDOR safety', async (message) => {
    mockRpc.mockResolvedValue({ data: { private: true }, error: { message } })
    await expect(getEventContext(ACTOR_ID, EVENT_ID)).resolves.toBeNull()
  })

  it.each(['linked_user_id', 'linkedUserId'])(
    'rejects a projection that accidentally contains linked identity data as %s',
    async forbiddenKey => {
      mockRpc.mockResolvedValue({
        data: [{
          event_id: EVENT_ID,
          name: 'Kvisskvöld',
          participant_count: 1,
          expense_count: 0,
          created_at: '2026-08-15T21:53:00.000Z',
          [forbiddenKey]: '90000000-0000-4000-8000-000000000001',
        }],
        error: null,
      })

      await expect(listEvents(ACTOR_ID)).rejects.toThrow('event_load_failed')
    },
  )

  it('returns null for malformed IDs without making an existence query', async () => {
    await expect(getEventContext(ACTOR_ID, 'not-a-uuid')).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('expense-authorized event classifier', () => {
  it('uses only the bounded classifier RPC and returns its boolean', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await expect(isExpenseEventContext(ACTOR_ID, EVENT_ID)).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('expense_is_event_context', {
      p_actor_id: ACTOR_ID,
      p_group_id: EVENT_ID,
    })
  })

  it('returns false only for an authoritative non-event and skips malformed IDs', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: false, error: null })

    await expect(isExpenseEventContext(ACTOR_ID, EVENT_ID)).resolves.toBe(false)
    await expect(isExpenseEventContext(ACTOR_ID, 'invalid')).resolves.toBe(false)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it.each([
    { data: null, error: null },
    { data: 'false', error: null },
    { data: null, error: { message: 'expense_not_allowed' } },
    { data: null, error: { message: 'expense_not_found' } },
  ])('fails closed for malformed or unauthorized classifier result %#', async result => {
    mockRpc.mockResolvedValue(result)
    await expect(isExpenseEventContext(ACTOR_ID, EVENT_ID))
      .rejects.toThrow('event_classification_failed')
  })
})

describe('direct repository create contract', () => {
  it('returns only the event ID from scalar JSON', async () => {
    mockRpc.mockResolvedValue({ data: { event_id: EVENT_ID }, error: null })
    await expect(createEventContext(ACTOR_ID, {
      request_id: REQUEST_ID,
      name: 'Kvisskvöld',
      participants: [],
    })).resolves.toEqual({ eventId: EVENT_ID })
  })
})
