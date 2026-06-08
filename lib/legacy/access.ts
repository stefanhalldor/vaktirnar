import 'server-only'
import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase/admin'

/**
 * Entitlement guard for legacy Krakkavaktin routes.
 * Returns a 404 NextResponse if the user is not in the legacy_access allowlist,
 * or if the database check fails (fail-closed).
 *
 * The userId is never written to logs.
 *
 * Usage after session check in every legacy route handler:
 *   const ag = await guardLegacyAccess(user.id)
 *   if (ag) return ag
 */
export async function guardLegacyAccess(
  userId: string,
): Promise<NextResponse | null> {
  const { data, error } = await getAdmin()
    .from('legacy_access')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[legacy/access] entitlement check failed')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}
