import 'server-only'

import { createHash } from 'node:crypto'

import type { RequestableClosedTestingFeatureId } from './featureAccessRequest.contracts'

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
const EMAIL_PROVIDER_TIMEOUT_MS = 10_000

const FEATURE_LABELS: Record<RequestableClosedTestingFeatureId, string> = {
  'utlagt-og-endurgreitt': 'Útlagt og endurgreitt',
  'afmaeli-og-vidburdir': 'Viðburðir',
  bokhaldid: 'Bókhaldið',
  kviss: 'Kviss',
  auglysandi: 'Auglýsandi',
  bokanir: 'Bókanir',
}

export type FeatureAccessRequestDelivery = 'accepted' | 'failed' | 'uncertain'

function configuredAdminEmails(): string[] {
  return Array.from(new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ))
}

function reykjavikDay(now: Date): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

function idempotencyKey(
  actorUserId: string,
  featureId: RequestableClosedTestingFeatureId,
  now: Date,
): string {
  const digest = createHash('sha256')
    .update(`${actorUserId}:${featureId}:${reykjavikDay(now)}`)
    .digest('hex')
  return `feature-access-request/${digest}`
}

async function withProviderTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('feature_access_request_provider_timeout')),
          EMAIL_PROVIDER_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function sendFeatureAccessRequestEmail(input: {
  actorUserId: string
  requesterEmail: string
  featureId: RequestableClosedTestingFeatureId
  now?: Date
}): Promise<FeatureAccessRequestDelivery> {
  const recipients = configuredAdminEmails()
  if (recipients.length === 0 || !process.env.RESEND_API_KEY) {
    console.error('[feature-access-request] email delivery is not configured')
    return 'failed'
  }

  const featureLabel = FEATURE_LABELS[input.featureId]
  const now = input.now ?? new Date()
  const text = [
    'Ný beiðni um aðgang að lokaðri prófun á Teskeið.',
    '',
    `Teskeið: ${featureLabel}`,
    `Notandi: ${input.requesterEmail}`,
    '',
    'Beiðnin veitir ekki aðgang sjálfkrafa. Aðgangur er áfram veittur í stjórnborði Teskeiðar.',
  ].join('\n')

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data, error } = await withProviderTimeout(resend.emails.send(
      {
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: recipients,
        subject: `Aðgangsbeiðni: ${featureLabel}`,
        text,
      },
      { idempotencyKey: idempotencyKey(input.actorUserId, input.featureId, now) },
    ))
    if (data?.id && !error) return 'accepted'
    if (error) return 'failed'
    return 'uncertain'
  } catch {
    console.error('[feature-access-request] email delivery outcome is uncertain')
    return 'uncertain'
  }
}
