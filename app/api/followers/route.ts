import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { followerSchema } from '@/lib/teskeid/validation'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = followerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { idea_id, email } = parsed.data // email already lowercased by Zod transform

  const supabase = await createClient()
  const { error } = await supabase.from('followers').insert({ idea_id, email })

  if (error && error.code !== '23505') {
    // Ignore unique violation — return success to avoid leaking whether email was already registered
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
