import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'

export interface RelationshipExpenseContextSummary {
  id: string
  kind: 'group' | 'one_off'
  name: string
  emoji: string | null
}

interface MembershipRow {
  group_id: string
}

interface GroupRow {
  id: string
  kind: 'group' | 'one_off'
  name: string
  emoji: string | null
}

/**
 * Returns a bounded, owner-visible list of expense contexts shared with one
 * confirmed relationship counterpart. Both users must currently be active
 * members of the same group. Email-only relationships are never resolved here.
 */
export async function getRelationshipExpenseContexts(
  ownerUserId: string,
  counterpartUserId: string,
): Promise<RelationshipExpenseContextSummary[]> {
  if (!ownerUserId || !counterpartUserId || ownerUserId === counterpartUserId) return []

  const admin = getAdmin()
  const [ownerMemberships, counterpartMemberships] = await Promise.all([
    admin
      .from('expense_group_members')
      .select('group_id')
      .eq('user_id', ownerUserId)
      .eq('status', 'active'),
    admin
      .from('expense_group_members')
      .select('group_id')
      .eq('user_id', counterpartUserId)
      .eq('status', 'active'),
  ])

  if (ownerMemberships.error || counterpartMemberships.error) {
    throw new Error('relationship_expense_membership_lookup_failed')
  }

  const ownerGroupIds = new Set(
    ((ownerMemberships.data ?? []) as MembershipRow[]).map((row) => row.group_id),
  )
  const sharedGroupIds = [
    ...new Set(
      ((counterpartMemberships.data ?? []) as MembershipRow[])
        .map((row) => row.group_id)
        .filter((groupId) => ownerGroupIds.has(groupId)),
    ),
  ]

  if (sharedGroupIds.length === 0) return []

  const { data, error } = await admin
    .from('expense_groups')
    .select('id, kind, name, emoji')
    .in('id', sharedGroupIds)
    .order('name', { ascending: true })
    .limit(5)

  if (error) throw new Error('relationship_expense_context_lookup_failed')

  return ((data ?? []) as GroupRow[]).map((group) => ({
    id: group.id,
    kind: group.kind,
    name: group.name,
    emoji: group.emoji,
  }))
}
