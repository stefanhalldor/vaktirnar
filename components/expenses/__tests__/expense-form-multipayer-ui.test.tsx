import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseItemView } from '@/lib/expenses/contracts'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  saveDraft: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
}))

const translations: Record<string, string> = {
  'common.amount': 'Upphæð', 'common.currency': 'Gjaldmiðill', 'common.date': 'Dagsetning',
  'common.datePlaceholder': 'Veldu dag', 'common.optional': 'Valfrjálst', 'common.note': 'Athugasemd',
  'expenseForm.stepNavAriaLabel': 'Skref', 'expenseForm.steps.details': 'Útlagt',
  'expenseForm.steps.split': 'Skiptingin',
  'expenseForm.stepNeedsReview': 'Þarf yfirferð', 'expenseForm.previousStep': 'Til baka',
  'expenseForm.nextSteps.split': 'Áfram í skiptingu', 'expenseForm.details': 'Upplýsingar',
  'expenseForm.title': 'Heiti útgjalds', 'expenseForm.titlePlaceholder': 'Til dæmis Kvöldmatur',
  'expenseForm.description': 'Lýsing', 'expenseForm.descriptionPlaceholder': 'Hvað var greitt fyrir?',
  'expenseForm.category': 'Flokkur', 'expenseForm.participants': 'Hverjir taka þátt í kostnaðinum?',
  'expenseForm.youSuffix': '(þú)',
  'expenseForm.participantShare': 'Hlutur í kostnaði: {amount}',
  'expenseForm.paidAtPurchase': 'Lagði út {amount}',
  'expenseForm.participantHint': 'Veldu aðila.', 'expenseForm.knownPeople': 'Þekktir aðilar',
  'expenseForm.selectAllEventGuests': 'Velja alla gesti',
  'expenseForm.guestName': 'Nafn gests', 'expenseForm.addGuest': 'Bæta við gesti',
  'expenseForm.removeParticipant': 'Fjarlægja {name}', 'expenseForm.paidBy': 'Hver borgaði?',
  'expenseForm.paidByMultiple': 'Hverjir borguðu?',
  'expenseForm.paidHint': 'Einn greiðandi.', 'expenseForm.payer': 'Greiðandi {number}',
  'expenseForm.addPayer': 'Fleiri', 'expenseForm.removePayer': 'Fjarlægja {name}',
  'expenseForm.split': 'Hvernig skiptist greiðslan?', 'expenseForm.preserveSharesHint': 'Núverandi skipting helst.',
  'expenseForm.splitRemainder': 'Skipting þarf lagfæringu. {amount} eru óúthlutaðar.',
  'expenseForm.splitExcess': 'Skipting þarf lagfæringu. {amount} er umfram heildarupphæðina.',
  'expenseForm.splitNeedsAttention': 'Skipting þarf lagfæringu áður en hægt er að hefja uppgjör.',
  'expenseForm.saveDraftOnly': 'Vista færslu',
  'expenseForm.addParticipant': 'Bæta við þátttakanda',
  'expenseForm.addParticipantDescription': 'Veldu aðila.',
  'expenseForm.closeParticipantPicker': 'Loka',
  'expenseForm.participantSource': 'Leið',
  'expenseForm.knownParticipant': 'Þekktur aðili',
  'expenseForm.nameOrEmail': 'Nafn eða netfang',
  'expenseForm.nameOrEmailPlaceholder': 'Nafn eða netfang',
  'expenseForm.nameOrEmailHint': 'Netfang sendir boð.',
  'expenseForm.participantNameInvalid': 'Sláðu inn nafn.',
  'expenseForm.participantEmailInvalid': 'Sláðu inn gilt netfang.',
  'expenseForm.changeShares': 'Breyta skiptingu', 'expenseForm.preview': 'Forskoðun',
  'expenseForm.previewHint': 'Forskoðun.', 'expenseForm.previewPaidBy': 'Greiðendur',
  'expenseForm.previewShares': 'Skipting', 'expenseForm.previewNet': 'Nettóstaða',
  'expenseForm.previewSettlement': 'Uppgjör', 'expenseForm.previewOwes': '{from} greiðir {to}',
  'expenseForm.previewIsOwed': '{name} á inni', 'expenseForm.previewOwesBalance': '{name} skuldar',
  'expenseForm.previewEven': '{name} er í jafnvægi', 'expenseForm.previewSettled': 'Uppgert',
  'expenseForm.previewPaymentDetails': 'Greiðsluupplýsingar síðar.', 'expenseForm.roundingHint': 'Rúnnun.',
  'expenseForm.totalPaid': 'Samtals', 'expenseForm.create': 'Vista útlagt', 'expenseForm.creating': 'Vista...',
  'expenseForm.update': 'Vista breytingar', 'expenseForm.updating': 'Vista...',
  'expenseForm.saveNow': 'Vista',
  'expenseForm.draftSaving': 'Vista breytingar...', 'expenseForm.draftSaved': 'Breytingar vistaðar',
  'expenseForm.draftSaveFailed': 'Vistun mistókst',
  'splitMethods.fixed': 'Föst upphæð', 'splitMethods.percentage': 'Prósenta', 'splitMethods.weighted': 'Hlutir',
  'splitMethods.fixedLabel': 'Föst upphæð', 'splitMethods.percentageLabel': 'Prósenta',
  'splitMethods.weightLabel': 'Hlutir', 'splitMethods.simpleHint': 'Veldu leið.',
  'splitMethods.weightHint': 'Einn hlutur skiptir jafnt.', 'splitMethods.resetEqual': 'Skipta jafnt',
  'repayment.reportedAt': 'Greiðsla tilkynnt {date}',
  'repayment.confirmedReportedAt': 'Greiðsla tilkynnt {date} · staðfest',
  'errors.detailsRequired': 'Fylltu út upplýsingar.', 'errors.participant_required': 'Bættu við aðila.',
  'errors.paymentTotal': 'Greiðslur stemma ekki.', 'errors.splitTotal': 'Skipting stemmir ekki.',
  'errors.invalid_input': 'Ógilt.', 'errors.draftSaveFailed': 'Vistun mistókst.',
  'errors.save_failed': 'Ekki tókst að vista.',
}

function translate(rawKey: string, values?: Record<string, string | number>): string {
  const key = rawKey.replace(/^teskeid\.expenses\./, '')
  let value = translations[key] ?? key
  for (const [name, replacement] of Object.entries(values ?? {})) value = value.replace(`{${name}}`, String(replacement))
  return value
}

vi.mock('next-intl', () => ({ useLocale: () => 'is', useTranslations: () => translate }))
vi.mock('@/lib/expenses/actions', () => ({
  createExpense: mocks.create,
  updateExpense: mocks.update,
  saveExpenseDraft: mocks.saveDraft,
}))

import { ExpenseForm } from '@/components/expenses/ExpenseForm'

const members = [
  { key: 'member-self', label: 'Ég', isSelf: true },
  { key: 'member-anna', label: 'Anna', isSelf: false },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.saveDraft.mockResolvedValue({ ok: true, data: { draftId: '11111111-1111-4111-8111-111111111111', version: 1, savedAt: '2026-08-05T12:00:00Z' } })
  mocks.create.mockResolvedValue({ ok: true, data: { groupId: 'group-1', expenseId: 'expense-1' } })
  mocks.update.mockResolvedValue({ ok: true, data: { groupId: 'group-1', expenseId: 'expense-1', financialVersion: 2 } })
})

function renderForm(extra: Partial<React.ComponentProps<typeof ExpenseForm>> = {}) {
  return render(<ExpenseForm mode="group" groupId="group-1" defaultCurrency="ISK" initialMembers={members} initialDate="2026-08-05" draftBaseHref="/draft" {...extra} />)
}

function fillDetails() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Heiti útgjalds' }), { target: { value: 'Kvöldmatur' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Upphæð' }), { target: { value: '10000' } })
}

async function next(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByText('Vista breytingar...')).not.toBeInTheDocument())
}

describe('ExpenseForm simplified split and autosave', () => {
  it('keeps event guests unchecked until an explicit share selection and never changes the payer', () => {
    renderForm({
      eventContext: true,
      initialStep: 'split',
      initialMembers: [
        { key: 'member-self', label: 'Ég', isSelf: true, included: true },
        { key: 'member-anna', label: 'Anna', isSelf: false, included: false },
        { key: 'member-bjarni', label: 'Bjarni', isSelf: false, included: false },
      ],
    })

    expect(screen.getByRole('checkbox', { name: /Ég/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Anna' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Bjarni' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Greiðandi 1' })).toHaveValue('member-self')

    fireEvent.click(screen.getByRole('button', { name: 'Velja alla gesti' }))
    expect(screen.getByRole('checkbox', { name: 'Anna' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Bjarni' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Ég/ })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Greiðandi 1' })).toHaveValue('member-self')
  })

  it('shows only fixed amount, percentage and shares, with shares selected by default', async () => {
    renderForm({ initialStep: 'split' })
    const group = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(within(group).getByRole('radio', { name: 'Hlutir' })).toBeChecked()
    expect(within(group).queryByRole('radio', { name: 'Jafnt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skipta jafnt' })).toBeInTheDocument()
  })

  it('autosaves a private draft before moving forward and advances the CAS version', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í skiptingu')
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      context_type: 'group', group_id: 'group-1', current_step: 'split', expected_version: null,
      payload: expect.objectContaining({ title: 'Kvöldmatur', splitMethod: 'weighted' }),
    }))
    expect(mocks.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))
    expect(screen.queryByText('Breytingar vistaðar')).not.toBeInTheDocument()
  })

  it('shows localized thousands separators and keeps category hidden in the UI', () => {
    renderForm()
    fillDetails()
    expect(screen.getByRole('textbox', { name: 'Upphæð' })).toHaveValue('10.000')
    expect(screen.queryByRole('combobox', { name: /Flokkur/ })).not.toBeInTheDocument()
  })

  it('keeps the user on the current step when autosave fails', async () => {
    mocks.saveDraft.mockResolvedValueOnce({ ok: false, error: 'save_failed' })
    renderForm()
    fillDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Áfram í skiptingu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vistun mistókst')
    expect(screen.getByRole('textbox', { name: 'Heiti útgjalds' })).toBeInTheDocument()
  })

  it('keeps the user on the current step when autosave throws', async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error('network unavailable'))
    renderForm()
    fillDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Áfram í skiptingu' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vistun mistókst')
    expect(screen.getByRole('textbox', { name: 'Heiti útgjalds' })).toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('uses equal-height payer controls and can add a payer through the shared picker', async () => {
    renderForm({
      mode: 'one_off',
      initialStep: 'split',
      initialMembers: [{ key: 'member-self', label: 'Ég', isSelf: true }],
    })

    const payers = screen.getByRole('group', { name: 'Hver borgaði?' })
    expect(within(payers).getByRole('combobox', { name: 'Greiðandi 1' })).toHaveClass('h-11')
    expect(within(payers).getByRole('textbox', { name: 'Upphæð Ég' })).toHaveClass('h-11')

    fireEvent.click(within(payers).getByRole('button', { name: 'Fleiri' }))
    expect(screen.getByRole('dialog', { name: 'Bæta við þátttakanda' })).toBeInTheDocument()
  })

  it('supports multiple payers and submits the simplified weighted allocation', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í skiptingu')
    fireEvent.click(screen.getByRole('button', { name: 'Fleiri' }))
    const amounts = screen.getAllByRole('textbox', { name: /Upphæð/ })
    fireEvent.change(amounts[0]!, { target: { value: '6000' } })
    fireEvent.change(amounts[1]!, { target: { value: '4000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista útlagt' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      split_method: 'weighted', draft_id: expect.any(String),
      payments: [{ member_key: 'member-self', amount: '6000' }, { member_key: 'member-anna', amount: '4000' }],
      allocations: [{ member_key: 'member-self', weight: '1' }, { member_key: 'member-anna', weight: '1' }],
    }))
  })

  it('prefills and updates the expense title and description through the details step', async () => {
    const editExpense: ExpenseItemView = {
      id: 'expense-1',
      groupId: 'group-1',
      title: 'Gamalt heiti',
      totalMinor: 10_000,
      currency: 'ISK',
      incurredOn: '2026-08-05',
      category: null,
      note: 'Gömul lýsing',
      status: 'active',
      splitMethod: 'weighted',
      createdBySelf: true,
      createdAt: '2026-08-05T12:00:00Z',
      payments: [{ memberId: 'member-self', displayName: 'Ég', amountMinor: 10_000 }],
      shares: [
        { memberId: 'member-self', displayName: 'Ég', amountMinor: 5_000 },
        { memberId: 'member-anna', displayName: 'Anna', amountMinor: 5_000 },
      ],
      revisions: [],
    }
    renderForm({ edit: { expense: editExpense, expectedFinancialVersion: 1 } })

    const title = screen.getByRole('textbox', { name: 'Heiti útgjalds' })
    const description = screen.getByRole('textbox', { name: /Lýsing/ })
    expect(title).toHaveValue('Gamalt heiti')
    expect(description).toHaveValue('Gömul lýsing')
    expect(screen.getByRole('textbox', { name: 'Upphæð' })).toHaveValue('10.000')
    expect(screen.getByRole('button', { name: 'Vista' })).toBeInTheDocument()

    fireEvent.change(title, { target: { value: 'Nýtt heiti' } })
    fireEvent.change(description, { target: { value: 'Ný lýsing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }))

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      expense_id: 'expense-1',
      title: 'Nýtt heiti',
      note: 'Ný lýsing',
    })))
  })

  it('keeps settled edit navigation local when SQL102 drafts are unavailable', async () => {
    const editExpense: ExpenseItemView = {
      id: 'expense-1', groupId: 'group-1', title: 'Kvöldmatur', totalMinor: 10_000,
      currency: 'ISK', incurredOn: '2026-08-05', category: 'food', note: null,
      status: 'active', splitMethod: 'weighted', createdBySelf: true,
      createdAt: '2026-08-05T12:00:00Z',
      payments: [{ memberId: 'member-self', displayName: 'Ég', amountMinor: 10_000 }],
      shares: [
        { memberId: 'member-self', displayName: 'Ég', amountMinor: 5_000 },
        { memberId: 'member-anna', displayName: 'Anna', amountMinor: 5_000 },
      ],
      revisions: [],
    }
    renderForm({
      edit: {
        expense: editExpense,
        expectedFinancialVersion: 4,
        groupStatus: 'settled',
        hasConfirmedRepayment: true,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Áfram í skiptingu' }))
    const participants = await screen.findByRole('group', { name: 'Hverjir taka þátt í kostnaðinum?' })
    expect(within(participants).getByText('Ég (þú)')).toBeInTheDocument()
    expect(mocks.saveDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows each persisted cost share and positive payment states with the participant', () => {
    const editExpense: ExpenseItemView = {
      id: 'expense-1', groupId: 'group-1', title: 'Kvöldmatur', totalMinor: 10_000,
      currency: 'ISK', incurredOn: '2026-08-05', category: null, note: null,
      status: 'active', splitMethod: 'weighted', createdBySelf: true,
      createdAt: '2026-08-05T12:00:00Z',
      payments: [{ memberId: 'member-self', displayName: 'Ég', amountMinor: 10_000 }],
      shares: [
        { memberId: 'member-self', displayName: 'Ég', amountMinor: 5_000 },
        { memberId: 'member-anna', displayName: 'Anna', amountMinor: 5_000 },
      ],
      revisions: [],
    }
    renderForm({
      mode: 'one_off',
      initialStep: 'split',
      edit: {
        expense: editExpense,
        expectedFinancialVersion: 4,
        repayments: [{
          id: 'repayment-1', obligationId: 'obligation-1', groupId: 'group-1',
          fromMemberId: 'member-anna', fromDisplayName: 'Anna',
          toMemberId: 'member-self', toDisplayName: 'Ég',
          amountMinor: 5_000, currency: 'ISK', occurredOn: '2026-08-05', note: null,
          status: 'confirmed', createdAt: '2026-08-05T12:30:00Z',
          canConfirm: false, canReject: false, canCancel: false, requiresReview: false,
          paymentSnapshot: null,
        }],
      },
    })

    const participants = screen.getByRole('group', { name: 'Hverjir taka þátt í kostnaðinum?' })
    expect(within(participants).getAllByText(/Hlutur í kostnaði: 5\.000\s*kr\./)).toHaveLength(2)
    expect(within(participants).getByText(/Lagði út 10\.000\s*kr\./)).toBeInTheDocument()
    expect(within(participants).getByText(/Greiðsla tilkynnt .* · staðfest/)).toBeInTheDocument()
  })

  it('recalculates a settled expense without an interruption popup', async () => {
    const editExpense: ExpenseItemView = {
      id: 'expense-1', groupId: 'group-1', title: 'Kvöldmatur', totalMinor: 10_000,
      currency: 'ISK', incurredOn: '2026-08-05', category: null, note: null,
      status: 'active', splitMethod: 'weighted', createdBySelf: true,
      createdAt: '2026-08-05T12:00:00Z',
      payments: [{ memberId: 'member-self', displayName: 'Ég', amountMinor: 10_000 }],
      shares: [
        { memberId: 'member-self', displayName: 'Ég', amountMinor: 5_000 },
        { memberId: 'member-anna', displayName: 'Anna', amountMinor: 5_000 },
      ],
      revisions: [],
    }
    const confirm = vi.spyOn(window, 'confirm')
    renderForm({
      initialStep: 'split',
      edit: {
        expense: editExpense,
        expectedFinancialVersion: 4,
        groupStatus: 'settled',
        hasConfirmedRepayment: true,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Vista breytingar' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('shows an accessible error and does not navigate when final create throws', async () => {
    mocks.create.mockRejectedValueOnce(new Error('network unavailable'))
    renderForm()
    fillDetails()
    await next('Áfram í skiptingu')
    fireEvent.click(screen.getByRole('button', { name: 'Vista útlagt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('saves an underallocated fixed split as a recoverable draft instead of creating ledger state', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í skiptingu')
    mocks.saveDraft.mockClear()

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    fireEvent.click(within(split).getByRole('radio', { name: 'Föst upphæð' }))
    const shares = within(split).getAllByRole('textbox', { name: 'Föst upphæð' })
    fireEvent.change(shares[0]!, { target: { value: '1000' } })
    fireEvent.change(shares[1]!, { target: { value: '1000' } })

    expect(screen.getByText(/8\.000.*óúthlutaðar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vista færslu' }))

    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      current_step: 'split',
      payload: expect.objectContaining({
        splitMethod: 'fixed',
        amounts: expect.objectContaining({
          'member-self': '1000',
          'member-anna': '1000',
        }),
      }),
    })))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
  })
})
