import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ExpenseSharedDraftDetailView } from '@/lib/expenses/unconfirmed-publication'

const translations: Record<string, string> = {
  'sharedDraftDetail.lifecycle': 'Drög með öðrum',
  'sharedDraftDetail.helper': 'Þetta er enn í vinnslu og hefur ekki áhrif á stöðuna þína.',
  'sharedDraftDetail.summary': 'Yfirlit draga',
  'sharedDraftDetail.total': 'Heild',
  'sharedDraftDetail.balancedStatus': '{firstName} á eftir að staðfesta skiptinguna.',
  'sharedDraftDetail.incompleteStatus': 'Skiptingin er enn í vinnslu.',
  'sharedDraftDetail.allocationTitle': 'Tillaga að skiptingu',
  'sharedDraftDetail.participantHelper': 'Þú þarft ekki að samþykkja drögin. Höfundur staðfestir kostnaðinn þegar skiptingin er tilbúin.',
  'sharedDraftDetail.authorRole': 'Höfundur',
  'sharedDraftDetail.payerRole': 'Greiðandi',
  'sharedDraftDetail.participantRole': 'Tekur þátt',
  'sharedDraftDetail.proposedPaid': 'Útlagður kostnaður',
  'sharedDraftDetail.proposedShare': 'Hluti í heildarkostnaði',
  'common.date': 'Dagsetning',
  'common.status': 'Staða',
}

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('is'),
  getTranslations: vi.fn().mockResolvedValue((key: string, values?: Record<string, string>) => {
    const message = translations[key.replace(/^teskeid\.expenses\./, '')] ?? key
    return Object.entries(values ?? {}).reduce(
      (rendered, [name, value]) => rendered.replace(`{${name}}`, value),
      message,
    )
  }),
}))

import { ExpenseSharedDraftDetail } from '@/components/expenses/ExpenseSharedDraftDetail'

type ReadyDetail = Extract<ExpenseSharedDraftDetailView, { status: 'ready' }>

function detail(overrides: Partial<ReadyDetail> = {}): ReadyDetail {
  return {
    status: 'ready',
    lifecycleState: 'shared_draft',
    publicationId: '30000000-0000-4000-8000-000000000001',
    publicationVersion: 2,
    title: 'Kvöldmatur',
    totalMinor: 12_000,
    currency: 'ISK',
    incurredOn: '2026-08-26',
    allocationState: 'balanced_unconfirmed',
    viewerRole: 'participant',
    parties: [{
      displayName: 'Stefán Halldór Jónsson',
      isAuthor: true,
      isPayer: true,
      isParticipant: true,
      proposedPaidMinor: 12_000,
      proposedShareMinor: 6_000,
    }, {
      displayName: 'Anna',
      isAuthor: false,
      isPayer: false,
      isParticipant: true,
      proposedPaidMinor: 0,
      proposedShareMinor: 6_000,
    }],
    ...overrides,
  }
}

describe('ExpenseSharedDraftDetail read-only proposal UI', () => {
  it('shows only safe proposed allocation language and no financial actions', async () => {
    render(await ExpenseSharedDraftDetail({ draft: detail() }))

    expect(screen.getByText('Drög með öðrum')).toBeInTheDocument()
    expect(screen.getByText('Tillaga að skiptingu')).toBeInTheDocument()
    expect(screen.getByText('Stefán Halldór Jónsson')).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getAllByText('Hluti í heildarkostnaði')).toHaveLength(2)
    expect(screen.getAllByText('Útlagður kostnaður')).toHaveLength(2)
    expect(screen.getByText('Stefán á eftir að staðfesta skiptinguna.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/Þú skuldar|Þú átt inni|Gera upp/)
  })

  it('does not invent party amounts for an incomplete shared snapshot', async () => {
    render(await ExpenseSharedDraftDetail({
      draft: detail({
        allocationState: 'incomplete',
        parties: [{
          displayName: 'Stebbi',
          isAuthor: true,
          isPayer: true,
          isParticipant: true,
          proposedPaidMinor: null,
          proposedShareMinor: null,
        }],
      }),
    }))

    expect(screen.getByText('Skiptingin er enn í vinnslu.')).toBeInTheDocument()
    expect(screen.queryByText('Útlagður kostnaður')).not.toBeInTheDocument()
    expect(screen.queryByText('Hluti í heildarkostnaði')).not.toBeInTheDocument()
  })
})
