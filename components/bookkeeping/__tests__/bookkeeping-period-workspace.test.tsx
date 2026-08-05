import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BookkeepingEntry,
  BookkeepingFilingSnapshot,
  BookkeepingPeriodView,
} from '@/lib/bookkeeping/types'

const {
  mockPush,
  mockRefresh,
  mockRecordFiling,
  mockRecordPayment,
  mockReopenPeriod,
  mockSetReviewState,
  mockSetSettlementState,
  mockSetReady,
  mockVoidEntry,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockRecordFiling: vi.fn(),
  mockRecordPayment: vi.fn(),
  mockReopenPeriod: vi.fn(),
  mockSetReviewState: vi.fn(),
  mockSetSettlementState: vi.fn(),
  mockSetReady: vi.fn(),
  mockVoidEntry: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

vi.mock('@/lib/bookkeeping/actions', () => ({
  recordBookkeepingFiling: mockRecordFiling,
  recordBookkeepingPayment: mockRecordPayment,
  reopenBookkeepingPeriod: mockReopenPeriod,
  setBookkeepingEntryReviewState: mockSetReviewState,
  setBookkeepingEntrySettlementState: mockSetSettlementState,
  setBookkeepingPeriodReady: mockSetReady,
  voidBookkeepingEntry: mockVoidEntry,
}))

const translations: Record<string, string> = {
  'common.cancel': 'Hætta við',
  'common.copy': 'Afrita',
  'common.copyFailed': 'Afritun mistókst.',
  'common.copied': 'Afritað',
  'common.datePlaceholder': 'Veldu dag',
  'common.optional': 'Valfrjálst',
  'common.save': 'Vista',
  'common.saving': 'Vista...',
  'common.status': 'Staða',
  'entryForm.lines': 'VSK-línur',
  'entryForm.gross': 'Heild',
  'entryForm.vat': 'VSK',
  'entryTypes.sale': 'Tekjur',
  'entryTypes.purchase': 'Útgjöld',
  'entryTypes.sales_credit': 'Kredit á tekjur',
  'entryTypes.purchase_credit': 'Kredit á útgjöld',
  'errors.invalid_input': 'Athugaðu reitina og reyndu aftur.',
  'errors.unexpected_error': 'Ekki tókst að vista.',
  'filing.confirmationReference': 'Staðfestingarnúmer',
  'filing.credit': 'Inneign',
  'filing.mismatchReason': 'Skýring á mismun',
  'filing.mismatchWarning': 'Niðurstaðan er ekki sú sama og F.',
  'filing.note': 'Athugasemd',
  'filing.paid': 'Greitt',
  'filing.paidOn': 'Greiðsludagur',
  'filing.recordedResult': 'Niðurstaða samkvæmt skattur.is',
  'filing.submit': 'Skrá skýrslu sem skilaða',
  'filing.submittedOn': 'Skiladagur',
  'filing.submitting': 'Skrái skil...',
  'filing.title': 'Skrá handvirk skil',
  'filing.unpaid': 'Ógreitt',
  'period.addEntry': 'Skrá færslu',
  'period.dueOn': 'Gjalddagi {date}',
  'period.editEntry': 'Breyta færslu',
  'period.empty': 'Engar færslur eru á tímabilinu.',
  'period.entries': 'Færslur',
  'period.entryAmount': 'Heild {amount}',
  'period.entryVat': 'VSK {amount}',
  'period.filterAll': 'Allar',
  'period.filterPurchases': 'Útgjöld',
  'period.filterReview': 'Þarfnast skoðunar',
  'period.filterSales': 'Tekjur',
  'period.liveFormConfirmed': 'Ég hef borið A–F saman við virka skýrslu á skattur.is.',
  'period.markingReady': 'Staðfesti...',
  'period.markNeedsReview': 'Merkja til skoðunar',
  'period.markReady': 'Merkja tilbúið til skila',
  'period.markReviewed': 'Merkja yfirfarna',
  'period.recordingPayment': 'Vista greiðslu...',
  'period.recordPayment': 'Skrá greiðslu',
  'period.reopen': 'Enduropna til leiðréttingar',
  'period.reopening': 'Enduropna...',
  'period.reopenReason': 'Ástæða enduropnunar',
  'period.submittedLocked': 'Tímabilinu hefur verið skilað og breytingar eru læstar.',
  'period.vatNumber': 'VSK-númer {number}',
  'periodForm.dueOn': 'Gjalddagi',
  'periodForm.registration': 'VSK-númer',
  'period.voidConfirm': 'Viltu ógilda færsluna?',
  'period.voided': 'Ógild',
  'period.voidEntry': 'Ógilda færslu',
  'period.voiding': 'Ógildi...',
  'period.voidReason': 'Ástæða ógildingar',
  'periodStates.draft': 'Í vinnslu',
  'periodStates.ready': 'Tilbúið til skila',
  'periodStates.submitted': 'Skilað',
  'readiness.live_form_not_compared': 'Berðu A–F saman við virka skýrslu.',
  'readiness.notReady': 'Ekki tilbúið til VSK skila',
  'readiness.ready': 'Tímabilið stenst sjálfvirku athuganirnar.',
  'readiness.title': 'Yfirferð fyrir skil',
  'reviewStates.needs_review': 'Þarfnast skoðunar',
  'reviewStates.reviewed': 'Yfirfarin',
  'reviewStates.unreviewed': 'Óyfirfarin',
  'entrySettlement.saving': 'Vista greiðslustöðu...',
  'entrySettlement.sale.open': 'Ógreitt',
  'entrySettlement.sale.settled': 'Greiðsla móttekin',
  'entrySettlement.sale.markSettled': 'Merkja greiðslu móttekna',
  'entrySettlement.sale.markOpen': 'Merkja ógreidda',
  'entrySettlement.purchase.open': 'Ógreitt',
  'entrySettlement.purchase.settled': 'Greitt',
  'entrySettlement.purchase.markSettled': 'Merkja greitt',
  'entrySettlement.purchase.markOpen': 'Merkja ógreitt',
  'entrySettlement.credit.open': 'Ójafnað',
  'entrySettlement.credit.settled': 'Jafnað',
  'entrySettlement.credit.markSettled': 'Merkja jafnað',
  'entrySettlement.credit.markOpen': 'Merkja ójafnað',
  'vat.A': 'Skattskyld velta 24%',
  'vat.B': 'Skattskyld velta 11%',
  'vat.C': 'Undanþegin velta',
  'vat.copyAll': 'Afrita A–F',
  'vat.D': 'Útskattur',
  'vat.E': 'Innskattur',
  'vat.F': 'Álagning',
  'vat.finalHint': 'Skattur.is reiknar endanlega niðurstöðu.',
  'vat.help': 'Færðu tölurnar yfir á skattur.is.',
  'vat.input11': 'Innskattur 11%',
  'vat.input24': 'Innskattur 24%',
  'vat.output11': 'Útskattur 11%',
  'vat.output24': 'Útskattur 24%',
  'vat.title': 'Tölur fyrir VSK skil',
  'vat.traceCount': '{count} línur',
  'vat.traceEmpty': 'Engin færsla myndar þessa tölu.',
  'vat.traceSummary': '{count} færslur · Samtals {amount} · {warnings} viðvaranir',
  'vatTreatments.taxable_11': '11% VSK',
  'vatTreatments.taxable_24': '24% VSK',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.bookkeeping\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => translate,
}))

import { BookkeepingPeriodWorkspace } from '@/components/bookkeeping/BookkeepingPeriodWorkspace'

function entry(overrides: Partial<BookkeepingEntry> = {}): BookkeepingEntry {
  return {
    id: 'entry-sale',
    entityId: 'entity-1',
    vatRegistrationId: 'registration-1',
    periodId: 'period-1',
    type: 'sale',
    documentDate: '2026-05-10',
    reportingDate: '2026-05-10',
    counterparty: 'Viðskiptavinur',
    description: 'Seld þjónusta',
    documentType: 'invoice',
    documentReference: 'S-1',
    duplicateReferenceConfirmed: false,
    currency: 'ISK',
    sourceType: 'manual',
    sourceId: null,
    sourceReference: null,
    reviewState: 'reviewed',
    evidence: {
      originalDocumentPreserved: false,
      businessPurposeConfirmed: false,
      sellerVatRegistrationConfirmed: null,
    },
    specialCases: {
      foreignService: 'not_applicable',
      import: 'not_applicable',
      mixedUse: 'not_applicable',
      uncertainDeductibility: 'not_applicable',
    },
    specialCaseResolutionNote: null,
    version: 2,
    settlementState: 'open',
    settlementVersion: 0,
    settledAt: null,
    voidedAt: null,
    lines: [{
      id: 'line-sale',
      entryId: 'entry-sale',
      categoryCode: 'service_sales',
      description: 'Þjónustulína',
      vatTreatment: 'taxable_24',
      currency: 'ISK',
      amountIncludesVat: true,
      grossMinor: 124_000,
      netMinor: 100_000,
      vatMinor: 24_000,
      inputVatDeductibility: 'not_applicable',
      deductibleVatMinor: 0,
      manualVatOverride: false,
      manualVatOverrideReason: null,
      exemptTurnoverConfirmed: false,
    }],
    createdAt: '2026-08-04T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    ...overrides,
  }
}

const purchaseEntry = (): BookkeepingEntry => entry({
  id: 'entry-purchase',
  type: 'purchase',
  counterparty: 'Seljandi',
  description: 'Keypt þjónusta',
  reviewState: 'needs_review',
  evidence: {
    originalDocumentPreserved: true,
    businessPurposeConfirmed: true,
    sellerVatRegistrationConfirmed: true,
  },
  version: 4,
  lines: [{
    id: 'line-purchase',
    entryId: 'entry-purchase',
    categoryCode: 'purchased_services',
    description: 'Innkaupalína',
    vatTreatment: 'taxable_11',
    currency: 'ISK',
    amountIncludesVat: true,
    grossMinor: 111_000,
    netMinor: 100_000,
    vatMinor: 11_000,
    inputVatDeductibility: 'fully_deductible',
    deductibleVatMinor: 11_000,
    manualVatOverride: false,
    manualVatOverrideReason: null,
    exemptTurnoverConfirmed: false,
  }],
})

function filing(overrides: Partial<BookkeepingFilingSnapshot> = {}): BookkeepingFilingSnapshot {
  return {
    periodId: 'period-1',
    fields: { A: 100_000, B: 0, C: 0, D: 24_000, E: 11_000, F: 13_000 },
    submittedOn: '2026-08-05',
    dueOn: '2026-08-05',
    reportedResultMinor: 13_000,
    resultMismatchReason: null,
    confirmationReference: 'STADF-1',
    note: null,
    paymentState: 'unpaid',
    paidOn: null,
    ...overrides,
  }
}

function view(overrides: Partial<BookkeepingPeriodView> = {}): BookkeepingPeriodView {
  return {
    entity: {
      id: 'entity-1',
      ownerUserId: 'user-1',
      displayName: 'Prófun ehf.',
      legalName: 'Prófun ehf.',
      legalIdentifier: null,
      defaultCurrency: 'ISK',
      detailsConfirmed: true,
      createdAt: '2026-08-04T09:00:00.000Z',
      updatedAt: '2026-08-04T09:00:00.000Z',
    },
    registration: {
      id: 'registration-1',
      entityId: 'entity-1',
      vatNumber: '123456',
      label: 'Aðalstarfsemi',
      filingMethod: 'general_bimonthly',
      detailsConfirmed: true,
      active: true,
      createdAt: '2026-08-04T09:00:00.000Z',
      updatedAt: '2026-08-04T09:00:00.000Z',
    },
    period: {
      id: 'period-1',
      entityId: 'entity-1',
      vatRegistrationId: 'registration-1',
      startsOn: '2026-05-01',
      endsOn: '2026-06-30',
      dueOn: '2026-08-05',
      state: 'draft',
      periodDatesConfirmed: true,
      liveFormCompared: false,
      version: 5,
      submittedAt: null,
      reopenedAt: null,
      reopenReason: null,
      createdAt: '2026-08-04T09:00:00.000Z',
      updatedAt: '2026-08-04T09:00:00.000Z',
    },
    entries: [entry(), purchaseEntry()],
    summary: {
      currency: 'ISK',
      fields: { A: 100_000, B: 0, C: 0, D: 24_000, E: 11_000, F: 13_000 },
      outputVat24Minor: 24_000,
      outputVat11Minor: 0,
      inputVat24Minor: 0,
      inputVat11Minor: 11_000,
      traces: {
        A: [{ field: 'A', entryId: 'entry-sale', lineId: 'line-sale', amountMinor: 100_000, vatTreatment: 'taxable_24' }],
        B: [],
        C: [],
        D: [{ field: 'D', entryId: 'entry-sale', lineId: 'line-sale', amountMinor: 24_000, vatTreatment: 'taxable_24' }],
        E: [{ field: 'E', entryId: 'entry-purchase', lineId: 'line-purchase', amountMinor: 11_000, vatTreatment: 'taxable_11' }],
        F: [
          { field: 'F', entryId: 'entry-sale', lineId: 'line-sale', amountMinor: 24_000, vatTreatment: 'taxable_24' },
          { field: 'F', entryId: 'entry-purchase', lineId: 'line-purchase', amountMinor: -11_000, vatTreatment: 'taxable_11' },
        ],
      },
    },
    readiness: {
      isReady: false,
      blockers: [
        { code: 'entry_needs_review', entryId: 'entry-purchase' },
        { code: 'live_form_not_compared' },
      ],
      blockerCounts: { entry_needs_review: 1, live_form_not_compared: 1 },
    },
    filing: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRecordFiling.mockResolvedValue({ ok: true, data: { periodId: 'period-1', version: 6 } })
  mockRecordPayment.mockResolvedValue({ ok: true, data: { periodId: 'period-1', version: 7 } })
  mockReopenPeriod.mockResolvedValue({ ok: true, data: { periodId: 'period-1', version: 7 } })
  mockSetReviewState.mockResolvedValue({ ok: true, data: { periodId: 'period-1', entryId: 'entry-purchase', version: 5 } })
  mockSetSettlementState.mockResolvedValue({
    ok: true,
    data: {
      periodId: 'period-1', entryId: 'entry-sale', settlementState: 'settled',
      settlementVersion: 1, settledAt: '2026-08-05T07:00:00.000Z',
    },
  })
  mockSetReady.mockResolvedValue({ ok: true, data: { periodId: 'period-1', version: 6 } })
  mockVoidEntry.mockResolvedValue({ ok: true, data: { periodId: 'period-1', entryId: 'entry-purchase' } })
})

describe('BookkeepingPeriodWorkspace traceability and filters', () => {
  it('filters to exact traced entries and lines for A and F, then returns to domain filters', () => {
    const { container } = render(<BookkeepingPeriodWorkspace view={view()} />)

    expect(screen.getByRole('button', { name: 'Allar 2', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tekjur 1', pressed: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Útgjöld 1', pressed: false })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'Þarfnast skoðunar 1',
      pressed: false,
    })).toBeInTheDocument()

    const traceButtons = screen.getAllByRole('button', { name: '1 línur' })
    fireEvent.click(traceButtons[0]!)

    expect(screen.getByText('Seld þjónusta')).toBeInTheDocument()
    expect(screen.queryByText('Keypt þjónusta')).not.toBeInTheDocument()
    expect(container.querySelector('[data-line-id="line-sale"][data-trace-highlight="true"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'F Álagning' }))
    expect(screen.getByText('Seld þjónusta')).toBeInTheDocument()
    expect(screen.getByText('Keypt þjónusta')).toBeInTheDocument()
    expect(container.querySelector('[data-line-id="line-purchase"][data-trace-highlight="true"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Útgjöld 1', pressed: false }))
    expect(screen.queryByText('Seld þjónusta')).not.toBeInTheDocument()
    expect(screen.getByText('Keypt þjónusta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: 'Þarfnast skoðunar 1',
      pressed: false,
    }))
    expect(screen.getByText('Keypt þjónusta')).toBeInTheDocument()
    expect(screen.queryByText('Seld þjónusta')).not.toBeInTheDocument()
  })
})

describe('BookkeepingPeriodWorkspace mutations and locking', () => {
  it('changes independent payment status even after the VAT period is locked', async () => {
    const lockedView = view({
      period: { ...view().period, state: 'submitted' },
      filing: filing(),
    })
    render(<BookkeepingPeriodWorkspace view={lockedView} />)

    const saleCard = screen.getByText('Seld þjónusta').closest('article')!
    expect(within(saleCard).queryByRole('button', { name: 'Breyta færslu' })).not.toBeInTheDocument()
    await act(async () => fireEvent.click(within(saleCard).getByRole('button', {
      name: 'Merkja greiðslu móttekna',
    })))
    await waitFor(() => expect(mockSetSettlementState).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      entry_id: 'entry-sale',
      expected_settlement_version: 0,
      settlement_state: 'settled',
    }))
  })

  it('clears a stale live-form attestation after the server reopens the period', async () => {
    const initialView = view({
      readiness: {
        isReady: false,
        blockers: [{ code: 'live_form_not_compared' }],
        blockerCounts: { live_form_not_compared: 1 },
      },
    })
    const { rerender } = render(<BookkeepingPeriodWorkspace view={initialView} />)
    const confirmation = screen.getByLabelText(
      'Ég hef borið A–F saman við virka skýrslu á skattur.is.',
    )
    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()

    rerender(<BookkeepingPeriodWorkspace view={{
      ...initialView,
      period: { ...initialView.period, version: initialView.period.version + 1 },
    }} />)

    await waitFor(() => expect(confirmation).not.toBeChecked())
  })

  it('refreshes the filing result when an editable summary becomes ready', async () => {
    const initialView = view({
      summary: {
        ...view().summary,
        fields: { ...view().summary.fields, E: 24_000, F: 0 },
      },
    })
    const { rerender } = render(<BookkeepingPeriodWorkspace view={initialView} />)

    const readyView = {
      ...initialView,
      period: {
        ...initialView.period,
        state: 'ready' as const,
        liveFormCompared: true,
        version: initialView.period.version + 1,
      },
      summary: {
        ...initialView.summary,
        fields: { ...initialView.summary.fields, E: 0, F: 24_000 },
      },
      readiness: { isReady: true, blockers: [], blockerCounts: {} },
    }
    rerender(<BookkeepingPeriodWorkspace view={readyView} />)

    await waitFor(() => expect(
      screen.getByLabelText('Niðurstaða samkvæmt skattur.is'),
    ).toHaveValue('24.000'))
  })

  it('preserves a user-entered filing result across ready-state refreshes', () => {
    const readyView = view({
      period: { ...view().period, state: 'ready', liveFormCompared: true },
      readiness: { isReady: true, blockers: [], blockerCounts: {} },
    })
    const { rerender } = render(<BookkeepingPeriodWorkspace view={readyView} />)
    const reportedResult = screen.getByLabelText('Niðurstaða samkvæmt skattur.is')
    fireEvent.change(reportedResult, { target: { value: '12000' } })

    rerender(<BookkeepingPeriodWorkspace view={{
      ...readyView,
      period: { ...readyView.period, version: readyView.period.version + 1 },
    }} />)

    expect(reportedResult).toHaveValue('12.000')
  })

  it('requires the live form confirmation, reviews, voids with a reason, and gives edit feedback', async () => {
    const readyView = view({
      readiness: {
        isReady: false,
        blockers: [{ code: 'live_form_not_compared' }],
        blockerCounts: { live_form_not_compared: 1 },
      },
    })
    render(<BookkeepingPeriodWorkspace view={readyView} />)

    const readyButton = screen.getByRole('button', { name: 'Merkja tilbúið til skila' })
    expect(readyButton).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Ég hef borið A–F saman við virka skýrslu á skattur.is.'))
    expect(readyButton).toBeEnabled()
    await act(async () => fireEvent.click(readyButton))
    await waitFor(() => expect(mockSetReady).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      period_id: 'period-1',
      expected_version: 5,
      live_form_confirmed: true,
    }))

    const purchaseCard = screen.getByText('Keypt þjónusta').closest('article')!
    await act(async () => fireEvent.click(within(purchaseCard).getByRole('button', { name: 'Merkja yfirfarna' })))
    await waitFor(() => expect(mockSetReviewState).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      entry_id: 'entry-purchase',
      expected_version: 4,
      review_state: 'reviewed',
    }))

    fireEvent.click(within(purchaseCard).getByRole('button', { name: 'Ógilda færslu' }))
    const voidReason = within(purchaseCard).getByLabelText('Ástæða ógildingar')
    const voidButtons = within(purchaseCard).getAllByRole('button', { name: 'Ógilda færslu' })
    expect(voidButtons.at(-1)).toBeDisabled()
    fireEvent.change(voidReason, { target: { value: 'Tvískráð fylgiskjal' } })
    await act(async () => fireEvent.click(voidButtons.at(-1)!))
    await waitFor(() => expect(mockVoidEntry).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      entry_id: 'entry-purchase',
      expected_version: 4,
      reason: 'Tvískráð fylgiskjal',
    }))

    const editButton = within(purchaseCard).getByRole('button', { name: 'Breyta færslu' })
    fireEvent.click(editButton)
    expect(editButton).toHaveAttribute('aria-busy', 'true')
    expect(mockPush).toHaveBeenCalledWith(
      '/auth-mvp/bokhaldid/timabil/period-1/faerslur/entry-purchase/breyta',
    )
  })

  it('records an immutable A-F snapshot and requires a reason for a different result', async () => {
    const readyView = view({
      period: { ...view().period, state: 'ready', liveFormCompared: true },
      readiness: { isReady: true, blockers: [], blockerCounts: {} },
    })
    render(<BookkeepingPeriodWorkspace view={readyView} />)

    expect(screen.queryByRole('button', { name: 'Skrá færslu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Breyta færslu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Merkja yfirfarna' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ógilda færslu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enduropna til leiðréttingar' })).toBeDisabled()
    expect(screen.getByLabelText('Gjalddagi')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Skiladagur'), { target: { value: '2026-08-05' } })
    fireEvent.change(screen.getByLabelText('Niðurstaða samkvæmt skattur.is'), {
      target: { value: '12000' },
    })
    expect(screen.getByText('Niðurstaðan er ekki sú sama og F.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Skýring á mismun'), {
      target: { value: 'Mismunur staðfestur á skattur.is' },
    })
    fireEvent.change(screen.getByLabelText(/^Staðfestingarnúmer/), {
      target: { value: 'STADF-2' },
    })
    fireEvent.change(screen.getByLabelText('Staða'), { target: { value: 'paid' } })
    fireEvent.change(screen.getByLabelText('Greiðsludagur'), { target: { value: '2026-08-05' } })
    fireEvent.change(screen.getByLabelText(/^Athugasemd/), { target: { value: 'Skilað handvirkt' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skrá skýrslu sem skilaða' }))
    })
    await waitFor(() => expect(mockRecordFiling).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      period_id: 'period-1',
      expected_version: 5,
      submitted_on: '2026-08-05',
      due_on: '2026-08-05',
      fields: { A: 100_000, B: 0, C: 0, D: 24_000, E: 11_000, F: 13_000 },
      reported_result_minor: 12_000,
      result_mismatch_reason: 'Mismunur staðfestur á skattur.is',
      confirmation_reference: 'STADF-2',
      note: 'Skilað handvirkt',
      payment_state: 'paid',
      paid_on: '2026-08-05',
    }))
  })

  it('locks entry mutations after filing but supports payment and reasoned reopening', async () => {
    const submittedView = view({
      period: {
        ...view().period,
        state: 'submitted',
        liveFormCompared: true,
        submittedAt: '2026-08-05T12:00:00.000Z',
      },
      readiness: { isReady: true, blockers: [], blockerCounts: {} },
      filing: filing(),
    })
    render(<BookkeepingPeriodWorkspace view={submittedView} />)

    expect(screen.getByText('Tímabilinu hefur verið skilað og breytingar eru læstar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Breyta færslu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ógilda færslu' })).not.toBeInTheDocument()

    const statusSelects = screen.getAllByLabelText('Staða')
    fireEvent.change(statusSelects.at(-1)!, { target: { value: 'paid' } })
    fireEvent.change(screen.getByLabelText('Greiðsludagur'), { target: { value: '2026-08-06' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Skrá greiðslu' })))
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      period_id: 'period-1',
      expected_version: 5,
      payment_state: 'paid',
      paid_on: '2026-08-06',
    }))

    const reopenButton = screen.getByRole('button', { name: 'Enduropna til leiðréttingar' })
    expect(reopenButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Ástæða enduropnunar'), {
      target: { value: 'Leiðrétta þarf fylgiskjal' },
    })
    await act(async () => fireEvent.click(reopenButton))
    await waitFor(() => expect(mockReopenPeriod).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      period_id: 'period-1',
      expected_version: 5,
      reason: 'Leiðrétta þarf fylgiskjal',
    }))
  })
})
