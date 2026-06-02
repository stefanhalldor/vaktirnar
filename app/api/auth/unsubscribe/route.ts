import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/auth/unsubscribe'
import { getAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const email = (searchParams.get('email') ?? '').toLowerCase().trim()
  const token = searchParams.get('token') ?? ''

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return new NextResponse('Ógilt beiðni.', { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  await getAdmin()
    .from('login_waitlist')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', email)

  return new NextResponse(
    `<!doctype html><html lang="is"><head><meta charset="utf-8"><title>Teskeið</title></head><body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#374151"><h1 style="font-size:1.25rem;font-weight:600">Þú hefur verið fjarlæg/ur af listanum</h1><p style="color:#6b7280">Netfangið þitt hefur verið fjarlægt. Við sendum þér ekki fleiri tölvupósta um Teskeið.</p><p><a href="https://teskeid.is" style="color:#7c3aed">Fara á Teskeið.is</a></p></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}
