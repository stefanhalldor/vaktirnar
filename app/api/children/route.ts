import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('parent_child')
    .select('child:children(*)')
    .eq('parent_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.map((r) => r.child) ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, birth_year, avatar_emoji, gender } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  // Generate ID upfront so we can link parent before selecting
  const childId = randomUUID()

  const { error: childError } = await supabase
    .from('children')
    .insert({ id: childId, name: name.trim(), birth_year, avatar_emoji: avatar_emoji ?? '🧒', gender: gender ?? null })

  if (childError) return NextResponse.json({ error: childError.message }, { status: 500 })

  // Link parent to child (must happen before any SELECT on children)
  const { error: linkError } = await supabase
    .from('parent_child')
    .insert({ parent_id: user.id, child_id: childId, role: 'primary' })

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  // Generate invite code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()
  await supabase.from('invite_codes').insert({ child_id: childId, code, created_by: user.id })

  // Set initial custody (now parent_child exists so UPDATE policy passes)
  await supabase
    .from('children')
    .update({ current_custodial_parent_id: user.id })
    .eq('id', childId)

  // Now safe to select
  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('id', childId)
    .single()

  return NextResponse.json(child, { status: 201 })
}
