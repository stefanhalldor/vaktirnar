import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import { HOUSEHOLD_CHORES_LEGACY_PATH } from './contracts'
import { householdChoreInvitationPath } from './paths'
import type {
  HouseholdChoreActionError,
  HouseholdChoreActionResult,
  HouseholdChoreAssignmentDetailView,
  HouseholdChoreAssignmentOrigin,
  HouseholdChoreAssignmentStatus,
  HouseholdChoreCircleView,
  HouseholdChoreDefinitionDetailView,
  HouseholdChoreHistoryItem,
  HouseholdChoreHistoryPage,
  HouseholdChoreInvitationConsentView,
  HouseholdChoreMembershipsView,
  HouseholdChoreMutationData,
  HouseholdChorePriorityDashboardView,
  HouseholdChoreRootView,
  HouseholdChoreSelfServiceView,
} from './contracts'
import {
  AssignHouseholdChoreSchema,
  CompleteHouseholdChoreDefinitionSchema,
  CancelHouseholdChoreInvitationSchema,
  ChangeHouseholdChoreMembershipTypeSchema,
  CreateHouseholdChoreCircleSchema,
  CreateHouseholdChoreDefinitionSchema,
  CreateHouseholdChoreInvitationSchema,
  CreateHouseholdChoreParticipantSchema,
  LinkHouseholdChoreParticipantSchema,
  DecideHouseholdChoreInvitationSchema,
  DeleteHouseholdChoreCircleSchema,
  HouseholdChoreAssignmentLifecycleSchema,
  HouseholdChoreDefinitionLifecycleSchema,
  HouseholdChoreParticipantLifecycleSchema,
  LeaveHouseholdChoreCircleSchema,
  RemoveHouseholdChoreMemberSchema,
  RenameHouseholdChoreCircleSchema,
  RenameHouseholdChoreParticipantSchema,
  RepeatHouseholdChoreAssignmentSchema,
  SelfAssignHouseholdChoreSchema,
  SetHouseholdChoreParticipantValueSchema,
  UpdateHouseholdChoreDefinitionSchema,
  type AssignHouseholdChoreInput,
  type CompleteHouseholdChoreDefinitionInput,
  type CancelHouseholdChoreInvitationInput,
  type ChangeHouseholdChoreMembershipTypeInput,
  type CreateHouseholdChoreCircleInput,
  type CreateHouseholdChoreDefinitionInput,
  type CreateHouseholdChoreInvitationInput,
  type CreateHouseholdChoreParticipantInput,
  type LinkHouseholdChoreParticipantInput,
  type DecideHouseholdChoreInvitationInput,
  type DeleteHouseholdChoreCircleInput,
  type HouseholdChoreAssignmentLifecycleInput,
  type HouseholdChoreDefinitionLifecycleInput,
  type HouseholdChoreParticipantLifecycleInput,
  type LeaveHouseholdChoreCircleInput,
  type RemoveHouseholdChoreMemberInput,
  type RenameHouseholdChoreCircleInput,
  type RenameHouseholdChoreParticipantInput,
  type RepeatHouseholdChoreAssignmentInput,
  type SelfAssignHouseholdChoreInput,
  type SetHouseholdChoreParticipantValueInput,
  type UpdateHouseholdChoreDefinitionInput,
} from './validation'

type RpcArguments = Record<string, unknown>

const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

const uuidSchema = z.string().regex(UUID_PATTERN)
const POSTGRES_BIGINT_MAX = '9223372036854775807'

function isPostgresBigint(value: string) {
  return value.length < POSTGRES_BIGINT_MAX.length
    || (value.length === POSTGRES_BIGINT_MAX.length && value <= POSTGRES_BIGINT_MAX)
}

const versionSchema = z.string().regex(/^[1-9]\d*$/).max(19).refine(isPostgresBigint)
const valueVersionSchema = z.string().regex(/^(?:0|[1-9]\d*)$/).max(19).refine(isPostgresBigint)
const timestampSchema = z.string().max(40).refine(
  value => TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value)),
)
const nonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const pointsSchema = z.number().int().min(1).max(100)
const membershipTypeSchema = z.enum(['member', 'child'])
const resourceStatusSchema = z.enum(['active', 'archived'])
const assignmentStatusSchema = z.enum(['open', 'completed', 'cancelled'])
const assignmentOriginSchema = z.enum([
  'member_assigned',
  'self_assigned',
  'member_repeated',
  'quick_completed',
])
const completionScopeSchema = z.enum(['global', 'per_participant'])
const cadenceDaysSchema = z.number().int().min(1).max(3650)
const stateTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)
const identityMarkerSchema = z.enum(['current', 'former_member'])
const displayReferenceSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/)

function boundedText(max: number) {
  return z.string().min(1).max(max)
    .refine(value => value.trim() === value)
    .refine(value => !FORBIDDEN_CONTROLS.test(value))
}

function nullableText(max: number) {
  return z.string().min(1).max(max)
    .refine(value => value.trim() === value)
    .refine(value => !FORBIDDEN_CONTROLS.test(value))
    .nullable()
}

const circleNameSchema = boundedText(120)
const definitionTitleSchema = boundedText(120)
const definitionDescriptionSchema = nullableText(2000)
const definitionMaterialsSchema = nullableText(4000)
const safeLabelSchema = boundedText(120).refine(value => !value.includes('@'))
const nullableSafeLabelSchema = safeLabelSchema.nullable()

const emptyObjectSchema = z.object({}).strict()
const readFailureCodeSchema = z.enum([
  'not_found',
  'not_allowed',
  'feature_unavailable',
  'deletion_pending',
  'conflict',
])
const readFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: readFailureCodeSchema,
  data: emptyObjectSchema,
}).strict()

const historyEventTypeSchema = z.enum([
  'created',
  'completed',
  'recompleted',
  'cancelled',
  'completion_reversed',
])
const actorKindSchema = z.enum(['member', 'participant', 'former_member', 'system'])
const historyItemSchema = z.object({
  event_id: uuidSchema,
  assignment_id: uuidSchema,
  title: definitionTitleSchema,
  event_type: historyEventTypeSchema,
  occurred_at: timestampSchema,
  participant_label: nullableSafeLabelSchema.optional(),
  participant_identity_marker: identityMarkerSchema,
  assignment_origin: assignmentOriginSchema,
  snapshot_points: pointsSchema,
  status_after: assignmentStatusSchema,
  actor_kind: actorKindSchema,
  actor_label: nullableSafeLabelSchema.optional(),
  completion_sequence: nonNegativeIntegerSchema.optional(),
  completed_at: timestampSchema.nullable().optional(),
  points_delta: z.number().int().min(-100).max(100).nullable().optional(),
  cancellation_reason: boundedText(80).nullable().optional(),
  reopen_outcome: z.enum(['open', 'cancelled']).nullable().optional(),
}).strict().superRefine((value, context) => {
  const participantLabel = value.participant_label ?? null
  if ((value.participant_identity_marker === 'current' && participantLabel === null)
    || (value.participant_identity_marker === 'former_member' && participantLabel !== null)) {
    context.addIssue({ code: 'custom', path: ['participant_label'], message: 'invalid' })
  }
  const actorLabel = value.actor_label ?? null
  if ((value.actor_kind === 'member' || value.actor_kind === 'participant')
    ? actorLabel === null
    : actorLabel !== null) {
    context.addIssue({ code: 'custom', path: ['actor_label'], message: 'invalid' })
  }
  const sequence = value.completion_sequence ?? null
  const completedAt = value.completed_at ?? null
  const delta = value.points_delta ?? null
  const cancellationReason = value.cancellation_reason ?? null
  const reopenOutcome = value.reopen_outcome ?? null
  if (value.event_type === 'created' && (
    value.status_after !== 'open' || sequence !== null || completedAt !== null
    || delta !== null || cancellationReason !== null || reopenOutcome !== null
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_created_event' })
  }
  if ((value.event_type === 'completed' || value.event_type === 'recompleted') && (
    value.status_after !== 'completed' || sequence === null || sequence < 1
    || completedAt !== value.occurred_at || delta !== value.snapshot_points
    || cancellationReason !== null || reopenOutcome !== null
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_completed_event' })
  }
  if (value.event_type === 'cancelled' && (
    value.status_after !== 'cancelled' || sequence !== null || completedAt !== null
    || delta !== null || cancellationReason === null || reopenOutcome !== null
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_cancelled_event' })
  }
  if (value.event_type === 'completion_reversed' && (
    sequence === null || sequence < 1 || completedAt !== null
    || delta !== -value.snapshot_points || cancellationReason !== null
    || reopenOutcome === null || value.status_after !== reopenOutcome
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_reversed_event' })
  }
})

type RawHistoryItem = z.infer<typeof historyItemSchema>

function mapHistoryItem(item: RawHistoryItem): HouseholdChoreHistoryItem {
  return {
    eventId: item.event_id,
    assignmentId: item.assignment_id,
    title: item.title,
    eventType: item.event_type,
    occurredAt: item.occurred_at,
    participantLabel: item.participant_label ?? null,
    participantIdentityMarker: item.participant_identity_marker,
    assignmentOrigin: item.assignment_origin,
    snapshotPoints: item.snapshot_points,
    statusAfter: item.status_after,
    actorKind: item.actor_kind,
    actorLabel: item.actor_label ?? null,
    // SQL intentionally omits this key for created/cancelled events. The
    // contract is expected to model that absence as null.
    completionSequence: item.completion_sequence ?? null,
    completedAt: item.completed_at ?? null,
    pointsDelta: item.points_delta ?? null,
    cancellationReason: item.cancellation_reason ?? null,
    reopenOutcome: item.reopen_outcome ?? null,
  }
}

const historyCursorSchema = z.object({
  occurred_at: timestampSchema,
  event_id: uuidSchema,
}).strict()
const historyPageSchema = z.object({
  items: z.array(historyItemSchema).max(50),
  has_more: z.boolean(),
  next_cursor: historyCursorSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({ code: 'custom', path: ['next_cursor'], message: 'invalid' })
    return
  }
  if (value.next_cursor) {
    const last = value.items.at(-1)
    if (!last || last.occurred_at !== value.next_cursor.occurred_at
      || last.event_id !== value.next_cursor.event_id) {
      context.addIssue({ code: 'custom', path: ['next_cursor'], message: 'invalid' })
    }
  }
})

function mapHistoryPage(value: z.infer<typeof historyPageSchema>): HouseholdChoreHistoryPage {
  return {
    items: value.items.map(mapHistoryItem),
    hasMore: value.has_more,
    nextCursor: value.next_cursor
      ? { occurredAt: value.next_cursor.occurred_at, eventId: value.next_cursor.event_id }
      : null,
  }
}

const rootCircleSchema = z.object({
  circle_id: uuidSchema,
  name: circleNameSchema,
  display_reference: displayReferenceSchema,
  membership_type: membershipTypeSchema,
  open_count: nonNegativeIntegerSchema.max(500),
}).strict()
const rootInvitationShape = {
  invitation_id: uuidSchema,
  circle_name: circleNameSchema,
  display_reference: displayReferenceSchema,
  inviter_label: safeLabelSchema,
  requested_type: membershipTypeSchema,
  version: versionSchema,
  expires_at: timestampSchema,
  href: z.string(),
}
const rootInvitationSchema = z.object(rootInvitationShape).strict().superRefine((value, context) => {
  if (value.href !== `${HOUSEHOLD_CHORES_LEGACY_PATH}/bod/${value.invitation_id}`) {
    context.addIssue({ code: 'custom', path: ['href'], message: 'invalid' })
  }
})
const rootDataSchema = z.object({
  circles: z.array(rootCircleSchema).max(20),
  pending_invitations: z.array(rootInvitationSchema).max(20),
}).strict()

const invitationPreviewSchema = z.object({
  invitation_id: uuidSchema,
  circle_name: circleNameSchema,
  display_reference: displayReferenceSchema,
  inviter_label: safeLabelSchema,
  requested_type: membershipTypeSchema,
  version: versionSchema,
  expires_at: timestampSchema,
  accept_available: z.boolean(),
}).strict()

const membershipSchema = z.object({
  circle_id: uuidSchema,
  circle_name: circleNameSchema,
  display_reference: displayReferenceSchema,
  membership_type: membershipTypeSchema,
  membership_status: z.literal('active'),
  circle_version: versionSchema,
  membership_version: versionSchema,
  can_leave: z.boolean(),
  can_delete_circle: z.boolean(),
}).strict().superRefine((value, context) => {
  const validCapabilities = value.membership_type === 'child'
    ? value.can_leave && !value.can_delete_circle
    : value.can_leave !== value.can_delete_circle
  if (!validCapabilities) {
    context.addIssue({ code: 'custom', message: 'invalid_membership_capability' })
  }
})
const membershipInvitationSchema = z.object({
  ...rootInvitationShape,
  accept_available: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.href !== `${HOUSEHOLD_CHORES_LEGACY_PATH}/bod/${value.invitation_id}`) {
    context.addIssue({ code: 'custom', path: ['href'], message: 'invalid' })
  }
})
const membershipsDataSchema = z.object({
  memberships: z.array(membershipSchema).max(20),
  pending_invitations: z.array(membershipInvitationSchema).max(20),
}).strict()

const safeParticipantSchema = z.object({
  participant_id: uuidSchema,
  label: safeLabelSchema,
}).strict()
const managedParticipantSchema = z.object({
  participant_id: uuidSchema,
  label: nullableSafeLabelSchema,
  identity_marker: identityMarkerSchema,
  status: resourceStatusSchema,
  version: versionSchema,
}).strict().superRefine((value, context) => {
  if ((value.identity_marker === 'current' && value.label === null)
    || (value.identity_marker === 'former_member' && value.label !== null)) {
    context.addIssue({ code: 'custom', path: ['label'], message: 'invalid' })
  }
})
const safeDefinitionSchema = z.object({
  definition_id: uuidSchema,
  title: definitionTitleSchema,
  description: definitionDescriptionSchema.optional(),
  materials: definitionMaterialsSchema.optional(),
}).strict()
const managedDefinitionSchema = safeDefinitionSchema.extend({
  status: resourceStatusSchema,
  version: versionSchema,
}).strict()
const safeOpenAssignmentSchema = z.object({
  assignment_id: uuidSchema,
  title: definitionTitleSchema,
  participant_label: safeLabelSchema,
  points: pointsSchema,
  version: versionSchema.nullable().optional(),
  can_complete: z.boolean(),
  can_cancel: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.can_complete !== value.can_cancel
    || (value.can_complete && value.version == null)
    || (!value.can_complete && value.version != null)) {
    context.addIssue({ code: 'custom', message: 'invalid_child_capability' })
  }
})
const managedOpenAssignmentSchema = z.object({
  assignment_id: uuidSchema,
  definition_id: uuidSchema,
  title: definitionTitleSchema,
  description: definitionDescriptionSchema.optional(),
  materials: definitionMaterialsSchema.optional(),
  participant_id: uuidSchema,
  participant_label: nullableSafeLabelSchema.optional(),
  participant_identity_marker: identityMarkerSchema,
  points: pointsSchema,
  origin: assignmentOriginSchema,
  status: z.literal('open'),
  version: versionSchema,
  created_at: timestampSchema,
  can_complete: z.literal(true),
  can_cancel: z.literal(true),
}).strict().superRefine((value, context) => {
  const label = value.participant_label ?? null
  if ((value.participant_identity_marker === 'current' && label === null)
    || (value.participant_identity_marker === 'former_member' && label !== null)) {
    context.addIssue({ code: 'custom', path: ['participant_label'], message: 'invalid' })
  }
})
const safePointTotalSchema = z.object({
  participant_id: uuidSchema,
  label: safeLabelSchema,
  points: nonNegativeIntegerSchema,
}).strict()
const managedPointTotalSchema = z.object({
  participant_id: uuidSchema,
  label: nullableSafeLabelSchema,
  points: nonNegativeIntegerSchema,
  identity_marker: identityMarkerSchema,
}).strict().superRefine((value, context) => {
  if ((value.identity_marker === 'current' && value.label === null)
    || (value.identity_marker === 'former_member' && value.label !== null)) {
    context.addIssue({ code: 'custom', path: ['label'], message: 'invalid' })
  }
})
const managedMembershipSchema = z.object({
  membership_id: uuidSchema,
  participant_id: uuidSchema,
  label: nullableSafeLabelSchema,
  identity_marker: identityMarkerSchema,
  membership_type: membershipTypeSchema,
  status: z.literal('active'),
  version: versionSchema,
  is_viewer: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.identity_marker === 'current' && value.label === null)
    || (value.identity_marker === 'former_member' && value.label !== null)) {
    context.addIssue({ code: 'custom', path: ['label'], message: 'invalid' })
  }
})
const managedPendingInvitationSchema = z.object({
  invitation_id: uuidSchema,
  invitee_label: safeLabelSchema,
  requested_type: membershipTypeSchema,
  version: versionSchema,
  expires_at: timestampSchema,
}).strict()
const participantIdentityLinkSchema = z.object({
  invitation_id: uuidSchema,
  participant_id: uuidSchema,
}).strict()
const participantIdentityLinksDataSchema = z.object({
  links: z.array(participantIdentityLinkSchema).max(20),
}).strict()
const memberCircleDataSchema = z.object({
  viewer_type: z.literal('member'),
  circle: z.object({
    circle_id: uuidSchema,
    name: circleNameSchema,
    display_reference: displayReferenceSchema,
    version: versionSchema,
    member_count: nonNegativeIntegerSchema.max(20),
  }).strict(),
  participants: z.array(managedParticipantSchema).max(100),
  definitions: z.array(managedDefinitionSchema).max(200),
  open_assignments: z.array(managedOpenAssignmentSchema).max(500),
  recent_assignments: z.array(historyItemSchema).max(50),
  point_totals: z.array(managedPointTotalSchema).max(100),
  memberships: z.array(managedMembershipSchema).max(20),
  pending_invitations: z.array(managedPendingInvitationSchema).max(20),
}).strict().superRefine((value, context) => {
  const viewerMemberships = value.memberships.filter(item => item.is_viewer)
  if (viewerMemberships.length !== 1
    || viewerMemberships[0]?.membership_type !== 'member') {
    context.addIssue({ code: 'custom', path: ['memberships'], message: 'invalid_viewer' })
  }
})
const childCircleDataSchema = z.object({
  viewer_type: z.literal('child'),
  circle: z.object({
    name: circleNameSchema,
    display_reference: displayReferenceSchema,
  }).strict(),
  own_participant_id: uuidSchema,
  participants: z.array(safeParticipantSchema).max(100),
  definitions: z.array(safeDefinitionSchema).max(200),
  open_assignments: z.array(safeOpenAssignmentSchema).max(500),
  recent_assignments: z.array(historyItemSchema).max(50),
  point_totals: z.array(safePointTotalSchema).max(100),
}).strict()

const definitionDetailSchema = z.object({
  definition: z.object({
    definition_id: uuidSchema,
    title: definitionTitleSchema,
    description: definitionDescriptionSchema.optional(),
    materials: definitionMaterialsSchema.optional(),
    status: resourceStatusSchema,
    version: versionSchema,
    cadence_days: cadenceDaysSchema.nullable().optional(),
    completion_scope: completionScopeSchema,
  }).strict(),
  participant_values: z.array(z.object({
    participant_id: uuidSchema,
    label: nullableSafeLabelSchema,
    identity_marker: identityMarkerSchema,
    participant_status: resourceStatusSchema,
    participant_version: versionSchema,
    value_status: z.enum(['missing', 'active', 'inactive']),
    value_version: valueVersionSchema,
    points: pointsSchema.nullable(),
  }).strict().superRefine((value, context) => {
    if ((value.identity_marker === 'current' && value.label === null)
      || (value.identity_marker === 'former_member' && value.label !== null)) {
      context.addIssue({ code: 'custom', path: ['label'], message: 'invalid' })
    }
    if (value.value_status === 'missing'
      ? (value.value_version !== '0' || value.points !== null)
      : (value.value_version === '0' || value.points === null)) {
      context.addIssue({ code: 'custom', message: 'invalid_value_state' })
    }
  })).max(100),
}).strict()

const priorityOpenAssignmentSchema = z.object({
  assignment_id: uuidSchema,
  participant_id: uuidSchema,
  participant_label: safeLabelSchema,
  version: versionSchema,
  created_at: timestampSchema,
}).strict()

const memberPriorityStateSchema = z.object({
  participant_id: uuidSchema,
  label: safeLabelSchema,
  identity_marker: identityMarkerSchema,
  points: pointsSchema,
  value_version: versionSchema,
  baseline_at: timestampSchema,
  due_at: timestampSchema.optional(),
  latest_completion_id: uuidSchema.optional(),
  latest_completed_at: timestampSchema.optional(),
  oldest_open_assignment_id: uuidSchema.optional(),
  oldest_open_assignment_version: versionSchema.optional(),
  expected_state_token: stateTokenSchema,
}).strict().superRefine((value, context) => {
  if ((value.oldest_open_assignment_id === undefined)
    !== (value.oldest_open_assignment_version === undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_open_assignment_state' })
  }
})

const childPriorityStateSchema = z.object({
  participant_id: uuidSchema,
  label: safeLabelSchema,
  points: pointsSchema,
  baseline_at: timestampSchema,
  due_at: timestampSchema.optional(),
  latest_completed_at: timestampSchema.optional(),
  oldest_open_assignment_id: uuidSchema.optional(),
  oldest_open_assignment_version: versionSchema.optional(),
  expected_state_token: stateTokenSchema,
}).strict().superRefine((value, context) => {
  if ((value.oldest_open_assignment_id === undefined)
    !== (value.oldest_open_assignment_version === undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_open_assignment_state' })
  }
})

const memberPriorityDefinitionSchema = z.object({
  definition_id: uuidSchema,
  title: definitionTitleSchema,
  description: definitionDescriptionSchema.optional(),
  materials: definitionMaterialsSchema.optional(),
  version: versionSchema,
  cadence_days: cadenceDaysSchema.optional(),
  completion_scope: completionScopeSchema,
  priority_due_at: timestampSchema.optional(),
  participant_states: z.array(memberPriorityStateSchema).max(100),
  open_assignments: z.array(priorityOpenAssignmentSchema).max(20),
  open_assignment_count: nonNegativeIntegerSchema.max(500),
}).strict()

const childPriorityDefinitionSchema = z.object({
  definition_id: uuidSchema,
  title: definitionTitleSchema,
  description: definitionDescriptionSchema.optional(),
  materials: definitionMaterialsSchema.optional(),
  cadence_days: cadenceDaysSchema.optional(),
  completion_scope: completionScopeSchema,
  own_state: childPriorityStateSchema,
}).strict()

const priorityDashboardMemberSchema = z.object({
  viewer_type: z.literal('member'),
  own_participant_id: uuidSchema,
  participants: z.array(z.object({
    participant_id: uuidSchema,
    label: safeLabelSchema,
    identity_marker: identityMarkerSchema,
    is_viewer: z.boolean(),
  }).strict()).max(100),
  definitions: z.array(memberPriorityDefinitionSchema).max(200),
}).strict().superRefine((value, context) => {
  if (value.participants.filter(item => item.is_viewer).length !== 1
    || !value.participants.some(item => item.participant_id === value.own_participant_id)) {
    context.addIssue({ code: 'custom', message: 'invalid_priority_viewer' })
  }
})

const priorityDashboardChildSchema = z.object({
  viewer_type: z.literal('child'),
  own_participant_id: uuidSchema,
  definitions: z.array(childPriorityDefinitionSchema).max(200),
}).strict().superRefine((value, context) => {
  if (value.definitions.some(
    item => item.own_state.participant_id !== value.own_participant_id,
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_child_priority_owner' })
  }
})

const selfServiceSchema = z.object({
  circle_id: uuidSchema,
  participant_id: uuidSchema,
  items: z.array(z.object({
    definition_id: uuidSchema,
    title: definitionTitleSchema,
    description: definitionDescriptionSchema.optional(),
    materials: definitionMaterialsSchema.optional(),
    definition_version: versionSchema,
    participant_value_version: versionSchema,
    points: pointsSchema,
    own_open_count: nonNegativeIntegerSchema.max(500),
  }).strict()).max(200),
}).strict()

const safeAssignmentShape = {
  assignment_id: uuidSchema,
  title: definitionTitleSchema,
  description: definitionDescriptionSchema,
  materials: definitionMaterialsSchema,
  participant_label: nullableSafeLabelSchema,
  participant_identity_marker: identityMarkerSchema,
  points: pointsSchema,
  origin: assignmentOriginSchema,
  status: assignmentStatusSchema,
  created_at: timestampSchema,
  completed_at: timestampSchema.nullable(),
  cancelled_at: timestampSchema.nullable(),
}

function refineAssignmentState(value: {
  participant_identity_marker: 'current' | 'former_member'
  participant_label: string | null
  status: 'open' | 'completed' | 'cancelled'
  completed_at: string | null
  cancelled_at: string | null
}, context: z.RefinementCtx) {
  if ((value.participant_identity_marker === 'current' && value.participant_label === null)
    || (value.participant_identity_marker === 'former_member' && value.participant_label !== null)) {
    context.addIssue({ code: 'custom', path: ['participant_label'], message: 'invalid' })
  }
  if ((value.status === 'open' && (value.completed_at !== null || value.cancelled_at !== null))
    || (value.status === 'completed' && (value.completed_at === null || value.cancelled_at !== null))
    || (value.status === 'cancelled' && (value.completed_at !== null || value.cancelled_at === null))) {
    context.addIssue({ code: 'custom', message: 'invalid_assignment_state' })
  }
}

const memberAssignmentSchema = z.object({
  ...safeAssignmentShape,
  circle_id: uuidSchema,
  definition_id: uuidSchema,
  participant_id: uuidSchema,
  completion_sequence: nonNegativeIntegerSchema,
  version: versionSchema,
}).strict().superRefine(refineAssignmentState)

const childAssignmentSchema = z.object({
  ...safeAssignmentShape,
  own_assignment: z.boolean(),
  version: versionSchema.nullable(),
  can_complete: z.boolean(),
  can_cancel: z.boolean(),
}).strict().superRefine((value, context) => {
  refineAssignmentState(value, context)
  const ownOpen = value.own_assignment && value.status === 'open'
  if (value.can_complete !== ownOpen
    || value.can_cancel !== ownOpen
    || (ownOpen ? value.version === null : value.version !== null)) {
    context.addIssue({ code: 'custom', message: 'invalid_child_assignment_capabilities' })
  }
})

const memberAssignmentDetailSchema = z.object({
  viewer_type: z.literal('member'),
  assignment: memberAssignmentSchema,
  timeline_preview: z.array(historyItemSchema).max(20),
}).strict()

const childAssignmentDetailSchema = z.object({
  viewer_type: z.literal('child'),
  assignment: childAssignmentSchema,
  timeline_preview: z.array(historyItemSchema).max(20),
}).strict()

const assignmentDetailSchema = z.discriminatedUnion('viewer_type', [
  memberAssignmentDetailSchema,
  childAssignmentDetailSchema,
])

const readSuccessOuterSchema = z.object({
  ok: z.literal(true),
  code: z.string().min(1).max(80),
  data: z.unknown(),
}).strict()

function mapRepositoryCode(code: z.infer<typeof readFailureCodeSchema>): HouseholdChoreActionError {
  if (code === 'feature_unavailable' || code === 'deletion_pending') return 'feature_disabled'
  return code
}

export class HouseholdChoreRepositoryError extends Error {
  readonly code: HouseholdChoreActionError

  constructor(code: HouseholdChoreActionError) {
    super('household_chore_repository_error')
    this.name = 'HouseholdChoreRepositoryError'
    this.code = code
  }
}

function validUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success
}

async function getRpcResult(name: string, args: RpcArguments): Promise<unknown> {
  try {
    const { data, error } = await getAdmin().rpc(name, args)
    if (error) {
      console.error('[household-chores] repository request failed')
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    return data
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError) throw error
    console.error('[household-chores] repository request failed')
    throw new HouseholdChoreRepositoryError('save_failed')
  }
}

function parseReadEnvelope<T>(
  raw: unknown,
  successCode: string,
  dataSchema: z.ZodType<T>,
): T {
  const outer = readSuccessOuterSchema.safeParse(raw)
  if (outer.success) {
    if (outer.data.code !== successCode) {
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    const parsed = dataSchema.safeParse(outer.data.data)
    if (!parsed.success) throw new HouseholdChoreRepositoryError('save_failed')
    return parsed.data
  }
  const failure = readFailureEnvelopeSchema.safeParse(raw)
  if (failure.success) throw new HouseholdChoreRepositoryError(mapRepositoryCode(failure.data.code))
  throw new HouseholdChoreRepositoryError('save_failed')
}

async function loadRead<T>(
  rpcName: string,
  args: RpcArguments,
  successCode: string,
  dataSchema: z.ZodType<T>,
): Promise<T> {
  const raw = await getRpcResult(rpcName, args)
  try {
    return parseReadEnvelope(raw, successCode, dataSchema)
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError && error.code !== 'save_failed') throw error
    console.error('[household-chores] repository response rejected')
    throw new HouseholdChoreRepositoryError('save_failed')
  }
}

function requireUuid(value: string): void {
  if (!validUuid(value)) throw new HouseholdChoreRepositoryError('invalid_input')
}

export async function loadHouseholdChoreRoot(actorUserId: string): Promise<HouseholdChoreRootView> {
  requireUuid(actorUserId)
  const value = await loadRead(
    'household_chore_get_root',
    { p_actor_id: actorUserId },
    'get_root_loaded',
    rootDataSchema,
  )
  return {
    circles: value.circles.map(circle => ({
      circleId: circle.circle_id,
      name: circle.name,
      displayReference: circle.display_reference,
      viewerType: circle.membership_type,
      openAssignmentCount: circle.open_count,
    })),
    pendingInvitations: value.pending_invitations.map(invitation => ({
      invitationId: invitation.invitation_id,
      circleName: invitation.circle_name,
      displayReference: invitation.display_reference,
      inviterLabel: invitation.inviter_label,
      requestedType: invitation.requested_type,
      version: invitation.version,
      expiresAt: invitation.expires_at,
      href: householdChoreInvitationPath(invitation.invitation_id),
    })),
  }
}

export async function loadHouseholdChoreInvitationPreview(
  actorUserId: string,
  invitationId: string,
): Promise<HouseholdChoreInvitationConsentView> {
  requireUuid(actorUserId)
  requireUuid(invitationId)
  const value = await loadRead(
    'household_chore_get_invitation_preview',
    { p_actor_id: actorUserId, p_invitation_id: invitationId },
    'get_invitation_preview_loaded',
    invitationPreviewSchema,
  )
  return {
    invitationId: value.invitation_id,
    circleName: value.circle_name,
    displayReference: value.display_reference,
    inviterLabel: value.inviter_label,
    requestedType: value.requested_type,
    version: value.version,
    expiresAt: value.expires_at,
    acceptAvailable: value.accept_available,
  }
}

export async function loadHouseholdChoreMemberships(
  actorUserId: string,
): Promise<HouseholdChoreMembershipsView> {
  requireUuid(actorUserId)
  const value = await loadRead(
    'household_chore_get_memberships',
    { p_actor_id: actorUserId },
    'get_memberships_loaded',
    membershipsDataSchema,
  )
  return {
    memberships: value.memberships.map(item => ({
      circleId: item.circle_id,
      circleName: item.circle_name,
      displayReference: item.display_reference,
      membershipType: item.membership_type,
      membershipStatus: item.membership_status,
      circleVersion: item.circle_version,
      membershipVersion: item.membership_version,
      canLeave: item.can_leave,
      canDeleteCircle: item.can_delete_circle,
    })),
    pendingInvitations: value.pending_invitations.map(invitation => ({
      invitationId: invitation.invitation_id,
      circleName: invitation.circle_name,
      displayReference: invitation.display_reference,
      inviterLabel: invitation.inviter_label,
      requestedType: invitation.requested_type,
      version: invitation.version,
      expiresAt: invitation.expires_at,
      href: householdChoreInvitationPath(invitation.invitation_id),
      acceptAvailable: invitation.accept_available,
    })),
  }
}

function mapMemberCircle(
  value: z.infer<typeof memberCircleDataSchema>,
  identityLinks: z.infer<typeof participantIdentityLinksDataSchema>['links'] = [],
): HouseholdChoreCircleView {
  const participantByInvitation = new Map(
    identityLinks.map((item) => [item.invitation_id, item.participant_id]),
  )
  return {
    viewerType: 'member',
    circle: {
      circleId: value.circle.circle_id,
      name: value.circle.name,
      displayReference: value.circle.display_reference,
      version: value.circle.version,
      memberCount: value.circle.member_count,
    },
    participants: value.participants.map(item => ({
      participantId: item.participant_id,
      label: item.label,
      identityMarker: item.identity_marker,
      status: item.status,
      version: item.version,
    })),
    definitions: value.definitions.map(item => ({
      definitionId: item.definition_id,
      title: item.title,
      description: item.description ?? null,
      materials: item.materials ?? null,
      status: item.status,
      version: item.version,
    })),
    openAssignments: value.open_assignments.map(item => ({
      assignmentId: item.assignment_id,
      definitionId: item.definition_id,
      title: item.title,
      description: item.description ?? null,
      materials: item.materials ?? null,
      participantId: item.participant_id,
      participantLabel: item.participant_label ?? null,
      participantIdentityMarker: item.participant_identity_marker,
      points: item.points,
      origin: item.origin,
      status: item.status,
      version: item.version,
      createdAt: item.created_at,
      canComplete: item.can_complete,
      canCancel: item.can_cancel,
    })),
    recentAssignments: value.recent_assignments.map(mapHistoryItem),
    pointTotals: value.point_totals.map(item => ({
      participantId: item.participant_id,
      label: item.label,
      identityMarker: item.identity_marker,
      points: item.points,
    })),
    memberships: value.memberships.map(item => ({
      membershipId: item.membership_id,
      participantId: item.participant_id,
      label: item.label,
      identityMarker: item.identity_marker,
      membershipType: item.membership_type,
      status: item.status,
      version: item.version,
      isViewer: item.is_viewer,
    })),
    pendingInvitations: value.pending_invitations.map(item => ({
      invitationId: item.invitation_id,
      inviteeLabel: item.invitee_label,
      requestedType: item.requested_type,
      version: item.version,
      expiresAt: item.expires_at,
      participantId: participantByInvitation.get(item.invitation_id) ?? null,
    })),
  }
}

function mapChildCircle(value: z.infer<typeof childCircleDataSchema>): HouseholdChoreCircleView {
  return {
    viewerType: 'child',
    circle: {
      name: value.circle.name,
      displayReference: value.circle.display_reference,
    },
    ownParticipantId: value.own_participant_id,
    participants: value.participants.map(item => ({
      participantId: item.participant_id,
      label: item.label,
    })),
    definitions: value.definitions.map(item => ({
      definitionId: item.definition_id,
      title: item.title,
      description: item.description ?? null,
      materials: item.materials ?? null,
    })),
    openAssignments: value.open_assignments.map(item => ({
      assignmentId: item.assignment_id,
      title: item.title,
      participantLabel: item.participant_label ?? null,
      points: item.points,
      version: item.version ?? null,
      canComplete: item.can_complete,
      canCancel: item.can_cancel,
    })),
    recentAssignments: value.recent_assignments.map(mapHistoryItem),
    pointTotals: value.point_totals.map(item => ({
      participantId: item.participant_id,
      label: item.label,
      points: item.points,
    })),
  }
}

export async function loadHouseholdChoreCircle(
  actorUserId: string,
  circleId: string,
): Promise<HouseholdChoreCircleView> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  const raw = await getRpcResult('household_chore_get_circle', {
    p_actor_id: actorUserId,
    p_circle_id: circleId,
  })
  try {
    const outer = readSuccessOuterSchema.safeParse(raw)
    if (!outer.success) {
      const failure = readFailureEnvelopeSchema.safeParse(raw)
      if (failure.success) {
        throw new HouseholdChoreRepositoryError(mapRepositoryCode(failure.data.code))
      }
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    if (outer.data.code !== 'get_circle_loaded'
      || !outer.data.data || typeof outer.data.data !== 'object'
      || Array.isArray(outer.data.data)) {
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    const viewerType = (outer.data.data as Record<string, unknown>).viewer_type
    if (viewerType === 'member') {
      const member = memberCircleDataSchema.safeParse(outer.data.data)
      if (!member.success) throw new HouseholdChoreRepositoryError('save_failed')
      const links = await loadRead(
        'household_chore_get_participant_identity_links',
        { p_actor_id: actorUserId, p_circle_id: circleId },
        'participant_identity_links_loaded',
        participantIdentityLinksDataSchema,
      )
      return mapMemberCircle(member.data, links.links)
    }
    if (viewerType === 'child') {
      // The child branch is parsed directly against its safe schema. It is
      // never parsed as or projected through the full-member shape.
      const child = childCircleDataSchema.safeParse(outer.data.data)
      if (!child.success) throw new HouseholdChoreRepositoryError('save_failed')
      return mapChildCircle(child.data)
    }
    throw new HouseholdChoreRepositoryError('save_failed')
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError && error.code !== 'save_failed') throw error
    console.error('[household-chores] repository response rejected')
    throw new HouseholdChoreRepositoryError('save_failed')
  }
}

function mapPriorityState(value: {
  participant_id: string
  label: string
  identity_marker?: 'current' | 'former_member'
  points: number
  value_version?: string
  baseline_at: string
  due_at?: string
  latest_completion_id?: string
  latest_completed_at?: string
  oldest_open_assignment_id?: string
  oldest_open_assignment_version?: string
  expected_state_token: string
}) {
  return {
    participantId: value.participant_id,
    label: value.label,
    ...(value.identity_marker ? { identityMarker: value.identity_marker } : {}),
    points: value.points,
    ...(value.value_version ? { valueVersion: value.value_version } : {}),
    baselineAt: value.baseline_at,
    dueAt: value.due_at ?? null,
    latestCompletionId: value.latest_completion_id ?? null,
    latestCompletedAt: value.latest_completed_at ?? null,
    oldestOpenAssignmentId: value.oldest_open_assignment_id ?? null,
    oldestOpenAssignmentVersion: value.oldest_open_assignment_version ?? null,
    expectedStateToken: value.expected_state_token,
  }
}

export async function loadHouseholdChorePriorityDashboard(
  actorUserId: string,
  circleId: string,
): Promise<HouseholdChorePriorityDashboardView> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  const raw = await getRpcResult('household_chore_get_priority_dashboard', {
    p_actor_id: actorUserId,
    p_circle_id: circleId,
  })
  try {
    const outer = readSuccessOuterSchema.safeParse(raw)
    if (!outer.success) {
      const failure = readFailureEnvelopeSchema.safeParse(raw)
      if (failure.success) {
        throw new HouseholdChoreRepositoryError(mapRepositoryCode(failure.data.code))
      }
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    if (outer.data.code !== 'get_priority_dashboard_loaded'
      || !outer.data.data || typeof outer.data.data !== 'object'
      || Array.isArray(outer.data.data)) {
      throw new HouseholdChoreRepositoryError('save_failed')
    }
    const viewerType = (outer.data.data as Record<string, unknown>).viewer_type
    if (viewerType === 'member') {
      const parsed = priorityDashboardMemberSchema.safeParse(outer.data.data)
      if (!parsed.success) throw new HouseholdChoreRepositoryError('save_failed')
      return {
        viewerType: 'member',
        ownParticipantId: parsed.data.own_participant_id,
        participants: parsed.data.participants.map(item => ({
          participantId: item.participant_id,
          label: item.label,
          identityMarker: item.identity_marker,
          isViewer: item.is_viewer,
        })),
        definitions: parsed.data.definitions.map(item => ({
          definitionId: item.definition_id,
          title: item.title,
          description: item.description ?? null,
          materials: item.materials ?? null,
          version: item.version,
          cadenceDays: item.cadence_days ?? null,
          completionScope: item.completion_scope,
          priorityDueAt: item.priority_due_at ?? null,
          participantStates: item.participant_states.map(mapPriorityState),
          openAssignments: item.open_assignments.map(open => ({
            assignmentId: open.assignment_id,
            participantId: open.participant_id,
            participantLabel: open.participant_label,
            version: open.version,
            createdAt: open.created_at,
          })),
          openAssignmentCount: item.open_assignment_count,
        })),
      }
    }
    if (viewerType === 'child') {
      const parsed = priorityDashboardChildSchema.safeParse(outer.data.data)
      if (!parsed.success) throw new HouseholdChoreRepositoryError('save_failed')
      return {
        viewerType: 'child',
        ownParticipantId: parsed.data.own_participant_id,
        definitions: parsed.data.definitions.map(item => {
          const ownState = mapPriorityState(item.own_state)
          return {
            definitionId: item.definition_id,
            title: item.title,
            description: item.description ?? null,
            materials: item.materials ?? null,
            cadenceDays: item.cadence_days ?? null,
            completionScope: item.completion_scope,
            priorityDueAt: ownState.dueAt,
            ownState,
          }
        }),
      }
    }
    throw new HouseholdChoreRepositoryError('save_failed')
  } catch (error) {
    if (error instanceof HouseholdChoreRepositoryError && error.code !== 'save_failed') throw error
    console.error('[household-chores] priority response rejected')
    throw new HouseholdChoreRepositoryError('save_failed')
  }
}

export async function loadHouseholdChoreDefinitionDetail(
  actorUserId: string,
  circleId: string,
  definitionId: string,
): Promise<HouseholdChoreDefinitionDetailView> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  requireUuid(definitionId)
  const value = await loadRead(
    'household_chore_get_definition_detail_v2',
    { p_actor_id: actorUserId, p_circle_id: circleId, p_definition_id: definitionId },
    'get_definition_detail_v2_loaded',
    definitionDetailSchema,
  )
  return {
    definition: {
      definitionId: value.definition.definition_id,
      title: value.definition.title,
      description: value.definition.description ?? null,
      materials: value.definition.materials ?? null,
      status: value.definition.status,
      version: value.definition.version,
      cadenceDays: value.definition.cadence_days ?? null,
      completionScope: value.definition.completion_scope,
    },
    participantValues: value.participant_values.map(item => ({
      participantId: item.participant_id,
      label: item.label,
      identityMarker: item.identity_marker,
      participantStatus: item.participant_status,
      participantVersion: item.participant_version,
      valueStatus: item.value_status,
      valueVersion: item.value_version,
      points: item.points,
    })),
  }
}

export async function loadHouseholdChoreSelfService(
  actorUserId: string,
  circleId: string,
): Promise<HouseholdChoreSelfServiceView> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  const value = await loadRead(
    'household_chore_get_self_service',
    { p_actor_id: actorUserId, p_circle_id: circleId },
    'get_self_service_loaded',
    selfServiceSchema,
  )
  return {
    circleId: value.circle_id,
    participantId: value.participant_id,
    items: value.items.map(item => ({
      definitionId: item.definition_id,
      title: item.title,
      description: item.description ?? null,
      materials: item.materials ?? null,
      definitionVersion: item.definition_version,
      participantValueVersion: item.participant_value_version,
      points: item.points,
      ownOpenCount: item.own_open_count,
    })),
  }
}

export interface HouseholdChoreHistoryOptions {
  cursor?: { occurredAt: string; eventId: string } | null
  limit?: number
}

function parseHistoryOptions(options: HouseholdChoreHistoryOptions = {}) {
  const schema = z.object({
    cursor: z.object({
      occurredAt: timestampSchema,
      eventId: uuidSchema,
    }).strict().nullable().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).strict()
  const parsed = schema.safeParse(options)
  if (!parsed.success) throw new HouseholdChoreRepositoryError('invalid_input')
  return { cursor: parsed.data.cursor ?? null, limit: parsed.data.limit ?? 20 }
}

async function loadHistory(
  rpcName: 'household_chore_get_definition_history' | 'household_chore_get_assignment_timeline',
  successCode: 'get_definition_history_loaded' | 'get_assignment_timeline_loaded',
  actorUserId: string,
  circleId: string,
  resourceKey: 'p_definition_id' | 'p_assignment_id',
  resourceId: string,
  options: HouseholdChoreHistoryOptions,
): Promise<HouseholdChoreHistoryPage> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  requireUuid(resourceId)
  const page = parseHistoryOptions(options)
  const value = await loadRead(
    rpcName,
    {
      p_actor_id: actorUserId,
      p_circle_id: circleId,
      [resourceKey]: resourceId,
      p_cursor_at: page.cursor?.occurredAt ?? null,
      p_cursor_id: page.cursor?.eventId ?? null,
      p_limit: page.limit,
    },
    successCode,
    historyPageSchema,
  )
  return mapHistoryPage(value)
}

export function loadHouseholdChoreDefinitionHistory(
  actorUserId: string,
  circleId: string,
  definitionId: string,
  options: HouseholdChoreHistoryOptions = {},
): Promise<HouseholdChoreHistoryPage> {
  return loadHistory(
    'household_chore_get_definition_history',
    'get_definition_history_loaded',
    actorUserId,
    circleId,
    'p_definition_id',
    definitionId,
    options,
  )
}

export function loadHouseholdChoreAssignmentTimeline(
  actorUserId: string,
  circleId: string,
  assignmentId: string,
  options: HouseholdChoreHistoryOptions = {},
): Promise<HouseholdChoreHistoryPage> {
  return loadHistory(
    'household_chore_get_assignment_timeline',
    'get_assignment_timeline_loaded',
    actorUserId,
    circleId,
    'p_assignment_id',
    assignmentId,
    options,
  )
}

export async function loadHouseholdChoreAssignment(
  actorUserId: string,
  circleId: string,
  assignmentId: string,
): Promise<HouseholdChoreAssignmentDetailView> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  requireUuid(assignmentId)
  const value = await loadRead(
    'household_chore_get_assignment',
    { p_actor_id: actorUserId, p_circle_id: circleId, p_assignment_id: assignmentId },
    'get_assignment_loaded',
    assignmentDetailSchema,
  )
  const common = {
    assignmentId: value.assignment.assignment_id,
    title: value.assignment.title,
    description: value.assignment.description,
    materials: value.assignment.materials,
    participantLabel: value.assignment.participant_label,
    participantIdentityMarker: value.assignment.participant_identity_marker,
    points: value.assignment.points,
    origin: value.assignment.origin as HouseholdChoreAssignmentOrigin,
    status: value.assignment.status as HouseholdChoreAssignmentStatus,
    createdAt: value.assignment.created_at,
    completedAt: value.assignment.completed_at,
    cancelledAt: value.assignment.cancelled_at,
  }
  const timelinePreview = value.timeline_preview.map(mapHistoryItem)

  if (value.viewer_type === 'member') {
    return {
      viewerType: 'member',
      assignment: {
        ...common,
        circleId: value.assignment.circle_id,
        definitionId: value.assignment.definition_id,
        participantId: value.assignment.participant_id,
        completionSequence: value.assignment.completion_sequence,
        version: value.assignment.version,
      },
      timelinePreview,
    }
  }

  return {
    viewerType: 'child',
    assignment: {
      ...common,
      ownAssignment: value.assignment.own_assignment,
      version: value.assignment.version,
      canComplete: value.assignment.can_complete,
      canCancel: value.assignment.can_cancel,
    },
    timelinePreview,
  }
}

const mutationFailureCodeSchema = z.enum([
  'not_found',
  'not_allowed',
  'not_available',
  'stale_version',
  'stale_value',
  'terminal_state',
  'last_full_member',
  'cap_reached',
  'rate_limited',
  'feature_unavailable',
  'deletion_pending',
  'conflict',
])
const currentStatusSchema = z.enum([
  'active', 'archived', 'inactive', 'pending', 'accepted', 'declined',
  'expired', 'open', 'completed', 'cancelled', 'removed', 'left',
])
const mutationFailureDataSchema = z.union([
  emptyObjectSchema,
  z.object({ retry_after_seconds: z.number().int().min(1).max(86400) }).strict(),
  z.object({ current_status: currentStatusSchema }).strict(),
])
const mutationFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: mutationFailureCodeSchema,
  request_id: uuidSchema,
  data: mutationFailureDataSchema,
}).strict().superRefine((value, context) => {
  const keys = Object.keys(value.data)
  if (value.code === 'rate_limited') {
    if (keys.length !== 1 || !('retry_after_seconds' in value.data)) {
      context.addIssue({ code: 'custom', path: ['data'], message: 'invalid' })
    }
    return
  }
  if (value.code === 'terminal_state') {
    if (keys.length !== 1 || !('current_status' in value.data)) {
      context.addIssue({ code: 'custom', path: ['data'], message: 'invalid' })
    }
    return
  }
  if (keys.length !== 0) {
    context.addIssue({ code: 'custom', path: ['data'], message: 'invalid' })
  }
})

const mutationDataBase = {
  resource_id: uuidSchema,
  version: versionSchema,
}
const circleCreatedDataSchema = z.object({
  ...mutationDataBase,
  status: z.literal('active'),
  display_reference: displayReferenceSchema,
}).strict()
const activeDataSchema = z.object({ ...mutationDataBase, status: z.literal('active') }).strict()
const deletedDataSchema = z.object({ ...mutationDataBase, status: z.literal('deleted') }).strict()
const pendingDataSchema = z.object({ ...mutationDataBase, status: z.literal('pending') }).strict()
const cancelledDataSchema = z.object({ ...mutationDataBase, status: z.literal('cancelled') }).strict()
const declinedDataSchema = z.object({ ...mutationDataBase, status: z.literal('declined') }).strict()
const archivedDataSchema = z.object({ ...mutationDataBase, status: z.literal('archived') }).strict()
const removedDataSchema = z.object({ ...mutationDataBase, status: z.literal('removed') }).strict()
const leftDataSchema = z.object({ ...mutationDataBase, status: z.literal('left') }).strict()
const acceptedDataSchema = z.object({
  ...mutationDataBase,
  circle_id: uuidSchema,
  status: z.literal('active'),
  membership_type: membershipTypeSchema,
}).strict()
const membershipChangedDataSchema = z.object({
  ...mutationDataBase,
  status: z.literal('active'),
  membership_type: membershipTypeSchema,
}).strict()
const participantValueDataSchema = z.object({
  ...mutationDataBase,
  status: z.enum(['active', 'inactive']),
  points: pointsSchema,
}).strict()
const openAssignmentDataSchema = z.object({ ...mutationDataBase, status: z.literal('open') }).strict()
const repeatedAssignmentDataSchema = z.object({
  ...mutationDataBase,
  source_assignment_id: uuidSchema,
  status: z.literal('open'),
}).strict()
const completedAssignmentDataSchema = z.object({
  ...mutationDataBase,
  status: z.literal('completed'),
  completion_sequence: versionSchema,
  points_delta: pointsSchema,
}).strict()
const quickCompletedAssignmentDataSchema = z.object({
  ...mutationDataBase,
  definition_id: uuidSchema,
  participant_id: uuidSchema,
  status: z.literal('completed'),
  completion_sequence: versionSchema,
  points_delta: pointsSchema,
}).strict()
const cancelledAssignmentDataSchema = z.object({
  ...mutationDataBase,
  status: z.literal('cancelled'),
  points_delta: z.literal(0),
}).strict()
const reversedAssignmentDataSchema = z.object({
  ...mutationDataBase,
  status: z.enum(['open', 'cancelled']),
  points_delta: z.number().int().min(-100).max(-1),
  reopen_outcome: z.enum(['open', 'cancelled']),
  reopen_reason: z.enum(['undo_not_reopened', 'cap_not_reopened']).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status !== value.reopen_outcome
    || (value.status === 'open' && value.reopen_reason !== null)
    || (value.status === 'cancelled' && value.reopen_reason === null)) {
    context.addIssue({ code: 'custom', message: 'invalid' })
  }
})

function mapMutationError(code: z.infer<typeof mutationFailureCodeSchema>): HouseholdChoreActionError {
  if (code === 'stale_version' || code === 'stale_value') return 'stale'
  if (code === 'feature_unavailable' || code === 'deletion_pending') return 'feature_disabled'
  return code
}

function mutationInput<T>(actorUserId: string, schema: z.ZodType<T>, input: unknown): T | null {
  if (!validUuid(actorUserId)) return null
  const parsed = schema.safeParse(input)
  return parsed.success ? parsed.data : null
}

function projectMutationData(value: {
  resource_id: string
  version: string
  status: string
  circle_id?: string
  participant_id?: string
  definition_id?: string
  source_assignment_id?: string
  display_reference?: string
  membership_type?: 'member' | 'child'
  points?: number
  completion_sequence?: string
  points_delta?: number
  reopen_outcome?: 'open' | 'cancelled'
  reopen_reason?: 'undo_not_reopened' | 'cap_not_reopened' | null
}): HouseholdChoreMutationData {
  return {
    resourceId: value.resource_id,
    version: value.version,
    status: value.status,
    ...(value.circle_id ? { circleId: value.circle_id } : {}),
    ...(value.participant_id ? { participantId: value.participant_id } : {}),
    ...(value.definition_id ? { definitionId: value.definition_id } : {}),
    ...(value.source_assignment_id ? { sourceAssignmentId: value.source_assignment_id } : {}),
    ...(value.display_reference ? { displayReference: value.display_reference } : {}),
    ...(value.membership_type ? { membershipType: value.membership_type } : {}),
    ...(value.points !== undefined ? { points: value.points } : {}),
    ...(value.completion_sequence
      ? { completionSequence: value.completion_sequence }
      : {}),
    ...(value.points_delta !== undefined ? { pointsDelta: value.points_delta } : {}),
    ...(value.reopen_outcome ? { reopenOutcome: value.reopen_outcome } : {}),
    ...('reopen_reason' in value ? { reopenReason: value.reopen_reason ?? null } : {}),
  }
}

async function runMutation(
  rpcName: string,
  args: RpcArguments,
  requestId: string,
  successCode: string,
  dataSchema: z.ZodTypeAny,
): Promise<HouseholdChoreActionResult<HouseholdChoreMutationData>> {
  let raw: unknown
  try {
    const { data, error } = await getAdmin().rpc(rpcName, args)
    if (error) {
      console.error('[household-chores] mutation failed')
      return { ok: false, error: 'save_failed' }
    }
    raw = data
  } catch {
    console.error('[household-chores] mutation failed')
    return { ok: false, error: 'save_failed' }
  }

  const successEnvelope = z.object({
    ok: z.literal(true),
    code: z.literal(successCode),
    request_id: z.literal(requestId),
    data: dataSchema,
  }).strict().safeParse(raw)
  if (successEnvelope.success) {
    return {
      ok: true,
      data: projectMutationData(successEnvelope.data.data as {
        resource_id: string
        version: string
        status: string
        circle_id?: string
        participant_id?: string
        definition_id?: string
        source_assignment_id?: string
        display_reference?: string
        membership_type?: 'member' | 'child'
        points?: number
        completion_sequence?: string
        points_delta?: number
        reopen_outcome?: 'open' | 'cancelled'
        reopen_reason?: 'undo_not_reopened' | 'cap_not_reopened' | null
      }),
    }
  }

  const failure = mutationFailureEnvelopeSchema.safeParse(raw)
  if (failure.success && failure.data.request_id === requestId) {
    const error = mapMutationError(failure.data.code)
    if (error === 'rate_limited'
      && 'retry_after_seconds' in failure.data.data) {
      return {
        ok: false,
        error,
        retryAfterSeconds: failure.data.data.retry_after_seconds,
      }
    }
    return { ok: false, error }
  }

  console.error('[household-chores] mutation response rejected')
  return { ok: false, error: 'save_failed' }
}

const invalidInput = (): HouseholdChoreActionResult<HouseholdChoreMutationData> => ({
  ok: false,
  error: 'invalid_input',
})

export async function createHouseholdChoreCircle(
  actorUserId: string,
  input: CreateHouseholdChoreCircleInput,
) {
  const value = mutationInput(actorUserId, CreateHouseholdChoreCircleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_create_circle',
    { p_actor_id: actorUserId, p_request_id: value.requestId, p_name: value.name },
    value.requestId,
    'circle_created',
    circleCreatedDataSchema,
  )
}

export async function renameHouseholdChoreCircle(
  actorUserId: string,
  input: RenameHouseholdChoreCircleInput,
) {
  const value = mutationInput(actorUserId, RenameHouseholdChoreCircleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_rename_circle',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_expected_version: value.expectedVersion,
      p_name: value.name,
    },
    value.requestId,
    'circle_renamed',
    activeDataSchema,
  )
}

export async function deleteHouseholdChoreCircle(
  actorUserId: string,
  input: DeleteHouseholdChoreCircleInput,
) {
  const value = mutationInput(actorUserId, DeleteHouseholdChoreCircleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_delete_circle',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_expected_version: value.expectedVersion,
      p_display_reference: value.displayReference,
    },
    value.requestId,
    'circle_deleted',
    deletedDataSchema,
  )
}

export async function createHouseholdChoreInvitation(
  actorUserId: string,
  input: CreateHouseholdChoreInvitationInput,
) {
  const value = mutationInput(actorUserId, CreateHouseholdChoreInvitationSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_create_invitation',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_relationship_id: value.relationshipId,
      p_requested_type: value.requestedType,
    },
    value.requestId,
    'invitation_created',
    pendingDataSchema,
  )
}

export async function cancelHouseholdChoreInvitation(
  actorUserId: string,
  input: CancelHouseholdChoreInvitationInput,
) {
  const value = mutationInput(actorUserId, CancelHouseholdChoreInvitationSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_cancel_invitation',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_invitation_id: value.invitationId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    'invitation_cancelled',
    cancelledDataSchema,
  )
}

export async function acceptHouseholdChoreInvitation(
  actorUserId: string,
  input: DecideHouseholdChoreInvitationInput,
) {
  const value = mutationInput(actorUserId, DecideHouseholdChoreInvitationSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_accept_invitation',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_invitation_id: value.invitationId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    'invitation_accepted',
    acceptedDataSchema,
  )
}

export async function declineHouseholdChoreInvitation(
  actorUserId: string,
  input: DecideHouseholdChoreInvitationInput,
) {
  const value = mutationInput(actorUserId, DecideHouseholdChoreInvitationSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_decline_invitation',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_invitation_id: value.invitationId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    'invitation_declined',
    declinedDataSchema,
  )
}

export async function changeHouseholdChoreMembershipType(
  actorUserId: string,
  input: ChangeHouseholdChoreMembershipTypeInput,
) {
  const value = mutationInput(actorUserId, ChangeHouseholdChoreMembershipTypeSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_change_membership_type',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_membership_id: value.membershipId,
      p_expected_version: value.expectedVersion,
      p_new_type: value.newType,
    },
    value.requestId,
    'membership_type_changed',
    membershipChangedDataSchema,
  )
}

export async function removeHouseholdChoreMember(
  actorUserId: string,
  input: RemoveHouseholdChoreMemberInput,
) {
  const value = mutationInput(actorUserId, RemoveHouseholdChoreMemberSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_remove_member',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_membership_id: value.membershipId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    'membership_removed',
    removedDataSchema,
  )
}

export async function leaveHouseholdChoreCircle(
  actorUserId: string,
  input: LeaveHouseholdChoreCircleInput,
) {
  const value = mutationInput(actorUserId, LeaveHouseholdChoreCircleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_leave_circle',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    'membership_left',
    leftDataSchema,
  )
}

export async function createHouseholdChoreParticipant(
  actorUserId: string,
  input: CreateHouseholdChoreParticipantInput,
) {
  const value = mutationInput(actorUserId, CreateHouseholdChoreParticipantSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_create_participant',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_label: value.label,
    },
    value.requestId,
    'participant_created',
    activeDataSchema,
  )
}

export async function renameHouseholdChoreParticipant(
  actorUserId: string,
  input: RenameHouseholdChoreParticipantInput,
) {
  const value = mutationInput(actorUserId, RenameHouseholdChoreParticipantSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_rename_participant',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_participant_id: value.participantId,
      p_expected_version: value.expectedVersion,
      p_label: value.label,
    },
    value.requestId,
    'participant_renamed',
    activeDataSchema.or(archivedDataSchema),
  )
}

export async function linkHouseholdChoreParticipant(
  actorUserId: string,
  input: LinkHouseholdChoreParticipantInput,
) {
  const value = mutationInput(actorUserId, LinkHouseholdChoreParticipantSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_link_participant',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_participant_id: value.participantId,
      p_expected_version: value.expectedVersion,
      p_recipient_email: value.recipientEmail,
      p_requested_type: value.requestedType,
    },
    value.requestId,
    'participant_link_invitation_created',
    pendingDataSchema,
  )
}

async function runParticipantLifecycle(
  rpcName: 'household_chore_archive_participant' | 'household_chore_reactivate_participant',
  successCode: 'participant_archived' | 'participant_reactivated',
  actorUserId: string,
  input: HouseholdChoreParticipantLifecycleInput,
) {
  const value = mutationInput(actorUserId, HouseholdChoreParticipantLifecycleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    rpcName,
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_participant_id: value.participantId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    successCode,
    successCode === 'participant_archived' ? archivedDataSchema : activeDataSchema,
  )
}

export function archiveHouseholdChoreParticipant(
  actorUserId: string,
  input: HouseholdChoreParticipantLifecycleInput,
) {
  return runParticipantLifecycle(
    'household_chore_archive_participant', 'participant_archived', actorUserId, input,
  )
}

export function reactivateHouseholdChoreParticipant(
  actorUserId: string,
  input: HouseholdChoreParticipantLifecycleInput,
) {
  return runParticipantLifecycle(
    'household_chore_reactivate_participant', 'participant_reactivated', actorUserId, input,
  )
}

export async function createHouseholdChoreDefinition(
  actorUserId: string,
  input: CreateHouseholdChoreDefinitionInput,
) {
  const value = mutationInput(actorUserId, CreateHouseholdChoreDefinitionSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_create_definition_v2',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_title: value.title,
      p_description: value.description,
      p_materials: value.materials,
      p_cadence_days: value.cadenceDays,
      p_completion_scope: value.completionScope,
    },
    value.requestId,
    'definition_created',
    activeDataSchema,
  )
}

export async function updateHouseholdChoreDefinition(
  actorUserId: string,
  input: UpdateHouseholdChoreDefinitionInput,
) {
  const value = mutationInput(actorUserId, UpdateHouseholdChoreDefinitionSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_update_definition_v2',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_expected_version: value.expectedVersion,
      p_title: value.title,
      p_description: value.description,
      p_materials: value.materials,
      p_cadence_days: value.cadenceDays,
      p_completion_scope: value.completionScope,
    },
    value.requestId,
    'definition_updated',
    activeDataSchema,
  )
}

async function runDefinitionLifecycle(
  rpcName: 'household_chore_archive_definition' | 'household_chore_reactivate_definition',
  successCode: 'definition_archived' | 'definition_reactivated',
  actorUserId: string,
  input: HouseholdChoreDefinitionLifecycleInput,
) {
  const value = mutationInput(actorUserId, HouseholdChoreDefinitionLifecycleSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    rpcName,
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    successCode,
    successCode === 'definition_archived' ? archivedDataSchema : activeDataSchema,
  )
}

export function archiveHouseholdChoreDefinition(
  actorUserId: string,
  input: HouseholdChoreDefinitionLifecycleInput,
) {
  return runDefinitionLifecycle(
    'household_chore_archive_definition', 'definition_archived', actorUserId, input,
  )
}

export function reactivateHouseholdChoreDefinition(
  actorUserId: string,
  input: HouseholdChoreDefinitionLifecycleInput,
) {
  return runDefinitionLifecycle(
    'household_chore_reactivate_definition', 'definition_reactivated', actorUserId, input,
  )
}

export async function setHouseholdChoreParticipantValue(
  actorUserId: string,
  input: SetHouseholdChoreParticipantValueInput,
) {
  const value = mutationInput(actorUserId, SetHouseholdChoreParticipantValueSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_set_participant_value',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_participant_id: value.participantId,
      p_expected_definition_version: value.expectedDefinitionVersion,
      p_expected_value_version: value.expectedValueVersion,
      p_points: value.points,
      p_active: value.active,
    },
    value.requestId,
    'participant_value_set',
    participantValueDataSchema,
  )
}

export async function assignHouseholdChore(
  actorUserId: string,
  input: AssignHouseholdChoreInput,
) {
  const value = mutationInput(actorUserId, AssignHouseholdChoreSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_assign',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_participant_id: value.participantId,
      p_expected_definition_version: value.expectedDefinitionVersion,
      p_expected_value_version: value.expectedValueVersion,
    },
    value.requestId,
    'assignment_created',
    openAssignmentDataSchema,
  )
}

export async function selfAssignHouseholdChore(
  actorUserId: string,
  input: SelfAssignHouseholdChoreInput,
) {
  const value = mutationInput(actorUserId, SelfAssignHouseholdChoreSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_self_assign',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_expected_definition_version: value.expectedDefinitionVersion,
      p_expected_value_version: value.expectedValueVersion,
    },
    value.requestId,
    'assignment_created',
    openAssignmentDataSchema,
  )
}

export async function repeatHouseholdChoreAssignment(
  actorUserId: string,
  input: RepeatHouseholdChoreAssignmentInput,
) {
  const value = mutationInput(actorUserId, RepeatHouseholdChoreAssignmentSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_repeat_assignment',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_source_assignment_id: value.sourceAssignmentId,
      p_expected_source_version: value.expectedSourceVersion,
      p_expected_definition_version: value.expectedDefinitionVersion,
      p_expected_value_version: value.expectedValueVersion,
    },
    value.requestId,
    'assignment_repeated',
    repeatedAssignmentDataSchema,
  )
}

async function runAssignmentLifecycle(
  rpcName:
    | 'household_chore_complete_assignment'
    | 'household_chore_cancel_assignment'
    | 'household_chore_cancel_own_assignment'
    | 'household_chore_undo_completion',
  successCode:
    | 'assignment_completed'
    | 'assignment_cancelled'
    | 'completion_reversed',
  actorUserId: string,
  input: HouseholdChoreAssignmentLifecycleInput,
) {
  const value = mutationInput(actorUserId, HouseholdChoreAssignmentLifecycleSchema, input)
  if (!value) return invalidInput()
  const resultSchema = successCode === 'assignment_completed'
    ? completedAssignmentDataSchema
    : successCode === 'assignment_cancelled'
      ? cancelledAssignmentDataSchema
      : reversedAssignmentDataSchema
  return runMutation(
    rpcName,
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_assignment_id: value.assignmentId,
      p_expected_version: value.expectedVersion,
    },
    value.requestId,
    successCode,
    resultSchema,
  )
}

export function completeHouseholdChoreAssignment(
  actorUserId: string,
  input: HouseholdChoreAssignmentLifecycleInput,
) {
  return runAssignmentLifecycle(
    'household_chore_complete_assignment', 'assignment_completed', actorUserId, input,
  )
}

export async function completeHouseholdChoreDefinition(
  actorUserId: string,
  input: CompleteHouseholdChoreDefinitionInput,
) {
  const value = mutationInput(actorUserId, CompleteHouseholdChoreDefinitionSchema, input)
  if (!value) return invalidInput()
  return runMutation(
    'household_chore_complete_definition',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_participant_id: value.participantId,
      p_expected_state_token: value.expectedStateToken,
    },
    value.requestId,
    'assignment_completed',
    quickCompletedAssignmentDataSchema,
  )
}

export function cancelHouseholdChoreAssignment(
  actorUserId: string,
  input: HouseholdChoreAssignmentLifecycleInput,
) {
  return runAssignmentLifecycle(
    'household_chore_cancel_assignment', 'assignment_cancelled', actorUserId, input,
  )
}

export function cancelOwnHouseholdChoreAssignment(
  actorUserId: string,
  input: HouseholdChoreAssignmentLifecycleInput,
) {
  return runAssignmentLifecycle(
    'household_chore_cancel_own_assignment', 'assignment_cancelled', actorUserId, input,
  )
}

export function undoHouseholdChoreCompletion(
  actorUserId: string,
  input: HouseholdChoreAssignmentLifecycleInput,
) {
  return runAssignmentLifecycle(
    'household_chore_undo_completion', 'completion_reversed', actorUserId, input,
  )
}
