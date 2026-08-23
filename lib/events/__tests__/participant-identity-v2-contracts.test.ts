import { describe, expect, it } from 'vitest'
import {
  CreateEventWithParticipationsV2InputSchema,
  CreateEventWithParticipationsV2ResultSqlSchema,
  EventActorViewV2SqlSchema,
  EventPersonSourceV2RosterSqlSchema,
  EventRosterManagementV2SqlSchema,
  EventV2PgBigintSchema,
  EventV2ViewerPrivateSqlSchema,
  RepairEventPersonLabelV2ResultSqlSchema,
  SetEventRsvpV2ResultSqlSchema,
} from '@/lib/events/participant-identity-v2.contracts'

const requestId = '10000000-0000-4000-8000-000000000001'
const eventId = '20000000-0000-4000-8000-000000000001'
const organizerRef = '30000000-0000-4000-8000-000000000001'
const guestRef = '30000000-0000-4000-8000-000000000002'
const invitationId = '40000000-0000-4000-8000-000000000001'
const timestamp = '2026-08-21T15:00:00.000+00:00'

function viewerPrivate() {
  return {
    kind: 'relationship' as const,
    alias: 'Biggi',
    email: 'biggi@example.is',
    built_in_tags: ['unclassified', 'family'] as const,
    custom_labels: ['Golf', 'Melaskóli'],
    hidden_custom_label_count: 2,
    note: 'Minnismiði',
  }
}

function organizer() {
  return {
    person_ref: organizerRef,
    participant_kind: 'organizer' as const,
    position: 0 as const,
    is_self: true,
    shared: {
      label_state: 'resolved' as const,
      display_name: 'Stebbi',
      selectable: true,
      bulk_eligible: true,
      disabled_reason: null,
    },
  }
}

function guest(overrides: Record<string, unknown> = {}) {
  return {
    person_ref: guestRef,
    participant_kind: 'guest' as const,
    position: 1,
    is_self: false,
    shared: {
      access_state: 'active' as const,
      rsvp_state: 'no_response' as const,
      label_state: 'resolved' as const,
      display_name: 'Berglind',
      selectable: true,
      bulk_eligible: true,
      disabled_reason: null,
    },
    label_version: '1',
    identity_version: '2',
    identity_generation: '1',
    access_version: '3',
    rsvp_version: '4',
    ...overrides,
  }
}

function ownerRoster(overrides: Record<string, unknown> = {}) {
  return {
    event_id: eventId,
    name: 'Landsmót',
    roster_revision: '9',
    viewer_role: 'owner' as const,
    people: [organizer(), guest()],
    ...overrides,
  }
}

describe('SQL149 participant identity v2 contracts', () => {
  it('counts bounded canonical text by Unicode code points like PostgreSQL', () => {
    const acceptedName = '🥄'.repeat(160)
    const acceptedSharedName = '🥄'.repeat(120)

    expect(CreateEventWithParticipationsV2InputSchema.safeParse({
      request_id: requestId,
      name: acceptedName,
      guests: [{
        source_kind: 'manual_email',
        email: 'biggi@example.is',
        shared_display_name: acceptedSharedName,
      }],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    }).success).toBe(true)

    expect(CreateEventWithParticipationsV2InputSchema.safeParse({
      request_id: requestId,
      name: `${acceptedName}🥄`,
      guests: [],
      event_date: null,
      event_time: null,
      description: null,
      agenda: null,
    }).success).toBe(false)
    expect(EventV2ViewerPrivateSqlSchema.safeParse({
      ...viewerPrivate(),
      note: '🥄'.repeat(1000),
    }).success).toBe(true)
    expect(EventV2ViewerPrivateSqlSchema.safeParse({
      ...viewerPrivate(),
      note: '🥄'.repeat(1001),
    }).success).toBe(false)
  })

  it.each([
    '1',
    '9223372036854775807',
  ])('accepts an exact positive bigint decimal string: %s', (value) => {
    expect(EventV2PgBigintSchema.safeParse(value).success).toBe(true)
  })

  it.each([
    1,
    '0',
    '01',
    '+1',
    ' 1',
    '9223372036854775808',
  ])('rejects non-canonical bigint wire values: %s', (value) => {
    expect(EventV2PgBigintSchema.safeParse(value).success).toBe(false)
  })

  it('keeps shared and exact viewer-private identity structurally separate', () => {
    const payload = ownerRoster({
      people: [organizer(), guest({ viewer_private: viewerPrivate() })],
    })
    const parsed = EventPersonSourceV2RosterSqlSchema.parse(payload)
    expect(parsed.people[1]).toMatchObject({
      shared: { display_name: 'Berglind' },
      viewer_private: {
        alias: 'Biggi',
        email: 'biggi@example.is',
        built_in_tags: ['unclassified', 'family'],
        custom_labels: ['Golf', 'Melaskóli'],
        hidden_custom_label_count: 2,
      },
    })
    expect(parsed.people[0]).not.toHaveProperty('viewer_private')
    expect(EventV2ViewerPrivateSqlSchema.safeParse({
      ...viewerPrivate(),
      alias: 'Biggi @ golf',
    }).success).toBe(true)
  })

  it.each([
    { ...viewerPrivate(), extra: true },
    { ...viewerPrivate(), built_in_tags: ['family', 'unclassified'] },
    { ...viewerPrivate(), built_in_tags: ['family', 'family'] },
    { ...viewerPrivate(), custom_labels: Array.from({ length: 21 }, (_, index) => `Merki ${index}`) },
    { ...viewerPrivate(), custom_labels: ['Sama', 'Sama'] },
    { ...viewerPrivate(), hidden_custom_label_count: -1 },
    { ...viewerPrivate(), hidden_custom_label_count: 0.5 },
    (({ hidden_custom_label_count: _hidden, ...missing }) => missing)(viewerPrivate()),
    null,
  ])('rejects malformed, drifting or nullable viewer-private overlays %#', (value) => {
    expect(EventV2ViewerPrivateSqlSchema.safeParse(value).success).toBe(false)
  })

  it('discriminates organizer and guest versions exactly', () => {
    expect(EventPersonSourceV2RosterSqlSchema.safeParse(ownerRoster()).success).toBe(true)
    expect(EventPersonSourceV2RosterSqlSchema.safeParse(ownerRoster({
      people: [{ ...organizer(), label_version: '1' }, guest()],
    })).success).toBe(false)
    const { identity_generation: _removed, ...missingGeneration } = guest()
    expect(EventPersonSourceV2RosterSqlSchema.safeParse(ownerRoster({
      people: [organizer(), missingGeneration],
    })).success).toBe(false)
  })

  it.each([
    {
      access_state: 'active', rsvp_state: 'not_attending', label_state: 'resolved',
      display_name: 'Berglind', selectable: true, bulk_eligible: true, disabled_reason: null,
    },
    {
      access_state: 'active', rsvp_state: 'no_response', label_state: 'needs_owner_input',
      display_name: null, selectable: true, bulk_eligible: false, disabled_reason: 'name_required',
    },
    {
      access_state: 'left', rsvp_state: 'attending', label_state: 'resolved',
      display_name: 'Berglind', selectable: true, bulk_eligible: false, disabled_reason: 'not_active',
    },
  ])('rejects an impossible RSVP/access/capability combination %#', (shared) => {
    expect(EventPersonSourceV2RosterSqlSchema.safeParse(ownerRoster({
      people: [organizer(), guest({ shared })],
    })).success).toBe(false)
  })

  it('accepts not-attending as individually selectable but not bulk eligible', () => {
    const payload = ownerRoster({
      people: [organizer(), guest({
        shared: {
          access_state: 'active', rsvp_state: 'not_attending', label_state: 'resolved',
          display_name: 'Berglind', selectable: true, bulk_eligible: false, disabled_reason: null,
        },
      })],
    })
    expect(EventPersonSourceV2RosterSqlSchema.safeParse(payload).success).toBe(true)
  })

  it('requires the same safe shared name for every manual-email input', () => {
    const base = {
      request_id: requestId,
      name: 'Viðburður',
      event_date: null,
      event_time: null,
      description: '',
      agenda: '',
    }
    const parsed = CreateEventWithParticipationsV2InputSchema.parse({
      ...base,
      guests: [{
        source_kind: 'manual_email',
        email: ' B.Iggi@GMAIL.com ',
        shared_display_name: '  Biggi  ',
      }],
    })
    expect(parsed.guests).toEqual([{
      source_kind: 'manual_email',
      email: 'biggi@gmail.com',
      shared_display_name: 'Biggi',
    }])
    expect(CreateEventWithParticipationsV2InputSchema.safeParse({
      ...base,
      guests: [{ source_kind: 'manual_email', email: 'biggi@example.is' }],
    }).success).toBe(false)
    expect(CreateEventWithParticipationsV2InputSchema.safeParse({
      ...base,
      guests: [{
        source_kind: 'manual_email', email: 'biggi@example.is', shared_display_name: 'biggi@example.is',
      }],
    }).success).toBe(false)
  })

  it('validates real dates, exact SQL time and date/time pairing', () => {
    const view = {
      ...ownerRoster(),
      created_at: timestamp,
      updated_at: timestamp,
      event_date: '2026-08-21',
      event_time: '19:30:00',
      description: null,
      agenda: null,
    }
    expect(EventActorViewV2SqlSchema.safeParse(view).success).toBe(true)
    expect(EventActorViewV2SqlSchema.safeParse({ ...view, event_date: '0004-02-29' }).success).toBe(true)
    expect(EventActorViewV2SqlSchema.safeParse({ ...view, event_date: '0100-02-29' }).success).toBe(false)
    expect(EventActorViewV2SqlSchema.safeParse({ ...view, event_date: '2026-02-30' }).success).toBe(false)
    expect(EventActorViewV2SqlSchema.safeParse({ ...view, event_time: '19:30' }).success).toBe(false)
    expect(EventActorViewV2SqlSchema.safeParse({ ...view, event_time: null }).success).toBe(false)
  })

  it('keeps administrative email and identity generations in the owner-only schema', () => {
    const payload = {
      event_id: eventId,
      name: 'Viðburður',
      roster_revision: '3',
      viewer_role: 'owner',
      guests: [{
        event_guest_id: guestRef,
        position: 0,
        label_state: 'needs_owner_input',
        shared_display_name: null,
        label_version: '1',
        administrative_email: 'biggi@example.is',
        recipient_state: 'email_unbound',
        identity_version: '2',
        identity_generation: '1',
        access_state: 'active',
        access_version: '1',
        rsvp_state: 'no_response',
        rsvp_version: '1',
        invitation_status: 'pending',
      }],
    }
    expect(EventRosterManagementV2SqlSchema.safeParse(payload).success).toBe(true)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{ ...payload.guests[0], source_kind: 'manual_email' }],
    }).success).toBe(false)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{ ...payload.guests[0], recipient_state: 'none' }],
    }).success).toBe(false)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{ ...payload.guests[0], invitation_status: null }],
    }).success).toBe(false)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{
        ...payload.guests[0],
        administrative_email: null,
        recipient_state: 'identity_tombstone',
        access_state: 'left',
        invitation_status: 'claimed',
      }],
    }).success).toBe(true)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{
        ...payload.guests[0],
        administrative_email: null,
        recipient_state: 'identity_tombstone',
        invitation_status: 'claimed',
      }],
    }).success).toBe(false)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{
        ...payload.guests[0],
        recipient_state: 'user_bound',
      }],
    }).success).toBe(false)
    expect(EventRosterManagementV2SqlSchema.safeParse({
      ...payload,
      guests: [{
        ...payload.guests[0],
        administrative_email: null,
      }],
    }).success).toBe(false)
  })

  it('requires exact request correlation and rejects result drift', () => {
    const create = {
      status: 'created',
      request_id: requestId,
      event_id: eventId,
      roster_revision: '1',
      invitations: [{
        invitation_id: invitationId,
        event_guest_id: guestRef,
        invitation_kind: 'identity_and_access',
        recipient_label: 'b***@example.is',
        invited_at: timestamp,
        expires_at: timestamp,
      }],
    }
    expect(CreateEventWithParticipationsV2ResultSqlSchema.safeParse(create).success).toBe(true)
    expect(CreateEventWithParticipationsV2ResultSqlSchema.safeParse({ ...create, email: 'private@example.is' }).success).toBe(false)
    expect(RepairEventPersonLabelV2ResultSqlSchema.safeParse({
      status: 'unchanged', request_id: requestId, event_id: eventId,
      event_guest_id: guestRef, roster_revision: '2', label_version: '1',
    }).success).toBe(true)
    expect(SetEventRsvpV2ResultSqlSchema.safeParse({
      status: 'updated', request_id: requestId, event_id: eventId,
      event_guest_id: guestRef, access_state: 'active', access_version: '1',
      rsvp_state: 'attending', rsvp_version: '2',
    }).success).toBe(true)
  })
})
