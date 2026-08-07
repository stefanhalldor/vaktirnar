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

function missingShareCollaboratorRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = 'message' in error ? String(error.message) : ''
  return code === '42P01' || code === 'PGRST205'
    || (message.includes('expense_share_collaborators') && message.includes('does not exist'))
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

/**
 * Returns active group members plus inactive members already referenced by the
 * expense being edited. Historical payment/share rows remain part of the
 * immutable ledger even after a balanced member leaves, so a details-only edit
 * must be able to submit those exact rows back to the version-checked RPC.
 */
export async function getExpenseEditMembersForActor(
  actorUserId: string,
  groupId: string,
  expenseId: string,
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

  const [memberResult, paymentResult, shareResult] = await Promise.all([
    admin
      .from('expense_group_members')
      .select('id, user_id, display_name, role, status')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true }),
    admin
      .from('expense_payments')
      .select('member_id')
      .eq('group_id', groupId)
      .eq('expense_id', expenseId),
    admin
      .from('expense_shares')
      .select('member_id')
      .eq('group_id', groupId)
      .eq('expense_id', expenseId),
  ])
  if (memberResult.error || paymentResult.error || shareResult.error) {
    throw new Error('expense_member_lookup_failed')
  }

  const referencedIds = new Set([
    ...((paymentResult.data ?? []) as Array<{ member_id: string }>).map((row) => row.member_id),
    ...((shareResult.data ?? []) as Array<{ member_id: string }>).map((row) => row.member_id),
  ])
  const collaboratorResult = await admin
    .from('expense_share_collaborators')
    .select('collaborator_member_id')
    .eq('expense_id', expenseId)
    .eq('status', 'active')
  if (collaboratorResult.error && !missingShareCollaboratorRelation(collaboratorResult.error)) {
    throw new Error('expense_member_lookup_failed')
  }
  const collaboratorIds = new Set(((collaboratorResult.data ?? []) as Array<{
    collaborator_member_id: string
  }>).map((row) => row.collaborator_member_id))

  return ((memberResult.data ?? []) as MemberRow[])
    .filter((row) => (
      (row.status === 'active' || referencedIds.has(row.id))
      && !collaboratorIds.has(row.id)
    ))
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
    }))
}
