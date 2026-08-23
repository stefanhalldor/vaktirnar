import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import {
  CreateEventWithParticipationsV2InputSchema,
  CreateEventWithParticipationsV2ResultSqlSchema,
  EventActorViewV2SqlSchema,
  EventListForActorV2SqlSchema,
  EventPersonSourceV2PageSqlSchema,
  EventPersonSourceV2RosterSqlSchema,
  EventRosterManagementV2SqlSchema,
  EventV2RepositoryError,
  EventV2UuidSchema,
  RepairEventPersonLabelV2InputSchema,
  RepairEventPersonLabelV2ResultSqlSchema,
  ReplaceEventRosterWithParticipationsV2InputSchema,
  ReplaceEventRosterWithParticipationsV2ResultSqlSchema,
  SetEventRsvpV2InputSchema,
  SetEventRsvpV2ResultSqlSchema,
  type CreateEventWithParticipationsV2Input,
  type EventActorViewV2,
  type EventCreateOrReplaceV2Result,
  type EventInvitationReceiptV2,
  type EventListForActorV2,
  type EventPersonSourceV2Page,
  type EventPersonSourceV2Roster,
  type EventRepairPersonLabelV2Result,
  type EventRosterManagementV2,
  type EventSetRsvpV2Result,
  type EventV2Person,
  type EventV2PersonSql,
  type EventV2RepositoryErrorCode,
  type EventV2ViewerPrivate,
  type EventV2ViewerPrivateSql,
  type RepairEventPersonLabelV2Input,
  type ReplaceEventRosterWithParticipationsV2Input,
  type SetEventRsvpV2Input,
} from './participant-identity-v2.contracts'

type RpcError = {
  code?: string | null
  message?: string | null
} | null

type EventV2SafeRpcDiagnostic = {
  postgresCode: string
  category: string
  subject?: string
}

type EventV2SafeSchemaDiagnostic = {
  schema: 'actor_view'
  issueCount: number
  issues: Array<{
    code: string
    path: string
  }>
  truncated: boolean
}

const SQLSTATE_CATEGORIES: Readonly<Record<string, string>> = {
  '22P02': 'invalid_text_representation',
  '22023': 'invalid_parameter_value',
  '23502': 'not_null_violation',
  '23503': 'foreign_key_violation',
  '23505': 'unique_violation',
  '42501': 'insufficient_privilege',
  '42702': 'ambiguous_column',
  '42703': 'undefined_column',
  '42883': 'undefined_function_or_operator',
  '42P01': 'undefined_relation',
  P0001: 'raised_exception',
}

const SAFE_MESSAGE_SUBJECTS = [
  /function ([a-z_][a-z0-9_.]*\([a-z0-9_ ,.\[\]]*\)) does not exist/i,
  /operator does not exist: ([a-z0-9_ ]+ [=<>+*/-]+ [a-z0-9_ ]+)/i,
  /column reference "([a-z_][a-z0-9_]*)" is ambiguous/i,
  /column "([a-z_][a-z0-9_]*)" does not exist/i,
  /relation "([a-z_][a-z0-9_.]*)" does not exist/i,
] as const

export function eventV2SafeRpcDiagnostic(error: RpcError): EventV2SafeRpcDiagnostic {
  const postgresCode = typeof error?.code === 'string'
    && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : 'unknown'
  const category = SQLSTATE_CATEGORIES[postgresCode] ?? 'unclassified_database_error'
  const message = typeof error?.message === 'string' ? error.message : ''
  const subject = SAFE_MESSAGE_SUBJECTS
    .map((pattern) => message.match(pattern)?.[1])
    .find((value): value is string => Boolean(value))
  return {
    postgresCode,
    category,
    ...(subject ? { subject } : {}),
  }
}

export function eventV2SafeActorViewSchemaDiagnostic(
  error: z.ZodError,
): EventV2SafeSchemaDiagnostic {
  const issueLimit = 12
  return {
    schema: 'actor_view',
    issueCount: error.issues.length,
    issues: error.issues.slice(0, issueLimit).map((issue) => ({
      code: issue.code,
      path: issue.path.map((segment) => {
        if (typeof segment === 'number') return `[${segment}]`
        return typeof segment === 'string' && /^[a-z][a-z0-9_]*$/i.test(segment)
          ? segment
          : '?'
      }).join('.').replaceAll('.[', '['),
    })),
    truncated: error.issues.length > issueLimit,
  }
}

const RPC_ERROR_CODES: Readonly<Record<string, EventV2RepositoryErrorCode>> = {
  teskeid_event_invalid_input: 'invalid_input',
  teskeid_event_guest_invalid: 'invalid_input',
  teskeid_event_guest_conflict: 'conflict',
  teskeid_event_not_found: 'not_found',
  teskeid_event_not_allowed: 'not_allowed',
  teskeid_event_unavailable: 'not_available',
  teskeid_event_invitation_recipient_unavailable: 'not_available',
  teskeid_event_claim_limit_exceeded: 'not_available',
  teskeid_event_revision_conflict: 'conflict',
  teskeid_event_label_version_conflict: 'conflict',
  teskeid_event_rsvp_version_conflict: 'conflict',
  teskeid_event_idempotency_conflict: 'conflict',
  teskeid_event_idempotency_incomplete: 'conflict',
  teskeid_event_roster_conflict: 'conflict',
  teskeid_event_invitation_conflict: 'conflict',
  teskeid_event_rate_limited: 'rate_limited',
  teskeid_event_invitation_rate_limited: 'rate_limited',
}

export function eventV2RpcErrorCode(error: RpcError): EventV2RepositoryErrorCode | null {
  if (typeof error?.message !== 'string') return null
  return RPC_ERROR_CODES[error.message] ?? null
}

export function throwEventV2RpcFailure(
  error: RpcError,
  fallback: 'load_failed' | 'save_failed',
): never {
  if (process.env.NODE_ENV === 'development') {
    console.error('[events:v2] safe RPC diagnostic', eventV2SafeRpcDiagnostic(error))
  }
  throw new EventV2RepositoryError(eventV2RpcErrorCode(error) ?? fallback)
}

function fail(code: EventV2RepositoryErrorCode): never {
  throw new EventV2RepositoryError(code)
}

async function runRpc<T>(
  call: () => PromiseLike<T>,
  fallback: 'load_failed' | 'save_failed',
): Promise<T> {
  try {
    return await call()
  } catch {
    fail(fallback)
  }
}

function mapViewerPrivate(value: EventV2ViewerPrivateSql): EventV2ViewerPrivate {
  return {
    kind: 'relationship',
    alias: value.alias,
    email: value.email,
    builtInTags: value.built_in_tags,
    customLabels: value.custom_labels,
    hiddenCustomLabelCount: value.hidden_custom_label_count,
    note: value.note,
  }
}

function mapPerson(value: EventV2PersonSql): EventV2Person {
  const common = {
    personRef: value.person_ref,
    position: value.position,
    isSelf: value.is_self,
    ...(value.viewer_private
      ? { viewerPrivate: mapViewerPrivate(value.viewer_private) }
      : {}),
  }
  if (value.participant_kind === 'organizer') {
    return {
      ...common,
      participantKind: 'organizer',
      position: 0,
      shared: {
        labelState: value.shared.label_state,
        displayName: value.shared.display_name,
        selectable: value.shared.selectable,
        bulkEligible: value.shared.bulk_eligible,
        disabledReason: value.shared.disabled_reason,
      },
    }
  }
  return {
    ...common,
    participantKind: 'guest',
    shared: {
      accessState: value.shared.access_state,
      rsvpState: value.shared.rsvp_state,
      labelState: value.shared.label_state,
      displayName: value.shared.display_name,
      selectable: value.shared.selectable,
      bulkEligible: value.shared.bulk_eligible,
      disabledReason: value.shared.disabled_reason,
    },
    labelVersion: value.label_version,
    identityVersion: value.identity_version,
    identityGeneration: value.identity_generation,
    accessVersion: value.access_version,
    rsvpVersion: value.rsvp_version,
  }
}

function mapPeople(
  people: EventV2PersonSql[],
  viewerRole: 'owner' | 'attendee',
): EventV2Person[] {
  if (
    new Set(people.map((person) => person.person_ref)).size !== people.length
    || people.some((person, index) => person.position !== index)
    || people[0]?.participant_kind !== 'organizer'
    || people.slice(1).some((person) => person.participant_kind !== 'guest')
    || people.filter((person) => person.is_self).length !== 1
    || (viewerRole === 'owner' && !people[0]?.is_self)
    || (viewerRole === 'attendee' && people[0]?.is_self)
  ) fail('load_failed')
  return people.map(mapPerson)
}

const cursorInputSchema = z.object({
  beforeSortAt: z.string().datetime({ offset: true }),
  beforeEventId: EventV2UuidSchema,
}).strict()
const pageLimitSchema = z.number().int().min(1).max(50)

export async function listEventPersonSourceEventsV2(
  actorUserId: string,
  cursor: { beforeSortAt: string; beforeEventId: string } | null = null,
  limit = 20,
): Promise<EventPersonSourceV2Page> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const parsedCursor = cursor === null ? null : cursorInputSchema.safeParse(cursor)
  const parsedLimit = pageLimitSchema.safeParse(limit)
  if (!actor.success || parsedCursor !== null && !parsedCursor.success || !parsedLimit.success) {
    fail('invalid_input')
  }

  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_list_person_source_events_v2',
    {
      p_actor_id: actor.data,
      p_before_sort_at: parsedCursor?.data.beforeSortAt ?? null,
      p_before_event_id: parsedCursor?.data.beforeEventId ?? null,
      p_limit: parsedLimit.data,
    },
  ), 'load_failed')
  if (error) throwEventV2RpcFailure(error, 'load_failed')
  const parsed = EventPersonSourceV2PageSqlSchema.safeParse(data)
  if (!parsed.success) fail('load_failed')
  if (
    parsed.data.events.length > parsedLimit.data
    || new Set(parsed.data.events.map((event) => event.event_id)).size !== parsed.data.events.length
  ) fail('load_failed')
  if (parsed.data.next_cursor !== null) {
    const last = parsed.data.events.at(-1)
    if (
      parsed.data.events.length !== parsedLimit.data
      || last?.event_id !== parsed.data.next_cursor.before_event_id
    ) fail('load_failed')
  }
  return {
    events: parsed.data.events.map((event) => ({
      id: event.event_id,
      name: event.name,
      rosterRevision: event.roster_revision,
      viewerRole: event.viewer_role,
      activePersonCount: event.active_person_count,
    })),
    nextCursor: parsed.data.next_cursor === null ? null : {
      beforeSortAt: parsed.data.next_cursor.before_sort_at,
      beforeEventId: parsed.data.next_cursor.before_event_id,
    },
  }
}

export async function getEventPersonSourceRosterV2(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventPersonSourceV2Roster | null> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const event = EventV2UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_get_person_source_roster_v2',
    { p_actor_id: actor.data, p_event_id: event.data },
  ), 'load_failed')
  if (error) {
    const code = eventV2RpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwEventV2RpcFailure(error, 'load_failed')
  }
  const parsed = EventPersonSourceV2RosterSqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.event_id !== event.data) fail('load_failed')
  return {
    eventId: parsed.data.event_id,
    name: parsed.data.name,
    rosterRevision: parsed.data.roster_revision,
    viewerRole: parsed.data.viewer_role,
    people: mapPeople(parsed.data.people, parsed.data.viewer_role),
  } as EventPersonSourceV2Roster
}

export async function listEventsForActorV2(actorUserId: string): Promise<EventListForActorV2> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  if (!actor.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_list_for_actor_v2',
    { p_actor_id: actor.data },
  ), 'load_failed')
  if (error) throwEventV2RpcFailure(error, 'load_failed')
  const parsed = EventListForActorV2SqlSchema.safeParse(data)
  if (!parsed.success) fail('load_failed')
  const allIds = [
    ...parsed.data.owned.map((event) => event.event_id),
    ...parsed.data.participating.map((event) => event.event_id),
  ]
  if (new Set(allIds).size !== allIds.length) fail('load_failed')
  return {
    owned: parsed.data.owned.map((event) => ({
      id: event.event_id,
      name: event.name,
      activeGuestCount: event.active_guest_count,
      rosterRevision: event.roster_revision,
      viewerRole: 'owner',
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    })),
    participating: parsed.data.participating.map((event) => ({
      id: event.event_id,
      name: event.name,
      activeGuestCount: event.active_guest_count,
      rosterRevision: event.roster_revision,
      viewerRole: 'attendee',
      rsvpState: event.self_rsvp_state,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    })),
  }
}

export async function getEventActorViewV2(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventActorViewV2 | null> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const event = EventV2UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_get_actor_view_v2',
    { p_actor_id: actor.data, p_event_id: event.data },
  ), 'load_failed')
  if (error) {
    const code = eventV2RpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwEventV2RpcFailure(error, 'load_failed')
  }
  const parsed = EventActorViewV2SqlSchema.safeParse(data)
  if (!parsed.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[events:v2] safe schema diagnostic',
        eventV2SafeActorViewSchemaDiagnostic(parsed.error),
      )
    }
    fail('load_failed')
  }
  if (parsed.data.event_id !== event.data) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[events:v2] safe schema diagnostic', {
        schema: 'actor_view',
        issueCount: 0,
        issues: [],
        truncated: false,
        eventIdMismatch: true,
      })
    }
    fail('load_failed')
  }
  return {
    eventId: parsed.data.event_id,
    name: parsed.data.name,
    rosterRevision: parsed.data.roster_revision,
    viewerRole: parsed.data.viewer_role,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
    eventDate: parsed.data.event_date,
    eventTime: parsed.data.event_time,
    description: parsed.data.description,
    agenda: parsed.data.agenda,
    people: mapPeople(parsed.data.people, parsed.data.viewer_role),
  } as EventActorViewV2
}

export async function getEventRosterManagementV2(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventRosterManagementV2 | null> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const event = EventV2UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_get_roster_management_v2',
    { p_actor_id: actor.data, p_event_id: event.data },
  ), 'load_failed')
  if (error) {
    const code = eventV2RpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwEventV2RpcFailure(error, 'load_failed')
  }
  const parsed = EventRosterManagementV2SqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.event_id !== event.data) fail('load_failed')
  if (
    new Set(parsed.data.guests.map((guest) => guest.event_guest_id)).size
      !== parsed.data.guests.length
    || parsed.data.guests.some((guest, index) => guest.position !== index)
  ) fail('load_failed')
  return {
    eventId: parsed.data.event_id,
    name: parsed.data.name,
    rosterRevision: parsed.data.roster_revision,
    viewerRole: 'owner',
    guests: parsed.data.guests.map((guest) => ({
      eventGuestId: guest.event_guest_id,
      position: guest.position,
      labelState: guest.label_state,
      sharedDisplayName: guest.shared_display_name,
      labelVersion: guest.label_version,
      administrativeEmail: guest.administrative_email,
      recipientState: guest.recipient_state,
      identityVersion: guest.identity_version,
      identityGeneration: guest.identity_generation,
      accessState: guest.access_state,
      accessVersion: guest.access_version,
      rsvpState: guest.rsvp_state,
      rsvpVersion: guest.rsvp_version,
      invitationStatus: guest.invitation_status,
    })),
  }
}

function mapInvitationReceipt(
  invitation: z.infer<typeof CreateEventWithParticipationsV2ResultSqlSchema>['invitations'][number],
): EventInvitationReceiptV2 {
  return {
    invitationId: invitation.invitation_id,
    eventGuestId: invitation.event_guest_id,
    invitationKind: invitation.invitation_kind,
    recipientLabel: invitation.recipient_label,
    invitedAt: invitation.invited_at,
    expiresAt: invitation.expires_at,
  }
}

function assertUniqueInvitationReceipts(
  invitations: Array<{ invitation_id: string; event_guest_id: string }>,
) {
  if (
    new Set(invitations.map((invitation) => invitation.invitation_id)).size !== invitations.length
    || new Set(invitations.map((invitation) => invitation.event_guest_id)).size !== invitations.length
  ) fail('save_failed')
}

export async function createEventWithParticipationsV2(
  actorUserId: string,
  input: CreateEventWithParticipationsV2Input,
): Promise<EventCreateOrReplaceV2Result> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const parsedInput = CreateEventWithParticipationsV2InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_create_with_details_and_participations_v2',
    {
      p_actor_id: actor.data,
      p_request_id: parsedInput.data.request_id,
      p_name: parsedInput.data.name,
      p_guests: parsedInput.data.guests,
      p_event_date: parsedInput.data.event_date,
      p_event_time: parsedInput.data.event_time,
      p_description: parsedInput.data.description,
      p_agenda: parsedInput.data.agenda,
    },
  ), 'save_failed')
  if (error) throwEventV2RpcFailure(error, 'save_failed')
  const parsed = CreateEventWithParticipationsV2ResultSqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.request_id !== parsedInput.data.request_id) fail('save_failed')
  assertUniqueInvitationReceipts(parsed.data.invitations)
  return {
    status: 'created',
    requestId: parsed.data.request_id,
    eventId: parsed.data.event_id,
    rosterRevision: parsed.data.roster_revision,
    invitations: parsed.data.invitations.map(mapInvitationReceipt),
  }
}

export async function replaceEventRosterWithParticipationsV2(
  actorUserId: string,
  input: ReplaceEventRosterWithParticipationsV2Input,
): Promise<EventCreateOrReplaceV2Result> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const parsedInput = ReplaceEventRosterWithParticipationsV2InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_replace_roster_with_participations_v2',
    {
      p_actor_id: actor.data,
      p_event_id: parsedInput.data.event_id,
      p_request_id: parsedInput.data.request_id,
      p_expected_roster_revision: parsedInput.data.expected_roster_revision,
      p_guests: parsedInput.data.guests,
    },
  ), 'save_failed')
  if (error) throwEventV2RpcFailure(error, 'save_failed')
  const parsed = ReplaceEventRosterWithParticipationsV2ResultSqlSchema.safeParse(data)
  if (
    !parsed.success
    || parsed.data.request_id !== parsedInput.data.request_id
    || parsed.data.event_id !== parsedInput.data.event_id
  ) fail('save_failed')
  assertUniqueInvitationReceipts(parsed.data.invitations)
  return {
    status: 'updated',
    requestId: parsed.data.request_id,
    eventId: parsed.data.event_id,
    rosterRevision: parsed.data.roster_revision,
    invitations: parsed.data.invitations.map(mapInvitationReceipt),
  }
}

export async function repairEventPersonLabelV2(
  actorUserId: string,
  input: RepairEventPersonLabelV2Input,
): Promise<EventRepairPersonLabelV2Result> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const parsedInput = RepairEventPersonLabelV2InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_repair_person_label_v2',
    {
      p_actor_id: actor.data,
      p_event_id: parsedInput.data.event_id,
      p_event_guest_id: parsedInput.data.event_guest_id,
      p_expected_roster_revision: parsedInput.data.expected_roster_revision,
      p_expected_label_version: parsedInput.data.expected_label_version,
      p_shared_display_name: parsedInput.data.shared_display_name,
      p_request_id: parsedInput.data.request_id,
    },
  ), 'save_failed')
  if (error) throwEventV2RpcFailure(error, 'save_failed')
  const parsed = RepairEventPersonLabelV2ResultSqlSchema.safeParse(data)
  if (
    !parsed.success
    || parsed.data.request_id !== parsedInput.data.request_id
    || parsed.data.event_id !== parsedInput.data.event_id
    || parsed.data.event_guest_id !== parsedInput.data.event_guest_id
  ) fail('save_failed')
  return {
    status: parsed.data.status,
    requestId: parsed.data.request_id,
    eventId: parsed.data.event_id,
    eventGuestId: parsed.data.event_guest_id,
    rosterRevision: parsed.data.roster_revision,
    labelVersion: parsed.data.label_version,
  }
}

export async function setEventRsvpV2(
  actorUserId: string,
  input: SetEventRsvpV2Input,
): Promise<EventSetRsvpV2Result> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const parsedInput = SetEventRsvpV2InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_set_rsvp_v2',
    {
      p_actor_id: actor.data,
      p_event_id: parsedInput.data.event_id,
      p_event_guest_id: parsedInput.data.event_guest_id,
      p_rsvp_state: parsedInput.data.rsvp_state,
      p_expected_rsvp_version: parsedInput.data.expected_rsvp_version,
      p_request_id: parsedInput.data.request_id,
    },
  ), 'save_failed')
  if (error) throwEventV2RpcFailure(error, 'save_failed')
  const parsed = SetEventRsvpV2ResultSqlSchema.safeParse(data)
  if (
    !parsed.success
    || parsed.data.request_id !== parsedInput.data.request_id
    || parsed.data.event_id !== parsedInput.data.event_id
    || parsed.data.event_guest_id !== parsedInput.data.event_guest_id
    || parsed.data.rsvp_state !== parsedInput.data.rsvp_state
    || parsed.data.access_state !== 'active'
  ) fail('save_failed')
  return {
    status: parsed.data.status,
    requestId: parsed.data.request_id,
    eventId: parsed.data.event_id,
    eventGuestId: parsed.data.event_guest_id,
    accessState: parsed.data.access_state,
    accessVersion: parsed.data.access_version,
    rsvpState: parsed.data.rsvp_state,
    rsvpVersion: parsed.data.rsvp_version,
  }
}
