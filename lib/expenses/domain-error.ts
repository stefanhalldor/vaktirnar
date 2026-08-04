export type ExpenseDomainErrorCode =
  | 'invalid_party_id'
  | 'invalid_currency'
  | 'invalid_amount'
  | 'amount_overflow'
  | 'invalid_expense_id'
  | 'duplicate_expense'
  | 'participant_required'
  | 'duplicate_participant'
  | 'percentage_total_mismatch'
  | 'fixed_total_mismatch'
  | 'fixed_total_exceeds_expense'
  | 'remainder_participant_required'
  | 'payment_required'
  | 'duplicate_payer'
  | 'payment_currency_mismatch'
  | 'payment_total_mismatch'
  | 'share_currency_mismatch'
  | 'share_total_mismatch'
  | 'expense_balance_not_zero'
  | 'balance_total_not_zero'
  | 'invalid_transfer'
  | 'invalid_repayment_id'
  | 'duplicate_repayment'
  | 'repayment_currency_mismatch'
  | 'repayment_parties_mismatch'
  | 'repayment_obligation_mismatch'
  | 'repayment_exceeds_debt'
  | 'repayment_status_invalid'
  | 'repayment_transition_invalid'
  | 'financial_edit_blocked'
  | 'payment_preference_invalid'
  | 'payment_preference_assignment_duplicate'
  | 'payment_preference_owner_mismatch'
  | 'event_projection_invalid'

export class ExpenseDomainError extends Error {
  readonly code: ExpenseDomainErrorCode
  readonly details: Readonly<Record<string, string | number | boolean>>

  constructor(
    code: ExpenseDomainErrorCode,
    details: Record<string, string | number | boolean> = {},
  ) {
    super(code)
    this.name = 'ExpenseDomainError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}

export function failExpenseDomain(
  code: ExpenseDomainErrorCode,
  details?: Record<string, string | number | boolean>,
): never {
  throw new ExpenseDomainError(code, details)
}
