import { z } from 'zod'

const uuid = z.string().uuid()

export const SaveRelationshipLabelSchema = z.object({
  label_id: uuid.nullable().optional().transform((value) => value ?? null),
  expected_version: z.number().int().positive().nullable().optional().transform((value) => value ?? null),
  name: z.string().trim().min(1).max(60),
  request_id: uuid,
}).strict()

export const SetRelationshipLabelAssignmentSchema = z.object({
  relationship_id: uuid,
  label_id: uuid,
  assigned: z.boolean(),
  request_id: uuid,
}).strict()

export const DeleteRelationshipLabelSchema = z.object({
  label_id: uuid,
  expected_version: z.number().int().positive(),
  request_id: uuid,
}).strict()

export const CreateRelationshipCircleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(''),
  request_id: uuid,
}).strict()

export const InviteRelationshipCircleSchema = z.object({
  circle_id: uuid,
  relationship_id: uuid,
  request_id: uuid,
}).strict()

export const RespondRelationshipCircleInvitationSchema = z.object({
  invitation_id: uuid,
  action: z.enum(['accept', 'decline']),
  request_id: uuid,
}).strict()

export const RemoveRelationshipCircleMemberSchema = z.object({
  circle_id: uuid,
  member_id: uuid,
  request_id: uuid,
}).strict()

export const LeaveRelationshipCircleSchema = z.object({
  circle_id: uuid,
  request_id: uuid,
}).strict()

export const TransferRelationshipCircleOwnershipSchema = z.object({
  circle_id: uuid,
  member_id: uuid,
  expected_version: z.number().int().positive(),
  request_id: uuid,
}).strict()

export const ArchiveRelationshipCircleSchema = z.object({
  circle_id: uuid,
  expected_version: z.number().int().positive(),
  request_id: uuid,
}).strict()
