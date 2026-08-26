import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getExpensePayAllEventLabels } from '@/lib/events/repository.server'
import {
  aggregateLedgerBalances,
  applySettlementTransfers,
  reportedRepaymentsNeedingReview,
  settlementTransferReviewKey,
  simplifySettlement,
} from './balances'
import { addMinorAmounts } from './money'
import {
  buildExpensePayAllContext,
  buildExpensePayAllPairContext,
  buildExpensePayAllView,
  expensePayAllCanonicalPairDirection,
  expensePayAllSafeFirstName,
  expensePayAllSelfMemberIds,
  type ExpensePayAllCandidate,
  type ExpensePayAllPairCandidate,
} from './pay-all'
import { parseExpenseAmountToMinor } from './input-money'
import { paymentSnapshotForViewer } from './payment-snapshot-visibility'
import {
  decryptExpensePaymentProfile,
  expensePaymentCryptoConfigured,
} from './payment-crypto.server'
import {
  formatExpenseBankAccount,
  formatExpenseNationalId,
} from './payment-profile'
import { canLeaveExpenseGroup } from './member-exit'
import { canActAsExpenseMember, canManageExpenseMemberOnBehalf } from './policy'
import { expenseInvitationRecipientProjection } from './invitation-visibility'
import { EXPENSE_FEATURE_KEY } from './contracts'
import type {
  DebtObligation,
  ExpenseLedgerEntry,
  PaymentPreferenceDetails,
  Repayment,
} from './types'
import type {
  ExpenseActivityView,
  ExpenseBalanceView,
  ExpenseDashboardView,
  ExpenseDashboardSharedDraftSummaryView,
  ExpenseGroupView,
  ExpenseGroupSummaryView,
  ExpenseIdentityProofKind,
  ExpenseEventIdentityCandidatesView,
  ExpenseInvitationView,
  ExpenseIncompleteDraftSummaryView,
  ExpenseItemView,
  ExpenseMemberInvitationView,
  ExpenseMemberInvitationPreviewView,
  ExpenseItemLookupResult,
  ExpenseMemberRole,
  ExpenseMemberView,
  ExpensePaymentPreferenceView,
  ExpensePaymentProfileV2View,
  ExpensePayAllBlockedContextView,
  ExpensePendingSettlementBatchView,
  ExpensePayAllPaymentDetailsView,
  ExpensePayAllView,
  ExpenseRepaymentView,
  ExpenseRevisionSnapshot,
  ExpenseRevisionView,
} from './contracts'
import type { ExpenseActivityEventType } from './events'
import {
  ExpenseDraftPayloadSchema,
  getExpenseDraftAttention,
  redactExpenseDraftEventGuestLabels,
  type ExpensePrivateDraftView,
} from './drafts'
import {
  parseExpenseDraftPublicationLifecycle,
  parseExpenseSharedDraftDetail,
  parseVisibleSharedExpenseDrafts,
  type ExpenseDraftPublicationLifecycleView,
  type ExpenseSharedDraftDetailView,
  type ExpenseSharedDraftListView,
} from './unconfirmed-publication'

interface GroupRow {
  id: string
  kind: 'group' | 'one_off'
  name: string
  description: string | null
  emoji: string | null
  default_currency: string
  default_include_creator: boolean
  status: 'active' | 'settling' | 'settled' | 'closed'
  financial_version: number
  created_at: string
}

interface MemberRow {
  id: string
  group_id: string
  user_id: string | null
  display_name: string
  role: ExpenseMemberRole
  status: 'invited' | 'active' | 'declined' | 'removed' | 'left'
  created_at: string
}

interface ExpenseRow {
  id: string
  group_id: string
  title: string
  total_minor: number | string
  currency: string
  incurred_on: string
  category: string | null
  note: string | null
  status: 'active' | 'cancelled'
  split_method: ExpenseItemView['splitMethod']
  created_by: string | null
  created_at: string
}

interface PaymentRow {
  expense_id: string
  member_id: string
  amount_minor: number | string
}

interface ShareRow {
  expense_id: string
  member_id: string
  amount_minor: number | string
}

interface ObligationRow {
  id: string
  group_id: string
  from_member_id: string
  to_member_id: string
  amount_minor: number | string
  currency: string
}

interface RepaymentRow {
  id: string
  group_id: string
  from_member_id: string
  to_member_id: string
  amount_minor: number | string
  currency: string
  occurred_on: string
  note: string | null
  status: 'reported' | 'confirmed' | 'rejected' | 'cancelled'
  reported_by: string | null
  payment_preference_snapshot: Record<string, unknown> | null
  created_at: string
}

interface AllocationRow {
  repayment_id: string
  obligation_id: string
  amount_minor: number | string
}

interface SettlementBatchRepaymentLinkRow {
  repayment_id: string
  batch_id: string
  method: 'external_payment' | 'debt_offset'
}

interface ActivityRow {
  id: string
  sequence_no: number | string
  event_type: ExpenseActivityEventType
  entity_type: ExpenseActivityView['entityType']
  entity_id: string
  summary_code: string
  actor_display_name: string
  expense_title: string | null
  group_title: string | null
  created_at: string
}

interface RevisionRow {
  id: string
  activity_id: string
  financial_version_before: number | string
  financial_version_after: number | string
  changed_fields: unknown
  before_snapshot: unknown
  after_snapshot: unknown
  created_at: string
}

interface MemberInvitationRow {
  id: string
  group_id: string
  member_id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
  attempt_status: 'reserved' | 'sent' | 'failed' | null
  recipient_email_canonical: string
}

interface ShareCollaboratorRow {
  id: string
  group_id: string
  expense_id: string
  share_member_id: string
  collaborator_member_id: string
  status: 'active' | 'removed'
  created_at: string
}

interface MemberNameRevisionRow {
  activity_id: string
  old_display_name: string
  new_display_name: string
}

interface ExpenseClaimContext {
  requiresReview: boolean
  disputes: Array<{
    expenseId: string
    memberId: string
    status: 'disputed'
    isSelf: boolean
  }>
  bindings: Array<{
    memberId: string
    proofKind: ExpenseIdentityProofKind
    isSelf: boolean
  }>
}

const GROUP_SELECT = 'id, kind, name, description, emoji, default_currency, default_include_creator, status, financial_version, created_at'
const MEMBER_SELECT = 'id, group_id, user_id, display_name, role, status, created_at'
const EXPENSE_SELECT = 'id, group_id, title, total_minor, currency, incurred_on, category, note, status, split_method, created_by, created_at'

function safeMinor(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(amount)) throw new Error('expense_amount_invalid')
  return amount
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.length <= maximum ? value : null
}

function parseRevisionSnapshot(value: unknown): ExpenseRevisionSnapshot | null {
  const source = record(value)
  const expense = record(source?.expense)
  if (!source || source.version !== 1 || !expense) return null
  const groupStatus = source.groupStatus
  const splitMethod = expense.splitMethod
  if (!['active', 'settling', 'settled', 'closed'].includes(String(groupStatus))
    || !['equal', 'percentage', 'weighted', 'fixed', 'mixed_equal_remainder', 'mixed_percentage_remainder'].includes(String(splitMethod))) {
    return null
  }
  const title = boundedString(expense.title, 200)
  const note = expense.note === null ? null : boundedString(expense.note, 1000)
  const currency = boundedString(expense.currency, 3)
  const incurredOn = boundedString(expense.incurredOn, 10)
  const category = expense.category === null ? null : boundedString(expense.category, 40)
  const totalMinor = Number(expense.totalMinor)
  if (title === null || note === null && expense.note !== null || currency === null
    || incurredOn === null || category === null && expense.category !== null
    || !Number.isSafeInteger(totalMinor) || totalMinor < 0) return null

  const parseAmounts = (rows: unknown, maximum: number) => {
    if (!Array.isArray(rows) || rows.length > maximum) return null
    const parsed = rows.map((item) => {
      const row = record(item)
      const memberId = boundedString(row?.memberId, 64)
      const displayName = boundedString(row?.displayName, 120)
      const amountMinor = Number(row?.amountMinor)
      return row && memberId && displayName !== null && Number.isSafeInteger(amountMinor)
        ? { memberId, displayName, amountMinor }
        : null
    })
    return parsed.every((item) => item !== null) ? parsed as Array<{ memberId: string; displayName: string; amountMinor: number }> : null
  }
  const payments = parseAmounts(source.payments, 50)
  const shares = parseAmounts(source.shares, 50)
  const balanceAmounts = parseAmounts(source.balances, 50)
  if (!payments || !shares || !balanceAmounts) return null
  const balances = balanceAmounts.map((balance, index) => {
    const sourceBalance = record((source.balances as unknown[])[index])
    const balanceCurrency = boundedString(sourceBalance?.currency, 3)
    return balanceCurrency ? { ...balance, currency: balanceCurrency } : null
  })
  if (balances.some((balance) => balance === null)) return null
  const repaymentSummarySource = record(source.repaymentSummary)
  if (!repaymentSummarySource) return null
  const repaymentSummary = {
    reported: Number(repaymentSummarySource.reported),
    confirmed: Number(repaymentSummarySource.confirmed),
    rejected: Number(repaymentSummarySource.rejected),
    cancelled: Number(repaymentSummarySource.cancelled),
  }
  if (Object.values(repaymentSummary).some((count) => !Number.isSafeInteger(count) || count < 0)) return null
  return {
    version: 1,
    groupStatus: groupStatus as ExpenseRevisionSnapshot['groupStatus'],
    expense: {
      title,
      note,
      totalMinor,
      currency,
      incurredOn,
      category,
      splitMethod: splitMethod as ExpenseRevisionSnapshot['expense']['splitMethod'],
    },
    payments,
    shares,
    balances: balances as ExpenseRevisionSnapshot['balances'],
    repaymentSummary,
  }
}

function parseRevision(row: RevisionRow): ExpenseRevisionView | null {
  const before = parseRevisionSnapshot(row.before_snapshot)
  const after = parseRevisionSnapshot(row.after_snapshot)
  const beforeVersion = Number(row.financial_version_before)
  const afterVersion = Number(row.financial_version_after)
  const changedFields = Array.isArray(row.changed_fields)
    ? row.changed_fields.filter((field): field is string => typeof field === 'string')
    : []
  if (!before || !after || !Number.isSafeInteger(beforeVersion) || !Number.isSafeInteger(afterVersion)
    || changedFields.length === 0 || changedFields.length > 8) return null
  return {
    id: row.id,
    activityId: row.activity_id,
    financialVersionBefore: beforeVersion,
    financialVersionAfter: afterVersion,
    changedFields,
    actorDisplayName: '',
    summaryCode: 'expense_updated',
    before,
    after,
    createdAt: row.created_at,
  }
}

function throwOnError(error: unknown, operation: string): void {
  if (!error) return
  console.error(`[expenses] ${operation} failed`)
  throw new Error('expense_load_failed')
}

function isMissingOptionalExpenseRelation(error: unknown, relation: string): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = 'message' in error ? String(error.message) : ''
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes(relation) && message.includes('does not exist')
}

async function loadGroupRows(groupId: string, actorUserId: string): Promise<{
  group: GroupRow
  members: MemberRow[]
  expenses: ExpenseRow[]
  payments: PaymentRow[]
  shares: ShareRow[]
  obligations: ObligationRow[]
  repayments: RepaymentRow[]
  allocations: AllocationRow[]
  activity: ActivityRow[]
  memberInvitations: MemberInvitationRow[]
  shareCollaborators: ShareCollaboratorRow[]
  shareCollaborationReady: boolean
  memberNameRevisions: MemberNameRevisionRow[]
  guestMemberRenameReady: boolean
  settlementBatchRepaymentLinks: SettlementBatchRepaymentLinkRow[]
  settlementBatchReady: boolean
  claimContext: ExpenseClaimContext
  creatorNames: Map<string, string>
}> {
  const admin = getAdmin()
  const [groupResult, membersResult, expensesResult, repaymentsResult, activityResult, memberInvitationsResult, claimContextResult] = await Promise.all([
    admin.from('expense_groups').select(GROUP_SELECT).eq('id', groupId).maybeSingle(),
    admin.from('expense_group_members').select(MEMBER_SELECT).eq('group_id', groupId).order('created_at', { ascending: true }),
    admin.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId).order('incurred_on', { ascending: false }).order('created_at', { ascending: false }),
    admin.from('expense_repayments').select('id, group_id, from_member_id, to_member_id, amount_minor, currency, occurred_on, note, status, reported_by, payment_preference_snapshot, created_at').eq('group_id', groupId).order('created_at', { ascending: false }),
    admin.from('expense_activity').select('id, sequence_no, event_type, entity_type, entity_id, summary_code, actor_display_name, expense_title, group_title, created_at').eq('group_id', groupId).order('sequence_no', { ascending: false }).limit(50),
    admin.from('expense_member_invitations').select('id, group_id, member_id, status, attempt_status, recipient_email_canonical').eq('group_id', groupId).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    admin.rpc('expense_get_claim_context', {
      p_actor_id: actorUserId,
      p_group_id: groupId,
    }),
  ])
  throwOnError(groupResult.error, 'group query')
  throwOnError(membersResult.error, 'member query')
  throwOnError(expensesResult.error, 'expense query')
  throwOnError(repaymentsResult.error, 'repayment query')
  throwOnError(activityResult.error, 'activity query')
  throwOnError(memberInvitationsResult.error, 'member invitation query')
  throwOnError(claimContextResult.error, 'claim context query')
  if (!groupResult.data) throw new Error('expense_not_found')

  const members = (membersResult.data ?? []) as MemberRow[]
  const expenses = (expensesResult.data ?? []) as ExpenseRow[]
  const repayments = (repaymentsResult.data ?? []) as RepaymentRow[]
  const expenseIds = expenses.map((row) => row.id)
  const repaymentIds = repayments.map((row) => row.id)
  const creatorUserIds = [...new Set(expenses.flatMap((row) => row.created_by ? [row.created_by] : []))]
  const empty = { data: [] as unknown[], error: null }
  const [
    paymentsResult,
    sharesResult,
    obligationsResult,
    allocationsResult,
    shareCollaboratorsResult,
    memberNameRevisionsResult,
    settlementBatchItemsResult,
    creatorProfilesResult,
  ] = await Promise.all([
    expenseIds.length > 0
      ? admin.from('expense_payments').select('expense_id, member_id, amount_minor').in('expense_id', expenseIds)
      : Promise.resolve(empty),
    expenseIds.length > 0
      ? admin.from('expense_shares').select('expense_id, member_id, amount_minor').in('expense_id', expenseIds)
      : Promise.resolve(empty),
    admin.from('expense_obligations').select('id, group_id, from_member_id, to_member_id, amount_minor, currency').eq('group_id', groupId),
    repaymentIds.length > 0
      ? admin.from('expense_repayment_allocations').select('repayment_id, obligation_id, amount_minor').in('repayment_id', repaymentIds)
      : Promise.resolve(empty),
    admin.from('expense_share_collaborators')
      .select('id, group_id, expense_id, share_member_id, collaborator_member_id, status, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true }),
    admin.from('expense_member_name_revisions')
      .select('activity_id, old_display_name, new_display_name')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(50),
    repaymentIds.length > 0
      ? admin.from('expense_settlement_batch_items')
        .select('repayment_id, batch_id, method')
        .in('repayment_id', repaymentIds)
      : Promise.resolve(empty),
    creatorUserIds.length > 0
      ? admin.from('profiles').select('id, display_name').in('id', creatorUserIds)
      : Promise.resolve(empty),
  ])
  throwOnError(paymentsResult.error, 'payment query')
  throwOnError(sharesResult.error, 'share query')
  throwOnError(obligationsResult.error, 'obligation query')
  throwOnError(allocationsResult.error, 'repayment allocation query')
  if (shareCollaboratorsResult.error && !isMissingOptionalExpenseRelation(
    shareCollaboratorsResult.error,
    'expense_share_collaborators',
  )) {
    throwOnError(shareCollaboratorsResult.error, 'share collaborator query')
  }
  if (memberNameRevisionsResult.error && !isMissingOptionalExpenseRelation(
    memberNameRevisionsResult.error,
    'expense_member_name_revisions',
  )) {
    throwOnError(memberNameRevisionsResult.error, 'member name revision query')
  }
  if (settlementBatchItemsResult.error && !isMissingOptionalExpenseRelation(
    settlementBatchItemsResult.error,
    'expense_settlement_batch_items',
  )) {
    throwOnError(settlementBatchItemsResult.error, 'settlement batch item query')
  }
  throwOnError(creatorProfilesResult.error, 'creator profile query')
  const creatorNames = new Map(((creatorProfilesResult.data ?? []) as Array<{
    id: string
    display_name: string | null
  }>).flatMap((row) => {
    const displayName = row.display_name?.trim()
    return displayName && displayName.length <= 120 && !displayName.includes('@')
      ? [[row.id, displayName] as const]
      : []
  }))

  return {
    group: groupResult.data as GroupRow,
    members,
    expenses,
    payments: (paymentsResult.data ?? []) as PaymentRow[],
    shares: (sharesResult.data ?? []) as ShareRow[],
    obligations: (obligationsResult.data ?? []) as ObligationRow[],
    repayments,
    allocations: (allocationsResult.data ?? []) as AllocationRow[],
    activity: (activityResult.data ?? []) as ActivityRow[],
    memberInvitations: (memberInvitationsResult.data ?? []) as MemberInvitationRow[],
    shareCollaborators: shareCollaboratorsResult.error
      ? []
      : (shareCollaboratorsResult.data ?? []) as ShareCollaboratorRow[],
    shareCollaborationReady: !shareCollaboratorsResult.error,
    memberNameRevisions: memberNameRevisionsResult.error
      ? []
      : (memberNameRevisionsResult.data ?? []) as MemberNameRevisionRow[],
    guestMemberRenameReady: !memberNameRevisionsResult.error,
    settlementBatchRepaymentLinks: settlementBatchItemsResult.error
      ? []
      : (settlementBatchItemsResult.data ?? []) as SettlementBatchRepaymentLinkRow[],
    settlementBatchReady: !settlementBatchItemsResult.error,
    claimContext: claimContextResult.data === null
      ? { requiresReview: false, disputes: [], bindings: [] }
      : parseClaimContext(claimContextResult.data),
    creatorNames,
  }
}

const EXPENSE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseClaimContext(value: unknown): ExpenseClaimContext {
  const source = record(value)
  if (!source
    || typeof source.requires_review !== 'boolean'
    || !Array.isArray(source.disputes)
    || !Array.isArray(source.bindings)
    || source.disputes.length > 50
    || source.bindings.length > 50) {
    throw new Error('expense_claim_context_invalid')
  }
  const disputes = source.disputes.map((item) => {
    const row = record(item)
    if (!row
      || typeof row.expense_id !== 'string'
      || typeof row.member_id !== 'string'
      || row.status !== 'disputed'
      || typeof row.is_self !== 'boolean') return null
    return {
      expenseId: row.expense_id,
      memberId: row.member_id,
      status: 'disputed' as const,
      isSelf: row.is_self,
    }
  })
  const proofKinds = new Set<ExpenseIdentityProofKind>([
    'relationship', 'event_guest', 'event_organizer', 'event_current_repair',
  ])
  const bindings = source.bindings.map((item) => {
    const row = record(item)
    if (!row
      || typeof row.member_id !== 'string'
      || typeof row.proof_kind !== 'string'
      || !proofKinds.has(row.proof_kind as ExpenseIdentityProofKind)
      || typeof row.is_self !== 'boolean') return null
    return {
      memberId: row.member_id,
      proofKind: row.proof_kind as ExpenseIdentityProofKind,
      isSelf: row.is_self,
    }
  })
  if (disputes.some((item) => item === null)
    || bindings.some((item) => item === null)) {
    throw new Error('expense_claim_context_invalid')
  }
  return {
    requiresReview: source.requires_review,
    disputes: disputes as ExpenseClaimContext['disputes'],
    bindings: bindings as ExpenseClaimContext['bindings'],
  }
}

function buildGroupView(
  rows: Awaited<ReturnType<typeof loadGroupRows>>,
  actorUserId: string,
): ExpenseGroupView {
  const activeMembers = rows.members.filter((member) => member.status === 'active')
  const actorMember = activeMembers.find((member) => member.user_id === actorUserId)
  if (!actorMember) throw new Error('expense_not_allowed')
  const canManage = actorMember.role === 'owner' || actorMember.role === 'admin'
  const membersById = new Map(rows.members.map((member) => [member.id, member]))
  const memberName = (id: string) => membersById.get(id)?.display_name ?? '—'
  const shareKeys = new Set(rows.shares.map((share) => `${share.expense_id}:${share.member_id}`))
  const activeShareCollaborators = rows.shareCollaborators.filter((collaborator) => {
    if (collaborator.status !== 'active') return false
    if (!membersById.has(collaborator.collaborator_member_id)
      || !shareKeys.has(`${collaborator.expense_id}:${collaborator.share_member_id}`)) {
      throw new Error('expense_share_collaboration_invalid')
    }
    return true
  })
  const actorCanonicalMemberIds = new Set(activeShareCollaborators.flatMap((collaborator) => (
    membersById.get(collaborator.collaborator_member_id)?.user_id === actorUserId
      ? [collaborator.share_member_id]
      : []
  )))
  const viewerActsForMember = (memberId: string): boolean => {
    const member = membersById.get(memberId)
    return Boolean(member && canActAsExpenseMember({
      actorUserId,
      memberStatus: member.status,
      memberUserId: member.user_id,
    })) || actorCanonicalMemberIds.has(memberId)
  }

  const invitationsByMember = new Map(rows.memberInvitations.map((invitation) => [
    invitation.member_id,
    invitation,
  ]))
  const identityBindingsByMember = new Map(rows.claimContext.bindings.map((binding) => [
    binding.memberId,
    binding,
  ]))
  const memberNameRevisionsByActivity = new Map(rows.memberNameRevisions.map((revision) => [
    revision.activity_id,
    revision,
  ]))
  const members: ExpenseMemberView[] = rows.members.map((member) => {
    const invitation = invitationsByMember.get(member.id)
    const identityBinding = identityBindingsByMember.get(member.id)
    return {
      id: member.id,
      displayName: member.display_name,
      role: member.role,
      status: member.status,
      isSelf: member.user_id === actorUserId,
      isRegistered: member.user_id !== null,
      identityProof: identityBinding ? {
        kind: identityBinding.proofKind,
        isSelf: identityBinding.isSelf,
      } : null,
      identityInvitation: invitation ? {
        id: invitation.id,
        status: invitation.status,
        delivery: invitation.attempt_status ?? 'not_sent',
        ...expenseInvitationRecipientProjection({
          canManage,
          recipientEmail: invitation.recipient_email_canonical,
        }),
      } : null,
    }
  })

  const ledgerEntries: ExpenseLedgerEntry[] = rows.expenses.map((expense) => ({
    expenseId: expense.id,
    totalMinor: safeMinor(expense.total_minor),
    currency: expense.currency,
    status: expense.status,
    payments: rows.payments
      .filter((payment) => payment.expense_id === expense.id)
      .map((payment) => ({
        payerId: payment.member_id,
        amountMinor: safeMinor(payment.amount_minor),
        currency: expense.currency,
      })),
    shares: rows.shares
      .filter((share) => share.expense_id === expense.id)
      .map((share) => ({
        participantId: share.member_id,
        amountMinor: safeMinor(share.amount_minor),
        currency: expense.currency,
      })),
  }))
  const obligations: DebtObligation[] = rows.obligations.map((row) => ({
    obligationId: row.id,
    fromPartyId: row.from_member_id,
    toPartyId: row.to_member_id,
    amountMinor: safeMinor(row.amount_minor),
    currency: row.currency,
  }))
  const repaymentById = new Map(rows.repayments.map((row) => [row.id, row]))
  const repayments: Repayment[] = rows.allocations.map((allocation) => {
    const repayment = repaymentById.get(allocation.repayment_id)
    if (!repayment) throw new Error('expense_repayment_allocation_invalid')
    return {
      repaymentId: `${repayment.id}:${allocation.obligation_id}`,
      obligationId: allocation.obligation_id,
      fromPartyId: repayment.from_member_id,
      toPartyId: repayment.to_member_id,
      amountMinor: safeMinor(allocation.amount_minor),
      currency: repayment.currency,
      status: repayment.status,
    }
  })
  const domainBalances = aggregateLedgerBalances(ledgerEntries, repayments, obligations)
  const balances: ExpenseBalanceView[] = domainBalances.map((balance) => ({
    memberId: balance.partyId,
    displayName: memberName(balance.partyId),
    currency: balance.currency,
    amountMinor: balance.amountMinor,
    isSelf: balance.partyId === actorMember.id || actorCanonicalMemberIds.has(balance.partyId),
  }))
  const reportedReservations = rows.repayments
    .filter((repayment) => repayment.status === 'reported')
    .map((repayment) => ({
      fromPartyId: repayment.from_member_id,
      toPartyId: repayment.to_member_id,
      amountMinor: safeMinor(repayment.amount_minor),
      currency: repayment.currency,
    }))
  const reportedReviewKeys = reportedRepaymentsNeedingReview(domainBalances, reportedReservations)
  const settlementRequiresReview = reportedReviewKeys.size > 0
    || rows.claimContext.requiresReview
  const availableBalances = applySettlementTransfers(domainBalances, reportedReservations)
  const transfers = simplifySettlement(availableBalances).map((transfer) => {
    const from = membersById.get(transfer.fromPartyId)
    const to = membersById.get(transfer.toPartyId)
    const viewerIsFrom = from ? viewerActsForMember(from.id) : false
    const managedDebtor = canManageExpenseMemberOnBehalf({
      canManage,
      memberStatus: from?.status,
      memberUserId: from?.user_id,
    })
    const viewerIsTo = to ? viewerActsForMember(to.id) : false
    const managedCreditor = canManageExpenseMemberOnBehalf({
      canManage,
      memberStatus: to?.status,
      memberUserId: to?.user_id,
    })
    return {
      fromMemberId: transfer.fromPartyId,
      fromDisplayName: memberName(transfer.fromPartyId),
      toMemberId: transfer.toPartyId,
      toDisplayName: memberName(transfer.toPartyId),
      amountMinor: transfer.amountMinor,
      currency: transfer.currency,
      expectedFinancialVersion: rows.group.financial_version,
      canReport: !settlementRequiresReview
        && (viewerIsFrom || managedDebtor),
      canRecordReceived: !settlementRequiresReview
        && (viewerIsTo || managedCreditor),
      paymentInstruction: null,
    }
  })

  const expenseViews: ExpenseItemView[] = rows.expenses.map((expense) => ({
    id: expense.id,
    groupId: expense.group_id,
    title: expense.title,
    totalMinor: safeMinor(expense.total_minor),
    currency: expense.currency,
    incurredOn: expense.incurred_on,
    category: expense.category,
    note: expense.note,
    status: expense.status,
    splitMethod: expense.split_method,
    createdBySelf: expense.created_by === actorUserId,
    creatorDisplayName: expense.created_by
      ? rows.creatorNames.get(expense.created_by) ?? null
      : null,
    createdAt: expense.created_at,
    payments: rows.payments
      .filter((payment) => payment.expense_id === expense.id)
      .map((payment) => ({
        memberId: payment.member_id,
        displayName: memberName(payment.member_id),
        amountMinor: safeMinor(payment.amount_minor),
      })),
    shares: rows.shares
      .filter((share) => share.expense_id === expense.id)
      .map((share) => ({
        memberId: share.member_id,
        displayName: memberName(share.member_id),
        amountMinor: safeMinor(share.amount_minor),
      })),
    shareCollaborators: rows.shareCollaborators
      .filter((collaborator) => collaborator.expense_id === expense.id)
      .map((collaborator) => ({
        id: collaborator.id,
        shareMemberId: collaborator.share_member_id,
        memberId: collaborator.collaborator_member_id,
        status: collaborator.status,
        createdAt: collaborator.created_at,
      })),
    revisions: [],
    claimDisputes: rows.claimContext.disputes
      .filter((dispute) => dispute.expenseId === expense.id),
  }))

  const repaymentViews: ExpenseRepaymentView[] = rows.repayments.map((repayment) => {
    const from = membersById.get(repayment.from_member_id)
    const to = membersById.get(repayment.to_member_id)
    const isReported = repayment.status === 'reported'
    const viewerIsFrom = from ? viewerActsForMember(from.id) : false
    const viewerIsTo = to ? viewerActsForMember(to.id) : false
    const managedCreditor = canManageExpenseMemberOnBehalf({
      canManage,
      memberStatus: to?.status,
      memberUserId: to?.user_id,
    })
    const allocation = rows.allocations.find((candidate) => candidate.repayment_id === repayment.id)
    if (!allocation) throw new Error('expense_repayment_allocation_invalid')
    const snapshotOwnerUserId = to?.user_id
    const settlementBatchLink = rows.settlementBatchRepaymentLinks.find(
      (candidate) => candidate.repayment_id === repayment.id,
    )
    return {
      id: repayment.id,
      obligationId: allocation.obligation_id,
      groupId: repayment.group_id,
      fromMemberId: repayment.from_member_id,
      fromDisplayName: memberName(repayment.from_member_id),
      toMemberId: repayment.to_member_id,
      toDisplayName: memberName(repayment.to_member_id),
      amountMinor: safeMinor(repayment.amount_minor),
      currency: repayment.currency,
      occurredOn: repayment.occurred_on,
      note: repayment.note,
      status: repayment.status,
      createdAt: repayment.created_at,
      canConfirm: !settlementBatchLink && isReported && (viewerIsTo || managedCreditor),
      canReject: !settlementBatchLink && isReported && (viewerIsTo || managedCreditor),
      canCancel: !settlementBatchLink
        && isReported
        && (viewerIsFrom || repayment.reported_by === actorUserId || canManage),
      requiresReview: isReported && reportedReviewKeys.has(settlementTransferReviewKey({
        fromPartyId: repayment.from_member_id,
        toPartyId: repayment.to_member_id,
        currency: repayment.currency,
      })),
      paymentSnapshot: paymentSnapshotForViewer(
        repayment.payment_preference_snapshot,
        {
          viewerUserId: actorUserId,
          ownerUserId: snapshotOwnerUserId ?? '',
          viewerOwesOwner: viewerIsFrom && typeof snapshotOwnerUserId === 'string',
          sharesSettlementWithOwner: false,
          explicitlySharedWithViewer: false,
        },
      ),
      settlementBatchId: settlementBatchLink?.batch_id ?? null,
      settlementMethod: settlementBatchLink?.method ?? null,
    }
  })

  // Identity-invitation events have a recipient-specific audience. Group
  // activity is loaded by group, so omit them here instead of exposing one
  // member's consent lifecycle to every current member.
  const activity: ExpenseActivityView[] = rows.activity
    .filter((row) => !row.event_type.startsWith('expense_member_invitation_')
      && row.event_type !== 'expense_identity_bound'
      && row.event_type !== 'expense_claim_disputed')
    .map((row) => ({
    id: row.id,
    sequence: safeMinor(row.sequence_no),
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summaryCode: row.summary_code,
    actorDisplayName: row.actor_display_name,
    createdAt: row.created_at,
    expenseTitle: row.expense_title,
    groupTitle: row.group_title,
    ...(() => {
      const rename = memberNameRevisionsByActivity.get(row.id)
      return rename ? {
        memberRename: {
          before: rename.old_display_name,
          after: rename.new_display_name,
        },
      } : {}
    })(),
  }))

  return {
    id: rows.group.id,
    kind: rows.group.kind,
    name: rows.group.name,
    description: rows.group.description,
    emoji: rows.group.emoji,
    defaultCurrency: rows.group.default_currency,
    defaultIncludeCreator: rows.group.default_include_creator,
    financialVersion: rows.group.financial_version,
    status: rows.group.status,
    role: actorMember.role,
    canManage,
    canLeave: canLeaveExpenseGroup({
      role: actorMember.role,
      memberId: actorMember.id,
      selfBalances: balances.filter((entry) => entry.isSelf),
      repayments: repaymentViews,
    }),
    canCreateExpense: rows.group.kind === 'group' && rows.group.status === 'active',
    createdAt: rows.group.created_at,
    members,
    expenses: expenseViews,
    balances,
    settlementTransfers: transfers,
    settlementRequiresReview,
    claimReviewRequired: rows.claimContext.requiresReview,
    shareCollaborationReady: rows.shareCollaborationReady,
    guestMemberRenameReady: rows.guestMemberRenameReady,
    repayments: repaymentViews,
    activity,
  }
}

function unavailablePaymentDetails(): ExpensePayAllPaymentDetailsView {
  return {
    paymentDetailsState: 'unavailable',
    paymentInstruction: null,
    expectedPaymentProfile: null,
  }
}

async function resolveCurrentPaymentDetails(input: {
  actorUserId: string
  groupId: string
  transfer: ExpenseGroupView['settlementTransfers'][number]
  ownerUserId: string
}): Promise<ExpensePayAllPaymentDetailsView> {
  const admin = getAdmin()
  const rpcInput = {
    p_actor_id: input.actorUserId,
    p_group_id: input.groupId,
    p_from_member_id: input.transfer.fromMemberId,
    p_to_member_id: input.transfer.toMemberId,
    p_currency: input.transfer.currency,
  }

  try {
    const { data: encryptedData, error: encryptedError } = await admin.rpc(
      'expense_resolve_payment_profile_v2',
      rpcInput,
    )
    if (encryptedError) {
      console.error('[expenses] current payment-profile resolution failed')
      return unavailablePaymentDetails()
    }
    if (encryptedData !== null) {
      if (!encryptedData || typeof encryptedData !== 'object' || Array.isArray(encryptedData)) {
        console.error('[expenses] current payment-profile response was invalid')
        return unavailablePaymentDetails()
      }
      const encrypted = encryptedData as Record<string, unknown>
      const profileId = typeof encrypted.profile_id === 'string' ? encrypted.profile_id : ''
      const encryptedOwnerId = typeof encrypted.owner_user_id === 'string' ? encrypted.owner_user_id : ''
      const profileVersion = encrypted.version
      const profileStateToken = typeof encrypted.state_token === 'string'
        ? encrypted.state_token
        : ''
      if (
        !profileId
        || encryptedOwnerId !== input.ownerUserId
        || !Number.isSafeInteger(profileVersion)
        || (profileVersion as number) <= 0
        || !/^[0-9a-f]{32}$/.test(profileStateToken)
      ) {
        console.error('[expenses] current payment-profile response was invalid')
        return unavailablePaymentDetails()
      }

      const details = decryptExpensePaymentProfile({
        ownerUserId: input.ownerUserId,
        profileId,
        envelope: encrypted.envelope,
      })
      const accountNumber = formatExpenseBankAccount(details)
      const nationalId = formatExpenseNationalId(details.nationalId)
      return {
        paymentDetailsState: 'available',
        expectedPaymentProfile: {
          profileId,
          version: profileVersion as number,
          stateToken: profileStateToken,
        },
        paymentInstruction: {
          title: 'payment_profile_v2',
          kind: accountNumber ? 'bank_account' : 'other',
          currency: input.transfer.currency,
          details: {
            ...(accountNumber ? { accountNumber } : {}),
            ...(nationalId ? { nationalId } : {}),
            ...(details.other ? { instructions: details.other } : {}),
          },
          visibility: 'debt_context',
          capturedAt: new Date().toISOString(),
        },
      }
    }

    // SQL122 returns NULL both when no global v2 profile exists and when its
    // exact debt-context gate fails closed. Distinguish those states with a
    // service-role existence check before making a user-visible absence claim.
    const { data: profilePresence, error: profilePresenceError } = await admin
      .from('expense_payment_profiles_v2')
      .select('id')
      .eq('owner_user_id', input.ownerUserId)
      .maybeSingle()
    if (profilePresenceError) {
      console.error('[expenses] current payment-profile presence check failed')
      return unavailablePaymentDetails()
    }
    if (profilePresence !== null) {
      console.error('[expenses] current payment-profile resolver failed closed')
      return unavailablePaymentDetails()
    }

    const { data: legacyData, error: legacyError } = await admin.rpc(
      'expense_resolve_payment_instruction',
      rpcInput,
    )
    if (legacyError) {
      console.error('[expenses] current payment-instruction resolution failed')
      return unavailablePaymentDetails()
    }
    if (legacyData === null) {
      return {
        paymentDetailsState: 'not_configured',
        paymentInstruction: null,
        expectedPaymentProfile: null,
      }
    }
    if (!legacyData || typeof legacyData !== 'object' || Array.isArray(legacyData)) {
      console.error('[expenses] current payment-instruction response was invalid')
      return unavailablePaymentDetails()
    }
    const paymentInstruction = paymentSnapshotForViewer(
      legacyData as Record<string, unknown>,
      {
        viewerUserId: input.actorUserId,
        ownerUserId: input.ownerUserId,
        viewerOwesOwner: true,
        sharesSettlementWithOwner: false,
        explicitlySharedWithViewer: false,
      },
    )
    return paymentInstruction
      ? {
          paymentDetailsState: 'available',
          paymentInstruction,
          // Legacy scoped preferences remain available to the one-way flow.
          // Pair batches deliberately require the global encrypted v2 profile.
          expectedPaymentProfile: null,
        }
      : unavailablePaymentDetails()
  } catch {
    // Crypto/config/tamper failures must not be presented as profile absence.
    console.error('[expenses] current payment-profile resolution failed')
    return unavailablePaymentDetails()
  }
}

async function attachCurrentPaymentInstructions(
  group: ExpenseGroupView,
  rows: Awaited<ReturnType<typeof loadGroupRows>>,
  actorUserId: string,
): Promise<ExpenseGroupView> {
  const membersById = new Map(rows.members.map((member) => [member.id, member]))
  const selfMemberIds = expensePayAllSelfMemberIds(group)
  const settlementTransfers = await Promise.all(group.settlementTransfers.map(async (transfer) => {
    const creditor = membersById.get(transfer.toMemberId)
    const ownerUserId = creditor?.user_id
    if (
      !transfer.canReport
      || !selfMemberIds.has(transfer.fromMemberId)
      || typeof ownerUserId !== 'string'
    ) return transfer

    const currentPaymentDetails = await resolveCurrentPaymentDetails({
      actorUserId,
      groupId: group.id,
      transfer,
      ownerUserId,
    })
    return {
      ...transfer,
      paymentInstruction: currentPaymentDetails.paymentInstruction,
      currentPaymentDetails,
    }
  }))

  return { ...group, settlementTransfers }
}

export async function getExpenseGroupView(
  actorUserId: string,
  groupId: string,
  options: { includeCurrentPaymentInstructions?: boolean } = {},
): Promise<ExpenseGroupView | null> {
  try {
    const rows = await loadGroupRows(groupId, actorUserId)
    const group = buildGroupView(rows, actorUserId)
    return options.includeCurrentPaymentInstructions
      ? await attachCurrentPaymentInstructions(group, rows, actorUserId)
      : group
  } catch (error) {
    if (error instanceof Error && ['expense_not_found', 'expense_not_allowed'].includes(error.message)) {
      return null
    }
    throw error
  }
}

async function loadPendingExpenseSettlementBatches(
  actorUserId: string,
): Promise<{ ready: boolean; batches: ExpensePendingSettlementBatchView[] }> {
  interface BatchRow {
    id: string
    proposed_by_user_id: string | null
    counterparty_user_id: string | null
    currency: string
    gross_payable_minor: number | string
    gross_receivable_minor: number | string
    offset_minor: number | string
    cash_minor: number | string
    occurred_on: string
    note: string | null
    created_at: string
  }
  interface BatchItemPartyRow {
    batch_id: string
    from_member_id: string
    to_member_id: string
  }

  const admin = getAdmin()
  const batchResult = await admin
    .from('expense_settlement_batches')
    .select('id, proposed_by_user_id, counterparty_user_id, currency, gross_payable_minor, gross_receivable_minor, offset_minor, cash_minor, occurred_on, note, created_at')
    .eq('status', 'proposed')
    .or(`proposed_by_user_id.eq.${actorUserId},counterparty_user_id.eq.${actorUserId}`)
    .order('created_at', { ascending: false })

  if (batchResult.error) {
    if (
      isMissingOptionalExpenseRelation(batchResult.error, 'expense_settlement_batches')
      || (
        typeof batchResult.error === 'object'
        && batchResult.error !== null
        && 'code' in batchResult.error
        && ['42703', 'PGRST204'].includes(String(batchResult.error.code))
      )
    ) return { ready: false, batches: [] }
    throwOnError(batchResult.error, 'pending settlement batch query')
  }

  const rows = (batchResult.data ?? []) as BatchRow[]
  if (rows.length === 0) return { ready: true, batches: [] }
  const batchIds = rows.map((row) => row.id)
  const itemResult = await admin
    .from('expense_settlement_batch_items')
    .select('batch_id, from_member_id, to_member_id')
    .in('batch_id', batchIds)
  if (itemResult.error) {
    if (isMissingOptionalExpenseRelation(
      itemResult.error,
      'expense_settlement_batch_items',
    )) return { ready: false, batches: [] }
    throwOnError(itemResult.error, 'pending settlement batch item query')
  }

  const items = (itemResult.data ?? []) as BatchItemPartyRow[]
  const memberIds = [...new Set(items.flatMap((item) => [
    item.from_member_id,
    item.to_member_id,
  ]))]
  const memberResult = memberIds.length > 0
    ? await admin
      .from('expense_group_members')
      .select('id, user_id, display_name, status')
      .in('id', memberIds)
    : { data: [] as unknown[], error: null }
  throwOnError(memberResult.error, 'pending settlement batch member query')
  const members = (memberResult.data ?? []) as Array<Pick<
    MemberRow,
    'id' | 'user_id' | 'display_name' | 'status'
  >>
  const membersById = new Map(members.map((member) => [member.id, member]))

  const batches = rows.flatMap((row): ExpensePendingSettlementBatchView[] => {
    const proposedBySelf = row.proposed_by_user_id === actorUserId
    const actorIsCounterparty = row.counterparty_user_id === actorUserId
    if (!proposedBySelf && !actorIsCounterparty) return []
    const otherUserId = proposedBySelf
      ? row.counterparty_user_id
      : row.proposed_by_user_id
    if (!otherUserId) return []
    const batchItems = items.filter((item) => item.batch_id === row.id)
    const counterparty = batchItems
      .flatMap((item) => [
        membersById.get(item.from_member_id),
        membersById.get(item.to_member_id),
      ])
      .find((member) => (
        member?.user_id === otherUserId && member.status === 'active'
      ))
    const counterpartyDisplayName = counterparty?.display_name ?? 'Teskeiðarnotandi'
    return [{
      id: row.id,
      counterpartyDisplayName,
      counterpartyFirstName: expensePayAllSafeFirstName(counterpartyDisplayName),
      currency: row.currency,
      proposerGrossPayableMinor: safeMinor(row.gross_payable_minor),
      proposerGrossReceivableMinor: safeMinor(row.gross_receivable_minor),
      offsetMinor: safeMinor(row.offset_minor),
      cashMinor: safeMinor(row.cash_minor),
      occurredOn: row.occurred_on,
      note: row.note,
      proposedBySelf,
      canConfirm: actorIsCounterparty,
      canReject: actorIsCounterparty,
      canCancel: proposedBySelf,
      createdAt: row.created_at,
    }]
  })
  return { ready: true, batches }
}

async function loadSettlementCounterpartyEligibility(
  counterpartyUserIds: readonly string[],
): Promise<Map<string, boolean>> {
  const admin = getAdmin()
  const uniqueIds = [...new Set(counterpartyUserIds)]
  const entries = await Promise.all(uniqueIds.map(async (userId) => {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      const email = data.user?.email
      if (error || !email) return [userId, false] as const
      return [
        userId,
        await checkFeatureAccess(userId, email, EXPENSE_FEATURE_KEY),
      ] as const
    } catch {
      console.error('[expenses] settlement counterparty access lookup failed')
      return [userId, false] as const
    }
  }))
  return new Map(entries)
}

export async function getExpensePayAllView(actorUserId: string): Promise<ExpensePayAllView> {
  const [membershipResult, pendingBatchState] = await Promise.all([
    getAdmin()
      .from('expense_group_members')
      .select('group_id')
      .eq('user_id', actorUserId)
      .eq('status', 'active'),
    loadPendingExpenseSettlementBatches(actorUserId),
  ])
  const { data, error } = membershipResult
  throwOnError(error, 'pay-all membership query')

  const groupIds = [...new Set(((data ?? []) as Array<{ group_id: string }>).map((row) => row.group_id))]
  let eventLabels = new Map<string, string>()
  try {
    eventLabels = await getExpensePayAllEventLabels(actorUserId, groupIds)
  } catch {
    console.error('[expenses] event context label lookup failed')
  }
  const resolved = await Promise.all(groupIds.map(async (groupId) => {
    try {
      const rows = await loadGroupRows(groupId, actorUserId)
      const group = await attachCurrentPaymentInstructions(
        buildGroupView(rows, actorUserId),
        rows,
        actorUserId,
      )
      const membersById = new Map(rows.members.map((member) => [member.id, member]))
      const actorMember = rows.members.find((member) => (
        member.status === 'active' && member.user_id === actorUserId
      ))
      if (!actorMember) throw new Error('expense_not_allowed')
      const selfMemberIds = expensePayAllSelfMemberIds(group)
      const candidates: ExpensePayAllCandidate[] = []
      const pairCandidates: ExpensePayAllPairCandidate[] = []
      const blockedContexts: ExpensePayAllBlockedContextView[] = []

      for (const transfer of group.settlementTransfers) {
        const fromMember = membersById.get(transfer.fromMemberId)
        const toMember = membersById.get(transfer.toMemberId)
        const pairDirection = expensePayAllCanonicalPairDirection({
          actorUserId,
          actorMember: {
            id: actorMember.id,
            userId: actorMember.user_id,
            displayName: actorMember.display_name,
            status: actorMember.status,
          },
          fromMember: fromMember ? {
            id: fromMember.id,
            userId: fromMember.user_id,
            displayName: fromMember.display_name,
            status: fromMember.status,
          } : null,
          toMember: toMember ? {
            id: toMember.id,
            userId: toMember.user_id,
            displayName: toMember.display_name,
            status: toMember.status,
          } : null,
        })

        if (pairDirection) {
          const context = buildExpensePayAllContext(group, transfer, eventLabels.get(group.id) ?? null)
          const pairContext = buildExpensePayAllPairContext(context)
          const actionable = !group.settlementRequiresReview
            && (group.status === 'active' || group.status === 'settling')
          if (pairDirection.direction === 'outgoing') {
            const resolvedPaymentDetails = transfer.currentPaymentDetails
              ?? unavailablePaymentDetails()
            const pairPaymentDetails = resolvedPaymentDetails.paymentDetailsState === 'available'
              && resolvedPaymentDetails.expectedPaymentProfile === null
              ? {
                  paymentDetailsState: 'not_configured' as const,
                  paymentInstruction: null,
                  expectedPaymentProfile: null,
                }
              : resolvedPaymentDetails
            pairCandidates.push({
              counterpartyUserId: pairDirection.counterpartyUserId,
              counterpartyDisplayName: pairDirection.displayName,
              direction: 'outgoing',
              actionable,
              context: pairContext,
              paymentDetails: pairPaymentDetails,
            })
          } else {
            pairCandidates.push({
              counterpartyUserId: pairDirection.counterpartyUserId,
              counterpartyDisplayName: pairDirection.displayName,
              direction: 'incoming',
              actionable,
              context: pairContext,
              paymentDetails: null,
            })
          }
        }

        if (!selfMemberIds.has(transfer.fromMemberId)) continue
        const creditor = membersById.get(transfer.toMemberId)
        if (!creditor) continue
        // Exact canonical registered pairs are rendered by counterpartyViews.
        // Keep the legacy outgoing list only for guests/delegated share actors.
        if (pairDirection?.direction === 'outgoing' && creditor.user_id) continue
        const context = buildExpensePayAllContext(group, transfer, eventLabels.get(group.id) ?? null)
        if (!transfer.canReport) {
          blockedContexts.push({ ...context, recipientDisplayName: transfer.toDisplayName })
          continue
        }
        candidates.push({
          creditorKey: creditor.user_id
            ? `user:${creditor.user_id}`
            : `group:${group.id}:member:${creditor.id}`,
          recipientDisplayName: transfer.toDisplayName,
          amountMinor: transfer.amountMinor,
          currency: transfer.currency,
          ...(creditor.user_id
            ? (transfer.currentPaymentDetails ?? unavailablePaymentDetails())
             : {
                 paymentDetailsState: 'not_configured' as const,
                 paymentInstruction: null,
                 expectedPaymentProfile: null,
               }),
          context,
        })
      }

      return {
        candidates,
        pairCandidates,
        blockedContexts,
        settlementBatchReady: rows.settlementBatchReady,
      }
    } catch (caught) {
      if (caught instanceof Error && ['expense_not_found', 'expense_not_allowed'].includes(caught.message)) {
        return {
          candidates: [],
          pairCandidates: [],
          blockedContexts: [],
          settlementBatchReady: true,
        }
      }
      throw caught
    }
  }))

  const view = buildExpensePayAllView(
    resolved.flatMap((entry) => entry.candidates),
    resolved.flatMap((entry) => entry.blockedContexts),
    resolved.flatMap((entry) => entry.pairCandidates),
  )
  const settlementBatchReady = pendingBatchState.ready
    && resolved.every((entry) => entry.settlementBatchReady)
  const counterpartyEligibility = settlementBatchReady
    ? await loadSettlementCounterpartyEligibility(
        view.counterpartyViews.map((pair) => pair.counterpartyUserId),
      )
    : new Map<string, boolean>()
  return {
    ...view,
    counterpartyViews: view.counterpartyViews.map((pair) => ({
      ...pair,
      counterpartyCanSettle: counterpartyEligibility.get(pair.counterpartyUserId) === true,
    })),
    pendingBatches: pendingBatchState.batches,
    settlementBatchReady,
  }
}

type ExpensePrivateDraftSource = ExpenseDashboardView['privateDrafts']

function parseExpensePrivateDraftSource(
  data: unknown,
  error: unknown,
): ExpensePrivateDraftSource {
  if (error || data !== null && !Array.isArray(data)) {
    return { status: 'unavailable', items: [] }
  }
  const rows = (data ?? []) as unknown[]
  if (rows.length > 100) return { status: 'unavailable', items: [] }
  const items: ExpenseIncompleteDraftSummaryView[] = []
  for (const source of rows) {
    const row = record(source)
    const payload = ExpenseDraftPayloadSchema.safeParse(row?.payload)
    const draftId = boundedString(row?.draft_id, 36)
    const contextType = row?.context_type
    const exactContextType = contextType === 'one_off'
      || contextType === 'group'
      || contextType === 'edit'
      ? contextType
      : null
    const groupId = row?.group_id === null ? null : boundedString(row?.group_id, 36)
    const expenseId = row?.expense_id === null ? null : boundedString(row?.expense_id, 36)
    const version = Number(row?.draft_version)
    const savedAt = boundedString(row?.saved_at, 40)
    const currentStep = row?.current_step
    const contextExact = exactContextType === 'one_off'
      ? groupId === null && expenseId === null
      : exactContextType === 'group'
        ? Boolean(groupId && EXPENSE_UUID_PATTERN.test(groupId)) && expenseId === null
        : exactContextType === 'edit'
          ? Boolean(
              groupId && EXPENSE_UUID_PATTERN.test(groupId)
              && expenseId && EXPENSE_UUID_PATTERN.test(expenseId),
            )
          : false
    if (
      !row
      || !payload.success
      || !draftId
      || !EXPENSE_UUID_PATTERN.test(draftId)
      || !exactContextType
      || !contextExact
      || !Number.isSafeInteger(version)
      || version < 1
      || !savedAt
      || Number.isNaN(Date.parse(savedAt))
      || !['details', 'split', 'people', 'review'].includes(String(currentStep))
    ) {
      return { status: 'unavailable', items: [] }
    }
    let totalMinor: number | null = null
    try {
      totalMinor = parseExpenseAmountToMinor(payload.data.total, payload.data.currency)
    } catch {
      // Blank and partial monetary input is valid private work, not ledger data.
    }
    const attention = getExpenseDraftAttention(payload.data)
    items.push({
      id: draftId,
      contextType: exactContextType,
      groupId,
      expenseId,
      title: payload.data.title.trim(),
      totalMinor,
      currency: payload.data.currency,
      differenceMinor: attention?.differenceMinor ?? null,
      needsAttention: totalMinor === null || Boolean(attention),
      savedAt,
    })
  }
  return { status: 'ready', items }
}

export async function getVisibleSharedExpenseDrafts(
  actorUserId: string,
): Promise<ExpenseSharedDraftListView> {
  if (!EXPENSE_UUID_PATTERN.test(actorUserId)) {
    return { status: 'unavailable', items: [] }
  }
  const { data, error } = await getAdmin().rpc('expense_list_visible_shared_drafts', {
    p_actor_id: actorUserId,
  })
  if (error) return { status: 'unavailable', items: [] }
  return parseVisibleSharedExpenseDrafts(data)
}

export async function getExpenseSharedDraftDetail(
  actorUserId: string,
  publicationId: string,
): Promise<ExpenseSharedDraftDetailView> {
  if (!EXPENSE_UUID_PATTERN.test(actorUserId) || !EXPENSE_UUID_PATTERN.test(publicationId)) {
    return { status: 'not_found' }
  }
  const { data, error } = await getAdmin().rpc('expense_get_shared_draft_detail', {
    p_actor_id: actorUserId,
    p_publication_id: publicationId,
  })
  if (error) return { status: 'unavailable' }
  const detail = parseExpenseSharedDraftDetail(data)
  if (detail.status !== 'ready') return detail
  return detail.publicationId === publicationId ? detail : { status: 'unavailable' }
}

export async function getExpenseDraftPublicationLifecycle(
  actorUserId: string,
  draftId: string,
): Promise<ExpenseDraftPublicationLifecycleView> {
  if (!EXPENSE_UUID_PATTERN.test(actorUserId) || !EXPENSE_UUID_PATTERN.test(draftId)) {
    return { status: 'unavailable' }
  }
  const { data, error } = await getAdmin().rpc(
    'expense_get_private_draft_publication_lifecycle',
    { p_actor_id: actorUserId, p_draft_id: draftId },
  )
  if (error) return { status: 'unavailable' }
  const lifecycle = parseExpenseDraftPublicationLifecycle(data)
  if (!lifecycle || lifecycle.status !== 'ready' || lifecycle.draftId !== draftId) {
    return { status: 'unavailable' }
  }
  if (lifecycle.sharingState !== 'shared') {
    return { ...lifecycle, hasUnsharedChanges: false }
  }
  const shared = await getVisibleSharedExpenseDrafts(actorUserId)
  if (shared.status !== 'ready') return { status: 'unavailable' }
  const matches = shared.items.filter((item) => (
    item.viewerRole === 'author'
    && item.detailTarget.kind === 'private_draft'
    && item.detailTarget.draftId === draftId
    && item.publicationVersion === lifecycle.expectedPublicationVersion
    && typeof item.hasUnsharedChanges === 'boolean'
  ))
  return matches.length === 1
    ? { ...lifecycle, hasUnsharedChanges: matches[0]!.hasUnsharedChanges }
    : { status: 'unavailable' }
}

export async function getExpenseDashboard(
  actorUserId: string,
): Promise<ExpenseDashboardView> {
  const admin = getAdmin()
  const [
    { data, error },
    memberInvitationResult,
    draftResult,
    pendingBatchState,
    sharedDraftResult,
  ] = await Promise.all([
    admin
    .from('expense_group_members')
    .select('group_id, status, created_at')
    .eq('user_id', actorUserId)
    .in('status', ['active', 'invited']),
    admin.rpc('expense_get_my_member_invitations', { p_actor_id: actorUserId }),
    admin.rpc('expense_list_my_private_drafts', { p_actor_id: actorUserId }),
    loadPendingExpenseSettlementBatches(actorUserId),
    admin.rpc('expense_list_visible_shared_drafts', { p_actor_id: actorUserId }),
  ])
  throwOnError(error, 'dashboard membership query')
  throwOnError(memberInvitationResult.error, 'member invitation inbox query')
  const memberInvitations: ExpenseMemberInvitationView[] = ((memberInvitationResult.data ?? []) as Array<{
    invitation_id: string
    context_title: string
    inviter_display_name: string | null
    status: 'pending'
    expires_at: string
    invited_at: string
  }>).map((invitation) => ({
    invitationId: invitation.invitation_id,
    contextTitle: invitation.context_title,
    inviterDisplayName: invitation.inviter_display_name,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    invitedAt: invitation.invited_at,
  }))
  let privateDrafts = parseExpensePrivateDraftSource(draftResult.data, draftResult.error)
  const visibleSharedDrafts = sharedDraftResult.error
    ? { status: 'unavailable' as const, items: [] }
    : parseVisibleSharedExpenseDrafts(sharedDraftResult.data)
  const privateById = new Map(
    privateDrafts.status === 'ready'
      ? privateDrafts.items.map((draft) => [draft.id, draft])
      : [],
  )
  let sharedDrafts: ExpenseDashboardView['sharedDrafts'] = {
    status: 'unavailable',
    items: [],
  }
  if (visibleSharedDrafts.status === 'ready') {
    const enriched: ExpenseDashboardSharedDraftSummaryView[] = []
    let enrichmentFailed = false
    for (const shared of visibleSharedDrafts.items) {
      if (shared.viewerRole === 'author') {
        if (shared.detailTarget.kind !== 'private_draft') {
          enrichmentFailed = true
          break
        }
        const draft = privateById.get(shared.detailTarget.draftId)
        if (!draft || draft.contextType === 'edit') {
          enrichmentFailed = true
          break
        }
        enriched.push({
          ...shared,
          authorDraft: {
            contextType: draft.contextType,
            groupId: draft.groupId,
            expenseId: null,
          },
        })
      } else {
        enriched.push({ ...shared, authorDraft: null })
      }
    }
    sharedDrafts = enrichmentFailed
      ? { status: 'unavailable', items: [] }
      : { status: 'ready', items: enriched }
  }
  if (sharedDrafts.status === 'unavailable') {
    // Without the shared source we cannot safely classify author rows as
    // private versus live shared. Keep both proposal sections fail-closed.
    privateDrafts = { status: 'unavailable', items: [] }
  } else if (privateDrafts.status === 'ready') {
    const liveAuthorDraftIds = new Set(sharedDrafts.items.flatMap((shared) => (
      shared.viewerRole === 'author' && shared.detailTarget.kind === 'private_draft'
        ? [shared.detailTarget.draftId]
        : []
    )))
    privateDrafts = {
      status: 'ready',
      items: privateDrafts.items.filter((draft) => !liveAuthorDraftIds.has(draft.id)),
    }
  }
  const membershipRows = (data ?? []) as Array<{
    group_id: string
    status: 'active' | 'invited'
    created_at: string
  }>
  const activeMemberships = membershipRows.filter((row) => row.status === 'active')
  const invitedMemberships = membershipRows.filter((row) => row.status === 'invited')
  const groupIds = [...new Set(activeMemberships.map((row) => row.group_id))]
  const loaded = await Promise.all(groupIds.map((groupId) => getExpenseGroupView(actorUserId, groupId)))
  const groups = loaded.filter((group): group is ExpenseGroupView => group !== null)
  const circleContextsByGroup = new Map<string, Array<{ id: string; name: string }>>()
  if (groupIds.length > 0) {
    try {
      const { data: contextRows, error: contextError } = await admin
        .from('relationship_circle_expense_contexts')
        .select('group_id, circle_id, circle_name_snapshot')
        .in('group_id', groupIds)
      if (!contextError) {
        for (const row of (contextRows ?? []) as Array<{
          group_id: string
          circle_id: string
          circle_name_snapshot: string
        }>) {
          const contexts = circleContextsByGroup.get(row.group_id) ?? []
          contexts.push({ id: row.circle_id, name: row.circle_name_snapshot })
          circleContextsByGroup.set(row.group_id, contexts)
        }
      }
    } catch {
      // SQL108 is independently gated. UL remains usable before its context table exists.
    }
  }
  let invitations: ExpenseInvitationView[] = []
  if (invitedMemberships.length > 0) {
    const invitationIds = invitedMemberships.map((row) => row.group_id)
    const { data: groupRows, error: invitationError } = await getAdmin()
      .from('expense_groups')
      .select('id, kind, name, emoji')
      .in('id', invitationIds)
    throwOnError(invitationError, 'invitation group query')
    const invitedAtByGroup = new Map(invitedMemberships.map((row) => [row.group_id, row.created_at]))
    invitations = ((groupRows ?? []) as Array<{
      id: string
      kind: 'group' | 'one_off'
      name: string
      emoji: string | null
    }>).map((group) => ({
      groupId: group.id,
      kind: group.kind,
      name: group.name,
      emoji: group.emoji,
      invitedAt: invitedAtByGroup.get(group.id) ?? '',
    }))
  }
  const totalsByCurrency = new Map<string, { owedToYouMinor: number; youOweMinor: number }>()
  let pendingConfirmationCount = pendingBatchState.batches.filter(
    (batch) => batch.canConfirm,
  ).length
  let hasPayAllItems = pendingBatchState.batches.length > 0
  for (const group of groups) {
    for (const balance of group.balances.filter((entry) => entry.isSelf)) {
      const current = totalsByCurrency.get(balance.currency) ?? { owedToYouMinor: 0, youOweMinor: 0 }
      if (balance.amountMinor > 0) {
        current.owedToYouMinor = addMinorAmounts(current.owedToYouMinor, balance.amountMinor)
      } else if (balance.amountMinor < 0) {
        current.youOweMinor = addMinorAmounts(current.youOweMinor, -balance.amountMinor)
      }
      totalsByCurrency.set(balance.currency, current)
    }
    pendingConfirmationCount += group.repayments.filter((repayment) => repayment.canConfirm).length
    if (!hasPayAllItems) {
      const selfMemberIds = expensePayAllSelfMemberIds(group)
      hasPayAllItems = group.settlementTransfers.some((transfer) => (
        selfMemberIds.has(transfer.fromMemberId)
      ))
    }
  }
  const summaries: ExpenseGroupSummaryView[] = groups.map((group) => ({
    id: group.id,
    kind: group.kind,
    name: group.name,
    emoji: group.emoji,
    status: group.status,
    role: group.role,
    selfBalances: group.balances.filter((entry) => entry.isSelf),
    expenseCount: group.expenses.length,
    pendingConfirmationCount: group.repayments.filter((repayment) => repayment.canConfirm).length,
    cancelled: group.expenses.length > 0
      && group.expenses.every((expense) => expense.status === 'cancelled'),
    createdAt: group.createdAt,
    counterparties: group.members
      .filter((member) => member.status === 'active' && !member.isSelf)
      .map((member) => ({
        key: member.displayName.trim().toLocaleLowerCase('is'),
        label: member.displayName,
      })),
    relationshipCircles: circleContextsByGroup.get(group.id) ?? [],
  }))
  return {
    groups: summaries.filter((group) => group.kind === 'group'),
    oneOffs: summaries.filter((group) => group.kind === 'one_off'),
    invitations,
    memberInvitations,
    totals: [...totalsByCurrency.entries()]
      .map(([currency, totals]) => ({ currency, ...totals }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    pendingConfirmationCount,
    hasPayAllItems,
    privateDrafts,
    sharedDrafts,
  }
}

export async function getExpenseMemberInvitation(
  actorUserId: string,
  invitationId: string,
): Promise<ExpenseMemberInvitationView | null> {
  const { data, error } = await getAdmin().rpc('expense_get_scoped_member_invitation', {
    p_actor_id: actorUserId,
    p_invitation_id: invitationId,
  })
  throwOnError(error, 'member invitation detail query')
  const row = ((data ?? []) as Array<{
    invitation_id: string
    context_title: string
    inviter_display_name: string | null
    status: 'pending'
    expires_at: string
    invited_at: string
  }>).find((invitation) => invitation.invitation_id === invitationId)
  return row ? {
    invitationId: row.invitation_id,
    contextTitle: row.context_title,
    inviterDisplayName: row.inviter_display_name,
    status: row.status,
    expiresAt: row.expires_at,
    invitedAt: row.invited_at,
  } : null
}

export async function getExpenseMemberInvitationPreview(
  actorUserId: string,
  invitationId: string,
): Promise<ExpenseMemberInvitationPreviewView | null> {
  const { data, error } = await getAdmin().rpc('expense_get_scoped_member_invitation_preview', {
    p_actor_id: actorUserId,
    p_invitation_id: invitationId,
  })
  throwOnError(error, 'member invitation preview query')
  const row = ((data ?? []) as Array<{
    invitation_id: string
    context_title: string
    inviter_display_name: string | null
    status: 'pending'
    expires_at: string
    invited_at: string
    expense_id: string
    expense_title: string
    description: string | null
    total_minor: number
    currency: string
    incurred_on: string
    payers: unknown
    participants: unknown
  }>).find((candidate) => candidate.invitation_id === invitationId)
  if (!row) return null
  const totalMinor = Number(row.total_minor)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.expense_id)
    || !row.expense_title.trim()
    || !Number.isSafeInteger(totalMinor)
    || totalMinor < 1
    || !/^[A-Z]{3}$/.test(row.currency)
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.incurred_on)) return null

  const parseParties = (value: unknown): Array<{ displayName: string; amountMinor: number }> => (
    Array.isArray(value)
      ? value.flatMap((party) => {
          if (!party || typeof party !== 'object') return []
          const item = party as Record<string, unknown>
          return typeof item.displayName === 'string'
            && item.displayName.trim().length > 0
            && Number.isSafeInteger(item.amountMinor)
            && (item.amountMinor as number) >= 0
            ? [{ displayName: item.displayName.trim().slice(0, 120), amountMinor: item.amountMinor as number }]
            : []
        }).slice(0, 50)
      : []
  )

  return {
    invitationId: row.invitation_id,
    contextTitle: row.context_title,
    inviterDisplayName: row.inviter_display_name,
    status: row.status,
    expiresAt: row.expires_at,
    invitedAt: row.invited_at,
    expenseId: row.expense_id,
    expenseTitle: row.expense_title.trim().slice(0, 200),
    description: row.description?.trim().slice(0, 1000) || null,
    totalMinor,
    currency: row.currency,
    incurredOn: row.incurred_on,
    payers: parseParties(row.payers),
    participants: parseParties(row.participants),
  }
}

export async function getExpenseInvitation(
  actorUserId: string,
  groupId: string,
): Promise<ExpenseInvitationView | null> {
  const { data: membership, error: membershipError } = await getAdmin()
    .from('expense_group_members')
    .select('created_at')
    .eq('group_id', groupId)
    .eq('user_id', actorUserId)
    .eq('status', 'invited')
    .maybeSingle()
  throwOnError(membershipError, 'invitation membership query')
  if (!membership) return null
  const { data: group, error: groupError } = await getAdmin()
    .from('expense_groups')
    .select('id, kind, name, emoji')
    .eq('id', groupId)
    .maybeSingle()
  throwOnError(groupError, 'invitation group query')
  if (!group) return null
  const row = group as { id: string; kind: 'group' | 'one_off'; name: string; emoji: string | null }
  return {
    groupId: row.id,
    kind: row.kind,
    name: row.name,
    emoji: row.emoji,
    invitedAt: (membership as { created_at: string }).created_at,
  }
}

export async function getExpenseItemLookup(
  actorUserId: string,
  expenseId: string,
  options: { includeCurrentPaymentInstructions?: boolean } = {},
): Promise<ExpenseItemLookupResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expenseId)) {
    return { status: 'not_found' }
  }
  const { data, error } = await getAdmin()
    .from('expenses')
    .select('group_id')
    .eq('id', expenseId)
    .maybeSingle()
  throwOnError(error, 'expense locator query')
  if (!data) return { status: 'not_found' }
  const group = await getExpenseGroupView(
    actorUserId,
    (data as { group_id: string }).group_id,
    options,
  )
  if (!group) return { status: 'forbidden' }
  const expense = group.expenses.find((item) => item.id === expenseId)
  if (!expense) return { status: 'forbidden' }
  const { data: revisionRows, error: revisionError } = await getAdmin()
    .from('expense_revisions')
    .select('id, activity_id, financial_version_before, financial_version_after, changed_fields, before_snapshot, after_snapshot, created_at')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false })
    .limit(50)
  throwOnError(revisionError, 'expense revision query')
  const parsedRevisions = ((revisionRows ?? []) as RevisionRow[])
    .map(parseRevision)
    .filter((revision): revision is ExpenseRevisionView => revision !== null)
  const revisionActivityIds = parsedRevisions.map((revision) => revision.activityId)
  const revisionActivityResult = revisionActivityIds.length > 0
    ? await getAdmin()
      .from('expense_activity')
      .select('id, actor_display_name, summary_code')
      .in('id', revisionActivityIds)
    : { data: [], error: null }
  throwOnError(revisionActivityResult.error, 'expense revision activity query')
  const revisionActivity = new Map(((revisionActivityResult.data ?? []) as Array<{
    id: string
    actor_display_name: string
    summary_code: string
  }>).map((activity) => [activity.id, activity]))
  const revisions = parsedRevisions.map((revision) => {
    const activity = revisionActivity.get(revision.activityId)
    return {
      ...revision,
      actorDisplayName: activity?.actor_display_name ?? '',
      summaryCode: activity?.summary_code ?? 'expense_updated',
    }
  })
  return { status: 'ok', group, expense: { ...expense, revisions } }
}

export async function getExpenseItemView(
  actorUserId: string,
  expenseId: string,
  options: { includeCurrentPaymentInstructions?: boolean } = {},
): Promise<{ group: ExpenseGroupView; expense: ExpenseItemView } | null> {
  const result = await getExpenseItemLookup(actorUserId, expenseId, options)
  return result.status === 'ok' ? { group: result.group, expense: result.expense } : null
}

export async function getExpenseEventIdentityCandidates(
  actorUserId: string,
  expenseId: string,
): Promise<ExpenseEventIdentityCandidatesView | null> {
  const { data, error } = await getAdmin().rpc(
    'expense_get_event_identity_candidates',
    { p_actor_id: actorUserId, p_expense_id: expenseId },
  )
  throwOnError(error, 'event identity candidates query')
  if (data === null) return null
  const source = record(data)
  if (!source
    || typeof source.event_id !== 'string'
    || typeof source.event_name !== 'string'
    || source.event_name.length < 1
    || source.event_name.length > 200
    || !Array.isArray(source.candidates)
    || source.candidates.length > 50) {
    throw new Error('expense_event_identity_candidates_invalid')
  }
  const candidates = source.candidates.map((item) => {
    const row = record(item)
    const displayName = row?.display_name === null
      ? null
      : boundedString(row?.display_name, 120)
    if (!row
      || typeof row.event_participant_id !== 'string'
      || displayName === null && row.display_name !== null
      || displayName?.includes('@')) return null
    return {
      eventParticipantId: row.event_participant_id,
      displayName,
    }
  })
  if (candidates.some((candidate) => candidate === null)) {
    throw new Error('expense_event_identity_candidates_invalid')
  }
  return {
    eventId: source.event_id,
    eventName: source.event_name,
    candidates: candidates as ExpenseEventIdentityCandidatesView['candidates'],
  }
}

export async function getExpensePrivateDraft(
  actorUserId: string,
  draftId: string,
): Promise<ExpensePrivateDraftView | null> {
  const { data, error } = await getAdmin().rpc('expense_get_private_draft', {
    p_actor_id: actorUserId,
    p_draft_id: draftId,
  })
  throwOnError(error, 'expense private draft query')
  const source = Array.isArray(data) ? data[0] : data
  if (!source || typeof source !== 'object') return null
  const row = source as Record<string, unknown>
  const payload = ExpenseDraftPayloadSchema.safeParse(row.payload)
  const version = Number(row.draft_version)
  const contextType = row.context_type
  const rawCurrentStep = row.current_step
  const currentStep = rawCurrentStep === 'people' || rawCurrentStep === 'review'
    ? 'split'
    : rawCurrentStep
  if (!payload.success
    || !Number.isSafeInteger(version)
    || version < 1
    || (contextType !== 'one_off' && contextType !== 'group' && contextType !== 'edit')
    || (currentStep !== 'details' && currentStep !== 'split')) {
    return null
  }
  return {
    id: String(row.draft_id),
    contextType,
    groupId: typeof row.group_id === 'string' ? row.group_id : null,
    expenseId: typeof row.expense_id === 'string' ? row.expense_id : null,
    currentStep,
    payload: redactExpenseDraftEventGuestLabels(payload.data),
    version,
    savedAt: String(row.saved_at),
  }
}

export async function getExpenseRepaymentView(
  actorUserId: string,
  repaymentId: string,
): Promise<{ group: ExpenseGroupView; repayment: ExpenseRepaymentView } | null> {
  const { data, error } = await getAdmin()
    .from('expense_repayments')
    .select('group_id')
    .eq('id', repaymentId)
    .maybeSingle()
  throwOnError(error, 'repayment locator query')
  if (!data) return null
  const group = await getExpenseGroupView(actorUserId, (data as { group_id: string }).group_id)
  if (!group) return null
  const repayment = group.repayments.find((item) => item.id === repaymentId)
  if (!repayment) return null

  try {
    const { data: encryptedData, error: encryptedError } = await getAdmin().rpc(
      'expense_resolve_repayment_payment_snapshot_v2',
      { p_actor_id: actorUserId, p_repayment_id: repaymentId },
    )
    if (!encryptedError && encryptedData && typeof encryptedData === 'object' && !Array.isArray(encryptedData)) {
      const snapshot = encryptedData as Record<string, unknown>
      const profileId = typeof snapshot.profile_id === 'string' ? snapshot.profile_id : ''
      const ownerUserId = typeof snapshot.owner_user_id === 'string' ? snapshot.owner_user_id : ''
      const capturedAt = typeof snapshot.captured_at === 'string' ? snapshot.captured_at : repayment.createdAt
      if (profileId && ownerUserId) {
        const details = decryptExpensePaymentProfile({
          ownerUserId,
          profileId,
          envelope: snapshot.envelope,
        })
        const accountNumber = formatExpenseBankAccount(details)
        const nationalId = formatExpenseNationalId(details.nationalId)
        return {
          group,
          repayment: {
            ...repayment,
            paymentSnapshot: {
              title: 'payment_profile_v2',
              kind: accountNumber ? 'bank_account' : 'other',
              currency: repayment.currency,
              details: {
                ...(accountNumber ? { accountNumber } : {}),
                ...(nationalId ? { nationalId } : {}),
                ...(details.other ? { instructions: details.other } : {}),
              },
              visibility: 'debt_context',
              capturedAt,
            },
          },
        }
      }
    }
  } catch {
    // Encrypted payment data fails closed while repayment details remain usable.
  }
  return { group, repayment }
}

export async function getExpensePaymentPreferences(
  actorUserId: string,
): Promise<ExpensePaymentPreferenceView[]> {
  const admin = getAdmin()
  const [preferencesResult, assignmentsResult] = await Promise.all([
    admin.from('expense_payment_preferences')
      .select('id, title, kind, supported_currencies, details, visibility, version, active, created_at')
      .eq('owner_user_id', actorUserId)
      .order('created_at', { ascending: false }),
    admin.from('expense_payment_preference_assignments')
      .select('preference_id, scope_type, currency, group_id, created_at')
      .eq('owner_user_id', actorUserId)
      .order('created_at', { ascending: false }),
  ])
  throwOnError(preferencesResult.error, 'payment preference query')
  throwOnError(assignmentsResult.error, 'payment preference assignment query')
  const assignments = (assignmentsResult.data ?? []) as Array<{
    preference_id: string | null
    scope_type: 'general' | 'currency' | 'group_currency'
    currency: string | null
    group_id: string | null
  }>
  return ((preferencesResult.data ?? []) as Array<{
    id: string
    title: string
    kind: ExpensePaymentPreferenceView['kind']
    supported_currencies: string[] | null
    details: PaymentPreferenceDetails
    visibility: ExpensePaymentPreferenceView['visibility']
    version: number
    active: boolean
  }>).map((preference) => {
    const preferenceAssignments = assignments.filter((item) => item.preference_id === preference.id)
    return {
      id: preference.id,
      title: preference.title,
      kind: preference.kind,
      supportedCurrencies: preference.supported_currencies,
      details: preference.details,
      visibility: preference.visibility,
      version: preference.version,
      active: preference.active,
      assignments: preferenceAssignments.map((assignment) => ({
        scopeType: assignment.scope_type,
        currency: assignment.currency,
        groupId: assignment.group_id,
      })),
    }
  })
}

export async function getExpensePaymentProfileV2(
  actorUserId: string,
): Promise<ExpensePaymentProfileV2View> {
  const admin = getAdmin()
  const [profileResult, legacyResult, snapshotResult] = await Promise.all([
    admin.from('expense_payment_profiles_v2')
      .select('id, owner_user_id, encrypted_details, version')
      .eq('owner_user_id', actorUserId)
      .maybeSingle(),
    admin.from('expense_payment_preferences')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', actorUserId)
      .eq('active', true),
    admin.from('expense_repayments')
      .select('id', { count: 'exact', head: true })
      .contains('payment_preference_snapshot', { owner_user_id: actorUserId }),
  ])

  const cryptoReady = expensePaymentCryptoConfigured()
  const legacyActiveCount = legacyResult.count ?? 0
  const legacySnapshotCount = snapshotResult.count ?? 0
  if (profileResult.error) {
    return {
      id: null,
      version: null,
      details: null,
      storageReady: false,
      cryptoReady,
      decryptFailed: false,
      legacyActiveCount,
      legacySnapshotCount,
      legacyNeedsChoice: legacyActiveCount > 1,
    }
  }

  const row = profileResult.data as {
    id: string
    owner_user_id: string
    encrypted_details: unknown
    version: number
  } | null
  if (!row) {
    return {
      id: null,
      version: null,
      details: null,
      storageReady: true,
      cryptoReady,
      decryptFailed: false,
      legacyActiveCount,
      legacySnapshotCount,
      legacyNeedsChoice: legacyActiveCount > 1,
    }
  }

  try {
    const details = decryptExpensePaymentProfile({
      ownerUserId: actorUserId,
      profileId: row.id,
      envelope: row.encrypted_details,
    })
    return {
      id: row.id,
      version: Number(row.version),
      details,
      storageReady: true,
      cryptoReady,
      decryptFailed: false,
      legacyActiveCount,
      legacySnapshotCount,
      legacyNeedsChoice: legacyActiveCount > 1,
    }
  } catch {
    return {
      id: row.id,
      version: Number(row.version),
      details: null,
      storageReady: true,
      cryptoReady,
      decryptFailed: true,
      legacyActiveCount,
      legacySnapshotCount,
      legacyNeedsChoice: legacyActiveCount > 1,
    }
  }
}
