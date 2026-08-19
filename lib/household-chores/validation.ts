import { z } from 'zod'
import type {
  HouseholdChoreCompletionScope,
  HouseholdChoreMembershipType,
} from './contracts'

const FORBIDDEN_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

function normalizedText(min: number, max: number) {
  return z.string().transform((value) => value.normalize('NFC').trim())
    .pipe(z.string().min(min).max(max))
    .refine((value) => !FORBIDDEN_CONTROLS.test(value))
}

const MAX_POSTGRES_BIGINT = BigInt('9223372036854775807')

function bigintVersion(allowZero: boolean) {
  const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/
  return z.string().regex(pattern).max(19).refine((value) => {
    try {
      const parsed = BigInt(value)
      return parsed <= MAX_POSTGRES_BIGINT && (
        allowZero ? parsed >= BigInt(0) : parsed > BigInt(0)
      )
    } catch {
      return false
    }
  })
}

function optionalText(max: number) {
  return z.union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) return null
      const normalized = value.normalize('NFC').trim()
      return normalized.length === 0 ? null : normalized
    })
    .refine((value) => value === null || value.length <= max)
    .refine((value) => value === null || !FORBIDDEN_CONTROLS.test(value))
}

export const HouseholdChoreUuidSchema = z.string().uuid()
export const HouseholdChoreRequestIdSchema = HouseholdChoreUuidSchema
export const HouseholdChoreVersionSchema = bigintVersion(false)
export const HouseholdChoreValueVersionSchema = bigintVersion(true)
export const HouseholdChoreMembershipTypeSchema = z.enum(['member', 'child'])
export const HouseholdChoreCircleNameSchema = normalizedText(1, 120)
  .refine((value) => !value.includes('@'))
export const HouseholdChoreParticipantNameSchema = normalizedText(1, 120)
  .refine((value) => !value.includes('@'))
export const HouseholdChoreDefinitionTitleSchema = normalizedText(1, 120)
export const HouseholdChoreDefinitionDescriptionSchema = optionalText(2000)
export const HouseholdChoreDefinitionMaterialsSchema = optionalText(4000)
export const HouseholdChoreCadenceDaysSchema = z.number().int().min(1).max(3650)
export const HouseholdChoreCompletionScopeSchema = z.enum(['global', 'per_participant'])
export const HouseholdChoreDisplayReferenceSchema = z.string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/))

const request = { requestId: HouseholdChoreRequestIdSchema }
const circle = { circleId: HouseholdChoreUuidSchema }
const expected = { expectedVersion: HouseholdChoreVersionSchema }

export const CreateHouseholdChoreCircleSchema = z.object({
  ...request,
  name: HouseholdChoreCircleNameSchema,
}).strict()

export const RenameHouseholdChoreCircleSchema = z.object({
  ...request,
  ...circle,
  ...expected,
  name: HouseholdChoreCircleNameSchema,
}).strict()

export const DeleteHouseholdChoreCircleSchema = z.object({
  ...request,
  ...circle,
  ...expected,
  displayReference: HouseholdChoreDisplayReferenceSchema,
}).strict()

export const CreateHouseholdChoreInvitationSchema = z.object({
  ...request,
  ...circle,
  relationshipId: HouseholdChoreUuidSchema,
  requestedType: HouseholdChoreMembershipTypeSchema,
}).strict()

export const CancelHouseholdChoreInvitationSchema = z.object({
  ...request,
  ...circle,
  invitationId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

export const DecideHouseholdChoreInvitationSchema = z.object({
  ...request,
  invitationId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

export const ChangeHouseholdChoreMembershipTypeSchema = z.object({
  ...request,
  ...circle,
  membershipId: HouseholdChoreUuidSchema,
  ...expected,
  newType: HouseholdChoreMembershipTypeSchema,
}).strict()

export const RemoveHouseholdChoreMemberSchema = z.object({
  ...request,
  ...circle,
  membershipId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

export const LeaveHouseholdChoreCircleSchema = z.object({
  ...request,
  ...circle,
  ...expected,
}).strict()

export const CreateHouseholdChoreParticipantSchema = z.object({
  ...request,
  ...circle,
  label: HouseholdChoreParticipantNameSchema,
}).strict()

export const RenameHouseholdChoreParticipantSchema = z.object({
  ...request,
  ...circle,
  participantId: HouseholdChoreUuidSchema,
  ...expected,
  label: HouseholdChoreParticipantNameSchema,
}).strict()

export const LinkHouseholdChoreParticipantSchema = z.object({
  ...request,
  ...circle,
  participantId: HouseholdChoreUuidSchema,
  ...expected,
  recipientEmail: z.string().trim().min(3).max(320).email(),
  requestedType: HouseholdChoreMembershipTypeSchema,
}).strict()

export const HouseholdChoreParticipantLifecycleSchema = z.object({
  ...request,
  ...circle,
  participantId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

export const CreateHouseholdChoreDefinitionSchema = z.object({
  ...request,
  ...circle,
  title: HouseholdChoreDefinitionTitleSchema,
  description: HouseholdChoreDefinitionDescriptionSchema,
  materials: HouseholdChoreDefinitionMaterialsSchema,
  cadenceDays: HouseholdChoreCadenceDaysSchema,
  completionScope: HouseholdChoreCompletionScopeSchema,
}).strict()

export const UpdateHouseholdChoreDefinitionSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  ...expected,
  title: HouseholdChoreDefinitionTitleSchema,
  description: HouseholdChoreDefinitionDescriptionSchema,
  materials: HouseholdChoreDefinitionMaterialsSchema,
  cadenceDays: HouseholdChoreCadenceDaysSchema,
  completionScope: HouseholdChoreCompletionScopeSchema,
}).strict()

export const CompleteHouseholdChoreDefinitionSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  participantId: HouseholdChoreUuidSchema,
  expectedStateToken: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export const HouseholdChoreDefinitionLifecycleSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

export const SetHouseholdChoreParticipantValueSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  participantId: HouseholdChoreUuidSchema,
  expectedDefinitionVersion: HouseholdChoreVersionSchema,
  expectedValueVersion: HouseholdChoreValueVersionSchema,
  points: z.number().int().min(1).max(100).nullable(),
  active: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.active && value.points === null) {
    context.addIssue({ code: 'custom', path: ['points'], message: 'required' })
  }
  if (!value.active && (value.points !== null || value.expectedValueVersion === '0')) {
    context.addIssue({ code: 'custom', path: ['active'], message: 'invalid' })
  }
})

export const AssignHouseholdChoreSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  participantId: HouseholdChoreUuidSchema,
  expectedDefinitionVersion: HouseholdChoreVersionSchema,
  expectedValueVersion: HouseholdChoreVersionSchema,
}).strict()

export const SelfAssignHouseholdChoreSchema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  expectedDefinitionVersion: HouseholdChoreVersionSchema,
  expectedValueVersion: HouseholdChoreVersionSchema,
}).strict()

export const RepeatHouseholdChoreAssignmentSchema = z.object({
  ...request,
  ...circle,
  sourceAssignmentId: HouseholdChoreUuidSchema,
  expectedSourceVersion: HouseholdChoreVersionSchema,
  expectedDefinitionVersion: HouseholdChoreVersionSchema,
  expectedValueVersion: HouseholdChoreVersionSchema,
}).strict()

export const HouseholdChoreAssignmentLifecycleSchema = z.object({
  ...request,
  ...circle,
  assignmentId: HouseholdChoreUuidSchema,
  ...expected,
}).strict()

// Action-specific aliases keep the server-action surface explicit while the
// underlying payload shape remains intentionally identical.
export const AcceptHouseholdChoreInvitationSchema = DecideHouseholdChoreInvitationSchema
export const DeclineHouseholdChoreInvitationSchema = DecideHouseholdChoreInvitationSchema
export const ArchiveHouseholdChoreParticipantSchema = HouseholdChoreParticipantLifecycleSchema
export const ReactivateHouseholdChoreParticipantSchema = HouseholdChoreParticipantLifecycleSchema
export const ArchiveHouseholdChoreDefinitionSchema = HouseholdChoreDefinitionLifecycleSchema
export const ReactivateHouseholdChoreDefinitionSchema = HouseholdChoreDefinitionLifecycleSchema
export const CompleteHouseholdChoreAssignmentSchema = HouseholdChoreAssignmentLifecycleSchema
export const CancelHouseholdChoreAssignmentSchema = HouseholdChoreAssignmentLifecycleSchema
export const CancelOwnHouseholdChoreAssignmentSchema = HouseholdChoreAssignmentLifecycleSchema
export const UndoHouseholdChoreCompletionSchema = HouseholdChoreAssignmentLifecycleSchema

export type CreateHouseholdChoreCircleInput = z.infer<typeof CreateHouseholdChoreCircleSchema>
export type RenameHouseholdChoreCircleInput = z.infer<typeof RenameHouseholdChoreCircleSchema>
export type DeleteHouseholdChoreCircleInput = z.infer<typeof DeleteHouseholdChoreCircleSchema>
export type CreateHouseholdChoreInvitationInput = z.infer<typeof CreateHouseholdChoreInvitationSchema>
export type CancelHouseholdChoreInvitationInput = z.infer<typeof CancelHouseholdChoreInvitationSchema>
export type DecideHouseholdChoreInvitationInput = z.infer<typeof DecideHouseholdChoreInvitationSchema>
export type ChangeHouseholdChoreMembershipTypeInput = z.infer<typeof ChangeHouseholdChoreMembershipTypeSchema>
export type RemoveHouseholdChoreMemberInput = z.infer<typeof RemoveHouseholdChoreMemberSchema>
export type LeaveHouseholdChoreCircleInput = z.infer<typeof LeaveHouseholdChoreCircleSchema>
export type CreateHouseholdChoreParticipantInput = z.infer<typeof CreateHouseholdChoreParticipantSchema>
export type RenameHouseholdChoreParticipantInput = z.infer<typeof RenameHouseholdChoreParticipantSchema>
export type LinkHouseholdChoreParticipantInput = z.infer<typeof LinkHouseholdChoreParticipantSchema>
export type HouseholdChoreParticipantLifecycleInput = z.infer<typeof HouseholdChoreParticipantLifecycleSchema>
export type CreateHouseholdChoreDefinitionInput = z.infer<typeof CreateHouseholdChoreDefinitionSchema>
export type UpdateHouseholdChoreDefinitionInput = z.infer<typeof UpdateHouseholdChoreDefinitionSchema>
export type CompleteHouseholdChoreDefinitionInput = z.infer<typeof CompleteHouseholdChoreDefinitionSchema>
export type HouseholdChoreDefinitionLifecycleInput = z.infer<typeof HouseholdChoreDefinitionLifecycleSchema>
export type SetHouseholdChoreParticipantValueInput = z.infer<typeof SetHouseholdChoreParticipantValueSchema>
export type AssignHouseholdChoreInput = z.infer<typeof AssignHouseholdChoreSchema>
export type SelfAssignHouseholdChoreInput = z.infer<typeof SelfAssignHouseholdChoreSchema>
export type RepeatHouseholdChoreAssignmentInput = z.infer<typeof RepeatHouseholdChoreAssignmentSchema>
export type HouseholdChoreAssignmentLifecycleInput = z.infer<typeof HouseholdChoreAssignmentLifecycleSchema>

export function isHouseholdChoreMembershipType(
  value: unknown,
): value is HouseholdChoreMembershipType {
  return value === 'member' || value === 'child'
}

export function isHouseholdChoreCompletionScope(
  value: unknown,
): value is HouseholdChoreCompletionScope {
  return value === 'global' || value === 'per_participant'
}
