import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExpensePaymentProfileV2View,
  ExpenseRepaymentView,
} from '@/lib/expenses/contracts'

const {
  mockPush,
  mockRefresh,
  mockSaveProfile,
  mockClearProfile,
  mockTransitionRepayment,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockSaveProfile: vi.fn(),
  mockClearProfile: vi.fn(),
  mockTransitionRepayment: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const translations: Record<string, string> = {
  'common.optional': 'Valfrjálst',
  'common.amount': 'Upphæð',
  'preferences.intro': 'Skráðu hvernig þú vilt fá endurgreitt.',
  'preferences.simpleIntro': 'Skráðu eina greiðsluleið.',
  'preferences.bankAccount': 'Bankareikningur',
  'preferences.bank': 'Banki',
  'preferences.ledger': 'Höfuðbók',
  'preferences.account': 'Reikningsnúmer',
  'preferences.accountFormat': '0000-00-000000',
  'preferences.nationalIdFormat': '000000-0000',
  'preferences.other': 'Annað',
  'preferences.otherHint': 'Leiðbeiningar.',
  'preferences.debtorsCanSee': 'Þeir sem skulda þér fá að sjá upplýsingarnar.',
  'preferences.encryptedAtRest': 'Greiðsluupplýsingarnar eru dulkóðaðar við vistun.',
  'preferences.savedSimple': 'Greiðsluleiðin var vistuð.',
  'preferences.storageUnavailable': 'SQL107 vantar.',
  'preferences.cryptoUnavailable': 'Lykil vantar.',
  'preferences.decryptFailed': 'Afkóðun mistókst.',
  'preferences.legacyTitle': 'Eldri greiðsluleiðir',
  'preferences.legacyMultiple': 'Fleiri en ein eldri leið.',
  'preferences.legacyReenter': 'Endurvistaðu leiðina.',
  'preferences.invalidProfile': 'Ógild greiðsluleið.',
  'preferences.clear': 'Hreinsa greiðsluleið',
  'preferences.clearConfirm': 'Hreinsa?',
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
  saveExpensePaymentProfileV2: mockSaveProfile,
  clearExpensePaymentProfileV2: mockClearProfile,
  transitionExpenseRepayment: mockTransitionRepayment,
}))

import { ExpensePaymentPreferences } from '@/components/expenses/ExpensePaymentPreferences'
import { ExpensePaymentDetails } from '@/components/expenses/ExpensePaymentDetails'
import { ExpenseRepaymentActions } from '@/components/expenses/ExpenseRepaymentActions'

function paymentProfile(
  overrides: Partial<ExpensePaymentProfileV2View> = {},
): ExpensePaymentProfileV2View {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    version: 7,
    details: { bank: '0159', ledger: '26', account: '123456', nationalId: '0101809999', other: 'Kvittun' },
    storageReady: true,
    cryptoReady: true,
    decryptFailed: false,
    legacyActiveCount: 0,
    legacySnapshotCount: 0,
    legacyNeedsChoice: false,
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
  mockSaveProfile.mockResolvedValue({ ok: true, data: { profileId: '11111111-1111-4111-8111-111111111111', version: 8 } })
  mockClearProfile.mockResolvedValue({ ok: true })
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

describe('ExpensePaymentPreferences encrypted profile', () => {
  it('shows the single profile and formats bank and national ID previews', () => {
    render(<ExpensePaymentPreferences profile={paymentProfile()} />)
    expect(screen.getByText('0159-26-123456')).toBeInTheDocument()
    expect(screen.getByDisplayValue('010180-9999')).toBeInTheDocument()
    expect(screen.getByText('Greiðsluupplýsingarnar eru dulkóðaðar við vistun.')).toBeInTheDocument()
  })

  it('submits normalized profile fields with CAS', async () => {
    render(<ExpensePaymentPreferences profile={paymentProfile()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Vista greiðsluleið' })) })
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledTimes(1))
    expect(mockSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: '11111111-1111-4111-8111-111111111111',
      expected_version: 7,
      bank: '0159', ledger: '26', account: '123456', national_id: '0101809999', other: 'Kvittun',
      request_id: expect.any(String),
    }))
    expect(mockPush).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
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
