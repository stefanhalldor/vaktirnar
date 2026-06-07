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
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), refresh: vi.fn() }),
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
        backToEmail: 'Til baka',
        genericError: 'Eitthvað fór úrskeiðis. Reyndu aftur.',
        emailSubmitted: 'Ef netfangið þitt er með aðgang færðu kóða innan skamms.',
      },
    }
    return (key: string) => T[ns]?.[key] ?? key
  }),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
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
