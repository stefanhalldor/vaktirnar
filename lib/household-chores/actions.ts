'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { z } from 'zod'
import type {
  HouseholdChoreActionResult,
  HouseholdChoreMutationData,
} from './contracts'
import {
  TASKS_PATH,
} from './contracts'
import {
  householdChoreAssignmentPath,
  householdChoreCirclePath,
  householdChoreDefinitionPath,
  householdChoreDefinitionsPath,
  householdChoreInvitationPath,
  householdChoreMembershipsPath,
  householdChorePeoplePath,
  householdChoreSelfServicePath,
} from './paths'
import {
  guardHouseholdChoreAccess,
  guardHouseholdChoreSession,
} from './guard'
import {
  AcceptHouseholdChoreInvitationSchema,
  ArchiveHouseholdChoreDefinitionSchema,
  ArchiveHouseholdChoreParticipantSchema,
  AssignHouseholdChoreSchema,
  CancelHouseholdChoreAssignmentSchema,
  CancelHouseholdChoreInvitationSchema,
  CancelOwnHouseholdChoreAssignmentSchema,
  ChangeHouseholdChoreMembershipTypeSchema,
  CompleteHouseholdChoreAssignmentSchema,
  CompleteHouseholdChoreDefinitionSchema,
  CreateHouseholdChoreCircleSchema,
  CreateHouseholdChoreDefinitionSchema,
  CreateHouseholdChoreInvitationSchema,
  CreateHouseholdChoreParticipantSchema,
  LinkHouseholdChoreParticipantSchema,
  DeclineHouseholdChoreInvitationSchema,
  DeleteHouseholdChoreCircleSchema,
  LeaveHouseholdChoreCircleSchema,
  ReactivateHouseholdChoreDefinitionSchema,
  ReactivateHouseholdChoreParticipantSchema,
  RemoveHouseholdChoreMemberSchema,
  RenameHouseholdChoreCircleSchema,
  RenameHouseholdChoreParticipantSchema,
  RepeatHouseholdChoreAssignmentSchema,
  SelfAssignHouseholdChoreSchema,
  SetHouseholdChoreParticipantValueSchema,
  UndoHouseholdChoreCompletionSchema,
  UpdateHouseholdChoreDefinitionSchema,
} from './validation'
import {
  acceptHouseholdChoreInvitation,
  archiveHouseholdChoreDefinition,
  archiveHouseholdChoreParticipant,
  assignHouseholdChore,
  cancelHouseholdChoreAssignment,
  cancelHouseholdChoreInvitation,
  cancelOwnHouseholdChoreAssignment,
  changeHouseholdChoreMembershipType,
  completeHouseholdChoreAssignment,
  completeHouseholdChoreDefinition,
  createHouseholdChoreCircle,
  createHouseholdChoreDefinition,
  createHouseholdChoreInvitation,
  createHouseholdChoreParticipant,
  linkHouseholdChoreParticipant,
  declineHouseholdChoreInvitation,
  deleteHouseholdChoreCircle,
  leaveHouseholdChoreCircle,
  reactivateHouseholdChoreDefinition,
  reactivateHouseholdChoreParticipant,
  removeHouseholdChoreMember,
  renameHouseholdChoreCircle,
  renameHouseholdChoreParticipant,
  repeatHouseholdChoreAssignment,
  selfAssignHouseholdChore,
  setHouseholdChoreParticipantValue,
  undoHouseholdChoreCompletion,
  updateHouseholdChoreDefinition,
} from './repository.server'

type MutationResult = HouseholdChoreActionResult<HouseholdChoreMutationData>
type Mutation<T> = (actorId: string, input: T) => Promise<MutationResult>
type Guard = () => Promise<{ user: { id: string } }>

function invalidInput(): MutationResult {
  return { ok: false, error: 'invalid_input' }
}

function revalidateHouseholdChoreMutation(
  input: Record<string, unknown>,
  result: HouseholdChoreMutationData,
) {
  const circleId = typeof input.circleId === 'string'
    ? input.circleId
    : result.circleId
  const invitationId = typeof input.invitationId === 'string'
    ? input.invitationId
    : undefined
  const definitionId = typeof input.definitionId === 'string'
    ? input.definitionId
    : undefined
  const assignmentId = typeof input.assignmentId === 'string'
    ? input.assignmentId
    : undefined

  const paths = [
    TASKS_PATH,
    householdChoreMembershipsPath(),
    '/auth-mvp/heim',
  ]

  if (circleId) {
    paths.push(
      householdChoreCirclePath(circleId),
      householdChorePeoplePath(circleId),
      householdChoreDefinitionsPath(circleId),
      householdChoreSelfServicePath(circleId),
    )
    if (definitionId) {
      paths.push(householdChoreDefinitionPath(circleId, definitionId))
    }
    if (assignmentId) {
      paths.push(householdChoreAssignmentPath(circleId, assignmentId))
    }
  }
  if (invitationId) paths.push(householdChoreInvitationPath(invitationId))

  // The database mutation is already committed and sealed by request_id here.
  // Cache invalidation must never turn that success into an uncertain failure.
  for (const path of new Set(paths)) {
    try {
      revalidatePath(path)
    } catch {
      console.error('[household-chores] cache revalidation failed')
    }
  }
}

async function runMutation<TSchema extends z.ZodTypeAny>(
  rawInput: unknown,
  schema: TSchema,
  guard: Guard,
  mutation: Mutation<z.output<TSchema>>,
  operation: string,
): Promise<MutationResult> {
  // Auth/rollout redirects are intentional Next.js control flow and must not
  // be swallowed by the repository error boundary below.
  const { user } = await guard()
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return invalidInput()

  let result: MutationResult
  try {
    result = await mutation(user.id, parsed.data)
  } catch {
    console.error(`[household-chores] ${operation} failed`)
    return { ok: false, error: 'save_failed' }
  }

  if (result.ok) {
    revalidateHouseholdChoreMutation(
      parsed.data as Record<string, unknown>,
      result.data,
    )
    return result
  }

  const input = parsed.data as Record<string, unknown>
  if (guard === fullGuard
    && typeof input.circleId === 'string'
    && (result.error === 'not_found' || result.error === 'not_allowed')) {
    // A member may have been removed or demoted while a private management
    // tree was open. A server redirect discards that stale tree immediately;
    // SQL remains the final authority and has already denied the write.
    redirect(TASKS_PATH)
  }

  return result
}

const fullGuard: Guard = guardHouseholdChoreAccess
const sessionGuard: Guard = guardHouseholdChoreSession

export async function createHouseholdChoreCircleAction(rawInput: unknown) {
  return runMutation(rawInput, CreateHouseholdChoreCircleSchema, fullGuard, createHouseholdChoreCircle, 'create circle')
}

export async function renameHouseholdChoreCircleAction(rawInput: unknown) {
  return runMutation(rawInput, RenameHouseholdChoreCircleSchema, fullGuard, renameHouseholdChoreCircle, 'rename circle')
}

export async function deleteHouseholdChoreCircleAction(rawInput: unknown) {
  return runMutation(rawInput, DeleteHouseholdChoreCircleSchema, sessionGuard, deleteHouseholdChoreCircle, 'delete circle')
}

export async function createHouseholdChoreInvitationAction(rawInput: unknown) {
  return runMutation(rawInput, CreateHouseholdChoreInvitationSchema, fullGuard, createHouseholdChoreInvitation, 'create invitation')
}

export async function cancelHouseholdChoreInvitationAction(rawInput: unknown) {
  return runMutation(rawInput, CancelHouseholdChoreInvitationSchema, fullGuard, cancelHouseholdChoreInvitation, 'cancel invitation')
}

export async function acceptHouseholdChoreInvitationAction(rawInput: unknown) {
  return runMutation(rawInput, AcceptHouseholdChoreInvitationSchema, fullGuard, acceptHouseholdChoreInvitation, 'accept invitation')
}

export async function declineHouseholdChoreInvitationAction(rawInput: unknown) {
  return runMutation(rawInput, DeclineHouseholdChoreInvitationSchema, sessionGuard, declineHouseholdChoreInvitation, 'decline invitation')
}

export async function changeHouseholdChoreMembershipTypeAction(rawInput: unknown) {
  return runMutation(rawInput, ChangeHouseholdChoreMembershipTypeSchema, fullGuard, changeHouseholdChoreMembershipType, 'change membership type')
}

export async function removeHouseholdChoreMemberAction(rawInput: unknown) {
  return runMutation(rawInput, RemoveHouseholdChoreMemberSchema, fullGuard, removeHouseholdChoreMember, 'remove member')
}

export async function leaveHouseholdChoreCircleAction(rawInput: unknown) {
  return runMutation(rawInput, LeaveHouseholdChoreCircleSchema, sessionGuard, leaveHouseholdChoreCircle, 'leave circle')
}

export async function createHouseholdChoreParticipantAction(rawInput: unknown) {
  return runMutation(rawInput, CreateHouseholdChoreParticipantSchema, fullGuard, createHouseholdChoreParticipant, 'create participant')
}

export async function renameHouseholdChoreParticipantAction(rawInput: unknown) {
  return runMutation(rawInput, RenameHouseholdChoreParticipantSchema, fullGuard, renameHouseholdChoreParticipant, 'rename participant')
}

export async function linkHouseholdChoreParticipantAction(rawInput: unknown) {
  return runMutation(rawInput, LinkHouseholdChoreParticipantSchema, fullGuard, linkHouseholdChoreParticipant, 'link participant')
}

export async function archiveHouseholdChoreParticipantAction(rawInput: unknown) {
  return runMutation(rawInput, ArchiveHouseholdChoreParticipantSchema, fullGuard, archiveHouseholdChoreParticipant, 'archive participant')
}

export async function reactivateHouseholdChoreParticipantAction(rawInput: unknown) {
  return runMutation(rawInput, ReactivateHouseholdChoreParticipantSchema, fullGuard, reactivateHouseholdChoreParticipant, 'reactivate participant')
}

export async function createHouseholdChoreDefinitionAction(rawInput: unknown) {
  return runMutation(rawInput, CreateHouseholdChoreDefinitionSchema, fullGuard, createHouseholdChoreDefinition, 'create definition')
}

export async function updateHouseholdChoreDefinitionAction(rawInput: unknown) {
  return runMutation(rawInput, UpdateHouseholdChoreDefinitionSchema, fullGuard, updateHouseholdChoreDefinition, 'update definition')
}

export async function archiveHouseholdChoreDefinitionAction(rawInput: unknown) {
  return runMutation(rawInput, ArchiveHouseholdChoreDefinitionSchema, fullGuard, archiveHouseholdChoreDefinition, 'archive definition')
}

export async function reactivateHouseholdChoreDefinitionAction(rawInput: unknown) {
  return runMutation(rawInput, ReactivateHouseholdChoreDefinitionSchema, fullGuard, reactivateHouseholdChoreDefinition, 'reactivate definition')
}

export async function setHouseholdChoreParticipantValueAction(rawInput: unknown) {
  return runMutation(rawInput, SetHouseholdChoreParticipantValueSchema, fullGuard, setHouseholdChoreParticipantValue, 'set participant value')
}

export async function assignHouseholdChoreAction(rawInput: unknown) {
  return runMutation(rawInput, AssignHouseholdChoreSchema, fullGuard, assignHouseholdChore, 'assign chore')
}

export async function selfAssignHouseholdChoreAction(rawInput: unknown) {
  return runMutation(rawInput, SelfAssignHouseholdChoreSchema, fullGuard, selfAssignHouseholdChore, 'self-assign chore')
}

export async function repeatHouseholdChoreAssignmentAction(rawInput: unknown) {
  return runMutation(rawInput, RepeatHouseholdChoreAssignmentSchema, fullGuard, repeatHouseholdChoreAssignment, 'repeat assignment')
}

export async function completeHouseholdChoreAssignmentAction(rawInput: unknown) {
  return runMutation(rawInput, CompleteHouseholdChoreAssignmentSchema, fullGuard, completeHouseholdChoreAssignment, 'complete assignment')
}

export async function completeHouseholdChoreDefinitionAction(rawInput: unknown) {
  return runMutation(
    rawInput,
    CompleteHouseholdChoreDefinitionSchema,
    fullGuard,
    completeHouseholdChoreDefinition,
    'complete definition',
  )
}

export async function cancelHouseholdChoreAssignmentAction(rawInput: unknown) {
  return runMutation(rawInput, CancelHouseholdChoreAssignmentSchema, fullGuard, cancelHouseholdChoreAssignment, 'cancel assignment')
}

export async function cancelOwnHouseholdChoreAssignmentAction(rawInput: unknown) {
  return runMutation(rawInput, CancelOwnHouseholdChoreAssignmentSchema, fullGuard, cancelOwnHouseholdChoreAssignment, 'cancel own assignment')
}

export async function undoHouseholdChoreCompletionAction(rawInput: unknown) {
  return runMutation(rawInput, UndoHouseholdChoreCompletionSchema, fullGuard, undoHouseholdChoreCompletion, 'undo completion')
}
