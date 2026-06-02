import { createHmac, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'

const COOKIE_NAME = 'teskeid_voter_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

// Env checks split by handler: POST only needs VOTE_SECRET (uses anon client),
// GET also needs SUPABASE_SERVICE_ROLE_KEY (uses getAdmin for voted lookup + counts).
function checkPostEnv(): string | null {
  if (!process.env.VOTE_SECRET && process.env.NODE_ENV === 'production') {
    return 'VOTE_SECRET is not set'
  }
  return null
}

function checkGetEnv(): string | null {
  const postErr = checkPostEnv()
  if (postErr) return postErr
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'SUPABASE_SERVICE_ROLE_KEY is not set'
  }
  return null
}

function getVoteSecret(): string {
  if (process.env.VOTE_SECRET) return process.env.VOTE_SECRET
  // Dev fallback — clearly labelled, never used in production (checkEnv blocks first)
  return 'dev-vote-secret-not-for-production'
}

function hmacHash(value: string): string {
  return createHmac('sha256', getVoteSecret()).update(value).digest('hex')
}

// --- POST /api/votes ---

const postSchema = z.object({
  idea_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const envError = checkPostEnv()
  if (envError) {
    console.error('[api/votes] POST:', envError)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { idea_id } = parsed.data

  // Get or create voter id from httpOnly cookie (server-managed, not client-readable)
  const existing = request.cookies.get(COOKIE_NAME)?.value
  const isNew = !existing || existing.length < 10
  const voterId = isNew ? randomUUID() : existing!

  // Hash voter id and IP — never store raw values
  const voter_token = hmacHash(voterId)

  const forwarded = request.headers.get('x-forwarded-for')
  const rawIp = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip')
  const ip_hash = rawIp ? hmacHash(rawIp) : null

  const supabase = await createClient()
  const { error } = await supabase.from('votes').insert({ idea_id, voter_token, ip_hash })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already voted' }, { status: 409 })
    }
    console.error('[api/votes] POST insert error:', error.code, error.message)
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  const response = NextResponse.json({ ok: true })
  if (isNew) {
    response.cookies.set(COOKIE_NAME, voterId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
  }
  return response
}

// --- GET /api/votes ---

const getSchema = z.object({
  idea_ids: z.string().min(1).max(3000),
})

export async function GET(request: NextRequest) {
  const envError = checkGetEnv()
  if (envError) {
    console.error('[api/votes] GET:', envError)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const parsed = getSchema.safeParse({
    idea_ids: request.nextUrl.searchParams.get('idea_ids'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const idea_ids = parsed.data.idea_ids.split(',').filter(Boolean).slice(0, 100)
  if (idea_ids.length === 0) {
    return NextResponse.json({ voted: {}, counts: {} })
  }

  // Derive voter token from httpOnly cookie only (IP is not used for dedup)
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value
  const voter_token = cookieValue ? hmacHash(cookieValue) : null

  // Voted lookup based on cookie hash — same browser that voted will see voted=true
  const voted: Record<string, true> = {}
  if (voter_token) {
    const { data: voteRows } = await getAdmin()
      .from('votes')
      .select('idea_id')
      .eq('voter_token', voter_token)
      .in('idea_id', idea_ids)

    for (const row of voteRows ?? []) {
      voted[row.idea_id] = true
    }
  }

  // Counts (always returned)
  const { data: ideaRows, error: ideasError } = await getAdmin()
    .from('ideas')
    .select('id, votes_count')
    .in('id', idea_ids)

  if (ideasError) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const counts: Record<string, number> = {}
  for (const row of ideaRows ?? []) {
    counts[row.id] = row.votes_count
  }

  return NextResponse.json({ voted, counts })
}
