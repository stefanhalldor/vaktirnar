import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelationshipListItem } from '@/lib/relationships/actions'
import type { RelationshipCustomLabel } from '@/lib/relationships/types'

const { mockRefresh, mockSetAssignment } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSetAssignment: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      savedCircleGroups: 'Vistaðir aðilahópar',
      filterByLabel: 'Sía eftir mínum labelum',
      all: 'Allt',
      quickLabels: 'Flokka',
      selectRelationship: `Velja ${values?.name ?? ''}`,
      bulkSelected: `${values?.count ?? 0} aðilar valdir`,
      bulkLabel: 'Veldu label',
      bulkAdd: 'Setja í flokk',
      bulkRemove: 'Taka úr flokki',
      emptyFilter: 'Engin tengsl eru með þennan label.',
      empty: 'Engin tengsl.',
      unknownContact: 'Óþekktur aðili',
      'errors.updateFailed': 'Ekki tókst að uppfæra.',
    }
    return translations[key] ?? key
  },
}))

vi.mock('@/lib/relationships/actions-v2', () => ({
  setRelationshipLabelAssignmentV2: mockSetAssignment,
}))

import { RelationshipDirectoryClient } from '@/components/tengsl/RelationshipDirectoryClient'

const items: RelationshipListItem[] = [
  { id: 'rel-anna', private_display_name: 'Anna', counterpart_display_name: null, email_canonical: 'anna@example.test', created_at: '2026-08-06', tags: [] },
  { id: 'rel-bjarni', private_display_name: 'Bjarni', counterpart_display_name: null, email_canonical: 'bjarni@example.test', created_at: '2026-08-06', tags: [] },
]

const labels: RelationshipCustomLabel[] = [
  { id: 'label-family', name: 'Fjölskylda', normalizedName: 'fjölskylda', version: 1, relationshipCount: 1 },
  { id: 'label-friends', name: 'Vinir', normalizedName: 'vinir', version: 1, relationshipCount: 0 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockSetAssignment.mockResolvedValue({ ok: true, data: undefined })
})

describe('RelationshipDirectoryClient quick labels', () => {
  it('links to saved contact groups without a misleading partial count', () => {
    render(<RelationshipDirectoryClient items={items} labels={labels} relationshipLabelIds={{}} />)

    expect(screen.getByRole('link', { name: 'Vistaðir aðilahópar' })).toHaveAttribute(
      'href',
      '/stillingar/tengsl/hringir',
    )
  })

  it('toggles a private label directly from a relationship row', async () => {
    render(<RelationshipDirectoryClient items={items} labels={labels} relationshipLabelIds={{ 'rel-anna': ['label-family'] }} />)

    const annaRow = screen.getByText('Anna').closest('li')
    expect(annaRow).not.toBeNull()
    fireEvent.click(within(annaRow!).getByRole('button', { name: 'Fjölskylda' }))

    await waitFor(() => expect(mockSetAssignment).toHaveBeenCalledWith(expect.objectContaining({
      relationship_id: 'rel-anna',
      label_id: 'label-family',
      assigned: false,
      request_id: expect.any(String),
    })))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('bulk-assigns one existing label to every selected relationship', async () => {
    render(<RelationshipDirectoryClient items={items} labels={labels} relationshipLabelIds={{}} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Velja Anna' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Velja Bjarni' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setja í flokk' }))

    await waitFor(() => expect(mockSetAssignment).toHaveBeenCalledTimes(2))
    expect(mockSetAssignment).toHaveBeenCalledWith(expect.objectContaining({ relationship_id: 'rel-anna', label_id: 'label-family', assigned: true }))
    expect(mockSetAssignment).toHaveBeenCalledWith(expect.objectContaining({ relationship_id: 'rel-bjarni', label_id: 'label-family', assigned: true }))
  })
})
