export type BookkeepingDomainErrorCode =
  | 'amount_overflow'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'invalid_date'
  | 'invalid_entry_type'
  | 'invalid_period'
  | 'invalid_vat_line'
  | 'manual_override_reason_required'
  | 'period_locked'
  | 'reopen_reason_required'

export class BookkeepingDomainError extends Error {
  readonly code: BookkeepingDomainErrorCode
  readonly details: Readonly<Record<string, unknown>>

  constructor(
    code: BookkeepingDomainErrorCode,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code)
    this.name = 'BookkeepingDomainError'
    this.code = code
    this.details = details
  }
}

export function failBookkeepingDomain(
  code: BookkeepingDomainErrorCode,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new BookkeepingDomainError(code, details)
}
