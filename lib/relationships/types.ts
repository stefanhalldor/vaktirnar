export const ALLOWED_TAGS = ['unclassified', 'family', 'friends', 'recipients'] as const
export type RelationshipTag = (typeof ALLOWED_TAGS)[number]

export interface RelationshipCustomLabel {
  id: string
  name: string
  normalizedName: string
  version: number
  relationshipCount: number
}

export interface RelationshipCircleMemberView {
  id: string
  displayName: string
  role: 'owner' | 'member'
  isSelf: boolean
}

export interface RelationshipCircleSummary {
  id: string
  name: string
  description: string | null
  role: 'owner' | 'member'
  memberCount: number
  pendingInvitationCount: number
  version: number
}

export interface RelationshipCircleDetail extends RelationshipCircleSummary {
  members: RelationshipCircleMemberView[]
  canManage: boolean
}

export interface RelationshipCircleInvitationView {
  invitationId: string
  circle: RelationshipCircleDetail
  inviterDisplayName: string | null
  expiresAt: string
}

export interface RelationshipCircleOption {
  id: string
  name: string
  members: Array<{
    circleMemberId: string
    displayName: string
    isSelf: boolean
  }>
}
