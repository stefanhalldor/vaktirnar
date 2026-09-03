import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseItemView } from '@/lib/expenses/contracts'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  saveDraft: vi.fn(),
  shareDraft: vi.fn(),
  unshareDraft: vi.fn(),
  finalizeDraft: vi.fn(),
  reconfirmRevision: vi.fn(),
  discardRevision: vi.fn(),
  refreshPublicationLifecycle: vi.fn(),
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
  'expenseForm.saveAndClose': 'Vista og loka',
  'expenseForm.shareDraft': 'Deila drögum',
  'expenseForm.shareDraftChanges': 'Deila breytingum',
  'expenseForm.sharingDraft': 'Deili drögum...',
  'expenseForm.sharingDraftChanges': 'Deili breytingum...',
  'expenseForm.unshareDraft': 'Hætta að deila',
  'expenseForm.unsharingDraft': 'Hætti að deila...',
  'expenseForm.unshareDraftConfirmation': 'Aðrir missa aðgang að drögunum.',
  'expenseForm.discardEditRevision': 'Hætta við breytingar',
  'expenseForm.discardEditRevisionConfirmation': 'Viltu hætta við breytingarnar?',
  'expenseForm.confirmExpense': 'Staðfesta kostnað',
  'expenseForm.confirmingExpense': 'Staðfesti kostnað...',
  'expenseForm.allocationConfirmationLegend': 'Staðfesting',
  'expenseForm.allocationConfirmation': 'Þetta er rétt skipting',
  'expenseForm.allocationConfirmationHint': 'Staðfestu skiptinguna sjálf.',
  'expenseForm.unsharedDraftChanges': 'Ódeildar breytingar',
  'expenseForm.unsharedDraftChangesHint': 'Aðrir sjá enn síðustu deildu útgáfuna.',
  'expenseForm.sharedDraftCurrent': 'Aðrir sjá núverandi drög.',
  'expenseForm.draftPublicationUnavailable': 'Ekki tókst að staðfesta deilingarstöðu.',
  'expenseForm.addParticipant': 'Bæta við þátttakanda',
  'expenseForm.addParticipantDescription': 'Veldu aðila.',
  'expenseForm.closeParticipantPicker': 'Loka',
  'expenseForm.participantSource': 'Leið',
  'expenseForm.knownParticipant': 'Þekktur aðili',
  'expenseForm.eventParticipantSource': 'Úr viðburði',
  'expenseForm.eventSearchLabel': 'Leita að viðburði',
  'expenseForm.eventSearchPlaceholder': 'Heiti viðburðar',
  'expenseForm.noEventResults': 'Enginn viðburður fannst.',
  'expenseForm.selectedEvent': 'Valinn viðburður',
  'expenseForm.clearEventSelection': 'Hreinsa viðburðarval',
  'expenseForm.changeEvent': 'Breyta viðburði',
  'expenseForm.eventIdentityMoveBlocked': 'Ekki er hægt að færa drög með viðburðargesti.',
  'expenseForm.eventIdentityRemoveBlocked': 'Ekki er hægt að aftengja drög með viðburðargesti.',
  'expenseForm.eventRemovalPrivacyNotice': 'Sýnileiki var takmarkaður.',
  'expenseForm.eventGuestSearchLabel': 'Leita að gesti',
  'expenseForm.eventGuestSearchPlaceholder': 'Nafn gests',
  'expenseForm.noEventGuestResults': 'Enginn gestur fannst.',
  'expenseForm.linkToEvent': 'Tengja kostnað við viðburðinn',
  'expenseForm.linkToEventHint': 'Kostnaðurinn birtist á viðburðinum.',
  'eventVisibility.legend': 'Hverjir sjá kostnaðinn?',
  'eventVisibility.participantsOnly': 'Aðeins þátttakendur kostnaðarins',
  'eventVisibility.participantsOnlyHint': 'Aðrir sjá hann ekki.',
  'eventVisibility.allEvent': 'Allir sem sjá viðburðinn',
  'eventVisibility.allEventHint': 'Allir gestir sjá yfirlitið.',
  'eventVisibility.helper': 'Valið breytir ekki þátttakendum eða aðgangi að kostnaðinum.',
  'expenseForm.clearRelationshipCircle': 'Hreinsa tengslahring',
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
  'errors.invalid_input': 'Ógilt.',
  'errors.draftSaveFailed': 'Vistun mistókst.',
  'errors.draftPublicationUnavailable': 'Ekki tókst að staðfesta deilingarstöðu.',
  'errors.confirmExpenseAllocation': 'Staðfestu rétta skiptingu.',
  'errors.sharedDraftChangesPending': 'Deildu breytingunum fyrst.',
  'errors.conflict': 'Gögnin hafa breyst.',
  'errors.event_roster_changed': 'Gestalistinn hefur breyst. Hreinsaðu viðburðarvalið og veldu aftur.',
  'errors.save_failed': 'Ekki tókst að vista.',
  'editErrors.invalid_input': 'Skiptingin gengur ekki upp. Farðu yfir upphæðir og þátttakendur og reyndu aftur.',
  'editErrors.referenced_participant': 'Ekki er hægt að fjarlægja einn þátttakanda vegna tengdrar sögu eða boðs. Haltu þátttakandanum inni í skiptingunni og reyndu aftur.',
  'editErrors.not_allowed': 'Þú hefur ekki lengur heimild til að vista þessa breytingu. Farðu til baka og endurhlaðaðu kostnaðinn.',
  'editErrors.not_found': 'Ekki tókst að finna núverandi stöðu kostnaðarins. Endurhlaðaðu síðuna áður en þú reynir aftur.',
  'editErrors.conflict': 'Kostnaðurinn hefur breyst síðan þú opnaðir hann. Endurhlaðaðu síðuna og reyndu aftur.',
  'editErrors.feature_disabled': 'Ekki er hægt að vista breytinguna núna. Farðu til baka og endurhlaðaðu kostnaðinn.',
  'editErrors.save_failed': 'Ekki tókst að vista breytinguna. Farðu yfir skiptinguna og reyndu aftur.',
  'editErrors.save_outcome_unknown': 'Ekki tókst að staðfesta niðurstöðu vistunar. Ekki vista aftur strax. Endurhlaðaðu kostnaðinn og athugaðu stöðuna fyrst.',
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
  shareExpenseDraft: mocks.shareDraft,
  unshareExpenseDraft: mocks.unshareDraft,
  finalizeExpenseDraft: mocks.finalizeDraft,
  refreshExpenseDraftPublicationLifecycle: mocks.refreshPublicationLifecycle,
  reconfirmExpenseEditRevision: mocks.reconfirmRevision,
  discardExpenseEditRevision: mocks.discardRevision,
}))

import { ExpenseForm } from '@/components/expenses/ExpenseForm'

const members = [
  { key: 'member-self', label: 'Ég', isSelf: true },
  { key: 'member-anna', label: 'Anna', isSelf: false },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.saveDraft.mockImplementation(async (input) => ({
    ok: true,
    data: {
      draftId: '11111111-1111-4111-8111-111111111111',
      version: 1,
      savedAt: '2026-08-05T12:00:00Z',
      relationStatus: 'unchanged',
      eventId: input.payload.linkToEvent ? input.payload.eventId : null,
      eventRosterRevision: input.payload.linkToEvent ? input.payload.eventRosterRevision : null,
      privacyFailClosed: false,
    },
  }))
  mocks.refreshPublicationLifecycle.mockResolvedValue({
    status: 'ready',
    draftId: '11111111-1111-4111-8111-111111111111',
    draftVersion: 1,
    sharingState: 'never_shared',
    expectedPublicationVersion: null,
    hasUnsharedChanges: false,
  })
  mocks.shareDraft.mockResolvedValue({
    ok: true,
    data: {
      draftId: '11111111-1111-4111-8111-111111111111',
      draftVersion: 1,
      publicationVersion: 1,
      allocationState: 'balanced_unconfirmed',
    },
  })
  mocks.unshareDraft.mockResolvedValue({
    ok: true,
    data: {
      draftId: '11111111-1111-4111-8111-111111111111',
      draftVersion: 1,
      publicationVersion: 2,
    },
  })
  mocks.finalizeDraft.mockResolvedValue({
    ok: true,
    data: { groupId: 'group-1', expenseId: 'expense-1' },
  })
  mocks.create.mockResolvedValue({ ok: true, data: { groupId: 'group-1', expenseId: 'expense-1' } })
  mocks.update.mockResolvedValue({ ok: true, data: { groupId: 'group-1', expenseId: 'expense-1', financialVersion: 2 } })
  mocks.reconfirmRevision.mockResolvedValue({
    ok: true,
    data: { groupId: 'group-1', expenseId: 'expense-1', financialVersion: 2, unchanged: false },
  })
  mocks.discardRevision.mockResolvedValue({ ok: true, data: { expenseId: 'expense-1' } })
})

function renderForm(extra: Partial<React.ComponentProps<typeof ExpenseForm>> = {}) {
  return render(<ExpenseForm mode="group" groupId="group-1" defaultCurrency="ISK" initialMembers={members} initialDate="2026-08-05" draftBaseHref="/draft" {...extra} />)
}

function savedEventDraft(eventId: string, eventVisibility: 'participants_only' | 'all_event') {
  return {
    id: '71500000-0000-4000-8000-000000000001',
    contextType: 'one_off' as const,
    groupId: null,
    expenseId: null,
    currentStep: 'details' as const,
    payload: {
      circleId: null,
      eventId,
      eventRosterRevision: 4,
      linkToEvent: true,
      eventVisibility,
      members: [{
        key: 'self',
        label: 'Ég',
        input: { type: 'self' as const, key: 'self' },
        isSelf: true,
      }],
      removedMemberIds: [],
      included: { self: true },
      title: 'Kvöldmatur',
      total: '10000',
      currency: 'ISK' as const,
      incurredOn: '2026-08-05',
      category: '',
      note: '',
      splitMethod: 'weighted' as const,
      payments: { self: '10000' },
      payerKeys: ['self'],
      amounts: { self: '10000' },
      percentages: { self: '100' },
      weights: { self: '1' },
      preserveShares: false,
    },
    version: 2,
    savedAt: '2026-08-24T20:00:00.000Z',
  }
}

function savedGroupDraft(version = 2) {
  return {
    id: '81000000-0000-4000-8000-000000000001',
    contextType: 'group' as const,
    groupId: 'group-1',
    expenseId: null,
    currentStep: 'split' as const,
    payload: {
      circleId: null,
      eventId: null,
      eventRosterRevision: null,
      linkToEvent: false,
      eventVisibility: 'participants_only' as const,
      members,
      removedMemberIds: [],
      included: { 'member-self': true, 'member-anna': true },
      title: 'Kvöldmatur',
      total: '10000',
      currency: 'ISK' as const,
      incurredOn: '2026-08-05',
      category: '',
      note: '',
      splitMethod: 'weighted' as const,
      payments: { 'member-self': '10000', 'member-anna': '' },
      payerKeys: ['member-self'],
      amounts: { 'member-self': '5000', 'member-anna': '5000' },
      percentages: { 'member-self': '50', 'member-anna': '50' },
      weights: { 'member-self': '1', 'member-anna': '1' },
      preserveShares: false,
    },
    version,
    savedAt: '2026-08-26T09:00:00.000Z',
  }
}

function editableExpense(): ExpenseItemView {
  return {
    id: 'expense-1',
    groupId: 'group-1',
    title: 'Kvöldmatur',
    totalMinor: 10_000,
    currency: 'ISK',
    incurredOn: '2026-08-05',
    category: 'food',
    note: null,
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
}

function savedEditDraft(version = 2) {
  return {
    ...savedGroupDraft(version),
    contextType: 'edit' as const,
    expenseId: 'expense-1',
  }
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

  it('adds an event guest as a payer without changing shares or exposing its label in the draft payload', async () => {
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialStep: 'split',
      initialMembers: [{
        key: 'self',
        label: 'Ég',
        input: { type: 'self', key: 'self' },
        isSelf: true,
      }],
      eventSources: [{
        id: '72000000-0000-4000-8000-000000000001',
        name: 'Helgarferð',
        rosterRevision: 3,
        guests: [{
          id: '72000000-0000-4000-8000-000000000002',
          displayName: 'Anna',
          sourceKind: 'manual_name',
        }],
      }],
    })

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    fireEvent.click(within(split).getByRole('radio', { name: 'Prósenta' }))
    expect(within(split).getByRole('textbox', { name: 'Prósenta' })).toHaveValue('100')

    const payers = screen.getByRole('group', { name: 'Hver borgaði?' })
    fireEvent.click(within(payers).getByRole('button', { name: 'Fleiri' }))
    fireEvent.click(screen.getByRole('button', { name: 'Úr viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Helgarferð' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))

    expect(screen.getByRole('combobox', { name: 'Greiðandi 2' })).toHaveValue(
      'event:72000000-0000-4000-8000-000000000002',
    )
    expect(screen.getByRole('checkbox', { name: 'Anna' })).not.toBeChecked()
    expect(within(split).getAllByRole('textbox', { name: 'Prósenta' })).toHaveLength(1)
    expect(within(split).getByRole('textbox', { name: 'Prósenta' })).toHaveValue('100')

    fireEvent.click(screen.getByRole('button', { name: 'Til baka' }))
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled())
    const savedMembers = mocks.saveDraft.mock.calls.at(-1)?.[0]?.payload.members
    expect(savedMembers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'event:72000000-0000-4000-8000-000000000002',
        label: 'Event participant',
        input: expect.objectContaining({
          type: 'event_guest',
          event_guest_id: '72000000-0000-4000-8000-000000000002',
        }),
      }),
    ]))
    expect(JSON.stringify(savedMembers)).not.toContain('Anna')
  })

  it('shows the current organizer as the already-included self member', () => {
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialStep: 'split',
      initialMembers: [{
        key: 'self',
        label: 'Ég',
        input: { type: 'self', key: 'self' },
        isSelf: true,
      }],
      eventSources: [{
        id: '72500000-0000-4000-8000-000000000001',
        name: 'Helgarferð',
        rosterRevision: 3,
        viewerRole: 'owner',
        guests: [{
          id: '72500000-0000-4000-8000-000000000002',
          displayName: 'Stebbi',
          sourceKind: 'manual_name',
          participantKind: 'organizer',
        }],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Úr viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Helgarferð' }))

    expect(screen.getByRole('button', { name: 'Stebbi' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps entered fields and opaque provenance when finalization rejects a stale event roster', async () => {
    const staleEventId = '73000000-0000-4000-8000-000000000001'
    const staleGuestId = '73000000-0000-4000-8000-000000000002'
    mocks.finalizeDraft.mockResolvedValueOnce({ ok: false, error: 'event_roster_changed' })
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      draft: {
        id: '73000000-0000-4000-8000-000000000003',
        contextType: 'one_off',
        groupId: null,
        expenseId: null,
        currentStep: 'split',
        payload: {
          circleId: null,
          eventId: staleEventId,
          eventRosterRevision: 4,
          eventVisibility: 'participants_only',
          members: [
            { key: 'self', label: 'Ég', input: { type: 'self', key: 'self' }, isSelf: true },
            {
              key: `event:${staleGuestId}`,
              label: 'Gestur úr viðburði',
              input: { type: 'event_guest', key: `event:${staleGuestId}`, event_guest_id: staleGuestId },
              isSelf: false,
            },
          ],
          removedMemberIds: [],
          included: { self: true, [`event:${staleGuestId}`]: true },
          title: 'Kvöldmatur',
          total: '10000',
          currency: 'ISK',
          incurredOn: '2026-08-05',
          category: '',
          note: 'Má ekki tapast',
          splitMethod: 'weighted',
          payments: { self: '10000', [`event:${staleGuestId}`]: '' },
          payerKeys: ['self'],
          amounts: { self: '0', [`event:${staleGuestId}`]: '0' },
          percentages: { self: '50', [`event:${staleGuestId}`]: '50' },
          weights: { self: '1', [`event:${staleGuestId}`]: '1' },
          preserveShares: false,
        },
        version: 1,
        savedAt: '2026-08-16T10:00:00.000Z',
      },
      publicationLifecycle: {
        status: 'ready',
        draftId: '73000000-0000-4000-8000-000000000003',
        draftVersion: 1,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
      eventSources: [{
        id: staleEventId,
        name: 'Helgarferð',
        rosterRevision: 5,
        guests: [],
      }],
      eventSelectionWarning: true,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gestalistinn hefur breyst')
    expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: '73000000-0000-4000-8000-000000000003',
      expected_draft_version: 1,
      expected_publication_version: null,
      split_confirmed: true,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Til baka' }))
    expect(await screen.findByRole('textbox', { name: 'Heiti útgjalds' })).toHaveValue('Kvöldmatur')
    expect(screen.getByRole('textbox', { name: /Lýsing/ })).toHaveValue('Má ekki tapast')
  })

  it('blocks Event removal while an Event-bound payer remains and preserves the allocation', () => {
    const event = {
      id: '74000000-0000-4000-8000-000000000001',
      name: 'Helgarferð',
      rosterRevision: 2,
      guests: [{
        id: '74000000-0000-4000-8000-000000000002',
        displayName: 'Bjarni',
        sourceKind: 'manual_name' as const,
      }],
    }
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialStep: 'split',
      initialMembers: [
        { key: 'self', label: 'Ég', input: { type: 'self', key: 'self' }, isSelf: true },
        { key: 'anna', label: 'Anna', input: { type: 'guest', key: 'anna', display_name: 'Anna' }, isSelf: false },
      ],
      eventSources: [event],
    })

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    fireEvent.click(within(split).getByRole('radio', { name: 'Prósenta' }))
    const initialPercentages = within(split).getAllByRole('textbox', { name: 'Prósenta' })
    fireEvent.change(initialPercentages[0]!, { target: { value: '70' } })
    fireEvent.change(initialPercentages[1]!, { target: { value: '30' } })

    const payers = screen.getByRole('group', { name: 'Hver borgaði?' })
    fireEvent.click(within(payers).getByRole('button', { name: 'Fleiri' }))
    fireEvent.click(within(payers).getByRole('button', { name: 'Fleiri' }))
    fireEvent.click(screen.getByRole('button', { name: 'Úr viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Helgarferð' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bjarni' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))
    expect(screen.getByRole('checkbox', { name: 'Bjarni' })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hreinsa viðburðarval' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ekki er hægt að aftengja drög með viðburðargesti.')
    expect(screen.getByRole('checkbox', { name: 'Bjarni' })).toBeInTheDocument()
    const retainedPercentages = within(split).getAllByRole('textbox', { name: 'Prósenta' })
    expect(retainedPercentages[0]).toHaveValue('70')
    expect(retainedPercentages[1]).toHaveValue('30')
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

  it('binds the exact fresh draft identity in the URL before the first durable save', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    renderForm({ mode: 'one_off', groupId: undefined })
    fillDetails()
    await next('Áfram í skiptingu')

    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      expect.stringMatching(/^\/draft\?draft=[0-9a-f-]{36}$/),
    )
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveDraft.mock.invocationCallOrder[0]!,
    )
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      context_type: 'one_off',
      expected_version: null,
    }))
  })

  it('reuses an adopted non-durable draft identity across failed save and remount', async () => {
    const adoptedDraftId = '74000000-0000-4000-8000-000000000001'
    mocks.saveDraft.mockRejectedValueOnce(new Error('lost before durable write'))
    const first = renderForm({ mode: 'one_off', groupId: undefined, initialDraftId: adoptedDraftId })
    fillDetails()
    await next('Áfram í skiptingu')
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ draft_id: adoptedDraftId }))

    first.unmount()
    mocks.saveDraft.mockResolvedValue({
      ok: true,
      data: { draftId: adoptedDraftId, version: 1, savedAt: '2026-08-05T12:00:00Z', relationStatus: 'unchanged', eventId: null, eventRosterRevision: null, privacyFailClosed: false },
    })
    renderForm({ mode: 'one_off', groupId: undefined, initialDraftId: adoptedDraftId })
    fillDetails()
    await next('Áfram í skiptingu')
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      draft_id: adoptedDraftId,
      expected_version: null,
    }))
  })

  it('lets an incomplete private details step save and close without validation or publication', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Vista og loka' }))

    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      current_step: 'details',
      payload: expect.objectContaining({ title: '', total: '' }),
    })))
    expect(mocks.shareDraft).not.toHaveBeenCalled()
    expect(mocks.finalizeDraft).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))
    expect(mocks.push).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
  })

  it('pins a fresh event in the private draft without auto-selecting roster guests', async () => {
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialMembers: [{
        key: 'self',
        label: 'Ég',
        input: { type: 'self', key: 'self' },
        isSelf: true,
      }],
      eventSources: [{
        id: '70000000-0000-4000-8000-000000000001',
        name: 'Helgarferð',
        rosterRevision: 4,
        guests: [{
          id: '70000000-0000-4000-8000-000000000002',
          displayName: 'Anna',
          sourceKind: 'manual_name',
        }],
      }],
      initialEventSource: {
        id: '70000000-0000-4000-8000-000000000001',
        name: 'Helgarferð',
        rosterRevision: 4,
        guests: [{
          id: '70000000-0000-4000-8000-000000000002',
          displayName: 'Anna',
          sourceKind: 'manual_name',
        }],
      },
    })
    const linkCheckbox = screen.getByRole('checkbox', {
      name: /Tengja kostnað við viðburðinn/,
    })
    expect(linkCheckbox).toBeChecked()
    expect(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeEnabled()
    fireEvent.click(linkCheckbox)
    expect(linkCheckbox).not.toBeChecked()
    fillDetails()
    await next('Áfram í skiptingu')

    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      context_type: 'one_off',
      group_id: null,
      payload: expect.objectContaining({
        eventId: '70000000-0000-4000-8000-000000000001',
        eventRosterRevision: 4,
        eventVisibility: 'participants_only',
        linkToEvent: false,
        members: [expect.objectContaining({ key: 'self' })],
      }),
    }))
    expect(screen.queryByRole('checkbox', { name: 'Anna' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Greiðandi 1' })).toHaveValue('self')
  })

  it('persists an explicit all-event choice before finalizing a linked one-off expense', async () => {
    const event = {
      id: '70500000-0000-4000-8000-000000000001',
      name: 'Helgarferð',
      rosterRevision: 4,
      guests: [],
    }
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      eventSources: [event],
      initialEventSource: event,
    })
    expect(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    fillDetails()
    await next('Áfram í skiptingu')
    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))

    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_publication_version: null,
      split_confirmed: true,
    })))
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        eventId: event.id,
        linkToEvent: true,
        eventVisibility: 'all_event',
      }),
    }))
  })

  it('restores an explicit all-event choice only for the same available Event draft', () => {
    const event = {
      id: '71500000-0000-4000-8000-000000000002',
      name: 'Helgarferð',
      rosterRevision: 4,
      guests: [],
    }
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialMembers: [{ key: 'self', label: 'Ég', input: { type: 'self', key: 'self' }, isSelf: true }],
      draft: savedEventDraft(event.id, 'all_event'),
      eventSources: [event],
    })

    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Aðeins þátttakendur kostnaðarins/ })).not.toBeChecked()
  })

  it('preserves the visibility axis after unlink/re-enable and after switching Events', () => {
    const firstEvent = {
      id: '71600000-0000-4000-8000-000000000001',
      name: 'Fyrri ferð',
      rosterRevision: 4,
      guests: [],
    }
    const secondEvent = {
      id: '71600000-0000-4000-8000-000000000002',
      name: 'Seinni ferð',
      rosterRevision: 2,
      guests: [],
    }
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialStep: 'split',
      initialMembers: [{ key: 'self', label: 'Ég', input: { type: 'self', key: 'self' }, isSelf: true }],
      eventSources: [firstEvent, secondEvent],
      initialEventSource: firstEvent,
    })

    const broad = screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })
    fireEvent.click(broad)
    const link = screen.getByRole('checkbox', { name: /Tengja kostnað við viðburðinn/ })
    fireEvent.click(link)
    expect(screen.queryByRole('radio', { name: /Allir sem sjá viðburðinn/ })).not.toBeInTheDocument()
    fireEvent.click(link)
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Breyta viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seinni ferð' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))

    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
  })

  it('preserves an explicit broad choice when finalization returns an error', async () => {
    const event = {
      id: '71700000-0000-4000-8000-000000000001',
      name: 'Helgarferð',
      rosterRevision: 4,
      guests: [],
    }
    mocks.finalizeDraft.mockResolvedValueOnce({ ok: false, error: 'save_failed' })
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      eventSources: [event],
      initialEventSource: event,
    })
    fillDetails()
    fireEvent.click(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ }))
    await next('Áfram í skiptingu')
    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að vista.')
    expect(screen.getByRole('radio', { name: /Allir sem sjá viðburðinn/ })).toBeChecked()
  })

  it('explicitly clears a relationship circle before the event source is selected', () => {
    renderForm({
      mode: 'one_off',
      groupId: undefined,
      initialStep: 'split',
      initialMembers: [
        {
          key: 'self',
          label: 'Ég',
          input: { type: 'self', key: 'self' },
          isSelf: true,
        },
        {
          key: 'guest:bjarni',
          label: 'Bjarni',
          input: { type: 'guest', key: 'guest:bjarni', display_name: 'Bjarni' },
          isSelf: false,
        },
      ],
      circleOptions: [{
        id: '71000000-0000-4000-8000-000000000001',
        name: 'Fjölskyldan',
        members: [{
          circleMemberId: '71000000-0000-4000-8000-000000000002',
          displayName: 'Anna',
          isSelf: false,
        }],
      }],
      eventSources: [{
        id: '71000000-0000-4000-8000-000000000003',
        name: 'Helgarferð',
        rosterRevision: 2,
        guests: [],
      }],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: /Fjölskyldan/ }))

    expect(screen.getByRole('button', { name: 'Hreinsa tengslahring' })).toHaveClass('min-h-11')
    expect(screen.getByRole('checkbox', { name: 'Anna' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Hreinsa tengslahring' }))

    expect(screen.queryByRole('button', { name: 'Hreinsa tengslahring' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Anna' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Bjarni' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Úr viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: 'Helgarferð' }))
    expect(screen.getByText('Valinn viðburður')).toBeInTheDocument()
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

  it('persists multiple payers before finalizing the simplified weighted allocation', async () => {
    renderForm()
    fillDetails()
    await next('Áfram í skiptingu')
    fireEvent.click(screen.getByRole('button', { name: 'Fleiri' }))
    const amounts = screen.getAllByRole('textbox', { name: /Upphæð/ })
    fireEvent.change(amounts[0]!, { target: { value: '6000' } })
    fireEvent.change(amounts[1]!, { target: { value: '4000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))
    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalled())
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        splitMethod: 'weighted',
        payments: expect.objectContaining({ 'member-self': '6000', 'member-anna': '4000' }),
      }),
    }))
    expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 1,
      expected_publication_version: null,
      split_confirmed: true,
    }))
  })

  it('starts resumed confirmation unchecked and clears it permanently after an allocation change', async () => {
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    const confirmation = screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ })
    expect(confirmation).not.toBeChecked()
    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()

    const payerAmount = screen.getByRole('textbox', { name: 'Upphæð Ég' })
    fireEvent.change(payerAmount, { target: { value: '9000' } })
    await waitFor(() => expect(confirmation).not.toBeChecked())
    fireEvent.change(payerAmount, { target: { value: '10000' } })

    expect(confirmation).not.toBeChecked()
    expect(confirmation).toBeEnabled()
  })

  it('persists changed private input before refreshing and sharing the draft', async () => {
    mocks.saveDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        version: 3,
        savedAt: '2026-08-26T09:05:00.000Z',
      },
    })
    mocks.refreshPublicationLifecycle.mockResolvedValue({
      status: 'ready',
      draftId: '81000000-0000-4000-8000-000000000001',
      draftVersion: 3,
      sharingState: 'never_shared',
      expectedPublicationVersion: null,
      hasUnsharedChanges: false,
    })
    mocks.shareDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 3,
        publicationVersion: 1,
        allocationState: 'balanced_unconfirmed',
      },
    })
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    fireEvent.change(within(split).getAllByRole('textbox', { name: 'Hlutir' })[0]!, {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Deila drögum' }))

    await waitFor(() => expect(mocks.shareDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: '81000000-0000-4000-8000-000000000001',
      expected_draft_version: 3,
      expected_publication_version: null,
    })))
    expect(mocks.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshPublicationLifecycle.mock.invocationCallOrder[0]!,
    )
    expect(mocks.refreshPublicationLifecycle.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shareDraft.mock.invocationCallOrder[0]!,
    )
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))
  })

  it('locks the full form while a publication mutation is pending', async () => {
    let resolveShare!: (value: {
      ok: true
      data: {
        draftId: string
        draftVersion: number
        publicationVersion: number
        allocationState: 'balanced_unconfirmed'
      }
    }) => void
    mocks.shareDraft.mockReturnValueOnce(new Promise((resolve) => {
      resolveShare = resolve
    }))
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Deila drögum' }))
    await waitFor(() => expect(mocks.shareDraft).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: 'Upphæð Ég' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ })).toBeDisabled()

    resolveShare({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        publicationVersion: 1,
        allocationState: 'balanced_unconfirmed',
      },
    })
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Upphæð Ég' })).toBeEnabled())
  })

  it('does not call incomplete amount work an unshared visible change', () => {
    const draft = savedGroupDraft()
    draft.payload.payments = { 'member-self': '5000', 'member-anna': '' }
    renderForm({
      draft,
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'Upphæð Ég' }), {
      target: { value: '4000' },
    })

    expect(screen.queryByText('Ódeildar breytingar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deila breytingum' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vista og loka' })).toBeInTheDocument()
  })

  it('requires stale shared input to be reshared before it can be finalized', () => {
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: true,
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    expect(screen.getByRole('button', { name: 'Deila breytingum' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Staðfesta kostnað' })).not.toBeInTheDocument()
    expect(mocks.finalizeDraft).not.toHaveBeenCalled()
  })

  it('finalizes a current shared draft with its exact live publication version', async () => {
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))

    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 2,
      expected_publication_version: 7,
      split_confirmed: true,
    })))
  })

  it('does not reload the draft route between a dirty save and finalization', async () => {
    const draft = savedGroupDraft()
    mocks.saveDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: draft.id,
        version: 3,
        savedAt: '2026-08-31T00:00:00.000Z',
        relationStatus: 'unchanged',
        eventId: null,
        eventRosterRevision: null,
        privacyFailClosed: false,
      },
    })
    mocks.refreshPublicationLifecycle.mockResolvedValueOnce({
      status: 'ready',
      draftId: draft.id,
      draftVersion: 3,
      sharingState: 'never_shared',
      expectedPublicationVersion: null,
      hasUnsharedChanges: false,
    })
    renderForm({
      draft,
      publicationLifecycle: {
        status: 'ready',
        draftId: draft.id,
        draftVersion: draft.version,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    const weights = within(split).getAllByRole('textbox', { name: 'Hlutir' })
    fireEvent.change(weights[1]!, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))

    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: draft.id,
      expected_version: 2,
      current_step: 'split',
    })))
    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: draft.id,
      expected_draft_version: 3,
      split_confirmed: true,
    })))
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1',
    )
  })

  it('retires the exact consumed draft route after finalization and cannot submit it again', async () => {
    const draft = savedGroupDraft()
    renderForm({
      draft,
      publicationLifecycle: {
        status: 'ready',
        draftId: draft.id,
        draftVersion: draft.version,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    const finalizeButton = screen.getByRole('button', { name: 'Staðfesta kostnað' })
    fireEvent.click(finalizeButton)

    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalledTimes(1))
    expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft_id: draft.id,
      expected_draft_version: draft.version,
      expected_publication_version: null,
      split_confirmed: true,
    }))
    await waitFor(() => expect(finalizeButton).toBeDisabled())

    fireEvent.click(finalizeButton)
    expect(mocks.finalizeDraft).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1')
    expect(mocks.push).not.toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-1')
  })

  it('finalizes a withdrawn draft with null instead of its retained publication generation', async () => {
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'withdrawn',
        expectedPublicationVersion: 9,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Staðfesta kostnað' }))

    await waitFor(() => expect(mocks.finalizeDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 2,
      expected_publication_version: null,
      split_confirmed: true,
    })))
  })

  it('uses the route-loaded lifecycle when explicitly withdrawing a shared draft', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mocks.unshareDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        publicationVersion: 8,
      },
    })
    renderForm({
      draft: savedGroupDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: false,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hætta að deila' }))

    await waitFor(() => expect(mocks.unshareDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 2,
      expected_publication_version: 7,
    })))
    expect(mocks.refreshPublicationLifecycle).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/draft\?draft=/))
    expect(screen.getByRole('button', { name: 'Deila drögum' })).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('[V167] lets a private edit revision reconfirm its allocation without a publication step', () => {
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    const confirmation = screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ })
    expect(confirmation).not.toBeChecked()
    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Hlutir' })[0]!, {
      target: { value: '2' },
    })
    expect(confirmation).not.toBeChecked()
    fireEvent.click(confirmation)
    expect(screen.getByRole('button', { name: 'Vista breytingar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Deila breytingum' })).not.toBeInTheDocument()
  })

  it('[V167] reuses one request id for the exact post-save private reconfirm payload', async () => {
    mocks.saveDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        version: 3,
        savedAt: '2026-08-31T18:00:00.000Z',
        relationStatus: 'unchanged',
        eventId: null,
        eventRosterRevision: null,
        privacyFailClosed: false,
      },
    })
    mocks.reconfirmRevision
      .mockResolvedValueOnce({ ok: false, error: 'save_outcome_unknown' })
      .mockResolvedValueOnce({
        ok: true,
        data: { groupId: 'group-1', expenseId: 'expense-1', financialVersion: 2, unchanged: false },
      })
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    fireEvent.change(screen.getAllByRole('textbox', { name: 'Hlutir' })[0]!, {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista breytingar' }))

    await waitFor(() => expect(mocks.reconfirmRevision).toHaveBeenCalledTimes(1))
    const firstPayload = mocks.reconfirmRevision.mock.calls[0]![0]
    expect(firstPayload).toEqual(expect.objectContaining({
      draft_id: '81000000-0000-4000-8000-000000000001',
      expected_draft_version: 3,
      expected_publication_version: null,
    }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ekki tókst að staðfesta niðurstöðu vistunar.')

    fireEvent.click(screen.getByRole('button', { name: 'Vista breytingar' }))

    await waitFor(() => expect(mocks.reconfirmRevision).toHaveBeenCalledTimes(2))
    const secondPayload = mocks.reconfirmRevision.mock.calls[1]![0]
    const { request_id: firstRequestId, ...firstSemanticPayload } = firstPayload
    const { request_id: secondRequestId, ...secondSemanticPayload } = secondPayload
    expect(secondSemanticPayload).toEqual(firstSemanticPayload)
    expect(secondRequestId).toBe(firstRequestId)
    expect(secondPayload.expected_draft_version).toBe(firstPayload.expected_draft_version)
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1)
  })

  it('[V167] makes reshare primary for dirty shared edits and keeps unshare separate', async () => {
    mocks.refreshPublicationLifecycle.mockResolvedValueOnce({
      status: 'ready',
      draftId: '81000000-0000-4000-8000-000000000001',
      draftVersion: 2,
      sharingState: 'shared',
      expectedPublicationVersion: 7,
      hasUnsharedChanges: true,
    })
    mocks.shareDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        publicationVersion: 8,
        allocationState: 'balanced_unconfirmed',
      },
    })
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: true,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    const confirmation = screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ })
    fireEvent.click(confirmation)
    const shareChanges = screen.getByRole('button', { name: 'Deila breytingum' })
    expect(screen.getByRole('button', { name: 'Hætta að deila' })).toBeInTheDocument()

    fireEvent.click(shareChanges)

    await waitFor(() => expect(mocks.shareDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 2,
      expected_publication_version: 7,
    })))
    expect(mocks.unshareDraft).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vista breytingar' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Hætta að deila' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vista breytingar' }))
    await waitFor(() => expect(mocks.reconfirmRevision).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 2,
      expected_publication_version: 8,
    })))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('[V167] keeps a failed shared-edit republish bounded and privacy-safe', async () => {
    mocks.refreshPublicationLifecycle.mockResolvedValueOnce({
      status: 'ready',
      draftId: '81000000-0000-4000-8000-000000000001',
      draftVersion: 2,
      sharingState: 'shared',
      expectedPublicationVersion: 7,
      hasUnsharedChanges: true,
    })
    mocks.shareDraft.mockResolvedValueOnce({ ok: false, error: 'conflict' })
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: true,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Deila breytingum' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Gögnin hafa breyst.')
    expect(screen.queryByText(/sqlstate|expense_|publication|rpc|81000000-/i)).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.unshareDraft).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deila breytingum' })).toBeEnabled())
  })

  it('[V167] discards a bound edit only through the exact revision action', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'shared',
        expectedPublicationVersion: 7,
        hasUnsharedChanges: false,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hætta við breytingar' }))

    await waitFor(() => expect(mocks.discardRevision).toHaveBeenCalledWith(expect.objectContaining({
      expense_id: 'expense-1',
      draft_id: '81000000-0000-4000-8000-000000000001',
      expected_draft_version: 2,
      expected_publication_version: 7,
    })))
    expect(mocks.reconfirmRevision).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('persists changed edit details through the bound revision draft', async () => {
    const baseDraft = savedEditDraft()
    const draft = {
      ...baseDraft,
      currentStep: 'details' as const,
      payload: {
        ...baseDraft.payload,
        title: 'Gamalt heiti',
        note: 'Gömul lýsing',
      },
    }
    renderForm({
      initialStep: 'details',
      draft,
      publicationLifecycle: {
        status: 'ready',
        draftId: draft.id,
        draftVersion: draft.version,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
      edit: { expense: editableExpense(), expectedFinancialVersion: 1 },
    })

    const title = screen.getByRole('textbox', { name: 'Heiti útgjalds' })
    const description = screen.getByRole('textbox', { name: /Lýsing/ })
    expect(title).toHaveValue('Gamalt heiti')
    expect(description).toHaveValue('Gömul lýsing')

    fireEvent.change(title, { target: { value: 'Nýtt heiti' } })
    fireEvent.change(description, { target: { value: 'Ný lýsing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vista og loka' }))

    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      context_type: 'edit',
      expense_id: 'expense-1',
      payload: expect.objectContaining({
        title: 'Nýtt heiti',
        note: 'Ný lýsing',
      }),
    })))
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.reconfirmRevision).not.toHaveBeenCalled()
  })

  it('keeps edit values and explains a durably referenced participant removal', async () => {
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
    mocks.reconfirmRevision.mockResolvedValueOnce({ ok: false, error: 'referenced_participant' })
    renderForm({
      initialStep: 'split',
      draft: savedEditDraft(),
      publicationLifecycle: {
        status: 'ready',
        draftId: '81000000-0000-4000-8000-000000000001',
        draftVersion: 2,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
      edit: { expense: editExpense, expectedFinancialVersion: 1 },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista breytingar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Haltu þátttakandanum inni í skiptingunni og reyndu aftur.',
    )
    expect(screen.queryByText(/sqlstate|expense_share|collaborator|invitation|rpc/i)).not.toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
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

  it('shares an underallocated fixed split as a recoverable draft without creating ledger state', async () => {
    const draft = savedGroupDraft()
    mocks.saveDraft.mockResolvedValueOnce({
      ok: true,
      data: {
        draftId: draft.id,
        version: 3,
        savedAt: '2026-08-31T18:00:00.000Z',
        relationStatus: 'unchanged',
        eventId: null,
        eventRosterRevision: null,
        privacyFailClosed: false,
      },
    })
    mocks.refreshPublicationLifecycle.mockResolvedValueOnce({
      status: 'ready',
      draftId: draft.id,
      draftVersion: 3,
      sharingState: 'never_shared',
      expectedPublicationVersion: null,
      hasUnsharedChanges: false,
    })
    renderForm({
      initialStep: 'split',
      draft,
      publicationLifecycle: {
        status: 'ready',
        draftId: draft.id,
        draftVersion: draft.version,
        sharingState: 'never_shared',
        expectedPublicationVersion: null,
        hasUnsharedChanges: false,
      },
    })

    const split = screen.getByRole('group', { name: 'Hvernig skiptist greiðslan?' })
    fireEvent.click(within(split).getByRole('radio', { name: 'Föst upphæð' }))
    const shares = within(split).getAllByRole('textbox', { name: 'Föst upphæð' })
    fireEvent.change(shares[0]!, { target: { value: '1000' } })
    fireEvent.change(shares[1]!, { target: { value: '1000' } })

    expect(screen.getByText(/8\.000.*óúthlutaðar/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Þetta er rétt skipting/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Deila drögum' }))

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
    await waitFor(() => expect(mocks.shareDraft).toHaveBeenCalledWith(expect.objectContaining({
      expected_draft_version: 3,
      expected_publication_version: null,
    })))
    expect(mocks.finalizeDraft).not.toHaveBeenCalled()
  })
})
