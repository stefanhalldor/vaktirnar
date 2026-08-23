import 'server-only'

import type { EventAttendanceInvitationDelivery } from './contracts'
import { sendEventAttendanceInvitationEmail } from './email'
import {
  eventGuestAttendanceReykjavikDate,
  eventGuestAttendanceSecurityContext,
} from './invitation-security.server'
import {
  prepareEventGuestAttendanceDelivery,
  reserveEventGuestAttendanceDelivery,
  updateEventGuestAttendanceDelivery,
} from './repository.server'

export async function deliverEventAttendanceInvitation(
  actorUserId: string,
  invitationId: string,
  deliveryRequestId: string,
  expected?: { eventId: string; eventGuestId: string },
): Promise<EventAttendanceInvitationDelivery> {
  const prepared = await prepareEventGuestAttendanceDelivery(actorUserId, invitationId)
  if (
    expected
    && (prepared.eventId !== expected.eventId || prepared.eventGuestId !== expected.eventGuestId)
  ) throw new Error('event_save_failed')
  const security = eventGuestAttendanceSecurityContext({
    actorUserId,
    eventId: prepared.eventId,
    eventGuestId: prepared.eventGuestId,
    recipientEmail: prepared.recipientEmail,
  })
  const reservation = await reserveEventGuestAttendanceDelivery(
    actorUserId,
    invitationId,
    deliveryRequestId,
    security,
    eventGuestAttendanceReykjavikDate(),
  )
  if (!reservation.canSend) {
    return reservation.reason === 'already_sent' ? 'already_sent' : 'failed'
  }
  if (reservation.recipientEmail !== security.canonicalEmail) return 'uncertain'

  const sendResult = await sendEventAttendanceInvitationEmail(
    reservation.recipientEmail,
    invitationId,
    reservation.attemptNumber,
    {
      templateVersion: reservation.templateVersion,
      invitationKind: reservation.invitationKind,
      eventName: reservation.eventName,
      guestDisplayName: reservation.guestDisplayName,
      inviterDisplayName: reservation.inviterDisplayName,
    },
  )
  if (sendResult === 'uncertain') return 'uncertain'
  const update = await updateEventGuestAttendanceDelivery(
    actorUserId,
    invitationId,
    reservation.attemptNumber,
    sendResult,
  )
  return update === 'ok' ? sendResult : 'uncertain'
}

export async function deliverCommittedEventInvitations(
  actorUserId: string,
  eventId: string,
  invitations: Array<{ invitationId: string; eventGuestId: string }>,
): Promise<{ invitationCount: number; deliveredCount: number; deliveryIssue: boolean }> {
  const results: EventAttendanceInvitationDelivery[] = new Array(invitations.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < invitations.length) {
      const index = nextIndex++
      try {
        const invitation = invitations[index]!
        results[index] = await deliverEventAttendanceInvitation(
          actorUserId,
          invitation.invitationId,
          invitation.invitationId,
          { eventId, eventGuestId: invitation.eventGuestId },
        )
      } catch {
        results[index] = 'uncertain'
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(4, invitations.length) },
    () => worker(),
  ))
  return {
    invitationCount: invitations.length,
    deliveredCount: results.filter((result) => result === 'sent' || result === 'already_sent').length,
    deliveryIssue: results.some((result) => result !== 'sent' && result !== 'already_sent'),
  }
}
