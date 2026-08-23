import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import {
  EventPersonSourcePageSqlSchema,
  EventPersonSourceRosterSqlSchema,
  type EventPersonSourceCursor,
  type EventPersonSourcePage,
  type EventPersonSourceRoster,
} from './person-source.contracts'

const uuid = z.string().uuid()
const pageLimit = z.number().int().min(1).max(50)

function loadFailure(): never {
  throw new Error('event_load_failed')
}

function isNotFound(error: { message?: string | null; code?: string | null }): boolean {
  return `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase().includes('not_found')
}

function assertUnique(values: string[]): void {
  if (new Set(values).size !== values.length) loadFailure()
}

export async function listEventPersonSourceEvents(
  actorUserId: string,
  cursor: EventPersonSourceCursor | null = null,
  limit = 20,
): Promise<EventPersonSourcePage> {
  const parsedActorId = uuid.safeParse(actorUserId)
  const parsedLimit = pageLimit.safeParse(limit)
  if (!parsedActorId.success || !parsedLimit.success) loadFailure()

  const parsedCursor = cursor === null
    ? null
    : z.object({
      beforeSortAt: z.string().datetime({ offset: true }),
      beforeEventId: uuid,
    }).strict().safeParse(cursor)
  if (parsedCursor !== null && !parsedCursor.success) loadFailure()

  const { data, error } = await getAdmin().rpc(
    'teskeid_event_list_person_source_events_v1',
    {
      p_actor_id: parsedActorId.data,
      p_before_sort_at: parsedCursor?.data.beforeSortAt ?? null,
      p_before_event_id: parsedCursor?.data.beforeEventId ?? null,
      p_limit: parsedLimit.data,
    },
  )
  if (error) loadFailure()

  const parsed = EventPersonSourcePageSqlSchema.safeParse(data)
  if (!parsed.success) loadFailure()
  assertUnique(parsed.data.events.map((event) => event.event_id))
  if (parsed.data.events.length > parsedLimit.data) loadFailure()
  if (parsed.data.next_cursor !== null) {
    const lastEvent = parsed.data.events.at(-1)
    if (parsed.data.events.length !== parsedLimit.data
        || lastEvent?.event_id !== parsed.data.next_cursor.before_event_id) {
      loadFailure()
    }
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

export async function getEventPersonSourceRoster(
  actorUserId: string,
  requestedEventId: string,
): Promise<EventPersonSourceRoster | null> {
  const parsedActorId = uuid.safeParse(actorUserId)
  const parsedEventId = uuid.safeParse(requestedEventId)
  if (!parsedActorId.success || !parsedEventId.success) return null

  const { data, error } = await getAdmin().rpc(
    'teskeid_event_get_person_source_roster_v1',
    { p_actor_id: parsedActorId.data, p_event_id: parsedEventId.data },
  )
  if (error) {
    if (isNotFound(error)) return null
    loadFailure()
  }

  const parsed = EventPersonSourceRosterSqlSchema.safeParse(data)
  if (!parsed.success || parsed.data.event_id !== parsedEventId.data) loadFailure()
  assertUnique(parsed.data.people.map((person) => person.person_ref))
  if (parsed.data.people.some((person, index) => person.position !== index)) loadFailure()
  if (parsed.data.people[0]?.participant_kind !== 'organizer'
      || parsed.data.people.slice(1).some((person) => person.participant_kind !== 'guest')) {
    loadFailure()
  }
  if (parsed.data.people.filter((person) => person.is_self).length !== 1) loadFailure()

  const common = {
    eventId: parsed.data.event_id,
    name: parsed.data.name,
    rosterRevision: parsed.data.roster_revision,
  }
  if (parsed.data.viewer_role === 'owner') {
    return {
      ...common,
      viewerRole: 'owner',
      people: parsed.data.people.map((person) => ({
        personRef: person.person_ref,
        participantKind: person.participant_kind,
        sourceKind: person.source_kind,
        displayName: person.display_name,
        position: person.position,
        isSelf: person.is_self,
      })),
    }
  }
  return {
    ...common,
    viewerRole: 'attendee',
    people: parsed.data.people.map((person) => ({
      personRef: person.person_ref,
      participantKind: person.participant_kind,
      sourceKind: person.source_kind,
      displayName: person.display_name,
      position: person.position,
      isSelf: person.is_self,
    })),
  }
}
