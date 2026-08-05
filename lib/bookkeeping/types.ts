import type {
  BookkeepingCurrency,
  BookkeepingEntryType,
  BookkeepingEntrySettlementState,
  BookkeepingFilingMethod,
  BookkeepingInputVatDeductibility,
  BookkeepingPeriodState,
  BookkeepingReviewState,
  BookkeepingSpecialCaseState,
  BookkeepingVatTreatment,
  VatReportField,
} from './constants'
import type { BookkeepingPeriodReadiness } from './readiness'

export interface BookkeepingEntity {
  id: string
  ownerUserId: string
  displayName: string
  legalName: string | null
  legalIdentifier: string | null
  defaultCurrency: BookkeepingCurrency
  detailsConfirmed: boolean
  createdAt: string
  updatedAt: string
}

export interface BookkeepingVatRegistration {
  id: string
  entityId: string
  vatNumber: string
  label: string | null
  filingMethod: BookkeepingFilingMethod
  detailsConfirmed: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface BookkeepingPeriod {
  id: string
  entityId: string
  vatRegistrationId: string
  startsOn: string
  endsOn: string
  dueOn: string | null
  state: BookkeepingPeriodState
  periodDatesConfirmed: boolean
  liveFormCompared: boolean
  version: number
  submittedAt: string | null
  reopenedAt: string | null
  reopenReason: string | null
  createdAt: string
  updatedAt: string
}

export interface BookkeepingDocumentEvidence {
  originalDocumentPreserved: boolean
  businessPurposeConfirmed: boolean
  sellerVatRegistrationConfirmed: boolean | null
}

export interface BookkeepingSpecialCases {
  foreignService: BookkeepingSpecialCaseState
  import: BookkeepingSpecialCaseState
  mixedUse: BookkeepingSpecialCaseState
  uncertainDeductibility: BookkeepingSpecialCaseState
}

export interface BookkeepingEntryLine {
  id: string
  entryId: string
  categoryCode: string | null
  description: string | null
  vatTreatment: BookkeepingVatTreatment
  currency: BookkeepingCurrency
  /** Preserves whether the user's source amount was entered gross or net. */
  amountIncludesVat: boolean
  grossMinor: number
  netMinor: number
  vatMinor: number
  inputVatDeductibility: BookkeepingInputVatDeductibility
  deductibleVatMinor: number
  manualVatOverride: boolean
  manualVatOverrideReason: string | null
  exemptTurnoverConfirmed: boolean
}

export interface BookkeepingEntry {
  id: string
  entityId: string
  vatRegistrationId: string
  periodId: string
  type: BookkeepingEntryType
  documentDate: string
  reportingDate: string
  counterparty: string | null
  description: string
  documentType: string | null
  documentReference: string | null
  duplicateReferenceConfirmed: boolean
  currency: BookkeepingCurrency
  sourceType: 'manual' | string
  sourceId: string | null
  sourceReference: string | null
  reviewState: BookkeepingReviewState
  evidence: BookkeepingDocumentEvidence
  specialCases: BookkeepingSpecialCases
  specialCaseResolutionNote: string | null
  note?: string | null
  version: number
  settlementState: BookkeepingEntrySettlementState
  /** Independent CAS version for operational settlement; does not alter VAT entry versions. */
  settlementVersion: number
  settledAt: string | null
  voidedAt: string | null
  lines: readonly BookkeepingEntryLine[]
  createdAt: string
  updatedAt: string
}

export interface VatTraceItem {
  field: VatReportField
  entryId: string
  lineId: string
  /** Signed contribution to this field. Credits are negative. */
  amountMinor: number
  vatTreatment: BookkeepingVatTreatment
}

export interface BookkeepingVatSummary {
  currency: 'ISK'
  fields: Readonly<Record<VatReportField, number>>
  outputVat24Minor: number
  outputVat11Minor: number
  inputVat24Minor: number
  inputVat11Minor: number
  traces: Readonly<Record<VatReportField, readonly VatTraceItem[]>>
}

export interface BookkeepingPeriodView {
  entity: BookkeepingEntity
  registration: BookkeepingVatRegistration
  period: BookkeepingPeriod
  entries: readonly BookkeepingEntry[]
  summary: BookkeepingVatSummary
  readiness: BookkeepingPeriodReadiness
  filing: BookkeepingFilingSnapshot | null
}

export interface BookkeepingPeriodDashboardSummary {
  period: BookkeepingPeriod
  entryCount: number
  summary: BookkeepingVatSummary
  readiness: BookkeepingPeriodReadiness
  filing: BookkeepingFilingSnapshot | null
}

export interface BookkeepingEntityView {
  entity: BookkeepingEntity
  registrations: readonly BookkeepingVatRegistration[]
  periods: readonly BookkeepingPeriodDashboardSummary[]
}

export interface BookkeepingDashboardView {
  entities: readonly BookkeepingEntityView[]
}

export interface BookkeepingFilingSnapshot {
  periodId: string
  fields: Readonly<Record<VatReportField, number>>
  submittedOn: string
  dueOn: string | null
  reportedResultMinor: number
  resultMismatchReason: string | null
  confirmationReference: string | null
  note: string | null
  paymentState: 'unpaid' | 'paid' | 'credit'
  paidOn: string | null
}
