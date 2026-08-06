import 'server-only'
import { randomUUID } from 'node:crypto'
import { getAdmin } from '@/lib/supabase/admin'
import type { ExpenseParticipantOption } from './contracts'
import type { ExpenseNewMemberInput } from './validation'
import { getRelationshipLabelState } from '@/lib/relationships/repository-v2.server'

interface RelationshipRow {
  id: string
  counterpart_user_id: string | null
  private_display_name: string | null
}

interface ProfileRow {
  id: string
  display_name: string | null
}

export interface ResolvedExpenseMember {
  id: string
  key: string
  userId: string | null
  displayName: string
  role: 'owner' | 'member'
  status: 'invited' | 'active'
  relationshipId?: string
  recipientEmail?: string
  circleId?: string
  circleMemberId?: string
}

interface CircleMemberRow {
  id: string
  circle_id: string
  user_id: string
}

async function getProfileNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const { data, error } = await getAdmin()
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
  if (error) throw new Error('expense_profile_lookup_failed')
  return new Map(
    ((data ?? []) as ProfileRow[])
      .map((row) => [row.id, row.display_name?.trim() || 'Teskeiðarnotandi'] as const),
  )
}

export async function getExpenseParticipantOptions(
  ownerUserId: string,
): Promise<ExpenseParticipantOption[]> {
  const { data, error } = await getAdmin()
    .from('relationships')
    .select('id, counterpart_user_id, private_display_name')
    .eq('owner_id', ownerUserId)
    .not('counterpart_user_id', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error('expense_relationship_lookup_failed')
  if (!data) return []

  const rows = data as RelationshipRow[]
  const labelState = await getRelationshipLabelState(ownerUserId)
  const profileNames = await getProfileNames(
    rows.flatMap((row) => row.counterpart_user_id ? [row.counterpart_user_id] : []),
  )

  return rows.flatMap((row) => {
    if (!row.counterpart_user_id) return []
    const sharedLabel = profileNames.get(row.counterpart_user_id) ?? 'Teskeiðarnotandi'
    return [{
      relationshipId: row.id,
      pickerLabel: row.private_display_name?.trim() || sharedLabel,
      sharedLabel,
      customLabels: labelState.labels
        .filter((label) => labelState.relationshipLabelIds[row.id]?.includes(label.id))
        .map((label) => ({ id: label.id, name: label.name })),
    }]
  })
}

export async function resolveExpenseMembers(input: {
  actorUserId: string
  actorDisplayName: string
  members: readonly ExpenseNewMemberInput[]
}): Promise<ResolvedExpenseMember[]> {
  const selfInput = input.members.find((member) => member.type === 'self')
  const resolved: ResolvedExpenseMember[] = [{
    id: randomUUID(),
    key: selfInput?.key ?? 'self',
    userId: input.actorUserId,
    displayName: input.actorDisplayName,
    role: 'owner',
    status: 'active',
  }]

  const relationshipInputs = input.members.filter(
    (member): member is Extract<ExpenseNewMemberInput, { type: 'relationship' }> =>
      member.type === 'relationship',
  )
  let relationships = new Map<string, RelationshipRow>()
  if (relationshipInputs.length > 0) {
    const { data, error } = await getAdmin()
      .from('relationships')
      .select('id, counterpart_user_id, private_display_name')
      .eq('owner_id', input.actorUserId)
      .in('id', relationshipInputs.map((member) => member.relationship_id))
    if (error) throw new Error('expense_relationship_lookup_failed')
    relationships = new Map(((data ?? []) as RelationshipRow[]).map((row) => [row.id, row]))
  }

  const linkedUserIds = [...relationships.values()].flatMap(
    (row) => row.counterpart_user_id ? [row.counterpart_user_id] : [],
  )
  const circleInputs = input.members.filter(
    (member): member is Extract<ExpenseNewMemberInput, { type: 'circle_member' }> =>
      member.type === 'circle_member',
  )
  let circleMembers = new Map<string, CircleMemberRow>()
  if (circleInputs.length > 0) {
    const circleIds = [...new Set(circleInputs.map((member) => member.circle_id))]
    if (circleIds.length !== 1) throw new Error('expense_circle_invalid')
    const { data: actorMembership } = await getAdmin()
      .from('relationship_circle_members')
      .select('id')
      .eq('circle_id', circleIds[0]!)
      .eq('user_id', input.actorUserId)
      .eq('status', 'active')
      .maybeSingle()
    if (!actorMembership) throw new Error('expense_circle_not_allowed')
    const { data, error } = await getAdmin()
      .from('relationship_circle_members')
      .select('id, circle_id, user_id')
      .eq('circle_id', circleIds[0]!)
      .eq('status', 'active')
      .in('id', circleInputs.map((member) => member.circle_member_id))
    if (error) throw new Error('expense_circle_lookup_failed')
    circleMembers = new Map(((data ?? []) as CircleMemberRow[]).map((row) => [row.id, row]))
  }

  const profileNames = await getProfileNames([
    ...linkedUserIds,
    ...Array.from(circleMembers.values(), (row) => row.user_id),
  ])

  for (const member of input.members) {
    if (member.type === 'self') continue
    if (member.type === 'guest') {
      resolved.push({
        id: randomUUID(),
        key: member.key,
        userId: null,
        displayName: member.display_name,
        role: 'member',
        status: 'active',
      })
      continue
    }

    if (member.type === 'email') {
      resolved.push({
        id: randomUUID(),
        key: member.key,
        userId: null,
        displayName: member.display_name,
        role: 'member',
        status: 'active',
        recipientEmail: member.recipient_email,
      })
      continue
    }

    if (member.type === 'circle_member') {
      const circleMember = circleMembers.get(member.circle_member_id)
      if (!circleMember || circleMember.circle_id !== member.circle_id || circleMember.user_id === input.actorUserId) {
        throw new Error('expense_circle_member_not_available')
      }
      resolved.push({
        id: randomUUID(),
        key: member.key,
        userId: circleMember.user_id,
        displayName: profileNames.get(circleMember.user_id) ?? 'Teskeiðarnotandi',
        role: 'member',
        status: 'invited',
        circleId: member.circle_id,
        circleMemberId: member.circle_member_id,
      })
      continue
    }

    const relationship = relationships.get(member.relationship_id)
    if (!relationship?.counterpart_user_id || relationship.counterpart_user_id === input.actorUserId) {
      throw new Error('expense_relationship_not_available')
    }
    resolved.push({
      id: randomUUID(),
      key: member.key,
      userId: relationship.counterpart_user_id,
      displayName: profileNames.get(relationship.counterpart_user_id) ?? 'Teskeiðarnotandi',
      role: 'member',
      status: 'invited',
      relationshipId: member.relationship_id,
    })
  }

  const keys = new Set<string>()
  const userIds = new Set<string>()
  for (const member of resolved) {
    if (keys.has(member.key)) throw new Error('expense_member_key_duplicate')
    keys.add(member.key)
    if (member.userId) {
      if (userIds.has(member.userId)) throw new Error('expense_member_user_duplicate')
      userIds.add(member.userId)
    }
  }
  return resolved
}

export async function getExpenseActorDisplayName(userId: string): Promise<string> {
  const { data } = await getAdmin()
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  const displayName = (data as { display_name?: string | null } | null)?.display_name?.trim()
  return displayName || 'Teskeiðarnotandi'
}
