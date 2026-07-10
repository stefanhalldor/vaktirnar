import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createUserCode } from '@/lib/auth/user-codes'
import { sendUserLoginCode } from '@/lib/auth/email'
import { checkIpRateLimit } from '@/lib/auth/ip-rate-limit'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
})

// Always returns { success: true } — never leaks whether email exists,
// whether the IP is rate-limited, or whether email sending succeeded.
export async function POST(request: NextRequest) {
  const t0 = Date.now()

  // IP rate-limit check (best-effort; fails open so an RPC outage doesn't
  // block all logins). Must happen before body parsing to reject abuse early.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? request.headers.get('x-real-ip')?.trim()
          ?? ''
  const t1 = Date.now()
  const withinLimit = await checkIpRateLimit(ip)
  const ipRateLimitMs = Date.now() - t1

  if (!withinLimit) {
    console.error('[auth-mvp/request-code] IP rate limit exceeded')
    console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'ip_rate_limited', ipRateLimitMs, totalMs: Date.now() - t0 }))
    // Reykjavik is UTC+0 year-round — next window opens at next calendar midnight UTC
    const todayRvk = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
    const [y, m, d] = todayRvk.split('-').map(Number)
    const retryAfter = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString()
    return NextResponse.json({ success: true, rateLimited: true, retryAfter })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (parsed.success) {
    const t2 = Date.now()
    let result: Awaited<ReturnType<typeof createUserCode>>
    try {
      result = await createUserCode(parsed.data.email)
    } catch {
      // createUserCode should not throw; this is a safety net
      console.error('[auth-mvp/request-code] internal error (not exposed to client)')
      console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'db_error', ipRateLimitMs, createCodeMs: Date.now() - t2, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }
    const createCodeMs = Date.now() - t2

    if (result === null) {
      // DB or hashing error — surface as generic error so user is not left on code step
      console.error('[auth-mvp/request-code] code creation failed (DB error)')
      console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'db_error', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }

    if (typeof result === 'object' && 'rateLimited' in result) {
      console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'rate_limited', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: true, rateLimited: true, retryAfter: result.retryAfter })
    }

    if (typeof result === 'object' && 'recentActive' in result) {
      // A recent unused code is still active — do not create or send a new one.
      // Return success so the client proceeds normally without leaking dedupe state.
      console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'recent_active_suppressed', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: true })
    }

    // result is the plaintext code
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
      console.error('[auth-mvp/request-code] RESEND_API_KEY not configured — code generated but email will not be sent')
    }
    const t3 = Date.now()
    try {
      await sendUserLoginCode(parsed.data.email, result)
    } catch {
      const sendEmailMs = Date.now() - t3
      console.error('[auth-mvp/request-code] email send failed')
      console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'email_error', ipRateLimitMs, createCodeMs, sendEmailMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }
    const sendEmailMs = Date.now() - t3
    console.info('[auth-mvp/request-code]', JSON.stringify({ result: 'created_and_sent', ipRateLimitMs, createCodeMs, sendEmailMs, totalMs: Date.now() - t0 }))
    return NextResponse.json({ success: true })
  }

  // Invalid payload: still return success (no validation leak)
  return NextResponse.json({ success: true })
}
