import 'server-only'

export type EmailSendResult = 'sent' | 'failed' | 'uncertain'

/**
 * Only immutable fields from loan_invitations (set at INSERT, never updated).
 * Snapshot fields (item_name_snapshot, creator_display_name_snapshot) are set
 * once at invitation INSERT and never updated, guaranteeing identical payload
 * across retries sharing the same attempt_number and idempotency key.
 */
export interface EmailContext {
  recipientRole: 'lender' | 'borrower'
  templateVersion: 'v2'
  itemName: string | null
  creatorDisplayName: string | null
}

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://teskeid.is').replace(/\/$/, '')

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Classifies a Resend API error as definitive failure or uncertain.
 *
 * Rules:
 *   - Clear 4xx (400, 401, 403, 422, etc.): definitive failure — message was
 *     definitively rejected (invalid email, auth error, bad payload, etc.)
 *   - 408: timeout — uncertain (retryable)
 *   - 409 concurrent_idempotent_requests: normal race — uncertain (retry safe)
 *   - 409 any other variant (e.g. invalid_idempotent_request): implementation
 *     bug — treat as definitive failure; retrying with the same key won't help
 *   - 429: rate limit — uncertain (retryable after backoff)
 *   - 5xx: server error — uncertain
 *   - No status code: uncertain
 */
export function classifyResendError(error: {
  name?: string | null
  statusCode?: number | null
  message?: string | null
}): 'failed' | 'uncertain' {
  const status = error.statusCode

  if (status === 409) {
    // Normal race: another in-flight request with the same key — retry is safe
    if (error.name === 'concurrent_idempotent_requests') return 'uncertain'
    // Any other 409 (e.g. invalid_idempotent_request): payload/key mismatch,
    // an implementation or configuration bug — same request will keep failing
    return 'failed'
  }

  if (
    status != null &&
    status >= 400 &&
    status < 500 &&
    status !== 408 && // timeout: retryable
    status !== 429    // rate limit: retryable
  ) {
    return 'failed'
  }

  return 'uncertain'
}

/**
 * Sends a loan invitation email.
 *
 * The email content is fixed and generic — no user-controlled data
 * is embedded. This ensures the same payload is always sent for a
 * given idempotency key, satisfying Resend's idempotency requirements.
 *
 * Returns:
 *   'sent'      — Resend confirmed delivery
 *   'failed'    — definitive API error (clear 4xx: not 408, 409, or 429)
 *   'uncertain' — network exception, 5xx, 408, 409, or 429 (retry with same key is safe)
 *
 * NOTE: recipientEmail must never be logged by callers.
 */
export async function sendLoanInvitationEmail(
  recipientEmail: string,
  invitationId: string,
  attemptNumber: number,
  context?: EmailContext,
): Promise<EmailSendResult> {
  const idempotencyKey = `loan-invitation/${invitationId}/${attemptNumber}`

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[loans/email] RESEND_API_KEY not set — invitation NOT sent')
      return 'uncertain'
    }
    // Dev: simulate success without logging recipient
    console.log(`[dev loans/email] idempotencyKey: ${idempotencyKey}`)
    return 'sent'
  }

  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM
  const claimUrl = `${SITE_URL}/auth-mvp/lanad-og-skilad/claim/${esc(invitationId)}`

  const subject = 'Þér hefur verið sent lánaboð á Teskeið'

  let html: string
  if (!context) {
    html = [
      '<p>Þér hefur verið sent lánaboð á Teskeið.</p>',
      '<p>Skráðu þig inn á Teskeið með venjulegum tölvupóstkóða til að sjá og samþykkja eða hafna boðinu.</p>',
      `<p><a href="${claimUrl}">Skoða lánaboð</a></p>`,
      '<p>Teskeið</p>',
    ].join('\n')
  } else {
    // Dispatch explicitly on templateVersion — an unsupported version must never silently
    // fall through to the newest template and send with a different payload than the one
    // that was originally sent for this idempotency key.
    const ver: string = context.templateVersion
    if (ver === 'v2') {
      if (context.itemName !== null) {
        // v2 full: item name + creator display name from immutable snapshots
        const roleLabel = context.recipientRole === 'borrower' ? 'lántakandinn' : 'lánveitandinn'
        const creatorLine = context.creatorDisplayName
          ? `<p>Lánaboðið er frá ${esc(context.creatorDisplayName)}.</p>`
          : '<p>Lánaboðið er frá notanda á Teskeið.</p>'
        html = [
          `<p>Samkvæmt skráningunni á Teskeið ert þú ${roleLabel} fyrir hlutinn <strong>${esc(context.itemName)}</strong>.</p>`,
          creatorLine,
          `<p>Boðið var sent á ${esc(recipientEmail)}. Skráðu þig inn á Teskeið með sama netfangi til að samþykkja eða hafna boðinu.</p>`,
          `<p><a href="${claimUrl}">Skoða lánaboð</a></p>`,
          '<p>Teskeið</p>',
        ].join('\n')
      } else {
        // v2 generic: role known, snapshots null — payload identical to pre-sql/36 send
        const roleLabel = context.recipientRole === 'borrower' ? 'lántakandinn' : 'lánveitandinn'
        html = [
          `<p>Samkvæmt skráningunni á Teskeið ert þú ${roleLabel}.</p>`,
          `<p>Boðið var sent á ${esc(recipientEmail)}. Skráðu þig inn á Teskeið með sama netfangi til að samþykkja eða hafna boðinu.</p>`,
          `<p><a href="${claimUrl}">Skoða lánaboð</a></p>`,
          '<p>Teskeið</p>',
        ].join('\n')
      }
    } else {
      // Defense in depth: unknown version — caller should have blocked this, but
      // never silently send with a mismatched template and corrupt the idempotency key.
      return 'uncertain'
    }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send(
      { from, to: recipientEmail, subject, html },
      { idempotencyKey },
    )

    if (data && !error) return 'sent'
    if (error) return classifyResendError(error)
    return 'uncertain'
  } catch {
    // Network exception or import failure: keep attempt reserved
    return 'uncertain'
  }
}
