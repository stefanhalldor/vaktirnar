import 'server-only'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { getAdmin } from '@/lib/supabase/admin'
import { getRelationshipRecipientOptions } from './actions'
import { getRelationshipDisplayName } from './display-and-sort'
import type {
  RelationshipCircleDetail,
  RelationshipCircleInvitationView,
  RelationshipCircleOption,
  RelationshipCircleSummary,
  RelationshipCustomLabel,
} from './types'

export interface RelationshipLabelState {
  available: boolean
  labels: RelationshipCustomLabel[]
  relationshipLabelIds: Record<string, string[]>
}

interface CircleRow {
  id: string
  owner_id: string
  name: string
  description: string | null
  status: 'active' | 'archived'
  version: number
}

interface CircleMemberRow {
  id: string
  circle_id: string
  user_id: string
  role: 'owner' | 'member'
  status: 'active' | 'left' | 'removed'
}

async function profileNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  const { data } = await getAdmin().from('profiles').select('id, display_name').in('id', ids)
  return new Map(((data ?? []) as Array<{ id: string; display_name: string | null }>).map((row) => [
    row.id,
    row.display_name?.trim() || 'Teskeiðarnotandi',
  ]))
}

export async function getRelationshipLabelState(ownerUserId: string): Promise<RelationshipLabelState> {
  const admin = getAdmin()
  const [labelsResult, assignmentsResult] = await Promise.all([
    admin.from('relationship_label_definitions')
      .select('id, name, normalized_name, version')
      .eq('owner_id', ownerUserId)
      .order('name'),
    admin.from('relationship_label_assignments')
      .select('label_id, relationship_id')
      .eq('owner_id', ownerUserId),
  ])
  if (labelsResult.error || assignmentsResult.error) {
    return { available: false, labels: [], relationshipLabelIds: {} }
  }
  const assignments = (assignmentsResult.data ?? []) as Array<{ label_id: string; relationship_id: string }>
  const counts = new Map<string, number>()
  const relationshipLabelIds: Record<string, string[]> = {}
  for (const assignment of assignments) {
    counts.set(assignment.label_id, (counts.get(assignment.label_id) ?? 0) + 1)
    relationshipLabelIds[assignment.relationship_id] = [
      ...(relationshipLabelIds[assignment.relationship_id] ?? []),
      assignment.label_id,
    ]
  }
  return {
    available: true,
    labels: ((labelsResult.data ?? []) as Array<{
      id: string; name: string; normalized_name: string; version: number
    }>).map((label) => ({
      id: label.id,
      name: label.name,
      normalizedName: label.normalized_name,
      version: Number(label.version),
      relationshipCount: counts.get(label.id) ?? 0,
    })),
    relationshipLabelIds,
  }
}

async function circleProjection(
  actorUserId: string,
  circle: CircleRow,
  allowInvitedViewer: boolean,
): Promise<RelationshipCircleDetail | null> {
  const admin = getAdmin()
  const { data: membersData, error: membersError } = await admin
    .from('relationship_circle_members')
    .select('id, circle_id, user_id, role, status')
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .order('joined_at')
  if (membersError) return null
  const members = (membersData ?? []) as CircleMemberRow[]
  const actorMember = members.find((member) => member.user_id === actorUserId)
  if (!actorMember && !allowInvitedViewer) return null
  const names = await profileNames(members.map((member) => member.user_id))
  const { count: pendingInvitationCount } = await admin
    .from('relationship_circle_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('circle_id', circle.id)
    .eq('status', 'pending')
  return {
    id: circle.id,
    name: circle.name,
    description: circle.description,
    role: actorMember?.role ?? 'member',
    memberCount: members.length,
    pendingInvitationCount: pendingInvitationCount ?? 0,
    version: Number(circle.version),
    canManage: actorMember?.role === 'owner',
    members: members.map((member) => ({
      id: member.id,
      displayName: names.get(member.user_id) ?? 'Teskeiðarnotandi',
      role: member.role,
      isSelf: member.user_id === actorUserId,
    })),
  }
}

export async function getRelationshipCircles(actorUserId: string): Promise<{
  available: boolean
  circles: RelationshipCircleSummary[]
}> {
  const admin = getAdmin()
  const { data: membershipData, error: membershipError } = await admin
    .from('relationship_circle_members')
    .select('circle_id, role')
    .eq('user_id', actorUserId)
    .eq('status', 'active')
  if (membershipError) return { available: false, circles: [] }
  const memberships = (membershipData ?? []) as Array<{ circle_id: string; role: 'owner' | 'member' }>
  if (memberships.length === 0) return { available: true, circles: [] }
  const { data: circlesData, error: circlesError } = await admin
    .from('relationship_circles')
    .select('id, owner_id, name, description, status, version')
    .in('id', memberships.map((item) => item.circle_id))
    .eq('status', 'active')
    .order('name')
  if (circlesError) return { available: false, circles: [] }
  const circles = (circlesData ?? []) as CircleRow[]
  const projections = await Promise.all(circles.map((circle) => circleProjection(actorUserId, circle, false)))
  return {
    available: true,
    circles: projections.filter((item): item is RelationshipCircleDetail => item !== null),
  }
}

export async function getRelationshipCircle(
  actorUserId: string,
  circleId: string,
): Promise<RelationshipCircleDetail | null> {
  const { data, error } = await getAdmin().from('relationship_circles')
    .select('id, owner_id, name, description, status, version')
    .eq('id', circleId)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return null
  return circleProjection(actorUserId, data as CircleRow, false)
}

export async function getRelationshipCircleInvitation(
  actorUserId: string,
  actorEmail: string,
  invitationId: string,
): Promise<RelationshipCircleInvitationView | null> {
  const admin = getAdmin()
  const { data, error } = await admin.from('relationship_circle_invitations')
    .select('id, circle_id, invited_by, invitee_user_id, invitee_email_canonical, status, expires_at')
    .eq('id', invitationId)
    .eq('status', 'pending')
    .maybeSingle()
  if (error || !data) return null
  const invitation = data as {
    id: string
    circle_id: string
    invited_by: string | null
    invitee_user_id: string | null
    invitee_email_canonical: string | null
    status: string
    expires_at: string
  }
  const actorCanonical = normalizeEmailForAccess(actorEmail)
  if (
    invitation.invitee_user_id !== actorUserId
    && normalizeEmailForAccess(invitation.invitee_email_canonical ?? '') !== actorCanonical
  ) return null
  if (Date.parse(invitation.expires_at) <= Date.now()) return null

  const { data: circleData, error: circleError } = await admin.from('relationship_circles')
    .select('id, owner_id, name, description, status, version')
    .eq('id', invitation.circle_id)
    .eq('status', 'active')
    .maybeSingle()
  if (circleError || !circleData) return null

  // Product requirement: the exact invited user sees the full active member
  // roster before accepting, so consent is informed. No private metadata is read.
  const circle = await circleProjection(actorUserId, circleData as CircleRow, true)
  if (!circle) return null
  const inviterNames = invitation.invited_by ? await profileNames([invitation.invited_by]) : new Map()
  return {
    invitationId: invitation.id,
    circle,
    inviterDisplayName: invitation.invited_by ? inviterNames.get(invitation.invited_by) ?? null : null,
    expiresAt: invitation.expires_at,
  }
}

export async function getPendingRelationshipCircleInvitations(
  actorUserId: string,
  actorEmail: string,
): Promise<RelationshipCircleInvitationView[]> {
  const admin = getAdmin()
  const canonicalEmail = normalizeEmailForAccess(actorEmail)
  const [byUser, byEmail] = await Promise.all([
    admin.from('relationship_circle_invitations')
      .select('id').eq('invitee_user_id', actorUserId).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()).limit(50),
    canonicalEmail
      ? admin.from('relationship_circle_invitations')
        .select('id').eq('invitee_email_canonical', canonicalEmail).eq('status', 'pending')
        .gt('expires_at', new Date().toISOString()).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (byUser.error || byEmail.error) return []
  const ids = [...new Set([
    ...((byUser.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    ...((byEmail.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  ])]
  const invitations = await Promise.all(ids.map((id) => (
    getRelationshipCircleInvitation(actorUserId, actorEmail, id)
  )))
  return invitations.filter((invitation): invitation is RelationshipCircleInvitationView => invitation !== null)
}

export async function getRelationshipCircleOptions(actorUserId: string): Promise<RelationshipCircleOption[]> {
  const result = await getRelationshipCircles(actorUserId)
  if (!result.available) return []
  const details = await Promise.all(result.circles.map((circle) => getRelationshipCircle(actorUserId, circle.id)))
  return details.filter((circle): circle is RelationshipCircleDetail => circle !== null).map((circle) => ({
    id: circle.id,
    name: circle.name,
    members: circle.members.map((member) => ({
      circleMemberId: member.id,
      displayName: member.displayName,
      isSelf: member.isSelf,
    })),
  }))
}

export async function getRelationshipCircleInviteOptions(ownerUserId: string) {
  const options = await getRelationshipRecipientOptions(ownerUserId)
  return options.map((option) => ({
    relationshipId: option.id,
    label: getRelationshipDisplayName({
      privateDisplayName: option.privateDisplayName,
      counterpartDisplayName: option.selfDisplayName,
      email: option.email,
    }),
  }))
}
