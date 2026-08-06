import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import {
  aggregateLedgerBalances,
  applySettlementTransfers,
  reportedRepaymentsNeedingReview,
  settlementTransferReviewKey,
  simplifySettlement,
} from './balances'
import { addMinorAmounts } from './money'
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
  ExpenseGroupView,
  ExpenseGroupSummaryView,
  ExpenseInvitationView,
  ExpenseIncompleteDraftSummaryView,
  ExpenseItemView,
  ExpenseMemberInvitationView,
  ExpenseMemberRole,
  ExpenseMemberView,
  ExpensePaymentPreferenceView,
  ExpensePaymentProfileV2View,
  ExpenseRepaymentView,
  ExpenseRevisionSnapshot,
  ExpenseRevisionView,
} from './contracts'
import type { ExpenseActivityEventType } from './events'
import {
  ExpenseDraftPayloadSchema,
  getExpenseDraftAttention,
  type ExpensePrivateDraftView,
} from './drafts'

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

async function loadGroupRows(groupId: string): Promise<{
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
}> {
  const admin = getAdmin()
  const [groupResult, membersResult, expensesResult, repaymentsResult, activityResult, memberInvitationsResult] = await Promise.all([
    admin.from('expense_groups').select(GROUP_SELECT).eq('id', groupId).maybeSingle(),
    admin.from('expense_group_members').select(MEMBER_SELECT).eq('group_id', groupId).order('created_at', { ascending: true }),
    admin.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId).order('incurred_on', { ascending: false }).order('created_at', { ascending: false }),
    admin.from('expense_repayments').select('id, group_id, from_member_id, to_member_id, amount_minor, currency, occurred_on, note, status, reported_by, payment_preference_snapshot, created_at').eq('group_id', groupId).order('created_at', { ascending: false }),
    admin.from('expense_activity').select('id, sequence_no, event_type, entity_type, entity_id, summary_code, actor_display_name, expense_title, group_title, created_at').eq('group_id', groupId).order('sequence_no', { ascending: false }).limit(50),
    admin.from('expense_member_invitations').select('id, group_id, member_id, status, attempt_status').eq('group_id', groupId).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
  ])
  throwOnError(groupResult.error, 'group query')
  throwOnError(membersResult.error, 'member query')
  throwOnError(expensesResult.error, 'expense query')
  throwOnError(repaymentsResult.error, 'repayment query')
  throwOnError(activityResult.error, 'activity query')
  throwOnError(memberInvitationsResult.error, 'member invitation query')
  if (!groupResult.data) throw new Error('expense_not_found')

  const expenses = (expensesResult.data ?? []) as ExpenseRow[]
  const repayments = (repaymentsResult.data ?? []) as RepaymentRow[]
  const expenseIds = expenses.map((row) => row.id)
  const repaymentIds = repayments.map((row) => row.id)
  const empty = { data: [] as unknown[], error: null }
  const [paymentsResult, sharesResult, obligationsResult, allocationsResult] = await Promise.all([
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
  ])
  throwOnError(paymentsResult.error, 'payment query')
  throwOnError(sharesResult.error, 'share query')
  throwOnError(obligationsResult.error, 'obligation query')
  throwOnError(allocationsResult.error, 'repayment allocation query')

  return {
    group: groupResult.data as GroupRow,
    members: (membersResult.data ?? []) as MemberRow[],
    expenses,
    payments: (paymentsResult.data ?? []) as PaymentRow[],
    shares: (sharesResult.data ?? []) as ShareRow[],
    obligations: (obligationsResult.data ?? []) as ObligationRow[],
    repayments,
    allocations: (allocationsResult.data ?? []) as AllocationRow[],
    activity: (activityResult.data ?? []) as ActivityRow[],
    memberInvitations: (memberInvitationsResult.data ?? []) as MemberInvitationRow[],
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

  const invitationsByMember = new Map(rows.memberInvitations.map((invitation) => [
    invitation.member_id,
    invitation,
  ]))
  const members: ExpenseMemberView[] = rows.members.map((member) => {
    const invitation = canManage ? invitationsByMember.get(member.id) : undefined
    return {
      id: member.id,
      displayName: member.display_name,
      role: member.role,
      status: member.status,
      isSelf: member.user_id === actorUserId,
      isRegistered: member.user_id !== null,
      identityInvitation: invitation ? {
        id: invitation.id,
        status: invitation.status,
        delivery: invitation.attempt_status ?? 'not_sent',
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
    isSelf: balance.partyId === actorMember.id,
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
  const availableBalances = applySettlementTransfers(domainBalances, reportedReservations)
  const transfers = simplifySettlement(availableBalances).map((transfer) => {
    const from = membersById.get(transfer.fromPartyId)
    const to = membersById.get(transfer.toPartyId)
    const viewerIsFrom = from ? canActAsExpenseMember({
      actorUserId,
      memberStatus: from.status,
      memberUserId: from.user_id,
    }) : false
    const managedDebtor = canManageExpenseMemberOnBehalf({
      canManage,
      memberStatus: from?.status,
      memberUserId: from?.user_id,
    })
    const viewerIsTo = to ? canActAsExpenseMember({
      actorUserId,
      memberStatus: to.status,
      memberUserId: to.user_id,
    }) : false
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
    revisions: [],
  }))

  const repaymentViews: ExpenseRepaymentView[] = rows.repayments.map((repayment) => {
    const from = membersById.get(repayment.from_member_id)
    const to = membersById.get(repayment.to_member_id)
    const isReported = repayment.status === 'reported'
    const viewerIsFrom = from ? canActAsExpenseMember({
      actorUserId,
      memberStatus: from.status,
      memberUserId: from.user_id,
    }) : false
    const viewerIsTo = to ? canActAsExpenseMember({
      actorUserId,
      memberStatus: to.status,
      memberUserId: to.user_id,
    }) : false
    const managedCreditor = canManageExpenseMemberOnBehalf({
      canManage,
      memberStatus: to?.status,
      memberUserId: to?.user_id,
    })
    const allocation = rows.allocations.find((candidate) => candidate.repayment_id === repayment.id)
    if (!allocation) throw new Error('expense_repayment_allocation_invalid')
    const snapshotOwnerUserId = to?.user_id
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
      canConfirm: isReported && (viewerIsTo || managedCreditor),
      canReject: isReported && (viewerIsTo || managedCreditor),
      canCancel: isReported && (viewerIsFrom || repayment.reported_by === actorUserId || canManage),
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
    }
  })

  // Identity-invitation events have a recipient-specific audience. Group
  // activity is loaded by group, so omit them here instead of exposing one
  // member's consent lifecycle to every current member.
  const activity: ExpenseActivityView[] = rows.activity
    .filter((row) => !row.event_type.startsWith('expense_member_invitation_'))
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
    repayments: repaymentViews,
    activity,
  }
}

async function attachCurrentPaymentInstructions(
  group: ExpenseGroupView,
  rows: Awaited<ReturnType<typeof loadGroupRows>>,
  actorUserId: string,
): Promise<ExpenseGroupView> {
  const membersById = new Map(rows.members.map((member) => [member.id, member]))
  const admin = getAdmin()
  const settlementTransfers = await Promise.all(group.settlementTransfers.map(async (transfer) => {
    const debtor = membersById.get(transfer.fromMemberId)
    const creditor = membersById.get(transfer.toMemberId)
    const ownerUserId = creditor?.user_id
    if (
      !transfer.canReport
      || debtor?.user_id !== actorUserId
      || typeof ownerUserId !== 'string'
    ) return transfer

    try {
      const { data: encryptedData, error: encryptedError } = await admin.rpc(
        'expense_resolve_payment_profile_v2',
        {
          p_actor_id: actorUserId,
          p_group_id: group.id,
          p_from_member_id: transfer.fromMemberId,
          p_to_member_id: transfer.toMemberId,
          p_currency: transfer.currency,
        },
      )
      if (!encryptedError && encryptedData && typeof encryptedData === 'object' && !Array.isArray(encryptedData)) {
        const encrypted = encryptedData as Record<string, unknown>
        const profileId = typeof encrypted.profile_id === 'string' ? encrypted.profile_id : ''
        const encryptedOwnerId = typeof encrypted.owner_user_id === 'string' ? encrypted.owner_user_id : ''
        if (profileId && encryptedOwnerId === ownerUserId) {
          const details = decryptExpensePaymentProfile({
            ownerUserId,
            profileId,
            envelope: encrypted.envelope,
          })
          const accountNumber = formatExpenseBankAccount(details)
          const nationalId = formatExpenseNationalId(details.nationalId)
          return {
            ...transfer,
            paymentInstruction: {
              title: 'payment_profile_v2',
              kind: accountNumber ? 'bank_account' as const : 'other' as const,
              currency: transfer.currency,
              details: {
                ...(accountNumber ? { accountNumber } : {}),
                ...(nationalId ? { nationalId } : {}),
                ...(details.other ? { instructions: details.other } : {}),
              },
              visibility: 'debt_context' as const,
              capturedAt: new Date().toISOString(),
            },
          }
        }
      }

      const { data, error } = await admin.rpc('expense_resolve_payment_instruction', {
        p_actor_id: actorUserId,
        p_group_id: group.id,
        p_from_member_id: transfer.fromMemberId,
        p_to_member_id: transfer.toMemberId,
        p_currency: transfer.currency,
      })
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        if (error) console.error('[expenses] current payment-instruction resolution failed')
        return transfer
      }
      const paymentInstruction = paymentSnapshotForViewer(
        data as Record<string, unknown>,
        {
          viewerUserId: actorUserId,
          ownerUserId,
          viewerOwesOwner: true,
          sharesSettlementWithOwner: false,
          explicitlySharedWithViewer: false,
        },
      )
      return { ...transfer, paymentInstruction }
    } catch {
      // Payment details fail closed without making the shared ledger unavailable.
      console.error('[expenses] current payment-instruction resolution failed')
      return transfer
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
    const rows = await loadGroupRows(groupId)
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

export async function getExpenseDashboard(
  actorUserId: string,
): Promise<ExpenseDashboardView> {
  const admin = getAdmin()
  const [{ data, error }, memberInvitationResult, draftResult] = await Promise.all([
    admin
    .from('expense_group_members')
    .select('group_id, status, created_at')
    .eq('user_id', actorUserId)
    .in('status', ['active', 'invited']),
    admin.rpc('expense_get_my_member_invitations', { p_actor_id: actorUserId }),
    admin.rpc('expense_list_my_private_drafts', { p_actor_id: actorUserId }),
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
  const incompleteDrafts: ExpenseIncompleteDraftSummaryView[] = draftResult.error
    ? []
    : ((draftResult.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
      const payload = ExpenseDraftPayloadSchema.safeParse(row.payload)
      const contextType = row.context_type
      const attention = payload.success ? getExpenseDraftAttention(payload.data) : null
      if (!payload.success
        || !attention
        || (contextType !== 'one_off' && contextType !== 'group' && contextType !== 'edit')) return []
      return [{
        id: String(row.draft_id),
        contextType,
        groupId: typeof row.group_id === 'string' ? row.group_id : null,
        expenseId: typeof row.expense_id === 'string' ? row.expense_id : null,
        title: payload.data.title.trim(),
        totalMinor: attention.totalMinor,
        currency: payload.data.currency,
        differenceMinor: attention.differenceMinor,
        savedAt: String(row.saved_at),
      }]
    })
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
  let pendingConfirmationCount = 0
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
    incompleteDrafts,
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

export async function getExpenseItemView(
  actorUserId: string,
  expenseId: string,
  options: { includeCurrentPaymentInstructions?: boolean } = {},
): Promise<{ group: ExpenseGroupView; expense: ExpenseItemView } | null> {
  const { data, error } = await getAdmin()
    .from('expenses')
    .select('group_id')
    .eq('id', expenseId)
    .maybeSingle()
  throwOnError(error, 'expense locator query')
  if (!data) return null
  const group = await getExpenseGroupView(
    actorUserId,
    (data as { group_id: string }).group_id,
    options,
  )
  if (!group) return null
  const expense = group.expenses.find((item) => item.id === expenseId)
  if (!expense) return null
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
  return { group, expense: { ...expense, revisions } }
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
    payload: payload.data,
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
