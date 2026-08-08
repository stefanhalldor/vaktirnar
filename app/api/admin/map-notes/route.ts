import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { listTeskeidFeedbackForAdmin } from '@/lib/map-notes/repository.server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin(await createClient())
  if (auth.error) return auth.error
  try {
    return NextResponse.json(
      { items: await listTeskeidFeedbackForAdmin() },
      { headers: NO_STORE },
    )
  } catch {
    return NextResponse.json(
      { error: 'Feedback unavailable' },
      { status: 503, headers: NO_STORE },
    )
  }
}
