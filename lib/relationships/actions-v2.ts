'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import {
  DeleteRelationshipLabelSchema,
  InviteRelationshipCircleSchema,
  RespondRelationshipCircleInvitationSchema,
  RemoveRelationshipCircleMemberSchema,
  LeaveRelationshipCircleSchema,
  TransferRelationshipCircleOwnershipSchema,
  ArchiveRelationshipCircleSchema,
  SaveRelationshipLabelSchema,
  SetRelationshipLabelAssignmentSchema,
} from './validation'

export type RelationshipV2ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'not_allowed' | 'conflict' | 'save_failed' }

type RelationshipV2ActionError = Extract<RelationshipV2ActionResult, { ok: false }>['error']

async function actor() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  return user
}

function mapError(error: { message?: string } | null): RelationshipV2ActionError {
  const message = error?.message ?? ''
  if (message.includes('not_found')) return 'not_found'
  if (message.includes('not_allowed')) return 'not_allowed'
  if (message.includes('conflict') || message.includes('duplicate key')) return 'conflict'
  if (message.includes('invalid_input')) return 'invalid_input'
  return 'save_failed'
}

function refreshRelationshipPaths(relationshipId?: string, circleId?: string) {
  revalidatePath('/stillingar/tengsl')
  if (relationshipId) revalidatePath(`/stillingar/tengsl/${relationshipId}`)
  revalidatePath('/stillingar/tengsl/hringir')
  if (circleId) revalidatePath(`/stillingar/tengsl/hringir/${circleId}`)
  revalidatePath('/auth-mvp/utlagt-og-endurgreitt/nytt')
}

export async function saveRelationshipLabelV2(input: unknown): Promise<RelationshipV2ActionResult<{ labelId: string; version: number }>> {
  const user = await actor()
  const parsed = SaveRelationshipLabelSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const labelId = parsed.data.label_id ?? randomUUID()
  const { data, error } = await getAdmin().rpc('relationship_save_label', {
    p_actor_id: user.id,
    p_label_id: labelId,
    p_expected_version: parsed.data.expected_version,
    p_name: parsed.data.name.normalize('NFC'),
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  const result = data as { label_id?: unknown; version?: unknown } | null
  const version = Number(result?.version)
  if (!Number.isSafeInteger(version) || version < 1) return { ok: false, error: 'save_failed' }
  refreshRelationshipPaths()
  return { ok: true, data: { labelId: String(result?.label_id ?? labelId), version } }
}

export async function setRelationshipLabelAssignmentV2(input: unknown): Promise<RelationshipV2ActionResult> {
  const user = await actor()
  const parsed = SetRelationshipLabelAssignmentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { error } = await getAdmin().rpc('relationship_set_label_assignment', {
    p_actor_id: user.id,
    p_relationship_id: parsed.data.relationship_id,
    p_label_id: parsed.data.label_id,
    p_assigned: parsed.data.assigned,
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(parsed.data.relationship_id)
  return { ok: true, data: undefined }
}

export async function deleteRelationshipLabelV2(input: unknown): Promise<RelationshipV2ActionResult> {
  const user = await actor()
  const parsed = DeleteRelationshipLabelSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { error } = await getAdmin().rpc('relationship_delete_label', {
    p_actor_id: user.id,
    p_label_id: parsed.data.label_id,
    p_expected_version: parsed.data.expected_version,
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths()
  return { ok: true, data: undefined }
}

export async function createRelationshipCircle(_input: unknown): Promise<RelationshipV2ActionResult<{ circleId: string }>> {
  await actor()
  return { ok: false, error: 'not_allowed' }
}

export async function inviteRelationshipToCircle(input: unknown): Promise<RelationshipV2ActionResult<{ invitationId: string }>> {
  const user = await actor()
  const parsed = InviteRelationshipCircleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const invitationId = randomUUID()
  const { data, error } = await getAdmin().rpc('relationship_invite_to_circle', {
    p_actor_id: user.id,
    p_circle_id: parsed.data.circle_id,
    p_relationship_id: parsed.data.relationship_id,
    p_invitation_id: invitationId,
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(undefined, parsed.data.circle_id)
  return { ok: true, data: { invitationId: String((data as { invitation_id?: unknown } | null)?.invitation_id ?? invitationId) } }
}

export async function respondRelationshipCircleInvitation(input: unknown): Promise<RelationshipV2ActionResult<{ circleId: string; status: string }>> {
  const user = await actor()
  const parsed = RespondRelationshipCircleInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { data, error } = await getAdmin().rpc('relationship_respond_circle_invitation', {
    p_actor_id: user.id,
    p_actor_email: user.email!,
    p_invitation_id: parsed.data.invitation_id,
    p_action: parsed.data.action,
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  const result = data as { circle_id?: unknown; status?: unknown } | null
  const circleId = String(result?.circle_id ?? '')
  if (!circleId) return { ok: false, error: 'save_failed' }
  refreshRelationshipPaths(undefined, circleId)
  return { ok: true, data: { circleId, status: String(result?.status ?? '') } }
}

export async function removeRelationshipCircleMember(input: unknown): Promise<RelationshipV2ActionResult> {
  const user = await actor()
  const parsed = RemoveRelationshipCircleMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { error } = await getAdmin().rpc('relationship_remove_circle_member', {
    p_actor_id: user.id, p_circle_id: parsed.data.circle_id,
    p_member_id: parsed.data.member_id, p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(undefined, parsed.data.circle_id)
  return { ok: true, data: undefined }
}

export async function leaveRelationshipCircle(input: unknown): Promise<RelationshipV2ActionResult> {
  const user = await actor()
  const parsed = LeaveRelationshipCircleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { error } = await getAdmin().rpc('relationship_leave_circle', {
    p_actor_id: user.id, p_circle_id: parsed.data.circle_id, p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(undefined, parsed.data.circle_id)
  return { ok: true, data: undefined }
}

export async function transferRelationshipCircleOwnership(input: unknown): Promise<RelationshipV2ActionResult<{ version: number }>> {
  const user = await actor()
  const parsed = TransferRelationshipCircleOwnershipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { data, error } = await getAdmin().rpc('relationship_transfer_circle_ownership', {
    p_actor_id: user.id, p_circle_id: parsed.data.circle_id,
    p_new_owner_member_id: parsed.data.member_id, p_expected_version: parsed.data.expected_version,
    p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(undefined, parsed.data.circle_id)
  return { ok: true, data: { version: Number((data as { version?: unknown } | null)?.version) } }
}

export async function archiveRelationshipCircle(input: unknown): Promise<RelationshipV2ActionResult> {
  const user = await actor()
  const parsed = ArchiveRelationshipCircleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const { error } = await getAdmin().rpc('relationship_archive_circle', {
    p_actor_id: user.id, p_circle_id: parsed.data.circle_id,
    p_expected_version: parsed.data.expected_version, p_request_id: parsed.data.request_id,
  })
  if (error) return { ok: false, error: mapError(error) }
  refreshRelationshipPaths(undefined, parsed.data.circle_id)
  return { ok: true, data: undefined }
}
