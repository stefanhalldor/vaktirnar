import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const categoryLabels: Record<string, string> = {
  screen: 'Skjátími',
  physical: 'Hreyfing',
  other: 'Annað',
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { category, minutes, child_ids } = await request.json()
  if (!category || !minutes) return NextResponse.json({ error: 'category and minutes required' }, { status: 400 })

  const label = categoryLabels[category] ?? category
  const content = `${label} · ${minutes} mín`

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: id,
      sender_id: user.id,
      content,
      type: 'activity',
      activity_category: category,
      activity_minutes: minutes,
      activity_child_ids: child_ids ?? [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json(data, { status: 201 })
}
