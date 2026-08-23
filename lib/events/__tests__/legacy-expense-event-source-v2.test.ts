import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  getLegacyExpenseEventSourceV2,
  listLegacyExpenseEventSourcesV2,
} from '@/lib/events/legacy-expense-event-source-v2.repository.server'
import { LegacyExpenseEventSourceV2SqlSchema } from '@/lib/events/legacy-expense-event-source-v2.contracts'

const actorId = '10000000-0000-4000-8000-000000000001'
const eventId = '20000000-0000-4000-8000-000000000001'
const guestRef = '30000000-0000-4000-8000-000000000001'
const organizerLegacyRef = '30000000-0000-4000-8000-000000000002'

function person(overrides: Record<string, unknown> = {}) {
  return {
    legacy_person_ref: guestRef,
    participant_kind: 'guest',
    position: 0,
    shared: {
      access_state: 'active',
      label_state: 'resolved',
      display_name: 'Berglind',
      selectable: true,
      disabled_reason: null,
    },
    ...overrides,
  }
}

function ownerEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: eventId,
    name: 'Landsmót',
    roster_revision: '9007199254740993',
    viewer_role: 'owner',
    people: [person()],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
})

describe('SQL149 legacy Expense Event source v2', () => {
  it('preserves the exact legacy guest ref and bigint string for owner reads', async () => {
    mockRpc.mockResolvedValueOnce({ data: { events: [ownerEvent()] }, error: null })
    await expect(listLegacyExpenseEventSourcesV2(actorId)).resolves.toEqual([{
      eventId,
      name: 'Landsmót',
      rosterRevision: '9007199254740993',
      viewerRole: 'owner',
      people: [{
        legacyPersonRef: guestRef,
        participantKind: 'guest',
        position: 0,
        shared: {
          accessState: 'active',
          labelState: 'resolved',
          displayName: 'Berglind',
          selectable: true,
          disabledReason: null,
        },
      }],
    }])
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_list_legacy_expense_sources_v2',
      { p_actor_id: actorId },
    )
  })

  it('preserves the server-issued attendee organizer ref without canonical translation', async () => {
    const payload = ownerEvent({
      viewer_role: 'attendee',
      people: [person({
        legacy_person_ref: organizerLegacyRef,
        participant_kind: 'organizer',
        position: 0,
        shared: {
          label_state: 'resolved', display_name: 'Stebbi',
          selectable: true, disabled_reason: null,
        },
      }), person({ position: 1 })],
    })
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(getLegacyExpenseEventSourceV2(actorId, eventId)).resolves.toMatchObject({
      viewerRole: 'attendee',
      people: [
        { legacyPersonRef: organizerLegacyRef, participantKind: 'organizer' },
        { legacyPersonRef: guestRef, participantKind: 'guest' },
      ],
    })
    expect(mockRpc).toHaveBeenCalledWith(
      'teskeid_event_get_legacy_expense_source_v2',
      { p_actor_id: actorId, p_event_id: eventId },
    )
  })

  it('keeps shared financial presentation separate from viewer-private data', async () => {
    const payload = ownerEvent({
      people: [person({
        viewer_private: {
          kind: 'relationship',
          alias: 'Mitt nafn',
          email: 'biggi@example.is',
          built_in_tags: ['friends'],
          custom_labels: ['Golf'],
          hidden_custom_label_count: 2,
          note: 'Einkaathugasemd',
        },
      })],
    })
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    const result = await getLegacyExpenseEventSourceV2(actorId, eventId)
    expect(result?.people[0]).toMatchObject({
      legacyPersonRef: guestRef,
      shared: { displayName: 'Berglind' },
      viewerPrivate: {
        alias: 'Mitt nafn',
        email: 'biggi@example.is',
        builtInTags: ['friends'],
        customLabels: ['Golf'],
        hiddenCustomLabelCount: 2,
        note: 'Einkaathugasemd',
      },
    })
    expect(result?.people[0]?.shared.displayName).not.toBe(result?.people[0]?.viewerPrivate?.alias)
  })

  it('represents unresolved legacy names explicitly and disables only that row', () => {
    expect(LegacyExpenseEventSourceV2SqlSchema.safeParse(ownerEvent({
      people: [person({
        shared: {
          access_state: 'active',
          label_state: 'needs_owner_input',
          display_name: null,
          selectable: false,
          disabled_reason: 'name_required',
        },
      })],
    })).success).toBe(true)
    expect(LegacyExpenseEventSourceV2SqlSchema.safeParse(ownerEvent({
      people: [person({
        shared: {
          access_state: 'active',
          label_state: 'needs_owner_input',
          display_name: null,
          selectable: true,
          disabled_reason: 'name_required',
        },
      })],
    })).success).toBe(false)
  })

  it.each(['left', 'revoked'] as const)(
    'keeps a terminal %s guest visible but never selectable',
    async (accessState) => {
      mockRpc.mockResolvedValueOnce({
        data: ownerEvent({
          people: [person({
            shared: {
              access_state: accessState,
              label_state: 'resolved',
              display_name: 'Berglind',
              selectable: false,
              disabled_reason: 'not_active',
            },
          })],
        }),
        error: null,
      })
      await expect(getLegacyExpenseEventSourceV2(actorId, eventId)).resolves.toMatchObject({
        people: [{
          participantKind: 'guest',
          shared: {
            accessState,
            selectable: false,
            disabledReason: 'not_active',
          },
        }],
      })
    },
  )

  it('rejects terminal guests projected as selectable', () => {
    expect(LegacyExpenseEventSourceV2SqlSchema.safeParse(ownerEvent({
      people: [person({
        shared: {
          access_state: 'left',
          label_state: 'resolved',
          display_name: 'Berglind',
          selectable: true,
          disabled_reason: null,
        },
      })],
    })).success).toBe(false)
  })

  it.each([
    ownerEvent({ people: [person({ person_ref: guestRef })] }),
    ownerEvent({ people: [person({ source_kind: 'manual_name' })] }),
    ownerEvent({ people: [person({ email: 'private@example.is' })] }),
    ownerEvent({ people: [person({ shared: { ...person().shared, display_name: 'private@example.is' } })] }),
    ownerEvent({ people: [person({ viewer_private: null })] }),
    ownerEvent({ people: [person({ participant_kind: 'organizer' })] }),
    ownerEvent({ people: [person({ position: 1 })] }),
  ])('fails closed on ref translation, private leakage or legacy shape drift %#', async (payload) => {
    mockRpc.mockResolvedValueOnce({ data: payload, error: null })
    await expect(getLegacyExpenseEventSourceV2(actorId, eventId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('rejects a canonical person ref even when the legacy ref is also present', () => {
    const payload = ownerEvent({
      people: [person({ person_ref: '30000000-0000-4000-8000-000000000099' })],
    })
    expect(LegacyExpenseEventSourceV2SqlSchema.safeParse(payload).success).toBe(false)
  })

  it('bounds errors without substring matching and hides existence for exact misses', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'teskeid_event_not_found' } })
    await expect(getLegacyExpenseEventSourceV2(actorId, eventId)).resolves.toBeNull()

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'prefix_teskeid_event_not_found_suffix' },
    })
    await expect(getLegacyExpenseEventSourceV2(actorId, eventId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('rejects invalid IDs before transport and duplicate list events', async () => {
    await expect(listLegacyExpenseEventSourcesV2('invalid'))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()

    mockRpc.mockResolvedValueOnce({
      data: { events: [ownerEvent(), ownerEvent()] },
      error: null,
    })
    await expect(listLegacyExpenseEventSourcesV2(actorId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('rejects attendee rows from the owner-only legacy list', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        events: [ownerEvent({
          viewer_role: 'attendee',
          people: [person({
            legacy_person_ref: organizerLegacyRef,
            participant_kind: 'organizer',
            position: 0,
            shared: {
              label_state: 'resolved',
              display_name: 'Stebbi',
              selectable: true,
              disabled_reason: null,
            },
          }), person({ position: 1 })],
        })],
      },
      error: null,
    })
    await expect(listLegacyExpenseEventSourcesV2(actorId))
      .rejects.toMatchObject({ code: 'load_failed' })
  })

  it('bounds thrown legacy read transport failures', async () => {
    mockRpc.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(getLegacyExpenseEventSourceV2(actorId, eventId))
      .rejects.toMatchObject({ code: 'load_failed', message: 'event_v2_load_failed' })
  })
})
