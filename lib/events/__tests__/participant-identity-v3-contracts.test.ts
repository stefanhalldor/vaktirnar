import { describe, expect, it } from 'vitest'
import {
  EventActorViewV3SqlSchema,
  EventPersonSourceV3RosterSqlSchema,
  EventV3PrivateNoteInputSchema,
  EventV3RsvpStateSchema,
  SetEventRsvpV3InputSchema,
} from '@/lib/events/participant-identity-v3.contracts'

const EVENT_ID = '20000000-0000-4000-8000-000000000001'
const ORGANIZER_REF = '30000000-0000-4000-8000-000000000001'
const SELF_GUEST_REF = '30000000-0000-4000-8000-000000000002'
const OTHER_GUEST_REF = '30000000-0000-4000-8000-000000000003'
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const TIMESTAMP = '2026-08-23T10:00:00.000+00:00'

function organizer(isSelf: boolean) {
  return {
    person_ref: ORGANIZER_REF,
    participant_kind: 'organizer' as const,
    position: 0 as const,
    is_self: isSelf,
    shared: {
      label_state: 'resolved' as const,
      display_name: 'Stebbi',
      selectable: true,
      bulk_eligible: true,
      disabled_reason: null,
    },
  }
}

function guest({
  personRef = SELF_GUEST_REF,
  position = 1,
  isSelf = false,
  state = 'no_response',
  privateNote,
}: {
  personRef?: string
  position?: number
  isSelf?: boolean
  state?: 'no_response' | 'considering' | 'attending' | 'not_attending'
  privateNote?: string
} = {}) {
  return {
    person_ref: personRef,
    participant_kind: 'guest' as const,
    position,
    is_self: isSelf,
    shared: {
      access_state: 'active' as const,
      rsvp_state: state,
      label_state: 'resolved' as const,
      display_name: isSelf ? 'Anna' : 'Berglind',
      selectable: true,
      bulk_eligible: state !== 'not_attending',
      disabled_reason: null,
    },
    label_version: '1',
    identity_version: '2',
    identity_generation: '1',
    access_version: '3',
    rsvp: {
      state,
      decision_version: '4',
      ...(privateNote === undefined ? {} : { private_note: privateNote }),
    },
  }
}

function actorView(overrides: Record<string, unknown> = {}) {
  return {
    event_id: EVENT_ID,
    name: 'Kvisskvöld',
    roster_revision: '9',
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    event_date: null,
    event_time: null,
    description: 'Lýsing',
    agenda: null,
    viewer_role: 'attendee' as const,
    people: [
      organizer(false),
      guest({ isSelf: true, state: 'considering', privateNote: 'Er að redda pössun' }),
      guest({ personRef: OTHER_GUEST_REF, position: 2, state: 'attending' }),
    ],
    self_rsvp: {
      state: 'considering' as const,
      decision_version: '4',
      private_note: 'Er að redda pössun',
    },
    ...overrides,
  }
}

describe('SQL153 participant identity v3 contracts', () => {
  it('accepts exactly the four v3 RSVP states', () => {
    expect(EventV3RsvpStateSchema.options).toEqual([
      'no_response',
      'considering',
      'attending',
      'not_attending',
    ])
    expect(EventV3RsvpStateSchema.safeParse('pending').success).toBe(false)
  })

  it('normalizes a bounded considering note and rejects private-note control characters', () => {
    expect(EventV3PrivateNoteInputSchema.parse('  A\u0301kveður  ')).toBe('Ákveður')
    expect(EventV3PrivateNoteInputSchema.parse('   ')).toBeNull()
    expect(EventV3PrivateNoteInputSchema.safeParse('lína 1\nlína 2').success).toBe(false)
    expect(EventV3PrivateNoteInputSchema.safeParse(`ákveður\u202E`).success).toBe(false)
    expect(EventV3PrivateNoteInputSchema.safeParse('a'.repeat(4097)).success).toBe(false)
    expect(EventV3PrivateNoteInputSchema.safeParse('🥄'.repeat(241)).success).toBe(false)
  })

  it('requires SQL NULL for a non-considering note after canonicalization', () => {
    const base = {
      event_id: EVENT_ID,
      event_guest_id: SELF_GUEST_REF,
      identity_generation: '1',
      expected_decision_version: '4',
      request_id: REQUEST_ID,
    }
    expect(SetEventRsvpV3InputSchema.safeParse({
      ...base,
      rsvp_state: 'attending',
      private_note: 'Er að redda pössun',
    }).success).toBe(false)
    expect(SetEventRsvpV3InputSchema.parse({
      ...base,
      rsvp_state: 'attending',
      private_note: '   ',
    }).private_note).toBeNull()
  })

  it('shows an attendee only their own RSVP note and requires an exact self echo', () => {
    expect(EventActorViewV3SqlSchema.safeParse(actorView()).success).toBe(true)

    const otherWithNote = actorView({
      people: [
        organizer(false),
        guest({ isSelf: true, state: 'considering', privateNote: 'Er að redda pössun' }),
        guest({
          personRef: OTHER_GUEST_REF,
          position: 2,
          state: 'considering',
          privateNote: 'Má ekki leka',
        }),
      ],
    })
    expect(EventActorViewV3SqlSchema.safeParse(otherWithNote).success).toBe(false)
    expect(EventActorViewV3SqlSchema.safeParse(actorView({
      self_rsvp: {
        state: 'considering',
        decision_version: '5',
        private_note: 'Er að redda pössun',
      },
    })).success).toBe(false)
  })

  it('fails closed if an inactive former participant appears in a live people projection', () => {
    const self = guest({ isSelf: true, state: 'considering', privateNote: 'Er að redda pössun' })
    expect(EventActorViewV3SqlSchema.safeParse(actorView({
      people: [
        organizer(false),
        {
          ...self,
          shared: {
            ...self.shared,
            access_state: 'left',
            selectable: false,
            bulk_eligible: false,
            disabled_reason: 'not_active',
          },
        },
      ],
    })).success).toBe(false)
  })

  it('permits owner-authorized notes in actor view but forbids all RSVP notes in person-source rosters', () => {
    const ownerPeople = [
      organizer(true),
      guest({ state: 'considering', privateNote: 'Gestgjafi má sjá þetta' }),
    ]
    expect(EventActorViewV3SqlSchema.safeParse(actorView({
      viewer_role: 'owner',
      people: ownerPeople,
      self_rsvp: undefined,
    })).success).toBe(false)

    const { self_rsvp: _selfRsvp, ...ownerView } = actorView({
      viewer_role: 'owner',
      people: ownerPeople,
    })
    expect(EventActorViewV3SqlSchema.safeParse(ownerView).success).toBe(true)
    expect(EventPersonSourceV3RosterSqlSchema.safeParse({
      event_id: EVENT_ID,
      name: 'Kvisskvöld',
      roster_revision: '9',
      viewer_role: 'owner',
      people: ownerPeople,
    }).success).toBe(false)
  })

  it('rejects the removed top-level rsvp_version wire field', () => {
    const invalid = actorView()
    invalid.people[1] = {
      ...invalid.people[1],
      rsvp_version: '4',
    } as unknown as typeof invalid.people[number]
    expect(EventActorViewV3SqlSchema.safeParse(invalid).success).toBe(false)
  })
})
