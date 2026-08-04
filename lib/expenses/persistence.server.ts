import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import type { ExpenseMemberRole } from './contracts'

export interface PersistedExpenseMember {
  id: string
  userId: string | null
  displayName: string
  role: ExpenseMemberRole
}

interface MemberRow {
  id: string
  user_id: string | null
  display_name: string
  role: ExpenseMemberRole
  status: 'active' | 'removed'
}

export async function getActiveExpenseGroupMembersForActor(
  actorUserId: string,
  groupId: string,
): Promise<PersistedExpenseMember[]> {
  const admin = getAdmin()
  const { data: actorMembership, error: actorError } = await admin
    .from('expense_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', actorUserId)
    .eq('status', 'active')
    .maybeSingle()
  if (actorError) throw new Error('expense_member_lookup_failed')
  if (!actorMembership) throw new Error('expense_not_allowed')

  const { data, error } = await admin
    .from('expense_group_members')
    .select('id, user_id, display_name, role, status')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) throw new Error('expense_member_lookup_failed')

  return ((data ?? []) as MemberRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
  }))
}
