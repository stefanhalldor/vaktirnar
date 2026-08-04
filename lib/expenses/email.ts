import 'server-only'
import isMessages from '@/messages/is.json'

export type ExpenseInvitationEmailSendResult = 'sent' | 'failed' | 'uncertain'

export interface ExpenseInvitationEmailContext {
  templateVersion: 'v1'
  contextTitle: string
  inviterDisplayName: string | null
}

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
// Versioned, fixed-locale catalog copy keeps retries byte-stable for the same
// Resend idempotency key. A future wording/locale change gets a new template.
const EMAIL_V1_COPY = isMessages.teskeid.expenses.memberInvitation.emailV1

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

export function classifyExpenseInvitationEmailError(error: {
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
  ) {
    return 'failed'
  }
  return 'uncertain'
}

/**
 * Sends an immutable, link-free consent email. Recipient email is used only
 * as the Resend destination and must never be logged by this function/callers.
 */
export async function sendExpenseMemberInvitationEmail(
  recipientEmail: string,
  invitationId: string,
  attemptNumber: number,
  context: ExpenseInvitationEmailContext,
): Promise<ExpenseInvitationEmailSendResult> {
  if (context.templateVersion !== 'v1') return 'uncertain'
  const idempotencyKey = `expense-member-invitation/${invitationId}/${attemptNumber}`

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[expenses/email] RESEND_API_KEY not set — invitation NOT sent')
      return 'uncertain'
    }
    console.log(`[dev expenses/email] idempotencyKey: ${idempotencyKey}`)
    return 'sent'
  }

  const safeHtml = (value: string) => escapeHtml(preventAutoLink(value))
  const contextTitle = preventAutoLink(context.contextTitle)
  const inviterDisplayName = preventAutoLink(
    context.inviterDisplayName ?? EMAIL_V1_COPY.unknownInviter,
  )
  const subject = EMAIL_V1_COPY.subject
  const html = [
    `<p>${safeHtml(EMAIL_V1_COPY.intro)}</p>`,
    `<p>${safeHtml(EMAIL_V1_COPY.instructions)}</p>`,
    `<p>${safeHtml(EMAIL_V1_COPY.contextLabel)}: ${escapeHtml(contextTitle)}<br>${safeHtml(EMAIL_V1_COPY.fromLabel)}: ${escapeHtml(inviterDisplayName)}</p>`,
    `<p>${safeHtml(EMAIL_V1_COPY.privacyNotice)}</p>`,
    `<p>${safeHtml(EMAIL_V1_COPY.tagline)}</p>`,
  ].join('\n')
  const text = [
    preventAutoLink(EMAIL_V1_COPY.intro),
    '',
    preventAutoLink(EMAIL_V1_COPY.instructions),
    '',
    `${preventAutoLink(EMAIL_V1_COPY.contextLabel)}: ${contextTitle}`,
    `${preventAutoLink(EMAIL_V1_COPY.fromLabel)}: ${inviterDisplayName}`,
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
        subject,
        html,
        text,
      },
      { idempotencyKey },
    )
    if (data && !error) return 'sent'
    if (error) return classifyExpenseInvitationEmailError(error)
    return 'uncertain'
  } catch {
    return 'uncertain'
  }
}
