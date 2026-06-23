/**
 * Unit tests for components/loans/LoanList.tsx
 *
 * Covers pills, role filters, counts, search, sort, and empty states.
 * LoanCard is stubbed to keep tests focused on list logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('next-intl', () => ({
  useLocale: vi.fn(() => 'is'),
  useTranslations: vi.fn().mockImplementation((ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.loans': {
        open: 'Enn í láni',
        returned: 'Skilað',
        all: 'Allt',
        lent: 'Ég lánaði',
        borrowed: 'Ég fékk lánað',
        noOpen: 'Ekkert í láni.',
        noReturned: 'Ekkert skilað.',
        noSearchResults: 'Engar niðurstöður.',
        searchLabel: 'Leita',
        sortLabel: 'Röðun',
        sortNewest: 'Nýjast fyrst',
        sortOldest: 'Elst fyrst',
      },
    }
    return (key: string) => T[ns]?.[key] ?? key
  }),
}))

vi.mock('@/components/loans/LoanSummaryCard', () => ({
  LoanSummaryCard: ({ item, isHighlighted }: { item: { id: string; item_name: string }; isHighlighted?: boolean }) =>
    React.createElement('div', { 'data-testid': `card-${item.id}`, 'data-highlighted': String(isHighlighted ?? false) }, item.item_name),
}))

import { LoanList } from '@/components/loans/LoanList'
import type { LoanItem } from '@/lib/loans/types'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeItem(overrides: Partial<LoanItem> & { id: string }): LoanItem {
  return {
    item_name: 'Hlutur',
    note: null,
    loaned_at: '2026-01-01',
    due_at: null,
    returned_at: null,
    my_role: 'lender',
    other_display_name: null,
    invitation_id: null,
    invitation_status: null,
    invitation_attempt_status: null,
    can_send_invitation: false,
    is_creator: true,
    requires_acknowledgement: false,
    recipient_email: null,
    ...overrides,
  }
}

const OPEN_LENDER = makeItem({ id: 'a1', item_name: 'Bók', my_role: 'lender', loaned_at: '2026-02-01' })
const OPEN_BORROWER = makeItem({ id: 'a2', item_name: 'Hjól', my_role: 'borrower', loaned_at: '2026-01-01' })
const RETURNED_LENDER = makeItem({ id: 'b1', item_name: 'Stigi', my_role: 'lender', returned_at: '2026-03-01' })
const RETURNED_BORROWER = makeItem({ id: 'b2', item_name: 'Tjald', my_role: 'borrower', returned_at: '2026-02-01' })

const ALL_ITEMS = [OPEN_LENDER, OPEN_BORROWER, RETURNED_LENDER, RETURNED_BORROWER]

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Status pills ──────────────────────────────────────────────────────────────

describe('LoanList — status pills', () => {
  it('renders Enn í láni and Skilað pills', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Enn í láni/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Skilað/ })).toBeDefined()
  })

  it('Enn í láni is selected by default', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Enn í láni/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Skilað/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('only shows open loans by default', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByTestId('card-a1')).toBeDefined()
    expect(screen.getByTestId('card-a2')).toBeDefined()
    expect(screen.queryByTestId('card-b1')).toBeNull()
    expect(screen.queryByTestId('card-b2')).toBeNull()
  })

  it('Allt status pill shows all items (open and returned)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    // First Allt button is the status pill, second is the role pill
    fireEvent.click(screen.getAllByRole('button', { name: /Allt/ })[0])
    expect(screen.getByTestId('card-a1')).toBeDefined()
    expect(screen.getByTestId('card-a2')).toBeDefined()
    expect(screen.getByTestId('card-b1')).toBeDefined()
    expect(screen.getByTestId('card-b2')).toBeDefined()
  })

  it('Allt status pill count shows total (4)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getAllByRole('button', { name: /Allt/ })[0].textContent).toContain('(4)')
  })

  it('clicking Skilað shows returned loans and hides open', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Skilað/ }))
    expect(screen.queryByTestId('card-a1')).toBeNull()
    expect(screen.queryByTestId('card-a2')).toBeNull()
    expect(screen.getByTestId('card-b1')).toBeDefined()
    expect(screen.getByTestId('card-b2')).toBeDefined()
  })
})

// ── Status pill counts ────────────────────────────────────────────────────────

describe('LoanList — status pill counts', () => {
  it('shows correct open count (2)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Enn í láni/ }).textContent).toContain('(2)')
  })

  it('shows correct returned count (2)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Skilað/ }).textContent).toContain('(2)')
  })

  it('status counts are stable when role filter is active', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.getByRole('button', { name: /Enn í láni/ }).textContent).toContain('(2)')
    expect(screen.getByRole('button', { name: /Skilað/ }).textContent).toContain('(2)')
  })
})

// ── Role pills ────────────────────────────────────────────────────────────────

describe('LoanList — role pills', () => {
  it('neither role pill is selected by default', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Ég lánaði/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Ég fékk lánað/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('Ég lánaði filters to lender items only', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.getByTestId('card-a1')).toBeDefined()
    expect(screen.queryByTestId('card-a2')).toBeNull()
  })

  it('Ég fékk lánað filters to borrower items only', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég fékk lánað/ }))
    expect(screen.queryByTestId('card-a1')).toBeNull()
    expect(screen.getByTestId('card-a2')).toBeDefined()
  })

  it('Allt role pill is selected by default (no role filter)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    const alltButtons = screen.getAllByRole('button', { name: /Allt/ })
    // Second Allt button is the role one (first is status)
    const roleAllt = alltButtons[1]
    expect(roleAllt.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking Allt role pill after filter clears role filter', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.queryByTestId('card-a2')).toBeNull()
    const alltButtons = screen.getAllByRole('button', { name: /Allt/ })
    fireEvent.click(alltButtons[1])
    expect(screen.getByTestId('card-a2')).toBeDefined()
  })

  it('clicking selected role pill clears role filter', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.queryByTestId('card-a2')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.getByTestId('card-a2')).toBeDefined()
  })

  it('switching status tab preserves role filter', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég lánaði/ }))
    expect(screen.getByRole('button', { name: /Ég lánaði/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Skilað/ }))
    expect(screen.getByRole('button', { name: /Ég lánaði/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('switching status to Allt preserves borrower role filter', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég fékk lánað/ }))
    expect(screen.getByRole('button', { name: /Ég fékk lánað/ }).getAttribute('aria-pressed')).toBe('true')
    const alltButtons = screen.getAllByRole('button', { name: /Allt/ })
    fireEvent.click(alltButtons[0]) // first Allt is the status filter
    expect(screen.getByRole('button', { name: /Ég fékk lánað/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

// ── Role pill counts ──────────────────────────────────────────────────────────

describe('LoanList — role pill counts', () => {
  it('lent count matches open lender items (1)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Ég lánaði/ }).textContent).toContain('(1)')
  })

  it('borrowed count matches open borrower items (1)', () => {
    render(<LoanList items={ALL_ITEMS} />)
    expect(screen.getByRole('button', { name: /Ég fékk lánað/ }).textContent).toContain('(1)')
  })

  it('role counts update when status changes to Skilað', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.click(screen.getByRole('button', { name: /Skilað/ }))
    expect(screen.getByRole('button', { name: /Ég lánaði/ }).textContent).toContain('(1)')
    expect(screen.getByRole('button', { name: /Ég fékk lánað/ }).textContent).toContain('(1)')
  })
})

// ── Search ────────────────────────────────────────────────────────────────────

describe('LoanList — search', () => {
  it('finds item by item_name', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'Bók' } })
    expect(screen.getByTestId('card-a1')).toBeDefined()
    expect(screen.queryByTestId('card-a2')).toBeNull()
  })

  it('finds item by note', () => {
    const items = [makeItem({ id: 'n1', item_name: 'X', note: 'flauta' })]
    render(<LoanList items={items} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'flauta' } })
    expect(screen.getByTestId('card-n1')).toBeDefined()
  })

  it('finds item by other_display_name', () => {
    const items = [makeItem({ id: 'n2', item_name: 'X', other_display_name: 'Jóhanna' })]
    render(<LoanList items={items} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'jóhanna' } })
    expect(screen.getByTestId('card-n2')).toBeDefined()
  })

  it('search is case-insensitive', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'BÓK' } })
    expect(screen.getByTestId('card-a1')).toBeDefined()
  })

  it('shows noSearchResults when no match', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'xyzabc' } })
    expect(screen.getByText('Engar niðurstöður.')).toBeDefined()
  })

  it('shows noSearchResults when role filter produces no match', () => {
    const items = [makeItem({ id: 'r1', item_name: 'X', my_role: 'lender' })]
    render(<LoanList items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /Ég fékk lánað/ }))
    expect(screen.getByText('Engar niðurstöður.')).toBeDefined()
  })

  it('pill counts do not change when search is active', () => {
    render(<LoanList items={ALL_ITEMS} />)
    fireEvent.change(screen.getByPlaceholderText('Leita'), { target: { value: 'Bók' } })
    expect(screen.getByRole('button', { name: /Enn í láni/ }).textContent).toContain('(2)')
  })
})

// ── Sort ──────────────────────────────────────────────────────────────────────

describe('LoanList — sort', () => {
  const ITEMS = [
    makeItem({ id: 's1', item_name: 'Eldri', loaned_at: '2026-01-01', my_role: 'lender' }),
    makeItem({ id: 's2', item_name: 'Nýrri', loaned_at: '2026-06-01', my_role: 'lender' }),
  ]

  it('default is newest first (s2 before s1)', () => {
    const { container } = render(<LoanList items={ITEMS} />)
    const cards = container.querySelectorAll('[data-testid^="card-"]')
    expect(cards[0].getAttribute('data-testid')).toBe('card-s2')
    expect(cards[1].getAttribute('data-testid')).toBe('card-s1')
  })

  it('oldest first shows s1 before s2', () => {
    const { container } = render(<LoanList items={ITEMS} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'oldest' } })
    const cards = container.querySelectorAll('[data-testid^="card-"]')
    expect(cards[0].getAttribute('data-testid')).toBe('card-s1')
    expect(cards[1].getAttribute('data-testid')).toBe('card-s2')
  })
})

// ── Empty states ──────────────────────────────────────────────────────────────

describe('LoanList — empty states', () => {
  it('shows noOpen when there are no open loans', () => {
    render(<LoanList items={[RETURNED_LENDER]} />)
    expect(screen.getByText('Ekkert í láni.')).toBeDefined()
  })

  it('shows noReturned when there are no returned loans', () => {
    render(<LoanList items={[OPEN_LENDER]} />)
    fireEvent.click(screen.getByRole('button', { name: /Skilað/ }))
    expect(screen.getByText('Ekkert skilað.')).toBeDefined()
  })

  it('shows noOpen when items list is empty', () => {
    render(<LoanList items={[]} />)
    expect(screen.getByText('Ekkert í láni.')).toBeDefined()
  })
})

// ── highlightInvitationId ──────────────────────────────────────────────────────

describe('LoanList — highlightInvitationId (#52)', () => {
  const ITEMS_WITH_INV = [
    makeItem({ id: 'h1', item_name: 'Highlighted', invitation_id: 'inv-abc' }),
    makeItem({ id: 'h2', item_name: 'Normal', invitation_id: null }),
  ]

  it('passes isHighlighted=true to card whose invitation_id matches', () => {
    const { container } = render(<LoanList items={ITEMS_WITH_INV} highlightInvitationId="inv-abc" />)
    expect(container.querySelector('[data-testid="card-h1"]')?.getAttribute('data-highlighted')).toBe('true')
  })

  it('passes isHighlighted=false to card whose invitation_id does not match', () => {
    const { container } = render(<LoanList items={ITEMS_WITH_INV} highlightInvitationId="inv-abc" />)
    expect(container.querySelector('[data-testid="card-h2"]')?.getAttribute('data-highlighted')).toBe('false')
  })

  it('does not crash when highlightInvitationId matches no item', () => {
    expect(() =>
      render(<LoanList items={ITEMS_WITH_INV} highlightInvitationId="inv-nonexistent" />),
    ).not.toThrow()
  })

  it('all cards get isHighlighted=false when highlightInvitationId is undefined', () => {
    const { container } = render(<LoanList items={ITEMS_WITH_INV} />)
    expect(container.querySelector('[data-testid="card-h1"]')?.getAttribute('data-highlighted')).toBe('false')
    expect(container.querySelector('[data-testid="card-h2"]')?.getAttribute('data-highlighted')).toBe('false')
  })
})
