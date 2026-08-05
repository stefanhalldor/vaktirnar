import { z } from 'zod'
import {
  BOOKKEEPING_CURRENCIES,
  BOOKKEEPING_ENTRY_TYPES,
  BOOKKEEPING_ENTRY_SETTLEMENT_STATES,
  BOOKKEEPING_FILING_METHODS,
  BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY,
  BOOKKEEPING_REVIEW_STATES,
  BOOKKEEPING_SPECIAL_CASE_STATES,
  BOOKKEEPING_VAT_TREATMENTS,
} from './constants'
import { isValidPeriodForFilingMethod } from './readiness'
import type { BookkeepingEntryLine } from './types'
import { sumIskAmounts } from './money'
import { validateVatLine } from './vat'

export const BookkeepingIdSchema = z.string().uuid()
const uuid = BookkeepingIdSchema
const requestId = uuid
const safeInteger = z.number().int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
const nonNegativeMinor = safeInteger.nonnegative()
const positiveMinor = safeInteger.positive()
const nullableTrimmed = (max: number) => z.string().trim().max(max)
  .nullable()
  .optional()
  .transform((value) => value || null)
const savableReviewIssues = new Set([
  'vat_treatment_needs_review',
  'deductibility_needs_review',
  'purchase_deductibility_required',
])

export const BookkeepingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'invalid_date')

export const CreateBookkeepingEntitySchema = z.object({
  request_id: requestId,
  display_name: z.string().trim().min(1).max(160),
  legal_name: nullableTrimmed(200),
  legal_identifier: nullableTrimmed(32),
  default_currency: z.enum(BOOKKEEPING_CURRENCIES).default('ISK'),
  details_confirmed: z.boolean(),
}).strict()

export const AddBookkeepingVatRegistrationSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  vat_number: z.string().trim().min(1).max(40),
  label: nullableTrimmed(120),
  filing_method: z.enum(BOOKKEEPING_FILING_METHODS),
  details_confirmed: z.boolean(),
}).strict()

export const CreateBookkeepingPeriodSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  vat_registration_id: uuid,
  filing_method: z.enum(BOOKKEEPING_FILING_METHODS),
  starts_on: BookkeepingDateSchema,
  ends_on: BookkeepingDateSchema,
  due_on: BookkeepingDateSchema.nullable(),
  period_dates_confirmed: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (!isValidPeriodForFilingMethod(
    value.starts_on,
    value.ends_on,
    value.due_on,
    value.filing_method,
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ends_on'],
      message: 'invalid_period',
    })
  }
})

const specialCasesSchema = z.object({
  foreign_service: z.enum(BOOKKEEPING_SPECIAL_CASE_STATES),
  import: z.enum(BOOKKEEPING_SPECIAL_CASE_STATES),
  mixed_use: z.enum(BOOKKEEPING_SPECIAL_CASE_STATES),
  uncertain_deductibility: z.enum(BOOKKEEPING_SPECIAL_CASE_STATES),
}).strict()

const entryLineSchema = z.object({
  client_key: z.string().trim().min(1).max(80),
  line_id: uuid.nullable().optional().transform((value) => value ?? null),
  category_code: nullableTrimmed(80),
  description: nullableTrimmed(500),
  vat_treatment: z.enum(BOOKKEEPING_VAT_TREATMENTS),
  currency: z.enum(BOOKKEEPING_CURRENCIES),
  amount_includes_vat: z.boolean(),
  gross_minor: positiveMinor,
  net_minor: nonNegativeMinor,
  vat_minor: nonNegativeMinor,
  input_vat_deductibility: z.enum(BOOKKEEPING_INPUT_VAT_DEDUCTIBILITY),
  deductible_vat_minor: nonNegativeMinor,
  manual_vat_override: z.boolean(),
  manual_vat_override_reason: nullableTrimmed(500),
  exempt_turnover_confirmed: z.boolean(),
}).strict()

export const SaveBookkeepingEntrySchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  vat_registration_id: uuid,
  period_id: uuid,
  entry_id: uuid.nullable().optional().transform((value) => value ?? null),
  expected_version: safeInteger.positive().nullable().optional()
    .transform((value) => value ?? null),
  type: z.enum(BOOKKEEPING_ENTRY_TYPES),
  document_date: BookkeepingDateSchema,
  reporting_date: BookkeepingDateSchema,
  counterparty: nullableTrimmed(200),
  description: z.string().trim().min(1).max(500),
  document_type: nullableTrimmed(80),
  document_reference: nullableTrimmed(160),
  duplicate_reference_confirmed: z.boolean(),
  currency: z.enum(BOOKKEEPING_CURRENCIES),
  source_type: z.literal('manual').default('manual'),
  source_id: z.null().optional().transform(() => null),
  source_reference: z.null().optional().transform(() => null),
  review_state: z.enum(BOOKKEEPING_REVIEW_STATES),
  original_document_preserved: z.boolean(),
  business_purpose_confirmed: z.boolean(),
  seller_vat_registration_confirmed: z.boolean().nullable(),
  special_cases: specialCasesSchema,
  special_case_resolution_note: nullableTrimmed(1000),
  note: nullableTrimmed(2000),
  lines: z.array(entryLineSchema).min(1).max(50),
}).strict().superRefine((value, ctx) => {
  if (value.entry_id === null && value.expected_version !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expected_version'],
      message: 'not_allowed_for_create',
    })
  }
  if (value.entry_id !== null && value.expected_version === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expected_version'],
      message: 'required_for_update',
    })
  }
  if (new Set(value.lines.map((line) => line.client_key)).size !== value.lines.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lines'],
      message: 'duplicate_client_key',
    })
  }
  const persistedLineIds = value.lines
    .map((line) => line.line_id)
    .filter((lineId): lineId is string => lineId !== null)
  if (new Set(persistedLineIds).size !== persistedLineIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lines'],
      message: 'duplicate_line_id',
    })
  }

  value.lines.forEach((line, index) => {
    if (!line.manual_vat_override && line.manual_vat_override_reason !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines', index, 'manual_vat_override_reason'],
        message: 'not_allowed_without_manual_override',
      })
    }
    const domainLine: BookkeepingEntryLine = {
      id: line.line_id ?? line.client_key,
      entryId: value.entry_id ?? value.request_id,
      categoryCode: line.category_code,
      description: line.description,
      vatTreatment: line.vat_treatment,
      currency: line.currency,
      amountIncludesVat: line.amount_includes_vat,
      grossMinor: line.gross_minor,
      netMinor: line.net_minor,
      vatMinor: line.vat_minor,
      inputVatDeductibility: line.input_vat_deductibility,
      deductibleVatMinor: line.deductible_vat_minor,
      manualVatOverride: line.manual_vat_override,
      manualVatOverrideReason: line.manual_vat_override_reason,
      exemptTurnoverConfirmed: line.exempt_turnover_confirmed,
    }
    for (const issue of validateVatLine(value.type, domainLine)) {
      if (savableReviewIssues.has(issue.code)) continue
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines', index, issue.field],
        message: issue.code,
      })
    }
  })

  try {
    sumIskAmounts(value.lines.map((line) => line.gross_minor))
    sumIskAmounts(value.lines.map((line) => line.net_minor))
    sumIskAmounts(value.lines.map((line) => line.vat_minor))
    sumIskAmounts(value.lines.map((line) => line.deductible_vat_minor))
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lines'],
      message: 'aggregate_amount_overflow',
    })
  }
})

export const SetBookkeepingEntryReviewStateSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  entry_id: uuid,
  expected_version: safeInteger.positive(),
  review_state: z.enum(BOOKKEEPING_REVIEW_STATES),
}).strict()

export const SetBookkeepingEntrySettlementStateSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  entry_id: uuid,
  expected_settlement_version: safeInteger.nonnegative(),
  settlement_state: z.enum(BOOKKEEPING_ENTRY_SETTLEMENT_STATES),
}).strict()

export const VoidBookkeepingEntrySchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  entry_id: uuid,
  expected_version: safeInteger.positive(),
  reason: z.string().trim().min(1).max(1000),
}).strict()

export const SetBookkeepingPeriodReadySchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  period_id: uuid,
  expected_version: safeInteger.positive(),
  live_form_confirmed: z.literal(true),
}).strict()

const vatSnapshotFieldsSchema = z.object({
  A: safeInteger,
  B: safeInteger,
  C: safeInteger,
  D: safeInteger,
  E: safeInteger,
  F: safeInteger,
}).strict()

export const RecordBookkeepingFilingSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  period_id: uuid,
  expected_version: safeInteger.positive(),
  submitted_on: BookkeepingDateSchema,
  due_on: BookkeepingDateSchema.nullable(),
  fields: vatSnapshotFieldsSchema,
  reported_result_minor: safeInteger,
  result_mismatch_reason: nullableTrimmed(1000),
  confirmation_reference: nullableTrimmed(200),
  note: nullableTrimmed(1000),
  payment_state: z.enum(['unpaid', 'paid', 'credit']),
  paid_on: BookkeepingDateSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  const calculatedResult = value.fields.D - value.fields.E
  if (!Number.isSafeInteger(calculatedResult) || value.fields.F !== calculatedResult) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', 'F'], message: 'invalid_f' })
  }
  if (
    value.reported_result_minor !== value.fields.F
    && !value.result_mismatch_reason?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['result_mismatch_reason'],
      message: 'required_for_result_mismatch',
    })
  }
  if (value.payment_state === 'paid' && value.paid_on === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paid_on'], message: 'required' })
  }
  if (value.payment_state !== 'paid' && value.paid_on !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paid_on'], message: 'not_allowed' })
  }
})

export const ReopenBookkeepingPeriodSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  period_id: uuid,
  expected_version: safeInteger.positive(),
  reason: z.string().trim().min(1).max(1000),
}).strict()

export const RecordBookkeepingPaymentSchema = z.object({
  request_id: requestId,
  entity_id: uuid,
  period_id: uuid,
  expected_version: safeInteger.positive(),
  payment_state: z.enum(['unpaid', 'paid', 'credit']),
  paid_on: BookkeepingDateSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.payment_state === 'paid' && value.paid_on === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paid_on'], message: 'required' })
  }
  if (value.payment_state !== 'paid' && value.paid_on !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paid_on'], message: 'not_allowed' })
  }
})

export type CreateBookkeepingEntityInput = z.infer<typeof CreateBookkeepingEntitySchema>
export type AddBookkeepingVatRegistrationInput = z.infer<
  typeof AddBookkeepingVatRegistrationSchema
>
export type CreateBookkeepingPeriodInput = z.infer<typeof CreateBookkeepingPeriodSchema>
export type SaveBookkeepingEntryInput = z.infer<typeof SaveBookkeepingEntrySchema>
export type SetBookkeepingEntryReviewStateInput = z.infer<
  typeof SetBookkeepingEntryReviewStateSchema
>
export type VoidBookkeepingEntryInput = z.infer<typeof VoidBookkeepingEntrySchema>
export type SetBookkeepingPeriodReadyInput = z.infer<typeof SetBookkeepingPeriodReadySchema>
export type RecordBookkeepingFilingInput = z.infer<typeof RecordBookkeepingFilingSchema>
export type ReopenBookkeepingPeriodInput = z.infer<typeof ReopenBookkeepingPeriodSchema>
export type RecordBookkeepingPaymentInput = z.infer<typeof RecordBookkeepingPaymentSchema>
