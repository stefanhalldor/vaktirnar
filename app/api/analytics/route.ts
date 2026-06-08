import { createHmac, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'

const COOKIE_NAME = 'teskeid_voter_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function getVoteSecret(): string {
  if (process.env.VOTE_SECRET) return process.env.VOTE_SECRET
  return 'dev-vote-secret-not-for-production'
}

function hmacHash(value: string): string {
  return createHmac('sha256', getVoteSecret()).update(value).digest('hex')
}

// In-memory throttle — soft guard only.
// Not reliable across Vercel serverless instances (each has its own memory).
// Not a security boundary, just a basic rate limit for soft launch.
const throttleMap = new Map<string, { count: number; resetAt: number }>()
const THROTTLE_MAX = 30
const THROTTLE_WINDOW_MS = 60_000

function isThrottled(key: string): boolean {
  const now = Date.now()
  const entry = throttleMap.get(key)
  if (!entry || now > entry.resetAt) {
    throttleMap.set(key, { count: 1, resetAt: now + THROTTLE_WINDOW_MS })
    return false
  }
  if (entry.count >= THROTTLE_MAX) return true
  entry.count++
  return false
}

function deriveDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/Tablet|iPad/i.test(ua)) return 'tablet'
  if (/Mobile/i.test(ua)) return 'mobile'
  return 'desktop'
}

function deriveBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua)) return 'Safari'
  return 'Other'
}

function extractHostname(url: string): string | null {
  try {
    const { hostname } = new URL(url.startsWith('http') ? url : `https://${url}`)
    return hostname || null
  } catch {
    return null
  }
}

const postSchema = z.object({
  event_type: z.enum(['page_view', 'vote', 'follow', 'submit']),
  path: z.string().min(1).max(500),
  idea_id: z.string().uuid().optional(),
  referrer: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { event_type, path, idea_id, referrer: bodyReferrer } = parsed.data

  // Get or create visitor cookie
  const existing = request.cookies.get(COOKIE_NAME)?.value
  const isNew = !existing || existing.length < 10
  const cookieValue = isNew ? randomUUID() : existing!

  const visitor_hash = hmacHash(cookieValue)

  // Throttle by visitor_hash
  if (isThrottled(visitor_hash)) {
    return NextResponse.json({ ok: true }, { status: 429 })
  }

  const ua = request.headers.get('user-agent') ?? ''
  const device_type = deriveDevice(ua)
  const browser = deriveBrowser(ua)
  const country = request.headers.get('x-vercel-ip-country') ?? null

  // Strip referrer to hostname only
  const rawRef =
    bodyReferrer || request.headers.get('referer') || request.headers.get('referrer') || ''
  const referrer = rawRef ? extractHostname(rawRef) : null

  try {
    await getAdmin().from('analytics_events').insert({
      visitor_hash,
      event_type,
      path,
      idea_id: idea_id ?? null,
      referrer,
      device_type,
      browser,
      country,
    })
  } catch (err) {
    // Log but never surface errors to client — tracking must be silent
    console.error('[api/analytics] insert failed')
  }

  const response = NextResponse.json({ ok: true })
  if (isNew) {
    response.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
  }
  return response
}
