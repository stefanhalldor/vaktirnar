export const BOOKKEEPING_FEATURE_KEY = 'bokhaldid' as const
export const BOOKKEEPING_PATH = '/auth-mvp/bokhaldid' as const

export const BOOKKEEPING_CURRENCIES = ['ISK'] as const
export type BookkeepingCurrency = (typeof BOOKKEEPING_CURRENCIES)[number]

export const BOOKKEEPING_ENTRY_TYPES = [
  'sale',
  'purchase',
  'sales_credit',
  'purchase_credit',
] as const
export type BookkeepingEntryType = (typeof BOOKKEEPING_ENTRY_TYPES)[number]

export const BOOKKEEPING_REVIEW_STATES = [
  'unreviewed',
  'reviewed',
  'needs_review',
] as const
export type BookkeepingReviewState = (typeof BOOKKEEPING_REVIEW_STATES)[number]

export const BOOKKEEPING_ENTRY_SETTLEMENT_STATES = ['open', 'settled'] as const
export type BookkeepingEntrySettlementState =
  (typeof BOOKKEEPING_ENTRY_SETTLEMENT_STATES)[number]

export const BOOKKEEPING_PERIOD_STATES = [
  'draft',
  'review',
  'ready',
  'submitted',
  'paid',
] as const
export type BookkeepingPeriodState = (typeof BOOKKEEPING_PERIOD_STATES)[number]

export const BOOKKEEPING_FILING_METHODS = [
  'general_bimonthly',
  'monthly',
  'annual',
  'agricultural',
  'other',
] as const
export type BookkeepingFilingMethod = (typeof BOOKKEEPING_FILING_METHODS)[number]

/**
 * `exempt_turnover` is narrowly turnover reported in field C. It is not a
 * generic zero-rate value. `outside_scope` and `no_vat` remain separate so
 * they can never silently enter field C.
 */
export const BOOKKEEPING_VAT_TREATMENTS = [
  'taxable_24',
  'taxable_11',
  'exempt_turnover',
  'outside_scope',
  'no_vat',
  'needs_review',
] as const
export type BookkeepingVatTreatment = (typeof BOOKKEEPING_VAT_TREATMENTS)[number]

export const BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY = [
  'not_applicable',
  'fully_deductible',
  'partially_deductible',
  'not_deductible',
  'needs_review',
] as const
export type BookkeepingInputVatDeductibility =
  (typeof BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY)[number]

export const BOOKKEEPING_SPECIAL_CASE_STATES = [
  'not_applicable',
  'unresolved',
  'resolved',
] as const
export type BookkeepingSpecialCaseState =
  (typeof BOOKKEEPING_SPECIAL_CASE_STATES)[number]

export const VAT_REPORT_FIELDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type VatReportField = (typeof VAT_REPORT_FIELDS)[number]

export const VAT_RATES = [24, 11] as const
export type BookkeepingVatRate = (typeof VAT_RATES)[number]
