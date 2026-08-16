import 'server-only'

import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { getAdmin } from '@/lib/supabase/admin'

/**
 * Returns only whether the current authenticated person already has an
 * Expenses participation edge. No ledger, invitation or counterparty data is
 * projected to Home.
 */
export async function hasExpenseAccessRequestContext(
  actorUserId: string,
  actorEmail: string,
): Promise<boolean> {
  if (process.env.EXPENSES_ENABLED !== 'true') return false
  const email = normalizeEmailForAccess(actorEmail)
  if (!email) return false

  try {
    const admin = getAdmin()
    const [membershipResult, invitationResult] = await Promise.all([
      admin
        .from('expense_group_members')
        .select('id')
        .eq('user_id', actorUserId)
        .in('status', ['active', 'invited'])
        .limit(1),
      admin
        .from('expense_member_invitations')
        .select('id')
        .eq('recipient_email_canonical', email)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .limit(1),
    ])
    if (membershipResult.error || invitationResult.error) {
      console.error('[expenses/access-request] context lookup failed')
      return false
    }
    return (membershipResult.data?.length ?? 0) > 0
      || (invitationResult.data?.length ?? 0) > 0
  } catch {
    console.error('[expenses/access-request] context lookup failed')
    return false
  }
}
