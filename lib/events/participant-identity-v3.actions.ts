'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { EventActionErrorCode, EventActionResult } from './contracts'
import { EVENTS_PATH, eventDetailPath } from './contracts'
import { guardEventSession } from './guard'
import {
  EventV3RepositoryError,
  EventV3UuidSchema,
  LeaveEventParticipationV3InputSchema,
  SetEventRsvpV3InputSchema,
} from './participant-identity-v3.contracts'
import {
  leaveEventParticipationV3,
  listEventPersonSourceEventsV3,
  setEventRsvpV3,
} from './participant-identity-v3.repository.server'

function actionError(error: unknown): EventActionErrorCode {
  if (!(error instanceof EventV3RepositoryError)) return 'save_failed'
  if (error.code === 'load_failed' || error.code === 'save_failed') return 'save_failed'
  if (error.code === 'not_available') return 'not_available'
  if (error.code === 'rate_limited') return 'rate_limited'
  return error.code
}

export async function setEventRsvpV3Action(input: unknown): Promise<EventActionResult<{
  eventId: string
  eventGuestId: string
  identityGeneration: string
  accessVersion: string
  rsvpState: 'no_response' | 'considering' | 'attending' | 'not_attending'
  decisionVersion: string
}>> {
  const { user } = await guardEventSession()
  const parsed = SetEventRsvpV3InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await setEventRsvpV3(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    revalidatePath('/auth-mvp/heim')
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        eventGuestId: result.eventGuestId,
        identityGeneration: result.identityGeneration,
        accessVersion: result.accessVersion,
        rsvpState: result.rsvpState,
        decisionVersion: result.decisionVersion,
      },
    }
  } catch (error) {
    console.error('[events:v3] RSVP update failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function leaveEventParticipationV3Action(input: unknown): Promise<EventActionResult<{
  eventId: string
  eventGuestId: string
  identityGeneration: string
  identityVersion: string
  accessVersion: string
}>> {
  const { user } = await guardEventSession()
  const parsed = LeaveEventParticipationV3InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await leaveEventParticipationV3(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    revalidatePath('/auth-mvp/heim')
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        eventGuestId: result.eventGuestId,
        identityGeneration: result.identityGeneration,
        identityVersion: result.identityVersion,
        accessVersion: result.accessVersion,
      },
    }
  } catch (error) {
    console.error('[events:v3] participation leave failed')
    return { ok: false, error: actionError(error) }
  }
}

const directoryPageInputSchema = z.object({
  cursor: z.object({
    beforeSortAt: z.string().datetime({ offset: true }),
    beforeEventId: EventV3UuidSchema,
  }).strict().nullable(),
}).strict()

export async function loadEventDirectoryPageV3Action(input: unknown): Promise<
  | { ok: true; data: Awaited<ReturnType<typeof listEventPersonSourceEventsV3>> }
  | { ok: false; error: 'invalid_input' | 'load_failed' }
> {
  const { user } = await guardEventSession()
  const parsed = directoryPageInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const page = await listEventPersonSourceEventsV3(user.id, parsed.data.cursor, 20)
    return { ok: true, data: page }
  } catch {
    return { ok: false, error: 'load_failed' }
  }
}
