import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLoginCode } from '@/lib/auth/codes'
import { sendLoginCode, sendWaitlistConfirmation } from '@/lib/auth/email'
import { generateUnsubscribeToken } from '@/lib/auth/unsubscribe'
import { getAdmin } from '@/lib/supabase/admin'

const schema = z.object({
  email: z.string().email().max(320).transform((e) => e.toLowerCase().trim()),
})

function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email)
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://teskeid.is'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Return success anyway — do not leak validation info
    return NextResponse.json({ success: true })
  }

  const { email } = parsed.data

  if (isAdminEmail(email)) {
    // Generate and send login code (silently skip if rate-limited)
    const code = await createLoginCode(email)
    if (code) {
      await sendLoginCode(email, code)
    }
  } else {
    // Waitlist flow
    const { data: existing } = await getAdmin()
      .from('login_waitlist')
      .select('id, unsubscribed_at, updated_at')
      .eq('email', email)
      .maybeSingle()

    if (existing?.unsubscribed_at) {
      // Unsubscribed — do nothing
    } else if (existing) {
      // Already on waitlist — check if eligible for re-email (max once per hour)
      const updatedAt = new Date(existing.updated_at).getTime()
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      if (updatedAt < oneHourAgo) {
        const token = generateUnsubscribeToken(email)
        const unsubscribeUrl = `${SITE_URL}/api/auth/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
        await sendWaitlistConfirmation(email, unsubscribeUrl)
        await getAdmin()
          .from('login_waitlist')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } else {
      // New — insert and send confirmation
      const { data: inserted } = await getAdmin()
        .from('login_waitlist')
        .insert({ email })
        .select('id')
        .single()

      if (inserted) {
        const token = generateUnsubscribeToken(email)
        const unsubscribeUrl = `${SITE_URL}/api/auth/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
        await sendWaitlistConfirmation(email, unsubscribeUrl)
      }
    }
  }

  // Always return identical success response
  return NextResponse.json({ success: true })
}
