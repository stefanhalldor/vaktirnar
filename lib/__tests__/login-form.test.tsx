/**
 * Copy/string tests for components/teskeid/TeskeidLoginForm.tsx
 *
 * Verifies the exact Icelandic strings used on the /innskraning page:
 * betaLabel, title (Teskeið.is), loginTitle, emailHint, emailLabel,
 * emailPlaceholder, and the continue button.
 *
 * All server-only dependencies and external calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn().mockImplementation((ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.auth': {
        betaLabel: 'Teskeið.is opnar smátt og smátt og er núna í lokuðum beta-prófunum',
        loginTitle: 'Athugaðu aðganginn þinn',
        emailHint: 'Sláðu inn netfangið þitt. Ef þú ert með aðgang færðu innskráningarkóða. Ef ekki, setjum við þig á biðlistann og opnum fyrir þig um leið og röðin kemur að þér.',
        emailLabel: 'Netfang',
        emailPlaceholder: 'þitt@netfang.is',
        continue: 'Áfram',
        continuing: 'Sendi...',
        codeTitle: 'Sláðu inn kóðann',
        codeLabel: 'Kóði',
        verify: 'Staðfesta',
        verifying: 'Staðfesta...',
        invalidCode: 'Rangur eða útrunninn kóði',
        resend: 'Senda aftur',
        resendIn: 'Senda aftur eftir {seconds}s',
        resending: 'Sendi aftur...',
        resendRequested: 'Athugaðu póstinn og notaðu nýjasta kóðann sem þú hefur fengið.',
        backToEmail: 'Til baka',
        genericError: 'Eitthvað fór úrskeiðis. Reyndu aftur.',
        deliveryUncertain: 'Ekki náðist að staðfesta sendinguna, en kóðinn gæti hafa farið af stað. Athugaðu póstinn áður en þú reynir aftur.',
        emailSubmitted: 'Ef netfangið þitt er með aðgang ætti kóði að berast innan skamms. Ef þú baðst nýlega um kóða geturðu notað þann sem þegar barst.',
        rateLimited: 'Of margir kóðar hafa verið sendir. Prófaðu aftur klukkan {time}.',
      },
    }
    return (key: string, values?: Record<string, string | number>) => {
      const template = T[ns]?.[key] ?? key
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        template,
      )
    }
  }),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  }))
})

import { TeskeidLoginForm } from '@/components/teskeid/TeskeidLoginForm'

// ── Header copy ───────────────────────────────────────────────────────────────

describe('TeskeidLoginForm — header copy', () => {
  it('renders betaLabel text', () => {
    render(React.createElement(TeskeidLoginForm))
    expect(screen.getByText('Teskeið.is opnar smátt og smátt og er núna í lokuðum beta-prófunum')).toBeDefined()
  })

  it('renders h1 with "Teskeið.is"', () => {
    const { container } = render(React.createElement(TeskeidLoginForm))
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toBe('Teskeið.is')
  })
})

// ── Email step copy ───────────────────────────────────────────────────────────

describe('TeskeidLoginForm — email step copy', () => {
  it('renders loginTitle as h2', () => {
    const { container } = render(React.createElement(TeskeidLoginForm))
    const h2 = container.querySelector('h2')
    expect(h2?.textContent).toBe('Athugaðu aðganginn þinn')
  })

  it('renders emailHint body text', () => {
    render(React.createElement(TeskeidLoginForm))
    expect(screen.getByText(
      'Sláðu inn netfangið þitt. Ef þú ert með aðgang færðu innskráningarkóða. Ef ekki, setjum við þig á biðlistann og opnum fyrir þig um leið og röðin kemur að þér.'
    )).toBeDefined()
  })

  it('renders emailLabel', () => {
    render(React.createElement(TeskeidLoginForm))
    expect(screen.getByText('Netfang')).toBeDefined()
  })

  it('email input has correct placeholder', () => {
    const { container } = render(React.createElement(TeskeidLoginForm))
    const input = container.querySelector('input[type="email"]') as HTMLInputElement
    expect(input?.placeholder).toBe('þitt@netfang.is')
  })

  it('continue button renders with "Áfram" label', () => {
    render(React.createElement(TeskeidLoginForm))
    expect(screen.getByRole('button', { name: 'Áfram' })).toBeDefined()
  })
})

// ── Mobile input size ─────────────────────────────────────────────────────────

describe('TeskeidLoginForm — mobile input size', () => {
  it('email input has text-base class to prevent iOS auto-zoom', () => {
    const { container } = render(React.createElement(TeskeidLoginForm))
    const input = container.querySelector('input[type="email"]') as HTMLInputElement
    expect(input?.className).toContain('text-base')
  })
})

describe('TeskeidLoginForm — uncertain code delivery', () => {
  it('moves to the code step with a truthful notice when the request outcome is uncertain', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network interrupted after send'))
    render(React.createElement(TeskeidLoginForm))

    fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    expect(await screen.findByText('Sláðu inn kóðann')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('kóðinn gæti hafa farið af stað')
  })

  it('stays on the email step after a definitive server rejection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    render(React.createElement(TeskeidLoginForm))

    fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    await waitFor(() => {
      expect(screen.getByText('Eitthvað fór úrskeiðis. Reyndu aftur.')).toBeDefined()
    })
    expect(screen.queryByText('Sláðu inn kóðann')).toBeNull()
  })

  it('treats a gateway timeout as uncertain because the email may already be in flight', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: async () => ({}),
    } as Response)
    render(React.createElement(TeskeidLoginForm))

    fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    expect(await screen.findByText('Sláðu inn kóðann')).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain('kóðinn gæti hafa farið af stað')
  })

  it('treats a malformed 2xx response as uncertain instead of confirmed delivery', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    render(React.createElement(TeskeidLoginForm))

    fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    expect(await screen.findByRole('status')).toHaveTextContent('kóðinn gæti hafa farið af stað')
  })

  it('treats a malformed rate-limit payload without retryAfter as uncertain', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, rateLimited: true }),
    } as Response)
    render(React.createElement(TeskeidLoginForm))

    fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))

    expect(await screen.findByRole('status')).toHaveTextContent('kóðinn gæti hafa farið af stað')
  })

  it('does not start a success countdown after a definitive resend rejection', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      render(React.createElement(TeskeidLoginForm))

      fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))
      await act(async () => {})

      for (let second = 0; second < 120; second += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
      }
      const resendButton = screen.getByRole('button', { name: 'Senda aftur' })

      fetchMock.mockResolvedValueOnce({ ok: false } as Response)
      fireEvent.click(resendButton)
      await act(async () => {})

      expect(screen.getByText('Eitthvað fór úrskeiðis. Reyndu aftur.')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Senda aftur' })).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reconciles the resend cooldown from elapsed wall time after a suspended tab resumes', async () => {
    vi.useFakeTimers()
    // The device clock is deliberately two hours ahead of the server. The
    // server-authored duration must still produce a 120-second local window.
    vi.setSystemTime(new Date('2026-08-24T20:00:00.000Z'))
    try {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          serverNow: '2026-08-24T18:00:00.000Z',
          resendAvailableAt: '2026-08-24T18:02:00.000Z',
        }),
      } as Response)
      render(React.createElement(TeskeidLoginForm))

      fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))
      await act(async () => {})

      expect(screen.getByRole('button', { name: 'Senda aftur eftir 120s' })).toBeDisabled()

      // Mobile browsers may suspend timers while the tab/app is backgrounded.
      // Advancing the wall clock without running timers models that suspension.
      vi.setSystemTime(new Date('2026-08-24T20:10:01.000Z'))
      fireEvent(window, new Event('focus'))
      await act(async () => {})

      expect(screen.getByRole('button', { name: 'Senda aftur' })).not.toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a disabled pending resend action and blocks a duplicate request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T18:00:00.000Z'))
    try {
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      render(React.createElement(TeskeidLoginForm))

      fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))
      await act(async () => {})

      vi.setSystemTime(new Date('2026-08-24T18:02:01.000Z'))
      fireEvent(window, new Event('focus'))
      await act(async () => {})

      let resolveResend!: (response: Response) => void
      fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveResend = resolve
      }))

      fireEvent.click(screen.getByRole('button', { name: 'Senda aftur' }))
      await act(async () => {})

      const pendingButton = screen.getByRole('button', { name: 'Sendi aftur...' })
      expect(pendingButton).toBeDisabled()
      fireEvent.click(pendingButton)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      resolveResend({ ok: true, json: async () => ({ success: true }) } as Response)
      await act(async () => {})
      expect(screen.getByRole('button', { name: 'Senda aftur eftir 120s' })).toBeDisabled()
      expect(screen.getByRole('status')).toHaveTextContent(
        'Athugaðu póstinn og notaðu nýjasta kóðann sem þú hefur fengið.',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the real resend rate-limit boundary and clears the request guard', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T18:00:00.000Z'))
    try {
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      render(React.createElement(TeskeidLoginForm))

      fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))
      await act(async () => {})

      vi.setSystemTime(new Date('2026-08-24T18:02:01.000Z'))
      fireEvent(window, new Event('focus'))
      await act(async () => {})

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          rateLimited: true,
          retryAfter: '2026-08-24T19:00:00.000Z',
        }),
      } as Response)
      fireEvent.click(screen.getByRole('button', { name: 'Senda aftur' }))
      await act(async () => {})

      expect(screen.getByText(/Prófaðu aftur klukkan 19:00/)).toBeDefined()
      expect(screen.getByRole('button', { name: 'Senda aftur' })).not.toBeDisabled()

      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      fireEvent.click(screen.getByRole('button', { name: 'Senda aftur' }))
      await act(async () => {})
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a stalled resend as uncertain and always clears the pending lock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T18:00:00.000Z'))
    try {
      const fetchMock = vi.mocked(fetch)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      render(React.createElement(TeskeidLoginForm))

      fireEvent.change(screen.getByLabelText('Netfang'), { target: { value: 'user@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Áfram' }))
      await act(async () => {})

      vi.setSystemTime(new Date('2026-08-24T18:02:01.000Z'))
      fireEvent(window, new Event('focus'))
      await act(async () => {})

      fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}))
      fireEvent.click(screen.getByRole('button', { name: 'Senda aftur' }))
      expect(screen.getByRole('button', { name: 'Sendi aftur...' })).toBeDisabled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })

      expect(screen.queryByRole('button', { name: 'Sendi aftur...' })).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent('kóðinn gæti hafa farið af stað')
      expect(screen.getByRole('button', { name: 'Senda aftur eftir 120s' })).toBeDisabled()

      vi.setSystemTime(new Date('2026-08-24T18:04:32.000Z'))
      fireEvent(window, new Event('focus'))
      await act(async () => {})
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response)
      fireEvent.click(screen.getByRole('button', { name: 'Senda aftur' }))
      await act(async () => {})
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Bottom logo link ──────────────────────────────────────────────────────────

describe('TeskeidLoginForm — bottom logo link', () => {
  it('bottom logo is wrapped in a link', () => {
    render(React.createElement(TeskeidLoginForm))
    const link = screen.getByRole('link', { name: 'Teskeið' })
    expect(link).toBeDefined()
  })

  it('bottom logo link uses default href "/"', () => {
    render(React.createElement(TeskeidLoginForm))
    const link = screen.getByRole('link', { name: 'Teskeið' }) as HTMLAnchorElement
    expect(link.href).toContain('/')
  })

  it('bottom logo link uses logoHref prop', () => {
    render(React.createElement(TeskeidLoginForm, { logoHref: '/auth-mvp/heim' }))
    const link = screen.getByRole('link', { name: 'Teskeið' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/auth-mvp/heim')
  })
})
