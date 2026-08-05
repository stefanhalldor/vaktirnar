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

export const BOOKKEEPING_TRANSACTION_STATES = ['inbox', 'draft', 'reviewed', 'voided'] as const
export type BookkeepingTransactionState = (typeof BOOKKEEPING_TRANSACTION_STATES)[number]

export const BOOKKEEPING_TRANSACTION_DIRECTIONS = ['inflow', 'outflow'] as const
export type BookkeepingTransactionDirection = (typeof BOOKKEEPING_TRANSACTION_DIRECTIONS)[number]

export const BOOKKEEPING_COUNTERPARTY_KINDS = ['individual', 'company'] as const
export type BookkeepingCounterpartyKind = (typeof BOOKKEEPING_COUNTERPARTY_KINDS)[number]

export const BOOKKEEPING_TRANSACTION_VAT_DISPOSITIONS = [
  'unclassified', 'not_applicable', 'linked',
] as const
export type BookkeepingTransactionVatDisposition =
  (typeof BOOKKEEPING_TRANSACTION_VAT_DISPOSITIONS)[number]

export const BOOKKEEPING_ATTACHMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
] as const
export type BookkeepingAttachmentMimeType = (typeof BOOKKEEPING_ATTACHMENT_MIME_TYPES)[number]

export const BOOKKEEPING_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

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
