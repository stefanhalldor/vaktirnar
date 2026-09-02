import type { ExpenseActivityEventType } from './events'
import type { ExpenseSharedDraftSummaryView } from './unconfirmed-publication'
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
export type ExpenseIdentityProofKind =
  | 'relationship'
  | 'event_guest'
  | 'event_organizer'
  | 'event_current_repair'

export type ExpenseActionErrorCode =
  | 'invalid_input'
  | 'referenced_participant'
  | 'not_allowed'
  | 'not_found'
  | 'conflict'
  | 'event_roster_changed'
  | 'feature_disabled'
  | 'recipient_unavailable'
  | 'delivery_failed'
  | 'save_failed'
  | 'save_outcome_unknown'
  | 'load_failed'
  | 'revision_open'
  | 'legacy_edit_draft_unbound'

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
  /** Private to this exact member and group managers; never contains auth ids. */
  identityProof?: {
    kind: ExpenseIdentityProofKind
    isSelf: boolean
  } | null
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
  creatorDisplayName?: string | null
  createdAt: string
  payments: ExpensePaymentView[]
  shares: ExpenseShareView[]
  /** Additive identity actors. Amounts remain exclusively on `shares`. */
  shareCollaborators?: ExpenseShareCollaboratorView[]
  revisions: ExpenseRevisionView[]
  claimDisputes?: Array<{
    memberId: string
    status: 'disputed'
    isSelf: boolean
  }>
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
  /** Present when the pay-all repository authoritatively resolved the current state. */
  currentPaymentDetails?: ExpensePayAllPaymentDetailsView
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
  /** Batch-linked rows are transitioned only through the atomic batch action. */
  settlementBatchId?: string | null
  settlementMethod?: 'external_payment' | 'debt_offset' | null
}

export interface ExpenseActivityView {
  id: string
  sequence: number
  eventType: ExpenseActivityEventType
  entityType: 'expense' | 'expense_group' | 'expense_group_invitation' | 'expense_member_invitation' | 'expense_repayment' | 'payment_preference' | 'expense_settlement_batch'
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
  /** False when the server-authoritative eligible settlement projection is unavailable. */
  settlementEligibilityReady?: boolean
  /** A recognition dispute exists; ledger stays canonical but settlement blocks. */
  claimReviewRequired?: boolean
  /** False while the additive SQL migration is not installed. */
  shareCollaborationReady?: boolean
  /** False while the additive guest-rename SQL migration is not installed. */
  guestMemberRenameReady?: boolean
  repayments: ExpenseRepaymentView[]
  activity: ExpenseActivityView[]
  /** Server-derived TES-24 lock. Unavailable is fail-closed in settlement UI. */
  editRevisionState?: 'none' | 'open' | 'unavailable'
}

export type ExpenseEditRevisionMode = 'private' | 'shared'

export type ExpenseEditRevisionStateView =
  | {
      status: 'none'
      canOpen: boolean
      openReason: 'clean' | 'history' | 'lifecycle' | 'unavailable'
    }
  | {
      status: 'open'
      mode: ExpenseEditRevisionMode
      ownedByActor: boolean
      draftId: string | null
      draftVersion: number | null
      publicationVersion: number | null
    }
  | { status: 'unavailable' }

export type ExpenseLegacyEditDraftStateView =
  | { status: 'none' }
  | { status: 'legacy_unbound'; draftId: string; draftVersion: number }
  | { status: 'legacy_ambiguous' | 'unavailable' }

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
  /** True when the signed-in user's still-unreserved debt has a settlement context. */
  hasPayAllItems: boolean
  dashboardPresentations: import('./dashboard-presentations').ExpenseDashboardPresentationResult
  privateDrafts: ExpenseDashboardPrivateDraftSourceView
  sharedDrafts: ExpenseDashboardSharedDraftSourceView
}

export interface ExpensePayAllExpenseLinkView {
  id: string
  title: string
  incurredOn: string
  /** This member's debt contribution from the exact expense. */
  amountMinor: number
}

export interface ExpensePayAllContextView {
  groupId: string
  groupKind: ExpenseGroupKind
  groupName: string
  emoji: string | null
  /** Display-only label; never participates in settlement math or mutations. */
  eventLabel: string | null
  amountMinor: number
  currency: string
  expenses: ExpensePayAllExpenseLinkView[]
  /**
   * Signed remainder after the linked expense contributions. This captures
   * prior repayments, credits and group netting so the displayed rows always
   * reconcile exactly to `amountMinor`.
   */
  nettingAdjustmentMinor: number
  /** Exact server-authorized transfer used by the existing idempotent report flow. */
  transfer: ExpenseSettlementTransferView
}

export interface ExpenseEventIdentityCandidateView {
  eventParticipantId: string
  displayName: string | null
}

export interface ExpenseEventIdentityCandidatesView {
  eventId: string
  eventName: string
  candidates: ExpenseEventIdentityCandidateView[]
}

export interface ExpenseRelationshipIdentityManagementView {
  expenseId: string
  financialVersion: number
  members: Array<{
    memberId: string
    candidates: Array<{ relationshipId: string; displayName: string }>
  }>
}

export type ExpenseRelationshipIdentityManagementState =
  | {
      status: 'available'
      management: ExpenseRelationshipIdentityManagementView
    }
  | { status: 'absent' }
  | { status: 'unavailable' }

export type ExpensePayAllPaymentDetailsView =
  | {
      paymentDetailsState: 'available'
      paymentInstruction: ExpensePaymentSnapshotView
      /** Opaque v2 identity used only for stale-profile protection on submit. */
      expectedPaymentProfile: {
        profileId: string
        version: number
        stateToken: string
      } | null
    }
  | {
      paymentDetailsState: 'not_configured' | 'unavailable'
      paymentInstruction: null
      expectedPaymentProfile: null
    }

interface ExpensePayAllPaymentViewBase {
  id: string
  recipientDisplayName: string
  amountMinor: number
  currency: string
  contexts: ExpensePayAllContextView[]
}

export type ExpensePayAllPaymentView = ExpensePayAllPaymentViewBase
  & ExpensePayAllPaymentDetailsView

/** Exact context-vector item that a future pair action can submit as stale-state evidence. */
export interface ExpensePayAllPairContextView {
  groupId: string
  expectedFinancialVersion: number
  fromMemberId: string
  toMemberId: string
  amountMinor: number
  currency: string
  context: ExpensePayAllContextView
}

export interface ExpensePayAllBlockedPairContextView extends ExpensePayAllPairContextView {
  direction: 'outgoing' | 'incoming'
}

/** Bilateral view for one exact canonical (actor, counterparty, currency) pair. */
export interface ExpensePayAllCounterpartyView {
  counterpartyUserId: string
  counterpartyDisplayName: string
  /** Safe display-name first token for friendly copy; never derived from an email address. */
  counterpartyFirstName: string | null
  currency: string
  grossPayableMinor: number
  grossReceivableMinor: number
  offsetMinor: number
  netPayableMinor: number
  netReceivableMinor: number
  outgoingContexts: ExpensePayAllPairContextView[]
  incomingContexts: ExpensePayAllPairContextView[]
  blockedContexts: ExpensePayAllBlockedPairContextView[]
  /** False when the exact registered counterpart cannot use this beta flow. */
  counterpartyCanSettle: boolean
  /** Null only when there is no actionable outgoing cash direction to resolve. */
  paymentDetails: ExpensePayAllPaymentDetailsView | null
}

export interface ExpensePayAllContextAllocationView {
  groupId: string
  expectedFinancialVersion: number
  fromMemberId: string
  toMemberId: string
  contextAmountMinor: number
  allocatedMinor: number
}

export type ExpensePayAllSettlementValidationError =
  | 'cash_exceeds_payable'
  | 'settlement_amount_required'

export type ExpensePayAllSettlementPlan =
  | {
      valid: false
      error: ExpensePayAllSettlementValidationError
      requestedCashMinor: number
      appliedOffsetMinor: number
      maxCashMinor: number
    }
  | {
      valid: true
      error: null
      cashMinor: number
      offsetMinor: number
      totalSettledMinor: number
      remainingPayableMinor: number
      remainingReceivableMinor: number
      outgoingOffsetAllocations: ExpensePayAllContextAllocationView[]
      incomingOffsetAllocations: ExpensePayAllContextAllocationView[]
      cashAllocations: ExpensePayAllContextAllocationView[]
    }

export interface ExpensePayAllBlockedContextView extends ExpensePayAllContextView {
  recipientDisplayName: string
}

export interface ExpensePendingSettlementBatchView {
  id: string
  counterpartyDisplayName: string
  counterpartyFirstName: string | null
  currency: string
  /** Stored terms are always from the original proposer's perspective. */
  proposerGrossPayableMinor: number
  proposerGrossReceivableMinor: number
  offsetMinor: number
  cashMinor: number
  occurredOn: string
  note: string | null
  proposedBySelf: boolean
  canConfirm: boolean
  canReject: boolean
  canCancel: boolean
  createdAt: string
}

export interface ExpensePayAllView {
  payments: ExpensePayAllPaymentView[]
  blockedContexts: ExpensePayAllBlockedContextView[]
  counterpartyViews: ExpensePayAllCounterpartyView[]
  pendingBatches: ExpensePendingSettlementBatchView[]
  settlementBatchReady: boolean
}

export interface ExpenseIncompleteDraftSummaryView {
  id: string
  contextType: 'one_off' | 'group' | 'edit'
  groupId: string | null
  expenseId: string | null
  title: string
  totalMinor: number | null
  currency: string
  differenceMinor: number | null
  needsAttention: boolean
  savedAt: string
}

export type ExpenseDashboardDraftSourceStatus = 'ready' | 'unavailable'

export interface ExpenseDashboardPrivateDraftSourceView {
  status: ExpenseDashboardDraftSourceStatus
  items: ExpenseIncompleteDraftSummaryView[]
}

export type ExpenseDashboardSharedDraftSummaryView = ExpenseSharedDraftSummaryView & {
  authorDraft: {
    contextType: 'one_off' | 'group'
    groupId: string | null
    expenseId: null
  } | null
}

export interface ExpenseDashboardSharedDraftSourceView {
  status: ExpenseDashboardDraftSourceStatus
  items: ExpenseDashboardSharedDraftSummaryView[]
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

export interface ExpenseMemberInvitationPartyView {
  displayName: string
  amountMinor: number
}

export interface ExpenseMemberInvitationPreviewView extends ExpenseMemberInvitationView {
  expenseId: string
  expenseTitle: string
  description: string | null
  totalMinor: number
  currency: string
  incurredOn: string
  payers: ExpenseMemberInvitationPartyView[]
  participants: ExpenseMemberInvitationPartyView[]
}

export type ExpenseItemLookupResult =
  | {
      status: 'ok'
      group: ExpenseGroupView
      expense: ExpenseItemView
      editRevisionState: ExpenseEditRevisionStateView
    }
  | { status: 'not_found' }
  | { status: 'forbidden' }

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
  /** One exhaustive presentation per exact confirmed Expense identity. */
  expensePresentations: ExpenseConfirmedPresentationView[]
}

export interface ExpenseConfirmedPresentationView {
  expenseId: string
  title: string
  expenseStatus: 'active' | 'cancelled'
  presentationState: ExpenseConfirmedPresentationState
}

export type ExpenseConfirmedPresentationState =
  | { status: 'confirmed' }
  | { status: 'editing'; draftId: string | null; expenseId: string }
  | {
      status: 'ambiguous'
      reason: 'duplicate_same_expense'
    }
  | { status: 'unavailable' }

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
