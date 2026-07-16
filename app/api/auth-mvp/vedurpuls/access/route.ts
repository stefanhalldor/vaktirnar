import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChatAccess } from '@/lib/chat/access.server'
import { chatAccessError } from '@/lib/chat/api.server'

/**
 * GET /api/auth-mvp/vedurpuls/access
 *
 * Returns { canPost: true } if the authenticated user has Veðurpúls posting access.
 * Returns 401 (via middleware or stale session) if not logged in.
 * Returns 403/503 if logged in but access is not allowed.
 *
 * Used by VedurstofanPulseInline to decide whether to show the composer on mount,
 * avoiding throwaway typing before an auth wall.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await checkChatAccess(user)
  if (access !== 'allowed') return chatAccessError(access)
  return NextResponse.json({ canPost: true })
}
