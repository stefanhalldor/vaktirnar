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
  } | null
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
  createdAt: string
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
