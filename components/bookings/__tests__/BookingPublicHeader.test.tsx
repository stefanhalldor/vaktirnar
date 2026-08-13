import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicBookingServiceView } from '@/lib/bookings/contracts'

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({ TeskeidMenu: () => <div /> }))
vi.mock('@/components/teskeid/TeskeidLogo', () => ({ TeskeidLogo: () => <div /> }))

import { BookingShell } from '../BookingShell'
import { PublicBookingService } from '../BookingRequestForm'

const view: PublicBookingServiceView = {
  businessProfile: {
    slug: 'kvissbador',
    displayName: 'Kvissbador',
    description: 'Test lýsing',
    websiteUrl: 'https://quizbadour.com',
  },
  service: {
    title: 'Quizbadour',
    summary: 'Singalong music quiz.',
    timezone: 'Atlantic/Reykjavik',
    signedInDiscountBps: 1000,
  },
  signedIn: false,
}

describe('public booking header', () => {
  it('uses the provider website for back and keeps the service title in one heading', () => {
    render(
      <BookingShell
        title={view.service.title}
        backHref={view.businessProfile.websiteUrl ?? undefined}
        backLabel={view.businessProfile.displayName}
      >
        <PublicBookingService view={view} />
      </BookingShell>,
    )

    expect(screen.getAllByText('Quizbadour')).toHaveLength(1)
    expect(screen.queryByText('Kvissbador')).not.toBeInTheDocument()
    expect(screen.getByText('Singalong music quiz.')).toBeInTheDocument()
    expect(screen.getByText('Test lýsing')).toBeInTheDocument()
    expect(screen.queryByText('publicIntro')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kvissbador' })).toHaveAttribute('href', 'https://quizbadour.com')
    expect(screen.getByRole('link', { name: 'Kvissbador' })).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
})
