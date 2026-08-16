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

function scopedInvitationUrl(invitationId: string): string | null {
  try {
    const base = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://teskeid.is')
    if (base.protocol !== 'https:') return null
    return new URL(
      `/auth-mvp/vidburdir/bod/thattaka/${encodeURIComponent(invitationId)}`,
      base.origin,
    ).toString()
  } catch {
    return null
  }
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
  const invitationUrl = scopedInvitationUrl(invitationId)
  if (!invitationUrl || context.templateVersion !== 'event-attendance-v1') return 'uncertain'
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
  const guest = context.guestDisplayName ?? EMAIL_V1_COPY.unknownGuest
  const identityHtml = context.invitationKind === 'identity_and_access'
    ? `<p>${safe(EMAIL_V1_COPY.identityNotice)}</p>`
    : ''
  const identityText = context.invitationKind === 'identity_and_access'
    ? ['', preventAutoLink(EMAIL_V1_COPY.identityNotice)]
    : []
  const html = [
    `<p>${safe(EMAIL_V1_COPY.intro)}</p>`,
    `<p><strong>${safe(EMAIL_V1_COPY.eventLabel)}:</strong> ${safe(context.eventName)}<br><strong>${safe(EMAIL_V1_COPY.guestLabel)}:</strong> ${safe(guest)}<br><strong>${safe(EMAIL_V1_COPY.fromLabel)}:</strong> ${safe(inviter)}</p>`,
    `<p>${safe(EMAIL_V1_COPY.instructions)}</p>`,
    `<p><a href="${escapeHtml(invitationUrl)}">${safe(EMAIL_V1_COPY.action)}</a></p>`,
    identityHtml,
    `<p>${safe(EMAIL_V1_COPY.privacyNotice)}</p>`,
    `<p>${safe(EMAIL_V1_COPY.tagline)}</p>`,
  ].filter(Boolean).join('\n')
  const text = [
    preventAutoLink(EMAIL_V1_COPY.intro),
    '',
    `${preventAutoLink(EMAIL_V1_COPY.eventLabel)}: ${preventAutoLink(context.eventName)}`,
    `${preventAutoLink(EMAIL_V1_COPY.guestLabel)}: ${preventAutoLink(guest)}`,
    `${preventAutoLink(EMAIL_V1_COPY.fromLabel)}: ${preventAutoLink(inviter)}`,
    '',
    preventAutoLink(EMAIL_V1_COPY.instructions),
    `${EMAIL_V1_COPY.action}: ${invitationUrl}`,
    ...identityText,
    '',
    preventAutoLink(EMAIL_V1_COPY.privacyNotice),
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
