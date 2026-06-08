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
    return NextResponse.json({ success: true })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (parsed.success) {
    try {
      const code = await createUserCode(parsed.data.email)
      if (code) {
        // Operational alert: warn if email infra is unconfigured (no code/email logged)
        if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
          console.error('[auth-mvp/request-code] RESEND_API_KEY not configured — code generated but email will not be sent')
        }
        await sendUserLoginCode(parsed.data.email, code)
      }
      // null code = silently rate-limited; do nothing
    } catch {
      // Log only safe metadata — no email address, no code
      console.error('[auth-mvp/request-code] internal error (not exposed to client)')
    }
  }
  // Invalid payload: still return success (no validation leak)

  return NextResponse.json({ success: true })
}
