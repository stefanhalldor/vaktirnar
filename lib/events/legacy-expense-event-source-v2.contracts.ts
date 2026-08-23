import { z } from 'zod'
import {
  EventV2DisabledReasonSchema,
  EventV2EventNameSchema,
  EventV2AccessStateSchema,
  EventV2LabelStateSchema,
  EventV2PgBigintSchema,
  EventV2SafeDisplayNameSchema,
  EventV2UuidSchema,
  EventV2ViewerPrivateSqlSchema,
  type EventV2LabelState,
  type EventV2AccessState,
  type EventV2ViewerPrivate,
} from './participant-identity-v2.contracts'

export const LegacyExpenseEventSourceV2OrganizerSharedSqlSchema = z.discriminatedUnion(
  'label_state',
  [
    z.object({
      label_state: z.literal('resolved'),
      display_name: EventV2SafeDisplayNameSchema,
      selectable: z.literal(true),
      disabled_reason: z.null(),
    }).strict(),
    z.object({
      label_state: z.literal('needs_owner_input'),
      display_name: z.null(),
      selectable: z.literal(false),
      disabled_reason: z.literal('profile_name_required'),
    }).strict(),
  ],
)

export const LegacyExpenseEventSourceV2GuestSharedSqlSchema = z.object({
  access_state: EventV2AccessStateSchema,
  label_state: EventV2LabelStateSchema,
  display_name: EventV2SafeDisplayNameSchema.nullable(),
  selectable: z.boolean(),
  disabled_reason: EventV2DisabledReasonSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.access_state !== 'active') {
    if (
      value.selectable
      || value.disabled_reason !== 'not_active'
      || (value.label_state === 'resolved') !== (value.display_name !== null)
    ) {
      context.addIssue({ code: 'custom', message: 'legacy_guest_inactive_mismatch' })
    }
    return
  }
  if (value.label_state === 'resolved') {
    if (value.display_name === null || !value.selectable || value.disabled_reason !== null) {
      context.addIssue({ code: 'custom', message: 'legacy_guest_active_resolved_mismatch' })
    }
    return
  }
  if (
    value.display_name !== null
    || value.selectable
    || (value.disabled_reason !== 'name_required'
      && value.disabled_reason !== 'profile_name_required')
  ) {
    context.addIssue({ code: 'custom', message: 'legacy_guest_active_unresolved_mismatch' })
  }
})

export const LegacyExpenseEventSourceV2OrganizerPersonSqlSchema = z.object({
  legacy_person_ref: EventV2UuidSchema,
  participant_kind: z.literal('organizer'),
  position: z.literal(0),
  shared: LegacyExpenseEventSourceV2OrganizerSharedSqlSchema,
  viewer_private: EventV2ViewerPrivateSqlSchema.optional(),
}).strict()

export const LegacyExpenseEventSourceV2GuestPersonSqlSchema = z.object({
  legacy_person_ref: EventV2UuidSchema,
  participant_kind: z.literal('guest'),
  position: z.number().int().min(0).max(48),
  shared: LegacyExpenseEventSourceV2GuestSharedSqlSchema,
  viewer_private: EventV2ViewerPrivateSqlSchema.optional(),
}).strict()

export const LegacyExpenseEventSourceV2PersonSqlSchema = z.discriminatedUnion(
  'participant_kind',
  [
    LegacyExpenseEventSourceV2OrganizerPersonSqlSchema,
    LegacyExpenseEventSourceV2GuestPersonSqlSchema,
  ],
)

const legacyEventBase = {
  event_id: EventV2UuidSchema,
  name: EventV2EventNameSchema,
  roster_revision: EventV2PgBigintSchema,
  people: z.array(LegacyExpenseEventSourceV2PersonSqlSchema).max(49),
} as const

export const LegacyExpenseEventSourceV2OwnerSqlSchema = z.object({
  ...legacyEventBase,
  viewer_role: z.literal('owner'),
}).strict()

export const LegacyExpenseEventSourceV2AttendeeSqlSchema = z.object({
  ...legacyEventBase,
  viewer_role: z.literal('attendee'),
}).strict()

export const LegacyExpenseEventSourceV2SqlSchema = z.discriminatedUnion('viewer_role', [
  LegacyExpenseEventSourceV2OwnerSqlSchema,
  LegacyExpenseEventSourceV2AttendeeSqlSchema,
])

export const LegacyExpenseEventSourceV2ListSqlSchema = z.object({
  events: z.array(LegacyExpenseEventSourceV2OwnerSqlSchema).max(100),
}).strict()

interface LegacyExpenseEventSourceV2PersonBase {
  legacyPersonRef: string
  position: number
  viewerPrivate?: EventV2ViewerPrivate
}

export interface LegacyExpenseEventSourceV2OrganizerPerson
  extends LegacyExpenseEventSourceV2PersonBase {
  participantKind: 'organizer'
  position: 0
  shared: {
    labelState: EventV2LabelState
    displayName: string | null
    selectable: boolean
    disabledReason: 'profile_name_required' | null
  }
}

export interface LegacyExpenseEventSourceV2GuestPerson
  extends LegacyExpenseEventSourceV2PersonBase {
  participantKind: 'guest'
  shared: {
    accessState: EventV2AccessState
    labelState: EventV2LabelState
    displayName: string | null
    selectable: boolean
    disabledReason: 'name_required' | 'profile_name_required' | 'not_active' | null
  }
}

export type LegacyExpenseEventSourceV2Person =
  | LegacyExpenseEventSourceV2OrganizerPerson
  | LegacyExpenseEventSourceV2GuestPerson

interface LegacyExpenseEventSourceV2Base {
  eventId: string
  name: string
  rosterRevision: string
  people: LegacyExpenseEventSourceV2Person[]
}

export interface LegacyExpenseEventSourceV2Owner extends LegacyExpenseEventSourceV2Base {
  viewerRole: 'owner'
}

export interface LegacyExpenseEventSourceV2Attendee extends LegacyExpenseEventSourceV2Base {
  viewerRole: 'attendee'
}

export type LegacyExpenseEventSourceV2 =
  | LegacyExpenseEventSourceV2Owner
  | LegacyExpenseEventSourceV2Attendee

export type LegacyExpenseEventSourceV2Sql = z.infer<typeof LegacyExpenseEventSourceV2SqlSchema>
export type LegacyExpenseEventSourceV2OwnerSql = z.infer<typeof LegacyExpenseEventSourceV2OwnerSqlSchema>
export type LegacyExpenseEventSourceV2AttendeeSql = z.infer<typeof LegacyExpenseEventSourceV2AttendeeSqlSchema>
