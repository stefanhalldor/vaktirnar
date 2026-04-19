import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myChildren } = await supabase
    .from('parent_child')
    .select('child_id')
    .eq('parent_id', user.id)

  const childIds = myChildren?.map((r) => r.child_id) ?? []
  if (childIds.length === 0) return NextResponse.json([])

  const { data, error } = await supabase
    .from('chats')
    .select(`
      *,
      child_a:children!chats_child_a_id_fkey(id, name, avatar_emoji),
      child_b:children!chats_child_b_id_fkey(id, name, avatar_emoji)
    `)
    .or(`child_a_id.in.(${childIds.join(',')}),child_b_id.in.(${childIds.join(',')})`)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contact_id } = await request.json()
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })

  // Get contact row
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contact_id)
    .eq('status', 'accepted')
    .single()

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  // Check for existing active chat between these children
  const { data: existing } = await supabase
    .from('chats')
    .select('id')
    .or(
      `and(child_a_id.eq.${contact.child_a_id},child_b_id.eq.${contact.child_b_id}),and(child_a_id.eq.${contact.child_b_id},child_b_id.eq.${contact.child_a_id})`
    )
    .eq('status', 'active')
    .single()

  if (existing) return NextResponse.json(existing)

  const { data, error } = await supabase
    .from('chats')
    .insert({
      child_a_id: contact.child_a_id,
      child_b_id: contact.child_b_id,
      status: 'active',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
