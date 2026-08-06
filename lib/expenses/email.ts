import 'server-only'
import isMessages from '@/messages/is.json'

export type ExpenseInvitationEmailSendResult = 'sent' | 'failed' | 'uncertain'

export interface ExpenseInvitationEmailContext {
  templateVersion: 'v1' | 'v2' | 'v3'
  contextTitle: string
  inviterDisplayName: string | null
}

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
// Versioned, fixed-locale catalog copy keeps retries byte-stable for the same
// Resend idempotency key. A future wording/locale change gets a new template.
const EMAIL_V1_COPY = isMessages.teskeid.expenses.memberInvitation.emailV1
const EMAIL_V2_COPY = isMessages.teskeid.expenses.memberInvitation.emailV2
const EMAIL_V3_COPY = isMessages.teskeid.expenses.memberInvitation.emailV3
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://teskeid.is').replace(/\/$/, '')

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
 * Sends an immutable consent email. Recipient email is used only as the
 * Resend destination and must never be logged by this function/callers.
 */
export async function sendExpenseMemberInvitationEmail(
  recipientEmail: string,
  invitationId: string,
  attemptNumber: number,
  context: ExpenseInvitationEmailContext,
): Promise<ExpenseInvitationEmailSendResult> {
  const idempotencyKey = context.templateVersion === 'v1'
    ? `expense-member-invitation/${invitationId}/${attemptNumber}`
    : `expense-member-invitation/${context.templateVersion}/${invitationId}/${attemptNumber}`

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
  let subject: string
  let html: string
  let text: string

  if (context.templateVersion === 'v3') {
    const copy = EMAIL_V3_COPY
    const inviterDisplayName = preventAutoLink(
      context.inviterDisplayName ?? copy.unknownInviter,
    )
    subject = copy.subject
    html = [
      `<p>${escapeHtml(copy.introBefore)}<strong>${escapeHtml(copy.productName)}</strong>${escapeHtml(copy.introAfter)}</p>`,
      `<p><strong>${escapeHtml(copy.contextLabel)}:</strong> ${escapeHtml(contextTitle)}<br><strong>${escapeHtml(copy.fromLabel)}:</strong> ${escapeHtml(inviterDisplayName)}</p>`,
      `<p>${escapeHtml(copy.instructionsBefore)}<strong>${safeHtml(copy.siteName)}</strong>${escapeHtml(copy.instructionsAfter)}</p>`,
      `<p>${escapeHtml(copy.tagline)}</p>`,
    ].join('\n')
    text = [
      `${copy.introBefore}${copy.productName}${copy.introAfter}`,
      '',
      `${copy.contextLabel}: ${contextTitle}`,
      `${copy.fromLabel}: ${inviterDisplayName}`,
      '',
      `${copy.instructionsBefore}${preventAutoLink(copy.siteName)}${copy.instructionsAfter}`,
      '',
      copy.tagline,
    ].join('\n')
  } else {
    // v1/v2 are immutable: retries must retain their original byte-stable
    // payload and Resend idempotency key after the v3 rollout.
    const copy = context.templateVersion === 'v1' ? EMAIL_V1_COPY : EMAIL_V2_COPY
    const inviterDisplayName = preventAutoLink(
      context.inviterDisplayName ?? copy.unknownInviter,
    )
    subject = copy.subject
    const claimUrl = `${SITE_URL}/auth-mvp/utlagt-og-endurgreitt/bod/adili/${encodeURIComponent(invitationId)}`
    const actionHtml = context.templateVersion === 'v2'
      ? `<p><a href="${escapeHtml(claimUrl)}">${safeHtml(EMAIL_V2_COPY.action)}</a></p>`
      : ''
    html = [
      `<p>${safeHtml(copy.intro)}</p>`,
      `<p>${safeHtml(copy.instructions)}</p>`,
      actionHtml,
      `<p>${safeHtml(copy.contextLabel)}: ${escapeHtml(contextTitle)}<br>${safeHtml(copy.fromLabel)}: ${escapeHtml(inviterDisplayName)}</p>`,
      `<p>${safeHtml(copy.privacyNotice)}</p>`,
      `<p>${safeHtml(copy.tagline)}</p>`,
    ].filter(Boolean).join('\n')
    text = [
      preventAutoLink(copy.intro),
      '',
      preventAutoLink(copy.instructions),
      ...(context.templateVersion === 'v2' ? ['', `${EMAIL_V2_COPY.action}: ${claimUrl}`] : []),
      '',
      `${preventAutoLink(copy.contextLabel)}: ${contextTitle}`,
      `${preventAutoLink(copy.fromLabel)}: ${inviterDisplayName}`,
      '',
      preventAutoLink(copy.privacyNotice),
      '',
      preventAutoLink(copy.tagline),
    ].join('\n')
  }

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
