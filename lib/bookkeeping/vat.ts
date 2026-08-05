import type {
  BookkeepingEntryType,
  BookkeepingVatRate,
  VatReportField,
} from './constants'
import { VAT_REPORT_FIELDS } from './constants'
import { failBookkeepingDomain } from './domain-error'
import {
  addIskAmounts,
  assertSafeIskAmount,
  assertSafeSignedIskAmount,
} from './money'
import type {
  BookkeepingEntry,
  BookkeepingEntryLine,
  BookkeepingVatSummary,
  VatTraceItem,
} from './types'

export type VatLineIssueCode =
  | 'invalid_currency'
  | 'invalid_gross_amount'
  | 'invalid_net_amount'
  | 'invalid_vat_amount'
  | 'invalid_deductible_vat_amount'
  | 'gross_net_vat_mismatch'
  | 'treatment_not_allowed_for_entry_type'
  | 'vat_must_be_zero'
  | 'manual_override_required'
  | 'manual_override_reason_required'
  | 'sale_deductibility_not_applicable'
  | 'purchase_deductibility_required'
  | 'deductible_vat_mismatch'
  | 'deductibility_needs_review'
  | 'vat_treatment_needs_review'

export interface VatLineIssue {
  code: VatLineIssueCode
  field:
    | 'currency'
    | 'grossMinor'
    | 'netMinor'
    | 'vatMinor'
    | 'vatTreatment'
    | 'inputVatDeductibility'
    | 'deductibleVatMinor'
    | 'manualVatOverride'
    | 'manualVatOverrideReason'
}

export interface VatBreakdownSuggestion {
  grossMinor: number
  netMinor: number
  vatMinor: number
  rate: BookkeepingVatRate
  amountIncludesVat: boolean
}

function multiplyDivideRoundHalfUp(
  value: number,
  numerator: number,
  denominator: number,
): number {
  assertSafeIskAmount(value, true)
  if (
    !Number.isSafeInteger(numerator)
    || numerator < 0
    || !Number.isSafeInteger(denominator)
    || denominator <= 0
    || numerator > denominator
  ) {
    failBookkeepingDomain('invalid_amount', { numerator, denominator })
  }

  // Splitting into quotient and remainder avoids multiplying a large safe
  // integer by the VAT rate. The remaining multiplication is always small.
  const quotient = Math.floor(value / denominator)
  const remainder = value % denominator
  const whole = quotient * numerator
  const remainderProduct = remainder * numerator
  const fraction = Math.floor(remainderProduct / denominator)
  const residual = remainderProduct % denominator
  const roundedFraction = fraction + (residual * 2 >= denominator ? 1 : 0)
  const result = whole + roundedFraction
  if (!Number.isSafeInteger(result)) failBookkeepingDomain('amount_overflow')
  return result
}

export function suggestVatBreakdownFromGross(
  grossMinor: number,
  rate: BookkeepingVatRate,
): VatBreakdownSuggestion {
  assertSafeIskAmount(grossMinor)
  const vatMinor = multiplyDivideRoundHalfUp(grossMinor, rate, 100 + rate)
  return {
    grossMinor,
    netMinor: grossMinor - vatMinor,
    vatMinor,
    rate,
    amountIncludesVat: true,
  }
}

export function suggestVatBreakdownFromNet(
  netMinor: number,
  rate: BookkeepingVatRate,
): VatBreakdownSuggestion {
  assertSafeIskAmount(netMinor)
  const vatMinor = multiplyDivideRoundHalfUp(netMinor, rate, 100)
  return {
    grossMinor: addIskAmounts(netMinor, vatMinor),
    netMinor,
    vatMinor,
    rate,
    amountIncludesVat: false,
  }
}

export function vatRateForTreatment(
  treatment: BookkeepingEntryLine['vatTreatment'],
): BookkeepingVatRate | null {
  if (treatment === 'taxable_24') return 24
  if (treatment === 'taxable_11') return 11
  return null
}

export function entryContributionSign(type: BookkeepingEntryType): 1 | -1 {
  return type === 'sales_credit' || type === 'purchase_credit' ? -1 : 1
}

export function isSaleEntryType(type: BookkeepingEntryType): boolean {
  return type === 'sale' || type === 'sales_credit'
}

export function isPurchaseEntryType(type: BookkeepingEntryType): boolean {
  return type === 'purchase' || type === 'purchase_credit'
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function addIssue(
  issues: VatLineIssue[],
  code: VatLineIssueCode,
  field: VatLineIssue['field'],
): void {
  issues.push({ code, field })
}

/**
 * Returns stable issue codes instead of tax advice or user-facing prose.
 * Callers can translate each code and point at the exact input.
 */
export function validateVatLine(
  entryType: BookkeepingEntryType,
  line: BookkeepingEntryLine,
): readonly VatLineIssue[] {
  const issues: VatLineIssue[] = []
  if (line.currency !== 'ISK') addIssue(issues, 'invalid_currency', 'currency')
  if (!Number.isSafeInteger(line.grossMinor) || line.grossMinor <= 0) {
    addIssue(issues, 'invalid_gross_amount', 'grossMinor')
  }
  if (!isNonNegativeSafeInteger(line.netMinor)) {
    addIssue(issues, 'invalid_net_amount', 'netMinor')
  }
  if (!isNonNegativeSafeInteger(line.vatMinor)) {
    addIssue(issues, 'invalid_vat_amount', 'vatMinor')
  }
  if (!isNonNegativeSafeInteger(line.deductibleVatMinor)) {
    addIssue(issues, 'invalid_deductible_vat_amount', 'deductibleVatMinor')
  }
  if (
    isNonNegativeSafeInteger(line.netMinor)
    && isNonNegativeSafeInteger(line.vatMinor)
    && (
      !Number.isSafeInteger(line.netMinor + line.vatMinor)
      || line.grossMinor !== line.netMinor + line.vatMinor
    )
  ) {
    addIssue(issues, 'gross_net_vat_mismatch', 'grossMinor')
  }

  const sale = isSaleEntryType(entryType)
  const purchase = isPurchaseEntryType(entryType)
  if (
    (sale && line.vatTreatment === 'no_vat')
    || (purchase && line.vatTreatment === 'exempt_turnover')
  ) {
    addIssue(issues, 'treatment_not_allowed_for_entry_type', 'vatTreatment')
  }

  const rate = vatRateForTreatment(line.vatTreatment)
  if (rate === null && line.vatTreatment !== 'needs_review' && line.vatMinor !== 0) {
    addIssue(issues, 'vat_must_be_zero', 'vatMinor')
  }
  if (line.vatTreatment === 'needs_review') {
    addIssue(issues, 'vat_treatment_needs_review', 'vatTreatment')
  }

  if (
    rate !== null
    && Number.isSafeInteger(line.grossMinor)
    && line.grossMinor > 0
    && isNonNegativeSafeInteger(line.netMinor)
    && isNonNegativeSafeInteger(line.vatMinor)
  ) {
    const suggestion = line.amountIncludesVat
      ? suggestVatBreakdownFromGross(line.grossMinor, rate)
      : suggestVatBreakdownFromNet(line.netMinor, rate)
    const differs = suggestion.grossMinor !== line.grossMinor
      || suggestion.netMinor !== line.netMinor
      || suggestion.vatMinor !== line.vatMinor
    if (differs && !line.manualVatOverride) {
      addIssue(issues, 'manual_override_required', 'manualVatOverride')
    }
  }
  if (line.manualVatOverride && !line.manualVatOverrideReason?.trim()) {
    addIssue(issues, 'manual_override_reason_required', 'manualVatOverrideReason')
  }

  if (sale) {
    if (line.inputVatDeductibility !== 'not_applicable' || line.deductibleVatMinor !== 0) {
      addIssue(issues, 'sale_deductibility_not_applicable', 'inputVatDeductibility')
    }
  } else if (purchase && rate !== null) {
    switch (line.inputVatDeductibility) {
      case 'fully_deductible':
        if (line.deductibleVatMinor !== line.vatMinor) {
          addIssue(issues, 'deductible_vat_mismatch', 'deductibleVatMinor')
        }
        break
      case 'partially_deductible':
        if (
          line.deductibleVatMinor <= 0
          || line.deductibleVatMinor >= line.vatMinor
        ) {
          addIssue(issues, 'deductible_vat_mismatch', 'deductibleVatMinor')
        }
        break
      case 'not_deductible':
        if (line.deductibleVatMinor !== 0) {
          addIssue(issues, 'deductible_vat_mismatch', 'deductibleVatMinor')
        }
        break
      case 'needs_review':
        addIssue(issues, 'deductibility_needs_review', 'inputVatDeductibility')
        break
      case 'not_applicable':
        addIssue(issues, 'purchase_deductibility_required', 'inputVatDeductibility')
        break
    }
  } else if (
    line.inputVatDeductibility !== 'not_applicable'
    || line.deductibleVatMinor !== 0
  ) {
    addIssue(issues, 'deductible_vat_mismatch', 'deductibleVatMinor')
  }

  return issues
}

const NON_BLOCKING_SUMMARY_ISSUES = new Set<VatLineIssueCode>([
  'vat_treatment_needs_review',
  'deductibility_needs_review',
  'purchase_deductibility_required',
  'manual_override_required',
  'manual_override_reason_required',
])

function assertLineStructurallyValid(
  entryType: BookkeepingEntryType,
  line: BookkeepingEntryLine,
): void {
  const issues = validateVatLine(entryType, line)
    .filter((issue) => !NON_BLOCKING_SUMMARY_ISSUES.has(issue.code))
  if (issues.length > 0) {
    failBookkeepingDomain('invalid_vat_line', {
      entryId: line.entryId,
      lineId: line.id,
      issues: issues.map((issue) => issue.code),
    })
  }
}

export function isInputVatEvidenceComplete(entry: BookkeepingEntry): boolean {
  return Boolean(
    entry.documentReference?.trim()
    && entry.evidence.originalDocumentPreserved
    && entry.evidence.businessPurposeConfirmed
    && entry.evidence.sellerVatRegistrationConfirmed === true,
  )
}

function specialCasesResolved(entry: BookkeepingEntry): boolean {
  return Object.values(entry.specialCases).every((state) => state !== 'unresolved')
}

function emptyTraceRecord(): Record<VatReportField, VatTraceItem[]> {
  return { A: [], B: [], C: [], D: [], E: [], F: [] }
}

function emptyFieldRecord(): Record<VatReportField, number> {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
}

function signedContribution(amountMinor: number, sign: 1 | -1): number {
  assertSafeIskAmount(amountMinor, true)
  return sign === 1 ? amountMinor : -amountMinor
}

function addContribution(
  fields: Record<VatReportField, number>,
  traces: Record<VatReportField, VatTraceItem[]>,
  field: VatReportField,
  entry: BookkeepingEntry,
  line: BookkeepingEntryLine,
  amountMinor: number,
): void {
  if (amountMinor === 0) return
  fields[field] = addIskAmounts(fields[field], amountMinor)
  traces[field].push({
    field,
    entryId: entry.id,
    lineId: line.id,
    amountMinor,
    vatTreatment: line.vatTreatment,
  })
}

/**
 * Computes A-F only from reviewed, non-voided entries. Unconfirmed C and
 * incomplete input-VAT evidence are intentionally excluded, while readiness
 * reports actionable blockers for them.
 */
export function computeVatSummary(
  entries: readonly BookkeepingEntry[],
): BookkeepingVatSummary {
  const fields = emptyFieldRecord()
  const traces = emptyTraceRecord()
  let outputVat24Minor = 0
  let outputVat11Minor = 0
  let inputVat24Minor = 0
  let inputVat11Minor = 0

  for (const entry of entries) {
    if (entry.voidedAt !== null || entry.reviewState !== 'reviewed') continue
    const sign = entryContributionSign(entry.type)

    for (const line of entry.lines) {
      assertLineStructurallyValid(entry.type, line)
      if (line.vatTreatment === 'needs_review') continue

      if (isSaleEntryType(entry.type)) {
        if (line.vatTreatment === 'taxable_24') {
          const net = signedContribution(line.netMinor, sign)
          const vat = signedContribution(line.vatMinor, sign)
          addContribution(fields, traces, 'A', entry, line, net)
          addContribution(fields, traces, 'D', entry, line, vat)
          outputVat24Minor = addIskAmounts(outputVat24Minor, vat)
        } else if (line.vatTreatment === 'taxable_11') {
          const net = signedContribution(line.netMinor, sign)
          const vat = signedContribution(line.vatMinor, sign)
          addContribution(fields, traces, 'B', entry, line, net)
          addContribution(fields, traces, 'D', entry, line, vat)
          outputVat11Minor = addIskAmounts(outputVat11Minor, vat)
        } else if (
          line.vatTreatment === 'exempt_turnover'
          && line.exemptTurnoverConfirmed
        ) {
          addContribution(
            fields,
            traces,
            'C',
            entry,
            line,
            signedContribution(line.netMinor, sign),
          )
        }
      }

      if (
        isPurchaseEntryType(entry.type)
        && (line.vatTreatment === 'taxable_24' || line.vatTreatment === 'taxable_11')
        && (line.inputVatDeductibility === 'fully_deductible'
          || line.inputVatDeductibility === 'partially_deductible')
        && isInputVatEvidenceComplete(entry)
        && specialCasesResolved(entry)
      ) {
        const deductible = signedContribution(line.deductibleVatMinor, sign)
        addContribution(fields, traces, 'E', entry, line, deductible)
        if (line.vatTreatment === 'taxable_24') {
          inputVat24Minor = addIskAmounts(inputVat24Minor, deductible)
        } else {
          inputVat11Minor = addIskAmounts(inputVat11Minor, deductible)
        }
      }
    }
  }

  fields.F = addIskAmounts(fields.D, -fields.E)
  for (const item of traces.D) {
    traces.F.push({ ...item, field: 'F' })
  }
  for (const item of traces.E) {
    traces.F.push({ ...item, field: 'F', amountMinor: -item.amountMinor })
  }

  return {
    currency: 'ISK',
    fields,
    outputVat24Minor,
    outputVat11Minor,
    inputVat24Minor,
    inputVat11Minor,
    traces,
  }
}

export function traceEntriesForField(
  summary: BookkeepingVatSummary,
  field: VatReportField,
): readonly VatTraceItem[] {
  return summary.traces[field]
}

/** A-F, one plain signed integer per line, with no currency formatting. */
export function formatVatSummaryForCopy(summary: BookkeepingVatSummary): string {
  return VAT_REPORT_FIELDS.map((field) => `${field}\t${summary.fields[field]}`).join('\n')
}

export function assertVatSummaryInternalConsistency(summary: BookkeepingVatSummary): void {
  for (const field of VAT_REPORT_FIELDS) {
    assertSafeSignedIskAmount(summary.fields[field])
  }
  if (summary.fields.D !== addIskAmounts(summary.outputVat24Minor, summary.outputVat11Minor)) {
    failBookkeepingDomain('invalid_vat_line', { field: 'D' })
  }
  if (summary.fields.E !== addIskAmounts(summary.inputVat24Minor, summary.inputVat11Minor)) {
    failBookkeepingDomain('invalid_vat_line', { field: 'E' })
  }
  if (summary.fields.F !== addIskAmounts(summary.fields.D, -summary.fields.E)) {
    failBookkeepingDomain('invalid_vat_line', { field: 'F' })
  }
}
