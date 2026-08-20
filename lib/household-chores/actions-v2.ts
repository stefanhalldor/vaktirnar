'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { guardHouseholdChoreAccess } from './guard'
import {
  householdChoreAssignmentPath,
  householdChoreCirclePath,
  householdChoreDefinitionPath,
  householdChoreDefinitionsPath,
  householdChoreSelfServicePath,
} from './paths'
import { TASKS_PATH } from './contracts'
import type {
  HouseholdChoreV2ActionResult,
  HouseholdChoreV2CompletionData,
  HouseholdChoreV2CorrectionData,
} from './contracts-v2'
import {
  CompleteHouseholdChoreAssignmentV2Schema,
  CompleteHouseholdChoreDefinitionV2Schema,
  CorrectHouseholdChoreCompletionDateSchema,
} from './validation-v2'
import {
  completeHouseholdChoreAssignmentV2,
  completeHouseholdChoreDefinitionV2,
  correctHouseholdChoreCompletionDate,
} from './repository-v2.server'

type V2MutationData = HouseholdChoreV2CompletionData | HouseholdChoreV2CorrectionData
type V2MutationResult = HouseholdChoreV2ActionResult<V2MutationData>
type V2Mutation<T> = (actorId: string, input: T) => Promise<V2MutationResult>

function revalidateV2Mutation(
  input: { circleId: string; definitionId?: string; assignmentId?: string },
  result: V2MutationData,
) {
  const paths = [
    TASKS_PATH,
    householdChoreCirclePath(input.circleId),
    householdChoreDefinitionsPath(input.circleId),
    householdChoreSelfServicePath(input.circleId),
  ]
  if (input.definitionId) {
    paths.push(householdChoreDefinitionPath(input.circleId, input.definitionId))
  }
  if (input.assignmentId) {
    paths.push(householdChoreAssignmentPath(input.circleId, input.assignmentId))
  }
  if ('definitionId' in result && result.definitionId) {
    paths.push(householdChoreDefinitionPath(input.circleId, result.definitionId))
  }
  paths.push(householdChoreAssignmentPath(input.circleId, result.resourceId))

  for (const path of new Set(paths)) {
    try {
      revalidatePath(path)
    } catch {
      console.error('[household-chores-v2] cache revalidation failed')
    }
  }
}

async function runV2Mutation<TSchema extends z.ZodTypeAny>(
  rawInput: unknown,
  schema: TSchema,
  mutation: V2Mutation<z.output<TSchema>>,
  operation: string,
): Promise<V2MutationResult> {
  // The actor is always derived before parsing client input. Strict schemas do
  // not accept an actor field; SQL remains membership/member-child authority.
  const { user } = await guardHouseholdChoreAccess()
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  let result: V2MutationResult
  try {
    result = await mutation(user.id, parsed.data)
  } catch {
    console.error(`[household-chores-v2] ${operation} failed`)
    return { ok: false, error: 'save_failed' }
  }
  if (result.ok) {
    revalidateV2Mutation(parsed.data, result.data)
  }
  return result
}

export async function completeHouseholdChoreDefinitionV2Action(rawInput: unknown) {
  return runV2Mutation(
    rawInput,
    CompleteHouseholdChoreDefinitionV2Schema,
    completeHouseholdChoreDefinitionV2,
    'complete definition',
  )
}

export async function completeHouseholdChoreAssignmentV2Action(rawInput: unknown) {
  return runV2Mutation(
    rawInput,
    CompleteHouseholdChoreAssignmentV2Schema,
    completeHouseholdChoreAssignmentV2,
    'complete assignment',
  )
}

export async function correctHouseholdChoreCompletionDateAction(rawInput: unknown) {
  return runV2Mutation(
    rawInput,
    CorrectHouseholdChoreCompletionDateSchema,
    correctHouseholdChoreCompletionDate,
    'correct completion date',
  )
}
