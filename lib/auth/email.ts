import 'server-only'

const DEFAULT_FROM = 'Teskeið <teskeid@mail.gottvibe.is>'

async function send(to: string, subject: string, text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[email] RESEND_API_KEY is not set — email NOT sent to', to)
      return
    }
    console.log(`[dev email] To: ${to}\nSubject: ${subject}\n${text}\n`)
    return
  }

  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM
  if (!process.env.EMAIL_FROM && process.env.NODE_ENV === 'production') {
    console.error('[email] EMAIL_FROM is not set — using fallback:', DEFAULT_FROM)
  }

  const replyTo = process.env.REPLY_TO ?? undefined

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from,
    to,
    subject,
    text,
    ...(replyTo ? { replyTo } : {}),
  })
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  await send(
    email,
    'Teskeið innskráningarkóði',
    `Innskráningarkóðinn þinn er: ${code}\n\nKóðinn rennur út eftir 10 mínútur.\n\nEf þú baðst ekki um þennan kóða geturðu hunsað þetta.\n\nTeskeið`
  )
}

export async function sendUserLoginCode(email: string, code: string): Promise<void> {
  await send(
    email,
    'Teskeið innskráningarkóði',
    `Innskráningarkóðinn þinn er: ${code}\n\nKóðinn gildir í 10 mínútur.\n\nEf þú baðst ekki um þetta geturðu hunsað þennan póst.\n\nTeskeið`
  )
}

export async function sendWaitlistConfirmation(
  email: string,
  unsubscribeUrl: string
): Promise<void> {
  await send(
    email,
    'Við látum þig vita þegar opnar',
    `Við höfum skráð netfangið þitt og látum þig vita þegar innskráning opnar á Teskeið.\n\nEf þú vilt vera fjarlæg/ur af listanum: ${unsubscribeUrl}\n\nTeskeið`
  )
}
