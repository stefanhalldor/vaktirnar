import 'server-only'

import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import {
  HouseholdChoreV2AssignmentCompletionDataWireSchema,
  HouseholdChoreV2AssignmentDetailDataWireSchema,
  HouseholdChoreV2CorrectionDataWireSchema,
  HouseholdChoreV2DefinitionCompletionDataWireSchema,
  HouseholdChoreV2DefinitionDetailDataWireSchema,
  HouseholdChoreV2HistoryPageWireSchema,
  HouseholdChoreV2MutationFailureEnvelopeWireSchema,
  HouseholdChoreV2PriorityDashboardDataWireSchema,
  HouseholdChoreV2ReadFailureEnvelopeWireSchema,
  mapHouseholdChoreV2AssignmentDetail,
  mapHouseholdChoreV2DefinitionDetail,
  mapHouseholdChoreV2HistoryPage,
  mapHouseholdChoreV2PriorityDashboard,
  isStrictIsoCalendarDate,
  type HouseholdChoreV2ActionError,
  type HouseholdChoreV2ActionResult,
  type HouseholdChoreV2AssignmentDetail,
  type HouseholdChoreV2CompletionData,
  type HouseholdChoreV2CorrectionData,
  type HouseholdChoreV2DefinitionDetail,
  type HouseholdChoreV2HistoryPage,
  type HouseholdChoreV2PriorityDashboard,
} from './contracts-v2'
import {
  CompleteHouseholdChoreAssignmentV2Schema,
  CompleteHouseholdChoreDefinitionV2Schema,
  CorrectHouseholdChoreCompletionDateSchema,
  type CompleteHouseholdChoreAssignmentV2Input,
  type CompleteHouseholdChoreDefinitionV2Input,
  type CorrectHouseholdChoreCompletionDateInput,
} from './validation-v2'
import { HouseholdChoreUuidSchema } from './validation'

export class HouseholdChoreV2RepositoryError extends Error {
  readonly code: HouseholdChoreV2ActionError

  constructor(code: HouseholdChoreV2ActionError) {
    super('household_chore_v2_repository_error')
    this.name = 'HouseholdChoreV2RepositoryError'
    this.code = code
  }
}

function requireUuid(value: string): void {
  if (!HouseholdChoreUuidSchema.safeParse(value).success) {
    throw new HouseholdChoreV2RepositoryError('invalid_input')
  }
}

async function callRpc(name: string, args: object): Promise<unknown> {
  try {
    const { data, error } = await getAdmin().rpc(name, args)
    if (error) {
      console.error('[household-chores-v2] repository request failed')
      throw new HouseholdChoreV2RepositoryError('save_failed')
    }
    return data
  } catch (error) {
    if (error instanceof HouseholdChoreV2RepositoryError) throw error
    console.error('[household-chores-v2] repository request failed')
    throw new HouseholdChoreV2RepositoryError('save_failed')
  }
}

async function loadRead<T>(
  rpcName: string,
  args: object,
  successCode: string,
  dataSchema: z.ZodType<T>,
): Promise<T> {
  const raw = await callRpc(rpcName, args)
  const successOuterSchema = z.object({
    ok: z.literal(true),
    code: z.literal(successCode),
    data: z.unknown(),
  }).strict()
  const successOuter = successOuterSchema.safeParse(raw)
  if (successOuter.success) {
    const data = dataSchema.safeParse(successOuter.data.data)
    if (data.success) return data.data
  }

  const failure = HouseholdChoreV2ReadFailureEnvelopeWireSchema.safeParse(raw)
  if (failure.success) {
    throw new HouseholdChoreV2RepositoryError(failure.data.code)
  }
  console.error('[household-chores-v2] repository response rejected')
  throw new HouseholdChoreV2RepositoryError('save_failed')
}

export interface HouseholdChoreV2HistoryOptions {
  cursor?: { occurredAt: string; eventId: string } | null
  limit?: number
}

const timestampInputSchema = z.string().max(40).refine(value => (
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isStrictIsoCalendarDate(value.slice(0, 10))
  && Number.isFinite(Date.parse(value))
))
const historyOptionsSchema = z.object({
  cursor: z.object({
    occurredAt: timestampInputSchema,
    eventId: HouseholdChoreUuidSchema,
  }).strict().nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict()

function parseHistoryOptions(options: HouseholdChoreV2HistoryOptions) {
  const parsed = historyOptionsSchema.safeParse(options)
  if (!parsed.success) throw new HouseholdChoreV2RepositoryError('invalid_input')
  return {
    cursor: parsed.data.cursor ?? null,
    limit: parsed.data.limit ?? 20,
  }
}

export async function loadHouseholdChorePriorityDashboardV2(
  actorUserId: string,
  circleId: string,
): Promise<HouseholdChoreV2PriorityDashboard> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  const value = await loadRead(
    'household_chore_get_priority_dashboard_v2',
    { p_actor_id: actorUserId, p_circle_id: circleId },
    'get_priority_dashboard_v2_loaded',
    HouseholdChoreV2PriorityDashboardDataWireSchema,
  )
  return mapHouseholdChoreV2PriorityDashboard(value)
}

export async function loadHouseholdChoreDefinitionDetailV3(
  actorUserId: string,
  circleId: string,
  definitionId: string,
): Promise<HouseholdChoreV2DefinitionDetail> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  requireUuid(definitionId)
  const value = await loadRead(
    'household_chore_get_definition_detail_v3',
    {
      p_actor_id: actorUserId,
      p_circle_id: circleId,
      p_definition_id: definitionId,
    },
    'get_definition_detail_v3_loaded',
    HouseholdChoreV2DefinitionDetailDataWireSchema,
  )
  return mapHouseholdChoreV2DefinitionDetail(value)
}

export async function loadHouseholdChoreAssignmentV2(
  actorUserId: string,
  circleId: string,
  assignmentId: string,
): Promise<HouseholdChoreV2AssignmentDetail> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  requireUuid(assignmentId)
  const value = await loadRead(
    'household_chore_get_assignment_v2',
    {
      p_actor_id: actorUserId,
      p_circle_id: circleId,
      p_assignment_id: assignmentId,
    },
    'get_assignment_v2_loaded',
    HouseholdChoreV2AssignmentDetailDataWireSchema,
  )
  return mapHouseholdChoreV2AssignmentDetail(value)
}

async function loadHistoryV2(
  rpcName: 'household_chore_get_definition_history_v2'
    | 'household_chore_get_assignment_timeline_v2',
  successCode: 'get_definition_history_v2_loaded'
    | 'get_assignment_timeline_v2_loaded',
  actorUserId: string,
  circleId: string,
  resourceArgs: { p_definition_id: string } | { p_assignment_id: string },
  options: HouseholdChoreV2HistoryOptions,
): Promise<HouseholdChoreV2HistoryPage> {
  requireUuid(actorUserId)
  requireUuid(circleId)
  const resourceId = 'p_definition_id' in resourceArgs
    ? resourceArgs.p_definition_id
    : resourceArgs.p_assignment_id
  requireUuid(resourceId)
  const page = parseHistoryOptions(options)
  const value = await loadRead(
    rpcName,
    {
      p_actor_id: actorUserId,
      p_circle_id: circleId,
      ...resourceArgs,
      p_cursor_at: page.cursor?.occurredAt ?? null,
      p_cursor_id: page.cursor?.eventId ?? null,
      p_limit: page.limit,
    },
    successCode,
    HouseholdChoreV2HistoryPageWireSchema,
  )
  return mapHouseholdChoreV2HistoryPage(value)
}

export function loadHouseholdChoreDefinitionHistoryV2(
  actorUserId: string,
  circleId: string,
  definitionId: string,
  options: HouseholdChoreV2HistoryOptions = {},
): Promise<HouseholdChoreV2HistoryPage> {
  return loadHistoryV2(
    'household_chore_get_definition_history_v2',
    'get_definition_history_v2_loaded',
    actorUserId,
    circleId,
    { p_definition_id: definitionId },
    options,
  )
}

export function loadHouseholdChoreAssignmentTimelineV2(
  actorUserId: string,
  circleId: string,
  assignmentId: string,
  options: HouseholdChoreV2HistoryOptions = {},
): Promise<HouseholdChoreV2HistoryPage> {
  return loadHistoryV2(
    'household_chore_get_assignment_timeline_v2',
    'get_assignment_timeline_v2_loaded',
    actorUserId,
    circleId,
    { p_assignment_id: assignmentId },
    options,
  )
}

function mapCompletionData(value: z.infer<
  typeof HouseholdChoreV2DefinitionCompletionDataWireSchema
  | typeof HouseholdChoreV2AssignmentCompletionDataWireSchema
>): HouseholdChoreV2CompletionData {
  return {
    resourceId: value.resource_id,
    ...('definition_id' in value ? { definitionId: value.definition_id } : {}),
    ...('participant_id' in value ? { participantId: value.participant_id } : {}),
    version: value.version,
    status: value.status,
    completionSequence: value.completion_sequence,
    pointsDelta: value.points_delta,
    performedOn: value.performed_on,
    recordedAt: value.recorded_at,
  }
}

function mapCorrectionData(
  value: z.infer<typeof HouseholdChoreV2CorrectionDataWireSchema>,
): HouseholdChoreV2CorrectionData {
  return {
    resourceId: value.resource_id,
    version: value.version,
    status: value.status,
    completionSequence: value.completion_sequence,
    performedOn: value.performed_on,
    recordedAt: value.recorded_at,
    pointsDelta: value.points_delta,
  }
}

async function runMutation<TWire, TDomain>(
  rpcName: string,
  args: object,
  requestId: string,
  successCode: 'assignment_completed' | 'completion_date_corrected',
  dataSchema: z.ZodType<TWire>,
  project: (value: TWire) => TDomain,
): Promise<HouseholdChoreV2ActionResult<TDomain>> {
  let raw: unknown
  try {
    raw = await callRpc(rpcName, args)
  } catch {
    return { ok: false, error: 'save_failed' }
  }

  const successOuterSchema = z.object({
    ok: z.literal(true),
    code: z.literal(successCode),
    request_id: z.literal(requestId),
    data: z.unknown(),
  }).strict()
  const successOuter = successOuterSchema.safeParse(raw)
  if (successOuter.success) {
    const data = dataSchema.safeParse(successOuter.data.data)
    if (data.success) return { ok: true, data: project(data.data) }
  }

  const failure = HouseholdChoreV2MutationFailureEnvelopeWireSchema.safeParse(raw)
  if (failure.success && failure.data.request_id === requestId) {
    if (failure.data.code === 'rate_limited') {
      return {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: failure.data.data.retry_after_seconds,
      }
    }
    if (failure.data.code === 'feature_unavailable'
      || failure.data.code === 'deletion_pending') {
      return { ok: false, error: 'feature_disabled' }
    }
    return { ok: false, error: failure.data.code }
  }

  console.error('[household-chores-v2] mutation response rejected')
  return { ok: false, error: 'save_failed' }
}

function invalidInput<T>(): HouseholdChoreV2ActionResult<T> {
  return { ok: false, error: 'invalid_input' }
}

export async function completeHouseholdChoreDefinitionV2(
  actorUserId: string,
  input: CompleteHouseholdChoreDefinitionV2Input,
): Promise<HouseholdChoreV2ActionResult<HouseholdChoreV2CompletionData>> {
  if (!HouseholdChoreUuidSchema.safeParse(actorUserId).success) return invalidInput()
  const parsed = CompleteHouseholdChoreDefinitionV2Schema.safeParse(input)
  if (!parsed.success) return invalidInput()
  const value = parsed.data
  return runMutation(
    'household_chore_complete_definition_v2',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_definition_id: value.definitionId,
      p_participant_id: value.participantId,
      p_expected_state_token: value.expectedStateToken,
      p_performed_on: value.performedOn ?? null,
    },
    value.requestId,
    'assignment_completed',
    HouseholdChoreV2DefinitionCompletionDataWireSchema,
    mapCompletionData,
  )
}

export async function completeHouseholdChoreAssignmentV2(
  actorUserId: string,
  input: CompleteHouseholdChoreAssignmentV2Input,
): Promise<HouseholdChoreV2ActionResult<HouseholdChoreV2CompletionData>> {
  if (!HouseholdChoreUuidSchema.safeParse(actorUserId).success) return invalidInput()
  const parsed = CompleteHouseholdChoreAssignmentV2Schema.safeParse(input)
  if (!parsed.success) return invalidInput()
  const value = parsed.data
  return runMutation(
    'household_chore_complete_assignment_v2',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_assignment_id: value.assignmentId,
      p_expected_version: value.expectedVersion,
      p_performed_on: value.performedOn ?? null,
    },
    value.requestId,
    'assignment_completed',
    HouseholdChoreV2AssignmentCompletionDataWireSchema,
    mapCompletionData,
  )
}

export async function correctHouseholdChoreCompletionDate(
  actorUserId: string,
  input: CorrectHouseholdChoreCompletionDateInput,
): Promise<HouseholdChoreV2ActionResult<HouseholdChoreV2CorrectionData>> {
  if (!HouseholdChoreUuidSchema.safeParse(actorUserId).success) return invalidInput()
  const parsed = CorrectHouseholdChoreCompletionDateSchema.safeParse(input)
  if (!parsed.success) return invalidInput()
  const value = parsed.data
  return runMutation(
    'household_chore_correct_completion_date',
    {
      p_actor_id: actorUserId,
      p_request_id: value.requestId,
      p_circle_id: value.circleId,
      p_assignment_id: value.assignmentId,
      p_expected_version: value.expectedVersion,
      p_completion_sequence: value.completionSequence,
      p_performed_on: value.performedOn,
    },
    value.requestId,
    'completion_date_corrected',
    HouseholdChoreV2CorrectionDataWireSchema,
    mapCorrectionData,
  )
}
