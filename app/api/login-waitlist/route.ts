import { NextResponse, type NextRequest } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > 320 || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const { error } = await getAdmin()
    .from('login_waitlist')
    .insert({ email })

  if (error && error.code !== '23505') {
    console.error('[login-waitlist] insert error:', error)
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
