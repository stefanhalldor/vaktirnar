'use server'

import { revalidatePath } from 'next/cache'
import type {
  EventActionErrorCode,
  EventActionResult,
  EventAttendanceInvitationDelivery,
  EventAttendanceInvitationKind,
} from './contracts'
import {
  EVENTS_PATH,
  eventDetailPath,
  eventGuestAttendanceInvitationPath,
} from './contracts'
import {
  deliverCommittedEventInvitations,
  deliverEventAttendanceInvitation,
} from './attendance-delivery.server'
import { guardEventAccess, guardEventSession } from './guard'
import {
  cancelEventGuestAttendanceInvitation as cancelInvitationRepository,
  createEventContext,
  inviteEventGuestAttendance as inviteGuestRepository,
  leaveEventAttendance as leaveAttendanceRepository,
  replaceEventRoster,
  respondEventGuestAttendanceInvitation as respondInvitationRepository,
  saveEventDetails as saveEventDetailsRepository,
} from './repository.server'
import {
  CancelEventGuestAttendanceInvitationSchema,
  CreateEventSchema,
  InviteEventGuestAttendanceSchema,
  LeaveEventAttendanceSchema,
  ReplaceEventRosterSchema,
  ResendEventGuestAttendanceInvitationSchema,
  RespondEventGuestAttendanceInvitationSchema,
  SaveEventDetailsSchema,
} from './validation'

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
): Promise<EventActionResult<{
  eventId: string
  rosterRevision: number
  invitationCount: number
  deliveredCount: number
  deliveryIssue: boolean
}>> {
  const { user } = await guardEventAccess()
  const parsed = CreateEventSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await createEventContext(user.id, parsed.data)
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
    console.error('[events] create failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function saveEventRoster(
  input: unknown,
): Promise<EventActionResult<{
  eventId: string
  rosterRevision: number
  invitationCount: number
  deliveredCount: number
  deliveryIssue: boolean
}>> {
  const { user } = await guardEventAccess()
  const parsed = ReplaceEventRosterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await replaceEventRoster(user.id, parsed.data)
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
    console.error('[events] roster save failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function saveEventDetails(
  input: unknown,
): Promise<EventActionResult<{ eventId: string }>> {
  const { user } = await guardEventAccess()
  const parsed = SaveEventDetailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await saveEventDetailsRepository(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(result.eventId))
    return { ok: true, data: result }
  } catch (error) {
    console.error('[events] details save failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function inviteEventGuestAttendance(
  input: unknown,
): Promise<EventActionResult<{
  invitationId: string
  invitationKind: EventAttendanceInvitationKind
  rosterRevision: number
  delivery: EventAttendanceInvitationDelivery
}>> {
  const { user } = await guardEventAccess()
  const parsed = InviteEventGuestAttendanceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await inviteGuestRepository(user.id, parsed.data)
    let delivery: EventAttendanceInvitationDelivery = 'uncertain'
    try {
      delivery = await deliverEventAttendanceInvitation(
        user.id,
        result.invitationId,
        parsed.data.request_id,
        {
          eventId: parsed.data.event_id,
          eventGuestId: parsed.data.event_guest_id,
        },
      )
    } catch {
      // The invitation is already committed. Delivery uncertainty must not be
      // reported as a rolled-back invitation mutation.
    }
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(parsed.data.event_id))
    return {
      ok: true,
      data: {
        invitationId: result.invitationId,
        invitationKind: result.invitationKind,
        rosterRevision: result.rosterRevision,
        delivery,
      },
    }
  } catch (error) {
    console.error('[events] attendance invitation failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function resendEventGuestAttendanceInvitation(
  input: unknown,
): Promise<EventActionResult<{ delivery: EventAttendanceInvitationDelivery }>> {
  const { user } = await guardEventAccess()
  const parsed = ResendEventGuestAttendanceInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const delivery = await deliverEventAttendanceInvitation(
      user.id,
      parsed.data.invitation_id,
      parsed.data.request_id,
      {
        eventId: parsed.data.event_id,
        eventGuestId: parsed.data.event_guest_id,
      },
    )
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(parsed.data.event_id))
    return { ok: true, data: { delivery } }
  } catch (error) {
    console.error('[events] attendance invitation resend failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function cancelEventGuestAttendanceInvitation(
  input: unknown,
): Promise<EventActionResult<{ rosterRevision: number }>> {
  const { user } = await guardEventAccess()
  const parsed = CancelEventGuestAttendanceInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const result = await cancelInvitationRepository(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(parsed.data.event_id))
    return { ok: true, data: { rosterRevision: result.rosterRevision } }
  } catch (error) {
    console.error('[events] attendance invitation cancel failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function respondEventGuestAttendanceInvitation(
  input: unknown,
): Promise<EventActionResult<{ status: 'accepted' | 'declined' | 'expired' }>> {
  const { user } = await guardEventSession()
  const parsed = RespondEventGuestAttendanceInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const status = await respondInvitationRepository(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventGuestAttendanceInvitationPath(parsed.data.invitation_id))
    return { ok: true, data: { status } }
  } catch (error) {
    console.error('[events] attendance invitation response failed')
    return { ok: false, error: actionError(error) }
  }
}

export async function leaveEventAttendance(
  input: unknown,
): Promise<EventActionResult<{ status: 'left' }>> {
  const { user } = await guardEventSession()
  const parsed = LeaveEventAttendanceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  try {
    const status = await leaveAttendanceRepository(user.id, parsed.data)
    revalidatePath(EVENTS_PATH)
    revalidatePath(eventDetailPath(parsed.data.event_id))
    return { ok: true, data: { status } }
  } catch (error) {
    console.error('[events] leave attendance failed')
    return { ok: false, error: actionError(error) }
  }
}
