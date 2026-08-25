import { describe, expect, it } from 'vitest'
import {
  ExpenseDraftPayloadSchema,
  getExpenseDraftAttention,
  hydrateExpenseDraftEventGuestLabels,
  redactExpenseDraftEventGuestLabels,
  type ExpenseDraftPayload,
} from '@/lib/expenses/drafts'

function payload(overrides: Partial<ExpenseDraftPayload> = {}): ExpenseDraftPayload {
  return {
    circleId: null,
    eventId: null,
    eventRosterRevision: null,
    eventVisibility: 'participants_only',
    members: [
      { key: 'self', label: 'Ég', isSelf: true },
      { key: 'anna', label: 'Anna', isSelf: false },
    ],
    removedMemberIds: [],
    included: { self: true, anna: true },
    title: 'Prófun',
    total: '100000',
    currency: 'ISK',
    incurredOn: '2026-08-06',
    category: '',
    note: '',
    splitMethod: 'fixed',
    payments: { self: '100000', anna: '' },
    payerKeys: ['self'],
    amounts: { self: '10000', anna: '10000' },
    percentages: { self: '50', anna: '50' },
    weights: { self: '1', anna: '1' },
    preserveShares: false,
    ...overrides,
  }
}

describe('incomplete expense draft attention', () => {
  it('reports an 80,000 ISK unallocated remainder without creating a ledger result', () => {
    expect(getExpenseDraftAttention(payload())).toEqual({
      totalMinor: 100_000,
      differenceMinor: 80_000,
    })
  })

  it('stops flagging the draft once the fixed allocation balances exactly', () => {
    expect(getExpenseDraftAttention(payload({
      amounts: { self: '50000', anna: '50000' },
    }))).toBeNull()
  })

  it('uses the same one-share default as the form for older weighted drafts', () => {
    expect(getExpenseDraftAttention(payload({
      splitMethod: 'weighted',
      weights: {},
    }))).toBeNull()
  })

  it('round-trips the pinned event and exact guest provenance in a private draft', () => {
    const eventId = '81000000-0000-4000-8000-000000000001'
    const eventGuestId = '82000000-0000-4000-8000-000000000001'
    const parsed = ExpenseDraftPayloadSchema.parse(payload({
      eventId,
      eventRosterRevision: 7,
      eventVisibility: 'all_event',
      members: [
        { key: 'self', label: 'Ég', isSelf: true },
        {
          key: `event:${eventGuestId}`,
          label: 'Anna',
          isSelf: false,
          input: { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
        },
      ],
      included: { self: true, [`event:${eventGuestId}`]: true },
      payments: { self: '100000', [`event:${eventGuestId}`]: '' },
      payerKeys: ['self'],
      amounts: { self: '50000', [`event:${eventGuestId}`]: '50000' },
      percentages: { self: '50', [`event:${eventGuestId}`]: '50' },
      weights: { self: '1', [`event:${eventGuestId}`]: '1' },
    }))

    expect(parsed.eventId).toBe(eventId)
    expect(parsed.eventRosterRevision).toBe(7)
    expect(parsed.eventVisibility).toBe('all_event')
    expect(parsed.members[1]?.input).toEqual({
      type: 'event_guest',
      key: `event:${eventGuestId}`,
      event_guest_id: eventGuestId,
    })

    const redacted = redactExpenseDraftEventGuestLabels(parsed)
    expect(redacted.members[1]).toMatchObject({
      label: 'Event participant',
      input: { type: 'event_guest', event_guest_id: eventGuestId },
    })
    expect(JSON.stringify(redacted)).not.toContain('Anna')

    expect(hydrateExpenseDraftEventGuestLabels(redacted, {
      id: eventId,
      guests: [{ id: eventGuestId, displayName: 'Nýtt nafn' }],
    }, 'Gestur úr viðburði').members[1]?.label).toBe('Nýtt nafn')
    expect(hydrateExpenseDraftEventGuestLabels(
      redacted,
      null,
      'Gestur úr viðburði',
    ).members[1]?.label).toBe('Gestur úr viðburði')
  })

  it('keeps older drafts standalone while failing closed on ambiguous event state', () => {
    const legacyPayload: Record<string, unknown> = { ...payload() }
    delete legacyPayload.eventId
    delete legacyPayload.eventRosterRevision
    delete legacyPayload.eventVisibility
    expect(ExpenseDraftPayloadSchema.parse(legacyPayload)).toMatchObject({
      eventId: null,
      eventRosterRevision: null,
      eventVisibility: 'participants_only',
    })

    const eventGuestId = '82000000-0000-4000-8000-000000000001'
    expect(ExpenseDraftPayloadSchema.safeParse(payload({
      eventId: '81000000-0000-4000-8000-000000000001',
      eventRosterRevision: null,
    })).success).toBe(false)
    expect(ExpenseDraftPayloadSchema.safeParse(payload({
      circleId: '83000000-0000-4000-8000-000000000001',
      eventId: '81000000-0000-4000-8000-000000000001',
      eventRosterRevision: 2,
    })).success).toBe(false)
    expect(ExpenseDraftPayloadSchema.safeParse(payload({
      eventId: '81000000-0000-4000-8000-000000000001',
      eventRosterRevision: 2,
      members: [
        { key: 'self', label: 'Ég', isSelf: true },
        { key: 'first', label: 'Anna', isSelf: false, input: { type: 'event_guest', key: 'first', event_guest_id: eventGuestId } },
        { key: 'second', label: 'Anna aftur', isSelf: false, input: { type: 'event_guest', key: 'second', event_guest_id: eventGuestId } },
      ],
    })).success).toBe(false)
  })
})
