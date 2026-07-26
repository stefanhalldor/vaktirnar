import 'server-only'

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'
const EMAIL_PROVIDER_TIMEOUT_MS = 10_000

export type AuthEmailDeliveryStatus = 'accepted' | 'failed' | 'uncertain'

async function withProviderTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('email_provider_timeout')), EMAIL_PROVIDER_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function send(to: string, subject: string, text: string): Promise<AuthEmailDeliveryStatus> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[email] RESEND_API_KEY is not set — email NOT sent')
      return 'failed'
    }
    console.log(`[dev email] To: ${to}\nSubject: ${subject}\n${text}\n`)
    return 'accepted'
  }

  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM
  if (!process.env.EMAIL_FROM && process.env.NODE_ENV === 'production') {
    console.error('[email] EMAIL_FROM is not set — using DEFAULT_FROM fallback')
  }

  const replyTo = process.env.REPLY_TO ?? undefined

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await withProviderTimeout(resend.emails.send({
      from,
      to,
      subject,
      text,
      ...(replyTo ? { replyTo } : {}),
    }))
    if (result.error) {
      console.error('[email] provider rejected email send')
      return 'failed'
    }
    return result.data?.id ? 'accepted' : 'uncertain'
  } catch {
    console.error('[email] provider send outcome uncertain')
    return 'uncertain'
  }
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const status = await send(
    email,
    'Teskeið innskráningarkóði',
    `Innskráningarkóðinn þinn er: ${code}\n\nKóðinn rennur út eftir 10 mínútur.\n\nEf þú baðst ekki um þennan kóða geturðu hunsað þetta.\n\nTeskeið`
  )
  if (status !== 'accepted') throw new Error('email_delivery_failed')
}

export async function sendUserLoginCode(email: string, code: string): Promise<AuthEmailDeliveryStatus> {
  return send(
    email,
    'Teskeið innskráningarkóði',
    `Innskráningarkóðinn þinn er: ${code}\n\nKóðinn gildir í 10 mínútur.\n\nEf þú baðst ekki um þetta geturðu hunsað þennan póst.\n\nTeskeið`
  )
}

export async function sendWaitlistConfirmation(
  email: string,
  unsubscribeUrl: string
): Promise<void> {
  const status = await send(
    email,
    'Við látum þig vita þegar opnar',
    `Við höfum skráð netfangið þitt og látum þig vita þegar innskráning opnar á Teskeið.\n\nEf þú vilt vera fjarlæg/ur af listanum: ${unsubscribeUrl}\n\nTeskeið`
  )
  if (status !== 'accepted') throw new Error('email_delivery_failed')
}
