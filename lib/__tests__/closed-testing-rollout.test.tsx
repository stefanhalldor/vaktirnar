import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    title: 'In closed testing',
    body: 'This Teskeið is still in closed testing. Features and appearance may change.',
  })[key] ?? key,
}))
vi.mock('@/components/teskeid/TeskeidMenu', () => ({ TeskeidMenu: () => null }))
vi.mock('@/components/teskeid/TeskeidLogo', () => ({ TeskeidLogo: () => null }))
vi.mock('@/components/bookkeeping/BookkeepingPendingLink', () => ({
  BookkeepingPendingLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { BookkeepingShell } from '@/components/bookkeeping/BookkeepingShell'
import {
  isAuthenticatedWeatherPerUserAccessRequired,
  resolveTeskeidFeatureRollout,
} from '@/lib/teskeid/featureRollout.server'

const ENV_KEYS = [
  'UMONNUN_FLAG',
  'WEATHER_AUTH_ACCESS_REQUIRED',
  'WEATHER_FLAG',
] as const

const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function readWorkspaceFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

afterEach(() => {
  restoreEnv()
})

describe('closed-testing rollout policy', () => {
  it('matches the exact authenticated launcher matrix', () => {
    delete process.env.UMONNUN_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    delete process.env.WEATHER_FLAG

    expect(resolveTeskeidFeatureRollout('lanad-og-skilad')).toBe('open')
    expect(resolveTeskeidFeatureRollout('utlagt-og-endurgreitt')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('afmaeli-og-vidburdir')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('bokhaldid')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('umonnun')).toBe('open')
    expect(resolveTeskeidFeatureRollout('vedrid')).toBe('open')
    expect(resolveTeskeidFeatureRollout('kviss')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('auglysandi')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('bokanir')).toBe('closed-testing')
    expect(resolveTeskeidFeatureRollout('heimilisverkin')).toBe('closed-testing')
  })

  it('keeps Umönnun open regardless of its access flag', () => {
    process.env.UMONNUN_FLAG = 'true'
    expect(resolveTeskeidFeatureRollout('umonnun')).toBe('open')

    process.env.UMONNUN_FLAG = 'false'
    expect(resolveTeskeidFeatureRollout('umonnun')).toBe('open')
  })

  it('uses the new Weather access-required variable before the legacy flag without marking Weather closed', () => {
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    process.env.WEATHER_FLAG = 'true'
    expect(isAuthenticatedWeatherPerUserAccessRequired()).toBe(true)
    expect(resolveTeskeidFeatureRollout('vedrid')).toBe('open')

    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'false'
    expect(isAuthenticatedWeatherPerUserAccessRequired()).toBe(false)
    expect(resolveTeskeidFeatureRollout('vedrid')).toBe('open')

    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'true'
    process.env.WEATHER_FLAG = 'false'
    expect(isAuthenticatedWeatherPerUserAccessRequired()).toBe(true)
    expect(resolveTeskeidFeatureRollout('vedrid')).toBe('open')
  })

  it('is the shared Weather access-policy rule used by the feature guard', () => {
    const guardSource = readWorkspaceFile('lib/loans/guard.ts')

    expect(guardSource).toContain(
      "import { isAuthenticatedWeatherPerUserAccessRequired } from '@/lib/teskeid/featureRollout.server'",
    )
    expect(guardSource).toContain('if (!isAuthenticatedWeatherPerUserAccessRequired()) return true')
  })
})

describe('ClosedTestingBanner', () => {
  it('is a compact, non-dismissible semantic aside rather than an alert', () => {
    render(<ClosedTestingBanner />)

    const banner = screen.getByRole('complementary', { name: 'In closed testing' })
    expect(banner).toHaveClass('max-w-full')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('This Teskeið is still in closed testing. Features and appearance may change.')).toBeInTheDocument()
  })

  it('supports an optional Weather body and feedback link', () => {
    render(
      <ClosedTestingBanner
        body="Weather-specific guidance"
        feedbackHref="https://example.com/feedback"
        feedbackLabel="Send feedback"
      />,
    )

    expect(screen.getByText('Weather-specific guidance')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send feedback' })).toHaveAttribute(
      'href',
      'https://example.com/feedback',
    )
  })

  it('lets canonical rollout mode add or remove the Expense banner', () => {
    const { rerender } = render(
      <ExpenseShell title="Loans" homeLabel="Home" closedTestingFeature="lanad-og-skilad">
        <p>Expense content</p>
      </ExpenseShell>,
    )
    expect(screen.queryByRole('complementary', { name: 'In closed testing' })).not.toBeInTheDocument()

    rerender(
      <ExpenseShell title="Expenses" homeLabel="Home" closedTestingFeature="utlagt-og-endurgreitt">
        <p>Expense content</p>
      </ExpenseShell>,
    )
    expect(screen.getByRole('complementary', { name: 'In closed testing' })).toBeInTheDocument()
  })

  it('keeps the client-compatible Bookkeeping error shell banner-free by default', () => {
    render(
      <BookkeepingShell title="Error" homeLabel="Home">
        <p>Error content</p>
      </BookkeepingShell>,
    )

    expect(screen.queryByRole('complementary', { name: 'In closed testing' })).not.toBeInTheDocument()
  })
})

describe('closed-testing banner placements', () => {
  it('opts every entitlement-guarded Expense shell into the banner', () => {
    const guardedExpensePages = [
      'app/auth-mvp/utlagt-og-endurgreitt/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/bod/[groupId]/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/endurgreidslur/[repaymentId]/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/gera-upp/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/greidsluleidir/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/hopar/[groupId]/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/hopar/[groupId]/nytt-utgjald/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/hopar/nyr/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/nytt/page.tsx',
      'app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/breyta/page.tsx',
    ]

    for (const path of guardedExpensePages) {
      const source = readWorkspaceFile(path)
      expect(source, path).toContain('guardExpenseAccess')
      expect(source, path).toContain('closedTestingFeature="utlagt-og-endurgreitt"')
    }

    const exactMemberDetail = readWorkspaceFile(
      'app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page.tsx',
    )
    expect(exactMemberDetail).toContain('guardExpenseSession')
    expect(exactMemberDetail).not.toContain('guardExpenseAccess')
    expect(exactMemberDetail).toContain('closedTestingFeature="utlagt-og-endurgreitt"')
  })

  it('routes strict private placements through the canonical server resolver', () => {
    const expenseShell = readWorkspaceFile('components/expenses/ExpenseShell.tsx')
    const expenseInvitation = readWorkspaceFile('app/auth-mvp/utlagt-og-endurgreitt/bod/adili/[invitationId]/page.tsx')
    const bookkeepingShell = readWorkspaceFile('components/bookkeeping/BookkeepingShell.tsx')
    const bookkeepingPrivateShell = readWorkspaceFile('components/bookkeeping/BookkeepingPrivateShell.server.tsx')
    const kvissCreator = readWorkspaceFile('app/auth-mvp/kviss/page.tsx')
    const kvissPrivateSession = readWorkspaceFile('app/auth-mvp/kviss/lota/[sessionId]/page.tsx')
    const advertiserAuthoring = readWorkspaceFile('app/auth-mvp/auglysandi/page.tsx')
    const bookingProvider = readWorkspaceFile('app/auth-mvp/bokanir/page.tsx')

    expect(expenseShell).toContain('resolveTeskeidFeatureRollout(closedTestingFeature)')
    expect(expenseInvitation).not.toContain('closedTestingFeature')
    expect(expenseInvitation).toContain('checkFeatureAccess')
    expect(expenseInvitation).toContain('<ClosedTestingAccessRequest')
    expect(expenseInvitation).toContain('featureId="utlagt-og-endurgreitt"')
    expect(bookkeepingPrivateShell).toContain("resolveTeskeidFeatureRollout('bokhaldid')")
    expect(bookkeepingShell).toContain('showClosedTestingBanner ? <ClosedTestingBanner')
    expect(kvissCreator).toContain("resolveTeskeidFeatureRollout('kviss')")
    expect(kvissCreator).toContain('showClosedTestingBanner ? <ClosedTestingBanner')
    expect(kvissPrivateSession).toContain("resolveTeskeidFeatureRollout('kviss')")
    expect(kvissPrivateSession).toContain('showClosedTestingBanner ? <ClosedTestingBanner')
    expect(advertiserAuthoring).toContain("resolveTeskeidFeatureRollout('auglysandi')")
    expect(advertiserAuthoring).toContain('showClosedTestingBanner ? <ClosedTestingBanner')
    expect(bookingProvider).toContain("resolveTeskeidFeatureRollout('bokanir')")
    expect(bookingProvider).toContain('showClosedTestingBanner ? <ClosedTestingBanner')
  })

  it('uses the guarded Bookkeeping server wrapper on every page and defaults errors to no banner', () => {
    const guardedBookkeepingPages = [
      'app/auth-mvp/bokhaldid/page.tsx',
      'app/auth-mvp/bokhaldid/timabil/[periodId]/page.tsx',
      'app/auth-mvp/bokhaldid/timabil/[periodId]/faerslur/ny/page.tsx',
      'app/auth-mvp/bokhaldid/timabil/[periodId]/faerslur/[entryId]/breyta/page.tsx',
      'app/auth-mvp/bokhaldid/einingar/[entityId]/faerslur/page.tsx',
      'app/auth-mvp/bokhaldid/einingar/[entityId]/faerslur/ny/page.tsx',
      'app/auth-mvp/bokhaldid/einingar/[entityId]/faerslur/[transactionId]/page.tsx',
      'app/auth-mvp/bokhaldid/einingar/[entityId]/faerslur/[transactionId]/vsk/page.tsx',
    ]

    for (const path of guardedBookkeepingPages) {
      expect(readWorkspaceFile(path), path).toContain(
        "@/components/bookkeeping/BookkeepingPrivateShell.server",
      )
    }

    const errorBoundary = readWorkspaceFile('app/auth-mvp/bokhaldid/error.tsx')
    expect(errorBoundary).toContain("@/components/bookkeeping/BookkeepingShell")
    expect(errorBoundary).not.toContain('showClosedTestingBanner')
  })

  it('leaves generic/public booking and audience shells untouched', () => {
    const bookingShell = readWorkspaceFile('components/bookings/BookingShell.tsx')
    const publicQuiz = readWorkspaceFile('app/kviss/page.tsx')
    const quizAudience = readWorkspaceFile('app/kviss/[code]/page.tsx')
    const publicBooking = readWorkspaceFile('app/bokanir/[businessProfileSlug]/page.tsx')
    const publicBookingDetail = readWorkspaceFile('app/bokanir/[businessProfileSlug]/fyrirspurn/[publicId]/page.tsx')
    const authenticatedBookingParticipant = readWorkspaceFile('app/auth-mvp/bokanir/fyrirspurn/[publicId]/page.tsx')

    expect(bookingShell).not.toContain('ClosedTestingBanner')
    expect(publicQuiz).not.toContain('ClosedTestingBanner')
    expect(quizAudience).not.toContain('ClosedTestingBanner')
    expect(publicBooking).not.toContain('ClosedTestingBanner')
    expect(publicBookingDetail).not.toContain('ClosedTestingBanner')
    expect(authenticatedBookingParticipant).not.toContain('ClosedTestingBanner')
  })

  it('keeps Lánað og skilað, Umönnun and Weather free of closed-testing banner wiring', () => {
    const umonnun = readWorkspaceFile('app/auth-mvp/umonnun/page.tsx')
    const authenticatedWeather = readWorkspaceFile('app/auth-mvp/vedrid/page.tsx')
    const legacyAuthenticatedWeather = readWorkspaceFile('app/auth-mvp/vedrid/VedridClient.tsx')
    const authenticatedTrip = readWorkspaceFile('app/auth-mvp/vedrid/ferdalagid/page.tsx')
    const sharedTripClient = readWorkspaceFile('app/auth-mvp/vedrid/FerdalagidClient.tsx')
    const publicWeather = readWorkspaceFile('app/vedrid/page.tsx')
    const publicPrototype = readWorkspaceFile('app/auth-mvp/vedrid/road-map-prototype/page.tsx')
    const publicTrip = readWorkspaceFile('app/vedrid/ferdalagid/page.tsx')

    expect(umonnun).not.toContain('ClosedTestingBanner')
    expect(authenticatedWeather).not.toContain('ClosedTestingBanner')
    expect(legacyAuthenticatedWeather).not.toContain('WeatherBetaBanner')
    expect(authenticatedTrip).not.toContain('showClosedTestingBanner')
    expect(sharedTripClient).not.toContain('showClosedTestingBanner')
    expect(publicWeather).not.toContain('ClosedTestingBanner')
    expect(publicPrototype).not.toContain('ClosedTestingBanner')
    expect(publicTrip).not.toContain('showClosedTestingBanner')
  })
})
