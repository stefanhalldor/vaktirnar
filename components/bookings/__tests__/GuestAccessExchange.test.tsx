import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { GuestAccessExchange } from '../GuestAccessExchange'

describe('GuestAccessExchange', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/bokanir/kvissbador/fyrirspurn/public-id')
  })

  it('exchanges a fragment capability and clears it before refreshing', async () => {
    window.history.replaceState(
      null,
      '',
      '/bokanir/kvissbador/fyrirspurn/public-id#access=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
    )
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<GuestAccessExchange publicId="public-id" providerHref="/bokanir/kvissbador" />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(window.location.hash).toBe('')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/public/requests/public-id/exchange',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      capability: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce())
  })

  it('uses the same generic state for a URL without a capability and offers sign-in', async () => {
    const publicId = '11111111-1111-4111-8111-111111111111'
    render(<GuestAccessExchange publicId={publicId} providerHref="/bokanir/kvissbador" />)

    expect(await screen.findByText('access.notFoundTitle')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'access.signIn' })).toHaveAttribute(
      'href',
      `/innskraning?next=%2Fbokanir%2Fkvissbador%2Ffyrirspurn%2F${publicId}`,
    )
    expect(screen.getByText('access.notFoundBody')).toBeInTheDocument()
  })
})
