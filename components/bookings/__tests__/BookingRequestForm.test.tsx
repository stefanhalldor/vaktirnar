import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicBookingServiceView } from '@/lib/bookings/contracts'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (
    values?.percent ? `${key}:${values.percent}` : values?.email ? `${key}:${values.email}` : key
  ),
}))

import { BookingRequestForm } from '../BookingRequestForm'

const view: PublicBookingServiceView = {
  businessProfile: {
    slug: 'kvissbador',
    displayName: 'Kvissbador',
    description: 'Kviss fyrir hópa',
    websiteUrl: 'https://quizbadour.com',
  },
  service: {
    title: 'Kvissveisla',
    summary: 'Við mætum með kvissið.',
    timezone: 'Atlantic/Reykjavik',
    signedInDiscountBps: 1000,
  },
  signedIn: false,
}

function response(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fillRequiredForm() {
  await userEvent.click(screen.getByLabelText('form.date'))
  await userEvent.type(screen.getByLabelText('form.date'), '2026-09-20')
  await userEvent.type(screen.getByLabelText('form.time'), '18:30')
  await userEvent.type(screen.getByLabelText('form.name'), 'Anna Jónsdóttir')
  await userEvent.type(screen.getByLabelText('form.email'), 'anna@example.com')
  await userEvent.type(screen.getByLabelText('form.phone'), '5551234')
  await userEvent.type(screen.getByLabelText('form.message'), 'Við erum um tuttugu.')
}

describe('BookingRequestForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    pushMock.mockReset()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    sessionStorage.clear()
  })

  it('keeps guest submit primary and explains account tracking without showing the saved discount', () => {
    render(<BookingRequestForm view={view} />)

    const dateInput = screen.getByLabelText('form.date')
    const minDate = dateInput.getAttribute('min') ?? ''
    const [year, month, day] = minDate.split('-').map(Number)
    const expectedMax = new Date(Date.UTC(year, month - 1, day) + 547 * 86_400_000)
      .toISOString()
      .slice(0, 10)

    expect(screen.getByRole('button', { name: 'form.submit' })).toBeEnabled()
    expect(screen.queryByText('discount.offer:10')).not.toBeInTheDocument()
    expect(screen.getByText('discount.trackOffer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /discount.signIn/ })).toHaveAttribute(
      'href',
      '/innskraning?next=%2Fbokanir%2Fkvissbador',
    )
    expect(screen.getByLabelText('form.name')).toHaveClass('text-base')
    expect(screen.getByLabelText('form.time')).toHaveClass('text-base')
    expect(screen.getByLabelText('form.time')).toBeRequired()
    expect(screen.getByLabelText('form.phone')).toBeRequired()
    expect(screen.getByText('form.timeOptionalHint')).toBeInTheDocument()
    expect(dateInput).toHaveAttribute('max', expectedMax)
  })

  it('takes a signed-in customer directly to the booking without showing a result interstitial', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      publicId: '11111111-1111-4111-8111-111111111111',
      businessProfileSlug: 'kvissbador',
      bookingPath: '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
      accessMode: 'members',
      status: 'requested',
      appliedDiscountBps: 1000,
      currentActorHasAccess: true,
      guestCapability: null,
    })))

    render(<BookingRequestForm view={{ ...view, signedIn: true }} />)
    await fillRequiredForm()
    await userEvent.click(screen.getByRole('button', { name: 'form.submit' }))

    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalledOnce())
    expect(screen.queryByText('request.sentTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('discount.applied:10')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'form.sending' })).toBeDisabled()
  })

  it('does not open a booking owned by a different contact email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      publicId: '11111111-1111-4111-8111-111111111111',
      businessProfileSlug: 'kvissbador',
      bookingPath: '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
      accessMode: 'members',
      status: 'requested',
      appliedDiscountBps: 1000,
      currentActorHasAccess: false,
      guestCapability: null,
    })))

    render(<BookingRequestForm view={{ ...view, signedIn: true }} />)
    await fillRequiredForm()
    await userEvent.click(screen.getByRole('button', { name: 'form.submit' }))

    expect(await screen.findByText('request.sentForEmailBody:anna@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'request.open' })).not.toBeInTheDocument()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('reuses the same request id for an exact retry and shows the private guest link', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ error: 'save_failed' }, false, 500))
      .mockResolvedValueOnce(response({
        publicId: '11111111-1111-4111-8111-111111111111',
        businessProfileSlug: 'kvissbador',
        bookingPath: '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
        accessMode: 'link',
        status: 'requested',
        appliedDiscountBps: null,
        currentActorHasAccess: true,
        guestCapability: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
      }))
    vi.stubGlobal('fetch', fetchMock)

    render(<BookingRequestForm view={view} />)
    await fillRequiredForm()
    await userEvent.click(screen.getByRole('button', { name: 'form.submit' }))
    expect(await screen.findByText('errors.submitFailed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'form.submit' }))
    expect(await screen.findByText('guestLink.title')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'request.sentTitle' })).toHaveFocus()

    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(second.requestId).toBe(first.requestId)
    expect(second).toMatchObject({
      businessProfileSlug: 'kvissbador',
      contactEmail: 'anna@example.com',
      contactPhone: '5551234',
      requestedDate: '2026-09-20',
      requestedTime: '18:30',
    })

    await userEvent.click(screen.getByRole('link', { name: 'request.open' }))
    expect(screen.getByRole('link', { name: 'request.opening' })).toHaveAttribute('aria-disabled', 'true')
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('stores a short-lived draft for login without putting PII in the return URL', async () => {
    render(<BookingRequestForm view={view} />)
    await userEvent.type(screen.getByLabelText('form.email'), 'private@example.com')
    const link = screen.getByRole('link', { name: /discount.signIn/ })
    await userEvent.click(link)

    expect(link.getAttribute('href')).not.toContain('private%40example.com')
    expect(screen.getByRole('link', { name: 'access.openingSignIn' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const stored = sessionStorage.getItem('teskeid:booking-draft:v1:kvissbador')
    expect(stored).toContain('private@example.com')
    expect(JSON.parse(stored ?? '{}').expiresAt).toBeGreaterThan(Date.now())
  })

  it('restores a valid login draft and removes it after a successful request', async () => {
    const storageKey = 'teskeid:booking-draft:v1:kvissbador'
    sessionStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      expiresAt: Date.now() + 60_000,
      requestedDate: '2026-09-20',
      requestedTime: '18:30',
      contactName: 'Anna Jónsdóttir',
      contactEmail: 'anna@example.com',
      contactPhone: '5551234',
      message: 'Við erum um tuttugu.',
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      publicId: '11111111-1111-4111-8111-111111111111',
      businessProfileSlug: 'kvissbador',
      bookingPath: '/bokanir/kvissbador/fyrirspurn/11111111-1111-4111-8111-111111111111',
      accessMode: 'link',
      status: 'requested',
      appliedDiscountBps: null,
      currentActorHasAccess: true,
      guestCapability: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
    })))

    render(<BookingRequestForm view={view} />)
    await waitFor(() => expect(screen.getByLabelText('form.email')).toHaveValue('anna@example.com'))
    expect(screen.getByLabelText('form.message')).toHaveValue('Við erum um tuttugu.')

    await userEvent.click(screen.getByRole('button', { name: 'form.submit' }))
    expect(await screen.findByText('request.sentTitle')).toBeInTheDocument()
    expect(sessionStorage.getItem(storageKey)).toBeNull()
  })
})
