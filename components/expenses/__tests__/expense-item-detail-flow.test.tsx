import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseGroupView, ExpenseItemView } from '@/lib/expenses/contracts'

const { mockGetOrCreateThread } = vi.hoisted(() => ({ mockGetOrCreateThread: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/chat/repository.server', () => ({
  getOrCreateThread: mockGetOrCreateThread,
}))

const translations: Record<string, string> = {
  'expenseForm.stepNavAriaLabel': 'Skref við skráningu útgjalds',
  'expenseForm.steps.details': 'Útgjald',
  'expenseForm.steps.people': 'Aðilar',
  'expenseForm.steps.split': 'Skipting',
  'expenseForm.steps.review': 'Yfirferð',
  'expense.savedViews.review': 'Útlagt',
  'expense.savedViews.people': 'Aðilar',
  'expense.savedViews.split': 'Skipting',
  'expense.savedViews.settlement': 'Uppgjör',
  'expense.settlementParticipants': 'Þátttakendur og staða',
  'expense.manageParticipants': 'Tengja gest eða skoða boð',
  'expense.settlementFilters.label': 'Sía þátttakendur eftir uppgjörsstöðu',
  'expense.settlementFilters.outstanding': 'Útistandandi',
  'expense.settlementFilters.reported': 'Tilkynnt',
  'expense.settlementFilters.completed': 'Greiðslu lokið',
  'expense.settlementFilters.credit': 'Inneign',
  'expense.settlementFilters.empty': 'Enginn þátttakandi er í þessum flokki.',
  'expenseForm.stepCompleted': 'Lokið, opna til að breyta',
  'expenseForm.stepEditUnavailable': 'Ekki er hægt að breyta þessu útgjaldi',
  'expenseForm.previewNet': 'Nettóstaða eftir útgjaldið',
  'expenseForm.previewSettlement': 'Hver greiðir hverjum',
  'expenseForm.previewIsOwed': '{name} á inni',
  'expenseForm.previewOwesBalance': '{name} skuldar',
  'expenseForm.previewEven': '{name} er í jafnvægi',
  'expenseForm.previewOwes': '{from} greiðir {to}',
  'expenseForm.previewSettled': 'Engin greiðsla þarf að fara milli aðila.',
  'common.status': 'Staða',
  'expense.active': 'Virkt',
  'expense.splitMethod': 'Skipting',
  'expense.paid': 'Greitt við kaup',
  'expense.shares': 'Hlutur hvers',
  'expense.openGroup': 'Opna hópinn',
  'expense.edit': 'Breyta útgjaldinu',
  'expense.editDetails': 'Breyta færslu',
  'expense.cancel': 'Fella útgjald niður',
  'expense.summaryPaid': '{name} lagði út {amount}',
  'expense.summarySinglePayer': '{name} lagði út',
  'expense.summaryMultiplePayers': '{count} lögðu út',
  'expense.summaryDescription': 'Lýsing',
  'expense.summaryYourStatus': 'Þín staða',
  'expense.summaryYouAreOwed': 'Þú átt eftir að fá {amount}',
  'expense.summaryYouOwe': 'Þú átt eftir að greiða {amount}',
  'expense.summaryYouAreEven': 'Þú ert búin/nn að greiða 😊',
  'expense.summaryOpen': 'Eftir að gera',
  'expense.summaryOwes': '{from} á eftir að greiða {to} {amount}',
  'expense.summaryDebtorOwes': '{name} á eftir að greiða {amount}',
  'expense.summaryTwoOweEach': '{first} og {second} eiga eftir að greiða {amount} hvort.',
  'expense.summaryManyOwe': '{count} eiga eftir að greiða.',
  'expense.summaryRepaidProgress': '{paid} af {total} hafa endurgreitt.',
  'expense.summaryMorePayments': 'Fleiri greiðslur: {count}',
  'expense.summarySettled': 'Allt er uppgert 😊',
  'group.members': 'Aðilar',
  'group.memberActive': 'Virkur',
  'group.registered': 'Teskeiðarnotandi',
  'group.guest': 'Gestur',
  'group.owes': '{from} greiðir {to}',
  'expenseForm.linkGuest': 'Tengja',
  'expenseForm.youSuffix': '(þú)',
  'expenseForm.participantShare': 'Hlutur í kostnaði: {amount}',
  'expenseForm.paidAtPurchase': 'Lagði út {amount}',
  'repayment.payBeforeReport': 'Greiddu áður en þú tilkynnir.',
  'repayment.outsidePayment': 'Greiðslan fer fram utan Teskeiðar.',
  'repayment.maximum': 'Að hámarki {amount}',
  'repayment.report': 'Tilkynna greitt',
  'repayment.reportDialogTitle': 'Tilkynna greiðslu',
  'repayment.reportDialogDescription': 'Skráðu upphæðina sem þú greiddir.',
  'repayment.recordReceived': 'Merkja greiðslu móttekna',
  'repayment.recordingReceived': 'Skrái greiðslu...',
  'repayment.recordReceivedDialogTitle': 'Merkja greiðslu móttekna',
  'repayment.recordReceivedDialogDescription': 'Skráðu upphæðina sem hefur borist.',
  'repayment.close': 'Loka greiðsluglugga',
  'repayment.reviewRequiredTitle': 'Uppgjörið þarfnast yfirferðar',
  'repayment.reviewRequiredBody': 'Tilkynnt greiðsla passar ekki lengur.',
  'repayment.reviewRequiredAction': 'Fara í uppgjör',
  'repayment.existing': 'Skráðar endurgreiðslur',
  'repayment.statusNeedsReview': 'Tilkynnt · þarfnast yfirferðar',
  'repayment.statusReported': 'Tilkynnt',
  'repayment.statusConfirmed': 'Staðfest',
  'repayment.reportedAt': 'Greiðsla tilkynnt {date}',
  'repayment.confirmedReportedAt': 'Greiðsla tilkynnt {date} · staðfest',
  'repayment.reportedAmountAt': 'Greiðsla upp á {amount} tilkynnt {date}',
  'repayment.confirmedAmountAt': 'Greitt {amount} · staðfest {date}',
  'repayment.partiallyPaid': 'Greitt að hluta',
  'repayment.remainingAmount': 'Eftir að greiða {amount}',
  'history.title': 'Saga hlutarins',
  'history.empty': 'Engin saga hefur verið skráð enn.',
  'history.showChanges': 'Sýna breytingar',
  'history.before': 'Áður',
  'history.after': 'Eftir',
  'history.none': 'Ekkert',
  'history.settled': 'Allt uppgert',
  'history.unknownActor': 'Teskeiðarnotandi',
  'history.settlementImpact': 'Áhrif á uppgjör',
  'history.chatEmpty': 'Engin skilaboð enn.',
  'history.chatLoading': 'Sæki skilaboð...',
  'history.chatPlaceholder': 'Skrifaðu skilaboð',
  'history.chatSend': 'Senda',
  'history.chatSendError': 'Ekki tókst að senda skilaboðin.',
  'history.chatLoadError': 'Ekki tókst að sækja skilaboðin.',
  'history.chatRetry': 'Reyna aftur',
  'history.chatDeleted': 'Skilaboðum eytt',
  'history.chatLoadOlder': 'Sækja eldri skilaboð',
  'history.chatUnavailable': 'Spjallið er ekki tiltækt í augnablikinu.',
  'history.fields.title': 'Heiti',
  'activitySummary.expense_title_updated': 'Heiti uppfært',
  'activitySummary.expense_updated': 'Færsla uppfærð',
  'activity.expense_created': 'Útgjald skráð',
  'activity.expense_updated': 'Færsla uppfærð',
  'common.amount': 'Upphæð',
  'common.date': 'Dagsetning',
  'common.datePlaceholder': 'Veldu dag',
  'common.note': 'Athugasemd',
  'common.optional': 'Valfrjálst',
  'splitMethods.equal': 'Jafnt',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let result = translations[key] ?? key
  for (const [name, value] of Object.entries(values ?? {})) {
    result = result.replace(`{${name}}`, String(value))
  }
  return result
}

vi.mock('next-intl', () => ({ useLocale: () => 'is', useTranslations: () => translate }))
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('is'),
  getTranslations: vi.fn().mockResolvedValue(translate),
}))
vi.mock('@/lib/expenses/actions', () => ({
  addExpenseGroupMember: vi.fn(),
  cancelExpense: vi.fn(),
  cancelExpenseMemberInvitation: vi.fn(),
  linkExpenseGuestMember: vi.fn(),
  removeExpenseGroupMember: vi.fn(),
  reportExpenseRepayment: vi.fn(),
  recordExpenseRepaymentReceived: vi.fn(),
  resendExpenseMemberInvitation: vi.fn(),
}))

import { ExpenseItemDetail } from '@/components/expenses/ExpenseItemDetail'

const expense: ExpenseItemView = {
  id: 'expense-1',
  groupId: 'group-1',
  title: 'Kvöldmatur',
  totalMinor: 10_000,
  currency: 'ISK',
  incurredOn: '2026-08-04',
  category: null,
  note: 'Góð lýsing á kvöldmatnum.',
  status: 'active',
  splitMethod: 'equal',
  createdBySelf: true,
  createdAt: '2026-08-04T12:00:00.000Z',
  payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 10_000 }],
  shares: [
    { memberId: 'self', displayName: 'Ég', amountMinor: 5_000 },
    { memberId: 'anna', displayName: 'Anna', amountMinor: 5_000 },
  ],
  revisions: [],
}

const group: ExpenseGroupView = {
  id: 'group-1',
  kind: 'group',
  name: 'Ferð',
  description: null,
  emoji: null,
  defaultCurrency: 'ISK',
  defaultIncludeCreator: true,
  financialVersion: 1,
  status: 'active',
  role: 'owner',
  canManage: true,
  canLeave: false,
  canCreateExpense: true,
  createdAt: '2026-08-04T10:00:00.000Z',
  members: [
    { id: 'self', displayName: 'Ég', role: 'owner', status: 'active', isSelf: true, isRegistered: true },
    { id: 'anna', displayName: 'Anna', role: 'member', status: 'active', isSelf: false, isRegistered: false },
  ],
  expenses: [expense],
  balances: [],
  settlementTransfers: [],
  settlementRequiresReview: false,
  repayments: [],
  activity: [],
}

describe('ExpenseItemDetail flow context', () => {
  it('opens on a high-level Útlagt summary with clickable lifecycle views', async () => {
    render(await ExpenseItemDetail({ group, expense }))

    const nav = screen.getByRole('navigation', { name: 'Skref við skráningu útgjalds' })
    expect(within(nav).getByRole('button', { name: 'Útlagt' })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: 'Uppgjör' })).toBeEnabled()
    expect(within(nav).queryByRole('button', { name: 'Aðilar' })).not.toBeInTheDocument()
    expect(screen.getByText('Ég lagði út')).toBeInTheDocument()
    expect(screen.getByText(/10\.000\s*kr\./)).toBeInTheDocument()
    expect(screen.getByText('Góð lýsing á kvöldmatnum.')).toBeInTheDocument()
    expect(screen.getByText(/Þú átt eftir að fá 5\.000\s*kr\./)).toBeInTheDocument()
    expect(screen.getByText(/Anna á eftir að greiða 5\.000\s*kr\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Breyta færslu' })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1/breyta?step=details',
    )
    expect(within(nav).queryByRole('button', { name: 'Skipting' })).not.toBeInTheDocument()
  })

  it('summarizes two equal outstanding repayments in one readable sentence', async () => {
    const equalExpense: ExpenseItemView = {
      ...expense,
      note: null,
      totalMinor: 12_000,
      payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 12_000 }],
      shares: [
        { memberId: 'self', displayName: 'Ég', amountMinor: 4_000 },
        { memberId: 'anna', displayName: 'Anna', amountMinor: 4_000 },
        { memberId: 'bjarni', displayName: 'Bjarni', amountMinor: 4_000 },
      ],
    }
    const equalGroup: ExpenseGroupView = {
      ...group,
      expenses: [equalExpense],
      members: [
        ...group.members,
        { id: 'bjarni', displayName: 'Bjarni', role: 'member', status: 'active', isSelf: false, isRegistered: true },
      ],
    }

    render(await ExpenseItemDetail({ group: equalGroup, expense: equalExpense }))

    expect(screen.getByText(/Anna og Bjarni eiga eftir að greiða 4\.000\s*kr\. hvort\./)).toBeInTheDocument()
    expect(screen.queryByText('Lýsing')).not.toBeInTheDocument()
  })

  it('uses the actionable settlement for the viewer headline after a repayment is reported', async () => {
    const oneOffGroup: ExpenseGroupView = {
      ...group,
      kind: 'one_off',
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 6_667, isSelf: true },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -3_334, isSelf: false },
        { memberId: 'berg', displayName: 'Berglind', currency: 'ISK', amountMinor: -3_333, isSelf: false },
      ],
      members: [
        ...group.members,
        { id: 'berg', displayName: 'Berglind', role: 'member', status: 'active', isSelf: false, isRegistered: true },
      ],
      settlementTransfers: [{
        fromMemberId: 'berg', fromDisplayName: 'Berglind',
        toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 3_333,
        currency: 'ISK', expectedFinancialVersion: 2, canReport: false,
        paymentInstruction: null,
      }],
    }

    render(await ExpenseItemDetail({ group: oneOffGroup, expense }))

    expect(screen.getByText(/Þú átt eftir að fá 3\.333\s*kr\./)).toBeInTheDocument()
    expect(screen.queryByText(/Þú átt eftir að fá 6\.667\s*kr\./)).not.toBeInTheDocument()
    expect(screen.getByText(/Berglind á eftir að greiða 3\.333\s*kr\./)).toBeInTheDocument()
  })

  it('uses repayment progress once an expense has more than two debtors', async () => {
    const progressExpense: ExpenseItemView = {
      ...expense,
      note: null,
      totalMinor: 10_000,
      payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 10_000 }],
      shares: [
        { memberId: 'self', displayName: 'Ég', amountMinor: 2_500 },
        { memberId: 'anna', displayName: 'Anna', amountMinor: 2_500 },
        { memberId: 'bjarni', displayName: 'Bjarni', amountMinor: 2_500 },
        { memberId: 'dis', displayName: 'Dís', amountMinor: 2_500 },
      ],
    }
    const progressGroup: ExpenseGroupView = {
      ...group,
      kind: 'one_off',
      expenses: [progressExpense],
      members: [
        ...group.members,
        { id: 'bjarni', displayName: 'Bjarni', role: 'member', status: 'active', isSelf: false, isRegistered: true },
        { id: 'dis', displayName: 'Dís', role: 'member', status: 'active', isSelf: false, isRegistered: true },
      ],
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 5_000, isSelf: true },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -2_500, isSelf: false },
        { memberId: 'bjarni', displayName: 'Bjarni', currency: 'ISK', amountMinor: -2_500, isSelf: false },
        { memberId: 'dis', displayName: 'Dís', currency: 'ISK', amountMinor: 0, isSelf: false },
      ],
      settlementTransfers: [
        { fromMemberId: 'anna', fromDisplayName: 'Anna', toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 2_500, currency: 'ISK', expectedFinancialVersion: 2, canReport: false, paymentInstruction: null },
        { fromMemberId: 'bjarni', fromDisplayName: 'Bjarni', toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 2_500, currency: 'ISK', expectedFinancialVersion: 2, canReport: false, paymentInstruction: null },
      ],
    }

    render(await ExpenseItemDetail({ group: progressGroup, expense: progressExpense }))

    expect(screen.getByText('1 af 3 hafa endurgreitt.')).toBeInTheDocument()
  })

  it('keeps guest linking in the consolidated one-off settlement view', async () => {
    render(await ExpenseItemDetail({
      group: { ...group, kind: 'one_off' },
      expense,
      view: 'settlement',
    }))

    expect(screen.getByRole('button', { name: 'Tengja' })).toBeInTheDocument()
  })

  it('keeps repayment reporting inside the one-off settlement view', async () => {
    const oneOffGroup: ExpenseGroupView = {
      ...group,
      kind: 'one_off',
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 5_000, isSelf: true },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -5_000, isSelf: false },
      ],
      settlementTransfers: [{
        fromMemberId: 'anna',
        fromDisplayName: 'Anna',
        toMemberId: 'self',
        toDisplayName: 'Ég',
        amountMinor: 5_000,
        currency: 'ISK',
        expectedFinancialVersion: 2,
        canReport: true,
        paymentInstruction: null,
      }],
    }

    render(await ExpenseItemDetail({
      group: oneOffGroup,
      expense,
      view: 'settlement',
      initialDate: '2026-08-05',
    }))

    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Tilkynna greitt' })).toBeInTheDocument()
    expect(screen.queryByText('Anna greiðir Ég')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Opna hópinn' })).not.toBeInTheDocument()
  })

  it('replaces raw debt with a dated reported-payment state in settlement', async () => {
    const repayment = {
      id: 'repayment-1', obligationId: 'obligation-1', groupId: group.id,
      fromMemberId: 'anna', fromDisplayName: 'Anna', toMemberId: 'self', toDisplayName: 'Ég',
      amountMinor: 3_334, currency: 'ISK', occurredOn: '2026-08-05', note: null,
      status: 'reported' as const, createdAt: '2026-08-05T11:54:00Z',
      canConfirm: true, canReject: true, canCancel: false, requiresReview: false,
      paymentSnapshot: null,
    }
    const oneOffGroup: ExpenseGroupView = {
      ...group,
      kind: 'one_off',
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 6_667, isSelf: true },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -3_334, isSelf: false },
        { memberId: 'berg', displayName: 'Berglind', currency: 'ISK', amountMinor: -3_333, isSelf: false },
      ],
      members: [
        ...group.members,
        { id: 'berg', displayName: 'Berglind', role: 'member', status: 'active', isSelf: false, isRegistered: true },
      ],
      settlementTransfers: [{
        fromMemberId: 'berg', fromDisplayName: 'Berglind',
        toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 3_333,
        currency: 'ISK', expectedFinancialVersion: 2, canReport: false,
        paymentInstruction: null,
      }],
      repayments: [repayment],
    }

    render(await ExpenseItemDetail({
      group: oneOffGroup,
      expense,
      view: 'settlement',
    }))

    expect(screen.queryByText('Anna skuldar')).not.toBeInTheDocument()
    expect(screen.queryByText('Berglind skuldar')).not.toBeInTheDocument()
    expect(screen.queryByText('Ég á inni')).not.toBeInTheDocument()
    expect(screen.getByText(/Greiðsla upp á 3\.334\s*kr\. tilkynnt 5\. ágú\. 2026, 11:54/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Útistandandi 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tilkynnt 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Greiðslu lokið 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inneign 1' })).toBeInTheDocument()
    expect(screen.queryByText('Skráðar endurgreiðslur')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tilkynnt 1' }))
    const participantList = screen.getByRole('list', { name: 'Þátttakendur og staða' })
    expect(within(participantList).getByText('Anna')).toBeInTheDocument()
    expect(within(participantList).queryByText('Berglind')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Greiðsla upp á .* tilkynnt/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/repayment-1',
    )
  })

  it('keeps a confirmed partial payer outstanding and offers the recipient the remainder', async () => {
    const partialExpense: ExpenseItemView = {
      ...expense,
      totalMinor: 15_000_000,
      payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 15_000_000 }],
      shares: [
        { memberId: 'self', displayName: 'Ég', amountMinor: 5_000_000 },
        { memberId: 'anna', displayName: 'Anna', amountMinor: 5_000_000 },
        { memberId: 'stebbi', displayName: 'Stebbishj', amountMinor: 5_000_000 },
      ],
    }
    const confirmedPartial = {
      id: 'repayment-partial', obligationId: 'obligation-partial', groupId: group.id,
      fromMemberId: 'stebbi', fromDisplayName: 'Stebbishj', toMemberId: 'self', toDisplayName: 'Ég',
      amountMinor: 3_600_000, currency: 'ISK', occurredOn: '2026-08-05', note: null,
      status: 'confirmed' as const, createdAt: '2026-08-05T11:54:00Z',
      canConfirm: false, canReject: false, canCancel: false, requiresReview: false,
      paymentSnapshot: null,
    }
    const partialGroup: ExpenseGroupView = {
      ...group,
      kind: 'one_off',
      financialVersion: 4,
      expenses: [partialExpense],
      members: [
        ...group.members,
        { id: 'stebbi', displayName: 'Stebbishj', role: 'member', status: 'active', isSelf: false, isRegistered: true },
      ],
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 6_400_000, isSelf: true },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -5_000_000, isSelf: false },
        { memberId: 'stebbi', displayName: 'Stebbishj', currency: 'ISK', amountMinor: -1_400_000, isSelf: false },
      ],
      settlementTransfers: [
        { fromMemberId: 'anna', fromDisplayName: 'Anna', toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 5_000_000, currency: 'ISK', expectedFinancialVersion: 4, canReport: false, canRecordReceived: true, paymentInstruction: null },
        { fromMemberId: 'stebbi', fromDisplayName: 'Stebbishj', toMemberId: 'self', toDisplayName: 'Ég', amountMinor: 1_400_000, currency: 'ISK', expectedFinancialVersion: 4, canReport: false, canRecordReceived: true, paymentInstruction: null },
      ],
      repayments: [confirmedPartial],
    }

    render(await ExpenseItemDetail({
      group: partialGroup,
      expense: partialExpense,
      view: 'settlement',
      initialDate: '2026-08-06',
    }))

    expect(screen.getByText('Greitt að hluta')).toBeInTheDocument()
    expect(screen.getByText(/Greitt 3\.600\.000\s*kr\./)).toBeInTheDocument()
    expect(screen.getByText(/Eftir að greiða 1\.400\.000\s*kr\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Útistandandi 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Merkja greiðslu móttekna' })).toHaveLength(2)
  })

  it('keeps editing available after settlement starts and explains a reported-payment conflict', async () => {
    const repayment = {
      id: 'repayment-1', obligationId: 'obligation-1', groupId: group.id,
      fromMemberId: 'anna', fromDisplayName: 'Anna', toMemberId: 'self', toDisplayName: 'Ég',
      amountMinor: 5_000, currency: 'ISK', occurredOn: '2026-08-05', note: null,
      status: 'reported' as const, createdAt: '2026-08-05T12:30:00Z',
      canConfirm: true, canReject: true, canCancel: false, requiresReview: true,
      paymentSnapshot: null,
    }
    render(await ExpenseItemDetail({
      group: {
        ...group,
        kind: 'one_off',
        status: 'settling',
        settlementRequiresReview: true,
        repayments: [repayment],
      },
      expense,
    }))

    expect(screen.getByRole('link', { name: 'Breyta færslu' })).toBeInTheDocument()
    expect(screen.getByText('Uppgjörið þarfnast yfirferðar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fara í uppgjör' })).toHaveAttribute(
      'href', '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1?view=settlement',
    )
  })

  it('renders an expandable private before/after revision in item history', async () => {
    const before = {
      version: 1 as const,
      groupStatus: 'active' as const,
      expense: {
        title: 'Kvöldmatur', note: null, totalMinor: 10_000, currency: 'ISK',
        incurredOn: '2026-08-04', category: null, splitMethod: 'equal' as const,
      },
      payments: expense.payments,
      shares: expense.shares,
      balances: [
        { memberId: 'self', displayName: 'Ég', currency: 'ISK', amountMinor: 5_000 },
        { memberId: 'anna', displayName: 'Anna', currency: 'ISK', amountMinor: -5_000 },
      ],
      repaymentSummary: { reported: 0, confirmed: 0, rejected: 0, cancelled: 0 },
    }
    const revisedExpense: ExpenseItemView = {
      ...expense,
      title: 'Afmæliskvöldmatur',
      revisions: [{
        id: 'revision-1', activityId: 'activity-1', financialVersionBefore: 1,
        financialVersionAfter: 2, changedFields: ['title'], actorDisplayName: 'Stefán',
        summaryCode: 'expense_title_updated', before,
        after: { ...before, expense: { ...before.expense, title: 'Afmæliskvöldmatur' } },
        createdAt: '2026-08-05T12:00:00Z',
      }],
    }
    render(await ExpenseItemDetail({
      group: {
        ...group,
        kind: 'one_off',
        expenses: [revisedExpense],
        activity: [{
          id: 'activity-1', sequence: 2, eventType: 'expense_updated', entityType: 'expense',
          entityId: expense.id, summaryCode: 'expense_title_updated', actorDisplayName: 'Stefán',
          createdAt: '2026-08-05T12:00:00Z', expenseTitle: 'Afmæliskvöldmatur', groupTitle: 'Ferð',
        }],
      },
      expense: revisedExpense,
    }))

    expect(screen.getByText('Saga hlutarins')).toBeInTheDocument()
    expect(screen.getByText('Heiti uppfært')).toBeInTheDocument()
    expect(screen.getByText('Sýna breytingar')).toBeInTheDocument()
  })

  it('mounts the reusable context chat inside Saga hlutarins when enabled', async () => {
    vi.stubEnv('TESKEID_CHAT_ENABLED', 'true')
    mockGetOrCreateThread.mockResolvedValueOnce({ id: 'thread-1' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{
        id: 'message-1',
        threadId: 'thread-1',
        body: 'Skilaboð á milli atburða',
        messageKind: 'chat',
        createdAt: '2026-08-04T11:00:00.000Z',
        isDeleted: false,
        isHidden: false,
        authorName: 'Stefán',
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    try {
      render(await ExpenseItemDetail({
        group: {
          ...group,
          activity: [
            {
              id: 'activity-before', sequence: 1, eventType: 'expense_created', entityType: 'expense',
              entityId: expense.id, summaryCode: 'expense_created', actorDisplayName: 'Stefán',
              createdAt: '2026-08-04T10:00:00.000Z', expenseTitle: expense.title, groupTitle: group.name,
            },
            {
              id: 'activity-after', sequence: 2, eventType: 'expense_updated', entityType: 'expense',
              entityId: expense.id, summaryCode: 'expense_updated', actorDisplayName: 'Stefán',
              createdAt: '2026-08-04T12:00:00.000Z', expenseTitle: expense.title, groupTitle: group.name,
            },
          ],
        },
        expense,
      }))

      expect(screen.getByText('Saga hlutarins')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Skrifaðu skilaboð')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Senda' })).toBeDisabled()
      const eventBefore = screen.getByText('Útgjald skráð')
      const messageBetween = await screen.findByText('Skilaboð á milli atburða')
      const eventAfter = screen.getByText('Færsla uppfærð')
      expect(eventBefore.compareDocumentPosition(messageBetween) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(messageBetween.compareDocumentPosition(eventAfter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(mockGetOrCreateThread).toHaveBeenCalledWith(expect.objectContaining({
        domain: 'expenses',
        targetType: 'expense_item',
        targetId: expense.id,
      }))
    } finally {
      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
