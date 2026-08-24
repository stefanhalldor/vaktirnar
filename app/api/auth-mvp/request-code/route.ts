import 'server-only'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createUserCode, invalidateUserCodeAfterSendFailure } from '@/lib/auth/user-codes'
import { sendUserLoginCode } from '@/lib/auth/email'
import { checkIpRateLimit } from '@/lib/auth/ip-rate-limit'
import { USER_CODE_RESEND_WINDOW_SECONDS } from '@/lib/auth/user-code-policy'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
})

function successfulCodeRequestResponse(extra: Record<string, unknown> = {}) {
  const serverNowMs = Date.now()
  return NextResponse.json({
    success: true,
    ...extra,
    serverNow: new Date(serverNowMs).toISOString(),
    resendAvailableAt: new Date(
      serverNowMs + USER_CODE_RESEND_WINDOW_SECONDS * 1000,
    ).toISOString(),
  })
}

// Public policy responses avoid leaking whether an email exists or whether
// deduplication suppressed a send. Operational failures use a generic 500.
export async function POST(request: NextRequest) {
  const t0 = Date.now()
  const requestId = randomUUID()

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
    console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'ip_rate_limited', ipRateLimitMs, totalMs: Date.now() - t0 }))
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
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'db_error', ipRateLimitMs, createCodeMs: Date.now() - t2, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }
    const createCodeMs = Date.now() - t2

    if (result === null) {
      // DB or hashing error — surface as generic error so user is not left on code step
      console.error('[auth-mvp/request-code] code creation failed (DB error)')
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'db_error', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }

    if (typeof result === 'object' && 'rateLimited' in result) {
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'rate_limited', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: true, rateLimited: true, retryAfter: result.retryAfter })
    }

    if (typeof result === 'object' && 'recentActive' in result) {
      // A recent unused code is still active — do not create or send a new one.
      // Return success so the client proceeds normally without leaking dedupe state.
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'recent_active_suppressed', ipRateLimitMs, createCodeMs, totalMs: Date.now() - t0 }))
      return successfulCodeRequestResponse()
    }

    // result is the plaintext code
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
      console.error('[auth-mvp/request-code] RESEND_API_KEY not configured — code generated but email will not be sent')
    }
    const t3 = Date.now()
    const deliveryStatus = await sendUserLoginCode(parsed.data.email, result)
    const sendEmailMs = Date.now() - t3
    if (deliveryStatus === 'failed') {
      const invalidationAttemptSucceeded = await invalidateUserCodeAfterSendFailure(parsed.data.email, result)
      console.error('[auth-mvp/request-code] email send rejected')
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'email_rejected', invalidationAttemptSucceeded, ipRateLimitMs, createCodeMs, sendEmailMs, totalMs: Date.now() - t0 }))
      return NextResponse.json({ success: false }, { status: 500 })
    }
    if (deliveryStatus === 'uncertain') {
      console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'email_outcome_uncertain', ipRateLimitMs, createCodeMs, sendEmailMs, totalMs: Date.now() - t0 }))
      return successfulCodeRequestResponse({ delivery: 'uncertain' })
    }
    console.info('[auth-mvp/request-code]', JSON.stringify({ requestId, result: 'created_and_sent', ipRateLimitMs, createCodeMs, sendEmailMs, totalMs: Date.now() - t0 }))
    return successfulCodeRequestResponse()
  }

  // Invalid payload: still return success (no validation leak)
  return NextResponse.json({ success: true })
}
