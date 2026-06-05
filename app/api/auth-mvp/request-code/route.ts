import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createUserCode } from '@/lib/auth/user-codes'
import { sendUserLoginCode } from '@/lib/auth/email'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
})

// Always returns { success: true } — never leaks whether email exists,
// whether rate limit was hit, or whether email sending succeeded.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  // TODO: add IP-based rate limiting here (e.g. Upstash Ratelimit on x-forwarded-for)
  // before calling createUserCode, to prevent multi-email spam from a single IP.
  // Email-based rate limit (5/hr) is the current protection.

  if (parsed.success) {
    try {
      // Allowlist check: silently do nothing for non-allowlisted emails.
      // No code created, no email sent, no row in auth_email_codes.
      // Client receives identical success response — no enumeration leak.
      const allowed = await isAuthMvpAllowedEmail(parsed.data.email)
      if (!allowed) {
        return NextResponse.json({ success: true })
      }

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
