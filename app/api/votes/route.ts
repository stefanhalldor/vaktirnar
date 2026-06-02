import { createHash } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { voteSchema } from '@/lib/teskeid/validation'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = voteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { idea_id, voter_token } = parsed.data

  // Hash the IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') ?? 'unknown')
  const ip_hash = createHash('sha256').update(ip).digest('hex')

  const supabase = await createClient()
  const { error } = await supabase.from('votes').insert({ idea_id, voter_token, ip_hash })

  if (error) {
    if (error.code === '23505') {
      // Unique violation — already voted
      return NextResponse.json({ error: 'Already voted' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const voter_token = searchParams.get('voter_token')
  const idea_ids_raw = searchParams.get('idea_ids')

  if (!voter_token || voter_token.length > 100 || !idea_ids_raw) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const idea_ids = idea_ids_raw.split(',').filter(Boolean).slice(0, 100)
  if (idea_ids.length === 0) {
    return NextResponse.json({ voted: {}, counts: {} })
  }

  // Use service role to bypass RLS (anon cannot SELECT votes)
  const [votesResult, ideasResult] = await Promise.all([
    supabaseAdmin
      .from('votes')
      .select('idea_id')
      .eq('voter_token', voter_token)
      .in('idea_id', idea_ids),
    supabaseAdmin
      .from('ideas')
      .select('id, votes_count')
      .in('id', idea_ids),
  ])

  if (votesResult.error || ideasResult.error) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  // voted: { [idea_id]: true } — no voter_token or ip_hash
  const voted: Record<string, true> = {}
  for (const row of votesResult.data ?? []) {
    voted[row.idea_id] = true
  }

  // counts: { [idea_id]: number }
  const counts: Record<string, number> = {}
  for (const row of ideasResult.data ?? []) {
    counts[row.id] = row.votes_count
  }

  return NextResponse.json({ voted, counts })
}
