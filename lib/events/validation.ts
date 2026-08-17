import { z } from 'zod'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

const DISALLOWED_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const DISALLOWED_MULTILINE_CONTROLS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

function normalizedText(max: number) {
  return z.string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(z.string().min(1).max(max).refine(
      (value) => !DISALLOWED_CONTROLS.test(value),
      'disallowed_control_character',
    ))
}

function optionalMultilineText(max: number) {
  return z.string()
    .transform((value) => value.replace(/\r\n?/g, '\n').trim().normalize('NFC'))
    .pipe(z.string().max(max).refine(
      (value) => !DISALLOWED_MULTILINE_CONTROLS.test(value),
      'disallowed_control_character',
    ))
    .transform((value) => value || null)
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const eventDate = z.string().refine(isCalendarDate, 'invalid_date').nullable()
const eventTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()

function addEventTimingIssue(
  value: { event_date: string | null; event_time: string | null },
  context: z.RefinementCtx,
) {
  if ((value.event_date === null) !== (value.event_time === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['event_date'],
      message: 'date_time_pair_required',
    })
  }
}

const guestName = normalizedText(120).refine(
  (value) => !value.includes('@'),
  'email_not_supported',
)

const guestEmail = z.string()
  .transform((value) => value.trim().toLocaleLowerCase('en-US'))
  .pipe(z.string().email().max(320).refine(
    (value) => !DISALLOWED_CONTROLS.test(value),
    'disallowed_control_character',
  ))

const identityRecipientEmail = z.string()
  .transform((value) => value.trim())
  .pipe(z.string().email().max(320).refine(
    (value) => !DISALLOWED_CONTROLS.test(value),
    'disallowed_control_character',
  ))
  .transform((value, context) => {
    const canonical = normalizeEmailForAccess(value)
    if (!canonical) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_email' })
      return z.NEVER
    }
    return canonical
  })

const EventNewGuestSchema = z.discriminatedUnion('source_kind', [
  z.object({
    source_kind: z.literal('manual_name'),
    display_name: guestName,
  }).strict(),
  z.object({
    source_kind: z.literal('manual_email'),
    email: guestEmail,
  }).strict(),
  z.object({
    source_kind: z.literal('relationship'),
    relationship_id: z.string().uuid(),
  }).strict(),
])

const EventRosterGuestSchema = z.union([
  z.object({ event_guest_id: z.string().uuid() }).strict(),
  EventNewGuestSchema,
])

function addDuplicateIssues(
  guests: Array<z.infer<typeof EventRosterGuestSchema>>,
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
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guests'],
        message,
      })
    }
  }
}

export const CreateEventSchema = z.object({
  request_id: z.string().uuid(),
  name: normalizedText(160),
  guests: z.array(EventNewGuestSchema).max(49),
  event_date: eventDate.optional().default(null),
  event_time: eventTime.optional().default(null),
  description: optionalMultilineText(2000).optional().default(''),
  agenda: optionalMultilineText(4000).optional().default(''),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.guests, context)
  addEventTimingIssue(value, context)
})

export const SaveEventDetailsSchema = z.object({
  event_id: z.string().uuid(),
  request_id: z.string().uuid(),
  event_date: eventDate,
  event_time: eventTime,
  description: optionalMultilineText(2000),
  agenda: optionalMultilineText(4000),
}).strict().superRefine(addEventTimingIssue)

export const ReplaceEventRosterSchema = z.object({
  event_id: z.string().uuid(),
  request_id: z.string().uuid(),
  expected_roster_revision: z.number().int().nonnegative().safe(),
  guests: z.array(EventRosterGuestSchema).max(49),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.guests, context)
})

export const InviteEventGuestAttendanceSchema = z.object({
  event_id: z.string().uuid(),
  event_guest_id: z.string().uuid(),
  expected_roster_revision: z.number().int().positive().safe(),
  request_id: z.string().uuid(),
  recipient_email: identityRecipientEmail.nullable(),
}).strict()

export const CancelEventGuestAttendanceInvitationSchema = z.object({
  event_id: z.string().uuid(),
  event_guest_id: z.string().uuid(),
  invitation_id: z.string().uuid(),
  expected_roster_revision: z.number().int().positive().safe(),
  request_id: z.string().uuid(),
}).strict()

export const ResendEventGuestAttendanceInvitationSchema = z.object({
  event_id: z.string().uuid(),
  event_guest_id: z.string().uuid(),
  invitation_id: z.string().uuid(),
  request_id: z.string().uuid(),
}).strict()

export const RespondEventGuestAttendanceInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
  request_id: z.string().uuid(),
}).strict()

export const LeaveEventAttendanceSchema = z.object({
  event_id: z.string().uuid(),
  request_id: z.string().uuid(),
}).strict()

export type CreateEventInput = z.infer<typeof CreateEventSchema>
export type SaveEventDetailsInput = z.infer<typeof SaveEventDetailsSchema>
export type ReplaceEventRosterInput = z.infer<typeof ReplaceEventRosterSchema>
export type InviteEventGuestAttendanceInput = z.infer<typeof InviteEventGuestAttendanceSchema>
export type CancelEventGuestAttendanceInvitationInput = z.infer<typeof CancelEventGuestAttendanceInvitationSchema>
export type ResendEventGuestAttendanceInvitationInput = z.infer<typeof ResendEventGuestAttendanceInvitationSchema>
export type RespondEventGuestAttendanceInvitationInput = z.infer<typeof RespondEventGuestAttendanceInvitationSchema>
export type LeaveEventAttendanceInput = z.infer<typeof LeaveEventAttendanceSchema>
