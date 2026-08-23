import { z } from 'zod'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

const DISALLOWED_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const DISALLOWED_MULTILINE_CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const PG_BIGINT_MAX_DECIMAL = '9223372036854775807'

function canonicalSingleLine(max: number, options: { disallowAt?: boolean } = {}) {
  return z.string().superRefine((value, context) => {
    const length = Array.from(value).length
    if (length < 1 || length > max) {
      context.addIssue({ code: 'custom', message: 'text_length_out_of_range' })
    }
    if (value !== value.trim().normalize('NFC')) {
      context.addIssue({ code: 'custom', message: 'non_canonical_text' })
    }
    if (DISALLOWED_CONTROLS.test(value)) {
      context.addIssue({ code: 'custom', message: 'disallowed_control_character' })
    }
    if (options.disallowAt && value.includes('@')) {
      context.addIssue({ code: 'custom', message: 'email_not_supported' })
    }
  })
}

function canonicalMultiline(max: number) {
  return z.string().superRefine((value, context) => {
    const length = Array.from(value).length
    if (length < 1 || length > max) {
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

function normalizedSingleLineInput(max: number, options: { disallowAt?: boolean } = {}) {
  return z.string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(canonicalSingleLine(max, options))
}

function normalizedMultilineInput(max: number) {
  return z.union([
    z.null(),
    z.string()
      .transform((value) => value.replace(/\r\n?/g, '\n').trim().normalize('NFC'))
      .pipe(z.union([z.literal(''), canonicalMultiline(max)]))
      .transform((value) => value || null),
  ])
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]!
}

function isStrictlyIncreasing<T>(values: T[], rank: (value: T) => string | number): boolean {
  return values.every((value, index) => index === 0 || rank(values[index - 1]!) < rank(value))
}

function isCanonicalMaskedRecipientLabel(value: string): boolean {
  if (DISALLOWED_CONTROLS.test(value)) return false
  const match = /^([^\s@*])\*{3}@([^\s@*]+)$/.exec(value)
  if (!match) return false
  const probe = `${match[1]}@${match[2]}`
  return z.string().email().safeParse(probe).success
    && normalizeEmailForAccess(probe) === probe
}

export const EventV2UuidSchema = z.string().uuid()
export const EventV2PgBigintSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(
    (value) => value.length < PG_BIGINT_MAX_DECIMAL.length
      || value <= PG_BIGINT_MAX_DECIMAL,
    'bigint_out_of_range',
  )
export const EventV2OffsetTimestampSchema = z.string().datetime({ offset: true })
export const EventV2DateSchema = z.string().refine(isCalendarDate, 'invalid_date')
export const EventV2TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
export const EventV2InputTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const EventV2EventNameSchema = canonicalSingleLine(160)
export const EventV2SafeDisplayNameSchema = canonicalSingleLine(120, { disallowAt: true })
export const EventV2PrivateAliasSchema = canonicalSingleLine(120)
export const EventV2CustomLabelSchema = canonicalSingleLine(60)
export const EventV2CanonicalEmailSchema = z.string().email().max(320).superRefine((value, context) => {
  if (DISALLOWED_CONTROLS.test(value) || normalizeEmailForAccess(value) !== value) {
    context.addIssue({ code: 'custom', message: 'non_canonical_email' })
  }
})

export const EventV2AccessStateSchema = z.enum(['active', 'left', 'revoked'])
export const EventV2RsvpStateSchema = z.enum(['no_response', 'attending', 'not_attending'])
export const EventV2LabelStateSchema = z.enum(['resolved', 'needs_owner_input'])
export const EventV2DisabledReasonSchema = z.enum([
  'name_required',
  'profile_name_required',
  'not_active',
])
export const EventV2BuiltInRelationshipTagSchema = z.enum([
  'unclassified',
  'family',
  'friends',
  'recipients',
])

const BUILT_IN_TAG_RANK: Record<z.infer<typeof EventV2BuiltInRelationshipTagSchema>, number> = {
  unclassified: 0,
  family: 1,
  friends: 2,
  recipients: 3,
}

export const EventV2ViewerPrivateSqlSchema = z.object({
  kind: z.literal('relationship'),
  alias: EventV2PrivateAliasSchema.nullable(),
  email: EventV2CanonicalEmailSchema.nullable(),
  built_in_tags: z.array(EventV2BuiltInRelationshipTagSchema).max(4),
  custom_labels: z.array(EventV2CustomLabelSchema).max(20),
  hidden_custom_label_count: z.number().int().min(0).max(2147483647),
  note: canonicalMultiline(1000).nullable(),
}).strict().superRefine((value, context) => {
  if (!isStrictlyIncreasing(value.built_in_tags, (tag) => BUILT_IN_TAG_RANK[tag])) {
    context.addIssue({ code: 'custom', path: ['built_in_tags'], message: 'tags_not_canonical' })
  }
  if (new Set(value.custom_labels).size !== value.custom_labels.length) {
    context.addIssue({ code: 'custom', path: ['custom_labels'], message: 'duplicate_labels' })
  }
})

export const EventV2OrganizerSharedIdentitySqlSchema = z.discriminatedUnion(
  'label_state',
  [
    z.object({
      label_state: z.literal('resolved'),
      display_name: EventV2SafeDisplayNameSchema,
      selectable: z.literal(true),
      bulk_eligible: z.literal(true),
      disabled_reason: z.null(),
    }).strict(),
    z.object({
      label_state: z.literal('needs_owner_input'),
      display_name: z.null(),
      selectable: z.literal(false),
      bulk_eligible: z.literal(false),
      disabled_reason: z.literal('profile_name_required'),
    }).strict(),
  ],
)

export const EventV2SharedIdentitySqlSchema = z.object({
  access_state: EventV2AccessStateSchema,
  rsvp_state: EventV2RsvpStateSchema,
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
  shared: EventV2SharedIdentitySqlSchema,
  label_version: EventV2PgBigintSchema,
  identity_version: EventV2PgBigintSchema,
  identity_generation: EventV2PgBigintSchema,
  access_version: EventV2PgBigintSchema,
  rsvp_version: EventV2PgBigintSchema,
  viewer_private: EventV2ViewerPrivateSqlSchema.optional(),
}).strict()

export const EventV2PersonSqlSchema = z.discriminatedUnion('participant_kind', [
  organizerPersonSqlSchema,
  guestPersonSqlSchema,
])

export const EventPersonSourceV2CursorSqlSchema = z.object({
  before_sort_at: EventV2OffsetTimestampSchema,
  before_event_id: EventV2UuidSchema,
}).strict()

export const EventPersonSourceV2PageEventSqlSchema = z.object({
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  viewer_role: z.enum(['owner', 'attendee']),
  active_person_count: z.number().int().min(1).max(50),
}).strict()

export const EventPersonSourceV2PageSqlSchema = z.object({
  events: z.array(EventPersonSourceV2PageEventSqlSchema).max(50),
  next_cursor: EventPersonSourceV2CursorSqlSchema.nullable(),
}).strict()

const rosterBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  people: z.array(EventV2PersonSqlSchema).min(1).max(50),
} as const

export const EventPersonSourceV2OwnerRosterSqlSchema = z.object({
  ...rosterBase,
  viewer_role: z.literal('owner'),
}).strict()

export const EventPersonSourceV2AttendeeRosterSqlSchema = z.object({
  ...rosterBase,
  viewer_role: z.literal('attendee'),
}).strict()

export const EventPersonSourceV2RosterSqlSchema = z.discriminatedUnion('viewer_role', [
  EventPersonSourceV2OwnerRosterSqlSchema,
  EventPersonSourceV2AttendeeRosterSqlSchema,
])

const eventSummaryBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  active_guest_count: z.number().int().min(0).max(49),
  roster_revision: EventV2PgBigintSchema,
  created_at: EventV2OffsetTimestampSchema,
  updated_at: EventV2OffsetTimestampSchema,
} as const

export const EventListForActorV2OwnerSummarySqlSchema = z.object({
  ...eventSummaryBase,
  viewer_role: z.literal('owner'),
}).strict()

export const EventListForActorV2AttendeeSummarySqlSchema = z.object({
  ...eventSummaryBase,
  viewer_role: z.literal('attendee'),
  self_rsvp_state: EventV2RsvpStateSchema,
}).strict()

export const EventListForActorV2SqlSchema = z.object({
  owned: z.array(EventListForActorV2OwnerSummarySqlSchema).max(100),
  participating: z.array(EventListForActorV2AttendeeSummarySqlSchema).max(100),
}).strict()

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
  people: z.array(EventV2PersonSqlSchema).min(1).max(50),
} as const

export const EventActorViewV2OwnerSqlSchema = z.object({
  ...actorViewBase,
  viewer_role: z.literal('owner'),
}).strict()

export const EventActorViewV2AttendeeSqlSchema = z.object({
  ...actorViewBase,
  viewer_role: z.literal('attendee'),
}).strict()

export const EventActorViewV2SqlSchema = z.discriminatedUnion('viewer_role', [
  EventActorViewV2OwnerSqlSchema,
  EventActorViewV2AttendeeSqlSchema,
]).superRefine((value, context) => {
  if ((value.event_date === null) !== (value.event_time === null)) {
    context.addIssue({ code: 'custom', path: ['event_date'], message: 'date_time_pair_required' })
  }
})

export const EventRosterManagementV2GuestSqlSchema = z.object({
  event_guest_id: EventV2UuidSchema,
  position: z.number().int().min(0).max(48),
  label_state: EventV2LabelStateSchema,
  shared_display_name: EventV2SafeDisplayNameSchema.nullable(),
  label_version: EventV2PgBigintSchema,
  administrative_email: EventV2CanonicalEmailSchema.nullable(),
  recipient_state: z.enum(['name_only', 'email_unbound', 'user_bound', 'identity_tombstone']),
  identity_version: EventV2PgBigintSchema,
  identity_generation: EventV2PgBigintSchema,
  access_state: EventV2AccessStateSchema,
  access_version: EventV2PgBigintSchema,
  rsvp_state: EventV2RsvpStateSchema,
  rsvp_version: EventV2PgBigintSchema,
  invitation_status: z.enum([
    'not_invited',
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'expired',
    'left',
    'revoked',
    'claimed',
  ]),
}).strict().superRefine((value, context) => {
  if ((value.label_state === 'resolved') !== (value.shared_display_name !== null)) {
    context.addIssue({ code: 'custom', message: 'label_state_mismatch' })
  }
  const exposesAdministrativeEmail = value.administrative_email !== null
  const mayExposeAdministrativeEmail = value.access_state === 'active'
    && value.recipient_state === 'email_unbound'
  if (exposesAdministrativeEmail !== mayExposeAdministrativeEmail) {
    context.addIssue({ code: 'custom', message: 'administrative_email_state_mismatch' })
  }
  if (value.recipient_state === 'email_unbound' && value.access_state !== 'active') {
    context.addIssue({ code: 'custom', message: 'inactive_email_recipient' })
  }
  if (value.access_state === 'active' && value.recipient_state === 'identity_tombstone') {
    context.addIssue({ code: 'custom', message: 'active_identity_tombstone' })
  }
})

export const EventRosterManagementV2SqlSchema = z.object({
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  viewer_role: z.literal('owner'),
  guests: z.array(EventRosterManagementV2GuestSqlSchema).max(49),
}).strict()

const normalizedEmailInput = z.string()
  .transform((value) => value.trim())
  .pipe(z.string().email().max(320))
  .transform((value, context) => {
    const canonical = normalizeEmailForAccess(value)
    if (!canonical) {
      context.addIssue({ code: 'custom', message: 'invalid_email' })
      return z.NEVER
    }
    return canonical
  })

export const EventNewGuestV2Schema = z.discriminatedUnion('source_kind', [
  z.object({
    source_kind: z.literal('relationship'),
    relationship_id: EventV2UuidSchema,
  }).strict(),
  z.object({
    source_kind: z.literal('manual_name'),
    display_name: normalizedSingleLineInput(120, { disallowAt: true }),
  }).strict(),
  z.object({
    source_kind: z.literal('manual_email'),
    email: normalizedEmailInput,
    shared_display_name: normalizedSingleLineInput(120, { disallowAt: true }),
  }).strict(),
])

export const EventRosterGuestV2Schema = z.union([
  z.object({ event_guest_id: EventV2UuidSchema }).strict(),
  EventNewGuestV2Schema,
])

function addGuestDuplicateIssues(
  guests: Array<z.infer<typeof EventRosterGuestV2Schema>>,
  context: z.RefinementCtx,
) {
  const retainedIds = guests.flatMap((guest) => 'event_guest_id' in guest ? [guest.event_guest_id] : [])
  const relationshipIds = guests.flatMap((guest) => (
    'source_kind' in guest && guest.source_kind === 'relationship' ? [guest.relationship_id] : []
  ))
  const emails = guests.flatMap((guest) => (
    'source_kind' in guest && guest.source_kind === 'manual_email' ? [guest.email] : []
  ))
  for (const [values, message] of [
    [retainedIds, 'duplicate_guest'],
    [relationshipIds, 'duplicate_relationship'],
    [emails, 'duplicate_email'],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', path: ['guests'], message })
    }
  }
}

function addDateTimePairIssue(
  value: { event_date: string | null; event_time: string | null },
  context: z.RefinementCtx,
) {
  if ((value.event_date === null) !== (value.event_time === null)) {
    context.addIssue({ code: 'custom', path: ['event_date'], message: 'date_time_pair_required' })
  }
}

export const CreateEventWithParticipationsV2InputSchema = z.object({
  request_id: EventV2UuidSchema,
  name: normalizedSingleLineInput(160),
  guests: z.array(EventNewGuestV2Schema).max(49),
  event_date: EventV2DateSchema.nullable(),
  event_time: EventV2InputTimeSchema.nullable(),
  description: normalizedMultilineInput(2000),
  agenda: normalizedMultilineInput(4000),
}).strict().superRefine((value, context) => {
  addGuestDuplicateIssues(value.guests, context)
  addDateTimePairIssue(value, context)
})

export const ReplaceEventRosterWithParticipationsV2InputSchema = z.object({
  event_id: EventV2UuidSchema,
  request_id: EventV2UuidSchema,
  expected_roster_revision: EventV2PgBigintSchema,
  guests: z.array(EventRosterGuestV2Schema).max(49),
}).strict().superRefine((value, context) => addGuestDuplicateIssues(value.guests, context))

export const RepairEventPersonLabelV2InputSchema = z.object({
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  expected_roster_revision: EventV2PgBigintSchema,
  expected_label_version: EventV2PgBigintSchema,
  shared_display_name: normalizedSingleLineInput(120, { disallowAt: true }),
  request_id: EventV2UuidSchema,
}).strict()

export const SetEventRsvpV2InputSchema = z.object({
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  rsvp_state: EventV2RsvpStateSchema,
  expected_rsvp_version: EventV2PgBigintSchema,
  request_id: EventV2UuidSchema,
}).strict()

export const EventInvitationReceiptV2SqlSchema = z.object({
  invitation_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  invitation_kind: z.enum(['access_only', 'identity_and_access']),
  recipient_label: z.string().min(8).max(320)
    .refine(isCanonicalMaskedRecipientLabel, 'invalid_masked_recipient_label'),
  invited_at: EventV2OffsetTimestampSchema,
  expires_at: EventV2OffsetTimestampSchema,
}).strict()

export const CreateEventWithParticipationsV2ResultSqlSchema = z.object({
  status: z.literal('created'),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  roster_revision: EventV2PgBigintSchema,
  invitations: z.array(EventInvitationReceiptV2SqlSchema).max(49),
}).strict()

export const ReplaceEventRosterWithParticipationsV2ResultSqlSchema = z.object({
  status: z.literal('updated'),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  roster_revision: EventV2PgBigintSchema,
  invitations: z.array(EventInvitationReceiptV2SqlSchema).max(49),
}).strict()

export const RepairEventPersonLabelV2ResultSqlSchema = z.object({
  status: z.enum(['updated', 'unchanged']),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  roster_revision: EventV2PgBigintSchema,
  label_version: EventV2PgBigintSchema,
}).strict()

export const SetEventRsvpV2ResultSqlSchema = z.object({
  status: z.enum(['updated', 'unchanged']),
  request_id: EventV2UuidSchema,
  event_id: EventV2UuidSchema,
  event_guest_id: EventV2UuidSchema,
  access_state: EventV2AccessStateSchema,
  access_version: EventV2PgBigintSchema,
  rsvp_state: EventV2RsvpStateSchema,
  rsvp_version: EventV2PgBigintSchema,
}).strict()

export type EventV2ViewerRole = 'owner' | 'attendee'
export type EventV2AccessState = z.infer<typeof EventV2AccessStateSchema>
export type EventV2RsvpState = z.infer<typeof EventV2RsvpStateSchema>
export type EventV2LabelState = z.infer<typeof EventV2LabelStateSchema>
export type EventV2DisabledReason = z.infer<typeof EventV2DisabledReasonSchema>
export type EventNewGuestV2 = z.infer<typeof EventNewGuestV2Schema>
export type EventRosterGuestV2 = z.infer<typeof EventRosterGuestV2Schema>
export type CreateEventWithParticipationsV2Input = z.infer<typeof CreateEventWithParticipationsV2InputSchema>
export type ReplaceEventRosterWithParticipationsV2Input = z.infer<typeof ReplaceEventRosterWithParticipationsV2InputSchema>
export type RepairEventPersonLabelV2Input = z.infer<typeof RepairEventPersonLabelV2InputSchema>
export type SetEventRsvpV2Input = z.infer<typeof SetEventRsvpV2InputSchema>

export interface EventV2ViewerPrivate {
  kind: 'relationship'
  alias: string | null
  email: string | null
  builtInTags: Array<'unclassified' | 'family' | 'friends' | 'recipients'>
  customLabels: string[]
  hiddenCustomLabelCount: number
  note: string | null
}

export interface EventV2OrganizerSharedIdentity {
  labelState: EventV2LabelState
  displayName: string | null
  selectable: boolean
  bulkEligible: boolean
  disabledReason: 'profile_name_required' | null
}

export interface EventV2GuestSharedIdentity {
  accessState: EventV2AccessState
  rsvpState: EventV2RsvpState
  labelState: EventV2LabelState
  displayName: string | null
  selectable: boolean
  bulkEligible: boolean
  disabledReason: EventV2DisabledReason | null
}

interface EventV2PersonBase {
  personRef: string
  position: number
  isSelf: boolean
  viewerPrivate?: EventV2ViewerPrivate
}

export interface EventV2OrganizerPerson extends EventV2PersonBase {
  participantKind: 'organizer'
  position: 0
  shared: EventV2OrganizerSharedIdentity
}

export interface EventV2GuestPerson extends EventV2PersonBase {
  participantKind: 'guest'
  shared: EventV2GuestSharedIdentity
  labelVersion: string
  identityVersion: string
  identityGeneration: string
  accessVersion: string
  rsvpVersion: string
}

export type EventV2Person = EventV2OrganizerPerson | EventV2GuestPerson

export interface EventPersonSourceV2Page {
  events: Array<{
    id: string
    name: string
    rosterRevision: string
    viewerRole: EventV2ViewerRole
    activePersonCount: number
  }>
  nextCursor: { beforeSortAt: string; beforeEventId: string } | null
}

export type EventPersonSourceV2Roster =
  | { eventId: string; name: string; rosterRevision: string; viewerRole: 'owner'; people: EventV2Person[] }
  | { eventId: string; name: string; rosterRevision: string; viewerRole: 'attendee'; people: EventV2Person[] }

interface EventListForActorV2SummaryBase {
  id: string
  name: string
  activeGuestCount: number
  rosterRevision: string
  createdAt: string
  updatedAt: string
}

export interface EventListForActorV2OwnerSummary extends EventListForActorV2SummaryBase {
  viewerRole: 'owner'
}

export interface EventListForActorV2AttendeeSummary extends EventListForActorV2SummaryBase {
  viewerRole: 'attendee'
  rsvpState: EventV2RsvpState
}

export interface EventListForActorV2 {
  owned: EventListForActorV2OwnerSummary[]
  participating: EventListForActorV2AttendeeSummary[]
}

interface EventActorViewV2Base {
  eventId: string
  name: string
  rosterRevision: string
  createdAt: string
  updatedAt: string
  eventDate: string | null
  eventTime: string | null
  description: string | null
  agenda: string | null
  people: EventV2Person[]
}

export type EventActorViewV2 =
  | EventActorViewV2Base & { viewerRole: 'owner' }
  | EventActorViewV2Base & { viewerRole: 'attendee' }

export interface EventRosterManagementV2 {
  eventId: string
  name: string
  rosterRevision: string
  viewerRole: 'owner'
  guests: Array<{
    eventGuestId: string
    position: number
    labelState: EventV2LabelState
    sharedDisplayName: string | null
    labelVersion: string
    administrativeEmail: string | null
    recipientState: 'name_only' | 'email_unbound' | 'user_bound' | 'identity_tombstone'
    identityVersion: string
    identityGeneration: string
    accessState: EventV2AccessState
    accessVersion: string
    rsvpState: EventV2RsvpState
    rsvpVersion: string
    invitationStatus: 'not_invited' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'left' | 'revoked' | 'claimed'
  }>
}

export interface EventInvitationReceiptV2 {
  invitationId: string
  eventGuestId: string
  invitationKind: 'access_only' | 'identity_and_access'
  recipientLabel: string
  invitedAt: string
  expiresAt: string
}

export interface EventCreateOrReplaceV2Result {
  status: 'created' | 'updated'
  requestId: string
  eventId: string
  rosterRevision: string
  invitations: EventInvitationReceiptV2[]
}

export interface EventRepairPersonLabelV2Result {
  status: 'updated' | 'unchanged'
  requestId: string
  eventId: string
  eventGuestId: string
  rosterRevision: string
  labelVersion: string
}

export interface EventSetRsvpV2Result {
  status: 'updated' | 'unchanged'
  requestId: string
  eventId: string
  eventGuestId: string
  accessState: EventV2AccessState
  accessVersion: string
  rsvpState: EventV2RsvpState
  rsvpVersion: string
}

export type EventV2RepositoryErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'not_allowed'
  | 'conflict'
  | 'not_available'
  | 'rate_limited'
  | 'load_failed'
  | 'save_failed'

export class EventV2RepositoryError extends Error {
  readonly code: EventV2RepositoryErrorCode

  constructor(code: EventV2RepositoryErrorCode) {
    super(`event_v2_${code}`)
    this.name = 'EventV2RepositoryError'
    this.code = code
  }
}

export type EventV2PersonSql = z.infer<typeof EventV2PersonSqlSchema>
export type EventV2ViewerPrivateSql = z.infer<typeof EventV2ViewerPrivateSqlSchema>
