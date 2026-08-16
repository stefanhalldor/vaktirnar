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

const EventParticipantSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('guest'),
    display_name: guestName,
  }).strict(),
  z.object({
    type: z.literal('relationship'),
    relationship_id: z.string().uuid(),
  }).strict(),
])

export const CreateEventSchema = z.object({
  request_id: z.string().uuid(),
  name: normalizedText(160),
  participants: z.array(EventParticipantSchema).max(49),
}).strict().superRefine((value, context) => {
  const relationshipIds = value.participants.flatMap((participant) => (
    participant.type === 'relationship' ? [participant.relationship_id] : []
  ))
  if (new Set(relationshipIds).size !== relationshipIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['participants'],
      message: 'duplicate_relationship',
    })
  }
})

export type CreateEventInput = z.infer<typeof CreateEventSchema>
