import type { ExpenseActivityEventType } from './events'
import type {
  ExpenseSplitMethod,
  PaymentPreferenceDetails,
  PaymentPreferenceKind,
  PaymentPreferenceVisibility,
  RepaymentStatus,
} from './types'

export const EXPENSE_FEATURE_KEY = 'utlagt-og-endurgreitt' as const

export type ExpenseGroupKind = 'group' | 'one_off'
export type ExpenseGroupStatus = 'active' | 'settling' | 'settled' | 'closed'
export type ExpenseMemberRole = 'owner' | 'admin' | 'member'
export type ExpenseMemberStatus = 'invited' | 'active' | 'declined' | 'removed' | 'left'
export type ExpenseMemberInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export type ExpenseActionErrorCode =
  | 'invalid_input'
  | 'not_allowed'
  | 'not_found'
  | 'conflict'
  | 'feature_disabled'
  | 'recipient_unavailable'
  | 'delivery_failed'
  | 'save_failed'
  | 'load_failed'

export type ExpenseActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: ExpenseActionErrorCode; field?: string }

export interface ExpenseParticipantOption {
  relationshipId: string
  /** Private label shown only in the current user's picker. */
  pickerLabel: string
  /** Public/profile label that will be snapshotted into the shared group. */
  sharedLabel: string
  customLabels?: Array<{ id: string; name: string }>
}

export interface ExpenseMemberView {
  id: string
  displayName: string
  role: ExpenseMemberRole
  status: ExpenseMemberStatus
  isSelf: boolean
  isRegistered: boolean
  /** Manager-only status. Recipient email is never included in shared views. */
  identityInvitation?: {
    id: string
    status: ExpenseMemberInvitationStatus
    delivery: 'not_sent' | 'reserved' | 'sent' | 'failed'
    /** Manager-only pending recipient label. Never populated for other viewers. */
    recipientLabel?: string
  } | null
}

export interface ExpenseShareCollaboratorView {
  id: string
  shareMemberId: string
  memberId: string
  status: 'active' | 'removed'
  createdAt: string
}

export interface ExpensePaymentView {
  memberId: string
  displayName: string
  amountMinor: number
}

export interface ExpenseShareView {
  memberId: string
  displayName: string
  amountMinor: number
}

export interface ExpenseRevisionSnapshot {
  version: 1
  groupStatus: ExpenseGroupStatus
  expense: {
    title: string
    note: string | null
    totalMinor: number
    currency: string
    incurredOn: string
    category: string | null
    splitMethod: ExpenseSplitMethod
  }
  payments: ExpensePaymentView[]
  shares: ExpenseShareView[]
  balances: Array<{
    memberId: string
    displayName: string
    currency: string
    amountMinor: number
  }>
  repaymentSummary: {
    reported: number
    confirmed: number
    rejected: number
    cancelled: number
  }
}

export interface ExpenseRevisionView {
  id: string
  activityId: string
  financialVersionBefore: number
  financialVersionAfter: number
  changedFields: string[]
  actorDisplayName: string
  summaryCode: string
  before: ExpenseRevisionSnapshot
  after: ExpenseRevisionSnapshot
  createdAt: string
}

export interface ExpenseItemView {
  id: string
  groupId: string
  title: string
  totalMinor: number
  currency: string
  incurredOn: string
  category: string | null
  note: string | null
  status: 'active' | 'cancelled'
  splitMethod: ExpenseSplitMethod
  createdBySelf: boolean
  createdAt: string
  payments: ExpensePaymentView[]
  shares: ExpenseShareView[]
  /** Additive identity actors. Amounts remain exclusively on `shares`. */
  shareCollaborators?: ExpenseShareCollaboratorView[]
  revisions: ExpenseRevisionView[]
}

export interface ExpenseBalanceView {
  memberId: string
  displayName: string
  currency: string
  amountMinor: number
  isSelf: boolean
}

export interface ExpenseSettlementTransferView {
  fromMemberId: string
  fromDisplayName: string
  toMemberId: string
  toDisplayName: string
  amountMinor: number
  currency: string
  expectedFinancialVersion: number
  canReport: boolean
  /** The recipient (or an authorized guest manager) may record cash received. */
  canRecordReceived?: boolean
  /** Current, server-authorized details shown before an outside payment. */
  paymentInstruction: ExpensePaymentSnapshotView | null
}

export interface ExpensePaymentSnapshotView {
  title: string
  kind: PaymentPreferenceKind
  currency: string
  details: Readonly<PaymentPreferenceDetails>
  visibility: PaymentPreferenceVisibility
  capturedAt: string
}

export interface ExpenseRepaymentView {
  id: string
  obligationId: string
  groupId: string
  fromMemberId: string
  fromDisplayName: string
  toMemberId: string
  toDisplayName: string
  amountMinor: number
  currency: string
  occurredOn: string
  note: string | null
  status: RepaymentStatus
  createdAt: string
  canConfirm: boolean
  canReject: boolean
  canCancel: boolean
  requiresReview: boolean
  paymentSnapshot: ExpensePaymentSnapshotView | null
}

export interface ExpenseActivityView {
  id: string
  sequence: number
  eventType: ExpenseActivityEventType
  entityType: 'expense' | 'expense_group' | 'expense_group_invitation' | 'expense_member_invitation' | 'expense_repayment' | 'payment_preference'
  entityId: string
  summaryCode: string
  actorDisplayName: string
  createdAt: string
  expenseTitle: string | null
  groupTitle: string | null
  memberRename?: {
    before: string
    after: string
  }
}

export interface ExpenseGroupView {
  id: string
  kind: ExpenseGroupKind
  name: string
  description: string | null
  emoji: string | null
  defaultCurrency: string
  defaultIncludeCreator: boolean
  financialVersion: number
  status: ExpenseGroupStatus
  role: ExpenseMemberRole
  canManage: boolean
  canLeave: boolean
  canCreateExpense: boolean
  createdAt: string
  members: ExpenseMemberView[]
  expenses: ExpenseItemView[]
  balances: ExpenseBalanceView[]
  settlementTransfers: ExpenseSettlementTransferView[]
  settlementRequiresReview: boolean
  /** False while the additive SQL migration is not installed. */
  shareCollaborationReady?: boolean
  /** False while the additive guest-rename SQL migration is not installed. */
  guestMemberRenameReady?: boolean
  repayments: ExpenseRepaymentView[]
  activity: ExpenseActivityView[]
}

export interface ExpenseDashboardView {
  groups: ExpenseGroupSummaryView[]
  oneOffs: ExpenseGroupSummaryView[]
  invitations: ExpenseInvitationView[]
  memberInvitations?: ExpenseMemberInvitationView[]
  totals: Array<{
    currency: string
    owedToYouMinor: number
    youOweMinor: number
  }>
  pendingConfirmationCount: number
  incompleteDrafts?: ExpenseIncompleteDraftSummaryView[]
}

export interface ExpenseIncompleteDraftSummaryView {
  id: string
  contextType: 'one_off' | 'group' | 'edit'
  groupId: string | null
  expenseId: string | null
  title: string
  totalMinor: number
  currency: string
  differenceMinor: number | null
  needsAttention: boolean
  savedAt: string
}

/** Safe pre-consent snapshot. It deliberately contains no ledger fields. */
export interface ExpenseMemberInvitationView {
  invitationId: string
  contextTitle: string
  inviterDisplayName: string | null
  status: 'pending'
  expiresAt: string
  invitedAt: string
}

export interface ExpenseGroupSummaryView {
  id: string
  kind: ExpenseGroupKind
  name: string
  emoji: string | null
  status: ExpenseGroupStatus
  role: ExpenseMemberRole
  selfBalances: ExpenseBalanceView[]
  expenseCount: number
  pendingConfirmationCount: number
  cancelled: boolean
  createdAt: string
  /** Shared participant labels used only to filter the signed-in user's dashboard. */
  counterparties?: Array<{ key: string; label: string }>
  /** Reusable relationship circles explicitly attached to this expense context. */
  relationshipCircles?: Array<{ id: string; name: string }>
}

export interface ExpenseInvitationView {
  groupId: string
  kind: ExpenseGroupKind
  name: string
  emoji: string | null
  invitedAt: string
}

export interface ExpensePaymentPreferenceView {
  id: string
  title: string
  kind: PaymentPreferenceKind
  supportedCurrencies: string[] | null
  details: Readonly<PaymentPreferenceDetails>
  visibility: PaymentPreferenceVisibility
  version: number
  active: boolean
  assignments: Array<{
    scopeType: 'general' | 'currency' | 'group_currency'
    currency: string | null
    groupId: string | null
  }>
}

export interface ExpensePaymentProfileV2View {
  id: string | null
  version: number | null
  details: {
    bank: string | null
    ledger: string | null
    account: string | null
    nationalId: string | null
    other: string | null
  } | null
  storageReady: boolean
  cryptoReady: boolean
  decryptFailed: boolean
  legacyActiveCount: number
  legacySnapshotCount: number
  legacyNeedsChoice: boolean
}
