import 'server-only'

async function send(to: string, subject: string, text: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[dev email] To: ${to}\nSubject: ${subject}\n${text}\n`)
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from: 'Teskeið <noreply@teskeid.is>',
    to,
    subject,
    text,
  })
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  await send(
    email,
    'Teskeið innskráningarkóði',
    `Innskráningarkóðinn þinn er: ${code}\n\nKóðinn rennur út eftir 10 mínútur.\n\nEf þú baðst ekki um þennan kóða geturðu hunsað þetta.\n\nTeskeið`
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
