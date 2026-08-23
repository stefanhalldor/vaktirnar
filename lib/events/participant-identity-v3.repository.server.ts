import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import {
  EventActorViewV3SqlSchema,
  EventListForActorV3SqlSchema,
  EventPersonSourceV3PageSqlSchema,
  EventPersonSourceV3RosterSqlSchema,
  EventScopedParticipationsV3SqlSchema,
  EventV3RepositoryError,
  EventV3UuidSchema,
  LeaveEventParticipationV3InputSchema,
  LeaveEventParticipationV3ResultSqlSchema,
  ResolveEventInvitationV3ResultSqlSchema,
  SetEventRsvpV3InputSchema,
  SetEventRsvpV3ResultSqlSchema,
  type EventActorViewV3,
  type EventLeaveParticipationV3Result,
  type EventListForActorV3,
  type EventListForActorV3AttendeeSummary,
  type EventListForActorV3OwnerSummary,
  type EventPersonSourceV3Page,
  type EventPersonSourceV3Roster,
  type EventSetRsvpV3Result,
  type EventV3Person,
  type EventV3PersonSql,
  type EventV3RepositoryErrorCode,
  type LeaveEventParticipationV3Input,
  type SetEventRsvpV3Input,
} from './participant-identity-v3.contracts'
import type {
  EventV2ViewerPrivate,
  EventV2ViewerPrivateSql,
} from './participant-identity-v2.contracts'

type RpcError = { code?: string | null; message?: string | null } | null

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

const RPC_ERROR_CODES: Readonly<Record<string, EventV3RepositoryErrorCode>> = {
  teskeid_event_invalid_input: 'invalid_input',
  teskeid_event_guest_invalid: 'invalid_input',
  teskeid_event_guest_conflict: 'conflict',
  teskeid_event_not_found: 'not_found',
  teskeid_event_not_allowed: 'not_allowed',
  teskeid_event_unavailable: 'not_available',
  teskeid_event_invitation_recipient_unavailable: 'not_available',
  teskeid_event_claim_limit_exceeded: 'not_available',
  teskeid_event_revision_conflict: 'conflict',
  teskeid_event_rsvp_version_conflict: 'conflict',
  teskeid_event_idempotency_conflict: 'conflict',
  teskeid_event_idempotency_incomplete: 'conflict',
  teskeid_event_fingerprint_mismatch: 'conflict',
  teskeid_event_roster_conflict: 'conflict',
  teskeid_event_invitation_conflict: 'conflict',
  teskeid_event_rate_limited: 'rate_limited',
  teskeid_event_invitation_rate_limited: 'rate_limited',
}

type SafeSchemaName =
  | 'actor_view'
  | 'invitation_resolution'
  | 'event_list'
  | 'scoped_list'
  | 'person_source_page'
  | 'person_source_roster'
  | 'rsvp_result'
  | 'leave_result'

export function eventV3SafeRpcDiagnostic(error: RpcError) {
  const postgresCode = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
    ? error.code
    : 'unknown'
  return {
    postgresCode,
    category: SQLSTATE_CATEGORIES[postgresCode] ?? 'unclassified_database_error',
  }
}

export function eventV3SafeSchemaDiagnostic(schema: SafeSchemaName, error: z.ZodError) {
  const issueLimit = 12
  return {
    schema,
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

function rpcErrorCode(error: RpcError): EventV3RepositoryErrorCode | null {
  return typeof error?.message === 'string' ? RPC_ERROR_CODES[error.message] ?? null : null
}

function fail(code: EventV3RepositoryErrorCode): never {
  throw new EventV3RepositoryError(code)
}

function throwRpcFailure(error: RpcError, fallback: 'load_failed' | 'save_failed'): never {
  if (process.env.NODE_ENV === 'development') {
    console.error('[events:v3] safe RPC diagnostic', eventV3SafeRpcDiagnostic(error))
  }
  fail(rpcErrorCode(error) ?? fallback)
}

async function runRpc<T>(call: () => PromiseLike<T>, fallback: 'load_failed' | 'save_failed') {
  try {
    return await call()
  } catch {
    fail(fallback)
  }
}

function parseWire<T>(schema: z.ZodType<T>, value: unknown, name: SafeSchemaName): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[events:v3] safe schema diagnostic', eventV3SafeSchemaDiagnostic(name, parsed.error))
    }
    fail('load_failed')
  }
  return parsed.data
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

function mapPerson(value: EventV3PersonSql): EventV3Person {
  const common = {
    personRef: value.person_ref,
    position: value.position,
    isSelf: value.is_self,
    ...(value.viewer_private ? { viewerPrivate: mapViewerPrivate(value.viewer_private) } : {}),
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
    rsvp: {
      state: value.rsvp.state,
      decisionVersion: value.rsvp.decision_version,
      ...(value.rsvp.private_note !== undefined ? { privateNote: value.rsvp.private_note } : {}),
    },
  }
}

function assertUnique(values: string[]): void {
  if (new Set(values).size !== values.length) fail('load_failed')
}

function incrementDecimal(value: string): string | null {
  const next = BigInt(value) + BigInt(1)
  return next <= BigInt('9223372036854775807') ? next.toString() : null
}

function mapOwnerSummary(value: z.infer<typeof EventListForActorV3SqlSchema>['owned'][number]): EventListForActorV3OwnerSummary {
  return {
    id: value.event_id,
    name: value.name,
    activeGuestCount: value.active_guest_count,
    rosterRevision: value.roster_revision,
    viewerRole: 'owner',
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

function mapAttendeeSummary(value: z.infer<typeof EventListForActorV3SqlSchema>['participating'][number]): EventListForActorV3AttendeeSummary {
  return {
    id: value.event_id,
    name: value.name,
    activeGuestCount: value.active_guest_count,
    rosterRevision: value.roster_revision,
    viewerRole: 'attendee',
    rsvpState: value.self_rsvp_state,
    decisionVersion: value.self_decision_version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

export async function resolveEventInvitationV3(actorUserId: string, invitationId: string) {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const invitation = EventV3UuidSchema.safeParse(invitationId)
  if (!actor.success || !invitation.success) return null
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_resolve_invitation_v3',
    { p_actor_id: actor.data, p_invitation_id: invitation.data },
  ), 'load_failed')
  if (error) {
    const code = rpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwRpcFailure(error, 'load_failed')
  }
  const parsed = parseWire(
    ResolveEventInvitationV3ResultSqlSchema,
    data,
    'invitation_resolution',
  )
  return {
    status: parsed.status,
    eventId: parsed.event_id,
    capability: parsed.capability,
  } as const
}

export async function listScopedEventParticipationsV3(actorUserId: string) {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  if (!actor.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_list_scoped_participations_v3',
    { p_actor_id: actor.data },
  ), 'load_failed')
  if (error) throwRpcFailure(error, 'load_failed')
  const parsed = parseWire(EventScopedParticipationsV3SqlSchema, data, 'scoped_list')
  assertUnique(parsed.participating.map((event) => event.event_id))
  return {
    participating: parsed.participating.map(mapAttendeeSummary),
    participatingHasMore: parsed.participating_has_more,
    claimHasMore: parsed.claim_has_more,
  }
}

export async function listEventsForActorV3(actorUserId: string): Promise<EventListForActorV3> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  if (!actor.success) fail('invalid_input')
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_list_for_actor_v3',
    { p_actor_id: actor.data },
  ), 'load_failed')
  if (error) throwRpcFailure(error, 'load_failed')
  const parsed = parseWire(EventListForActorV3SqlSchema, data, 'event_list')
  const allIds = [
    ...parsed.owned.map((event) => event.event_id),
    ...parsed.participating.map((event) => event.event_id),
  ]
  assertUnique(allIds)
  return {
    owned: parsed.owned.map(mapOwnerSummary),
    ownedHasMore: parsed.owned_has_more,
    participating: parsed.participating.map(mapAttendeeSummary),
    participatingHasMore: parsed.participating_has_more,
    claimHasMore: parsed.claim_has_more,
  }
}

export async function getEventActorViewV3(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventActorViewV3 | null> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const event = EventV3UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) return null
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_get_actor_view_v3',
    { p_actor_id: actor.data, p_event_id: event.data },
  ), 'load_failed')
  if (error) {
    const code = rpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') {
      return null
    }
    throwRpcFailure(error, 'load_failed')
  }
  const parsed = parseWire(EventActorViewV3SqlSchema, data, 'actor_view')
  if (parsed.event_id !== event.data) fail('load_failed')
  const base = {
    eventId: parsed.event_id,
    name: parsed.name,
    rosterRevision: parsed.roster_revision,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    eventDate: parsed.event_date,
    eventTime: parsed.event_time,
    description: parsed.description,
    agenda: parsed.agenda,
    people: parsed.people.map(mapPerson),
  }
  if (parsed.viewer_role === 'owner') return { ...base, viewerRole: 'owner' }
  return {
    ...base,
    viewerRole: 'attendee',
    selfRsvp: {
      state: parsed.self_rsvp.state,
      decisionVersion: parsed.self_rsvp.decision_version,
      ...(parsed.self_rsvp.private_note !== undefined
        ? { privateNote: parsed.self_rsvp.private_note }
        : {}),
    },
  }
}

const cursorSchema = z.object({
  beforeSortAt: z.string().datetime({ offset: true }),
  beforeEventId: EventV3UuidSchema,
}).strict()
const pageLimitSchema = z.number().int().min(1).max(50)

export async function listEventPersonSourceEventsV3(
  actorUserId: string,
  cursor: { beforeSortAt: string; beforeEventId: string } | null = null,
  limit = 20,
): Promise<EventPersonSourceV3Page> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const parsedLimit = pageLimitSchema.safeParse(limit)
  const parsedCursor = cursor === null ? null : cursorSchema.safeParse(cursor)
  if (!actor.success || !parsedLimit.success || (parsedCursor !== null && !parsedCursor.success)) {
    fail('invalid_input')
  }
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_list_person_source_events_v3',
    {
      p_actor_id: actor.data,
      p_before_sort_at: parsedCursor?.data.beforeSortAt ?? null,
      p_before_event_id: parsedCursor?.data.beforeEventId ?? null,
      p_limit: parsedLimit.data,
    },
  ), 'load_failed')
  if (error) throwRpcFailure(error, 'load_failed')
  const parsed = parseWire(EventPersonSourceV3PageSqlSchema, data, 'person_source_page')
  assertUnique(parsed.events.map((event) => event.event_id))
  if (parsed.events.length > parsedLimit.data) fail('load_failed')
  if (parsed.next_cursor !== null) {
    const last = parsed.events.at(-1)
    if (
      parsed.events.length !== parsedLimit.data
      || last?.event_id !== parsed.next_cursor.before_event_id
    ) fail('load_failed')
  }
  return {
    events: parsed.events.map((event) => ({
      id: event.event_id,
      name: event.name,
      rosterRevision: event.roster_revision,
      viewerRole: event.viewer_role,
      activePersonCount: event.active_person_count,
      ...(event.viewer_role === 'attendee'
        ? {
            rsvpState: event.self_rsvp_state,
            decisionVersion: event.self_decision_version,
          }
        : {}),
    })),
    nextCursor: parsed.next_cursor === null ? null : {
      beforeSortAt: parsed.next_cursor.before_sort_at,
      beforeEventId: parsed.next_cursor.before_event_id,
    },
  }
}

export async function getEventPersonSourceRosterV3(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventPersonSourceV3Roster | null> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const event = EventV3UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) return null
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_get_person_source_roster_v3',
    { p_actor_id: actor.data, p_event_id: event.data },
  ), 'load_failed')
  if (error) {
    const code = rpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwRpcFailure(error, 'load_failed')
  }
  const parsed = parseWire(EventPersonSourceV3RosterSqlSchema, data, 'person_source_roster')
  if (parsed.event_id !== event.data) fail('load_failed')
  return {
    eventId: parsed.event_id,
    name: parsed.name,
    rosterRevision: parsed.roster_revision,
    viewerRole: parsed.viewer_role,
    people: parsed.people.map(mapPerson),
  }
}

export async function setEventRsvpV3(
  actorUserId: string,
  input: SetEventRsvpV3Input,
): Promise<EventSetRsvpV3Result> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const parsedInput = SetEventRsvpV3InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const value = parsedInput.data
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_set_rsvp_v3',
    {
      p_actor_id: actor.data,
      p_event_id: value.event_id,
      p_event_guest_id: value.event_guest_id,
      p_identity_generation: value.identity_generation,
      p_rsvp_state: value.rsvp_state,
      p_private_note: value.private_note,
      p_expected_decision_version: value.expected_decision_version,
      p_request_id: value.request_id,
    },
  ), 'save_failed')
  if (error) throwRpcFailure(error, 'save_failed')
  const parsed = parseWire(SetEventRsvpV3ResultSqlSchema, data, 'rsvp_result')
  if (
    parsed.request_id !== value.request_id
    || parsed.event_id !== value.event_id
    || parsed.event_guest_id !== value.event_guest_id
    || parsed.identity_generation !== value.identity_generation
    || parsed.rsvp_state !== value.rsvp_state
    || parsed.decision_version !== (parsed.status === 'unchanged'
      ? value.expected_decision_version
      : incrementDecimal(value.expected_decision_version))
  ) fail('save_failed')
  return {
    status: parsed.status,
    requestId: parsed.request_id,
    eventId: parsed.event_id,
    eventGuestId: parsed.event_guest_id,
    identityGeneration: parsed.identity_generation,
    accessState: parsed.access_state,
    accessVersion: parsed.access_version,
    rsvpState: parsed.rsvp_state,
    decisionVersion: parsed.decision_version,
  }
}

export async function leaveEventParticipationV3(
  actorUserId: string,
  input: LeaveEventParticipationV3Input,
): Promise<EventLeaveParticipationV3Result> {
  const actor = EventV3UuidSchema.safeParse(actorUserId)
  const parsedInput = LeaveEventParticipationV3InputSchema.safeParse(input)
  if (!actor.success || !parsedInput.success) fail('invalid_input')
  const value = parsedInput.data
  const { data, error } = await runRpc(() => getAdmin().rpc(
    'teskeid_event_leave_participation_v3',
    {
      p_actor_id: actor.data,
      p_event_id: value.event_id,
      p_event_guest_id: value.event_guest_id,
      p_identity_generation: value.identity_generation,
      p_expected_identity_version: value.expected_identity_version,
      p_expected_access_version: value.expected_access_version,
      p_request_id: value.request_id,
    },
  ), 'save_failed')
  if (error) throwRpcFailure(error, 'save_failed')
  const parsed = parseWire(LeaveEventParticipationV3ResultSqlSchema, data, 'leave_result')
  if (
    parsed.request_id !== value.request_id
    || parsed.event_id !== value.event_id
    || parsed.event_guest_id !== value.event_guest_id
    || parsed.identity_generation !== value.identity_generation
    || parsed.identity_version !== value.expected_identity_version
    || parsed.access_version !== incrementDecimal(value.expected_access_version)
  ) fail('save_failed')
  return {
    status: parsed.status,
    requestId: parsed.request_id,
    eventId: parsed.event_id,
    eventGuestId: parsed.event_guest_id,
    identityGeneration: parsed.identity_generation,
    identityVersion: parsed.identity_version,
    accessVersion: parsed.access_version,
  }
}
