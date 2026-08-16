import { z } from 'zod'

const DISALLOWED_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

function normalizedText(max: number) {
  return z.string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(z.string().min(1).max(max).refine(
      (value) => !DISALLOWED_CONTROLS.test(value),
      'disallowed_control_character',
    ))
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
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.guests, context)
})

export const ReplaceEventRosterSchema = z.object({
  event_id: z.string().uuid(),
  request_id: z.string().uuid(),
  expected_roster_revision: z.number().int().nonnegative().safe(),
  guests: z.array(EventRosterGuestSchema).max(49),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.guests, context)
})

export type CreateEventInput = z.infer<typeof CreateEventSchema>
export type ReplaceEventRosterInput = z.infer<typeof ReplaceEventRosterSchema>
