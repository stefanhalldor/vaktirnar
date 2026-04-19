import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Runs hourly via Vercel cron (vercel.json)
// Deletes chats that ended more than 24 hours ago
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Delete messages first (FK constraint)
  const { data: endedChats } = await supabase
    .from('chats')
    .select('id')
    .eq('status', 'ended')
    .lt('updated_at', cutoff)

  if (!endedChats?.length) {
    return NextResponse.json({ deleted: 0 })
  }

  const chatIds = endedChats.map((c) => c.id)

  await supabase.from('messages').delete().in('chat_id', chatIds)

  const { count } = await supabase
    .from('chats')
    .delete({ count: 'exact' })
    .in('id', chatIds)

  return NextResponse.json({ deleted: count ?? 0 })
}
