import { createHash } from 'crypto'
import { cookies } from 'next/headers'
import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import Image from 'next/image'
import { UserCircle, ChevronRight } from 'lucide-react'
import { guardTeskeidAccess } from '@/lib/auth/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { LoanItem, PendingInvitation } from '@/lib/loans/types'
import { sortLoansForHome } from '@/lib/loans/sort'
import { RecentSection, type RecentLabels } from './RecentSection'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }
const RECENT_COOKIE = 'teskeid_recent_read'

const UPCOMING_KEYS = [
  'upcomingEmail',
  'upcomingExpenses',
  'upcomingPartner',
  'upcomingWeather',
  'upcomingKidsShift',
  'upcomingThirdShift',
  'upcomingOutToPlay',
] as const

function getTodayReykjavik(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
}

function computeRecentSignature(loans: LoanItem[]): string {
  const today = getTodayReykjavik()
  const payload = loans
    .map((l) => {
      const overdue = !!l.due_at && !l.returned_at && l.due_at < today
      return [
        l.id,
        l.item_name,
        l.loaned_at,
        l.due_at ?? '',
        l.returned_at ?? '',
        l.my_role,
        l.other_display_name ?? '',
        overdue ? '1' : '0',
      ].join('|')
    })
    .join('\n')
  return createHash('sha256').update(payload).digest('hex')
}

export default async function HeimPage() {
  const { user } = await guardTeskeidAccess()

  const [t, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])

  // Profile via authenticated RLS client — no service_role needed.
  // Failure is silent: generic greeting is shown, page continues.
  let displayName: string | null = null
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
    displayName = profile?.display_name?.trim() || null
  } catch {
    // Profile unavailable — fall through to generic greeting
  }

  // Loan data via service_role RPCs.
  // LOANS_ENABLED must be exactly 'true' for loan sections to appear.
  // getAdmin() is wrapped independently. Each RPC is settled via
  // Promise.allSettled so one rejection cannot suppress the other.
  const loansEnabled = process.env.LOANS_ENABLED === 'true'
  let loans: LoanItem[] = []
  let pendingInvitations: PendingInvitation[] = []
  let loansError = false
  let invitationsError = false

  if (loansEnabled) {
    let admin: ReturnType<typeof getAdmin> | null = null
    try {
      admin = getAdmin()
    } catch (err) {
      const errType = err instanceof Error ? err.constructor.name : typeof err
      console.error('[heim/page] getAdmin:', errType)
      loansError = true
      invitationsError = true
    }

    if (admin !== null) {
      const [loansResult, invitationsResult] = await Promise.allSettled([
        admin.rpc('get_my_loans', { p_actor_id: user.id }),
        admin.rpc('get_my_pending_invitations', { p_actor_id: user.id }),
      ])

      if (loansResult.status === 'rejected') {
        const errType =
          loansResult.reason instanceof Error
            ? loansResult.reason.constructor.name
            : typeof loansResult.reason
        console.error('[heim/page] get_my_loans:', errType)
        loansError = true
      } else if (loansResult.value.error) {
        console.error('[heim/page] get_my_loans:', loansResult.value.error.code)
        loansError = true
      } else {
        loans = (loansResult.value.data ?? []) as LoanItem[]
      }

      if (invitationsResult.status === 'rejected') {
        const errType =
          invitationsResult.reason instanceof Error
            ? invitationsResult.reason.constructor.name
            : typeof invitationsResult.reason
        console.error('[heim/page] get_my_pending_invitations:', errType)
        invitationsError = true
      } else if (invitationsResult.value.error) {
        console.error('[heim/page] get_my_pending_invitations:', invitationsResult.value.error.code)
        invitationsError = true
      } else {
        pendingInvitations = (invitationsResult.value.data ?? []) as PendingInvitation[]
      }
    }
  }

  // Read-state cookie for Nýlegt completion banner.
  // The signature is computed from the visible sorted recent rows.
  const recentLoans = sortLoansForHome(loans).slice(0, 3)
  const recentSig = computeRecentSignature(recentLoans)
  let readSig: string | null = null
  try {
    const jar = await cookies()
    readSig = jar.get(RECENT_COOKIE)?.value ?? null
  } catch {
    // cookies() unavailable in this context — treat as unread
  }
  const initialRead = recentLoans.length > 0 && readSig === recentSig

  const pendingCount = pendingInvitations.length
  const greeting = displayName ? t('greeting', { displayName }) : t('greetingFallback')
  const displayLocale = LOCALE_MAP[locale] ?? locale

  const recentLabels: RecentLabels = {
    recent: t('recent'),
    markRead: t('recentMarkRead'),
    done: t('recentDone'),
    noRecent: t('noRecent'),
    lent: tLoans('lent'),
    borrowed: tLoans('borrowed'),
    overdue: tLoans('overdue'),
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-5 h-14 border-b border-border bg-background">
        <Image
          src="/teskeid-logo-no-frame.svg"
          alt="Teskeið"
          width={88}
          height={26}
          priority
        />
        <Link
          href="/auth-mvp/minn-profill"
          className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={t('profileLink')}
          title={t('profileLink')}
        >
          <UserCircle size={22} aria-hidden />
        </Link>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Greeting */}
        <section>
          <p className="text-xl font-semibold text-primary">{greeting}</p>
        </section>

        {/* Teskeiðar — always renders; active row is loans-gated */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('featuresTitle')}</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {/* Active: Lánað og skilað — only when LOANS_ENABLED */}
            {loansEnabled && (
              <Link
                href="/auth-mvp/lanad-og-skilad"
                className="flex items-center justify-between px-4 hover:bg-background transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <div className="flex items-center gap-2.5 py-3">
                  <span className="text-sm font-medium text-foreground">{t('loansTitle')}</span>
                  {!invitationsError && pendingCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium"
                      aria-label={t('pendingBadgeLabel', { count: pendingCount })}
                    >
                      <span aria-hidden="true">{pendingCount}</span>
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden />
              </Link>
            )}

            {/* Upcoming (disabled) features */}
            {UPCOMING_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled
                className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] opacity-60 cursor-not-allowed"
              >
                <span className="text-sm font-medium text-foreground">{t(key)}</span>
                <span className="text-xs text-muted-foreground">{t('upcoming')}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Nýlegt — hidden when LOANS_ENABLED=false or RPC failed */}
        {loansEnabled && !loansError && (
          <RecentSection
            loans={recentLoans}
            signature={recentSig}
            initialRead={initialRead}
            displayLocale={displayLocale}
            labels={recentLabels}
          />
        )}
      </main>
    </div>
  )
}
