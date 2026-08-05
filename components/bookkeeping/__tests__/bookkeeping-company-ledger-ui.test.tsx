import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BookkeepingCompanyLedgerView } from '@/lib/bookkeeping/types'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string) => key.replace('teskeid.bookkeeping.', ''),
}))

import { BookkeepingCompanyLedger } from '@/components/bookkeeping/BookkeepingCompanyLedger'

const ledger: BookkeepingCompanyLedgerView = {
  entity: {
    id: '11111111-1111-4111-8111-111111111111', ownerUserId: 'user',
    displayName: 'Gott vibe', legalName: null, legalIdentifier: null,
    defaultCurrency: 'ISK', detailsConfirmed: true,
    createdAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z',
  },
  transactions: [{
    id: '22222222-2222-4222-8222-222222222222',
    entityId: '11111111-1111-4111-8111-111111111111', state: 'inbox',
    direction: null, documentDate: null, paymentDate: null, counterparty: null,
    counterpartyKind: null, description: 'Kvittun', grossMinor: 12_500,
    currency: 'ISK', roughCategory: null, vatDisposition: 'unclassified',
    sourceType: 'manual', version: 1, voidedAt: null, attachments: [], vatLink: null,
    createdAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z',
  }],
}

describe('company ledger UI', () => {
  it('shows counted filters and lets a user select the list filter', () => {
    render(<BookkeepingCompanyLedger ledger={ledger} />)
    expect(screen.getByRole('button', { name: /ledger\.filters\.all 1/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /ledger\.filters\.outflow 0/ }))
    expect(screen.getByText('ledger.empty')).toBeInTheDocument()
  })

  it('uses entity-scoped create and detail links with touch-sized rows', () => {
    const { container } = render(<BookkeepingCompanyLedger ledger={ledger} />)
    expect(screen.getByRole('link', { name: /ledger\.new/ })).toHaveAttribute(
      'href', '/auth-mvp/bokhaldid/einingar/11111111-1111-4111-8111-111111111111/faerslur/ny',
    )
    expect(container.querySelector('a.min-h-20')).toBeTruthy()
    expect(container.querySelector('.overflow-x-auto')).toBeTruthy()
  })
})
