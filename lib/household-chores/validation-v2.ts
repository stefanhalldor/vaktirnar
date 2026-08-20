import { z } from 'zod'
import {
  HouseholdChoreIsoDateSchema,
} from './contracts-v2'
import {
  HouseholdChoreRequestIdSchema,
  HouseholdChoreUuidSchema,
  HouseholdChoreVersionSchema,
} from './validation'

const request = { requestId: HouseholdChoreRequestIdSchema }
const circle = { circleId: HouseholdChoreUuidSchema }

export const CompleteHouseholdChoreDefinitionV2Schema = z.object({
  ...request,
  ...circle,
  definitionId: HouseholdChoreUuidSchema,
  participantId: HouseholdChoreUuidSchema,
  expectedStateToken: z.string().regex(/^[0-9a-f]{64}$/),
  performedOn: HouseholdChoreIsoDateSchema.optional(),
}).strict()

export const CompleteHouseholdChoreAssignmentV2Schema = z.object({
  ...request,
  ...circle,
  assignmentId: HouseholdChoreUuidSchema,
  expectedVersion: HouseholdChoreVersionSchema,
  performedOn: HouseholdChoreIsoDateSchema.optional(),
}).strict()

export const CorrectHouseholdChoreCompletionDateSchema = z.object({
  ...request,
  ...circle,
  assignmentId: HouseholdChoreUuidSchema,
  expectedVersion: HouseholdChoreVersionSchema,
  completionSequence: z.number().int().min(1).max(2147483647),
  performedOn: HouseholdChoreIsoDateSchema,
}).strict()

export type CompleteHouseholdChoreDefinitionV2Input = z.infer<
  typeof CompleteHouseholdChoreDefinitionV2Schema
>
export type CompleteHouseholdChoreAssignmentV2Input = z.infer<
  typeof CompleteHouseholdChoreAssignmentV2Schema
>
export type CorrectHouseholdChoreCompletionDateInput = z.infer<
  typeof CorrectHouseholdChoreCompletionDateSchema
>
