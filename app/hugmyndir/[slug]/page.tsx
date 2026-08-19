import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { PublicTopNav } from '@/components/teskeid/PublicTopNav'
import { StatusBadge } from '@/components/teskeid/StatusBadge'
import { VoteButton } from '@/components/teskeid/VoteButton'
import { Footer } from '@/components/landing/Footer'
import { PageViewTracker } from '@/components/teskeid/PageViewTracker'
import { OtherIdeasSection } from '@/components/teskeid/OtherIdeasSection'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { getWeatherEnabledMode } from '@/lib/weather/weatherEnabledMode.server'
import {
  HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG,
  TASKS_IDEA_SLUG,
  isTasksIdeaSlug,
  presentHouseholdChoresIdea,
  resolveTasksIdeaDatabaseSlug,
} from '@/lib/household-chores/idea-presentation'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const databaseSlug = resolveTasksIdeaDatabaseSlug(slug)
  const [supabase, t] = await Promise.all([
    createClient(),
    getTranslations('teskeid.ideas'),
  ])
  const { data } = await supabase.from('ideas').select('*')
    .eq('slug', databaseSlug).eq('is_public', true).single()

  if (!data) return {}

  const presented = presentHouseholdChoresIdea(data, {
    title: t('householdChores.title'),
    shortDescription: t('householdChores.shortDescription'),
    problemDescription: t('householdChores.problemDescription'),
    possibleSolution: t('householdChores.possibleSolution'),
  })

  return {
    title: `${presented.title} | Teskeið`,
    description: presented.short_description,
    openGraph: {
      title: `${presented.title} | Teskeið`,
      description: presented.short_description,
      siteName: 'Teskeið',
      url: `https://teskeid.is/hugmyndir/${presented.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${presented.title} | Teskeið`,
      description: presented.short_description,
    },
  }
}

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG) {
    permanentRedirect(`/hugmyndir/${TASKS_IDEA_SLUG}`)
  }
  const databaseSlug = resolveTasksIdeaDatabaseSlug(slug)
  const t = await getTranslations('teskeid')

  const supabase = await createClient()

  const [{ data: idea }, { data: allIdeas }, { data: { user } }] = await Promise.all([
    supabase
      .from('ideas')
      .select('*')
      .eq('slug', databaseSlug)
      .eq('is_public', true)
      .single(),
    supabase
      .from('ideas')
      .select('*')
      .eq('is_public', true)
      .neq('slug', databaseSlug)
      .order('votes_count', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])

  if (!idea) notFound()
  const copy = {
    title: t('ideas.householdChores.title'),
    shortDescription: t('ideas.householdChores.shortDescription'),
    problemDescription: t('ideas.householdChores.problemDescription'),
    possibleSolution: t('ideas.householdChores.possibleSolution'),
  }
  const presentedIdea = presentHouseholdChoresIdea(idea, copy)
  const presentedOtherIdeas = (allIdeas ?? []).map((otherIdea) => (
    presentHouseholdChoresIdea(otherIdea, copy)
  ))

  const showFreeAccessCta = presentedIdea.status === 'launched' && !user
  const launchedCtaHref = presentedIdea.slug === 'vedrid'
    ? (getWeatherEnabledMode() === 'all' ? '/vedrid' : '/innskraning')
    : idea.slug === 'umonnun' ? '/umonnun'
    : '/innskraning'

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PageViewTracker ideaId={presentedIdea.id} />
      <PublicTopNav />

      <article className="max-w-2xl mx-auto px-6 pt-10 pb-12">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-8 inline-block">
          ← {t('nav.back')}
        </Link>

        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-semibold text-gray-900">{presentedIdea.title}</h1>
          <StatusBadge status={presentedIdea.status} />
        </div>

        <p className="text-xs text-gray-400 uppercase tracking-wide mb-6">
          {isTasksIdeaSlug(presentedIdea.slug)
            ? t('ideas.householdChores.category')
            : presentedIdea.category}
        </p>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">{presentedIdea.short_description}</p>

        {showFreeAccessCta && (
          <div className="mb-8">
            <Link
              href={launchedCtaHref}
              className="inline-flex w-full sm:w-auto min-h-[44px] items-center justify-center rounded-xl bg-[#154212] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2d5a27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
            >
              {t('ideas.freeAccountCta')}
            </Link>
          </div>
        )}

        {presentedIdea.problem_description && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              {presentedIdea.status === 'launched' ? t('ideas.launchedWhy') : t('ideas.problem')}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">{presentedIdea.problem_description}</p>
          </section>
        )}

        {presentedIdea.possible_solution && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              {presentedIdea.status === 'launched' ? t('ideas.launchedSolution') : t('ideas.solution')}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">{presentedIdea.possible_solution}</p>
          </section>
        )}

        {presentedIdea.slug === 'umonnun' && (
          <div className="mb-8">
            <a
              href="https://umonnun.is"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Skoða Umönnun
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {presentedIdea.slug === 'sagan-okkar' && (
          <div className="mb-8">
            <a
              href="https://saganokkar.is"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Skoða Sagan okkar
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        <div className="border-t border-gray-100 pt-6">
          <VoteButton ideaId={presentedIdea.id} initialCount={presentedIdea.votes_count} />
        </div>

        <OtherIdeasSection ideas={presentedOtherIdeas} currentSlug={presentedIdea.slug} />
      </article>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
    </main>
  )
}
