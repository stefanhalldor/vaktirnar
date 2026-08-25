'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getAdmin } from '@/lib/supabase/admin'
import { upsertSourceRelationship } from '@/lib/relationships/upsert-source.server'
import { canUseEventExpenses } from '@/lib/events/guard'
import { getOwnedEventExpenseSource } from '@/lib/events/repository.server'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
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
  AddExpenseShareCollaboratorSchema,
  AttachExpenseToEventSchema,
  BindExpenseMemberEventIdentitySchema,
  CancelExpenseSchema,
  CancelExpenseMemberInvitationSchema,
  CreateExpenseGroupSchema,
  CreateExpenseSchema,
  DeactivateExpensePaymentPreferenceSchema,
  DetachExpenseFromEventSchema,
  DisputeExpenseClaimSchema,
  LeaveExpenseGroupSchema,
  LinkExpenseGuestMemberSchema,
  RemoveExpenseGroupMemberSchema,
  RecordExpenseRepaymentReceivedSchema,
  RenameExpenseGuestMemberSchema,
  ProposeExpenseSettlementBatchSchema,
  ReportExpenseRepaymentSchema,
  ResendExpenseMemberInvitationSchema,
  SaveExpensePaymentPreferenceSchema,
  SetExpenseEventVisibilitySchema,
  SetExpenseGroupStatusSchema,
  TransitionExpenseSettlementBatchSchema,
  TransitionExpenseRepaymentSchema,
  RespondExpenseGroupInvitationSchema,
  RespondExpenseMemberInvitationSchema,
  UpdateExpenseSchema,
} from './validation'
import type { EventExpenseVisibility } from './validation'
import { sendExpenseMemberInvitationEmail } from './email'
import {
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
  parseExpenseWeight,
} from './input-money'
import { ExpenseDomainError } from './domain-error'
import {
  redactExpenseDraftEventGuestLabels,
  SaveExpenseDraftSchema,
} from './drafts'
import {
  ClearExpensePaymentProfileV2Schema,
  SaveExpensePaymentProfileV2Schema,
} from './payment-profile-validation'
import {
  encryptExpensePaymentProfile,
  ExpensePaymentCryptoUnavailableError,
} from './payment-crypto.server'
import {
  expensePaymentProfileIsEmpty,
  normalizeExpensePaymentProfile,
  type NormalizedExpensePaymentProfileDetails,
} from './payment-profile'
import { guardExpenseAccess, guardExpenseSession } from './guard'
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

function revalidateExpensePaths(
  groupId?: string,
  expenseId?: string,
  repaymentId?: string,
  eventId?: string,
) {
  revalidatePath(EXPENSES_PATH)
  revalidatePath('/auth-mvp/heim')
  revalidatePath(`${EXPENSES_PATH}/gera-upp`)
  if (groupId) revalidatePath(`${EXPENSES_PATH}/hopar/${groupId}`)
  if (expenseId) revalidatePath(`${EXPENSES_PATH}/utgjold/${expenseId}`)
  if (repaymentId) revalidatePath(`${EXPENSES_PATH}/endurgreidslur/${repaymentId}`)
  if (eventId) revalidatePath(`/auth-mvp/vidburdir/${eventId}`)
}

function actionError(error: unknown): ExpenseActionResult<never> {
  if (error instanceof ExpenseDomainError) {
    return { ok: false, error: 'invalid_input' }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const code: ExpenseActionErrorCode =
    message.includes('recipient_unavailable') ? 'recipient_unavailable'
      : (message.includes('teskeid_event_revision_conflict')
        || message.includes('teskeid_event_roster_conflict')
        || message.includes('event_guest_not_available')) ? 'event_roster_changed'
      : message.includes('unavailable') ? 'feature_disabled'
      : message.includes('not_allowed') ? 'not_allowed'
      : message.includes('not_found') ? 'not_found'
        : message.includes('conflict')
          || message.includes('blocked')
          || message.includes('cannot_')
          || message.includes('not_settled')
          || message.includes('review_required')
          || message.includes('settlement_batch_transition')
          || message.includes('repayment_batch_managed')
          || message.includes('exceeds_available') ? 'conflict'
          : message.includes('invalid') || message.includes('required') || message.includes('mismatch')
            ? 'invalid_input'
            : 'save_failed'
  return { ok: false, error: code }
}

class ExpenseRpcError extends Error {
  readonly sqlState: string
  readonly reason: string
  readonly identifier: string | null

  constructor(error: { message?: string; code?: string }) {
    const message = error.message || error.code || 'expense_save_failed'
    super(message)
    this.name = 'ExpenseRpcError'
    this.sqlState = typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code
      : 'unknown'
    this.reason = message.toLowerCase().match(/\b(?:teskeid_event|expense)_[a-z0-9_]+\b/)?.[0]
      ?? 'unknown'
    const identifierMatch = message.match(
      /(?:column\s+(?:"([a-z_][a-z0-9_.]*)"|([a-z_][a-z0-9_.]*))\s+does not exist|record\s+"[a-z_][a-z0-9_]*"\s+has no field\s+"([a-z_][a-z0-9_]*)")/i,
    )
    this.identifier = (identifierMatch?.[1] ?? identifierMatch?.[2] ?? identifierMatch?.[3] ?? '')
      .toLowerCase()
      .slice(0, 120) || null
  }
}

function safeExpenseFailureDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const safeReason = message.match(/\b(?:teskeid_event|expense)_[a-z0-9_]+\b/)?.[0]
  return {
    sqlState: error instanceof ExpenseRpcError ? error.sqlState : 'unknown',
    reason: error instanceof ExpenseRpcError ? error.reason : safeReason ?? 'unknown',
    ...(error instanceof ExpenseRpcError && error.identifier
      ? { identifier: error.identifier }
      : {}),
  }
}

function rpcError(error: { message?: string; code?: string } | null): never {
  if (!error) throw new Error('expense_save_failed')
  throw new ExpenseRpcError(error)
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

function resultPositiveSafeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : Number.NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function resultEventVisibility(value: unknown): EventExpenseVisibility | null {
  return value === 'participants_only' || value === 'all_event' ? value : null
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
      p_payload: redactExpenseDraftEventGuestLabels(value.payload),
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
  eventSource?: EventExpenseSourceView | null,
): Promise<ResolvedExpenseMember[]> {
  const actorDisplayName = await getExpenseActorDisplayName(actorUserId)
  return resolveExpenseMembers({
    actorUserId,
    actorDisplayName,
    members,
    eventSource,
    // SQL132 validates a fresh relationship source after its exact receipt
    // lookup. This narrow fallback therefore preserves replay availability
    // without accepting a missing relationship on a first write.
    allowUnresolvedRelationshipReceiptReplay: Boolean(eventSource),
  })
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

type ExpenseParticipantInvitationInput =
  | { member_id: string; relationship_id: string }
  | { member_id: string; recipient_email: string }

function taggedExpenseMemberId(
  actorUserId: string,
  requestId: string,
  memberKey: string,
): string {
  const hex = createHash('sha256')
    .update(JSON.stringify(['teskeid-event-expense-member-v1', actorUserId, requestId, memberKey]))
    .digest('hex')
    .slice(0, 32)
    .split('')
  hex[12] = '4'
  hex[16] = '8'
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export async function createExpense(
  input: unknown,
): Promise<ExpenseActionResult<{ groupId: string; expenseId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = CreateExpenseSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data

    if (value.event_id && !await canUseEventExpenses(user)) {
      throw new Error('teskeid_event_unavailable')
    }
    const eventSource = value.event_id
      ? await getOwnedEventExpenseSource(user.id, value.event_id)
      : null
    if (value.event_id && !eventSource) throw new Error('teskeid_event_not_found')
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
      members = await resolveInputMembers(user.id, value.members, eventSource)
    }
    if (value.event_id) {
      // SQL132 fingerprints the compact payload. Stable IDs keep a lost-response
      // replay byte-identical instead of regenerating one-off member UUIDs.
      members = members.map((member) => ({
        ...member,
        id: taggedExpenseMemberId(user.id, value.request_id, member.key),
      }))
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

    const createRpc = value.event_id
      ? 'teskeid_event_create_expense_from_event_for_actor'
      : value.group_id
      ? 'expense_create_expense'
      : value.circle_id
        ? 'expense_create_expense_with_circle_context'
        : 'expense_create_expense_with_participants'
    const { data, error } = await getAdmin().rpc(
      createRpc,
      value.event_id ? {
        p_actor_id: user.id,
        p_request_id: value.request_id,
        p_event_id: value.event_id,
        p_expected_roster_revision: value.expected_event_roster_revision,
        p_link_to_event: value.link_to_event,
        p_payload: {
          title: value.title,
          total_minor: totalMinor,
          currency: value.currency,
          incurred_on: value.incurred_on,
          category: value.category,
          note: value.note,
          ...(value.link_to_event ? { event_visibility: value.event_visibility } : {}),
          split_method: value.split_method,
          one_off_members: members.map((member) => ({
            id: member.id,
            user_id: member.role === 'owner' ? member.userId : null,
            // SQL132 replaces mapped event guests from the locked roster.
            // A stable placeholder keeps exact replay fingerprints independent
            // of later roster snapshot edits without trusting client labels.
            display_name: member.eventGuestId || member.eventOrganizerParticipantId
              ? 'Event guest'
              : member.displayName,
            role: member.role,
            status: 'active',
          })),
          payments: payments.map((payment) => ({
            member_id: payment.payerId,
            amount_minor: payment.amountMinor,
          })),
          shares: shares.map((share) => ({
            member_id: share.participantId,
            amount_minor: share.amountMinor,
          })),
          obligations,
          participant_invitations: members.flatMap<ExpenseParticipantInvitationInput>((member) => {
            if (member.eventGuestId || member.eventOrganizerParticipantId) return []
            if (member.relationshipId) return [{
              member_id: member.id,
              relationship_id: member.relationshipId,
            }]
            if (member.recipientEmail) return [{
              member_id: member.id,
              recipient_email: member.recipientEmail,
            }]
            return []
          }),
          event_guest_members: members.flatMap((member) => (
            member.eventGuestId
              ? [{ event_guest_id: member.eventGuestId, member_id: member.id }]
              : []
          )),
          event_organizer_members: members.flatMap((member) => (
            member.eventOrganizerParticipantId
              ? [{
                event_participant_id: member.eventOrganizerParticipantId,
                member_id: member.id,
              }]
              : []
          )),
        },
      } : {
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
        ...(!value.group_id && !value.circle_id ? {
          p_participant_invitations: members.flatMap<ExpenseParticipantInvitationInput>((member) => {
            if (member.relationshipId) return [{
              member_id: member.id,
              relationship_id: member.relationshipId,
            }]
            if (member.recipientEmail) return [{
              member_id: member.id,
              recipient_email: member.recipientEmail,
            }]
            return []
          }),
        } : {}),
        ...(value.circle_id ? {
          p_circle_id: value.circle_id,
          p_known_circle_members: members.flatMap((member) => (
            member.circleMemberId
              ? [{ member_id: member.id, circle_member_id: member.circleMemberId }]
              : []
          )),
        } : {}),
      },
    )
    if (error) rpcError(error)
    const result = resultObject(data)
    const groupId = String(result.group_id ?? value.group_id ?? '')
    const persistedExpenseId = String(result.expense_id ?? (value.event_id ? '' : expenseId))
    if (!groupId || !persistedExpenseId) throw new Error('expense_save_failed')
    await deleteExpenseDraftAfterSave(user.id, value.draft_id)
    await deliverExpenseInvitationIds(user.id, result.invitation_ids)
    revalidateExpensePaths(
      groupId,
      persistedExpenseId,
      undefined,
      value.link_to_event ? value.event_id ?? undefined : undefined,
    )
    return { ok: true, data: { groupId, expenseId: persistedExpenseId } }
  } catch (error) {
    console.error('[expenses] create expense failed', safeExpenseFailureDiagnostic(error))
    return actionError(error)
  }
}

export async function attachExpenseToEvent(
  input: unknown,
): Promise<ExpenseActionResult<{
  expenseId: string
  eventId: string
  visibility: EventExpenseVisibility
  linkRevision: number
}>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = AttachExpenseToEventSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    if (!await canUseEventExpenses(user)) return { ok: false, error: 'feature_disabled' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc('teskeid_event_attach_expense_v2', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_expense_id: value.expense_id,
      p_event_id: value.event_id,
      p_expected_financial_version: value.expected_financial_version,
      p_expected_roster_revision: value.expected_event_roster_revision,
      p_visibility: value.visibility,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const expenseId = String(result.expense_id ?? '')
    const eventId = String(result.event_id ?? '')
    const visibility = resultEventVisibility(result.visibility)
    const linkRevision = resultPositiveSafeInteger(result.link_revision)
    if (
      expenseId !== value.expense_id
      || eventId !== value.event_id
      || visibility !== value.visibility
      || linkRevision !== 1
    ) {
      throw new Error('teskeid_event_link_invalid')
    }
    revalidateExpensePaths(undefined, expenseId, undefined, eventId)
    return { ok: true, data: { expenseId, eventId, visibility, linkRevision } }
  } catch (error) {
    console.error('[expenses] attach event failed', safeExpenseFailureDiagnostic(error))
    return actionError(error)
  }
}

export async function setExpenseEventVisibility(
  input: unknown,
): Promise<ExpenseActionResult<{
  expenseId: string
  eventId: string
  previousVisibility: EventExpenseVisibility
  visibility: EventExpenseVisibility
  previousLinkRevision: number
  linkRevision: number
}>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = SetExpenseEventVisibilitySchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    if (!await canUseEventExpenses(user)) return { ok: false, error: 'feature_disabled' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc('teskeid_event_set_expense_visibility', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_expense_id: value.expense_id,
      p_expected_event_id: value.expected_event_id,
      p_expected_link_revision: value.expected_link_revision,
      p_visibility: value.visibility,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const expenseId = String(result.expense_id ?? '')
    const eventId = String(result.event_id ?? '')
    const previousVisibility = resultEventVisibility(result.previous_visibility)
    const visibility = resultEventVisibility(result.visibility)
    const previousLinkRevision = resultPositiveSafeInteger(result.previous_link_revision)
    const linkRevision = resultPositiveSafeInteger(result.link_revision)
    const expectedResultRevision = previousVisibility === value.visibility
      ? value.expected_link_revision
      : value.expected_link_revision + 1
    if (
      expenseId !== value.expense_id
      || eventId !== value.expected_event_id
      || previousVisibility === null
      || visibility !== value.visibility
      || previousLinkRevision !== value.expected_link_revision
      || linkRevision !== expectedResultRevision
    ) {
      throw new Error('teskeid_event_visibility_invalid')
    }
    revalidateExpensePaths(undefined, expenseId, undefined, eventId)
    return {
      ok: true,
      data: {
        expenseId,
        eventId,
        previousVisibility,
        visibility,
        previousLinkRevision,
        linkRevision,
      },
    }
  } catch (error) {
    console.error('[expenses] set event visibility failed', safeExpenseFailureDiagnostic(error))
    return actionError(error)
  }
}

export async function detachExpenseFromEvent(
  input: unknown,
): Promise<ExpenseActionResult<{ expenseId: string; eventId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = DetachExpenseFromEventSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    if (!await canUseEventExpenses(user)) return { ok: false, error: 'feature_disabled' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc('teskeid_event_detach_expense', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_expense_id: value.expense_id,
      p_expected_event_id: value.expected_event_id,
      p_expected_financial_version: value.expected_financial_version,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const expenseId = String(result.expense_id ?? '')
    const eventId = String(result.event_id ?? '')
    if (expenseId !== value.expense_id || eventId !== value.expected_event_id) {
      throw new Error('teskeid_event_link_invalid')
    }
    revalidateExpensePaths(undefined, expenseId, undefined, eventId)
    return { ok: true, data: { expenseId, eventId } }
  } catch (error) {
    console.error('[expenses] detach event failed', safeExpenseFailureDiagnostic(error))
    return actionError(error)
  }
}

export async function bindExpenseMemberEventIdentity(
  input: unknown,
): Promise<ExpenseActionResult<{
  expenseId: string
  memberId: string
  financialVersion: number
}>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = BindExpenseMemberEventIdentitySchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc(
      'expense_bind_member_event_identity',
      {
        p_actor_id: user.id,
        p_request_id: value.request_id,
        p_expense_id: value.expense_id,
        p_member_id: value.member_id,
        p_event_participant_id: value.event_participant_id,
        p_expected_financial_version: value.expected_financial_version,
      },
    )
    if (error) rpcError(error)
    const result = resultObject(data)
    const financialVersion = Number(result.financial_version)
    if (result.expense_id !== value.expense_id
      || result.member_id !== value.member_id
      || !Number.isSafeInteger(financialVersion)) {
      throw new Error('expense_identity_result_invalid')
    }
    revalidateExpensePaths(
      typeof result.group_id === 'string' ? result.group_id : undefined,
      value.expense_id,
      undefined,
      typeof result.event_id === 'string' ? result.event_id : undefined,
    )
    return {
      ok: true,
      data: {
        expenseId: value.expense_id,
        memberId: value.member_id,
        financialVersion,
      },
    }
  } catch (error) {
    console.error('[expenses] bind event identity failed', safeExpenseFailureDiagnostic(error))
    return actionError(error)
  }
}

export async function disputeExpenseClaim(
  input: unknown,
): Promise<ExpenseActionResult<{
  expenseId: string
  memberId: string
  status: 'disputed'
  financialVersion: number
}>> {
  const { user } = await guardExpenseSession()
  try {
    const parsed = DisputeExpenseClaimSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const value = parsed.data
    const { data, error } = await getAdmin().rpc('expense_dispute_claim', {
      p_actor_id: user.id,
      p_request_id: value.request_id,
      p_expense_id: value.expense_id,
      p_member_id: value.member_id,
      p_expected_financial_version: value.expected_financial_version,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const financialVersion = Number(result.financial_version)
    if (result.expense_id !== value.expense_id
      || result.member_id !== value.member_id
      || result.status !== 'disputed'
      || !Number.isSafeInteger(financialVersion)) {
      throw new Error('expense_claim_result_invalid')
    }
    revalidateExpensePaths(
      typeof result.group_id === 'string' ? result.group_id : undefined,
      value.expense_id,
    )
    return {
      ok: true,
      data: {
        expenseId: value.expense_id,
        memberId: value.member_id,
        status: 'disputed',
        financialVersion,
      },
    }
  } catch (error) {
    console.error('[expenses] dispute claim failed', safeExpenseFailureDiagnostic(error))
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

    const { data, error } = await admin.rpc('expense_update_expense_with_participants', {
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
      p_new_guest_members: value.new_members.map(({ id, display_name }) => ({ id, display_name })),
      p_new_participant_invitations: value.new_members.flatMap<ExpenseParticipantInvitationInput>((member) => {
        if (member.relationship_id) return [{ member_id: member.id, relationship_id: member.relationship_id }]
        if (member.recipient_email) return [{ member_id: member.id, recipient_email: member.recipient_email }]
        return []
      }),
      p_removed_member_ids: value.removed_member_ids,
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
    await deliverExpenseInvitationIds(user.id, result.invitation_ids)
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

function isExpenseInvitationTemplateVersion(
  value: unknown,
): value is 'v1' | 'v2' | 'v3' {
  return value === 'v1' || value === 'v2' || value === 'v3'
}

async function deliverExpenseMemberInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<ExpenseInvitationDelivery> {
  const admin = getAdmin()
  const { data, error } = await admin.rpc('expense_reserve_scoped_member_invitation_send', {
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
    || !isExpenseInvitationTemplateVersion(row.email_template_version)
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
      templateVersion: row.email_template_version,
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

async function deliverExpenseInvitationIds(actorUserId: string, rawIds: unknown): Promise<void> {
  if (!Array.isArray(rawIds)) return
  const ids = rawIds.filter((value): value is string => typeof value === 'string').slice(0, 49)
  for (const invitationId of ids) {
    await deliverExpenseMemberInvitation(actorUserId, invitationId)
  }
}

export async function linkExpenseGuestMember(
  input: unknown,
): Promise<ExpenseActionResult<{ invitationId: string; delivery: ExpenseInvitationDelivery }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = LinkExpenseGuestMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_invite_existing_participant', {
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

export async function renameExpenseGuestMember(
  input: unknown,
): Promise<ExpenseActionResult<{ displayName: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = RenameExpenseGuestMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_rename_guest_member', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_member_id: parsed.data.member_id,
      p_display_name: parsed.data.display_name,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const displayName = String(result.display_name ?? '')
    const expenseId = String(result.expense_id ?? '')
    if (!displayName || !expenseId) throw new Error('expense_save_failed')
    revalidateExpensePaths(parsed.data.group_id, expenseId)
    return { ok: true, data: { displayName } }
  } catch (error) {
    console.error('[expenses] rename guest member failed')
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
): Promise<ExpenseActionResult<{ status: 'accepted' | 'declined' | 'expired'; groupId?: string; expenseId?: string }>> {
  const { user } = await guardExpenseSession()
  try {
    const parsed = RespondExpenseMemberInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const admin = getAdmin()
    if (parsed.data.action === 'accept') {
      const { data: previewData, error: previewError } = await admin.rpc(
        'expense_get_scoped_member_invitation_preview',
        { p_actor_id: user.id, p_invitation_id: parsed.data.invitation_id },
      )
      if (previewError) rpcError(previewError)
      const preview = Array.isArray(previewData) ? previewData[0] : previewData
      if (!preview || typeof preview !== 'object'
        || (preview as Record<string, unknown>).expense_id !== parsed.data.expected_expense_id) {
        throw new Error('expense_save_failed')
      }
    }
    const { data, error } = await admin.rpc('expense_respond_scoped_member_invitation', {
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
    const expenseId = typeof result.expense_id === 'string' ? result.expense_id : undefined
    if (status === 'accepted') {
      if (!expenseId || expenseId !== parsed.data.expected_expense_id) {
        throw new Error('expense_save_failed')
      }
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
          const privateDisplayName = result.participant_source === 'manual_email'
            ? null
            : invitationData
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
    return { ok: true, data: {
      status,
      ...(groupId ? { groupId } : {}),
      ...(expenseId ? { expenseId } : {}),
    } }
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

export async function addExpenseGroupMember(
  input: unknown,
): Promise<ExpenseActionResult<{ memberId: string; invitationId?: string; delivery?: ExpenseInvitationDelivery }>> {
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
          : parsed.data.member.type === 'email'
            ? {
              type: 'email',
              key: 'new',
              display_name: parsed.data.member.display_name,
              recipient_email: parsed.data.member.recipient_email,
            }
            : { type: 'relationship', key: 'new', relationship_id: parsed.data.member.relationship_id },
      ],
    })
    const member = members.find((candidate) => candidate.key === 'new')
    if (!member) throw new Error('expense_member_invalid')
    const { data, error } = await getAdmin().rpc('expense_add_participant', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_request_id: parsed.data.request_id,
      p_member: {
        id: member.id,
        display_name: member.displayName,
      },
      p_recipient_email: member.recipientEmail ?? null,
      p_relationship_id: member.relationshipId ?? null,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const invitationId = typeof result.invitation_id === 'string' ? result.invitation_id : undefined
    const delivery = invitationId
      ? await deliverExpenseMemberInvitation(user.id, invitationId)
      : undefined
    revalidateExpensePaths(parsed.data.group_id)
    return {
      ok: true,
      data: {
        memberId: String(result.member_id ?? member.id),
        ...(invitationId ? { invitationId } : {}),
        ...(delivery ? { delivery } : {}),
      },
    }
  } catch (error) {
    console.error('[expenses] add member failed')
    return actionError(error)
  }
}

export async function addExpenseShareCollaborator(
  input: unknown,
): Promise<ExpenseActionResult<{
  memberId: string
  invitationId?: string
  delivery?: ExpenseInvitationDelivery
}>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = AddExpenseShareCollaboratorSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const actorDisplayName = await getExpenseActorDisplayName(user.id)
    const members = await resolveExpenseMembers({
      actorUserId: user.id,
      actorDisplayName,
      members: [
        { type: 'self', key: 'self' },
        parsed.data.member.type === 'guest'
          ? { type: 'guest', key: 'new', display_name: parsed.data.member.display_name }
          : parsed.data.member.type === 'email'
            ? {
              type: 'email',
              key: 'new',
              display_name: parsed.data.member.display_name,
              recipient_email: parsed.data.member.recipient_email,
            }
            : { type: 'relationship', key: 'new', relationship_id: parsed.data.member.relationship_id },
      ],
    })
    const member = members.find((candidate) => candidate.key === 'new')
    if (!member) throw new Error('expense_member_invalid')
    const { data, error } = await getAdmin().rpc('expense_add_share_collaborator', {
      p_actor_id: user.id,
      p_group_id: parsed.data.group_id,
      p_expense_id: parsed.data.expense_id,
      p_share_member_id: parsed.data.share_member_id,
      p_request_id: parsed.data.request_id,
      p_member: {
        id: member.id,
        display_name: member.displayName,
      },
      p_recipient_email: member.recipientEmail ?? null,
      p_relationship_id: member.relationshipId ?? null,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const invitationId = typeof result.invitation_id === 'string'
      ? result.invitation_id
      : undefined
    const delivery = invitationId
      ? await deliverExpenseMemberInvitation(user.id, invitationId)
      : undefined
    revalidateExpensePaths(parsed.data.group_id, parsed.data.expense_id)
    return {
      ok: true,
      data: {
        memberId: String(result.member_id ?? member.id),
        ...(invitationId ? { invitationId } : {}),
        ...(delivery ? { delivery } : {}),
      },
    }
  } catch (error) {
    console.error('[expenses] add share collaborator failed')
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

export async function recordExpenseRepaymentReceived(
  input: unknown,
): Promise<ExpenseActionResult<{ repaymentId: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = RecordExpenseRepaymentReceivedSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const amountMinor = parseExpenseAmountToMinor(parsed.data.amount, parsed.data.currency)
    const { data, error } = await getAdmin().rpc('expense_record_received_repayment', {
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
    const result = resultObject(data)
    const repaymentId = String(result.repayment_id ?? '')
    const groupId = String(result.group_id ?? '')
    if (!repaymentId) throw new Error('expense_save_failed')
    revalidateExpensePaths(groupId || parsed.data.group_id, undefined, repaymentId)
    return { ok: true, data: { repaymentId } }
  } catch (error) {
    console.error('[expenses] record received repayment failed')
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

function revalidateExpenseBatchPaths(groupIds: readonly unknown[]) {
  revalidateExpensePaths()
  for (const groupId of new Set(
    groupIds.filter((value): value is string => typeof value === 'string' && value.length > 0),
  )) {
    revalidatePath(`${EXPENSES_PATH}/hopar/${groupId}`)
  }
}

export async function proposeExpenseSettlementBatch(
  input: unknown,
): Promise<ExpenseActionResult<{ batchId: string; status: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = ProposeExpenseSettlementBatchSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const cashMinor = parseExpenseAmountToMinor(
      parsed.data.cash_amount,
      parsed.data.currency,
      { allowZero: true },
    )
    const { data, error } = await getAdmin().rpc('expense_propose_settlement_batch', {
      p_actor_id: user.id,
      p_anchor_group_id: parsed.data.anchor.group_id,
      p_anchor_from_member_id: parsed.data.anchor.from_member_id,
      p_anchor_to_member_id: parsed.data.anchor.to_member_id,
      p_currency: parsed.data.currency,
      p_expected_contexts: parsed.data.expected_contexts,
      p_expected_profile_id: parsed.data.expected_payment_profile?.profile_id ?? null,
      p_expected_profile_version: parsed.data.expected_payment_profile?.version ?? null,
      p_expected_profile_state_token:
        parsed.data.expected_payment_profile?.state_token ?? null,
      p_cash_minor: cashMinor,
      p_use_offset: parsed.data.use_offset,
      p_occurred_on: parsed.data.occurred_on,
      p_note: parsed.data.note,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const batchId = String(result.batch_id ?? '')
    const status = String(result.status ?? '')
    if (!batchId || status !== 'proposed') throw new Error('expense_save_failed')
    revalidateExpenseBatchPaths(Array.isArray(result.group_ids) ? result.group_ids : [])
    return { ok: true, data: { batchId, status } }
  } catch (error) {
    console.error('[expenses] propose settlement batch failed')
    return actionError(error)
  }
}

export async function transitionExpenseSettlementBatch(
  input: unknown,
): Promise<ExpenseActionResult<{ status: string }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = TransitionExpenseSettlementBatchSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { data, error } = await getAdmin().rpc('expense_transition_settlement_batch', {
      p_actor_id: user.id,
      p_batch_id: parsed.data.batch_id,
      p_action: parsed.data.action,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    const result = resultObject(data)
    const status = String(result.status ?? '')
    const expectedStatus = {
      confirm: 'confirmed',
      reject: 'rejected',
      cancel: 'cancelled',
    }[parsed.data.action]
    if (status !== expectedStatus) throw new Error('expense_save_failed')
    revalidateExpenseBatchPaths(Array.isArray(result.group_ids) ? result.group_ids : [])
    return { ok: true, data: { status } }
  } catch (error) {
    console.error('[expenses] transition settlement batch failed')
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

export async function saveExpensePaymentProfileV2(
  input: unknown,
): Promise<ExpenseActionResult<{ profileId: string; version: number }>> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = SaveExpensePaymentProfileV2Schema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const normalized = normalizeExpensePaymentProfile({
      bank: parsed.data.bank,
      ledger: parsed.data.ledger,
      account: parsed.data.account,
      nationalId: parsed.data.national_id,
      other: parsed.data.other,
    })
    if (!normalized.ok || expensePaymentProfileIsEmpty(normalized.value)) {
      return { ok: false, error: 'invalid_input' }
    }
    const profileId = parsed.data.profile_id ?? randomUUID()
    const encrypted = encryptExpensePaymentProfile({
      ownerUserId: user.id,
      profileId,
      details: normalized.value,
    })
    const admin = getAdmin()
    let legacySnapshots: Array<{ id: string; payment_preference_snapshot: Record<string, unknown> }> = []
    let legacyPreferenceCount = 0
    if (parsed.data.profile_id === null) {
      const [snapshotResult, preferenceResult] = await Promise.all([
        admin.from('expense_repayments')
          .select('id, payment_preference_snapshot')
          .contains('payment_preference_snapshot', { owner_user_id: user.id })
          .limit(501),
        admin.from('expense_payment_preferences')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', user.id),
      ])
      const { data: snapshotData, error: snapshotError } = snapshotResult
      if (snapshotError) rpcError(snapshotError)
      if (preferenceResult.error) rpcError(preferenceResult.error)
      legacySnapshots = (snapshotData ?? []) as typeof legacySnapshots
      legacyPreferenceCount = preferenceResult.count ?? 0
      if (legacySnapshots.length > 500) return { ok: false, error: 'conflict' }
    }
    const encryptedSnapshots = legacySnapshots.map((row) => {
      const snapshot = row.payment_preference_snapshot
      const sourceProfileId = typeof snapshot.source_preference_id === 'string' ? snapshot.source_preference_id : ''
      const sourceVersion = Number(snapshot.source_version)
      const capturedAt = typeof snapshot.captured_at === 'string' ? snapshot.captured_at : ''
      const rawDetails = snapshot.details && typeof snapshot.details === 'object' && !Array.isArray(snapshot.details)
        ? snapshot.details as Record<string, unknown>
        : {}
      if (!sourceProfileId || !Number.isSafeInteger(sourceVersion) || sourceVersion < 1 || Number.isNaN(Date.parse(capturedAt))) {
        throw new Error('expense_invalid_input')
      }
      const accountDigits = typeof rawDetails.accountNumber === 'string'
        ? rawDetails.accountNumber.replace(/\D/g, '')
        : ''
      const nationalDigits = typeof rawDetails.nationalId === 'string'
        ? rawDetails.nationalId.replace(/\D/g, '')
        : ''
      const other = ['instructions', 'phoneNumber', 'paymentLink', 'defaultReference']
        .flatMap((key) => typeof rawDetails[key] === 'string' && rawDetails[key].trim() ? [rawDetails[key].trim()] : [])
        .filter((value, index, all) => all.indexOf(value) === index)
        .join('\n')
        .slice(0, 1000)
      const snapshotDetails: NormalizedExpensePaymentProfileDetails = {
        bank: accountDigits.length === 12 ? accountDigits.slice(0, 4) : null,
        ledger: accountDigits.length === 12 ? accountDigits.slice(4, 6) : null,
        account: accountDigits.length === 12 ? accountDigits.slice(6) : null,
        nationalId: nationalDigits.length === 10 ? nationalDigits : null,
        other: other || null,
      }
      const snapshotEncrypted = encryptExpensePaymentProfile({
        ownerUserId: user.id,
        profileId: sourceProfileId,
        details: snapshotDetails,
      })
      return {
        repayment_id: row.id,
        snapshot: {
          profile_id: sourceProfileId,
          owner_user_id: user.id,
          profile_version: sourceVersion,
          captured_at: new Date(capturedAt).toISOString(),
          envelope: snapshotEncrypted.envelope,
        },
      }
    })
    const useConversion = parsed.data.profile_id === null
      && (legacySnapshots.length > 0 || legacyPreferenceCount > 0)
    const { data, error } = await admin.rpc(
      useConversion ? 'expense_convert_legacy_payment_profile_v2' : 'expense_save_payment_profile_v2',
      useConversion ? {
        p_actor_id: user.id,
        p_profile_id: profileId,
        p_envelope: encrypted.envelope,
        p_payload_fingerprint: encrypted.fingerprint,
        p_encrypted_snapshots: encryptedSnapshots,
        p_request_id: parsed.data.request_id,
      } : {
      p_actor_id: user.id,
      p_profile_id: profileId,
      p_expected_version: parsed.data.expected_version,
      p_envelope: encrypted.envelope,
      p_payload_fingerprint: encrypted.fingerprint,
      p_request_id: parsed.data.request_id,
      },
    )
    if (error) rpcError(error)
    const result = resultObject(data)
    const version = Number(result.version)
    if (!Number.isSafeInteger(version) || version < 1) throw new Error('expense_save_failed')
    revalidateExpensePaths()
    revalidatePath(`${EXPENSES_PATH}/greidsluleidir`)
    return { ok: true, data: { profileId, version } }
  } catch (error) {
    if (error instanceof ExpensePaymentCryptoUnavailableError) {
      return { ok: false, error: 'feature_disabled' }
    }
    console.error('[expenses] save encrypted payment profile failed')
    return actionError(error)
  }
}

export async function clearExpensePaymentProfileV2(
  input: unknown,
): Promise<ExpenseActionResult> {
  const { user } = await guardExpenseAccess()
  try {
    const parsed = ClearExpensePaymentProfileV2Schema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'invalid_input' }
    const { error } = await getAdmin().rpc('expense_clear_payment_profile_v2', {
      p_actor_id: user.id,
      p_profile_id: parsed.data.profile_id,
      p_expected_version: parsed.data.expected_version,
      p_request_id: parsed.data.request_id,
    })
    if (error) rpcError(error)
    revalidateExpensePaths()
    revalidatePath(`${EXPENSES_PATH}/greidsluleidir`)
    return { ok: true }
  } catch (error) {
    console.error('[expenses] clear encrypted payment profile failed')
    return actionError(error)
  }
}
