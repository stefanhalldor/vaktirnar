import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyUserCode } from '@/lib/auth/user-codes'
import { createUserSession } from '@/lib/auth/session'
import { isAuthMvpAllowedEmail } from '@/lib/auth/allowlist'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
  code: z.string().min(6).max(6).regex(/^\d{6}$/),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const { email, code } = parsed.data

  // Allowlist check: non-allowlisted email returns same error as wrong code.
  // No Supabase user created, no session, no information leaked.
  const allowed = await isAuthMvpAllowedEmail(email)
  if (!allowed) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const valid = await verifyUserCode(email, code)
  if (!valid) {
    // invalid_code covers: wrong code, expired, too many attempts, no active code
    // Never indicate whether the email exists
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const { error } = await createUserSession(email)
  if (error) {
    return NextResponse.json({ error: 'session_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
