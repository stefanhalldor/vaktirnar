import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EventExpensePreviewView } from '@/lib/events/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'

const mocks = vi.hoisted(() => ({ locale: 'is', refresh: vi.fn() }))

vi.mock('next-intl', () => ({
  useLocale: () => mocks.locale,
  useTranslations: () => (key: string, values?: Record<string, string | number>) => ({
    'teskeid.expenses.eventPreview.title': 'Uppgjör viðburðar',
    'teskeid.expenses.eventPreview.forEvent': `Fyrir ${values?.event ?? ''}`,
    'teskeid.expenses.eventPreview.unavailable': 'Uppgjörið er ekki tiltækt núna.',
    'teskeid.expenses.eventPreview.retry': 'Reyna aftur',
    'teskeid.expenses.eventPreview.retrying': 'Reyni aftur...',
    'teskeid.expenses.eventPreview.noneTagged': 'Enginn kostnaður er merktur viðburðinum.',
    'teskeid.expenses.eventPreview.taggedCount': `${values?.count ?? 0} merkt útgjöld`,
    'teskeid.expenses.eventPreview.states.settled': 'Uppgert',
    'teskeid.expenses.eventPreview.states.open': 'Opið',
    'teskeid.expenses.eventPreview.states.pending': 'Greiðsla bíður',
    'teskeid.expenses.eventPreview.states.review_required': 'Þarf yfirferð',
    'teskeid.expenses.eventPreview.states.blocked_manual': 'Handvirk aðgerð þarf',
    'teskeid.expenses.eventPreview.planTitle': 'Einfaldað greiðsluplan',
    'teskeid.expenses.eventPreview.transfer': `${values?.from ?? ''} greiðir ${values?.to ?? ''}`,
    'teskeid.expenses.eventPreview.pendingRepayments': `${values?.count ?? 0} greiðslur bíða`,
    'teskeid.expenses.eventPreview.blockedTitle': 'Ekki hægt að tengja',
    'teskeid.expenses.eventPreview.blockedParty': `${values?.name ?? ''} þarf úrlausn`,
    'teskeid.expenses.eventPreview.settlementLink': 'Skoða uppgjör',
    'teskeid.expenses.eventPreview.globalSettlementNotice': 'Almenna uppgjörið getur líka innihaldið önnur útgjöld.',
  }[key] ?? key),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { EventExpensePreview } from '../EventExpensePreview'

const eventId = '80000000-0000-4000-8000-000000000001'

function preview(overrides: Partial<EventExpensePreviewView> = {}): EventExpensePreviewView {
  return {
    eventId,
    status: 'ready',
    taggedExpenseCount: 1,
    currencies: [],
    ...overrides,
  }
}

describe('read-only event expense preview', () => {
  it('keeps Skoða uppgjör hidden when no expense is tagged', () => {
    render(<EventExpensePreview
      eventName="Sumarferð"
      preview={preview({ status: 'none_tagged', taggedExpenseCount: 0 })}
      showSettlementLink
    />)

    expect(screen.getByText('Enginn kostnaður er merktur viðburðinum.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Skoða uppgjör' })).not.toBeInTheDocument()
  })

  it('shows the exact event-filtered link for a tagged settled preview', () => {
    render(<EventExpensePreview
      eventName="Sumarferð"
      preview={preview({
        currencies: [{
          currency: 'ISK',
          state: 'settled',
          transfers: [],
          pendingRepaymentCount: 0,
          blocked: [],
        }],
      })}
      showSettlementLink
    />)

    expect(screen.getByText('Uppgert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skoða uppgjör' })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/gera-upp?event=${eventId}`,
    )
  })

  it('renders truthful per-currency open, pending, review and blocked states', () => {
    render(<EventExpensePreview
      eventName="Sumarferð"
      preview={preview({
        taggedExpenseCount: 4,
        currencies: [
          {
            currency: 'ISK',
            state: 'open',
            transfers: [{
              fromPartyId: 'party-1',
              toPartyId: 'party-2',
              fromDisplayName: 'Anna',
              toDisplayName: 'Bjarni',
              amountMinor: 2_500,
            }],
            pendingRepaymentCount: 0,
            blocked: [],
          },
          {
            currency: 'EUR',
            state: 'pending',
            transfers: [],
            pendingRepaymentCount: 2,
            blocked: [],
          },
          {
            currency: 'USD',
            state: 'review_required',
            transfers: [],
            pendingRepaymentCount: 0,
            blocked: [],
          },
          {
            currency: 'GBP',
            state: 'blocked_manual',
            transfers: [],
            pendingRepaymentCount: 0,
            blocked: [{
              partyId: 'party-3',
              displayName: 'Gestur',
              reason: 'unresolved_identity',
            }],
          },
        ],
      })}
    />)

    for (const label of ['Opið', 'Greiðsla bíður', 'Þarf yfirferð', 'Handvirk aðgerð þarf']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Anna greiðir Bjarni')).toBeInTheDocument()
    expect(screen.getByText(/2\.500/)).toBeInTheDocument()
    expect(screen.getByText('2 greiðslur bíða')).toBeInTheDocument()
    expect(screen.getByText('Gestur þarf úrlausn')).toBeInTheDocument()
  })

  it('formats each currency with the active UI locale', () => {
    mocks.locale = 'en'
    render(<EventExpensePreview
      eventName="Trip"
      preview={preview({
        currencies: [{
          currency: 'EUR',
          state: 'open',
          transfers: [{
            fromPartyId: 'party-1',
            toPartyId: 'party-2',
            fromDisplayName: 'Anna',
            toDisplayName: 'Bjarni',
            amountMinor: 2_500,
          }],
          pendingRepaymentCount: 0,
          blocked: [],
        }],
      })}
    />)

    expect(screen.getByText(formatExpenseMinor(2_500, 'EUR', 'en'))).toBeInTheDocument()
    expect(screen.queryByText(formatExpenseMinor(2_500, 'EUR', 'is'))).not.toBeInTheDocument()
    mocks.locale = 'is'
  })

  it('fails closed when unavailable, retries once and retains the truthful global notice', () => {
    mocks.refresh.mockClear()
    render(<EventExpensePreview
      eventName="Sumarferð"
      preview={preview({ status: 'unavailable', taggedExpenseCount: 2 })}
      showSettlementLink
      showGlobalSettlementNotice
    />)

    expect(screen.getByRole('status')).toHaveTextContent('Uppgjörið er ekki tiltækt núna.')
    expect(screen.queryByRole('link', { name: 'Skoða uppgjör' })).not.toBeInTheDocument()
    expect(screen.getByText('Almenna uppgjörið getur líka innihaldið önnur útgjöld.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Reyna aftur' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})
