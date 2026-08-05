import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  'expenseForm.steps.people': 'Aðilar', 'expenseForm.steps.split': 'Skipting', 'expenseForm.steps.review': 'Yfirferð',
  'expenseForm.stepNeedsReview': 'Þarf yfirferð', 'expenseForm.previousStep': 'Til baka',
  'expenseForm.nextSteps.people': 'Áfram í aðila', 'expenseForm.nextSteps.split': 'Áfram í skiptingu',
  'expenseForm.nextSteps.review': 'Áfram í yfirferð', 'expenseForm.details': 'Upplýsingar',
  'expenseForm.title': 'Heiti útgjalds', 'expenseForm.titlePlaceholder': 'Til dæmis Kvöldmatur',
  'expenseForm.category': 'Flokkur', 'expenseForm.participants': 'Fyrir hvern?',
  'expenseForm.participantHint': 'Veldu aðila.', 'expenseForm.knownPeople': 'Þekktir aðilar',
  'expenseForm.guestName': 'Nafn gests', 'expenseForm.addGuest': 'Bæta við gesti',
  'expenseForm.removeParticipant': 'Fjarlægja {name}', 'expenseForm.paidBy': 'Hverjir greiða?',
  'expenseForm.paidHint': 'Einn greiðandi.', 'expenseForm.payer': 'Greiðandi {number}',
  'expenseForm.addPayer': 'Bæta við greiðanda', 'expenseForm.removePayer': 'Fjarlægja {name}',
  'expenseForm.split': 'Hvernig skiptist útlagt?', 'expenseForm.preserveSharesHint': 'Núverandi skipting helst.',
  'expenseForm.changeShares': 'Breyta skiptingu', 'expenseForm.preview': 'Forskoðun',
  'expenseForm.previewHint': 'Forskoðun.', 'expenseForm.previewPaidBy': 'Greiðendur',
  'expenseForm.previewShares': 'Skipting', 'expenseForm.previewNet': 'Nettóstaða',
  'expenseForm.previewSettlement': 'Uppgjör', 'expenseForm.previewOwes': '{from} greiðir {to}',
  'expenseForm.previewIsOwed': '{name} á inni', 'expenseForm.previewOwesBalance': '{name} skuldar',
  'expenseForm.previewEven': '{name} er í jafnvægi', 'expenseForm.previewSettled': 'Uppgert',
  'expenseForm.previewPaymentDetails': 'Greiðsluupplýsingar síðar.', 'expenseForm.roundingHint': 'Rúnnun.',
  'expenseForm.totalPaid': 'Samtals', 'expenseForm.create': 'Vista útlagt', 'expenseForm.creating': 'Vista...',
  'expenseForm.update': 'Vista breytingar', 'expenseForm.updating': 'Vista...',
  'expenseForm.draftSaving': 'Vista breytingar...', 'expenseForm.draftSaved': 'Breytingar vistaðar',
  'expenseForm.draftSaveFailed': 'Vistun mistókst',
  'splitMethods.fixed': 'Föst upphæð', 'splitMethods.percentage': 'Prósenta', 'splitMethods.weighted': 'Hlutir',
  'splitMethods.fixedLabel': 'Föst upphæð', 'splitMethods.percentageLabel': 'Prósenta',
  'splitMethods.weightLabel': 'Hlutir', 'splitMethods.simpleHint': 'Veldu leið.',
  'splitMethods.weightHint': 'Einn hlutur skiptir jafnt.', 'splitMethods.resetEqual': 'Skipta jafnt',
  'errors.detailsRequired': 'Fylltu út upplýsingar.', 'errors.participant_required': 'Bættu við aðila.',
  'errors.paymentTotal': 'Greiðslur stemma ekki.', 'errors.splitTotal': 'Skipting stemmir ekki.',
  'errors.invalid_input': 'Ógilt.', 'errors.draftSaveFailed': 'Vistun mistókst.',
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
  it('shows only fixed amount, percentage and shares, with shares selected by default', async () => {
    renderForm({ initialStep: 'split' })
    const group = screen.getByRole('group', { name: 'Hvernig skiptist útlagt?' })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
    expect(within(group).getByRole('radio', { name: 'Hlutir' })).toBeChecked()
    expect(within(group).queryByRole('radio', { name: 'Jafnt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skipta jafnt' })).toBeInTheDocument()
  })

  it('autosaves a private draft before moving forward and advances the CAS version', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í aðila')
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      context_type: 'group', group_id: 'group-1', current_step: 'people', expected_version: null,
      payload: expect.objectContaining({ title: 'Kvöldmatur', splitMethod: 'weighted' }),
    }))
    expect(mocks.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))

    mocks.saveDraft.mockResolvedValueOnce({ ok: true, data: { draftId: '11111111-1111-4111-8111-111111111111', version: 2, savedAt: '2026-08-05T12:01:00Z' } })
    await next('Áfram í skiptingu')
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ expected_version: 1, current_step: 'split' }))
  })

  it('keeps the user on the current step when autosave fails', async () => {
    mocks.saveDraft.mockResolvedValueOnce({ ok: false, error: 'save_failed' })
    renderForm()
    fillDetails()
    fireEvent.click(screen.getByRole('button', { name: 'Áfram í aðila' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vistun mistókst')
    expect(screen.getByRole('textbox', { name: 'Heiti útgjalds' })).toBeInTheDocument()
  })

  it('supports multiple payers and submits the simplified weighted allocation', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í aðila')
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við greiðanda' }))
    const amounts = screen.getAllByRole('textbox', { name: /Upphæð/ })
    fireEvent.change(amounts[0]!, { target: { value: '6000' } })
    fireEvent.change(amounts[1]!, { target: { value: '4000' } })
    await next('Áfram í skiptingu')
    await next('Áfram í yfirferð')
    fireEvent.click(screen.getByRole('button', { name: 'Vista útlagt' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      split_method: 'weighted', draft_id: expect.any(String),
      payments: [{ member_key: 'member-self', amount: '6000' }, { member_key: 'member-anna', amount: '4000' }],
      allocations: [{ member_key: 'member-self', weight: '1' }, { member_key: 'member-anna', weight: '1' }],
    }))
  })
})
