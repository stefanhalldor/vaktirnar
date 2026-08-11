import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ExpensePayAllContextView,
  ExpensePayAllCounterpartyView,
  ExpensePayAllPairContextView,
  ExpensePayAllView,
} from '@/lib/expenses/contracts'

const actionMocks = vi.hoisted(() => ({
  propose: vi.fn(),
  transition: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actionMocks.refresh }),
}))
vi.mock('@/lib/expenses/actions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/expenses/actions')>(),
  proposeExpenseSettlementBatch: actionMocks.propose,
  transitionExpenseSettlementBatch: actionMocks.transition,
}))

const translations: Record<string, string> = {
  'common.amount': 'Upphæð',
  'common.date': 'Dagsetning',
  'common.datePlaceholder': 'Veldu dagsetningu',
  'common.note': 'Athugasemd',
  'common.optional': 'valfrjálst',
  'preferences.title': 'Greiðsluleiðir',
  'preferences.accountNumber': 'Reikningsnúmer',
  'preferences.nationalId': 'Kennitala',
  'preferences.snapshotHint': 'Vistuð greiðsluleið.',
  'repayment.currentPaymentDetailsHidden': 'Viðtakandi á eftir að skrá greiðsluupplýsingarnar sínar í Teskeið.',
  'repayment.currentPaymentDetailsHint': 'Þetta er núverandi greiðsluleið viðtakanda í Teskeið.',
  'repayment.copy': 'Afrita',
  'repayment.copied': 'Afritað',
  'repayment.copyValue': 'Afrita {label}',
  'repayment.copyFailed': 'Ekki tókst að afrita.',
  'payAll.intro': 'Hér sérðu upphæðirnar og greiðsluupplýsingarnar.',
  'payAll.outsidePayment': 'Teskeið millifærir ekki peninga.',
  'payAll.payRecipient': 'Greiða {name}',
  'payAll.combinedPaymentCount': '{count} greiðslur til þessa aðila',
  'payAll.details': 'Nánar',
  'payAll.detailsTitle': 'Samhengi greiðslunnar',
  'payAll.detailsDescription': 'Þetta er það sem greiðslan til {name} gerir upp.',
  'payAll.pairDetailsTitle': 'Uppgjör við {name}',
  'payAll.pairDetailsDescription': 'Hér sérðu færslurnar í hvora átt.',
  'payAll.outgoingContexts': 'Það sem þú skuldar',
  'payAll.incomingContexts': 'Það sem þú átt inni',
  'payAll.closeDetails': 'Loka nánari upplýsingum',
  'payAll.groupContext': 'Hópur',
  'payAll.oneOffContext': 'Stök færsla',
  'payAll.openSettlement': 'Opna uppgjör',
  'payAll.openEntry': 'Nánar um færslu',
  'payAll.relatedEntries': 'Tengdar færslur',
  'payAll.nettingAdjustment': 'Jöfnun og fyrri greiðslur',
  'payAll.contextTotal': 'Samtals',
  'payAll.reportHint': 'Opnaðu uppgjörið og tilkynntu greiðsluna.',
  'payAll.markPaid': 'Greiða',
  'payAll.empty': 'Allt er uppgert 😊',
  'payAll.reviewTitle': 'Sum uppgjör þarfnast yfirferðar',
  'payAll.reviewBody': 'Opnaðu uppgjörið áður en þú greiðir.',
  'payAll.reviewContext': '{group}: greiðsla til {name}',
  'payAll.counterpartyPayerAmount': 'Útlagt fyrir þig',
  'payAll.counterpartyReceiverAmount': 'Þú átt inni',
  'payAll.counterpartyNetPayable': 'Til greiðslu',
  'payAll.counterpartyNetReceivable': 'Nettó inneign',
  'payAll.counterpartyNetAfterOffset': 'Eftir skuldajöfnun',
  'payAll.counterpartyContextCount': '{count} færslur',
  'payAll.offsetAction': 'Skuldajafna {amount}',
  'payAll.payActionAmount': 'Greiða {amount}',
  'payAll.offsetLabel': 'Skuldajöfnun',
  'payAll.cashLabel': 'Greiðsla utan Teskeiðar',
  'payAll.totalSettled': 'Samtals gert upp',
  'payAll.remaining': 'Eftir',
  'payAll.applyOffset': 'Skuldajafna {amount} fyrst',
  'payAll.cashExceedsWithOffset': 'Með {offset} í skuldajöfnun getur greiðslan að hámarki verið {max}.',
  'payAll.settlementAmountRequired': 'Veldu greiðslu eða skuldajöfnun.',
  'payAll.cashAmountInvalid': 'Sláðu inn gilda greiðsluupphæð.',
  'payAll.settlementInvalid': 'Ekki er hægt að senda þessa tillögu.',
  'payAll.paymentDialogTitle': 'Gera upp við {name}',
  'payAll.offsetDialogTitle': 'Skuldajafna við {name}',
  'payAll.proposalDescription': 'Viðtakandinn staðfestir tillöguna.',
  'payAll.submitOffset': 'Senda skuldajöfnun',
  'payAll.submitCombined': 'Senda uppgjörstillögu',
  'payAll.submitPayment': 'Senda greiðslutillögu',
  'payAll.submittingProposal': 'Sendi tillögu...',
  'payAll.paymentMissing': '{firstName} á eftir að skrá greiðsluupplýsingarnar sínar í Teskeið.',
  'payAll.paymentMissingGeneric': 'Viðtakandi á eftir að skrá greiðsluupplýsingarnar sínar í Teskeið.',
  'payAll.paymentUnavailable': 'Ekki tókst að sækja greiðsluupplýsingarnar.',
  'payAll.batchUnavailable': 'Ekki er hægt að senda uppgjörstillögu alveg strax.',
  'payAll.pairNeedsReview': 'Sumar færslur milli ykkar þarfnast yfirferðar.',
  'payAll.counterpartyUnavailable': 'Ekki er hægt að senda þessum aðila uppgjörstillögu í Teskeið enn.',
  'payAll.pendingTitle': 'Uppgjörstillögur sem bíða',
  'payAll.pendingBySelf': 'Tillagan til {name} bíður staðfestingar.',
  'payAll.pendingFromOther': '{name} sendi þér uppgjörstillögu.',
  'payAll.pendingOccurredOn': 'Dagsetning greiðslu',
  'payAll.pendingNote': 'Athugasemd',
  'payAll.pendingNoNote': 'Engin athugasemd',
  'payAll.pendingCashBySelf': 'Greiðsla frá þér til {name}',
  'payAll.pendingCashFromOther': 'Greiðsla frá {name} til þín',
  'payAll.confirmProposal': 'Staðfesta tillögu',
  'payAll.rejectProposal': 'Hafna tillögu',
  'payAll.cancelProposal': 'Afturkalla tillögu',
  'payAll.pendingWorking': 'Vinn...',
  'payAll.pendingUpdated': 'Tillagan var afgreidd. Uppfæri stöðuna...',
  'errors.invalid_input': 'Athugaðu reitina og reyndu aftur.',
  'errors.conflict': 'Gögnin hafa breyst. Endurhladdu síðuna og reyndu aftur.',
  'errors.save_failed': 'Ekki tókst að vista.',
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
  useLocale: () => 'is',
  useTranslations: () => translate,
}))

import { ExpensePayAll } from '@/components/expenses/ExpensePayAll'

function context(
  id: string,
  amountMinor: number,
  direction: 'outgoing' | 'incoming',
): ExpensePayAllPairContextView {
  const fromMemberId = direction === 'outgoing'
    ? '11111111-1111-4111-8111-111111111111'
    : '22222222-2222-4222-8222-222222222222'
  const toMemberId = direction === 'outgoing'
    ? '22222222-2222-4222-8222-222222222222'
    : '11111111-1111-4111-8111-111111111111'
  const fromDisplayName = direction === 'outgoing' ? 'Sigurveig' : 'Stefan'
  const toDisplayName = direction === 'outgoing' ? 'Stefan' : 'Sigurveig'
  const detail: ExpensePayAllContextView = {
    groupId: `10000000-0000-4000-8000-${id.padStart(12, '0')}`,
    groupKind: 'one_off',
    groupName: `Færsla ${id}`,
    emoji: null,
    amountMinor,
    currency: 'ISK',
    expenses: [{
      id: `expense-${id}`,
      title: `Útgjald ${id}`,
      incurredOn: '2026-08-08',
      amountMinor,
    }],
    nettingAdjustmentMinor: 0,
    transfer: {
      fromMemberId,
      fromDisplayName,
      toMemberId,
      toDisplayName,
      amountMinor,
      currency: 'ISK',
      expectedFinancialVersion: Number(id.replace(/\D/g, '')) || 1,
      canReport: direction === 'outgoing',
      paymentInstruction: null,
    },
  }
  return {
    groupId: detail.groupId,
    expectedFinancialVersion: detail.transfer.expectedFinancialVersion,
    fromMemberId,
    toMemberId,
    amountMinor,
    currency: 'ISK',
    context: detail,
  }
}

const paymentInstruction = {
  title: 'payment_profile_v2',
  kind: 'bank_account' as const,
  currency: 'ISK',
  details: { accountNumber: '0159-26-123456', nationalId: '010180-9999' },
  visibility: 'debt_context' as const,
  capturedAt: '2026-08-09T12:00:00.000Z',
}

function debtorPair(
  paymentDetails: ExpensePayAllCounterpartyView['paymentDetails'] = {
    paymentDetailsState: 'available',
    paymentInstruction,
    expectedPaymentProfile: {
      profileId: '44444444-4444-4444-8444-444444444444',
      version: 3,
      stateToken: '0123456789abcdef0123456789abcdef',
    },
  },
): ExpensePayAllCounterpartyView {
  return {
    counterpartyUserId: '22222222-2222-4222-8222-222222222222',
    counterpartyDisplayName: 'Stefan Halldór',
    counterpartyFirstName: 'Stefan',
    currency: 'ISK',
    grossPayableMinor: 30_000,
    grossReceivableMinor: 5_000,
    offsetMinor: 5_000,
    netPayableMinor: 25_000,
    netReceivableMinor: 0,
    outgoingContexts: [context('20', 20_000, 'outgoing'), context('10', 10_000, 'outgoing')],
    incomingContexts: [context('5', 5_000, 'incoming')],
    blockedContexts: [],
    counterpartyCanSettle: true,
    paymentDetails,
  }
}

function creditorPair(): ExpensePayAllCounterpartyView {
  const reverseFive = context('5', 5_000, 'outgoing')
  const reverseTwenty = context('20', 20_000, 'incoming')
  const reverseTen = context('10', 10_000, 'incoming')
  return {
    counterpartyUserId: '33333333-3333-4333-8333-333333333333',
    counterpartyDisplayName: 'Sigurveig Stefánsdóttir',
    counterpartyFirstName: 'Sigurveig',
    currency: 'ISK',
    grossPayableMinor: 5_000,
    grossReceivableMinor: 30_000,
    offsetMinor: 5_000,
    netPayableMinor: 0,
    netReceivableMinor: 25_000,
    outgoingContexts: [reverseFive],
    incomingContexts: [reverseTwenty, reverseTen],
    blockedContexts: [],
    counterpartyCanSettle: true,
    paymentDetails: {
      paymentDetailsState: 'available',
      paymentInstruction,
      expectedPaymentProfile: {
        profileId: '44444444-4444-4444-8444-444444444444',
        version: 3,
        stateToken: '0123456789abcdef0123456789abcdef',
      },
    },
  }
}

function view(overrides: Partial<ExpensePayAllView> = {}): ExpensePayAllView {
  return {
    payments: [],
    blockedContexts: [],
    counterpartyViews: [],
    pendingBatches: [],
    settlementBatchReady: true,
    ...overrides,
  }
}

function legacyView(): ExpensePayAllView {
  const legacyContext = context('12', 12_500, 'outgoing').context
  legacyContext.groupKind = 'group'
  legacyContext.groupName = 'Bústaðarferð'
  legacyContext.emoji = '🏡'
  legacyContext.expenses[0] = {
    id: 'expense-12',
    title: 'Matur',
    incurredOn: '2026-08-08',
    amountMinor: 15_000,
  }
  legacyContext.nettingAdjustmentMinor = -2_500
  return view({
    payments: [{
      id: 'payment-1',
      recipientDisplayName: 'Anna',
      amountMinor: 12_500,
      currency: 'ISK',
      paymentInstruction,
      paymentDetailsState: 'available',
      expectedPaymentProfile: {
        profileId: '44444444-4444-4444-8444-444444444444',
        version: 3,
        stateToken: '0123456789abcdef0123456789abcdef',
      },
      contexts: [legacyContext],
    }],
  })
}

beforeEach(() => {
  actionMocks.propose.mockReset().mockResolvedValue({
    ok: true,
    data: { batchId: 'batch-new', status: 'proposed' },
  })
  actionMocks.transition.mockReset().mockResolvedValue({
    ok: true,
    data: { status: 'confirmed' },
  })
  actionMocks.refresh.mockReset()
})

describe('ExpensePayAll bilateral settlement UI', () => {
  it('shows the 30k/5k debtor summary, recalculates cash and submits exact stale-state evidence', async () => {
    render(
      <ExpensePayAll
        view={view({ counterpartyViews: [debtorPair()] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )

    const card = screen.getByRole('heading', { name: 'Stefan Halldór' }).closest('section')!
    expect(within(card).getByText('Útlagt fyrir þig').parentElement).toHaveTextContent('2 færslur')
    expect(within(card).getByText('Þú átt inni').parentElement).toHaveTextContent('1 færslur')
    expect(within(card).getByText('Til greiðslu').parentElement?.parentElement).toHaveTextContent(/25\.000/)

    fireEvent.click(within(card).getByRole('button', { name: /Greiða 25\.000/ }))
    const dialog = screen.getByRole('dialog', { name: 'Gera upp við Stefan Halldór' })
    const cashInput = within(dialog).getByLabelText('Greiðsla utan Teskeiðar')
    const offset = within(dialog).getByRole('checkbox', { name: /Skuldajafna 5\.000/ })
    expect(cashInput).toHaveValue('25.000')
    expect(offset).toBeChecked()
    expect(within(dialog).getByText('Samtals gert upp').parentElement).toHaveTextContent(/30\.000/)
    expect(within(dialog).getByText('0159-26-123456')).toBeInTheDocument()

    fireEvent.change(cashInput, { target: { value: '20.000' } })
    expect(within(dialog).getByText('Samtals gert upp').parentElement).toHaveTextContent(/25\.000/)
    expect(within(dialog).getByText('Eftir').parentElement).toHaveTextContent(/5\.000/)

    fireEvent.change(cashInput, { target: { value: '26.000' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/að hámarki verið 25\.000/)
    expect(within(dialog).getByRole('button', { name: 'Senda uppgjörstillögu' })).toBeDisabled()

    fireEvent.click(offset)
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Samtals gert upp').parentElement).toHaveTextContent(/26\.000/)
    expect(within(dialog).getByText('Eftir').parentElement).toHaveTextContent(/4\.000/)

    fireEvent.change(cashInput, { target: { value: '25.000' } })
    fireEvent.click(offset)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Senda uppgjörstillögu' }))
    await waitFor(() => expect(actionMocks.propose).toHaveBeenCalledWith({
      anchor: {
        group_id: '10000000-0000-4000-8000-000000000020',
        from_member_id: '11111111-1111-4111-8111-111111111111',
        to_member_id: '22222222-2222-4222-8222-222222222222',
      },
      currency: 'ISK',
      expected_contexts: [{
        group_id: '10000000-0000-4000-8000-000000000020',
        from_member_id: '11111111-1111-4111-8111-111111111111',
        to_member_id: '22222222-2222-4222-8222-222222222222',
        expected_financial_version: 20,
        amount_minor: 20_000,
      }, {
        group_id: '10000000-0000-4000-8000-000000000010',
        from_member_id: '11111111-1111-4111-8111-111111111111',
        to_member_id: '22222222-2222-4222-8222-222222222222',
        expected_financial_version: 10,
        amount_minor: 10_000,
      }, {
        group_id: '10000000-0000-4000-8000-000000000005',
        from_member_id: '22222222-2222-4222-8222-222222222222',
        to_member_id: '11111111-1111-4111-8111-111111111111',
        expected_financial_version: 5,
        amount_minor: 5_000,
      }],
      expected_payment_profile: {
        profile_id: '44444444-4444-4444-8444-444444444444',
        version: 3,
        state_token: '0123456789abcdef0123456789abcdef',
      },
      cash_amount: '25000',
      use_offset: true,
      occurred_on: '2026-08-10',
      note: null,
      request_id: expect.any(String),
    }))
  })

  it('offers the net creditor both offset and a separate 5k cash payment without legacy pair mutation', () => {
    render(
      <ExpensePayAll
        view={view({ counterpartyViews: [creditorPair()] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )

    const card = screen.getByRole('heading', { name: 'Sigurveig Stefánsdóttir' }).closest('section')!
    expect(within(card).getByText('Nettó inneign').parentElement?.parentElement).toHaveTextContent(/25\.000/)
    expect(within(card).getByRole('button', { name: /Skuldajafna 5\.000/ })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Greiða 5\.000/ })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Nánar' }))
    const details = screen.getByRole('dialog', { name: 'Uppgjör við Sigurveig Stefánsdóttir' })
    expect(within(details).getByText('Það sem þú skuldar')).toBeInTheDocument()
    expect(within(details).getByText('Það sem þú átt inni')).toBeInTheDocument()
    expect(within(details).queryByRole('button', { name: 'Greiða' })).not.toBeInTheDocument()
  })

  it('shows no payment information and sends no profile identity for a pure offset proposal', async () => {
    render(
      <ExpensePayAll
        view={view({ counterpartyViews: [creditorPair()] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Skuldajafna 5\.000/ }))

    const dialog = screen.getByRole('dialog', { name: 'Skuldajafna við Sigurveig Stefánsdóttir' })
    expect(within(dialog).queryByLabelText('Greiðsla utan Teskeiðar')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('0159-26-123456')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Skuldajöfnun').parentElement).toHaveTextContent(/5\.000/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Senda skuldajöfnun' }))
    await waitFor(() => expect(actionMocks.propose).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_payment_profile: null,
        cash_amount: '0',
        use_offset: true,
      }),
    ))
  })

  it('distinguishes personalized missing details from a temporary load failure', () => {
    const { unmount } = render(
      <ExpensePayAll
        view={view({
          counterpartyViews: [debtorPair({
            paymentDetailsState: 'not_configured',
            paymentInstruction: null,
            expectedPaymentProfile: null,
          })],
        })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Greiða 25\.000/ }))
    expect(screen.getByText('Stefan á eftir að skrá greiðsluupplýsingarnar sínar í Teskeið.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Senda uppgjörstillögu' })).toBeEnabled()
    unmount()

    render(
      <ExpensePayAll
        view={view({
          counterpartyViews: [debtorPair({
            paymentDetailsState: 'unavailable',
            paymentInstruction: null,
            expectedPaymentProfile: null,
          })],
        })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Greiða 25\.000/ }))
    expect(screen.getByText('Ekki tókst að sækja greiðsluupplýsingarnar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Senda uppgjörstillögu' })).toBeDisabled()
  })

  it('keeps a failed proposal open, restores the action and focuses the error', async () => {
    actionMocks.propose.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    render(
      <ExpensePayAll
        view={view({ counterpartyViews: [debtorPair()] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Greiða 25\.000/ }))
    const dialog = screen.getByRole('dialog', { name: 'Gera upp við Stefan Halldór' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Senda uppgjörstillögu' }))

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('Gögnin hafa breyst. Endurhladdu síðuna og reyndu aftur.')
    expect(alert).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Senda uppgjörstillögu' })).toBeEnabled()
  })

  it('fails closed when the batch contract is unavailable or one pair context needs review', () => {
    const { rerender } = render(
      <ExpensePayAll
        view={view({ counterpartyViews: [debtorPair()], settlementBatchReady: false })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    expect(screen.getByText('Ekki er hægt að senda uppgjörstillögu alveg strax.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Greiða 25\.000/ })).not.toBeInTheDocument()

    const blockedPair = debtorPair()
    blockedPair.blockedContexts = [{ ...blockedPair.outgoingContexts[0]!, direction: 'outgoing' }]
    rerender(
      <ExpensePayAll
        view={view({ counterpartyViews: [blockedPair] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    expect(screen.getByText('Sumar færslur milli ykkar þarfnast yfirferðar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Greiða 25\.000/ })).not.toBeInTheDocument()

    const ineligiblePair = debtorPair()
    ineligiblePair.counterpartyCanSettle = false
    rerender(
      <ExpensePayAll
        view={view({ counterpartyViews: [ineligiblePair] })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )
    expect(screen.getByText('Ekki er hægt að senda þessum aðila uppgjörstillögu í Teskeið enn.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Greiða 25\.000/ })).not.toBeInTheDocument()
  })

  it('lets the counterparty confirm or reject a pending proposal and the proposer cancel theirs', async () => {
    render(
      <ExpensePayAll
        view={view({
          pendingBatches: [{
            id: 'batch-incoming',
            counterpartyDisplayName: 'Stefan Halldór',
            counterpartyFirstName: 'Stefan',
            currency: 'ISK',
            proposerGrossPayableMinor: 30_000,
            proposerGrossReceivableMinor: 5_000,
            offsetMinor: 5_000,
            cashMinor: 25_000,
            proposedBySelf: false,
            canConfirm: true,
            canReject: true,
            canCancel: false,
            occurredOn: '2026-08-09',
            note: 'Kvöldmaturinn',
            createdAt: '2026-08-10T12:00:00.000Z',
          }, {
            id: 'batch-reject',
            counterpartyDisplayName: 'Björn',
            counterpartyFirstName: 'Björn',
            currency: 'ISK',
            proposerGrossPayableMinor: 7_000,
            proposerGrossReceivableMinor: 0,
            offsetMinor: 0,
            cashMinor: 7_000,
            proposedBySelf: false,
            canConfirm: true,
            canReject: true,
            canCancel: false,
            occurredOn: '2026-08-10',
            note: 'Leigubíll',
            createdAt: '2026-08-10T12:00:30.000Z',
          }, {
            id: 'batch-outgoing',
            counterpartyDisplayName: 'Anna',
            counterpartyFirstName: 'Anna',
            currency: 'ISK',
            proposerGrossPayableMinor: 10_000,
            proposerGrossReceivableMinor: 10_000,
            offsetMinor: 10_000,
            cashMinor: 0,
            proposedBySelf: true,
            canConfirm: false,
            canReject: false,
            canCancel: true,
            occurredOn: '2026-08-10',
            note: null,
            createdAt: '2026-08-10T12:01:00.000Z',
          }],
        })}
        locale="is"
        initialDate="2026-08-10"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Uppgjörstillögur sem bíða' })).toBeInTheDocument()
    expect(screen.getByText('Kvöldmaturinn')).toBeInTheDocument()
    expect(screen.getByText('9. ágúst 2026')).toBeInTheDocument()
    expect(screen.getByText('Engin athugasemd')).toBeInTheDocument()
    expect(screen.getByText('Greiðsla frá Stefan Halldór til þín')).toBeInTheDocument()
    expect(screen.queryByText('Greiðsla frá þér til Anna')).not.toBeInTheDocument()
    const stefanProposal = screen.getByRole('heading', { name: 'Stefan Halldór' }).closest('article')!
    fireEvent.click(within(stefanProposal).getByRole('button', { name: 'Staðfesta tillögu' }))
    await waitFor(() => expect(actionMocks.transition).toHaveBeenCalledWith({
      batch_id: 'batch-incoming',
      action: 'confirm',
      request_id: expect.any(String),
    }))
    expect(actionMocks.refresh).toHaveBeenCalled()

    const bjornProposal = screen.getByRole('heading', { name: 'Björn' }).closest('article')!
    fireEvent.click(within(bjornProposal).getByRole('button', { name: 'Hafna tillögu' }))
    await waitFor(() => expect(actionMocks.transition).toHaveBeenCalledWith({
      batch_id: 'batch-reject',
      action: 'reject',
      request_id: expect.any(String),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Afturkalla tillögu' }))
    await waitFor(() => expect(actionMocks.transition).toHaveBeenCalledWith({
      batch_id: 'batch-outgoing',
      action: 'cancel',
      request_id: expect.any(String),
    }))
  })

  it('keeps the legacy direct flow for non-pair contexts and handles the true empty state', () => {
    const { rerender } = render(
      <ExpensePayAll view={legacyView()} locale="is" initialDate="2026-08-10" />,
    )
    expect(screen.getByRole('heading', { name: 'Greiða Anna' })).toBeInTheDocument()
    expect(screen.getByText('0159-26-123456')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Greiða' })).toBeInTheDocument()

    rerender(<ExpensePayAll view={view()} locale="is" initialDate="2026-08-10" />)
    expect(screen.getByText('Allt er uppgert 😊')).toBeInTheDocument()
  })
})
