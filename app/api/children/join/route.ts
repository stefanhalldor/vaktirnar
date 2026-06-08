import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { legacyGuard } from '@/lib/legacy/guard'
import { guardLegacyAccess } from '@/lib/legacy/access'

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

  // Look up the invite code
  const { data: codeRow } = await supabase
    .from('invite_codes')
    .select('child_id')
    .eq('code', invite_code.toUpperCase().trim())
    .single()

  if (!codeRow) return NextResponse.json({ error: 'invalidCode' }, { status: 404 })

  // Check if already a parent of this child
  const { data: existing } = await supabase
    .from('parent_child')
    .select('id')
    .eq('parent_id', user.id)
    .eq('child_id', codeRow.child_id)
    .single()

  if (existing) return NextResponse.json({ error: 'alreadyParent' }, { status: 400 })

  // Add as co-parent
  const { error } = await supabase
    .from('parent_child')
    .insert({ parent_id: user.id, child_id: codeRow.child_id, role: 'coparent' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch the child to return
  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('id', codeRow.child_id)
    .single()

  return NextResponse.json(child, { status: 201 })
}
