import 'server-only'

import { createHmac } from 'node:crypto'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

export interface EventGuestAttendanceSecurityContext {
  canonicalEmail: string
  recipientHash: string
  actorRecipientRateHash: string
  actorTotalRateHash: string
}

function invitationSecret(): string {
  const secret = process.env.AUTH_CODE_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    console.error('[events/attendance] invitation security is not configured')
    throw new Error('event_unavailable')
  }
  return secret
}

function scopedHmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function eventGuestAttendanceSecurityContext(input: {
  actorUserId: string
  eventId: string
  eventGuestId: string
  recipientEmail: string
}): EventGuestAttendanceSecurityContext {
  const canonicalEmail = normalizeEmailForAccess(input.recipientEmail)
  if (!canonicalEmail) throw new Error('event_invalid_input')
  const secret = invitationSecret()
  return {
    canonicalEmail,
    recipientHash: scopedHmac(
      secret,
      `teskeid:event-attendance:recipient:${input.eventId}:${input.eventGuestId}:${canonicalEmail}`,
    ),
    actorRecipientRateHash: scopedHmac(
      secret,
      `teskeid:event-attendance:rate:actor-recipient:${input.actorUserId}:${canonicalEmail}`,
    ),
    actorTotalRateHash: scopedHmac(
      secret,
      `teskeid:event-attendance:rate:actor-total:${input.actorUserId}`,
    ),
  }
}

export function eventGuestAttendanceReykjavikDate(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}
