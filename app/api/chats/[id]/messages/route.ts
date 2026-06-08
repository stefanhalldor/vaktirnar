import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { legacyGuard } from '@/lib/legacy/guard'
import { guardLegacyAccess } from '@/lib/legacy/access'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = legacyGuard()
  if (g) return g

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = legacyGuard()
  if (g) return g

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  const { content, type = 'text' } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .insert({ chat_id: id, sender_id: user.id, content: content.trim(), type })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update chat updated_at
  await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json(data, { status: 201 })
}
