import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BookkeepingDashboardView,
  BookkeepingEntity,
  BookkeepingPeriod,
  BookkeepingPeriodDashboardSummary,
  BookkeepingVatRegistration,
} from '@/lib/bookkeeping/types'

const { mockAddRegistration, mockCreateEntity, mockCreatePeriod, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockAddRegistration: vi.fn(),
  mockCreateEntity: vi.fn(),
  mockCreatePeriod: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...props }: {
    href: string
    children: React.ReactNode
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void
    [key: string]: unknown
  }) => React.createElement('a', {
    href,
    ...props,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      onClick?.(event)
    },
  }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'intro': 'VSK-vinnubók fyrir handvirk skil.',
  'dashboard.emptyTitle': 'Stofna VSK-vinnubók',
  'dashboard.emptyBody': 'Byrjaðu á einingu og VSK-númeri.',
  'dashboard.workspaces': 'Vinnubækurnar þínar',
  'dashboard.entityUnconfirmed': 'Upplýsingar óstaðfestar',
  'dashboard.noRegistrations': 'Ekkert VSK-númer.',
  'dashboard.vatRegistrations': 'VSK-skráning',
  'dashboard.newVatRegistration': 'Bæta við VSK-númeri',
  'dashboard.inactiveRegistration': 'Óvirkt',
  'dashboard.noPeriods': 'Ekkert tímabil.',
  'dashboard.openingPeriod': 'Opna...',
  'dashboard.anotherWorkspace': 'Bæta við vinnubók',
  'entityForm.title': 'Upplýsingar um vinnubókina',
  'workspaceDisclaimer': 'Þetta stofnar vinnusvæði í Teskeið. Það stofnar hvorki fyrirtæki né VSK-skráningu hjá Skattinum.',
  'entityForm.displayName': 'Heiti í Teskeið',
  'entityForm.displayNamePlaceholder': 'Dæmi ehf.',
  'entityForm.legalName': 'Lögheiti',
  'entityForm.legalNamePlaceholder': 'Dæmi ehf.',
  'entityForm.legalIdentifier': 'Kennitala',
  'entityForm.legalIdentifierPlaceholder': '000000-0000',
  'entityForm.privacyHint': 'Kennitalan er viðkvæm og aðeins sýnileg þér.',
  'entityForm.vatTitle': 'VSK-skráning',
  'entityForm.vatNumber': 'VSK-númer',
  'entityForm.vatNumberPlaceholder': 'VSK-númer',
  'entityForm.vatLabel': 'Heiti VSK-númers',
  'entityForm.vatLabelPlaceholder': 'Aðalstarfsemi',
  'entityForm.filingMethod': 'Uppgjörsaðferð',
  'entityForm.confirmed': 'Ég hef borið upplýsingarnar saman við skattur.is.',
  'entityForm.create': 'Stofna VSK-vinnubók',
  'entityForm.creating': 'Stofna...',
  'periodForm.title': 'Stofna VSK-tímabil',
  'periodForm.registration': 'VSK-skráning',
  'periodForm.registrationOption': '{entity}: {vatNumber}',
  'periodForm.registrationOptionWithLabel': '{entity}: {vatNumber} · {label}',
  'periodForm.startsOn': 'Frá',
  'periodForm.endsOn': 'Til',
  'periodForm.dueOn': 'Gjalddagi',
  'periodForm.suggested': 'Síðasta lokna tveggja mánaða tímabil er forstillt.',
  'periodForm.confirmed': 'Ég hef staðfest VSK-númer, uppgjörsaðferð og tímabil á skattur.is.',
  'periodForm.create': 'Stofna tímabil',
  'periodForm.creating': 'Stofna...',
  'period.vatNumber': 'VSK-númer {number}',
  'period.dueOn': 'Gjalddagi {date}',
  'common.open': 'Opna',
  'common.save': 'Vista',
  'common.saving': 'Vista...',
  'filingMethods.general_bimonthly': 'Almennt tveggja mánaða uppgjör',
  'filingMethods.monthly': 'Mánaðarlegt uppgjör',
  'filingMethods.annual': 'Ársuppgjör',
  'filingMethods.agricultural': 'Landbúnaðaruppgjör',
  'filingMethods.other': 'Annað',
  'periodStates.draft': 'Drög',
  'common.optional': 'Valfrjálst',
  'common.datePlaceholder': 'Veldu dagsetningu',
  'errors.invalid_input': 'Farðu yfir upplýsingarnar.',
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
  addBookkeepingVatRegistration: mockAddRegistration,
  createBookkeepingEntity: mockCreateEntity,
  createBookkeepingPeriod: mockCreatePeriod,
}))

import { BookkeepingDashboard } from '@/components/bookkeeping/BookkeepingDashboard'
import { BookkeepingVatRegistrationForm } from '@/components/bookkeeping/BookkeepingEntityForm'
import { getPreviousCompletedBimonthlyPeriod } from '@/components/bookkeeping/BookkeepingPeriodForm'

function entity(overrides: Partial<BookkeepingEntity> = {}): BookkeepingEntity {
  return {
    id: 'entity-1',
    ownerUserId: 'user-1',
    displayName: 'Prófun ehf.',
    legalName: 'Prófun ehf.',
    legalIdentifier: null,
    defaultCurrency: 'ISK',
    detailsConfirmed: true,
    createdAt: '2026-08-04T09:00:00.000Z',
    updatedAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
}

function registration(overrides: Partial<BookkeepingVatRegistration> = {}): BookkeepingVatRegistration {
  return {
    id: 'registration-1',
    entityId: 'entity-1',
    vatNumber: '123456',
    label: 'Aðalstarfsemi',
    filingMethod: 'general_bimonthly',
    detailsConfirmed: true,
    active: true,
    createdAt: '2026-08-04T09:00:00.000Z',
    updatedAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
}

function period(overrides: Partial<BookkeepingPeriod> = {}): BookkeepingPeriod {
  return {
    id: 'period-1',
    entityId: 'entity-1',
    vatRegistrationId: 'registration-1',
    startsOn: '2026-03-01',
    endsOn: '2026-04-30',
    dueOn: '2026-06-05',
    state: 'draft',
    periodDatesConfirmed: true,
    liveFormCompared: false,
    version: 1,
    submittedAt: null,
    reopenedAt: null,
    reopenReason: null,
    createdAt: '2026-08-04T09:00:00.000Z',
    updatedAt: '2026-08-04T09:00:00.000Z',
    ...overrides,
  }
}

function periodSummary(
  periodOverrides: Partial<BookkeepingPeriod> = {},
): BookkeepingPeriodDashboardSummary {
  const summaryPeriod = period(periodOverrides)
  return {
    period: summaryPeriod,
    entryCount: 0,
    summary: {
      currency: 'ISK',
      fields: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
      outputVat24Minor: 0,
      outputVat11Minor: 0,
      inputVat24Minor: 0,
      inputVat11Minor: 0,
      traces: { A: [], B: [], C: [], D: [], E: [], F: [] },
    },
    readiness: { isReady: false, blockers: [], blockerCounts: {} },
    filing: null,
  }
}

function dashboard(overrides: Partial<BookkeepingDashboardView> = {}): BookkeepingDashboardView {
  return {
    entities: [{ entity: entity(), registrations: [registration()], periods: [periodSummary()] }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateEntity.mockResolvedValue({ ok: true, data: entity() })
  mockAddRegistration.mockResolvedValue({ ok: true, data: registration({ id: 'registration-new' }) })
  mockCreatePeriod.mockResolvedValue({
    ok: true,
    data: { periodId: 'period-new' },
  })
})

describe('Bookkeeping dashboard onboarding', () => {
  it('makes the legal boundary explicit and creates an entity with its first registration', async () => {
    render(<BookkeepingDashboard dashboard={{ entities: [] }} referenceDate="2026-08-04" />)

    expect(screen.getByText(
      'Þetta stofnar vinnusvæði í Teskeið. Það stofnar hvorki fyrirtæki né VSK-skráningu hjá Skattinum.',
    )).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Heiti í Teskeið'), { target: { value: 'Prófun ehf.' } })
    fireEvent.change(screen.getByLabelText(/^Lögheiti/), { target: { value: 'Prófun rekstur ehf.' } })
    fireEvent.change(screen.getByLabelText('Kennitala'), { target: { value: '000000-0000' } })
    fireEvent.change(screen.getByLabelText('VSK-númer'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText(/^Heiti VSK-númers/), { target: { value: 'Aðalstarfsemi' } })
    fireEvent.click(screen.getByLabelText('Ég hef borið upplýsingarnar saman við skattur.is.'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stofna VSK-vinnubók' }))
    })

    await waitFor(() => expect(mockCreateEntity).toHaveBeenCalledTimes(1))
    expect(mockCreateEntity).toHaveBeenCalledWith({
      request_id: expect.any(String),
      display_name: 'Prófun ehf.',
      legal_name: 'Prófun rekstur ehf.',
      legal_identifier: '000000-0000',
      default_currency: 'ISK',
      details_confirmed: true,
      vat_registration: {
        vat_number: '123456',
        label: 'Aðalstarfsemi',
        filing_method: 'general_bimonthly',
        details_confirmed: true,
      },
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps all entered values when the server rejects the entity', async () => {
    mockCreateEntity.mockResolvedValue({
      ok: false,
      error: { code: 'invalid_input', message: 'errors.invalid_input' },
    })
    render(<BookkeepingDashboard dashboard={{ entities: [] }} referenceDate="2026-08-04" />)

    fireEvent.change(screen.getByLabelText('Heiti í Teskeið'), { target: { value: 'Óvistuð eining' } })
    fireEvent.change(screen.getByLabelText('Kennitala'), { target: { value: '000000-0000' } })
    fireEvent.change(screen.getByLabelText('VSK-númer'), { target: { value: '654321' } })
    fireEvent.click(screen.getByLabelText('Ég hef borið upplýsingarnar saman við skattur.is.'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stofna VSK-vinnubók' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Farðu yfir upplýsingarnar.')
    expect(screen.getByLabelText('Heiti í Teskeið')).toHaveValue('Óvistuð eining')
    expect(screen.getByLabelText('VSK-númer')).toHaveValue('654321')
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('keeps entity input and shows a local alert when transport rejects', async () => {
    mockCreateEntity.mockRejectedValueOnce(new Error('network unavailable'))
    render(<BookkeepingDashboard dashboard={{ entities: [] }} referenceDate="2026-08-04" />)

    fireEvent.change(screen.getByLabelText('Heiti í Teskeið'), { target: { value: 'Óvistuð eining' } })
    fireEvent.change(screen.getByLabelText('Kennitala'), { target: { value: '000000-0000' } })
    fireEvent.change(screen.getByLabelText('VSK-númer'), { target: { value: '654321' } })
    fireEvent.click(screen.getByLabelText('Ég hef borið upplýsingarnar saman við skattur.is.'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stofna VSK-vinnubók' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ekki tókst að vista. Reyndu aftur.',
    )
    expect(screen.getByLabelText('Heiti í Teskeið')).toHaveValue('Óvistuð eining')
    expect(screen.getByLabelText('VSK-númer')).toHaveValue('654321')
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('adds another VAT registration to an existing entity', async () => {
    render(<BookkeepingVatRegistrationForm entityId="entity-1" />)

    fireEvent.change(screen.getByLabelText('VSK-númer'), { target: { value: '987654' } })
    fireEvent.change(screen.getByLabelText(/^Heiti VSK-númers/), { target: { value: 'Önnur starfsemi' } })
    fireEvent.click(screen.getByLabelText('Ég hef borið upplýsingarnar saman við skattur.is.'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vista' }))
    })

    await waitFor(() => expect(mockAddRegistration).toHaveBeenCalledTimes(1))
    expect(mockAddRegistration).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      vat_number: '987654',
      label: 'Önnur starfsemi',
      filing_method: 'general_bimonthly',
      details_confirmed: true,
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('Bookkeeping period defaults and navigation', () => {
  it('derives May-June from an August reference date without hardcoding that period', () => {
    expect(getPreviousCompletedBimonthlyPeriod('2026-08-04')).toEqual({
      startsOn: '2026-05-01',
      endsOn: '2026-06-30',
      dueOn: '2026-08-05',
    })
    expect(getPreviousCompletedBimonthlyPeriod('2027-01-02')).toEqual({
      startsOn: '2026-11-01',
      endsOn: '2026-12-31',
      dueOn: '2027-02-05',
    })
  })

  it('lists existing periods and creates the prefilled May-June period after explicit confirmation', async () => {
    render(<BookkeepingDashboard dashboard={dashboard()} referenceDate="2026-08-04" />)

    const existingPeriodLink = screen.getByRole('link', {
      name: /1\. mars 2026 – 30\. apríl 2026/,
    })
    expect(existingPeriodLink).toHaveAttribute(
      'href',
      '/auth-mvp/bokhaldid/timabil/period-1',
    )
    fireEvent.click(existingPeriodLink)
    expect(screen.getByText('Opna...')).toBeInTheDocument()
    expect(screen.getByLabelText('Frá')).toHaveValue('2026-05-01')
    expect(screen.getByLabelText('Til')).toHaveValue('2026-06-30')
    expect(screen.getByLabelText('Gjalddagi')).toHaveValue('2026-08-05')

    fireEvent.click(screen.getByLabelText(
      'Ég hef staðfest VSK-númer, uppgjörsaðferð og tímabil á skattur.is.',
    ))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stofna tímabil' }))
    })

    await waitFor(() => expect(mockCreatePeriod).toHaveBeenCalledTimes(1))
    expect(mockCreatePeriod).toHaveBeenCalledWith({
      request_id: expect.any(String),
      entity_id: 'entity-1',
      vat_registration_id: 'registration-1',
      filing_method: 'general_bimonthly',
      starts_on: '2026-05-01',
      ends_on: '2026-06-30',
      due_on: '2026-08-05',
      period_dates_confirmed: true,
    })
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/bokhaldid/timabil/period-new')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('keeps period dates and shows a local alert when transport rejects', async () => {
    mockCreatePeriod.mockRejectedValueOnce(new Error('network unavailable'))
    render(<BookkeepingDashboard dashboard={dashboard()} referenceDate="2026-08-04" />)

    fireEvent.click(screen.getByLabelText(
      'Ég hef staðfest VSK-númer, uppgjörsaðferð og tímabil á skattur.is.',
    ))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stofna tímabil' }))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ekki tókst að vista. Reyndu aftur.',
    )
    expect(screen.getByLabelText('Frá')).toHaveValue('2026-05-01')
    expect(screen.getByLabelText('Til')).toHaveValue('2026-06-30')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders multiple registrations without exposing the legal identifier', () => {
    const privateIdentifier = '111111-1111'
    const secondRegistration = registration({
      id: 'registration-2',
      vatNumber: '987654',
      label: 'Önnur starfsemi',
    })
    const view = dashboard({
      entities: [{
        entity: entity({ legalIdentifier: privateIdentifier }),
        registrations: [registration(), secondRegistration],
        periods: [periodSummary()],
      }],
    })

    const { container } = render(
      <BookkeepingDashboard dashboard={view} referenceDate="2026-08-04" />,
    )

    expect(screen.getByText('VSK-númer 123456')).toBeInTheDocument()
    expect(screen.getByText('VSK-númer 987654')).toBeInTheDocument()
    expect(container.textContent).not.toContain(privateIdentifier)
  })
})
