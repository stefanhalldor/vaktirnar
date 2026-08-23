'use server'

import { guardEventSession } from './guard'
import {
  getEventPersonSourceRosterV3,
  listEventPersonSourceEventsV3,
} from './participant-identity-v3.repository.server'
import {
  PersonSourcePageInputSchema,
  PersonSourcePageResultSchema,
  PersonSourceRosterInputSchema,
  PersonSourceRosterResultSchema,
  type PersonSourcePageResult,
  type PersonSourceRosterResult,
} from './person-source.presentation'

const PERSON_SOURCE_PAGE_LIMIT = 20

function exactPageResult(candidate: unknown): PersonSourcePageResult {
  const parsed = PersonSourcePageResultSchema.safeParse(candidate)
  return parsed.success ? parsed.data : { ok: false, error: 'load_failed' }
}

function exactRosterResult(candidate: unknown): PersonSourceRosterResult {
  const parsed = PersonSourceRosterResultSchema.safeParse(candidate)
  return parsed.success ? parsed.data : { ok: false, error: 'load_failed' }
}

export async function loadEventPersonSourcePage(
  input: unknown,
): Promise<PersonSourcePageResult> {
  const { user } = await guardEventSession()
  const parsedInput = PersonSourcePageInputSchema.safeParse(input)
  if (!parsedInput.success) return exactPageResult({ ok: false, error: 'invalid_input' })

  try {
    const page = await listEventPersonSourceEventsV3(
      user.id,
      parsedInput.data.cursor,
      PERSON_SOURCE_PAGE_LIMIT,
    )
    return exactPageResult({
      ok: true,
      data: {
        events: page.events.map((event) => ({
          eventId: event.id,
          name: event.name,
          rosterRevision: event.rosterRevision,
          activePersonCount: event.activePersonCount,
        })),
        nextCursor: page.nextCursor,
      },
    })
  } catch {
    return exactPageResult({ ok: false, error: 'load_failed' })
  }
}

export async function loadEventPersonSourceRoster(
  input: unknown,
): Promise<PersonSourceRosterResult> {
  const { user } = await guardEventSession()
  const parsedInput = PersonSourceRosterInputSchema.safeParse(input)
  if (!parsedInput.success) return exactRosterResult({ ok: false, error: 'invalid_input' })

  try {
    const roster = await getEventPersonSourceRosterV3(user.id, parsedInput.data.eventId)
    if (roster === null) return exactRosterResult({ ok: false, error: 'not_found' })

    return exactRosterResult({
      ok: true,
      data: {
        eventId: roster.eventId,
        name: roster.name,
        rosterRevision: roster.rosterRevision,
        people: roster.people.map((person) => ({
          personRef: person.personRef,
          participantKind: person.participantKind,
          displayName: person.shared.displayName,
          position: person.position,
          isSelf: person.isSelf,
          ...(person.viewerPrivate?.alias
            ? { primaryLabel: person.viewerPrivate.alias }
            : {}),
          ...(person.viewerPrivate?.alias && person.shared.displayName
            ? { secondaryLabel: person.shared.displayName }
            : {}),
          ...(person.viewerPrivate?.email
            ? { privateEmail: person.viewerPrivate.email }
            : {}),
          ...(person.viewerPrivate
            ? {
                builtInTags: person.viewerPrivate.builtInTags,
                customLabels: person.viewerPrivate.customLabels,
                hiddenCustomLabelCount: person.viewerPrivate.hiddenCustomLabelCount,
                ...(person.viewerPrivate.note ? { privateNote: person.viewerPrivate.note } : {}),
              }
            : {}),
          selectable: person.shared.selectable,
          bulkEligible: person.shared.bulkEligible,
          disabledReason: person.shared.disabledReason,
          ...(person.participantKind === 'guest'
            ? { rsvpState: person.rsvp.state }
            : {}),
        })),
      },
    })
  } catch {
    return exactRosterResult({ ok: false, error: 'load_failed' })
  }
}
