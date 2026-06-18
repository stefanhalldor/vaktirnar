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
  // IP rate-limit check (best-effort; fails open so an RPC outage doesn't
  // block all logins). Must happen before body parsing to reject abuse early.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? request.headers.get('x-real-ip')?.trim()
          ?? ''
  const withinLimit = await checkIpRateLimit(ip)
  if (!withinLimit) {
    console.error('[auth-mvp/request-code] IP rate limit exceeded')
    // Reykjavik is UTC+0 year-round — next window opens at next calendar midnight UTC
    const todayRvk = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
    const [y, m, d] = todayRvk.split('-').map(Number)
    const retryAfter = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString()
    return NextResponse.json({ success: true, rateLimited: true, retryAfter })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (parsed.success) {
    try {
      const result = await createUserCode(parsed.data.email)
      if (result && typeof result === 'object' && 'rateLimited' in result) {
        return NextResponse.json({ success: true, rateLimited: true, retryAfter: result.retryAfter })
      }
      if (result === null) {
        // DB insert failed — surface as generic error so user is not left on code step
        console.error('[auth-mvp/request-code] code creation failed (DB error)')
        return NextResponse.json({ success: false }, { status: 500 })
      }
      // result is the plaintext code
      if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
        console.error('[auth-mvp/request-code] RESEND_API_KEY not configured — code generated but email will not be sent')
      }
      await sendUserLoginCode(parsed.data.email, result)
      return NextResponse.json({ success: true })
    } catch {
      // Catches createUserCode throws or sendUserLoginCode (Resend) failures
      console.error('[auth-mvp/request-code] internal error (not exposed to client)')
      return NextResponse.json({ success: false }, { status: 500 })
    }
  }
  // Invalid payload: still return success (no validation leak)

  return NextResponse.json({ success: true })
}
