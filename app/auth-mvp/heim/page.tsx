import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { LoanItem } from '@/lib/loans/types'
import type { Idea } from '@/lib/teskeid/types'
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'
import { HomeIdeasDrawer } from '@/components/teskeid/HomeIdeasDrawer'
import { getUnreadRecentEventsForUser, recordRecentEvent } from '@/lib/recent-events/helpers.server'
import type { RecentEventDisplay, LoanFieldChange } from '@/lib/recent-events/types'
import { RecentSection, type RecentLabels } from './RecentSection'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

function formatDateStr(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1),
  )
}

function buildDetailLines(
  changes: LoanFieldChange[] | undefined,
  t: (key: string, params?: Record<string, string>) => string,
  displayLocale: string,
): string[] {
  if (!changes?.length) return []
  return changes.map((change) => {
    const fmt = (v: string | null | undefined) => formatDateStr(v, displayLocale)
    if (change.field === 'item_name') {
      return t('eventDetailItemNameChanged', { oldName: change.oldValue ?? '', newName: change.newValue ?? '' })
    }
    if (change.field === 'loaned_at') {
      return t('eventDetailLoanedAtChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    if (change.field === 'due_at') {
      if (change.changeType === 'added')   return t('eventDetailReturnDateAdded',   { date: fmt(change.newValue) })
      if (change.changeType === 'removed') return t('eventDetailReturnDateRemoved', { date: fmt(change.oldValue) })
      return t('eventDetailReturnDateChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    // note
    if (change.changeType === 'added')   return t('eventDetailNoteAdded',   { content: change.newValue ?? '' })
    if (change.changeType === 'removed') return t('eventDetailNoteRemoved', { content: change.oldValue ?? '' })
    return t('eventDetailNoteChanged', { oldContent: change.oldValue ?? '', newContent: change.newValue ?? '' })
  })
}

const EVENT_TYPE_TO_KEY: Record<string, string> = {
  loan_created:              'eventLoanCreated',
  loan_updated:              'eventLoanUpdated',
  loan_returned:             'eventLoanReturned',
  loan_return_undone:        'eventLoanReturnUndone',
  loan_deleted:              'eventLoanDeleted',
  loan_invitation_received:  'eventLoanInvitationReceived',
  loan_invitation_accepted:  'eventLoanInvitationAccepted',
  loan_invitation_declined:  'eventLoanInvitationDeclined',
}

function formatEventTimestamp(
  isoStr: string,
  tLoans: (key: string) => string,
): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  // Iceland = UTC year-round (no daylight saving). UTC methods give correct local time.
  const weekday = tLoans(`weekdays.${d.getUTCDay()}`)
  const day = d.getUTCDate()
  const month = tLoans(`months.${d.getUTCMonth()}`)
  const hours = d.getUTCHours()   // no leading zero
  const mins = String(d.getUTCMinutes()).padStart(2, '0')
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized} ${day}. ${month} kl. ${hours}:${mins}`
}

function pickLoanUpdatedLabelKey(changes: LoanFieldChange[] | undefined): string {
  if (changes?.length === 1) {
    const field = changes[0]!.field
    if (field === 'item_name') return 'eventLoanUpdatedName'
    if (field === 'note')      return 'eventLoanUpdatedNote'
    if (field === 'due_at')    return 'eventLoanUpdatedDueAt'
    if (field === 'loaned_at') return 'eventLoanUpdatedLoanedAt'
  }
  return 'eventLoanUpdated'
}


export default async function HeimPage() {
  const { user } = await guardTeskeidSession()

  const [t, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])

  // Profile + home ideas via authenticated RLS client — no service_role needed.
  // allSettled so a profile failure doesn't also wipe out the ideas list.
  let displayName: string | null = null
  let allIdeas: Idea[] = []
  try {
    const supabase = await createClient()
    const [profileSettled, ideasSettled] = await Promise.allSettled([
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      supabase.from('ideas').select('*')
        .eq('is_public', true)
        .order('is_featured', { ascending: false })
        .order('votes_count', { ascending: false }),
    ])
    if (profileSettled.status === 'fulfilled') {
      displayName = profileSettled.value.data?.display_name?.trim() || null
    }
    if (ideasSettled.status === 'fulfilled') {
      if (ideasSettled.value.error) {
        console.error('[heim/page] ideas query failed')
      } else {
        allIdeas = (ideasSettled.value.data ?? []) as Idea[]
      }
    }
  } catch {
    // createClient() failed — fall through to defaults
  }

  const [loansEnabled, umonnunEnabled] = await Promise.all([
    checkFeatureAccess(user.id, user.email!, 'lanad-og-skilad'),
    checkFeatureAccess(user.id, user.email!, 'umonnun'),
  ])

  const displayLocale = LOCALE_MAP[locale] ?? locale

  const READY_TESKEID_ROUTES: Record<string, { href: string; enabled: boolean }> = {
    'lanad-og-skilad': { href: '/auth-mvp/lanad-og-skilad', enabled: loansEnabled },
    'umonnun':         { href: '/auth-mvp/umonnun',         enabled: umonnunEnabled },
  }

  const launchedIdeas = allIdeas.filter((i) => i.status === 'launched')
  const futureIdeas   = allIdeas.filter((i) => i.status !== 'launched')
  const readyCards    = launchedIdeas
    .filter((i) => READY_TESKEID_ROUTES[i.slug]?.enabled)
    .map((i) => ({ idea: i, href: READY_TESKEID_ROUTES[i.slug]!.href }))

  let pendingCount = 0
  let invitationsError = false
  let recentEvents: RecentEventDisplay[] = []
  let eventsError = false
  let loans: LoanItem[] = []

  if (loansEnabled) {
    let admin: ReturnType<typeof getAdmin> | null = null
    try {
      admin = getAdmin()
    } catch {
      console.error('[heim/page] getAdmin failed')
      invitationsError = true
      eventsError = true
    }

    if (admin !== null) {
      const loansResult = await Promise.resolve(
        admin.rpc('get_my_loans', { p_actor_id: user.id })
      ).catch(() => null)

      if (!loansResult || loansResult.error) {
        console.error('[heim/page] pending loan badge query failed')
        invitationsError = true
      } else {
        loans = (loansResult.data ?? []) as LoanItem[]
        pendingCount = loans.filter(
          (loan) =>
            loan.requires_acknowledgement &&
            loan.invitation_status === 'pending' &&
            loan.returned_at === null,
        ).length
        // Best-effort event guarantor: ensure each pending invitation has a recent_events row.
        // updateOnConflict: false means the first write wins — existing rows are never overwritten.
        await Promise.allSettled(
          loans
            .filter(
              (loan) =>
                loan.requires_acknowledgement &&
                loan.invitation_status === 'pending' &&
                loan.returned_at === null &&
                loan.invitation_id !== null,
            )
            .map((loan) =>
              recordRecentEvent({
                userId: user.id,
                source: 'loans',
                eventType: 'loan_invitation_received',
                entityType: 'invitation',
                entityId: loan.invitation_id!,
                eventKey: `loans:invitation:${loan.invitation_id}:received`,
                payload: { itemName: loan.item_name },
                href: '/auth-mvp/lanad-og-skilad',
                updateOnConflict: false,
              }),
            ),
        )
      }

      try {
        const rows = await getUnreadRecentEventsForUser(user.id)
        recentEvents = rows.map((event) => {
          const itemName = event.payload.itemName ?? ''
          const isDeleted = event.event_type === 'loan_deleted'
          const labelKey = event.event_type === 'loan_updated'
            ? pickLoanUpdatedLabelKey(event.payload.changes)
            : (EVENT_TYPE_TO_KEY[event.event_type] ?? event.event_type)
          let viewHref: string | null = null
          if (!isDeleted && event.entity_id) {
            if (event.entity_type === 'invitation') {
              const matchingLoan = loans.find((l) => l.invitation_id === event.entity_id)
              if (matchingLoan) {
                const params = new URLSearchParams({ from: 'heim' })
                viewHref = `/auth-mvp/lanad-og-skilad/${matchingLoan.id}?${params}`
              } else {
                const params = new URLSearchParams({ invitation: event.entity_id, from: 'heim' })
                viewHref = `/auth-mvp/lanad-og-skilad?${params}`
              }
            } else if (event.entity_type === 'loan') {
              const params = new URLSearchParams({ from: 'heim' })
              viewHref = `/auth-mvp/lanad-og-skilad/${event.entity_id}?${params}`
            }
          }
          const tFn = (key: string, params?: Record<string, string>) =>
            t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1])
          return {
            id:             event.id,
            label:          t(labelKey as Parameters<typeof t>[0], { itemName }),
            href:           event.href,
            viewHref,
            isDeleted,
            detailLines:    buildDetailLines(event.payload.changes, tFn, displayLocale),
            occurredAtLabel: formatEventTimestamp(
              event.occurred_at,
              (key) => tLoans(key as Parameters<typeof tLoans>[0]),
            ),
          }
        })
      } catch {
        console.error('[heim/page] recent events query failed')
        eventsError = true
      }
    }
  }

  const rowBatch = recentEvents.map((e) => String(e.id)).join('.')
  const firstName = displayName ? (displayName.trim().split(/\s+/)[0] ?? displayName) : null
  const greeting = firstName ? t('greeting', { firstName }) : t('greetingFallback')

  const recentLabels: RecentLabels = {
    recent:      t('recent'),
    markAllRead: t('recentMarkAllRead'),
    markOneRead: t('recentMarkRead'),
    done:        t('recentDone'),
    noRecent:    t('noRecent'),
    viewItem:    t('recentView'),
    closeDrawer: t('recentClose'),
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* ── Kveðja + profile-icon í sömu línu ──────────────────── */}
        <section className="flex items-center justify-between gap-3">
          <p className="text-xl font-semibold text-primary">{greeting}</p>
          <TeskeidMenu variant="authenticated" />
        </section>

        {/* ── Nýlegt — hidden when LOANS_ENABLED=false or events query failed ─ */}
        {loansEnabled && !eventsError && (
          <RecentSection
            key={rowBatch}
            rows={recentEvents}
            displayLocale={displayLocale}
            labels={recentLabels}
          />
        )}

        {/* ── Teskeiðar — ready cards first, future ideas in collapsed drawer ── */}
        <section id="teskeidar">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('readyTeskeidarTitle')}</h2>

          {readyCards.length > 0 && (
            <div className="flex flex-col gap-3 mb-4">
              {readyCards.map(({ idea, href }) => {
                const pending = idea.slug === 'lanad-og-skilad' && !invitationsError && pendingCount > 0
                  ? pendingCount
                  : undefined
                return (
                  <ReadyTeskeidCard
                    key={idea.slug}
                    idea={idea}
                    href={href}
                    openLabel={t('readyTeskeidOpen')}
                    pendingBadge={pending}
                    pendingBadgeLabel={pending !== undefined ? t('pendingBadgeLabel', { count: pending }) : undefined}
                  />
                )
              })}
            </div>
          )}

          <HomeIdeasDrawer
            title={t('homeIdeasTitle')}
            ideas={futureIdeas}
          />
        </section>

        {/* ── Lógó — miðjað neðst ────────────────────────────────── */}
        <div className="flex justify-center pt-4">
          <Link
            href="/auth-mvp/heim"
            aria-label={tLoans('homeLink')}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
          >
            <TeskeidLogo size={160} decorative className="sm:hidden" />
            <TeskeidLogo size={200} decorative className="hidden sm:block" />
          </Link>
        </div>

      </main>
    </div>
  )
}
