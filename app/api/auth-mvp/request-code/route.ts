import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createUserCode } from '@/lib/auth/user-codes'
import { sendUserLoginCode } from '@/lib/auth/email'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
})

// Always returns { success: true } — never leaks whether email exists,
// whether rate limit was hit, or whether email sending succeeded.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (parsed.success) {
    try {
      const code = await createUserCode(parsed.data.email)
      if (code) {
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
