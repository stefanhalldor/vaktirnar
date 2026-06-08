import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { legacyGuard } from '@/lib/legacy/guard'
import { guardLegacyAccess } from '@/lib/legacy/access'

export async function GET(request: Request) {
  const g = legacyGuard()
  if (g) return g

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  const { searchParams } = new URL(request.url)
  const acceptedOnly = searchParams.get('accepted') === 'true'

  // Get user's children
  const { data: parentChildren } = await supabase
    .from('parent_child')
    .select('child_id')
    .eq('parent_id', user.id)

  const childIds = parentChildren?.map((r) => r.child_id) ?? []
  if (childIds.length === 0) return NextResponse.json([])

  let query = supabase
    .from('contacts')
    .select(`
      *,
      child_a:children!contacts_child_a_id_fkey(id, name, avatar_emoji),
      child_b:children!contacts_child_b_id_fkey(id, name, avatar_emoji)
    `)
    .or(`child_a_id.in.(${childIds.join(',')}),child_b_id.in.(${childIds.join(',')})`)
    .neq('status', 'blocked')

  if (acceptedOnly) {
    query = query.eq('status', 'accepted')
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (acceptedOnly) {
    // Return as contact options for new chat
    const options = (data ?? []).map((c) => {
      const isMyChildA = childIds.includes(c.child_a_id)
      return {
        contactId: c.id,
        myChild: isMyChildA ? c.child_a : c.child_b,
        child: isMyChildA ? c.child_b : c.child_a,
      }
    })
    return NextResponse.json(options)
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const g = legacyGuard()
  if (g) return g

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  const { invite_code } = await request.json()
  if (!invite_code) return NextResponse.json({ error: 'invite_code required' }, { status: 400 })

  // Look up invite code
  const { data: codeRow } = await supabase
    .from('invite_codes')
    .select('*, child:children(*)')
    .eq('code', invite_code.toUpperCase())
    .single()

  if (!codeRow) return NextResponse.json({ error: 'Invalid code' }, { status: 404 })

  // Make sure it's not the user's own child
  const { data: myChild } = await supabase
    .from('parent_child')
    .select('child_id')
    .eq('parent_id', user.id)
    .eq('child_id', codeRow.child_id)
    .single()

  if (myChild) return NextResponse.json({ error: 'This is your own child' }, { status: 400 })

  // Get user's first child to associate contact with
  const { data: myChildren } = await supabase
    .from('parent_child')
    .select('child_id')
    .eq('parent_id', user.id)
    .limit(1)

  const myChildId = myChildren?.[0]?.child_id
  if (!myChildId) return NextResponse.json({ error: 'Add a child first' }, { status: 400 })

  // Check if contact already exists
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .or(
      `and(child_a_id.eq.${myChildId},child_b_id.eq.${codeRow.child_id}),and(child_a_id.eq.${codeRow.child_id},child_b_id.eq.${myChildId})`
    )
    .single()

  if (existing) return NextResponse.json({ error: 'Already connected' }, { status: 400 })

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      child_a_id: myChildId,
      child_b_id: codeRow.child_id,
      created_by: user.id,
      status: 'accepted',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
