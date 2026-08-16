'use server'

import { revalidatePath } from 'next/cache'
import type { EventActionErrorCode, EventActionResult } from './contracts'
import { EVENTS_PATH, eventDetailPath } from './contracts'
import { guardEventAccess } from './guard'
import { createEventContext, replaceEventRoster } from './repository.server'
import { CreateEventSchema, ReplaceEventRosterSchema } from './validation'

function actionError(error: unknown): EventActionErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('invalid')) return 'invalid_input'
  if (message.includes('conflict')) return 'conflict'
  if (message.includes('not_allowed')) return 'not_allowed'
  if (message.includes('not_found')) return 'not_found'
  if (message.includes('unavailable')) return 'feature_disabled'
  return 'save_failed'
}

export async function createEvent(
  input: unknown,
): Promise<EventActionResult<{ eventId: string; rosterRevision: number }>> {
  const { user } = await guardEventAccess()
  const parsed = CreateEventSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await createEventContext(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return { ok: true, data: result }
  } catch (error) {
    console.error('[events] create failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function saveEventRoster(
  input: unknown,
): Promise<EventActionResult<{ eventId: string; rosterRevision: number }>> {
  const { user } = await guardEventAccess()
  const parsed = ReplaceEventRosterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await replaceEventRoster(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return { ok: true, data: result }
  } catch (error) {
    console.error('[events] roster save failed')
    return { ok: false, error: actionError(error) }
  }
}
