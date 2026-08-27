import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import {
  EventV2RepositoryError,
  EventV2UuidSchema,
  type EventV2ViewerPrivate,
  type EventV2ViewerPrivateSql,
} from './participant-identity-v2.contracts'
import {
  LegacyExpenseEventSourceV2ListSqlSchema,
  LegacyExpenseEventSourceV2SqlSchema,
  type LegacyExpenseEventSourceV2,
  type LegacyExpenseEventSourceV2Attendee,
  type LegacyExpenseEventSourceV2AttendeeSql,
  type LegacyExpenseEventSourceV2Owner,
  type LegacyExpenseEventSourceV2OwnerSql,
  type LegacyExpenseEventSourceV2Person,
  type LegacyExpenseEventSourceV2Sql,
} from './legacy-expense-event-source-v2.contracts'
import {
  eventV2RpcErrorCode,
  throwEventV2RpcFailure,
} from './participant-identity-v2.repository.server'

function loadFailed(): never {
  throw new EventV2RepositoryError('load_failed')
}

async function runLoadRpc<T>(call: () => PromiseLike<T>): Promise<T> {
  try {
    return await call()
  } catch {
    loadFailed()
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

function mapLegacyPerson(
  person: LegacyExpenseEventSourceV2Sql['people'][number],
): LegacyExpenseEventSourceV2Person {
  const common = {
    legacyPersonRef: person.legacy_person_ref,
    position: person.position,
    ...(person.viewer_private
      ? { viewerPrivate: mapViewerPrivate(person.viewer_private) }
      : {}),
  }
  if (person.participant_kind === 'organizer') {
    return {
      ...common,
      participantKind: 'organizer',
      position: 0,
      shared: {
        labelState: person.shared.label_state,
        displayName: person.shared.display_name,
        selectable: person.shared.selectable,
        disabledReason: person.shared.disabled_reason,
      },
    }
  }
  return {
    ...common,
    participantKind: 'guest',
    shared: {
      accessState: person.shared.access_state,
      labelState: person.shared.label_state,
      displayName: person.shared.display_name,
      selectable: person.shared.selectable,
      disabledReason: person.shared.disabled_reason,
    },
  }
}

function mapLegacyPeople(event: LegacyExpenseEventSourceV2Sql): LegacyExpenseEventSourceV2Person[] {
  if (
    new Set(event.people.map((person) => person.legacy_person_ref)).size !== event.people.length
    || event.people.some((person, index) => person.position !== index)
    || (event.viewer_role === 'owner'
      && event.people.some((person) => person.participant_kind !== 'guest'))
    || (event.viewer_role === 'attendee'
      && (event.people[0]?.participant_kind !== 'organizer'
        || event.people.slice(1).some((person) => person.participant_kind !== 'guest')))
  ) loadFailed()
  return event.people.map(mapLegacyPerson)
}

function mapLegacyOwnerEvent(
  event: LegacyExpenseEventSourceV2OwnerSql,
): LegacyExpenseEventSourceV2Owner {
  return {
    eventId: event.event_id,
    name: event.name,
    rosterRevision: event.roster_revision,
    viewerRole: 'owner',
    people: mapLegacyPeople(event),
  }
}

function mapLegacyAttendeeEvent(
  event: LegacyExpenseEventSourceV2AttendeeSql,
): LegacyExpenseEventSourceV2Attendee {
  return {
    eventId: event.event_id,
    name: event.name,
    rosterRevision: event.roster_revision,
    viewerRole: 'attendee',
    people: mapLegacyPeople(event),
  }
}

function mapLegacyEvent(event: LegacyExpenseEventSourceV2Sql): LegacyExpenseEventSourceV2 {
  return event.viewer_role === 'owner'
    ? mapLegacyOwnerEvent(event)
    : mapLegacyAttendeeEvent(event)
}

export async function listLegacyExpenseEventSourcesV2(
  actorUserId: string,
): Promise<LegacyExpenseEventSourceV2Owner[]> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  if (!actor.success) throw new EventV2RepositoryError('invalid_input')
  const { data, error } = await runLoadRpc(() => getAdmin().rpc(
    'teskeid_event_list_legacy_expense_sources_v2',
    { p_actor_id: actor.data },
  ))
  if (error) throwEventV2RpcFailure(error, 'load_failed')
  const parsed = LegacyExpenseEventSourceV2ListSqlSchema.safeParse(data)
  if (!parsed.success) loadFailed()
  if (new Set(parsed.data.events.map((event) => event.event_id)).size !== parsed.data.events.length) {
    loadFailed()
  }
  return parsed.data.events.map(mapLegacyOwnerEvent)
}

export async function getLegacyExpenseEventSourceV2(
  actorUserId: string,
  requestedEventId: string,
): Promise<LegacyExpenseEventSourceV2 | null> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const event = EventV2UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) throw new EventV2RepositoryError('invalid_input')
  const { data, error } = await runLoadRpc(() => getAdmin().rpc(
    'teskeid_event_get_legacy_expense_source_v2',
    { p_actor_id: actor.data, p_event_id: event.data },
  ))
  if (error) {
    const code = eventV2RpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwEventV2RpcFailure(error, 'load_failed')
  }
  const parsed = LegacyExpenseEventSourceV2SqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.event_id !== event.data) loadFailed()
  return mapLegacyEvent(parsed.data)
}

/** SQL162 exact source. The strict wire shape remains compatible with the
 * established V2 presentation contract, but authority is current SQL153
 * attendance rather than the legacy membership graph. */
export async function getCurrentExpenseEventSourceV3(
  actorUserId: string,
  requestedEventId: string,
): Promise<LegacyExpenseEventSourceV2 | null> {
  const actor = EventV2UuidSchema.safeParse(actorUserId)
  const event = EventV2UuidSchema.safeParse(requestedEventId)
  if (!actor.success || !event.success) throw new EventV2RepositoryError('invalid_input')
  const { data, error } = await runLoadRpc(() => getAdmin().rpc(
    'teskeid_event_get_expense_source_v3',
    { p_actor_id: actor.data, p_event_id: event.data },
  ))
  if (error) {
    const code = eventV2RpcErrorCode(error)
    if (code === 'not_found' || code === 'not_allowed') return null
    throwEventV2RpcFailure(error, 'load_failed')
  }
  const parsed = LegacyExpenseEventSourceV2SqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.event_id !== event.data) loadFailed()
  return mapLegacyEvent(parsed.data)
}
