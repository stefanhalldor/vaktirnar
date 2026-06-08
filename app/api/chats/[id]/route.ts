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
    .from('chats')
    .select(`*, child_a:children!chats_child_a_id_fkey(*), child_b:children!chats_child_b_id_fkey(*)`)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = legacyGuard()
  if (g) return g

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  const body = await request.json()

  const { data, error } = await supabase
    .from('chats')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If ending playdate, insert system message
  if (body.status === 'ended') {
    await supabase.from('messages').insert({
      chat_id: id,
      sender_id: user.id,
      content: 'Leiktíma lokið',
      type: 'system',
    })
  }

  return NextResponse.json(data)
}
