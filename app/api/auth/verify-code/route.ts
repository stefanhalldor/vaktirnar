import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyLoginCode } from '@/lib/auth/codes'
import { createAdminSession } from '@/lib/auth/session'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
  code: z.string().min(6).max(6).regex(/^\d{6}$/),
})

function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const { email, code } = parsed.data

  // Non-admin emails can never succeed
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const valid = await verifyLoginCode(email, code)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const { error } = await createAdminSession(email)
  if (error) {
    return NextResponse.json({ error: 'session_error' }, { status: 500 })
  }

  return NextResponse.json({ success: true, redirect: '/admin' })
}
