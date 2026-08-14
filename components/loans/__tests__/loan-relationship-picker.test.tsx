import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'

const { mockAddLoanInvitation, mockSetLoanCounterpartyName } = vi.hoisted(() => ({
  mockAddLoanInvitation: vi.fn(),
  mockSetLoanCounterpartyName: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    counterpartyPickerTrigger: 'Bæta mótaðila við',
    counterpartyPickerTitle: 'Bæta mótaðila við',
    counterpartyPickerDescription: 'Veldu þekktan aðila eða sláðu inn nafn eða netfang.',
    counterpartyPickerSource: 'Tegund mótaðila',
    counterpartyPickerKnownMode: 'Þekktur aðili',
    counterpartyPickerManualMode: 'Nafn eða netfang',
    counterpartyPickerInputLabel: 'Nafn eða netfang',
    counterpartyPickerInputPlaceholder: 'Nafn eða nafn@netfang.is',
    counterpartyPickerHint: 'Netfang sendir boð. Nafn eitt vistast aðeins á þessari færslu.',
    counterpartyPickerSubmit: 'Bæta mótaðila við',
    counterpartyEmailInvalid: 'Sláðu inn gilt netfang.',
    counterpartyNameInvalid: 'Sláðu inn nafn.',
    counterpartyLoadError: 'Ekki tókst að sækja Tengsl.',
    selectedCounterparty: 'Mótaðili',
    changeCounterparty: 'Breyta mótaðila',
    removeCounterparty: 'Fjarlægja mótaðila',
    closeRelationshipPicker: 'Loka vali á tengdum aðila',
    searchLabel: 'Leita',
    relationshipPickerSearchPlaceholder: 'Nafn, netfang eða label',
    relationshipLabelFilter: 'Sía',
    allRelationshipLabels: 'Allir',
    noSearchResults: 'Engar niðurstöður fundust.',
    save: 'Vista',
    saving: 'Vista...',
    cancel: 'Hætta við',
    counterpartySaved: 'Mótaðili vistaður.',
    addPartySaved: 'Vistað og boð sent',
    'errors.saveFailed': 'Villa við vistun',
  }[key] ?? key),
}))
vi.mock('@/lib/loans/actions', () => ({
  addLoanInvitation: mockAddLoanInvitation,
  setLoanCounterpartyName: mockSetLoanCounterpartyName,
}))

import { AddPartyForm } from '../AddPartyForm'
import {
  LoanRelationshipPicker,
  parseLoanCounterpartyInput,
  type LoanCounterpartySelection,
} from '../LoanRelationshipPicker'
import type { RelationshipRecipientOption } from '@/lib/relationships/actions'

const emailRelationship: RelationshipRecipientOption = {
  id: 'relationship-email', email: 'canonical@example.is', selfDisplayName: null,
  privateDisplayName: 'Kórfélagi', note: 'Eigandanóta', tags: ['friends'],
  customLabels: [{ id: 'choir', name: 'Kórinn' }],
}
const nameRelationship: RelationshipRecipientOption = {
  id: 'relationship-name', email: null, selfDisplayName: null,
  privateDisplayName: 'Palli pípari', note: null, tags: [], customLabels: [],
}

function ControlledPicker({ options = [emailRelationship, nameRelationship] }: { options?: RelationshipRecipientOption[] }) {
  const [value, setValue] = useState<LoanCounterpartySelection | null>(null)
  return <LoanRelationshipPicker options={options} value={value} onChange={setValue} />
}

beforeEach(() => vi.clearAllMocks())

describe('LoanRelationshipPicker', () => {
  it('is always available and supports a name or email even without Relationships', () => {
    render(<ControlledPicker options={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    expect(screen.getByRole('button', { name: 'Nafn eða netfang' })).toBeEnabled()
  })

  it('maps an email-backed relationship without returning owner-private metadata', () => {
    render(<ControlledPicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    fireEvent.click(screen.getByRole('button', { name: /Kórfélagi/ }))
    expect(screen.getByText('Kórfélagi')).toBeInTheDocument()
    expect(screen.queryByText('Eigandanóta')).not.toBeInTheDocument()
  })

  it('maps a name-only Relationship to the private-name path', () => {
    render(<ControlledPicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    fireEvent.click(screen.getByRole('button', { name: /Palli pípari/ }))
    expect(screen.getByText('Palli pípari')).toBeInTheDocument()
  })

  it('does not render an inaccessible counterpart-only option without a display label', () => {
    render(<ControlledPicker options={[{
      id: 'relationship-empty-profile',
      email: null,
      selfDisplayName: ' ',
      privateDisplayName: null,
      note: 'Má ekki birtast',
      tags: [],
      customLabels: [],
    }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    expect(screen.getByRole('button', { name: 'Þekktur aðili' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Nafn eða netfang' })).toBeInTheDocument()
    expect(screen.queryByText('Má ekki birtast')).not.toBeInTheDocument()
  })

  it('classifies canonical email and NFC name while rejecting malformed email', () => {
    expect(parseLoanCounterpartyInput(' TEST@Example.IS ')).toEqual({
      selection: { kind: 'email', email: 'test@example.is', displayLabel: 'test@example.is' },
    })
    expect(parseLoanCounterpartyInput(' Páll ')).toEqual({
      selection: { kind: 'name', name: 'Páll', displayLabel: 'Páll' },
    })
    expect(parseLoanCounterpartyInput('bad@')).toEqual({ error: 'email' })
  })
})

describe('AddPartyForm', () => {
  it('submits an email selection only through the invitation action', async () => {
    mockAddLoanInvitation.mockResolvedValue({ ok: false, error: 'save_failed' })
    render(<AddPartyForm loanId="loan-1" relationshipOptions={[emailRelationship]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    fireEvent.click(screen.getByRole('button', { name: /Kórfélagi/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }))
    await waitFor(() => expect(mockAddLoanInvitation).toHaveBeenCalledWith('loan-1', {
      recipient_email: 'canonical@example.is',
    }))
    expect(mockSetLoanCounterpartyName).not.toHaveBeenCalled()
  })

  it('submits a manual name only through the private-name action', async () => {
    mockSetLoanCounterpartyName.mockResolvedValue({ ok: false, error: 'save_failed' })
    render(<AddPartyForm loanId="loan-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Bæta mótaðila við' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), { target: { value: 'Palli pípari' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bæta mótaðila við' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }))
    await waitFor(() => expect(mockSetLoanCounterpartyName).toHaveBeenCalledWith('loan-1', {
      counterparty_name: 'Palli pípari',
    }))
    expect(mockAddLoanInvitation).not.toHaveBeenCalled()
  })
})
