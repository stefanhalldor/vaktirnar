import React from 'react'
import Link from 'next/link'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pathname: '/auth-mvp/verkefnin',
  search: '',
  push: vi.fn(),
  replace: vi.fn(),
  requestAnimationFrame: vi.fn<(callback: FrameRequestCallback) => number>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

import {
  TeskeidNavigationFeedbackProvider,
  useTeskeidNavigation,
} from '@/components/teskeid/TeskeidNavigationFeedback'

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <TeskeidNavigationFeedbackProvider
      pendingFallback={<p role="status">Hleður</p>}
    >
      {children}
    </TeskeidNavigationFeedbackProvider>
  )
}

function ImperativeNavigationButton() {
  const { navigate } = useTeskeidNavigation()
  return (
    <button type="button" onClick={() => navigate('/auth-mvp/verkefnin/hringir', 'replace')}>
      Opna hringi
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = '/auth-mvp/verkefnin'
  mocks.search = ''
  window.history.replaceState({}, '', '/auth-mvp/verkefnin')
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: mocks.requestAnimationFrame,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TeskeidNavigationFeedbackProvider', () => {
  it('shows feedback immediately for a plain internal link click', () => {
    render(
      <Harness>
        <Link href="/auth-mvp/verkefnin/hringir" onClick={(event) => event.preventDefault()}>
          Hringir
        </Link>
      </Harness>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Hringir' }))

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Hleður')
    expect(status.parentElement).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('link', { name: 'Hringir' })).not.toBeInTheDocument()
  })

  it('does not take over modified, external or same-page links', () => {
    render(
      <Harness>
        <Link href="/auth-mvp/verkefnin/hringir" onClick={(event) => event.preventDefault()}>
          Hringir
        </Link>
        <Link href="https://example.com" onClick={(event) => event.preventDefault()}>
          Ytri síða
        </Link>
        <Link href="/auth-mvp/verkefnin#efni" onClick={(event) => event.preventDefault()}>
          Sama síða
        </Link>
      </Harness>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Hringir' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('link', { name: 'Ytri síða' }))
    fireEvent.click(screen.getByRole('link', { name: 'Sama síða' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('paints feedback before committing imperative replace navigation', () => {
    let scheduledCallback: FrameRequestCallback | undefined
    mocks.requestAnimationFrame.mockImplementation((callback) => {
      scheduledCallback = callback
      return 1
    })

    render(
      <Harness>
        <ImperativeNavigationButton />
      </Harness>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Opna hringi' }))

    expect(screen.getByRole('status')).toHaveTextContent('Hleður')
    expect(mocks.replace).not.toHaveBeenCalled()

    act(() => scheduledCallback?.(0))
    expect(mocks.replace).toHaveBeenCalledWith('/auth-mvp/verkefnin/hringir')
  })

  it('restores routed content after the route key changes', () => {
    const view = render(
      <Harness>
        <Link href="/auth-mvp/verkefnin/hringir" onClick={(event) => event.preventDefault()}>
          Hringir
        </Link>
      </Harness>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Hringir' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    mocks.pathname = '/auth-mvp/verkefnin/hringir'
    view.rerender(
      <Harness>
        <p>Ný síða</p>
      </Harness>,
    )

    expect(screen.getByText('Ný síða')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('recovers if a navigation is cancelled before the route changes', () => {
    vi.useFakeTimers()
    render(
      <TeskeidNavigationFeedbackProvider
        pendingFallback={<p role="status">Hleður</p>}
        recoveryTimeoutMs={1000}
      >
        <Link href="/auth-mvp/verkefnin/hringir" onClick={(event) => event.preventDefault()}>
          Hringir
        </Link>
      </TeskeidNavigationFeedbackProvider>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Hringir' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('link', { name: 'Hringir' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
