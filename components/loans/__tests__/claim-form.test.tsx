import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  claimInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    acknowledge: 'Þekki málið',
    declineAcknowledgement: 'Kannast ekki við þetta',
    'errors.wrongEmail': 'Boðið er skráð á annað netfang',
    'errors.alreadyClaimed': 'Boðið hefur þegar verið tekið',
    'errors.notClaimable': 'Ekki er hægt að taka við boðinu',
    'errors.expiredInvite': 'Boðið er útrunnið',
    'errors.selfClaim': 'Þú getur ekki tekið við eigin boði',
    'errors.claimFailed': 'Ekki tókst að taka við boðinu',
    'errors.saveFailed': 'Ekki tókst að vista',
  }[key] ?? key),
}))

vi.mock('@/lib/loans/actions', () => ({
  claimInvitation: mocks.claimInvitation,
  declineInvitation: mocks.declineInvitation,
}))

import { ClaimForm } from '@/components/loans/ClaimForm'

describe('ClaimForm shared invitation decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves the Loans labels and successful accept navigation', async () => {
    mocks.claimInvitation.mockResolvedValue({ ok: true })
    render(<ClaimForm invitationId="invite-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Þekki málið' }))

    await waitFor(() => expect(mocks.claimInvitation).toHaveBeenCalledWith('invite-1'))
    expect(mocks.push).toHaveBeenCalledWith('/auth-mvp/lanad-og-skilad')
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Kannast ekki við þetta' })).toBeInTheDocument()
  })

  it('preserves the domain-specific claim error mapping', async () => {
    mocks.claimInvitation.mockResolvedValue({ ok: false, error: 'wrong_email' })
    render(<ClaimForm invitationId="invite-2" />)

    fireEvent.click(screen.getByRole('button', { name: 'Þekki málið' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Boðið er skráð á annað netfang')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('preserves successful decline navigation', async () => {
    mocks.declineInvitation.mockResolvedValue({ ok: true })
    render(<ClaimForm invitationId="invite-3" />)

    fireEvent.click(screen.getByRole('button', { name: 'Kannast ekki við þetta' }))

    await waitFor(() => expect(mocks.declineInvitation).toHaveBeenCalledWith('invite-3'))
    expect(mocks.push).toHaveBeenCalledWith('/auth-mvp/lanad-og-skilad')
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
