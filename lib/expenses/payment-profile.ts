export const PAYMENT_BANK_PART_LENGTHS = {
  bank: 4,
  ledger: 2,
  account: 6,
} as const

export interface ExpensePaymentProfileDetails {
  bank?: string
  ledger?: string
  account?: string
  nationalId?: string
  other?: string
}

export interface NormalizedExpensePaymentProfileDetails {
  bank: string | null
  ledger: string | null
  account: string | null
  nationalId: string | null
  other: string | null
}

export type ExpensePaymentProfileValidationError =
  | 'bank_incomplete'
  | 'bank_invalid'
  | 'national_id_invalid'
  | 'other_too_long'

export type ExpensePaymentProfileNormalizationResult =
  | { ok: true; value: NormalizedExpensePaymentProfileDetails }
  | { ok: false; error: ExpensePaymentProfileValidationError }

function digits(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function normalizeExpensePaymentProfile(
  input: ExpensePaymentProfileDetails,
): ExpensePaymentProfileNormalizationResult {
  const bank = digits(input.bank)
  const ledger = digits(input.ledger)
  const account = digits(input.account)
  const bankParts = [bank, ledger, account]
  const hasBankPart = bankParts.some(Boolean)
  const hasAllBankParts = bankParts.every(Boolean)

  if (hasBankPart && !hasAllBankParts) return { ok: false, error: 'bank_incomplete' }
  if (
    hasAllBankParts
    && (
      bank.length !== PAYMENT_BANK_PART_LENGTHS.bank
      || ledger.length !== PAYMENT_BANK_PART_LENGTHS.ledger
      || account.length > PAYMENT_BANK_PART_LENGTHS.account
    )
  ) return { ok: false, error: 'bank_invalid' }

  const normalizedAccount = hasAllBankParts
    ? account.padStart(PAYMENT_BANK_PART_LENGTHS.account, '0')
    : account

  const nationalId = digits(input.nationalId)
  if (nationalId && nationalId.length !== 10) {
    return { ok: false, error: 'national_id_invalid' }
  }

  const other = input.other?.trim() ?? ''
  if (other.length > 1000) return { ok: false, error: 'other_too_long' }

  return {
    ok: true,
    value: {
      bank: bank || null,
      ledger: ledger || null,
      account: normalizedAccount || null,
      nationalId: nationalId || null,
      other: other || null,
    },
  }
}

export function expensePaymentProfileIsEmpty(
  value: NormalizedExpensePaymentProfileDetails,
): boolean {
  return !value.bank && !value.ledger && !value.account && !value.nationalId && !value.other
}

export function formatExpenseBankAccount(
  value: Pick<NormalizedExpensePaymentProfileDetails, 'bank' | 'ledger' | 'account'>,
): string | null {
  return value.bank && value.ledger && value.account
    ? `${value.bank}-${value.ledger}-${value.account}`
    : null
}

/** Live, deliberately non-validating preview for the three bank inputs. */
export function formatExpenseBankAccountDraft(value: ExpensePaymentProfileDetails): string | null {
  const parts = [digits(value.bank), digits(value.ledger), digits(value.account)].filter(Boolean)
  return parts.length > 0 ? parts.join('-') : null
}

export function formatExpenseNationalId(value: string | null | undefined): string | null {
  const normalized = digits(value ?? undefined)
  return normalized.length === 10 ? `${normalized.slice(0, 6)}-${normalized.slice(6)}` : null
}

export function formatExpenseNationalIdDraft(value: string | null | undefined): string {
  const normalized = digits(value ?? undefined).slice(0, 10)
  return normalized.length > 6
    ? `${normalized.slice(0, 6)}-${normalized.slice(6)}`
    : normalized
}

export function canonicalExpensePaymentProfile(
  value: NormalizedExpensePaymentProfileDetails,
): string {
  return JSON.stringify({
    account: value.account,
    bank: value.bank,
    ledger: value.ledger,
    nationalId: value.nationalId,
    other: value.other,
  })
}
