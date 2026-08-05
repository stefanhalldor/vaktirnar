import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookkeepingPeriod } from '@/lib/bookkeeping/types'

const {
  mockForPayload,
  mockPush,
  mockSaveEntry,
  mockSucceeded,
} = vi.hoisted(() => ({
  mockForPayload: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
  mockPush: vi.fn(),
  mockSaveEntry: vi.fn(),
  mockSucceeded: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const translations: Record<string, string> = {
  'entryForm.type': 'Tegund færslu',
  'entryForm.documentDate': 'Dagsetning fylgiskjals',
  'entryForm.reportingDate': 'Dagsetning í VSK-tímabili',
  'entryForm.syncReportingDatePrompt': 'Viltu líka breyta dagsetningu í VSK-tímabili í {date}?',
  'entryForm.syncDocumentDatePrompt': 'Viltu líka breyta dagsetningu fylgiskjals í {date}?',
  'entryForm.syncDate': 'Já, samstilla',
  'entryForm.keepDate': 'Nei, halda óbreyttri',
  'entryForm.counterparty': 'Viðskiptavinur eða seljandi',
  'entryForm.counterpartyPlaceholder': 'Nafn mótaðila',
  'entryForm.description': 'Lýsing',
  'entryForm.descriptionPlaceholder': 'Hvað var selt eða keypt?',
  'entryForm.documentType': 'Tegund fylgiskjals',
  'entryForm.documentReference': 'Fylgiskjalsnúmer',
  'entryForm.documentReferencePlaceholder': 'Númer eða örugg tilvísun',
  'entryForm.duplicateReferenceConfirmed': 'Ég hef staðfest mögulega tvítekningu.',
  'entryForm.reviewState': 'Yfirferðarstaða',
  'entryForm.source': 'Uppruni: handvirk skráning',
  'entryForm.lines': 'VSK-línur',
  'entryForm.line': 'Lína {number}',
  'entryForm.addLine': 'Bæta við VSK-línu',
  'entryForm.removeLine': 'Fjarlægja línu {number}',
  'entryForm.category': 'Bókhaldsflokkur',
  'entryForm.lineDescription': 'Lýsing línu',
  'entryForm.vatTreatment': 'VSK meðferð',
  'entryForm.amountIncludesVat': 'Fjárhæð inniheldur VSK',
  'entryForm.amount': 'Fjárhæð',
  'entryForm.gross': 'Heild með VSK',
  'entryForm.net': 'Án VSK',
  'entryForm.vat': 'VSK fjárhæð',
  'entryForm.manualOverride': 'Nota fjárhæðir af fylgiskjali í stað sjálfvirkrar tillögu',
  'entryForm.overrideReason': 'Skýring á handvirkri leiðréttingu',
  'entryForm.deductibility': 'Frádráttarbær innskattur',
  'entryForm.deductibleVat': 'Frádráttarbær VSK fjárhæð',
  'entryForm.exemptConfirmed': 'Ég staðfesti að þetta sé undanþegin velta sem á heima í reit C.',
  'entryForm.calculationHint': 'Tillagan er aðeins hjálp.',
  'entryForm.evidenceTitle': 'Fylgiskjal og innskattur',
  'entryForm.documentRetained': 'Ég varðveiti fullnægjandi frumgagn eða rafrænt fylgiskjal.',
  'entryForm.businessPurpose': 'Útgjald tengist skattskyldum rekstri.',
  'entryForm.sellerVatRegistered': 'Seljandi var VSK-skráður þegar viðskiptin fóru fram.',
  'entryForm.specialCasesTitle': 'Sértilvik',
  'entryForm.specialCaseHint': 'Sértilvik blokka VSK skil.',
  'entryForm.foreignService': 'Erlend þjónusta',
  'entryForm.importedGoods': 'Innflutningur',
  'entryForm.mixedUse': 'Blönduð rekstrar- og einkanotkun',
  'entryForm.uncertainDeductibility': 'Óviss frádráttarbærni',
  'entryForm.specialCaseResolved': 'Sértilvik hefur verið yfirfarið og afgreitt.',
  'entryForm.specialCaseResolutionNote': 'Skýring á afgreiðslu sértilviks',
  'entryForm.create': 'Vista færslu',
  'entryForm.update': 'Vista breytingar',
  'entryForm.saveAndNext': 'Vista og bæta við næstu',
  'entryForm.saving': 'Vista...',
  'entryTypes.sale': 'Tekjur',
  'entryTypes.purchase': 'Útgjöld',
  'entryTypes.sales_credit': 'Kredit á tekjur',
  'entryTypes.purchase_credit': 'Kredit á útgjöld',
  'reviewStates.unreviewed': 'Óyfirfarin',
  'reviewStates.reviewed': 'Yfirfarin',
  'reviewStates.needs_review': 'Þarfnast skoðunar',
  'vatTreatments.taxable_24': '24% VSK',
  'vatTreatments.taxable_11': '11% VSK',
  'vatTreatments.exempt_turnover': 'Undanþegin velta, reitur C',
  'vatTreatments.outside_scope': 'Ekki velta',
  'vatTreatments.no_vat': 'Innkaup án VSK',
  'vatTreatments.needs_review': 'Þarfnast skoðunar',
  'deductibility.not_applicable': 'Á ekki við',
  'deductibility.fully_deductible': 'Já, að fullu',
  'deductibility.partially_deductible': 'Já, að hluta',
  'deductibility.not_deductible': 'Nei',
  'deductibility.needs_review': 'Þarfnast skoðunar',
  'common.optional': 'Valfrjálst',
  'common.datePlaceholder': 'Veldu dag',
  'common.note': 'Athugasemd',
  'common.cancel': 'Hætta við',
  'period.openingPeriod': 'Opna...',
  'errors.invalid_input': 'Athugaðu reitina og reyndu aftur.',
  'errors.unexpected_error': 'Ekki tókst að vista. Reyndu aftur.',
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

vi.mock('@/lib/bookkeeping/actions', () => ({
  saveBookkeepingEntry: mockSaveEntry,
}))

vi.mock('@/components/bookkeeping/request-id', () => ({
  useBookkeepingMutationRequestIds: () => ({
    forPayload: mockForPayload,
    succeeded: mockSucceeded,
  }),
}))

import { BookkeepingEntryForm } from '@/components/bookkeeping/BookkeepingEntryForm'

const period: BookkeepingPeriod = {
  id: 'period-1',
  entityId: 'entity-1',
  vatRegistrationId: 'registration-1',
  startsOn: '2026-05-01',
  endsOn: '2026-06-30',
  dueOn: '2026-08-05',
  state: 'draft',
  periodDatesConfirmed: true,
  liveFormCompared: false,
  version: 1,
  submittedAt: null,
  reopenedAt: null,
  reopenReason: null,
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
}

function formFor(periodValue: BookkeepingPeriod = period) {
  return (
    <BookkeepingEntryForm
      entityId="entity-1"
      registrationId="registration-1"
      period={periodValue}
      initialDate="2026-06-30"
    />
  )
}

function renderForm() {
  const result = render(formFor())
  fireEvent.change(screen.getByLabelText('Tegund færslu'), {
    target: { value: 'purchase' },
  })
  return result
}

function fillHeader(description = 'Prófunarfærsla') {
  fireEvent.change(screen.getByLabelText('Viðskiptavinur eða seljandi'), {
    target: { value: 'Prófun ehf.' },
  })
  fireEvent.change(screen.getByLabelText('Lýsing'), { target: { value: description } })
  fireEvent.change(screen.getByLabelText('Fylgiskjalsnúmer'), {
    target: { value: 'INV-100' },
  })
}

function setLine(
  index: number,
  treatment: 'taxable_24' | 'taxable_11',
  amount: string,
  deductibility: 'fully_deductible' | 'needs_review' = 'fully_deductible',
) {
  fireEvent.change(screen.getAllByLabelText('VSK meðferð')[index]!, {
    target: { value: treatment },
  })
  fireEvent.change(screen.getAllByLabelText('Fjárhæð')[index]!, {
    target: { value: amount },
  })
  fireEvent.change(screen.getAllByLabelText('Frádráttarbær innskattur')[index]!, {
    target: { value: deductibility },
  })
}

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockForPayload.mockReturnValue('11111111-1111-4111-8111-111111111111')
  mockSaveEntry.mockResolvedValue({
    ok: true,
    data: { periodId: 'period-1', entryId: 'entry-1', version: 1 },
  })
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true })
})

describe('BookkeepingEntryForm', () => {
  it('defaults a new entry to income', () => {
    render(formFor())
    expect(screen.getByLabelText('Tegund færslu')).toHaveValue('sale')
  })

  it('offers a reversible date sync in both directions', () => {
    render(formFor())
    const documentDate = screen.getByLabelText('Dagsetning fylgiskjals')
    const reportingDate = screen.getByLabelText('Dagsetning í VSK-tímabili')

    fireEvent.change(documentDate, { target: { value: '2026-06-15' } })
    expect(screen.getByText('Viltu líka breyta dagsetningu í VSK-tímabili í 15. júní 2026?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Já, samstilla' }))
    expect(reportingDate).toHaveValue('2026-06-15')

    fireEvent.change(reportingDate, { target: { value: '2026-06-20' } })
    expect(screen.getByText('Viltu líka breyta dagsetningu fylgiskjals í 20. júní 2026?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nei, halda óbreyttri' }))
    expect(documentDate).toHaveValue('2026-06-15')
    expect(reportingDate).toHaveValue('2026-06-20')
  })

  it('submits a canonical two-line purchase with exact 24% and 11% values', async () => {
    renderForm()
    fillHeader()
    fireEvent.change(screen.getByLabelText('Yfirferðarstaða'), {
      target: { value: 'reviewed' },
    })
    setLine(0, 'taxable_24', '124000')
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við VSK-línu' }))
    setLine(1, 'taxable_11', '111000')
    fireEvent.click(screen.getByLabelText(
      'Ég varðveiti fullnægjandi frumgagn eða rafrænt fylgiskjal.',
    ))
    fireEvent.click(screen.getByLabelText('Útgjald tengist skattskyldum rekstri.'))
    fireEvent.click(screen.getByLabelText(
      'Seljandi var VSK-skráður þegar viðskiptin fóru fram.',
    ))

    await clickButton('Vista færslu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    expect(mockSaveEntry).toHaveBeenCalledWith(expect.objectContaining({
      request_id: '11111111-1111-4111-8111-111111111111',
      entity_id: 'entity-1',
      vat_registration_id: 'registration-1',
      period_id: 'period-1',
      type: 'purchase',
      document_date: '2026-06-30',
      reporting_date: '2026-06-30',
      counterparty: 'Prófun ehf.',
      description: 'Prófunarfærsla',
      document_reference: 'INV-100',
      review_state: 'reviewed',
      original_document_preserved: true,
      business_purpose_confirmed: true,
      seller_vat_registration_confirmed: true,
      lines: [
        expect.objectContaining({
          vat_treatment: 'taxable_24',
          amount_includes_vat: true,
          gross_minor: 124_000,
          net_minor: 100_000,
          vat_minor: 24_000,
          input_vat_deductibility: 'fully_deductible',
          deductible_vat_minor: 24_000,
        }),
        expect.objectContaining({
          vat_treatment: 'taxable_11',
          amount_includes_vat: true,
          gross_minor: 111_000,
          net_minor: 100_000,
          vat_minor: 11_000,
          input_vat_deductibility: 'fully_deductible',
          deductible_vat_minor: 11_000,
        }),
      ],
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/bokhaldid/timabil/period-1')
  })

  it('shows the automatic 24% suggestion and sends an explained manual override', async () => {
    renderForm()
    fillHeader('Sala með VSK leiðréttingu')
    fireEvent.change(screen.getByLabelText('Tegund færslu'), {
      target: { value: 'sale' },
    })
    fireEvent.change(screen.getByLabelText('VSK meðferð'), {
      target: { value: 'taxable_24' },
    })
    fireEvent.change(screen.getByLabelText('Fjárhæð'), { target: { value: '124000' } })

    expect(screen.getByText('100.000')).toBeInTheDocument()
    expect(screen.getByText('24.000')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(
      'Nota fjárhæðir af fylgiskjali í stað sjálfvirkrar tillögu',
    ))
    fireEvent.change(screen.getByLabelText('Án VSK'), { target: { value: '100001' } })
    fireEvent.change(screen.getByLabelText('VSK fjárhæð'), { target: { value: '23999' } })
    fireEvent.change(screen.getByLabelText('Skýring á handvirkri leiðréttingu'), {
      target: { value: 'Raunverulegur VSK á fylgiskjali' },
    })

    await clickButton('Vista færslu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    expect(mockSaveEntry.mock.calls[0]![0].lines[0]).toEqual(expect.objectContaining({
      gross_minor: 124_000,
      net_minor: 100_001,
      vat_minor: 23_999,
      manual_vat_override: true,
      manual_vat_override_reason: 'Raunverulegur VSK á fylgiskjali',
    }))
  })

  it('keeps fully deductible input VAT aligned with a manual VAT correction', async () => {
    renderForm()
    fillHeader('Innkaup með leiðréttri VSK fjárhæð')
    setLine(0, 'taxable_24', '124000')
    fireEvent.click(screen.getByLabelText(
      'Nota fjárhæðir af fylgiskjali í stað sjálfvirkrar tillögu',
    ))
    fireEvent.change(screen.getByLabelText('VSK fjárhæð'), { target: { value: '23000' } })
    fireEvent.change(screen.getByLabelText('Skýring á handvirkri leiðréttingu'), {
      target: { value: 'Samkvæmt fylgiskjali' },
    })

    await clickButton('Vista færslu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    expect(mockSaveEntry.mock.calls[0]![0].lines[0]).toEqual(expect.objectContaining({
      gross_minor: 123_000,
      net_minor: 100_000,
      vat_minor: 23_000,
      input_vat_deductibility: 'fully_deductible',
      deductible_vat_minor: 23_000,
      manual_vat_override: true,
      manual_vat_override_reason: 'Samkvæmt fylgiskjali',
    }))
  })

  it('clears an obsolete override reason when automatic calculation is restored', async () => {
    renderForm()
    fillHeader('Sjálfvirk tillaga endurheimt')
    setLine(0, 'taxable_24', '124000')
    fireEvent.click(screen.getByLabelText(
      'Nota fjárhæðir af fylgiskjali í stað sjálfvirkrar tillögu',
    ))
    fireEvent.change(screen.getByLabelText('Skýring á handvirkri leiðréttingu'), {
      target: { value: 'Á ekki lengur við' },
    })
    fireEvent.click(screen.getByLabelText('Fjárhæð inniheldur VSK'))

    await clickButton('Vista færslu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    expect(mockSaveEntry.mock.calls[0]![0].lines[0]).toEqual(expect.objectContaining({
      manual_vat_override: false,
      manual_vat_override_reason: null,
    }))
  })

  it('records explicit resolution of a selected special case', async () => {
    const user = userEvent.setup()
    renderForm()
    fillHeader('Erlend þjónusta')
    setLine(0, 'taxable_24', '124000', 'needs_review')
    await user.click(screen.getByLabelText('Erlend þjónusta'))
    expect(screen.getByLabelText('Erlend þjónusta')).toBeChecked()
    expect(screen.getByLabelText('Innflutningur')).not.toBeChecked()
    expect(screen.getByLabelText('Blönduð rekstrar- og einkanotkun')).not.toBeChecked()
    expect(screen.getByLabelText('Óviss frádráttarbærni')).not.toBeChecked()
    await user.click(screen.getByLabelText('Sértilvik hefur verið yfirfarið og afgreitt.'))
    fireEvent.change(screen.getByLabelText('Skýring á afgreiðslu sértilviks'), {
      target: { value: 'Yfirfarið með bókara' },
    })

    await clickButton('Vista færslu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    expect(mockSaveEntry).toHaveBeenCalledWith(expect.objectContaining({
      special_cases: {
        foreign_service: 'resolved',
        import: 'not_applicable',
        mixed_use: 'not_applicable',
        uncertain_deductibility: 'not_applicable',
      },
      special_case_resolution_note: 'Yfirfarið með bókara',
    }))
  })

  it('resets entry-specific fields after save-and-next succeeds', async () => {
    renderForm()
    fillHeader('Færsla sem var vistuð')
    setLine(0, 'taxable_24', '124000')

    await clickButton('Vista og bæta við næstu')

    await waitFor(() => expect(mockSaveEntry).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.getByLabelText('Viðskiptavinur eða seljandi')).toHaveValue('')
      expect(screen.getByLabelText('Lýsing')).toHaveValue('')
      expect(screen.getByLabelText('Fylgiskjalsnúmer')).toHaveValue('')
      expect(screen.getByLabelText('Fjárhæð')).toHaveValue('')
    })
    expect(mockSucceeded).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('retains all form data and shows the action error when save fails', async () => {
    mockSaveEntry.mockResolvedValue({
      ok: false,
      error: { code: 'unexpected_error', message: 'unexpected_error' },
    })
    renderForm()
    fillHeader('Óvistuð færsla')
    setLine(0, 'taxable_24', '124000')

    await clickButton('Vista færslu')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ekki tókst að vista. Reyndu aftur.',
    )
    expect(screen.getByLabelText('Viðskiptavinur eða seljandi')).toHaveValue('Prófun ehf.')
    expect(screen.getByLabelText('Lýsing')).toHaveValue('Óvistuð færsla')
    expect(screen.getByLabelText('Fylgiskjalsnúmer')).toHaveValue('INV-100')
    expect(screen.getByLabelText('Fjárhæð')).toHaveValue('124.000')
    expect(mockSucceeded).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('retains all form data and shows a local alert when transport rejects', async () => {
    mockSaveEntry.mockRejectedValueOnce(new Error('network unavailable'))
    renderForm()
    fillHeader('Óvistuð nettengingarfærsla')
    setLine(0, 'taxable_24', '124000')

    await clickButton('Vista færslu')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ekki tókst að vista. Reyndu aftur.',
    )
    expect(screen.getByLabelText('Lýsing')).toHaveValue('Óvistuð nettengingarfærsla')
    expect(screen.getByLabelText('Fjárhæð')).toHaveValue('124.000')
    expect(mockSucceeded).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('disables every editable VAT field when the period becomes ready', () => {
    const { rerender } = renderForm()
    setLine(0, 'taxable_24', '124000')
    fireEvent.click(screen.getByLabelText(
      'Nota fjárhæðir af fylgiskjali í stað sjálfvirkrar tillögu',
    ))
    fireEvent.change(screen.getByLabelText('Frádráttarbær innskattur'), {
      target: { value: 'partially_deductible' },
    })

    rerender(formFor({ ...period, state: 'ready', version: 2 }))

    expect(screen.getByLabelText('Án VSK')).toBeDisabled()
    expect(screen.getByLabelText('VSK fjárhæð')).toBeDisabled()
    expect(screen.getByLabelText('Skýring á handvirkri leiðréttingu')).toBeDisabled()
    expect(screen.getByLabelText('Frádráttarbær VSK fjárhæð')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vista færslu' })).toBeDisabled()
  })
})
