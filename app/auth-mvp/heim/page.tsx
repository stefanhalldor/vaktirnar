import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { resolveTeskeidLauncher } from '@/lib/teskeid/launcher.server'
import type { Idea } from '@/lib/teskeid/types'
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'
import { ClosedTestingAccessRequest } from '@/components/teskeid/ClosedTestingAccessRequest'
import { HomeIdeasDrawer } from '@/components/teskeid/HomeIdeasDrawer'
import { hasExpenseAccessRequestContext } from '@/lib/expenses/access-request.server'
import { resolveRecentEventSourceAccess } from '@/lib/recent-events/access.server'
import { loadRecentEventInbox } from '@/lib/recent-events/inbox.server'
import { RecentSection, type RecentLabels } from './RecentSection'
import {
  mapUnreadCountsToLauncher,
  recentEventSourceForLauncherFeature,
} from '@/lib/recent-events/launcher'
import {
  teskeidLauncherIdFromIdeaSlug,
  type TeskeidLauncherId,
} from '@/lib/teskeid/launcherCatalog'
import { presentHouseholdChoresIdea } from '@/lib/household-chores/idea-presentation'


export default async function HeimPage() {
  const { user } = await guardTeskeidSession()

  const [t, tLoans, tIdeas] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getTranslations('teskeid.ideas'),
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

  allIdeas = allIdeas.map((idea) => presentHouseholdChoresIdea(idea, {
    title: tIdeas('householdChores.title'),
    shortDescription: tIdeas('householdChores.shortDescription'),
    problemDescription: tIdeas('householdChores.problemDescription'),
    possibleSolution: tIdeas('householdChores.possibleSolution'),
  }))

  const [recentEventAccess, launcher] = await Promise.all([
    resolveRecentEventSourceAccess(user),
    resolveTeskeidLauncher(user),
  ])
  const {
    expensesEnabled,
    sources: recentEventSources,
  } = recentEventAccess
  const visibleLauncherIds = new Set(launcher.featureIds)
  const umonnunEnabled = visibleLauncherIds.has('umonnun')
  const bookkeepingEnabled = visibleLauncherIds.has('bokhaldid')
  const kvissEnabled = visibleLauncherIds.has('kviss')
  const advertiserEnabled = visibleLauncherIds.has('auglysandi')
  const bookingsEnabled = visibleLauncherIds.has('bokanir')
  const eventsEnabled = visibleLauncherIds.has('afmaeli-og-vidburdir')
  const showExpenseAccessRequest = process.env.EXPENSES_ENABLED === 'true'
    && !visibleLauncherIds.has('utlagt-og-endurgreitt')
    && await hasExpenseAccessRequestContext(user.id, user.email!)

  const isPromotedPrivateBeta = (idea: Idea) =>
    (idea.slug === 'utlagt-og-endurgreitt' && expensesEnabled)
    || (idea.slug === 'bokhaldid' && bookkeepingEnabled)
    || (idea.slug === 'kviss' && kvissEnabled)
    || (idea.slug === 'auglysandi' && advertiserEnabled)
    || (idea.slug === 'bokanir' && bookingsEnabled)
    || (idea.slug === 'afmaeli-og-vidburdir' && eventsEnabled)
  const visibleIdeas = allIdeas.filter((idea) => (
    (idea.slug !== 'bokhaldid' || bookkeepingEnabled)
    && (idea.slug !== 'bokanir' || bookingsEnabled)
    && (idea.slug !== 'afmaeli-og-vidburdir' || eventsEnabled)
  ))
  const futureIdeas = visibleIdeas.filter((idea) => {
    const launcherId = teskeidLauncherIdFromIdeaSlug(idea.slug)
    return (!launcherId || !visibleLauncherIds.has(launcherId))
      && idea.status !== 'launched'
      && !isPromotedPrivateBeta(idea)
  })
  const readyCards: Array<{
    featureId: TeskeidLauncherId
    idea: Pick<Idea, 'slug' | 'title' | 'short_description' | 'category'>
    href: string
  }> = launcher.items.map((item) => {
    return {
      featureId: item.id,
      idea: {
        slug: item.id,
        title: t(item.titleKey as Parameters<typeof t>[0]),
        short_description: t(item.descriptionKey as Parameters<typeof t>[0]),
        // Category is an internal icon fallback and is not rendered as copy.
        category: 'Annað',
      },
      href: item.href,
    }
  })

  const recentInbox = recentEventSources.length > 0
    ? await loadRecentEventInbox(user, { access: recentEventAccess })
    : { ok: true, rows: [], unreadBySource: {}, sources: [] }
  const recentEvents = recentInbox.rows
  const unreadBySource = recentInbox.unreadBySource
  const eventsError = !recentInbox.ok

  const rowBatch = recentEvents.map((e) => String(e.id)).join('.')
  const launcherUnreadCounts = mapUnreadCountsToLauncher(unreadBySource, launcher.featureIds)
  const firstName = displayName ? (displayName.trim().split(/\s+/)[0] ?? displayName) : null
  const greeting = firstName ? t('greeting', { firstName }) : t('greetingFallback')

  const recentLabels: RecentLabels = {
    recent:      t('recent'),
    markAllRead: t('recentMarkAllRead'),
    markOneRead: t('recentMarkRead'),
    viewItem:    t('recentView'),
    closeDrawer: t('recentClose'),
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* ── Kveðja + profile-icon í sömu línu ──────────────────── */}
        <section className="flex items-center justify-between gap-3">
          <p className="text-xl font-semibold text-primary">{greeting}</p>
          <TeskeidMenu
            variant="authenticated"
            initialFeatureIds={launcher.featureIds}
            initialAgentCollaborationAvailable={launcher.agentCollaborationAvailable}
            initialUnreadCounts={launcherUnreadCounts}
          />
        </section>

        {/* ── Nýlegt — shared feed for currently-authorized Teskeið sources ─ */}
        {recentEventSources.length > 0 && !eventsError && (
          <RecentSection
            key={rowBatch}
            rows={recentEvents}
            labels={recentLabels}
          />
        )}

        {showExpenseAccessRequest ? (
          <ClosedTestingAccessRequest
            featureId="utlagt-og-endurgreitt"
            reason="participant"
          />
        ) : null}

        {/* ── Teskeiðar — ready cards first, future ideas in collapsed drawer ── */}
        <section id="teskeidar">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('readyTeskeidarTitle')}</h2>

          {readyCards.length > 0 && (
            <div className="flex flex-col gap-3 mb-4">
              {readyCards.map(({ featureId, idea, href }) => {
                const recentSource = recentEventSourceForLauncherFeature(featureId)
                const unreadCount = recentSource ? unreadBySource[recentSource] : undefined
                const unreadBadge = unreadCount && unreadCount > 0 ? unreadCount : undefined
                return (
                  <ReadyTeskeidCard
                    key={idea.slug}
                    idea={idea}
                    href={href}
                    openLabel={t('readyTeskeidOpen')}
                    unreadBadge={unreadBadge}
                    unreadBadgeLabel={unreadBadge !== undefined
                      ? t('unreadBadgeLabel', { count: unreadBadge })
                      : undefined}
                    titleOverride={idea.slug === 'bokhaldid' ? t('bookkeepingCardTitle') : undefined}
                    descriptionOverride={idea.slug === 'vedrid'
                      ? t('weatherCardDescription')
                      : idea.slug === 'bokhaldid'
                        ? t('bookkeepingCardDescription')
                        : undefined}
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
