import { z } from 'zod'
import {
  EventV2AccessStateSchema,
  EventV2DateSchema,
  EventV2DisabledReasonSchema,
  EventV2EventNameSchema,
  EventV2LabelStateSchema,
  EventV2OffsetTimestampSchema,
  EventV2OrganizerSharedIdentitySqlSchema,
  EventV2PgBigintSchema,
  EventV2SafeDisplayNameSchema,
  EventV2TimeSchema,
  EventV2UuidSchema,
  EventV2ViewerPrivateSqlSchema,
  type EventV2ViewerPrivate,
} from './participant-identity-v2.contracts'

const DISALLOWED_NOTE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const DISALLOWED_MULTILINE_CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

const canonicalPrivateNote = z.string().superRefine((value, context) => {
  if (
    value.length === 0
    || Array.from(value).length > 240
    || utf8Length(value) > 1920
  ) {
    context.addIssue({ code: 'custom', message: 'note_length_out_of_range' })
  }
  if (value !== value.trim().normalize('NFC')) {
    context.addIssue({ code: 'custom', message: 'non_canonical_note' })
  }
  if (DISALLOWED_NOTE_CONTROLS.test(value)) {
    context.addIssue({ code: 'custom', message: 'disallowed_note_character' })
  }
})

function canonicalMultiline(max: number) {
  return z.string().superRefine((value, context) => {
    if (Array.from(value).length < 1 || Array.from(value).length > max) {
      context.addIssue({ code: 'custom', message: 'text_length_out_of_range' })
    }
    if (value !== value.replace(/\r\n?/g, '\n').trim().normalize('NFC')) {
      context.addIssue({ code: 'custom', message: 'non_canonical_text' })
    }
    if (DISALLOWED_MULTILINE_CONTROLS.test(value)) {
      context.addIssue({ code: 'custom', message: 'disallowed_control_character' })
    }
  })
}

export const EventV3RsvpStateSchema = z.enum([
  'no_response',
  'considering',
  'attending',
  'not_attending',
])
export const EventV3UuidSchema = EventV2UuidSchema

export const EventV3PrivateNoteInputSchema = z.union([
  z.null(),
  z.string()
    .superRefine((value, context) => {
      if (utf8Length(value) > 4096) {
        context.addIssue({ code: 'custom', message: 'raw_note_too_large' })
      }
      if (DISALLOWED_NOTE_CONTROLS.test(value)) {
        context.addIssue({ code: 'custom', message: 'disallowed_note_character' })
      }
    })
    .transform((value) => value.trim().normalize('NFC'))
    .superRefine((value, context) => {
      if (value !== '' && (
        Array.from(value).length > 240
        || utf8Length(value) > 1920
      )) {
        context.addIssue({ code: 'custom', message: 'note_length_out_of_range' })
      }
    })
    .transform((value) => value === '' ? null : value),
])

const v3GuestSharedIdentitySqlSchema = z.object({
  access_state: EventV2AccessStateSchema,
  rsvp_state: EventV3RsvpStateSchema,
  label_state: EventV2LabelStateSchema,
  display_name: EventV2SafeDisplayNameSchema.nullable(),
  selectable: z.boolean(),
  bulk_eligible: z.boolean(),
  disabled_reason: EventV2DisabledReasonSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.access_state !== 'active') {
    if (value.selectable || value.bulk_eligible || value.disabled_reason !== 'not_active') {
      context.addIssue({ code: 'custom', message: 'inactive_capability_mismatch' })
    }
    if ((value.label_state === 'resolved') !== (value.display_name !== null)) {
      context.addIssue({ code: 'custom', message: 'label_state_mismatch' })
    }
    return
  }
  if (value.label_state === 'needs_owner_input') {
    if (
      value.display_name !== null
      || value.selectable
      || value.bulk_eligible
      || (value.disabled_reason !== 'name_required'
        && value.disabled_reason !== 'profile_name_required')
    ) {
      context.addIssue({ code: 'custom', message: 'unresolved_capability_mismatch' })
    }
    return
  }
  if (
    value.display_name === null
    || !value.selectable
    || value.bulk_eligible !== (value.rsvp_state !== 'not_attending')
    || value.disabled_reason !== null
  ) {
    context.addIssue({ code: 'custom', message: 'active_capability_mismatch' })
  }
})

export const EventV3RsvpSqlSchema = z.object({
  state: EventV3RsvpStateSchema,
  decision_version: EventV2PgBigintSchema,
  private_note: canonicalPrivateNote.optional(),
}).strict().superRefine((value, context) => {
  if (value.private_note !== undefined && value.state !== 'considering') {
    context.addIssue({ code: 'custom', path: ['private_note'], message: 'note_state_mismatch' })
  }
})

const organizerPersonSqlSchema = z.object({
  person_ref: EventV2UuidSchema,
  participant_kind: z.literal('organizer'),
  position: z.literal(0),
  is_self: z.boolean(),
  shared: EventV2OrganizerSharedIdentitySqlSchema,
  viewer_private: EventV2ViewerPrivateSqlSchema.optional(),
}).strict()

const guestPersonSqlSchema = z.object({
  person_ref: EventV2UuidSchema,
  participant_kind: z.literal('guest'),
  position: z.number().int().min(1).max(49),
  is_self: z.boolean(),
  shared: v3GuestSharedIdentitySqlSchema,
  label_version: EventV2PgBigintSchema,
  identity_version: EventV2PgBigintSchema,
  identity_generation: EventV2PgBigintSchema,
  access_version: EventV2PgBigintSchema,
  viewer_private: EventV2ViewerPrivateSqlSchema.optional(),
  rsvp: EventV3RsvpSqlSchema,
}).strict().superRefine((value, context) => {
  if (value.shared.rsvp_state !== value.rsvp.state) {
    context.addIssue({ code: 'custom', path: ['rsvp'], message: 'rsvp_projection_mismatch' })
  }
})

export const EventV3PersonSqlSchema = z.union([
  organizerPersonSqlSchema,
  guestPersonSqlSchema,
])

const actorViewBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  created_at: EventV2OffsetTimestampSchema,
  updated_at: EventV2OffsetTimestampSchema,
  event_date: EventV2DateSchema.nullable(),
  event_time: EventV2TimeSchema.nullable(),
  description: canonicalMultiline(2000).nullable(),
  agenda: canonicalMultiline(4000).nullable(),
  people: z.array(EventV3PersonSqlSchema).min(1).max(50),
} as const

const ownerActorViewSqlSchema = z.object({
  ...actorViewBase,
  viewer_role: z.literal('owner'),
}).strict()

const attendeeActorViewSqlSchema = z.object({
  ...actorViewBase,
  viewer_role: z.literal('attendee'),
  self_rsvp: EventV3RsvpSqlSchema,
}).strict()

export const EventActorViewV3SqlSchema = z.discriminatedUnion('viewer_role', [
  ownerActorViewSqlSchema,
  attendeeActorViewSqlSchema,
]).superRefine((value, context) => {
  if ((value.event_date === null) !== (value.event_time === null)) {
    context.addIssue({ code: 'custom', path: ['event_date'], message: 'date_time_pair_required' })
  }
  const people = value.people
  if (
    new Set(people.map((person) => person.person_ref)).size !== people.length
    || people.some((person, index) => person.position !== index)
    || people[0]?.participant_kind !== 'organizer'
    || people.slice(1).some((person) => person.participant_kind !== 'guest')
    || people.filter((person) => person.is_self).length !== 1
    || (value.viewer_role === 'owner' && !people[0]?.is_self)
    || (value.viewer_role === 'attendee' && people[0]?.is_self)
  ) {
    context.addIssue({ code: 'custom', path: ['people'], message: 'people_shape_mismatch' })
  }
  const guests = people.filter((person): person is z.infer<typeof guestPersonSqlSchema> => (
    person.participant_kind === 'guest'
  ))
  if (guests.some((person) => person.shared.access_state !== 'active')) {
    context.addIssue({ code: 'custom', path: ['people'], message: 'inactive_guest_not_allowed' })
  }
  if (value.viewer_role === 'attendee') {
    const self = guests.find((person) => person.is_self)
    if (
      !self
      || self.rsvp.state !== value.self_rsvp.state
      || self.rsvp.decision_version !== value.self_rsvp.decision_version
      || self.rsvp.private_note !== value.self_rsvp.private_note
      || guests.some((person) => !person.is_self && person.rsvp.private_note !== undefined)
    ) {
      context.addIssue({ code: 'custom', path: ['self_rsvp'], message: 'self_rsvp_mismatch' })
    }
  }
})

const eventSummaryBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  active_guest_count: z.number().int().min(0).max(49),
  roster_revision: EventV2PgBigintSchema,
  created_at: EventV2OffsetTimestampSchema,
  updated_at: EventV2OffsetTimestampSchema,
} as const

export const EventListForActorV3OwnerSummarySqlSchema = z.object({
  ...eventSummaryBase,
  viewer_role: z.literal('owner'),
}).strict()

export const EventListForActorV3AttendeeSummarySqlSchema = z.object({
  ...eventSummaryBase,
  viewer_role: z.literal('attendee'),
  self_rsvp_state: EventV3RsvpStateSchema,
  self_decision_version: EventV2PgBigintSchema,
}).strict()

export const EventScopedParticipationsV3SqlSchema = z.object({
  participating: z.array(EventListForActorV3AttendeeSummarySqlSchema).max(100),
  participating_has_more: z.boolean(),
  claim_has_more: z.boolean(),
}).strict()

export const EventListForActorV3SqlSchema = z.object({
  owned: z.array(EventListForActorV3OwnerSummarySqlSchema).max(100),
  owned_has_more: z.boolean(),
  participating: z.array(EventListForActorV3AttendeeSummarySqlSchema).max(100),
  participating_has_more: z.boolean(),
  claim_has_more: z.boolean(),
}).strict()

const pageEventBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  active_person_count: z.number().int().min(1).max(50),
} as const

const ownerPageEventSqlSchema = z.object({
  ...pageEventBase,
  viewer_role: z.literal('owner'),
}).strict()

const attendeePageEventSqlSchema = z.object({
  ...pageEventBase,
  viewer_role: z.literal('attendee'),
  self_rsvp_state: EventV3RsvpStateSchema,
  self_decision_version: EventV2PgBigintSchema,
}).strict()

export const EventPersonSourceV3PageSqlSchema = z.object({
  events: z.array(z.discriminatedUnion('viewer_role', [
    ownerPageEventSqlSchema,
    attendeePageEventSqlSchema,
  ])).max(50),
  next_cursor: z.object({
    before_sort_at: EventV2OffsetTimestampSchema,
    before_event_id: EventV2UuidSchema,
  }).strict().nullable(),
}).strict()

const rosterBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  people: z.array(EventV3PersonSqlSchema).min(1).max(50),
} as const

export const EventPersonSourceV3RosterSqlSchema = z.discriminatedUnion('viewer_role', [
  z.object({ ...rosterBase, viewer_role: z.literal('owner') }).strict(),
  z.object({ ...rosterBase, viewer_role: z.literal('attendee') }).strict(),
]).superRefine((value, context) => {
  const guests = value.people.filter((person) => person.participant_kind === 'guest')
  if (guests.some((person) => person.shared.access_state !== 'active')) {
    context.addIssue({ code: 'custom', path: ['people'], message: 'inactive_guest_not_allowed' })
  }
  if (guests.some((person) => person.rsvp.private_note !== undefined)) {
    context.addIssue({ code: 'custom', path: ['people'], message: 'private_note_not_allowed' })
  }
})

export const ResolveEventInvitationV3ResultSqlSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'expired', 'claimed']),
  event_id: EventV2UuidSchema,
  capability: z.literal('active_participant'),
}).strict()

export const SetEventRsvpV3InputSchema = z.object({
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  identity_generation: EventV2PgBigintSchema,
  rsvp_state: EventV3RsvpStateSchema,
  private_note: EventV3PrivateNoteInputSchema,
  expected_decision_version: EventV2PgBigintSchema,
  request_id: EventV2UuidSchema,
}).strict().superRefine((value, context) => {
  if (value.rsvp_state !== 'considering' && value.private_note !== null) {
    context.addIssue({ code: 'custom', path: ['private_note'], message: 'note_state_mismatch' })
  }
})

export const LeaveEventParticipationV3InputSchema = z.object({
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  identity_generation: EventV2PgBigintSchema,
  expected_identity_version: EventV2PgBigintSchema,
  expected_access_version: EventV2PgBigintSchema,
  request_id: EventV2UuidSchema,
}).strict()

export const SetEventRsvpV3ResultSqlSchema = z.object({
  status: z.enum(['updated', 'unchanged']),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  identity_generation: EventV2PgBigintSchema,
  access_state: z.literal('active'),
  access_version: EventV2PgBigintSchema,
  rsvp_state: EventV3RsvpStateSchema,
  decision_version: EventV2PgBigintSchema,
}).strict()

export const LeaveEventParticipationV3ResultSqlSchema = z.object({
  status: z.literal('left'),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  identity_generation: EventV2PgBigintSchema,
  identity_version: EventV2PgBigintSchema,
  access_version: EventV2PgBigintSchema,
}).strict()

export type EventV3RsvpState = z.infer<typeof EventV3RsvpStateSchema>
export type SetEventRsvpV3Input = z.infer<typeof SetEventRsvpV3InputSchema>
export type LeaveEventParticipationV3Input = z.infer<typeof LeaveEventParticipationV3InputSchema>
export type EventV3PersonSql = z.infer<typeof EventV3PersonSqlSchema>
export type EventV3ViewerPrivate = EventV2ViewerPrivate

export interface EventV3Rsvp {
  state: EventV3RsvpState
  decisionVersion: string
  privateNote?: string
}

interface EventV3PersonBase {
  personRef: string
  position: number
  isSelf: boolean
  viewerPrivate?: EventV3ViewerPrivate
}

export interface EventV3OrganizerPerson extends EventV3PersonBase {
  participantKind: 'organizer'
  position: 0
  shared: {
    labelState: 'resolved' | 'needs_owner_input'
    displayName: string | null
    selectable: boolean
    bulkEligible: boolean
    disabledReason: 'profile_name_required' | null
  }
}

export interface EventV3GuestPerson extends EventV3PersonBase {
  participantKind: 'guest'
  shared: {
    accessState: z.infer<typeof EventV2AccessStateSchema>
    rsvpState: EventV3RsvpState
    labelState: z.infer<typeof EventV2LabelStateSchema>
    displayName: string | null
    selectable: boolean
    bulkEligible: boolean
    disabledReason: z.infer<typeof EventV2DisabledReasonSchema> | null
  }
  labelVersion: string
  identityVersion: string
  identityGeneration: string
  accessVersion: string
  rsvp: EventV3Rsvp
}

export type EventV3Person = EventV3OrganizerPerson | EventV3GuestPerson

interface EventActorViewV3Base {
  eventId: string
  name: string
  rosterRevision: string
  createdAt: string
  updatedAt: string
  eventDate: string | null
  eventTime: string | null
  description: string | null
  agenda: string | null
  people: EventV3Person[]
}

export type EventActorViewV3 =
  | EventActorViewV3Base & { viewerRole: 'owner' }
  | EventActorViewV3Base & { viewerRole: 'attendee'; selfRsvp: EventV3Rsvp }

export interface EventListForActorV3OwnerSummary {
  id: string
  name: string
  activeGuestCount: number
  rosterRevision: string
  viewerRole: 'owner'
  createdAt: string
  updatedAt: string
}

export interface EventListForActorV3AttendeeSummary {
  id: string
  name: string
  activeGuestCount: number
  rosterRevision: string
  viewerRole: 'attendee'
  rsvpState: EventV3RsvpState
  decisionVersion: string
  createdAt: string
  updatedAt: string
}

export interface EventListForActorV3 {
  owned: EventListForActorV3OwnerSummary[]
  ownedHasMore: boolean
  participating: EventListForActorV3AttendeeSummary[]
  participatingHasMore: boolean
  claimHasMore: boolean
}

export interface EventPersonSourceV3Page {
  events: Array<{
    id: string
    name: string
    rosterRevision: string
    viewerRole: 'owner' | 'attendee'
    activePersonCount: number
    rsvpState?: EventV3RsvpState
    decisionVersion?: string
  }>
  nextCursor: { beforeSortAt: string; beforeEventId: string } | null
}

export type EventPersonSourceV3Roster = {
  eventId: string
  name: string
  rosterRevision: string
  viewerRole: 'owner' | 'attendee'
  people: EventV3Person[]
}

export interface EventSetRsvpV3Result {
  status: 'updated' | 'unchanged'
  requestId: string
  eventId: string
  eventGuestId: string
  identityGeneration: string
  accessState: z.infer<typeof EventV2AccessStateSchema>
  accessVersion: string
  rsvpState: EventV3RsvpState
  decisionVersion: string
}

export interface EventLeaveParticipationV3Result {
  status: 'left'
  requestId: string
  eventId: string
  eventGuestId: string
  identityGeneration: string
  identityVersion: string
  accessVersion: string
}

export type EventV3RepositoryErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'not_allowed'
  | 'conflict'
  | 'not_available'
  | 'rate_limited'
  | 'load_failed'
  | 'save_failed'

export class EventV3RepositoryError extends Error {
  readonly code: EventV3RepositoryErrorCode

  constructor(code: EventV3RepositoryErrorCode) {
    super(`event_v3_${code}`)
    this.name = 'EventV3RepositoryError'
    this.code = code
  }
}
