import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { id } = await params
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  // RLS ensures the authenticated user can only delete their own rows
  const { error } = await supabase
    .from('weather_saved_places')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[saved-places DELETE] db error')
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
