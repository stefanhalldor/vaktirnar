import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRefresh, mockUpdateRelationshipDetails } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockUpdateRelationshipDetails: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    privateDetailsHint: 'Þetta er aðeins fyrir þig. Hinn aðilinn sér aldrei þetta heiti eða skýringuna hjá sér.',
    privateDisplayName: 'Mitt heiti á þessum aðila',
    note: 'Mín skýring á þessum aðila',
    vistaDetails: 'Vista',
    savingDetails: 'Vistar…',
    detailsVistadur: 'Vistað.',
    myLabels: 'Flokkun',
    privateLabelsHint: 'Flokkunin er aðeins sýnileg þér og sést aldrei hjá hinum aðilanum.',
    noLabels: 'Engir flokkar.',
    newLabelName: 'Nýr flokkur',
    addLabel: 'Bæta við',
    'errors.updateFailed': 'Ekki tókst að vista.',
  }[key] ?? key),
}))

vi.mock('@/lib/relationships/tag-action', () => ({
  updateRelationshipDetails: mockUpdateRelationshipDetails,
}))

vi.mock('@/lib/relationships/actions-v2', () => ({
  deleteRelationshipLabelV2: vi.fn(),
  saveRelationshipLabelV2: vi.fn(),
  setRelationshipLabelAssignmentV2: vi.fn(),
}))

import { RelationshipDetailsForm } from '@/components/tengsl/RelationshipDetailsForm'
import { RelationshipLabelsForm } from '@/components/tengsl/RelationshipLabelsForm'

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateRelationshipDetails.mockResolvedValue({ ok: true })
})

describe('RelationshipDetailsForm', () => {
  it('makes the owner-only privacy boundary explicit', () => {
    render(<RelationshipDetailsForm relationshipId="rel-id" initialNote={null} initialPrivateDisplayName={null} />)

    expect(screen.getByText(/Hinn aðilinn sér aldrei þetta heiti eða skýringuna/)).toBeDefined()
  })

  it('saves the private display name without sending the note', async () => {
    render(<RelationshipDetailsForm relationshipId="rel-id" initialNote="Gömul skýring" initialPrivateDisplayName="Gamalt heiti" />)
    const input = screen.getByLabelText('Mitt heiti á þessum aðila')
    const form = input.closest('form')

    fireEvent.change(input, { target: { value: 'Mamma' } })
    fireEvent.click(within(form!).getByRole('button', { name: 'Vista' }))

    await waitFor(() => expect(mockUpdateRelationshipDetails).toHaveBeenCalledWith('rel-id', {
      field: 'privateDisplayName',
      value: 'Mamma',
    }))
  })

  it('saves the private note without sending the display name', async () => {
    render(<RelationshipDetailsForm relationshipId="rel-id" initialNote="Gömul skýring" initialPrivateDisplayName="Gamalt heiti" />)
    const textarea = screen.getByLabelText('Mín skýring á þessum aðila')
    const form = textarea.closest('form')

    fireEvent.change(textarea, { target: { value: 'Hringja fyrir afmælið' } })
    fireEvent.click(within(form!).getByRole('button', { name: 'Vista' }))

    await waitFor(() => expect(mockUpdateRelationshipDetails).toHaveBeenCalledWith('rel-id', {
      field: 'note',
      value: 'Hringja fyrir afmælið',
    }))
  })

  it('keeps both save buttons disabled until their own field changes', () => {
    render(<RelationshipDetailsForm relationshipId="rel-id" initialNote="Skýring" initialPrivateDisplayName="Heiti" />)

    expect(screen.getAllByRole('button', { name: 'Vista' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
    fireEvent.change(screen.getByLabelText('Mín skýring á þessum aðila'), { target: { value: 'Ný skýring' } })
    const buttons = screen.getAllByRole('button', { name: 'Vista' })
    expect(buttons[0]).toHaveAttribute('disabled')
    expect(buttons[1]).not.toHaveAttribute('disabled')
  })
})

describe('RelationshipLabelsForm', () => {
  it('uses the approved Classification heading and private explanation', () => {
    render(
      <RelationshipLabelsForm
        relationshipId="rel-id"
        labels={[]}
        assignedLabelIds={[]}
        available
      />,
    )

    expect(screen.getByRole('heading', { name: 'Flokkun' })).toBeDefined()
    expect(screen.getByText(/sést aldrei hjá hinum aðilanum/)).toBeDefined()
  })
})
