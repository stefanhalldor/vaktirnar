import { z } from 'zod'

const disallowedControls = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const uuid = z.string().uuid()
const eventName = z.string().trim().min(1).max(160)
  .refine((value) => !disallowedControls.test(value))
const safeDisplayName = z.string().trim().min(1).max(120)
  .refine((value) => !disallowedControls.test(value) && !value.includes('@'))
const nullableDisplayName = safeDisplayName.nullable()
const positiveRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const position = z.number().int().min(0).max(49)
const strictOffsetTimestamp = z.string().datetime({ offset: true })

export const EventPersonSourceCursorSqlSchema = z.object({
  before_sort_at: strictOffsetTimestamp,
  before_event_id: uuid,
}).strict()

export const EventPersonSourcePageEventSqlSchema = z.object({
  event_id: uuid,
  name: eventName,
  roster_revision: positiveRevision,
  viewer_role: z.enum(['owner', 'attendee']),
  active_person_count: z.number().int().min(1).max(50),
}).strict()

export const EventPersonSourcePageSqlSchema = z.object({
  events: z.array(EventPersonSourcePageEventSqlSchema).max(50),
  next_cursor: EventPersonSourceCursorSqlSchema.nullable(),
}).strict()

const personBase = {
  person_ref: uuid,
  participant_kind: z.enum(['organizer', 'guest']),
  display_name: nullableDisplayName,
  position,
  is_self: z.boolean(),
} as const

export const OwnerPersonSourceRowSqlSchema = z.object({
  ...personBase,
  source_kind: z.enum(['linked_user', 'manual_name', 'manual_email']),
}).strict().superRefine((row, context) => {
  if (row.source_kind === 'manual_email' && row.display_name !== null) {
    context.addIssue({ code: 'custom', message: 'manual_email_display_must_be_null' })
  }
})

export const AttendeePersonSourceRowSqlSchema = z.object({
  ...personBase,
  source_kind: z.enum(['linked_user', 'unlinked_guest']),
}).strict()

const rosterBase = {
  event_id: uuid,
  name: eventName,
  roster_revision: positiveRevision,
} as const

export const OwnerEventPersonSourceRosterSqlSchema = z.object({
  ...rosterBase,
  viewer_role: z.literal('owner'),
  people: z.array(OwnerPersonSourceRowSqlSchema).min(1).max(50),
}).strict()

export const AttendeeEventPersonSourceRosterSqlSchema = z.object({
  ...rosterBase,
  viewer_role: z.literal('attendee'),
  people: z.array(AttendeePersonSourceRowSqlSchema).min(1).max(50),
}).strict()

export const EventPersonSourceRosterSqlSchema = z.discriminatedUnion('viewer_role', [
  OwnerEventPersonSourceRosterSqlSchema,
  AttendeeEventPersonSourceRosterSqlSchema,
])

export type EventPersonSourceViewerRole = 'owner' | 'attendee'

export interface EventPersonSourceCursor {
  beforeSortAt: string
  beforeEventId: string
}

export interface EventPersonSourcePage {
  events: Array<{
    id: string
    name: string
    rosterRevision: number
    viewerRole: EventPersonSourceViewerRole
    activePersonCount: number
  }>
  nextCursor: EventPersonSourceCursor | null
}

interface EventPersonSourcePersonBase {
  personRef: string
  participantKind: 'organizer' | 'guest'
  displayName: string | null
  position: number
  isSelf: boolean
}

export interface OwnerEventPersonSourcePerson extends EventPersonSourcePersonBase {
  sourceKind: 'linked_user' | 'manual_name' | 'manual_email'
}

export interface AttendeeEventPersonSourcePerson extends EventPersonSourcePersonBase {
  sourceKind: 'linked_user' | 'unlinked_guest'
}

export type EventPersonSourceRoster =
  | {
      eventId: string
      name: string
      rosterRevision: number
      viewerRole: 'owner'
      people: OwnerEventPersonSourcePerson[]
    }
  | {
      eventId: string
      name: string
      rosterRevision: number
      viewerRole: 'attendee'
      people: AttendeeEventPersonSourcePerson[]
    }
