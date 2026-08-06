'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getAdmin } from '@/lib/supabase/admin'
import { upsertSourceRelationship } from '@/lib/relationships/upsert-source.server'
import { calculateExpenseBalances, simplifySettlement } from './balances'
import {
  splitByFixedAmounts,
  splitByPercentage,
  splitByWeights,
  splitEqual,
  splitMixedEqualRemainder,
  splitMixedPercentageRemainder,
} from './splits'
import type {
  ExpenseActionErrorCode,
  ExpenseActionResult,
} from './contracts'
import {
  AddExpenseGroupMemberSchema,
  CancelExpenseSchema,
  CancelExpenseMemberInvitationSchema,
  CreateExpenseGroupSchema,
  CreateExpenseSchema,
  DeactivateExpensePaymentPreferenceSchema,
  LeaveExpenseGroupSchema,
  LinkExpenseGuestMemberSchema,
  RemoveExpenseGroupMemberSchema,
  ReportExpenseRepaymentSchema,
  ResendExpenseMemberInvitationSchema,
  SaveExpensePaymentPreferenceSchema,
  SetExpenseGroupStatusSchema,
  TransitionExpenseRepaymentSchema,
  RespondExpenseGroupInvitationSchema,
  RespondExpenseMemberInvitationSchema,
  UpdateExpenseSchema,
} from './validation'
import { sendExpenseMemberInvitationEmail } from './email'
import {
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
  parseExpenseWeight,
} from './input-money'
import { ExpenseDomainError } from './domain-error'
import { SaveExpenseDraftSchema } from './drafts'
import { guardExpenseAccess } from './guard'
import {
  getExpenseActorDisplayName,
  resolveExpenseMembers,
  type ResolvedExpenseMember,
} from './participants.server'
import {
  getActiveExpenseGroupMembersForActor,
  getExpenseEditMembersForActor,
} from './persistence.server'

const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'

function revalidateExpensePaths(groupId?: string, expenseId?: string, repaymentId?: string) {
  revalidatePath(EXPENSES_PATH)
  revalidatePath('/auth-mvp/heim')
  if (groupId) revalidatePath(`${EXPENSES_PATH}/hopar/${groupId}`)
  if (expenseId) revalidatePath(`${EXPENSES_PATH}/utgjold/${expenseId}`)
  if (repaymentId) revalidatePath(`${EXPENSES_PATH}/endurgreidslur/${repaymentId}`)
}

function actionError(error: unknown): ExpenseActionResult<never> {
  if (error instanceof ExpenseDomainError) {
    return { ok: false, error: 'invalid_input' }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const code: ExpenseActionErrorCode =
    message.includes('recipient_unavailable') ? 'recipient_unavailable'
      : message.includes('unavailable') ? 'feature_disabled'
      : message.includes('not_allowed') ? 'not_allowed'
      : message.includes('not_found') ? 'not_found'
        : message.includes('conflict')
          || message.includes('blocked')
          || message.includes('cannot_')
          || message.includes('not_settled')
          || message.includes('review_required')
          || message.includes('exceeds_available') ? 'conflict'
          : message.includes('invalid') || message.includes('required') || message.includes('mismatch')
            ? 'invalid_input'
            : 'save_failed'
  return { ok: false, error: code }
}

function rpcError(error: { message?: string; code?: string } | null): never {
  if (!error) throw new Error('expense_save_failed')
  throw new Error(error.message || error.code || 'expense_save_failed')
}

function resultObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return data[0] as Record<string, unknown>
  }
  return {}
}

async function deleteExpenseDraftAfterSave(actorUserId: string, draftId: string | null) {
  if (!draftId) return
  const { error } = await getAdmin().rpc('expense_delete_private_draft', {
    p_actor_id: actorUserId,
    p_draft_id: draftId,
  })
  if (error) console.error('[expenses] saved expense but draft cleanup failed')
}

export async function saveExpenseDraft(
  input: unknown,
): Promise<ExpenseActionResult<{ draftId: string; version: number; savedAt: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = SaveExpenseDraftSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc('expense_save_private_draft', {
      p_actor_id: user.id,
      p_draft_id: value.draft_id,
      p_context_type: value.context_type,
      p_group_id: value.group_id,
      p_expense_id: value.expense_id,
      p_current_step: value.current_step,
      p_payload: value.payload,
      p_expected_version: value.expected_version,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const draftId = String(result.draft_id ?? '')
    const version = Number(result.draft_version)
    const savedAt = String(result.saved_at ?? '')
    if (!draftId || !Number.isSafeInteger(version) || version < 1 || !savedAt) {
      throw new Error('expense_draft_save_failed')
    }
    return { ok: true, data: { draftId, version, savedAt } }
  } catch (error) {
    console.error('[expenses] save draft failed')
    return actionError(error)
  }
}

async function resolveInputMembers(
  actorUserId: string,
  members: Parameters<typeof resolveExpenseMembers>[0]['members'],
): Promise<ResolvedExpenseMember[]> {
  const actorDisplayName = await getExpenseActorDisplayName(actorUserId)
  return resolveExpenseMembers({ actorUserId, actorDisplayName, members })
}

export async function createExpenseGroup(
  input: unknown,
): Promise<ExpenseActionResult<{ groupId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = CreateExpenseGroupSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const members = await resolveInputMembers(user.id, parsed.data.members)

    const { data, error } = await getAdmin().rpc('expense_create_group', {
      p_actor_id: user.id,
      p_request_id: parsed.data.request_id,
      p_name: parsed.data.name,
      p_description: parsed.data.description,
      p_emoji: parsed.data.emoji,
      p_default_currency: parsed.data.default_currency,
      p_default_include_creator: parsed.data.default_include_creator,
      p_members: members.map((member) => ({
        id: member.id,
        user_id: member.userId,
        display_name: member.displayName,
        role: member.role,
        status: member.status,
      })),
    })
    if (error) rpcError(error)
    const groupId = String(resultObject(data).group_id ?? '')
    if (!groupId) throw new Error('expense_save_failed')
    revalidateExpensePaths(groupId)
    return { ok: true, data: { groupId } }
  } catch (error) {
    console.error('[expenses] create group failed')
    return actionError(error)
  }
}

function mapMembersByKey(members: readonly ResolvedExpenseMember[]): Map<string, ResolvedExpenseMember> {
  return new Map(members.map((member) => [member.key, member]))
}

function requireMember(
  members: ReadonlyMap<string, ResolvedExpenseMember>,
  key: string,
): ResolvedExpenseMember {
  const member = members.get(key)
  if (!member) throw new Error('expense_member_invalid')
  return member
}

function requireMemberKey(
  members: ReadonlyMap<string, ResolvedExpenseMember>,
  key: string,
): string {
  requireMember(members, key)
  return key
}

export async function createExpense(
  input: unknown,
): Promise<ExpenseActionResult<{ groupId: string; expenseId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = CreateExpenseSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data

    let members: ResolvedExpenseMember[]
    if (value.group_id) {
      const persisted = await getActiveExpenseGroupMembersForActor(user.id, value.group_id)
      members = persisted.map((member) => ({
        id: member.id,
        key: member.id,
        userId: member.userId,
        displayName: member.displayName,
        role: member.role === 'owner' ? 'owner' : 'member',
        status: 'active',
      }))
    } else {
      members = await resolveInputMembers(user.id, value.members)
    }
    const membersByKey = mapMembersByKey(members)
    const totalMinor = parseExpenseAmountToMinor(value.total, value.currency)
    const payments = value.payments.map((payment) => ({
      payerId: requireMember(membersByKey, payment.member_key).id,
      amountMinor: parseExpenseAmountToMinor(payment.amount, value.currency),
      currency: value.currency,
    }))

    // Split on stable form keys first. One-off member UUIDs are generated by
    // the server, so using them as a rounding tie-breaker would make the
    // pre-save preview differ by a minor unit. Keys are validated and then
    // mapped to authoritative member IDs below.
    const sharesByKey = (() => {
      if (value.split_method === 'equal') {
        return splitEqual(
          totalMinor,
          value.currency,
          value.allocations.map((allocation) => {
            requireMember(membersByKey, allocation.member_key)
            return allocation.member_key
          }),
        )
      }
      if (value.split_method === 'percentage') {
        return splitByPercentage(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          basisPoints: parseExpensePercentageToBasisPoints(allocation.percentage ?? ''),
        })))
      }
      if (value.split_method === 'weighted') {
        return splitByWeights(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          weight: parseExpenseWeight(allocation.weight ?? ''),
        })))
      }
      if (value.split_method === 'fixed') {
        return splitByFixedAmounts(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          amountMinor: parseExpenseAmountToMinor(allocation.amount ?? '', value.currency, { allowZero: true }),
        })))
      }
      if (value.split_method === 'mixed_equal_remainder') {
        return splitMixedEqualRemainder(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          fixedMinor: parseExpenseAmountToMinor(allocation.amount ?? '0', value.currency, { allowZero: true }),
          participatesInRemainder: allocation.participates_in_remainder === true,
        })))
      }
      return splitMixedPercentageRemainder(totalMinor, value.currency, value.allocations.map((allocation) => ({
        participantId: requireMemberKey(membersByKey, allocation.member_key),
        fixedMinor: parseExpenseAmountToMinor(allocation.amount ?? '0', value.currency, { allowZero: true }),
        remainderBasisPoints: parseExpensePercentageToBasisPoints(allocation.percentage ?? ''),
      })))
    })()
    const shares = sharesByKey.map((share) => ({
      ...share,
      participantId: requireMember(membersByKey, share.participantId).id,
    }))

    const expenseId = randomUUID()
    const balances = calculateExpenseBalances({
      expenseId,
      totalMinor,
      currency: value.currency,
      payments,
      shares,
    })
    const obligations = simplifySettlement(balances).map((transfer) => ({
      from_member_id: transfer.fromPartyId,
      to_member_id: transfer.toPartyId,
      amount_minor: transfer.amountMinor,
      currency: transfer.currency,
    }))

    const { data, error } = await getAdmin().rpc(
      value.group_id ? 'expense_create_expense' : 'expense_create_expense_with_known_members',
      {
        p_actor_id: user.id,
        p_request_id: value.request_id,
        p_expense_id: expenseId,
        p_group_id: value.group_id,
        p_title: value.title,
        p_total_minor: totalMinor,
        p_currency: value.currency,
        p_incurred_on: value.incurred_on,
        p_category: value.category,
        p_note: value.note,
        p_split_method: value.split_method,
        p_one_off_members: value.group_id ? [] : members.map((member) => ({
          id: member.id,
          // SQL96 first validates the established guest-safe shape. SQL102's
          // wrapper then atomically promotes actor-owned registered
          // Relationships to invited members before the transaction commits.
          user_id: member.role === 'owner' ? member.userId : null,
          display_name: member.displayName,
          role: member.role,
          status: 'active',
        })),
        p_payments: payments.map((payment) => ({
          member_id: payment.payerId,
          amount_minor: payment.amountMinor,
        })),
        p_shares: shares.map((share) => ({
          member_id: share.participantId,
          amount_minor: share.amountMinor,
        })),
        p_obligations: obligations,
        ...(value.group_id ? {} : {
          p_known_relationship_members: members.flatMap((member) => (
            member.relationshipId
              ? [{ member_id: member.id, relationship_id: member.relationshipId }]
              : []
          )),
        }),
      },
    )
    if (error) rpcError(error)
    const result = resultObject(data)
    const groupId = String(result.group_id ?? value.group_id ?? '')
    const persistedExpenseId = String(result.expense_id ?? expenseId)
    if (!groupId || !persistedExpenseId) throw new Error('expense_save_failed')
    await deleteExpenseDraftAfterSave(user.id, value.draft_id)
    revalidateExpensePaths(groupId, persistedExpenseId)
    return { ok: true, data: { groupId, expenseId: persistedExpenseId } }
  } catch (error) {
    console.error('[expenses] create expense failed')
    return actionError(error)
  }
}

export async function updateExpense(
  input: unknown,
): Promise<ExpenseActionResult<{ groupId: string; expenseId: string; financialVersion: number }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = UpdateExpenseSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data
    const admin = getAdmin()
    const { data: expenseLocator, error: locatorError } = await admin
      .from('expenses')
      .select('group_id')
      .eq('id', value.expense_id)
      .maybeSingle()
    if (locatorError) rpcError(locatorError)
    const groupId = typeof expenseLocator?.group_id === 'string' ? expenseLocator.group_id : ''
    if (!groupId) throw new Error('expense_not_found')

    const persisted = await getExpenseEditMembersForActor(user.id, groupId, value.expense_id)
    const members: ResolvedExpenseMember[] = [
      ...persisted.map((member) => ({
        id: member.id,
        key: member.id,
        userId: member.userId,
        displayName: member.displayName,
        role: member.role === 'owner' ? 'owner' as const : 'member' as const,
        status: 'active' as const,
      })),
      ...value.new_members.map((member) => ({
        id: member.id,
        key: member.id,
        userId: null,
        displayName: member.display_name,
        role: 'member' as const,
        status: 'active' as const,
      })),
    ]
    const membersByKey = mapMembersByKey(members)
    if (membersByKey.size !== members.length) throw new Error('expense_member_invalid')

    const totalMinor = parseExpenseAmountToMinor(value.total, value.currency)
    const payments = value.payments.map((payment) => ({
      payerId: requireMember(membersByKey, payment.member_key).id,
      amountMinor: parseExpenseAmountToMinor(payment.amount, value.currency),
      currency: value.currency,
    }))

    const sharesByKey = value.preserve_shares ? [] : (() => {
      if (value.split_method === 'equal') {
        return splitEqual(
          totalMinor,
          value.currency,
          value.allocations.map((allocation) => requireMemberKey(membersByKey, allocation.member_key)),
        )
      }
      if (value.split_method === 'percentage') {
        return splitByPercentage(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          basisPoints: parseExpensePercentageToBasisPoints(allocation.percentage ?? ''),
        })))
      }
      if (value.split_method === 'weighted') {
        return splitByWeights(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          weight: parseExpenseWeight(allocation.weight ?? ''),
        })))
      }
      if (value.split_method === 'fixed') {
        return splitByFixedAmounts(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          amountMinor: parseExpenseAmountToMinor(allocation.amount ?? '', value.currency, { allowZero: true }),
        })))
      }
      if (value.split_method === 'mixed_equal_remainder') {
        return splitMixedEqualRemainder(totalMinor, value.currency, value.allocations.map((allocation) => ({
          participantId: requireMemberKey(membersByKey, allocation.member_key),
          fixedMinor: parseExpenseAmountToMinor(allocation.amount ?? '0', value.currency, { allowZero: true }),
          participatesInRemainder: allocation.participates_in_remainder === true,
        })))
      }
      return splitMixedPercentageRemainder(totalMinor, value.currency, value.allocations.map((allocation) => ({
        participantId: requireMemberKey(membersByKey, allocation.member_key),
        fixedMinor: parseExpenseAmountToMinor(allocation.amount ?? '0', value.currency, { allowZero: true }),
        remainderBasisPoints: parseExpensePercentageToBasisPoints(allocation.percentage ?? ''),
      })))
    })()
    const shares = sharesByKey.map((share) => ({
      member_id: requireMember(membersByKey, share.participantId).id,
      amount_minor: share.amountMinor,
    }))

    const { data, error } = await admin.rpc('expense_update_expense', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_expense_id: value.expense_id,
      p_expected_financial_version: value.expected_financial_version,
      p_title: value.title,
      p_total_minor: totalMinor,
      p_currency: value.currency,
      p_incurred_on: value.incurred_on,
      p_category: value.category,
      p_note: value.note,
      p_split_method: value.split_method,
      p_preserve_shares: value.preserve_shares,
      p_new_guest_members: value.new_members,
      p_payments: payments.map((payment) => ({
        member_id: payment.payerId,
        amount_minor: payment.amountMinor,
      })),
      p_shares: shares,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const persistedExpenseId = String(result.expense_id ?? value.expense_id)
    const persistedGroupId = String(result.group_id ?? groupId)
    const financialVersion = Number(result.financial_version)
    if (!persistedExpenseId || !persistedGroupId || !Number.isSafeInteger(financialVersion)) {
      throw new Error('expense_save_failed')
    }
    await deleteExpenseDraftAfterSave(user.id, value.draft_id)
    revalidateExpensePaths(persistedGroupId, persistedExpenseId)
    return {
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId, financialVersion },
    }
  } catch (error) {
    console.error('[expenses] update expense failed')
    return actionError(error)
  }
}

type ExpenseInvitationDelivery = 'sent' | 'already_sent' | 'failed' | 'uncertain'

interface ExpenseInvitationReserveRow {
  attempt_number?: unknown
  can_send?: unknown
  reason?: unknown
  recipient_email?: unknown
  email_template_version?: unknown
  context_title?: unknown
  inviter_display_name?: unknown
}

function firstRpcRow(data: unknown): ExpenseInvitationReserveRow {
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return data[0] as ExpenseInvitationReserveRow
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as ExpenseInvitationReserveRow
  }
  return {}
}

async function deliverExpenseMemberInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<ExpenseInvitationDelivery> {
  const admin = getAdmin()
  const { data, error } = await admin.rpc('expense_reserve_member_invitation_send', {
    p_actor_id: actorUserId,
    p_invitation_id: invitationId,
  })
  if (error) rpcError(error)
  const row = firstRpcRow(data)
  const reason = typeof row.reason === 'string' ? row.reason : 'not_found'
  if (row.can_send !== true) {
    return reason === 'already_sent' ? 'already_sent' : 'failed'
  }
  if (
    !Number.isInteger(row.attempt_number)
    || typeof row.recipient_email !== 'string'
    || row.email_template_version !== 'v1'
    || typeof row.context_title !== 'string'
    || (row.inviter_display_name !== null && typeof row.inviter_display_name !== 'string')
  ) {
    return 'uncertain'
  }

  const attemptNumber = row.attempt_number as number
  const sendResult = await sendExpenseMemberInvitationEmail(
    row.recipient_email,
    invitationId,
    attemptNumber,
    {
      templateVersion: 'v1',
      contextTitle: row.context_title,
      inviterDisplayName: row.inviter_display_name as string | null,
    },
  )
  if (sendResult === 'uncertain') return 'uncertain'

  const { data: deliveryData, error: deliveryError } = await admin.rpc(
    'expense_update_member_invitation_delivery',
    {
      p_actor_id: actorUserId,
      p_invitation_id: invitationId,
      p_attempt_number: attemptNumber,
      p_status: sendResult,
    },
  )
  if (deliveryError || deliveryData !== 'ok') return 'uncertain'
  return sendResult
}

export async function linkExpenseGuestMember(
  input: unknown,
): Promise<ExpenseActionResult<{ invitationId: string; delivery: ExpenseInvitationDelivery }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = LinkExpenseGuestMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_link_guest_member_email', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_member_id: parsed.data.member_id,
      p_recipient_email: parsed.data.recipient_email,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const invitationId = String(resultObject(data).invitation_id ?? '')
    if (!invitationId) throw new Error('expense_save_failed')
    const delivery = await deliverExpenseMemberInvitation(user.id, invitationId)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true, data: { invitationId, delivery } }
  } catch (error) {
    console.error('[expenses] guest member invitation failed')
    return actionError(error)
  }
}

export async function resendExpenseMemberInvitation(
  input: unknown,
): Promise<ExpenseActionResult<{ delivery: ExpenseInvitationDelivery }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = ResendExpenseMemberInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const delivery = await deliverExpenseMemberInvitation(user.id, parsed.data.invitation_id)
    revalidateExpensePaths()
    return { ok: true, data: { delivery } }
  } catch (error) {
    console.error('[expenses] member invitation resend failed')
    return actionError(error)
  }
}

export async function respondExpenseMemberInvitation(
  input: unknown,
): Promise<ExpenseActionResult<{ status: 'accepted' | 'declined' | 'expired'; groupId?: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = RespondExpenseMemberInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const admin = getAdmin()
    const { data, error } = await admin.rpc('expense_respond_member_invitation', {
      p_actor_id: user.id,
      p_invitation_id: parsed.data.invitation_id,
      p_action: parsed.data.action,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const status = result.status
    if (status !== 'accepted' && status !== 'declined' && status !== 'expired') {
      throw new Error('expense_save_failed')
    }

    const groupId = typeof result.group_id === 'string' ? result.group_id : undefined
    if (status === 'accepted') {
      const ownerUserId = typeof result.invited_by === 'string' ? result.invited_by : ''
      const memberId = typeof result.member_id === 'string' ? result.member_id : ''
      const counterpartUserId = typeof result.counterpart_user_id === 'string'
        ? result.counterpart_user_id
        : ''
      if (ownerUserId && memberId && counterpartUserId) {
        try {
          const [{ data: ownerData }, { data: invitationData, error: invitationError }] = await Promise.all([
            admin.auth.admin.getUserById(ownerUserId),
            admin
              .from('expense_member_invitations')
              .select('guest_display_name_snapshot')
              .eq('id', parsed.data.invitation_id)
              .eq('member_id', memberId)
              .eq('invited_by', ownerUserId)
              .eq('status', 'accepted')
              .maybeSingle(),
          ])
          const ownerEmail = ownerData?.user?.email
          const privateDisplayName = invitationData
            && typeof invitationData.guest_display_name_snapshot === 'string'
            ? invitationData.guest_display_name_snapshot
            : null
          if (ownerEmail && !invitationError) {
            await upsertSourceRelationship({
              ownerUserId,
              ownerEmail,
              counterpart: {
                mode: 'verified-counterpart',
                userId: counterpartUserId,
                emailCanonical: user.email ?? null,
                privateDisplayName,
              },
              sourceType: 'expenses',
              sourceId: memberId,
            })
          }
        } catch {
          // Consent and durable ledger linking are already complete. Tengsl is
          // deliberately best-effort and may be retried independently.
          console.error('[expenses] accepted member relationship enrichment failed')
        }
      }
    }

    revalidateExpensePaths(groupId)
    return { ok: true, data: { status, ...(groupId ? { groupId } : {}) } }
  } catch (error) {
    console.error('[expenses] member invitation response failed')
    return actionError(error)
  }
}

export async function cancelExpenseMemberInvitation(
  input: unknown,
): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = CancelExpenseMemberInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_cancel_member_invitation', {
      p_actor_id: user.id,
      p_invitation_id: parsed.data.invitation_id,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths()
    return { ok: true }
  } catch (error) {
    console.error('[expenses] member invitation cancellation failed')
    return actionError(error)
  }
}

export async function addExpenseGroupMember(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = AddExpenseGroupMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const actorDisplayName = await getExpenseActorDisplayName(user.id)
    const members = await resolveExpenseMembers({
      actorUserId: user.id,
      actorDisplayName,
      members: [
        { type: 'self', key: 'self' },
        parsed.data.member.type === 'guest'
          ? { type: 'guest', key: 'new', display_name: parsed.data.member.display_name }
          : { type: 'relationship', key: 'new', relationship_id: parsed.data.member.relationship_id },
      ],
    })
    const member = members.find((candidate) => candidate.key === 'new')
    if (!member) throw new Error('expense_member_invalid')
    const { error } = await getAdmin().rpc('expense_add_group_member', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_request_id: parsed.data.request_id,
      p_member: {
        id: member.id,
        user_id: member.userId,
        display_name: member.displayName,
        status: member.status,
      },
    })
    if (error) rpcError(error)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] add member failed')
    return actionError(error)
  }
}

export async function respondExpenseGroupInvitation(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = RespondExpenseGroupInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_respond_group_invitation', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_action: parsed.data.action,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] invitation response failed')
    return actionError(error)
  }
}

export async function leaveExpenseGroup(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = LeaveExpenseGroupSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_leave_group', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] leave group failed')
    return actionError(error)
  }
}

export async function removeExpenseGroupMember(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = RemoveExpenseGroupMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_remove_group_member', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_member_id: parsed.data.member_id,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] remove member failed')
    return actionError(error)
  }
}

export async function cancelExpense(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = CancelExpenseSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_cancel_expense', {
      p_actor_id: user.id,
      p_expense_id: parsed.data.expense_id,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const groupId = String(resultObject(data).group_id ?? '')
    revalidateExpensePaths(groupId || undefined, parsed.data.expense_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] cancel expense failed')
    return actionError(error)
  }
}

export async function setExpenseGroupStatus(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = SetExpenseGroupStatusSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_set_group_status', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_status: parsed.data.status,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths(parsed.data.group_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] set group status failed')
    return actionError(error)
  }
}

export async function reportExpenseRepayment(
  input: unknown,
): Promise<ExpenseActionResult<{ repaymentId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = ReportExpenseRepaymentSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const amountMinor = parseExpenseAmountToMinor(parsed.data.amount, parsed.data.currency)
    const { data, error } = await getAdmin().rpc('expense_report_repayment', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_from_member_id: parsed.data.from_member_id,
      p_to_member_id: parsed.data.to_member_id,
      p_expected_financial_version: parsed.data.expected_financial_version,
      p_amount_minor: amountMinor,
      p_currency: parsed.data.currency,
      p_occurred_on: parsed.data.occurred_on,
      p_note: parsed.data.note,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const repaymentId = String(resultObject(data).repayment_id ?? '')
    const groupId = String(resultObject(data).group_id ?? '')
    if (!repaymentId) throw new Error('expense_save_failed')
    revalidateExpensePaths(groupId || parsed.data.group_id, undefined, repaymentId)
    return { ok: true, data: { repaymentId } }
  } catch (error) {
    console.error('[expenses] report repayment failed')
    return actionError(error)
  }
}

export async function transitionExpenseRepayment(input: unknown): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = TransitionExpenseRepaymentSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_transition_repayment', {
      p_actor_id: user.id,
      p_repayment_id: parsed.data.repayment_id,
      p_action: parsed.data.action,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const groupId = String(resultObject(data).group_id ?? '')
    revalidateExpensePaths(groupId || undefined, undefined, parsed.data.repayment_id)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] transition repayment failed')
    return actionError(error)
  }
}

export async function saveExpensePaymentPreference(
  input: unknown,
): Promise<ExpenseActionResult<{ preferenceId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = SaveExpensePaymentPreferenceSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const preferenceId = parsed.data.preference_id ?? randomUUID()
    const { data, error } = await getAdmin().rpc('expense_save_payment_preference', {
      p_actor_id: user.id,
      p_preference_id: preferenceId,
      p_expected_version: parsed.data.expected_version,
      p_request_id: parsed.data.request_id,
      p_title: parsed.data.title,
      p_kind: parsed.data.kind,
      p_supported_currencies: parsed.data.supported_currencies,
      p_details: parsed.data.details,
      p_visibility: parsed.data.visibility,
      p_assignment: parsed.data.assignment,
    })
    if (error) rpcError(error)
    const persistedId = String(resultObject(data).preference_id ?? preferenceId)
    revalidateExpensePaths()
    revalidatePath(`${EXPENSES_PATH}/greidsluleidir`)
    return { ok: true, data: { preferenceId: persistedId } }
  } catch (error) {
    console.error('[expenses] save payment preference failed')
    return actionError(error)
  }
}

export async function deactivateExpensePaymentPreference(
  input: unknown,
): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = DeactivateExpensePaymentPreferenceSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_deactivate_payment_preference', {
      p_actor_id: user.id,
      p_preference_id: parsed.data.preference_id,
      p_expected_version: parsed.data.expected_version,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidatePath(`${EXPENSES_PATH}/greidsluleidir`)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] deactivate payment preference failed')
    return actionError(error)
  }
}
