export const HOUSEHOLD_CHORE_FEATURE_KEY = 'heimilisverkin' as const
export const TASKS_PRODUCT_ID = 'verkefnin' as const
export const TASKS_PATH = '/auth-mvp/verkefnin' as const
export const HOUSEHOLD_CHORES_LEGACY_PATH = '/auth-mvp/heimilisverkin' as const

// Internal compatibility alias. New user-facing links use TASKS_PATH while
// the SQL142 ABI and feature/recent identifiers remain household-specific.
export const HOUSEHOLD_CHORES_PATH = TASKS_PATH

export type HouseholdChoreMembershipType = 'member' | 'child'
export type HouseholdChoreResourceStatus = 'active' | 'archived'
export type HouseholdChoreAssignmentStatus = 'open' | 'completed' | 'cancelled'
export type HouseholdChoreAssignmentOrigin =
  | 'member_assigned'
  | 'self_assigned'
  | 'member_repeated'
  | 'quick_completed'
export type HouseholdChoreCompletionScope = 'global' | 'per_participant'

export type HouseholdChoreActionError =
  | 'invalid_input'
  | 'feature_disabled'
  | 'not_found'
  | 'not_allowed'
  | 'stale'
  | 'conflict'
  | 'not_available'
  | 'terminal_state'
  | 'last_full_member'
  | 'cap_reached'
  | 'rate_limited'
  | 'save_failed'

export type HouseholdChoreActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: HouseholdChoreActionError; retryAfterSeconds?: number }

export interface HouseholdChoreRootCircleItem {
  circleId: string
  name: string
  displayReference: string
  viewerType: HouseholdChoreMembershipType
  openAssignmentCount: number
}

export interface HouseholdChorePendingInvitationItem {
  invitationId: string
  circleName: string
  displayReference: string
  inviterLabel: string
  requestedType: HouseholdChoreMembershipType
  version: string
  expiresAt: string
  href: string
  acceptAvailable?: boolean
}

export interface HouseholdChoreRootView {
  circles: HouseholdChoreRootCircleItem[]
  pendingInvitations: HouseholdChorePendingInvitationItem[]
}

export interface HouseholdChoreInvitationConsentView {
  invitationId: string
  circleName: string
  displayReference: string
  inviterLabel: string
  requestedType: HouseholdChoreMembershipType
  version: string
  expiresAt: string
  acceptAvailable: boolean
}

export interface HouseholdChoreMembershipItem {
  circleId: string
  circleName: string
  displayReference: string
  membershipType: HouseholdChoreMembershipType
  membershipStatus: 'active'
  circleVersion: string
  membershipVersion: string
  canLeave: boolean
  canDeleteCircle: boolean
}

export interface HouseholdChoreMembershipsView {
  memberships: HouseholdChoreMembershipItem[]
  pendingInvitations: HouseholdChorePendingInvitationItem[]
}

export interface HouseholdChoreSafeParticipant {
  participantId: string
  label: string | null
}

export interface HouseholdChoreManagedParticipant extends HouseholdChoreSafeParticipant {
  identityMarker: 'current' | 'former_member'
  status: HouseholdChoreResourceStatus
  version: string
}

export interface HouseholdChoreSafeDefinition {
  definitionId: string
  title: string
  description: string | null
  materials: string | null
}

export interface HouseholdChoreManagedDefinition extends HouseholdChoreSafeDefinition {
  status: HouseholdChoreResourceStatus
  version: string
}

export interface HouseholdChoreScheduledDefinition extends HouseholdChoreManagedDefinition {
  cadenceDays: number | null
  completionScope: HouseholdChoreCompletionScope
}

export interface HouseholdChoreSafeOpenAssignment {
  assignmentId: string
  title: string
  participantLabel: string | null
  points: number
  version: string | null
  canComplete: boolean
  canCancel: boolean
}

export interface HouseholdChoreManagedOpenAssignment
  extends HouseholdChoreSafeOpenAssignment {
  definitionId: string
  description: string | null
  materials: string | null
  participantId: string
  participantIdentityMarker: 'current' | 'former_member'
  origin: HouseholdChoreAssignmentOrigin
  status: 'open'
  version: string
  canComplete: true
  canCancel: true
  createdAt: string
}

export type HouseholdChoreHistoryEventType =
  | 'created'
  | 'completed'
  | 'recompleted'
  | 'cancelled'
  | 'completion_reversed'

export interface HouseholdChoreHistoryItem {
  eventId: string
  assignmentId: string
  title: string
  eventType: HouseholdChoreHistoryEventType
  occurredAt: string
  participantLabel: string | null
  participantIdentityMarker: 'current' | 'former_member'
  assignmentOrigin: HouseholdChoreAssignmentOrigin
  snapshotPoints: number
  statusAfter: HouseholdChoreAssignmentStatus
  actorKind: 'member' | 'participant' | 'former_member' | 'system'
  actorLabel: string | null
  completionSequence: number | null
  completedAt: string | null
  pointsDelta: number | null
  cancellationReason: string | null
  reopenOutcome: string | null
}

export interface HouseholdChorePointTotal {
  participantId: string
  label: string | null
  identityMarker?: 'current' | 'former_member'
  points: number
}

export interface HouseholdChoreManagedMembership {
  membershipId: string
  participantId: string
  label: string | null
  identityMarker: 'current' | 'former_member'
  membershipType: HouseholdChoreMembershipType
  status: 'active'
  version: string
  isViewer: boolean
}

export interface HouseholdChoreManagedPendingInvitation {
  invitationId: string
  inviteeLabel: string
  requestedType: HouseholdChoreMembershipType
  version: string
  expiresAt: string
  /** Present only when this invitation links an existing guest participant. */
  participantId: string | null
}

export interface HouseholdChoreMemberCircleView {
  viewerType: 'member'
  circle: {
    circleId: string
    name: string
    displayReference: string
    version: string
    memberCount: number
  }
  participants: HouseholdChoreManagedParticipant[]
  definitions: HouseholdChoreManagedDefinition[]
  openAssignments: HouseholdChoreManagedOpenAssignment[]
  recentAssignments: HouseholdChoreHistoryItem[]
  pointTotals: HouseholdChorePointTotal[]
  memberships: HouseholdChoreManagedMembership[]
  pendingInvitations: HouseholdChoreManagedPendingInvitation[]
}

export interface HouseholdChoreChildCircleView {
  viewerType: 'child'
  circle: {
    name: string
    displayReference: string
  }
  ownParticipantId: string
  participants: HouseholdChoreSafeParticipant[]
  definitions: HouseholdChoreSafeDefinition[]
  openAssignments: HouseholdChoreSafeOpenAssignment[]
  recentAssignments: HouseholdChoreHistoryItem[]
  pointTotals: HouseholdChorePointTotal[]
}

export type HouseholdChoreCircleView =
  | HouseholdChoreMemberCircleView
  | HouseholdChoreChildCircleView

export interface HouseholdChoreParticipantValueView {
  participantId: string
  label: string | null
  identityMarker: 'current' | 'former_member'
  participantStatus: HouseholdChoreResourceStatus
  participantVersion: string
  valueStatus: 'missing' | 'active' | 'inactive'
  valueVersion: string
  points: number | null
}

export interface HouseholdChoreDefinitionDetailView {
  definition: HouseholdChoreScheduledDefinition
  participantValues: HouseholdChoreParticipantValueView[]
}

export interface HouseholdChorePriorityParticipant {
  participantId: string
  label: string
  identityMarker: 'current' | 'former_member'
  isViewer: boolean
}

export interface HouseholdChorePriorityParticipantState {
  participantId: string
  label: string
  identityMarker?: 'current' | 'former_member'
  points: number
  valueVersion?: string
  baselineAt: string
  dueAt: string | null
  latestCompletionId?: string | null
  latestCompletedAt: string | null
  oldestOpenAssignmentId: string | null
  oldestOpenAssignmentVersion: string | null
  expectedStateToken: string
}

export interface HouseholdChorePriorityOpenAssignment {
  assignmentId: string
  participantId: string
  participantLabel: string
  version: string
  createdAt: string
}

export interface HouseholdChorePriorityDefinition {
  definitionId: string
  title: string
  description: string | null
  materials: string | null
  version?: string
  cadenceDays: number | null
  completionScope: HouseholdChoreCompletionScope
  priorityDueAt: string | null
  participantStates?: HouseholdChorePriorityParticipantState[]
  ownState?: HouseholdChorePriorityParticipantState
  openAssignments?: HouseholdChorePriorityOpenAssignment[]
  openAssignmentCount?: number
}

export type HouseholdChorePriorityDashboardView = {
  viewerType: 'member'
  ownParticipantId: string
  participants: HouseholdChorePriorityParticipant[]
  definitions: HouseholdChorePriorityDefinition[]
} | {
  viewerType: 'child'
  ownParticipantId: string
  definitions: HouseholdChorePriorityDefinition[]
}

export interface HouseholdChoreSelfServiceItem extends HouseholdChoreSafeDefinition {
  definitionVersion: string
  participantValueVersion: string
  points: number
  ownOpenCount: number
}

export interface HouseholdChoreSelfServiceView {
  circleId: string
  participantId: string
  items: HouseholdChoreSelfServiceItem[]
}

export interface HouseholdChoreHistoryPage {
  items: HouseholdChoreHistoryItem[]
  hasMore: boolean
  nextCursor: { occurredAt: string; eventId: string } | null
}

export interface HouseholdChoreAssignmentSafeView {
  assignmentId: string
  title: string
  description: string | null
  materials: string | null
  participantLabel: string | null
  participantIdentityMarker: 'current' | 'former_member'
  points: number
  origin: HouseholdChoreAssignmentOrigin
  status: HouseholdChoreAssignmentStatus
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export interface HouseholdChoreMemberAssignmentView extends HouseholdChoreAssignmentSafeView {
  circleId: string
  definitionId: string
  participantId: string
  completionSequence: number
  version: string
}

export interface HouseholdChoreChildAssignmentView extends HouseholdChoreAssignmentSafeView {
  ownAssignment: boolean
  version: string | null
  canComplete: boolean
  canCancel: boolean
}

export type HouseholdChoreAssignmentDetailView = {
  viewerType: 'member'
  assignment: HouseholdChoreMemberAssignmentView
  timelinePreview: HouseholdChoreHistoryItem[]
} | {
  viewerType: 'child'
  assignment: HouseholdChoreChildAssignmentView
  timelinePreview: HouseholdChoreHistoryItem[]
}

export interface HouseholdChoreInviteCandidate {
  relationshipId: string
  label: string
}

export interface HouseholdChoreInviteCandidatePage {
  items: HouseholdChoreInviteCandidate[]
  hasMore: boolean
  nextCursor: { label: string; relationshipId: string } | null
}

export interface HouseholdChoreMutationData {
  resourceId: string
  version: string
  status: string
  circleId?: string
  participantId?: string
  definitionId?: string
  sourceAssignmentId?: string
  displayReference?: string
  membershipType?: HouseholdChoreMembershipType
  points?: number
  completionSequence?: string
  pointsDelta?: number
  reopenOutcome?: 'open' | 'cancelled'
  reopenReason?: 'undo_not_reopened' | 'cap_not_reopened' | null
  markerToken?: string
}
