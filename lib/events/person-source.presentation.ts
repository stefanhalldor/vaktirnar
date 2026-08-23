import { z } from 'zod'

const disallowedControls = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const uuid = z.string().uuid()
const strictOffsetTimestamp = z.string().datetime({ offset: true })
const decimalRevision = z.string().regex(/^[1-9]\d{0,18}$/)
const positiveRevision = z.union([
  z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  decimalRevision,
])
const position = z.number().int().min(0).max(49)
const eventName = z.string().min(1).max(160).refine(
  (value) => value === value.trim() && !disallowedControls.test(value),
  { message: 'invalid_event_name' },
)
const safeDisplayName = z.string().min(1).max(120).refine(
  (value) => (
    value === value.trim()
    && !disallowedControls.test(value)
    && !value.includes('@')
  ),
  { message: 'invalid_display_name' },
)

export const PersonSourceCursorSchema = z.object({
  beforeSortAt: strictOffsetTimestamp,
  beforeEventId: uuid,
}).strict()

export const PersonSourceEventViewSchema = z.object({
  eventId: uuid,
  name: eventName,
  rosterRevision: positiveRevision,
  activePersonCount: z.number().int().min(1).max(50),
}).strict()

export const PersonSourceEventPageViewSchema = z.object({
  events: z.array(PersonSourceEventViewSchema).max(20),
  nextCursor: PersonSourceCursorSchema.nullable(),
}).strict().superRefine((page, context) => {
  const eventIds = page.events.map((event) => event.eventId)
  if (new Set(eventIds).size !== eventIds.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_event_id' })
  }
  if (page.nextCursor !== null) {
    const lastEvent = page.events.at(-1)
    if (page.events.length !== 20 || lastEvent?.eventId !== page.nextCursor.beforeEventId) {
      context.addIssue({ code: 'custom', message: 'invalid_next_cursor' })
    }
  }
})

export const PersonSourceRosterPersonViewSchema = z.object({
  personRef: uuid,
  participantKind: z.enum(['organizer', 'guest']),
  displayName: safeDisplayName.nullable(),
  position,
  isSelf: z.boolean(),
  primaryLabel: safeDisplayName.optional(),
  secondaryLabel: safeDisplayName.optional(),
  privateEmail: z.string().email().max(320).optional(),
  builtInTags: z.array(z.enum(['unclassified', 'family', 'friends', 'recipients'])).max(4).optional(),
  customLabels: z.array(z.string().min(1).max(60)).max(20).optional(),
  hiddenCustomLabelCount: z.number().int().min(0).optional(),
  privateNote: z.string().min(1).max(1000).optional(),
  selectable: z.boolean().optional(),
  bulkEligible: z.boolean().optional(),
  disabledReason: z.enum(['name_required', 'profile_name_required', 'not_active']).nullable().optional(),
  rsvpState: z.enum(['no_response', 'considering', 'attending', 'not_attending']).optional(),
}).strict()

export const PersonSourceRosterViewSchema = z.object({
  eventId: uuid,
  name: eventName,
  rosterRevision: positiveRevision,
  people: z.array(PersonSourceRosterPersonViewSchema).min(1).max(50),
}).strict().superRefine((roster, context) => {
  const personRefs = roster.people.map((person) => person.personRef)
  if (new Set(personRefs).size !== personRefs.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_person_ref' })
  }
  if (roster.people.some((person, index) => person.position !== index)) {
    context.addIssue({ code: 'custom', message: 'invalid_person_position' })
  }
  if (
    roster.people[0]?.participantKind !== 'organizer'
    || roster.people.slice(1).some((person) => person.participantKind !== 'guest')
  ) {
    context.addIssue({ code: 'custom', message: 'invalid_participant_order' })
  }
  if (roster.people.filter((person) => person.isSelf).length !== 1) {
    context.addIssue({ code: 'custom', message: 'invalid_self_count' })
  }
})

export const PersonSourcePageInputSchema = z.object({
  cursor: PersonSourceCursorSchema.nullable(),
}).strict()

export const PersonSourceRosterInputSchema = z.object({
  eventId: uuid,
}).strict()

export const PersonSourcePageResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: PersonSourceEventPageViewSchema,
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.enum(['invalid_input', 'load_failed']),
  }).strict(),
])

export const PersonSourceRosterResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: PersonSourceRosterViewSchema,
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.enum(['invalid_input', 'not_found', 'load_failed']),
  }).strict(),
])

export type PersonSourceCursor = z.infer<typeof PersonSourceCursorSchema>
export type PersonSourceEventView = z.infer<typeof PersonSourceEventViewSchema>
export type PersonSourceEventPageView = z.infer<typeof PersonSourceEventPageViewSchema>
export type PersonSourceRosterView = z.infer<typeof PersonSourceRosterViewSchema>
export type PersonSourcePageInput = z.infer<typeof PersonSourcePageInputSchema>
export type PersonSourceRosterInput = z.infer<typeof PersonSourceRosterInputSchema>
export type PersonSourcePageResult = z.infer<typeof PersonSourcePageResultSchema>
export type PersonSourceRosterResult = z.infer<typeof PersonSourceRosterResultSchema>
