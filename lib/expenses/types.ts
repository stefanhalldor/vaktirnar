export type ExpenseStatus = 'draft' | 'active' | 'settling' | 'settled' | 'cancelled'

export type ExpenseSplitMethod =
  | 'equal'
  | 'percentage'
  | 'weighted'
  | 'fixed'
  | 'mixed_equal_remainder'
  | 'mixed_percentage_remainder'

export interface ExpensePayment {
  payerId: string
  amountMinor: number
  currency: string
}

export interface ExpenseShare {
  participantId: string
  amountMinor: number
  currency: string
}

export interface ExpenseFinancials {
  expenseId: string
  totalMinor: number
  currency: string
  payments: readonly ExpensePayment[]
  shares: readonly ExpenseShare[]
}

export interface ExpenseLedgerEntry extends ExpenseFinancials {
  status: ExpenseStatus
}

export interface PartyBalance {
  partyId: string
  currency: string
  /** Positive means the party is owed money; negative means the party owes. */
  amountMinor: number
}

export interface SettlementTransfer {
  fromPartyId: string
  toPartyId: string
  amountMinor: number
  currency: string
}

export type RepaymentStatus = 'reported' | 'confirmed' | 'rejected' | 'cancelled'

export interface Repayment {
  repaymentId: string
  obligationId: string
  fromPartyId: string
  toPartyId: string
  amountMinor: number
  currency: string
  status: RepaymentStatus
}

export interface DebtObligation {
  obligationId: string
  fromPartyId: string
  toPartyId: string
  amountMinor: number
  currency: string
}

export type PaymentPreferenceKind =
  | 'bank_account'
  | 'payment_app_phone'
  | 'payment_link'
  | 'cash'
  | 'other'

export type PaymentPreferenceVisibility = 'private' | 'debt_context' | 'explicit_share'

export interface PaymentPreferenceDetails {
  accountNumber?: string
  nationalId?: string
  phoneNumber?: string
  paymentLink?: string
  instructions?: string
  defaultReference?: string
}

export interface PaymentPreference {
  preferenceId: string
  ownerId: string
  version: number
  title: string
  kind: PaymentPreferenceKind
  supportedCurrencies: readonly string[] | null
  details: Readonly<PaymentPreferenceDetails>
  visibility: PaymentPreferenceVisibility
  active: boolean
}

export type PaymentPreferenceAssignmentScope =
  | { type: 'general' }
  | { type: 'currency'; currency: string }
  | { type: 'group_currency'; groupId: string; currency: string }

export interface PaymentPreferenceAssignment {
  ownerId: string
  /** Null is an explicit "show no payment details" override for this scope. */
  preferenceId: string | null
  scope: PaymentPreferenceAssignmentScope
}

export type PaymentPreferenceResolutionSource = 'group_currency' | 'currency' | 'general'

export interface ResolvedPaymentPreference {
  preference: PaymentPreference
  source: PaymentPreferenceResolutionSource
}

export interface PaymentPreferenceSnapshot {
  sourcePreferenceId: string
  sourcePreferenceVersion: number
  ownerId: string
  title: string
  kind: PaymentPreferenceKind
  currency: string
  details: Readonly<PaymentPreferenceDetails>
  visibility: PaymentPreferenceVisibility
  capturedAt: string
}
