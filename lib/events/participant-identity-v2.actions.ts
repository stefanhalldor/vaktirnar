'use server'

import { revalidatePath } from 'next/cache'
import type { EventActionErrorCode, EventActionResult } from './contracts'
import { EVENTS_PATH, eventDetailPath } from './contracts'
import { deliverCommittedEventInvitations } from './attendance-delivery.server'
import { guardEventAccess } from './guard'
import {
  CreateEventWithParticipationsV2InputSchema,
  EventV2RepositoryError,
  RepairEventPersonLabelV2InputSchema,
  ReplaceEventRosterWithParticipationsV2InputSchema,
  SetEventRsvpV2InputSchema,
} from './participant-identity-v2.contracts'
import {
  createEventWithParticipationsV2,
  repairEventPersonLabelV2,
  replaceEventRosterWithParticipationsV2,
  setEventRsvpV2,
} from './participant-identity-v2.repository.server'

function actionError(error: unknown): EventActionErrorCode {
  if (!(error instanceof EventV2RepositoryError)) return 'save_failed'
  if (error.code === 'not_available') return 'not_available'
  if (error.code === 'rate_limited') return 'rate_limited'
  if (error.code === 'load_failed' || error.code === 'save_failed') return 'save_failed'
  return error.code
}

export async function createEventV2(input: unknown): Promise<EventActionResult<{
  eventId: string
  rosterRevision: string
  invitationCount: number
  deliveredCount: number
  deliveryIssue: boolean
}>> {
  const { user } = await guardEventAccess()
  const parsed = CreateEventWithParticipationsV2InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await createEventWithParticipationsV2(user.id, parsed.data)
    const delivery = await deliverCommittedEventInvitations(
      user.id,
      result.eventId,
      result.invitations,
    )
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        rosterRevision: result.rosterRevision,
        ...delivery,
      },
    }
  } catch (error) {
    console.error('[events:v2] create failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function saveEventRosterV2(input: unknown): Promise<EventActionResult<{
  eventId: string
  rosterRevision: string
  invitationCount: number
  deliveredCount: number
  deliveryIssue: boolean
}>> {
  const { user } = await guardEventAccess()
  const parsed = ReplaceEventRosterWithParticipationsV2InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await replaceEventRosterWithParticipationsV2(user.id, parsed.data)
    const delivery = await deliverCommittedEventInvitations(
      user.id,
      result.eventId,
      result.invitations,
    )
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        rosterRevision: result.rosterRevision,
        ...delivery,
      },
    }
  } catch (error) {
    console.error('[events:v2] roster save failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function repairEventPersonLabel(input: unknown): Promise<EventActionResult<{
  eventId: string
  eventGuestId: string
  rosterRevision: string
  labelVersion: string
}>> {
  const { user } = await guardEventAccess()
  const parsed = RepairEventPersonLabelV2InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await repairEventPersonLabelV2(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        eventGuestId: result.eventGuestId,
        rosterRevision: result.rosterRevision,
        labelVersion: result.labelVersion,
      },
    }
  } catch (error) {
    console.error('[events:v2] shared label repair failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function setEventRsvp(input: unknown): Promise<EventActionResult<{
  eventId: string
  eventGuestId: string
  rsvpState: 'no_response' | 'attending' | 'not_attending'
  rsvpVersion: string
}>> {
  const { user } = await guardEventAccess()
  const parsed = SetEventRsvpV2InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await setEventRsvpV2(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return {
      ok: true,
      data: {
        eventId: result.eventId,
        eventGuestId: result.eventGuestId,
        rsvpState: result.rsvpState,
        rsvpVersion: result.rsvpVersion,
      },
    }
  } catch (error) {
    console.error('[events:v2] RSVP update failed')
    return { ok: false, error: actionError(error) }
  }
}
