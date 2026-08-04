'use server'

import { revalidatePath } from 'next/cache'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { ackRecentEventsForUser, ackAllUnreadRecentEventsForUser } from '@/lib/recent-events/helpers.server'
import { resolveRecentEventSourceAccess } from '@/lib/recent-events/access.server'
import type { ActionResult } from '@/lib/loans/actions'

const MAX_IDS = 10

export async function ackRecentEvents(input: unknown): Promise<ActionResult> {
  const { user } = await guardTeskeidSession()

  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray((input as Record<string, unknown>).event_ids)
  ) {
    return { ok: false, error: 'invalid_input' }
  }

  const raw = (input as { event_ids: unknown[] }).event_ids
  if (raw.length === 0) return { ok: true }
  if (raw.length > MAX_IDS) return { ok: false, error: 'invalid_input' }

  const eventIds = raw.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
  if (eventIds.length === 0) return { ok: true }

  const { sources } = await resolveRecentEventSourceAccess(user)
  if (sources.length === 0) return { ok: true }
  try {
    await ackRecentEventsForUser(user.id, eventIds, sources)
  } catch {
    console.error('[ackRecentEvents] ackRecentEventsForUser failed')
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/auth-mvp/heim')
  return { ok: true }
}

export async function ackAllRecentEvents(): Promise<ActionResult> {
  const { user } = await guardTeskeidSession()
  const { sources } = await resolveRecentEventSourceAccess(user)
  if (sources.length === 0) return { ok: true }

  try {
    await ackAllUnreadRecentEventsForUser(user.id, sources)
  } catch {
    console.error('[ackAllRecentEvents] ackAllUnreadRecentEventsForUser failed')
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/auth-mvp/heim')
  return { ok: true }
}
