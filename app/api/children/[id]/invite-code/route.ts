import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { legacyGuard } from '@/lib/legacy/guard'
import { guardLegacyAccess } from '@/lib/legacy/access'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = legacyGuard()
  if (g) return g

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ag = await guardLegacyAccess(user.id)
  if (ag) return ag

  // Regenerate invite code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase()

  const { data, error } = await supabase
    .from('invite_codes')
    .upsert({ child_id: id, code, created_by: user.id }, { onConflict: 'child_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
