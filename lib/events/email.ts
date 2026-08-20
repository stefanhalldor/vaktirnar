import 'server-only'

import isMessages from '@/messages/is.json'
import type { EventAttendanceInvitationKind } from './contracts'

export type EventAttendanceEmailSendResult = 'sent' | 'failed' | 'uncertain'

export interface EventAttendanceEmailContext {
  templateVersion: 'event-attendance-v1'
  invitationKind: EventAttendanceInvitationKind
  eventName: string
  guestDisplayName: string | null
  inviterDisplayName: string | null
}

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
const EMAIL_V1_COPY = isMessages.teskeid.events.invitation.emailV1

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function preventAutoLink(value: string): string {
  return value
    .replace(/https?(?=:\/\/)/gi, (match) => `${match}\u200B`)
    .replace(/www(?=\.)/gi, 'www\u200B')
    .replace(/@/g, '\u200B@\u200B')
    .replace(/\./g, '.\u200B')
}

export function classifyEventAttendanceEmailError(error: {
  name?: string | null
  statusCode?: number | null
}): 'failed' | 'uncertain' {
  if (error.statusCode === 409) {
    return error.name === 'concurrent_idempotent_requests' ? 'uncertain' : 'failed'
  }
  if (
    error.statusCode != null
    && error.statusCode >= 400
    && error.statusCode < 500
    && error.statusCode !== 408
    && error.statusCode !== 429
  ) return 'failed'
  return 'uncertain'
}

/**
 * Sends only the bounded event-attendance consent context. The recipient,
 * event, guest and invitation identifiers must never be logged by this layer.
 */
export async function sendEventAttendanceInvitationEmail(
  recipientEmail: string,
  invitationId: string,
  attemptNumber: number,
  context: EventAttendanceEmailContext,
): Promise<EventAttendanceEmailSendResult> {
  if (context.templateVersion !== 'event-attendance-v1') return 'uncertain'
  const idempotencyKey = `event-attendance/v1/${invitationId}/${attemptNumber}`

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[events/email] delivery provider is not configured')
      return 'uncertain'
    }
    return 'sent'
  }

  const safe = (value: string) => escapeHtml(preventAutoLink(value))
  const inviter = context.inviterDisplayName ?? EMAIL_V1_COPY.unknownInviter
  const html = [
    `<p><strong>${safe(EMAIL_V1_COPY.eventLabel)}:</strong> ${safe(context.eventName)}<br><strong>${safe(EMAIL_V1_COPY.fromLabel)}:</strong> ${safe(inviter)}</p>`,
    `<p>${safe(EMAIL_V1_COPY.instructions)}</p>`,
    `<p>${safe(EMAIL_V1_COPY.tagline)}</p>`,
  ].join('\n')
  const text = [
    `${preventAutoLink(EMAIL_V1_COPY.eventLabel)}: ${preventAutoLink(context.eventName)}`,
    `${preventAutoLink(EMAIL_V1_COPY.fromLabel)}: ${preventAutoLink(inviter)}`,
    '',
    preventAutoLink(EMAIL_V1_COPY.instructions),
    '',
    preventAutoLink(EMAIL_V1_COPY.tagline),
  ].join('\n')

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send(
      {
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: recipientEmail,
        subject: EMAIL_V1_COPY.subject,
        html,
        text,
      },
      { idempotencyKey },
    )
    if (data && !error) return 'sent'
    if (error) return classifyEventAttendanceEmailError(error)
    return 'uncertain'
  } catch {
    return 'uncertain'
  }
}
