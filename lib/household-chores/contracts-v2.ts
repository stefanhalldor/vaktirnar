import { z } from 'zod'

export type HouseholdChoreV2ActionError =
  | 'invalid_input'
  | 'feature_disabled'
  | 'invalid_performed_date'
  | 'fingerprint_mismatch'
  | 'stale_version'
  | 'terminal_state'
  | 'not_allowed'
  | 'not_found'
  | 'not_available'
  | 'rate_limited'
  | 'save_failed'

export type HouseholdChoreV2ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: Exclude<HouseholdChoreV2ActionError, 'rate_limited'> }
  | { ok: false; error: 'rate_limited'; retryAfterSeconds: number }

export type HouseholdChoreV2IdentityMarker = 'current' | 'former_member'
export type HouseholdChoreV2CompletionScope = 'global' | 'per_participant'
export type HouseholdChoreV2AssignmentOrigin =
  | 'member_assigned'
  | 'self_assigned'
  | 'member_repeated'
  | 'quick_completed'
export type HouseholdChoreV2AssignmentStatus = 'open' | 'completed' | 'cancelled'

export interface HouseholdChoreV2HistoryBase {
  eventId: string
  assignmentId: string
  title: string
  occurredAt: string
  participantLabel: string | null
  participantIdentityMarker: HouseholdChoreV2IdentityMarker
  assignmentOrigin: HouseholdChoreV2AssignmentOrigin
  snapshotPoints: number
  actorKind: 'member' | 'participant' | 'former_member' | 'system'
  actorLabel: string | null
}

export type HouseholdChoreV2HistoryItem =
  | (HouseholdChoreV2HistoryBase & {
    eventType: 'created'
    statusAfter: 'open'
  })
  | (HouseholdChoreV2HistoryBase & {
    eventType: 'completed' | 'recompleted'
    statusAfter: 'completed'
    completionSequence: number
    performedOn: string
    recordedAt: string
    pointsDelta: number
  })
  | (HouseholdChoreV2HistoryBase & {
    eventType: 'completion_date_corrected'
    statusAfter: 'completed'
    completionSequence: number
    performedOn: string
    previousPerformedOn: string
  })
  | (HouseholdChoreV2HistoryBase & {
    eventType: 'completion_reversed'
    statusAfter: 'open' | 'cancelled'
    completionSequence: number
    reversedPerformedOn: string
    pointsDelta: number
    reopenOutcome: 'open' | 'cancelled'
  })
  | (HouseholdChoreV2HistoryBase & {
    eventType: 'cancelled'
    statusAfter: 'cancelled'
    cancellationReason: string
  })

export interface HouseholdChoreV2HistoryPage {
  items: HouseholdChoreV2HistoryItem[]
  hasMore: boolean
  nextCursor: { occurredAt: string; eventId: string } | null
}

export interface HouseholdChoreV2PriorityStateBase {
  participantId: string
  label: string
  points: number
  baselineOn: string | null
  dueOn: string | null
  isRemaining: boolean
  latestCompletionId: string | null
  latestPerformedOn: string | null
  recordedAt: string | null
  oldestOpenAssignmentId: string | null
  oldestOpenAssignmentVersion: string | null
  expectedStateToken: string
}

export interface HouseholdChoreV2MemberPriorityState
  extends HouseholdChoreV2PriorityStateBase {
  identityMarker: HouseholdChoreV2IdentityMarker
  valueVersion: string
  baselineOn: string
}

export interface HouseholdChoreV2ChildPriorityState
  extends HouseholdChoreV2PriorityStateBase {}

export interface HouseholdChoreV2PriorityOpenAssignment {
  assignmentId: string
  participantId: string
  participantLabel: string
  version: string
  createdAt: string
}

export interface HouseholdChoreV2PriorityDefinitionBase {
  definitionId: string
  title: string
  description: string | null
  materials: string | null
  cadenceDays: number | null
  completionScope: HouseholdChoreV2CompletionScope
  priorityDueOn: string | null
  priorityDueAt: string | null
}

export interface HouseholdChoreV2MemberPriorityDefinition
  extends HouseholdChoreV2PriorityDefinitionBase {
  version: string
  participantStates: HouseholdChoreV2MemberPriorityState[]
  openAssignments: HouseholdChoreV2PriorityOpenAssignment[]
  openAssignmentCount: number
  latestPerformer: {
    participantId: string
    label: string | null
    identityMarker: HouseholdChoreV2IdentityMarker
    performedOn: string
    recordedAt: string
  } | null
}

export interface HouseholdChoreV2ChildPriorityDefinition
  extends HouseholdChoreV2PriorityDefinitionBase {
  ownState: HouseholdChoreV2ChildPriorityState
}

export type HouseholdChoreV2PriorityDashboard =
  | {
    viewerType: 'member'
    ownParticipantId: string
    serverToday: string
    nextDayBoundaryAt: string
    participants: Array<{
      participantId: string
      label: string
      identityMarker: HouseholdChoreV2IdentityMarker
      isViewer: boolean
    }>
    definitions: HouseholdChoreV2MemberPriorityDefinition[]
  }
  | {
    viewerType: 'child'
    ownParticipantId: string
    serverToday: string
    nextDayBoundaryAt: string
    definitions: HouseholdChoreV2ChildPriorityDefinition[]
  }

interface HouseholdChoreV2AssignmentBase {
  assignmentId: string
  title: string
  description: string | null
  materials: string | null
  participantLabel: string | null
  participantIdentityMarker: HouseholdChoreV2IdentityMarker
  points: number
  origin: HouseholdChoreV2AssignmentOrigin
  status: HouseholdChoreV2AssignmentStatus
  createdAt: string
  performedOn: string | null
  recordedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  canCorrectDate: boolean
}

export interface HouseholdChoreV2MemberAssignment
  extends HouseholdChoreV2AssignmentBase {
  circleId: string
  definitionId: string
  participantId: string
  completionSequence: number
  version: string
  recorderLabel: string | null
}

export interface HouseholdChoreV2ChildAssignment
  extends HouseholdChoreV2AssignmentBase {
  ownAssignment: true
  completionSequence: number | null
  version: string | null
  canComplete: boolean
  canCancel: boolean
}

export type HouseholdChoreV2AssignmentDetail =
  | {
    viewerType: 'member'
    assignment: HouseholdChoreV2MemberAssignment
    timeline: HouseholdChoreV2HistoryPage
  }
  | {
    viewerType: 'child'
    assignment: HouseholdChoreV2ChildAssignment
    timeline: HouseholdChoreV2HistoryPage
  }

export type HouseholdChoreV2DefinitionDetail =
  | {
    viewerType: 'member'
    serverToday: string
    definition: HouseholdChoreV2MemberPriorityDefinition
    history: HouseholdChoreV2HistoryPage
  }
  | {
    viewerType: 'child'
    serverToday: string
    definition: HouseholdChoreV2ChildPriorityDefinition
    history: HouseholdChoreV2HistoryPage
  }

export interface HouseholdChoreV2CompletionData {
  resourceId: string
  definitionId?: string
  participantId?: string
  version: string
  status: 'completed'
  completionSequence: string
  pointsDelta: number
  performedOn: string
  recordedAt: string
}

export interface HouseholdChoreV2CorrectionData {
  resourceId: string
  version: string
  status: 'completed'
  completionSequence: string
  performedOn: string
  recordedAt: string
  pointsDelta: 0
}

const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const POSTGRES_BIGINT_MAX = '9223372036854775807'

function isPostgresBigint(value: string): boolean {
  return value.length < POSTGRES_BIGINT_MAX.length
    || (value.length === POSTGRES_BIGINT_MAX.length && value <= POSTGRES_BIGINT_MAX)
}

export function isStrictIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (days[month - 1] ?? 0)
}

export const HouseholdChoreIsoDateSchema = z.string().refine(isStrictIsoCalendarDate)

const uuidSchema = z.string().regex(UUID_PATTERN)
const versionSchema = z.string().regex(/^[1-9]\d*$/).max(19).refine(isPostgresBigint)
const timestampSchema = z.string().max(40).refine(
  value => TIMESTAMP_PATTERN.test(value)
    && isStrictIsoCalendarDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value)),
)
const nonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const positiveSequenceSchema = z.number().int().min(1).max(2147483647)
const pointsSchema = z.number().int().min(1).max(100)
const identityMarkerSchema = z.enum(['current', 'former_member'])
const assignmentOriginSchema = z.enum([
  'member_assigned', 'self_assigned', 'member_repeated', 'quick_completed',
])
const completionScopeSchema = z.enum(['global', 'per_participant'])
const stateTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)
const cadenceDaysSchema = z.number().int().min(1).max(3650)

function boundedText(max: number) {
  return z.string().min(1).max(max)
    .refine(value => value.trim() === value)
    .refine(value => !FORBIDDEN_CONTROLS.test(value))
}

const titleSchema = boundedText(120)
const optionalDescriptionSchema = boundedText(2000).optional()
const optionalMaterialsSchema = boundedText(4000).optional()
const labelSchema = boundedText(120).refine(value => !value.includes('@'))

function refineIdentityLabels(value: {
  participant_identity_marker: 'current' | 'former_member'
  participant_label?: string
  actor_kind: 'member' | 'participant' | 'former_member' | 'system'
  actor_label?: string
}, context: z.RefinementCtx) {
  const participantHasLabel = value.participant_label !== undefined
  if (participantHasLabel !== (value.participant_identity_marker === 'current')) {
    context.addIssue({ code: 'custom', path: ['participant_label'], message: 'invalid' })
  }
  const actorHasLabel = value.actor_label !== undefined
  const actorNeedsLabel = value.actor_kind === 'member' || value.actor_kind === 'participant'
  if (actorHasLabel !== actorNeedsLabel) {
    context.addIssue({ code: 'custom', path: ['actor_label'], message: 'invalid' })
  }
}

const historyBaseShape = {
  event_id: uuidSchema,
  assignment_id: uuidSchema,
  title: titleSchema,
  occurred_at: timestampSchema,
  participant_label: labelSchema.optional(),
  participant_identity_marker: identityMarkerSchema,
  assignment_origin: assignmentOriginSchema,
  snapshot_points: pointsSchema,
  actor_kind: z.enum(['member', 'participant', 'former_member', 'system']),
  actor_label: labelSchema.optional(),
}

const createdHistorySchema = z.object({
  ...historyBaseShape,
  event_type: z.literal('created'),
  status_after: z.literal('open'),
}).strict().superRefine(refineIdentityLabels)

const completedHistorySchema = z.object({
  ...historyBaseShape,
  event_type: z.enum(['completed', 'recompleted']),
  status_after: z.literal('completed'),
  completion_sequence: positiveSequenceSchema,
  performed_on: HouseholdChoreIsoDateSchema,
  recorded_at: timestampSchema,
  points_delta: pointsSchema,
}).strict().superRefine((value, context) => {
  refineIdentityLabels(value, context)
  if (value.recorded_at !== value.occurred_at || value.points_delta !== value.snapshot_points) {
    context.addIssue({ code: 'custom', message: 'invalid_completed_event' })
  }
})

const correctedHistorySchema = z.object({
  ...historyBaseShape,
  event_type: z.literal('completion_date_corrected'),
  status_after: z.literal('completed'),
  completion_sequence: positiveSequenceSchema,
  performed_on: HouseholdChoreIsoDateSchema,
  previous_performed_on: HouseholdChoreIsoDateSchema,
}).strict().superRefine((value, context) => {
  refineIdentityLabels(value, context)
  if (value.performed_on === value.previous_performed_on) {
    context.addIssue({ code: 'custom', message: 'unchanged_correction' })
  }
})

const reversedHistorySchema = z.object({
  ...historyBaseShape,
  event_type: z.literal('completion_reversed'),
  status_after: z.enum(['open', 'cancelled']),
  completion_sequence: positiveSequenceSchema,
  reversed_performed_on: HouseholdChoreIsoDateSchema,
  points_delta: z.number().int().min(-100).max(-1),
  reopen_outcome: z.enum(['open', 'cancelled']),
}).strict().superRefine((value, context) => {
  refineIdentityLabels(value, context)
  if (value.status_after !== value.reopen_outcome
    || value.points_delta !== -value.snapshot_points) {
    context.addIssue({ code: 'custom', message: 'invalid_reversal' })
  }
})

const cancelledHistorySchema = z.object({
  ...historyBaseShape,
  event_type: z.literal('cancelled'),
  status_after: z.literal('cancelled'),
  cancellation_reason: boundedText(80),
}).strict().superRefine(refineIdentityLabels)

export const HouseholdChoreV2HistoryItemWireSchema = z.union([
  createdHistorySchema,
  completedHistorySchema,
  correctedHistorySchema,
  reversedHistorySchema,
  cancelledHistorySchema,
])

const historyCursorSchema = z.object({
  occurred_at: timestampSchema,
  event_id: uuidSchema,
}).strict()

export const HouseholdChoreV2HistoryPageWireSchema = z.object({
  items: z.array(HouseholdChoreV2HistoryItemWireSchema).max(50),
  next_cursor: historyCursorSchema.nullable(),
  has_more: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({ code: 'custom', path: ['next_cursor'], message: 'invalid' })
  }
})

const openStateShape = {
  oldest_open_assignment_id: uuidSchema.optional(),
  oldest_open_assignment_version: versionSchema.optional(),
}

function refineOpenState(value: {
  oldest_open_assignment_id?: string
  oldest_open_assignment_version?: string
}, context: z.RefinementCtx) {
  if ((value.oldest_open_assignment_id === undefined)
    !== (value.oldest_open_assignment_version === undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_open_assignment_state' })
  }
}

export const HouseholdChoreV2MemberPriorityStateWireSchema = z.object({
  participant_id: uuidSchema,
  label: labelSchema,
  identity_marker: identityMarkerSchema,
  points: pointsSchema,
  value_version: versionSchema,
  baseline_on: HouseholdChoreIsoDateSchema,
  due_on: HouseholdChoreIsoDateSchema.optional(),
  is_remaining: z.boolean(),
  latest_completion_id: uuidSchema.optional(),
  latest_performed_on: HouseholdChoreIsoDateSchema.optional(),
  recorded_at: timestampSchema.optional(),
  ...openStateShape,
  baseline_at: timestampSchema,
  due_at: timestampSchema.optional(),
  latest_completed_at: timestampSchema.optional(),
  expected_state_token: stateTokenSchema,
}).strict().superRefine((value, context) => {
  refineOpenState(value, context)
  const dueFields = [value.due_on, value.due_at]
  if (dueFields.some(item => item === undefined) && dueFields.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_due_state' })
  }
  const latestFields = [
    value.latest_completion_id,
    value.latest_performed_on,
    value.recorded_at,
    value.latest_completed_at,
  ]
  if (latestFields.some(item => item === undefined)
    && latestFields.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_latest_state' })
  }
  if (value.recorded_at !== value.latest_completed_at) {
    context.addIssue({ code: 'custom', message: 'invalid_recorded_state' })
  }
  if (value.is_remaining !== (value.due_on !== undefined)) {
    // A due date can be in the future; only absence of cadence forces false.
    if (value.due_on === undefined && value.is_remaining) {
      context.addIssue({ code: 'custom', message: 'invalid_remaining_state' })
    }
  }
})

export const HouseholdChoreV2ChildPriorityStateWireSchema = z.object({
  participant_id: uuidSchema,
  label: labelSchema,
  points: pointsSchema,
  baseline_on: HouseholdChoreIsoDateSchema.optional(),
  due_on: HouseholdChoreIsoDateSchema.optional(),
  is_remaining: z.boolean(),
  latest_completion_id: uuidSchema.optional(),
  latest_performed_on: HouseholdChoreIsoDateSchema.optional(),
  recorded_at: timestampSchema.optional(),
  ...openStateShape,
  baseline_at: timestampSchema,
  due_at: timestampSchema.optional(),
  latest_completed_at: timestampSchema.optional(),
  expected_state_token: stateTokenSchema,
}).strict().superRefine((value, context) => {
  refineOpenState(value, context)
  const dueFields = [value.due_on, value.due_at]
  if (dueFields.some(item => item === undefined) && dueFields.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_due_state' })
  }
  const ownHistoryFields = [
    value.baseline_on,
    value.latest_completion_id,
    value.latest_performed_on,
    value.recorded_at,
    value.latest_completed_at,
  ]
  if (ownHistoryFields.some(item => item === undefined)
    && ownHistoryFields.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_child_history_state' })
  }
  if (value.recorded_at !== value.latest_completed_at) {
    context.addIssue({ code: 'custom', message: 'invalid_recorded_state' })
  }
  if (value.due_on === undefined && value.is_remaining) {
    context.addIssue({ code: 'custom', message: 'invalid_remaining_state' })
  }
})

const priorityOpenAssignmentSchema = z.object({
  assignment_id: uuidSchema,
  participant_id: uuidSchema,
  participant_label: labelSchema,
  version: versionSchema,
  created_at: timestampSchema,
}).strict()

const priorityDefinitionBaseShape = {
  definition_id: uuidSchema,
  title: titleSchema,
  description: optionalDescriptionSchema,
  materials: optionalMaterialsSchema,
  cadence_days: cadenceDaysSchema.optional(),
  completion_scope: completionScopeSchema,
  priority_due_on: HouseholdChoreIsoDateSchema.optional(),
  priority_due_at: timestampSchema.optional(),
}

export const HouseholdChoreV2MemberPriorityDefinitionWireSchema = z.object({
  ...priorityDefinitionBaseShape,
  version: versionSchema,
  participant_states: z.array(HouseholdChoreV2MemberPriorityStateWireSchema).max(100),
  open_assignments: z.array(priorityOpenAssignmentSchema).max(20),
  open_assignment_count: nonNegativeIntegerSchema.max(500),
  latest_performer_id: uuidSchema.optional(),
  latest_performer_label: labelSchema.optional(),
  latest_performer_identity_marker: identityMarkerSchema.optional(),
  latest_performed_on: HouseholdChoreIsoDateSchema.optional(),
  recorded_at: timestampSchema.optional(),
}).strict().superRefine((value, context) => {
  const dueFields = [value.priority_due_on, value.priority_due_at]
  if (dueFields.some(item => item === undefined) && dueFields.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_priority_due' })
  }
  if (value.cadence_days === undefined) {
    if (value.priority_due_on !== undefined
      || value.participant_states.some(state => state.due_on !== undefined || state.is_remaining)) {
      context.addIssue({ code: 'custom', message: 'invalid_null_cadence_state' })
    }
  } else if (value.participant_states.length > 0 && value.priority_due_on === undefined) {
    context.addIssue({ code: 'custom', message: 'missing_priority_due' })
  }
  const latestRequired = [
    value.latest_performer_id,
    value.latest_performer_identity_marker,
    value.latest_performed_on,
    value.recorded_at,
  ]
  if (latestRequired.some(item => item === undefined)
    && latestRequired.some(item => item !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_latest_performer' })
  }
  if (latestRequired.every(item => item === undefined)
    && value.latest_performer_label !== undefined) {
    context.addIssue({ code: 'custom', message: 'orphan_latest_performer_label' })
  }
  if (value.latest_performer_identity_marker === 'current'
    && value.latest_performer_label === undefined) {
    context.addIssue({ code: 'custom', message: 'missing_latest_performer_label' })
  }
  if (value.latest_performer_identity_marker === 'former_member'
    && value.latest_performer_label !== undefined) {
    context.addIssue({ code: 'custom', message: 'invalid_latest_performer_label' })
  }
  if (value.completion_scope === 'per_participant'
    && (latestRequired.some(item => item !== undefined)
      || value.latest_performer_label !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_per_participant_latest' })
  }
})

export const HouseholdChoreV2ChildPriorityDefinitionWireSchema = z.object({
  ...priorityDefinitionBaseShape,
  own_state: HouseholdChoreV2ChildPriorityStateWireSchema,
}).strict().superRefine((value, context) => {
  const dueFields = [value.priority_due_on, value.priority_due_at, value.own_state.due_on]
  if (value.cadence_days === undefined) {
    if (dueFields.some(item => item !== undefined) || value.own_state.is_remaining) {
      context.addIssue({ code: 'custom', message: 'invalid_null_cadence_state' })
    }
  } else if (dueFields.some(item => item === undefined)) {
    context.addIssue({ code: 'custom', message: 'missing_priority_due' })
  }
  if (value.priority_due_on !== value.own_state.due_on) {
    context.addIssue({ code: 'custom', message: 'invalid_child_priority_due' })
  }
})

const memberPriorityDashboardDataSchema = z.object({
  viewer_type: z.literal('member'),
  own_participant_id: uuidSchema,
  server_today: HouseholdChoreIsoDateSchema,
  next_day_boundary_at: timestampSchema,
  participants: z.array(z.object({
    participant_id: uuidSchema,
    label: labelSchema,
    identity_marker: identityMarkerSchema,
    is_viewer: z.boolean(),
  }).strict()).max(100),
  definitions: z.array(HouseholdChoreV2MemberPriorityDefinitionWireSchema).max(200),
}).strict().superRefine((value, context) => {
  if (value.participants.filter(item => item.is_viewer).length !== 1
    || !value.participants.some(item => (
      item.participant_id === value.own_participant_id && item.is_viewer
    ))) {
    context.addIssue({ code: 'custom', message: 'invalid_priority_viewer' })
  }
})

const childPriorityDashboardDataSchema = z.object({
  viewer_type: z.literal('child'),
  own_participant_id: uuidSchema,
  server_today: HouseholdChoreIsoDateSchema,
  next_day_boundary_at: timestampSchema,
  definitions: z.array(HouseholdChoreV2ChildPriorityDefinitionWireSchema).max(200),
}).strict().superRefine((value, context) => {
  if (value.definitions.some(
    definition => definition.own_state.participant_id !== value.own_participant_id,
  )) {
    context.addIssue({ code: 'custom', message: 'invalid_child_priority_owner' })
  }
})

export const HouseholdChoreV2PriorityDashboardDataWireSchema = z.union([
  memberPriorityDashboardDataSchema,
  childPriorityDashboardDataSchema,
])

const assignmentBaseShape = {
  assignment_id: uuidSchema,
  title: titleSchema,
  description: optionalDescriptionSchema,
  materials: optionalMaterialsSchema,
  participant_label: labelSchema.optional(),
  participant_identity_marker: identityMarkerSchema,
  points: pointsSchema,
  origin: assignmentOriginSchema,
  status: z.enum(['open', 'completed', 'cancelled']),
  created_at: timestampSchema,
  performed_on: HouseholdChoreIsoDateSchema.optional(),
  recorded_at: timestampSchema.optional(),
  completed_at: timestampSchema.optional(),
  cancelled_at: timestampSchema.optional(),
  can_correct_date: z.boolean(),
}

function refineAssignmentDates(value: {
  status: 'open' | 'completed' | 'cancelled'
  performed_on?: string
  recorded_at?: string
  completed_at?: string
  cancelled_at?: string
  can_correct_date: boolean
}, context: z.RefinementCtx) {
  const completed = value.status === 'completed'
  const completionFields = [value.performed_on, value.recorded_at, value.completed_at]
  if (completed !== completionFields.every(item => item !== undefined)
    || (!completed && completionFields.some(item => item !== undefined))) {
    context.addIssue({ code: 'custom', message: 'invalid_assignment_completion_dates' })
  }
  if (value.recorded_at !== value.completed_at) {
    context.addIssue({ code: 'custom', message: 'invalid_assignment_recorded_at' })
  }
  if ((value.status === 'cancelled') !== (value.cancelled_at !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_assignment_cancelled_at' })
  }
}

const memberAssignmentSchema = z.object({
  ...assignmentBaseShape,
  circle_id: uuidSchema,
  definition_id: uuidSchema,
  participant_id: uuidSchema,
  completion_sequence: nonNegativeIntegerSchema.max(2147483647),
  version: versionSchema,
  recorder_label: labelSchema.optional(),
}).strict().superRefine((value, context) => {
  refineAssignmentDates(value, context)
  if ((value.participant_identity_marker === 'current')
    !== (value.participant_label !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_participant_label' })
  }
  if (value.can_correct_date !== (value.status === 'completed')) {
    context.addIssue({ code: 'custom', message: 'invalid_member_correction_capability' })
  }
  if (value.status === 'completed' && value.completion_sequence < 1) {
    context.addIssue({ code: 'custom', message: 'invalid_completion_sequence' })
  }
  if (value.status !== 'completed' && value.recorder_label !== undefined) {
    context.addIssue({ code: 'custom', message: 'invalid_recorder_label' })
  }
})

const childAssignmentSchema = z.object({
  ...assignmentBaseShape,
  own_assignment: z.literal(true),
  completion_sequence: positiveSequenceSchema.optional(),
  version: versionSchema.optional(),
  can_complete: z.boolean(),
  can_cancel: z.boolean(),
}).strict().superRefine((value, context) => {
  refineAssignmentDates(value, context)
  if ((value.participant_identity_marker === 'current')
    !== (value.participant_label !== undefined)) {
    context.addIssue({ code: 'custom', message: 'invalid_participant_label' })
  }
  const open = value.status === 'open'
  if (value.can_complete !== open || value.can_cancel !== open) {
    context.addIssue({ code: 'custom', message: 'invalid_child_assignment_capability' })
  }
  const correctable = value.status === 'completed' && value.can_correct_date
  if (open) {
    if (value.version === undefined || value.completion_sequence !== undefined
      || value.can_correct_date) {
      context.addIssue({ code: 'custom', message: 'invalid_child_open_state' })
    }
  } else if (correctable) {
    if (value.version === undefined || value.completion_sequence === undefined) {
      context.addIssue({ code: 'custom', message: 'invalid_child_correction_state' })
    }
  } else if (value.version !== undefined || value.completion_sequence !== undefined) {
    context.addIssue({ code: 'custom', message: 'child_state_leak' })
  }
})

const memberAssignmentDetailDataSchema = z.object({
  viewer_type: z.literal('member'),
  assignment: memberAssignmentSchema,
  timeline: HouseholdChoreV2HistoryPageWireSchema,
}).strict()

const childAssignmentDetailDataSchema = z.object({
  viewer_type: z.literal('child'),
  assignment: childAssignmentSchema,
  timeline: HouseholdChoreV2HistoryPageWireSchema,
}).strict()

export const HouseholdChoreV2AssignmentDetailDataWireSchema = z.discriminatedUnion(
  'viewer_type',
  [memberAssignmentDetailDataSchema, childAssignmentDetailDataSchema],
)

const memberDefinitionDetailDataSchema = z.object({
  viewer_type: z.literal('member'),
  server_today: HouseholdChoreIsoDateSchema,
  definition: HouseholdChoreV2MemberPriorityDefinitionWireSchema,
  history: HouseholdChoreV2HistoryPageWireSchema,
}).strict()

const childDefinitionDetailDataSchema = z.object({
  viewer_type: z.literal('child'),
  server_today: HouseholdChoreIsoDateSchema,
  definition: HouseholdChoreV2ChildPriorityDefinitionWireSchema,
  history: HouseholdChoreV2HistoryPageWireSchema,
}).strict()

export const HouseholdChoreV2DefinitionDetailDataWireSchema = z.discriminatedUnion(
  'viewer_type',
  [memberDefinitionDetailDataSchema, childDefinitionDetailDataSchema],
)

const mutationBaseShape = {
  resource_id: uuidSchema,
  version: versionSchema,
  status: z.literal('completed'),
  completion_sequence: versionSchema,
  points_delta: pointsSchema,
  performed_on: HouseholdChoreIsoDateSchema,
  recorded_at: timestampSchema,
}

export const HouseholdChoreV2DefinitionCompletionDataWireSchema = z.object({
  ...mutationBaseShape,
  definition_id: uuidSchema,
  participant_id: uuidSchema,
}).strict()

export const HouseholdChoreV2AssignmentCompletionDataWireSchema = z.object({
  ...mutationBaseShape,
}).strict()

export const HouseholdChoreV2CorrectionDataWireSchema = z.object({
  resource_id: uuidSchema,
  version: versionSchema,
  status: z.literal('completed'),
  completion_sequence: versionSchema,
  performed_on: HouseholdChoreIsoDateSchema,
  recorded_at: timestampSchema,
  points_delta: z.literal(0),
}).strict()

export const HouseholdChoreV2ReadFailureEnvelopeWireSchema = z.object({
  ok: z.literal(false),
  code: z.enum(['not_found', 'not_allowed', 'not_available']),
  data: z.object({}).strict(),
}).strict()

export const HouseholdChoreV2MutationFailureEnvelopeWireSchema = z.union([
  z.object({
    ok: z.literal(false),
    code: z.enum([
      'invalid_performed_date', 'fingerprint_mismatch', 'stale_version',
      'not_allowed', 'not_found', 'not_available',
      'feature_unavailable', 'deletion_pending',
    ]),
    request_id: uuidSchema,
    data: z.object({}).strict(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.literal('terminal_state'),
    request_id: uuidSchema,
    data: z.object({
      current_status: z.enum(['open', 'completed', 'cancelled']),
    }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    code: z.literal('rate_limited'),
    request_id: uuidSchema,
    data: z.object({
      retry_after_seconds: z.number().int().min(1).max(86400),
    }).strict(),
  }).strict(),
])

export type HouseholdChoreV2RawHistoryItem = z.infer<
  typeof HouseholdChoreV2HistoryItemWireSchema
>
export type HouseholdChoreV2RawHistoryPage = z.infer<
  typeof HouseholdChoreV2HistoryPageWireSchema
>
export type HouseholdChoreV2RawPriorityDashboard = z.infer<
  typeof HouseholdChoreV2PriorityDashboardDataWireSchema
>
export type HouseholdChoreV2RawAssignmentDetail = z.infer<
  typeof HouseholdChoreV2AssignmentDetailDataWireSchema
>
export type HouseholdChoreV2RawDefinitionDetail = z.infer<
  typeof HouseholdChoreV2DefinitionDetailDataWireSchema
>

function mapHistoryBase(value: HouseholdChoreV2RawHistoryItem): HouseholdChoreV2HistoryBase {
  return {
    eventId: value.event_id,
    assignmentId: value.assignment_id,
    title: value.title,
    occurredAt: value.occurred_at,
    participantLabel: value.participant_label ?? null,
    participantIdentityMarker: value.participant_identity_marker,
    assignmentOrigin: value.assignment_origin,
    snapshotPoints: value.snapshot_points,
    actorKind: value.actor_kind,
    actorLabel: value.actor_label ?? null,
  }
}

export function mapHouseholdChoreV2HistoryItem(
  value: HouseholdChoreV2RawHistoryItem,
): HouseholdChoreV2HistoryItem {
  const base = mapHistoryBase(value)
  switch (value.event_type) {
    case 'created':
      return { ...base, eventType: value.event_type, statusAfter: value.status_after }
    case 'completed':
    case 'recompleted':
      return {
        ...base,
        eventType: value.event_type,
        statusAfter: value.status_after,
        completionSequence: value.completion_sequence,
        performedOn: value.performed_on,
        recordedAt: value.recorded_at,
        pointsDelta: value.points_delta,
      }
    case 'completion_date_corrected':
      return {
        ...base,
        eventType: value.event_type,
        statusAfter: value.status_after,
        completionSequence: value.completion_sequence,
        performedOn: value.performed_on,
        previousPerformedOn: value.previous_performed_on,
      }
    case 'completion_reversed':
      return {
        ...base,
        eventType: value.event_type,
        statusAfter: value.status_after,
        completionSequence: value.completion_sequence,
        reversedPerformedOn: value.reversed_performed_on,
        pointsDelta: value.points_delta,
        reopenOutcome: value.reopen_outcome,
      }
    case 'cancelled':
      return {
        ...base,
        eventType: value.event_type,
        statusAfter: value.status_after,
        cancellationReason: value.cancellation_reason,
      }
  }
}

export function mapHouseholdChoreV2HistoryPage(
  value: HouseholdChoreV2RawHistoryPage,
): HouseholdChoreV2HistoryPage {
  return {
    items: value.items.map(mapHouseholdChoreV2HistoryItem),
    hasMore: value.has_more,
    nextCursor: value.next_cursor
      ? { occurredAt: value.next_cursor.occurred_at, eventId: value.next_cursor.event_id }
      : null,
  }
}

function mapMemberState(
  value: z.infer<typeof HouseholdChoreV2MemberPriorityStateWireSchema>,
): HouseholdChoreV2MemberPriorityState {
  return {
    participantId: value.participant_id,
    label: value.label,
    identityMarker: value.identity_marker,
    points: value.points,
    valueVersion: value.value_version,
    baselineOn: value.baseline_on,
    dueOn: value.due_on ?? null,
    isRemaining: value.is_remaining,
    latestCompletionId: value.latest_completion_id ?? null,
    latestPerformedOn: value.latest_performed_on ?? null,
    recordedAt: value.recorded_at ?? null,
    oldestOpenAssignmentId: value.oldest_open_assignment_id ?? null,
    oldestOpenAssignmentVersion: value.oldest_open_assignment_version ?? null,
    expectedStateToken: value.expected_state_token,
  }
}

function mapChildState(
  value: z.infer<typeof HouseholdChoreV2ChildPriorityStateWireSchema>,
): HouseholdChoreV2ChildPriorityState {
  return {
    participantId: value.participant_id,
    label: value.label,
    points: value.points,
    baselineOn: value.baseline_on ?? null,
    dueOn: value.due_on ?? null,
    isRemaining: value.is_remaining,
    latestCompletionId: value.latest_completion_id ?? null,
    latestPerformedOn: value.latest_performed_on ?? null,
    recordedAt: value.recorded_at ?? null,
    oldestOpenAssignmentId: value.oldest_open_assignment_id ?? null,
    oldestOpenAssignmentVersion: value.oldest_open_assignment_version ?? null,
    expectedStateToken: value.expected_state_token,
  }
}

function mapMemberDefinition(
  value: z.infer<typeof HouseholdChoreV2MemberPriorityDefinitionWireSchema>,
): HouseholdChoreV2MemberPriorityDefinition {
  const hasLatest = value.latest_performer_id !== undefined
    && value.latest_performer_identity_marker !== undefined
    && value.latest_performed_on !== undefined
    && value.recorded_at !== undefined
  return {
    definitionId: value.definition_id,
    title: value.title,
    description: value.description ?? null,
    materials: value.materials ?? null,
    version: value.version,
    cadenceDays: value.cadence_days ?? null,
    completionScope: value.completion_scope,
    priorityDueOn: value.priority_due_on ?? null,
    priorityDueAt: value.priority_due_at ?? null,
    participantStates: value.participant_states.map(mapMemberState),
    openAssignments: value.open_assignments.map(item => ({
      assignmentId: item.assignment_id,
      participantId: item.participant_id,
      participantLabel: item.participant_label,
      version: item.version,
      createdAt: item.created_at,
    })),
    openAssignmentCount: value.open_assignment_count,
    latestPerformer: hasLatest
      ? {
        participantId: value.latest_performer_id!,
        label: value.latest_performer_label ?? null,
        identityMarker: value.latest_performer_identity_marker!,
        performedOn: value.latest_performed_on!,
        recordedAt: value.recorded_at!,
      }
      : null,
  }
}

function mapChildDefinition(
  value: z.infer<typeof HouseholdChoreV2ChildPriorityDefinitionWireSchema>,
): HouseholdChoreV2ChildPriorityDefinition {
  return {
    definitionId: value.definition_id,
    title: value.title,
    description: value.description ?? null,
    materials: value.materials ?? null,
    cadenceDays: value.cadence_days ?? null,
    completionScope: value.completion_scope,
    priorityDueOn: value.priority_due_on ?? null,
    priorityDueAt: value.priority_due_at ?? null,
    ownState: mapChildState(value.own_state),
  }
}

export function mapHouseholdChoreV2PriorityDashboard(
  value: HouseholdChoreV2RawPriorityDashboard,
): HouseholdChoreV2PriorityDashboard {
  if (value.viewer_type === 'member') {
    return {
      viewerType: 'member',
      ownParticipantId: value.own_participant_id,
      serverToday: value.server_today,
      nextDayBoundaryAt: value.next_day_boundary_at,
      participants: value.participants.map(item => ({
        participantId: item.participant_id,
        label: item.label,
        identityMarker: item.identity_marker,
        isViewer: item.is_viewer,
      })),
      definitions: value.definitions.map(mapMemberDefinition),
    }
  }
  return {
    viewerType: 'child',
    ownParticipantId: value.own_participant_id,
    serverToday: value.server_today,
    nextDayBoundaryAt: value.next_day_boundary_at,
    definitions: value.definitions.map(mapChildDefinition),
  }
}

function mapAssignmentBase(value: z.infer<typeof memberAssignmentSchema>
  | z.infer<typeof childAssignmentSchema>) {
  return {
    assignmentId: value.assignment_id,
    title: value.title,
    description: value.description ?? null,
    materials: value.materials ?? null,
    participantLabel: value.participant_label ?? null,
    participantIdentityMarker: value.participant_identity_marker,
    points: value.points,
    origin: value.origin,
    status: value.status,
    createdAt: value.created_at,
    performedOn: value.performed_on ?? null,
    recordedAt: value.recorded_at ?? null,
    completedAt: value.completed_at ?? null,
    cancelledAt: value.cancelled_at ?? null,
    canCorrectDate: value.can_correct_date,
  }
}

export function mapHouseholdChoreV2AssignmentDetail(
  value: HouseholdChoreV2RawAssignmentDetail,
): HouseholdChoreV2AssignmentDetail {
  if (value.viewer_type === 'member') {
    return {
      viewerType: 'member',
      assignment: {
        ...mapAssignmentBase(value.assignment),
        circleId: value.assignment.circle_id,
        definitionId: value.assignment.definition_id,
        participantId: value.assignment.participant_id,
        completionSequence: value.assignment.completion_sequence,
        version: value.assignment.version,
        recorderLabel: value.assignment.recorder_label ?? null,
      },
      timeline: mapHouseholdChoreV2HistoryPage(value.timeline),
    }
  }
  return {
    viewerType: 'child',
    assignment: {
      ...mapAssignmentBase(value.assignment),
      ownAssignment: true,
      completionSequence: value.assignment.completion_sequence ?? null,
      version: value.assignment.version ?? null,
      canComplete: value.assignment.can_complete,
      canCancel: value.assignment.can_cancel,
    },
    timeline: mapHouseholdChoreV2HistoryPage(value.timeline),
  }
}

export function mapHouseholdChoreV2DefinitionDetail(
  value: HouseholdChoreV2RawDefinitionDetail,
): HouseholdChoreV2DefinitionDetail {
  if (value.viewer_type === 'member') {
    return {
      viewerType: 'member',
      serverToday: value.server_today,
      definition: mapMemberDefinition(value.definition),
      history: mapHouseholdChoreV2HistoryPage(value.history),
    }
  }
  return {
    viewerType: 'child',
    serverToday: value.server_today,
    definition: mapChildDefinition(value.definition),
    history: mapHouseholdChoreV2HistoryPage(value.history),
  }
}
