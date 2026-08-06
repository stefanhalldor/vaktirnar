import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExpensePaymentPreferenceView,
  ExpenseRepaymentView,
} from '@/lib/expenses/contracts'

const {
  mockDeactivatePreference,
  mockPush,
  mockRefresh,
  mockSavePreference,
  mockTransitionRepayment,
} = vi.hoisted(() => ({
  mockDeactivatePreference: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockSavePreference: vi.fn(),
  mockTransitionRepayment: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'common.optional': 'Valfrjálst',
  'common.amount': 'Upphæð',
  'preferences.intro': 'Skráðu hvernig þú vilt fá endurgreitt.',
  'preferences.new': 'Ný greiðsluleið',
  'preferences.edit': 'Breyta greiðsluleið',
  'preferences.name': 'Heiti',
  'preferences.kind': 'Tegund',
  'preferences.kindBank': 'Bankareikningur',
  'preferences.kindPhone': 'Greiðsluapp eða sími',
  'preferences.kindLink': 'Greiðsluslóð',
  'preferences.kindCash': 'Reiðufé',
  'preferences.kindOther': 'Annað',
  'preferences.accountNumber': 'Reikningsnúmer',
  'preferences.nationalId': 'Kennitala',
  'preferences.reference': 'Sjálfgefin skýring',
  'preferences.instructions': 'Leiðbeiningar',
  'preferences.currencies': 'Gjaldmiðlar',
  'preferences.allCurrencies': 'Allir studdir gjaldmiðlar',
  'preferences.visibility': 'Hver má sjá upplýsingarnar?',
  'preferences.private': 'Aðeins ég',
  'preferences.debtContext': 'Sá sem skuldar mér í þessu uppgjöri',
  'preferences.scope': 'Forgangur',
  'preferences.scopeGeneral': 'Almennt',
  'preferences.scopeCurrency': 'Fyrir gjaldmiðil',
  'preferences.scopeGroup': 'Fyrir hóp og gjaldmiðil',
  'preferences.save': 'Vista greiðsluleið',
  'preferences.saving': 'Vista...',
  'preferences.cancelEdit': 'Hætta við breytingu',
  'preferences.saved': 'Vistaðar greiðsluleiðir',
  'preferences.detailsMasked': 'Nákvæmar upplýsingar birtast aðeins eigandanum við breytingu og í heimiluðu uppgjörssamhengi.',
  'preferences.deactivate': 'Gera óvirka',
  'preferences.deactivating': 'Geri óvirka...',
  'preferences.snapshotHint': 'Eldri snapshots breytast ekki.',
  'repayment.confirm': 'Staðfesta móttöku',
  'repayment.confirming': 'Staðfesti...',
  'repayment.confirmConfirm': 'Staðfestir þú að greiðslan hafi borist?',
  'repayment.reject': 'Hafna greiðslu',
  'repayment.rejecting': 'Hafna...',
  'repayment.rejectConfirm': 'Viltu hafna þessari greiðslutilkynningu?',
  'repayment.cancel': 'Afturkalla tilkynningu',
  'repayment.cancelling': 'Afturkalla...',
  'repayment.cancelConfirm': 'Viltu afturkalla greiðslutilkynninguna?',
  'repayment.currentPaymentDetailsHidden': 'Viðtakandi hefur ekki deilt greiðsluupplýsingum fyrir þetta uppgjör.',
  'repayment.currentPaymentDetailsHint': 'Þetta er núverandi greiðsluleið viðtakanda fyrir þetta uppgjör.',
  'repayment.copy': 'Afrita',
  'repayment.copied': 'Afritað',
  'repayment.copyValue': 'Afrita {label}',
  'repayment.copyFailed': 'Ekki tókst að afrita.',
  'errors.save_failed': 'Ekki tókst að vista. Reyndu aftur.',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}))

vi.mock('@/lib/expenses/actions', () => ({
  deactivateExpensePaymentPreference: mockDeactivatePreference,
  saveExpensePaymentPreference: mockSavePreference,
  transitionExpenseRepayment: mockTransitionRepayment,
}))

import { ExpensePaymentPreferences } from '@/components/expenses/ExpensePaymentPreferences'
import { ExpensePaymentDetails } from '@/components/expenses/ExpensePaymentDetails'
import { ExpenseRepaymentActions } from '@/components/expenses/ExpenseRepaymentActions'

function paymentPreference(
  overrides: Partial<ExpensePaymentPreferenceView> = {},
): ExpensePaymentPreferenceView {
  return {
    id: 'preference-owner-1',
    title: 'Aðalreikningur',
    kind: 'bank_account',
    supportedCurrencies: ['ISK', 'EUR'],
    details: {
      accountNumber: '0159-26-123456',
      nationalId: '010180-9999',
      instructions: 'Setja Kvittun í skýringu',
      defaultReference: 'Kvittun',
      // Deliberately stale/irrelevant for this kind. It must not be re-saved.
      phoneNumber: '+354 555 0101',
    },
    visibility: 'private',
    version: 7,
    active: true,
    assignments: [{ scopeType: 'currency', currency: 'ISK', groupId: null }],
    ...overrides,
  }
}

function repayment(overrides: Partial<ExpenseRepaymentView> = {}): ExpenseRepaymentView {
  return {
    id: 'repayment-1',
    obligationId: 'obligation-1',
    groupId: 'group-1',
    fromMemberId: 'member-from',
    fromDisplayName: 'Anna',
    toMemberId: 'member-to',
    toDisplayName: 'Bjarni',
    amountMinor: 5_000,
    currency: 'ISK',
    occurredOn: '2026-08-04',
    note: null,
    status: 'reported',
    createdAt: '2026-08-04T11:00:00.000Z',
    canConfirm: false,
    canReject: false,
    canCancel: false,
    requiresReview: false,
    paymentSnapshot: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSavePreference.mockResolvedValue({
    ok: true,
    data: { preferenceId: 'preference-owner-1' },
  })
  mockDeactivatePreference.mockResolvedValue({ ok: true })
  mockTransitionRepayment.mockResolvedValue({ ok: true })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe('ExpensePaymentDetails before outside payment', () => {
  it('shows and copies an authorized current payment instruction', async () => {
    render(<ExpensePaymentDetails mode="current" amount={{ display: '12.345 kr.', copy: '12345' }} snapshot={{
      title: 'Aðalreikningur',
      kind: 'bank_account',
      currency: 'ISK',
      details: { accountNumber: '0159-26-123456' },
      visibility: 'debt_context',
      capturedAt: '2026-08-04T12:00:00.000Z',
    }} />)

    expect(screen.getByText('0159-26-123456')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Afrita Upphæð' }))
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('12345')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Afrita Reikningsnúmer' }))
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0159-26-123456')
    expect(screen.getByRole('button', { name: 'Afrita Reikningsnúmer' })).toHaveTextContent('Afritað')
  })

  it('fails closed with a clear message when no instruction is authorized', () => {
    render(<ExpensePaymentDetails mode="current" snapshot={null} />)
    expect(screen.getByText('Viðtakandi hefur ekki deilt greiðsluupplýsingum fyrir þetta uppgjör.')).toBeInTheDocument()
  })
})

describe('ExpensePaymentPreferences owner-only detail handling', () => {
  it('keeps saved detail values masked until the owner explicitly opens edit', () => {
    const preference = paymentPreference()
    const { container } = render(
      <ExpensePaymentPreferences preferences={[preference]} groups={[]} />,
    )

    expect(screen.getByText('Aðalreikningur')).toBeInTheDocument()
    expect(screen.getByText('Nákvæmar upplýsingar birtast aðeins eigandanum við breytingu og í heimiluðu uppgjörssamhengi.')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('0159-26-123456')).toBeNull()
    expect(screen.queryByDisplayValue('010180-9999')).toBeNull()
    expect(container.textContent).not.toContain('0159-26-123456')
    expect(container.textContent).not.toContain('010180-9999')

    fireEvent.click(screen.getByRole('button', { name: 'Breyta greiðsluleið' }))

    expect(screen.getByRole('textbox', { name: 'Reikningsnúmer' })).toHaveValue('0159-26-123456')
    expect(screen.getByRole('textbox', { name: /Kennitala/ })).toHaveValue('010180-9999')
  })

  it('offers only private and debt-context visibility choices', () => {
    render(<ExpensePaymentPreferences preferences={[]} groups={[]} />)

    const visibility = screen.getByRole('combobox', { name: 'Hver má sjá upplýsingarnar?' })
    const options = within(visibility).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options.map((option) => option.getAttribute('value'))).toEqual(['private', 'debt_context'])
    expect(within(visibility).getByRole('option', { name: 'Aðeins ég' })).toBeInTheDocument()
    expect(within(visibility).getByRole('option', { name: 'Sá sem skuldar mér í þessu uppgjöri' })).toBeInTheDocument()
  })

  it('submits owner edits with the preference id, expected-version CAS and kind-safe details', async () => {
    render(<ExpensePaymentPreferences preferences={[paymentPreference()]} groups={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Breyta greiðsluleið' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Heiti' }), {
      target: { value: 'Uppfærður reikningur' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Hver má sjá upplýsingarnar?' }), {
      target: { value: 'debt_context' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vista greiðsluleið' }))
    })

    await waitFor(() => expect(mockSavePreference).toHaveBeenCalledTimes(1))
    expect(mockSavePreference).toHaveBeenCalledWith({
      preference_id: 'preference-owner-1',
      expected_version: 7,
      request_id: expect.any(String),
      title: 'Uppfærður reikningur',
      kind: 'bank_account',
      supported_currencies: ['ISK', 'EUR'],
      details: {
        accountNumber: '0159-26-123456',
        nationalId: '010180-9999',
        instructions: 'Setja Kvittun í skýringu',
        defaultReference: 'Kvittun',
      },
      visibility: 'debt_context',
      assignment: { scope_type: 'currency', currency: 'ISK' },
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('ExpenseRepaymentActions server-derived capabilities', () => {
  it('shows confirm/reject only when those capabilities are granted', () => {
    render(<ExpenseRepaymentActions repayment={repayment({ canConfirm: true, canReject: true })} />)

    expect(screen.getByRole('button', { name: 'Staðfesta móttöku' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hafna greiðslu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Afturkalla tilkynningu' })).toBeNull()
  })

  it('shows cancel alone for a repayment the current actor may retract', () => {
    render(<ExpenseRepaymentActions repayment={repayment({ canCancel: true })} />)

    expect(screen.getByRole('button', { name: 'Afturkalla tilkynningu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Staðfesta móttöku' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hafna greiðslu' })).toBeNull()
  })

  it('renders no action surface when every server-derived capability is false', () => {
    const { container } = render(<ExpenseRepaymentActions repayment={repayment()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['confirm', 'Staðfesta móttöku', { canConfirm: true }],
    ['reject', 'Hafna greiðslu', { canReject: true }],
    ['cancel', 'Afturkalla tilkynningu', { canCancel: true }],
  ] as const)('submits the authorized %s transition after confirmation', async (action, label, capabilities) => {
    render(<ExpenseRepaymentActions repayment={repayment(capabilities)} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }))
    })

    await waitFor(() => expect(mockTransitionRepayment).toHaveBeenCalledTimes(1))
    expect(mockTransitionRepayment).toHaveBeenCalledWith({
      repayment_id: 'repayment-1',
      action,
      request_id: expect.any(String),
    })
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('reuses the request id when the same failed transition is retried', async () => {
    mockTransitionRepayment
      .mockResolvedValueOnce({ ok: false, error: 'save_failed' })
      .mockResolvedValueOnce({ ok: true })
    render(<ExpenseRepaymentActions repayment={repayment({ canConfirm: true })} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Staðfesta móttöku' }))
    })
    await waitFor(() => expect(mockTransitionRepayment).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Staðfesta móttöku' }))
    })
    await waitFor(() => expect(mockTransitionRepayment).toHaveBeenCalledTimes(2))

    const firstRequestId = mockTransitionRepayment.mock.calls[0]?.[0].request_id
    const retryRequestId = mockTransitionRepayment.mock.calls[1]?.[0].request_id
    expect(retryRequestId).toBe(firstRequestId)
  })

  it('rotates the request id when the user changes the transition after a failure', async () => {
    mockTransitionRepayment
      .mockResolvedValueOnce({ ok: false, error: 'save_failed' })
      .mockResolvedValueOnce({ ok: true })
    render(
      <ExpenseRepaymentActions repayment={repayment({ canConfirm: true, canReject: true })} />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Staðfesta móttöku' }))
    })
    await waitFor(() => expect(mockTransitionRepayment).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hafna greiðslu' }))
    })
    await waitFor(() => expect(mockTransitionRepayment).toHaveBeenCalledTimes(2))

    const firstRequestId = mockTransitionRepayment.mock.calls[0]?.[0].request_id
    const changedRequestId = mockTransitionRepayment.mock.calls[1]?.[0].request_id
    expect(changedRequestId).not.toBe(firstRequestId)
  })
})
