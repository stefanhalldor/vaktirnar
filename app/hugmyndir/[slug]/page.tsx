import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { NavBar } from '@/components/teskeid/NavBar'
import { StatusBadge } from '@/components/teskeid/StatusBadge'
import { VoteButton } from '@/components/teskeid/VoteButton'
import { Footer } from '@/components/landing/Footer'
import { PageViewTracker } from '@/components/teskeid/PageViewTracker'
import { OtherIdeasSection } from '@/components/teskeid/OtherIdeasSection'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('ideas')
    .select('title, short_description')
    .eq('slug', slug)
    .eq('is_public', true)
    .single()

  if (!data) return {}

  return {
    title: `${data.title} | Teskeið`,
    description: data.short_description,
    openGraph: {
      title: `${data.title} | Teskeið`,
      description: data.short_description,
      siteName: 'Teskeið',
      url: `https://teskeid.is/hugmyndir/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${data.title} | Teskeið`,
      description: data.short_description,
    },
  }
}

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const t = await getTranslations('teskeid')

  const supabase = await createClient()

  const [{ data: idea }, { data: allIdeas }] = await Promise.all([
    supabase
      .from('ideas')
      .select('*')
      .eq('slug', slug)
      .eq('is_public', true)
      .single(),
    supabase
      .from('ideas')
      .select('*')
      .eq('is_public', true)
      .neq('slug', slug)
      .order('votes_count', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (!idea) notFound()

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <PageViewTracker ideaId={idea.id} />
      <NavBar />

      <article className="max-w-2xl mx-auto px-6 pt-10 pb-12">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-8 inline-block">
          ← {t('nav.back')}
        </Link>

        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-semibold text-gray-900">{idea.title}</h1>
          <StatusBadge status={idea.status} />
        </div>

        <p className="text-xs text-gray-400 uppercase tracking-wide mb-6">{idea.category}</p>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">{idea.short_description}</p>

        {idea.problem_description && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              {idea.status === 'launched' ? t('ideas.launchedWhy') : t('ideas.problem')}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">{idea.problem_description}</p>
          </section>
        )}

        {idea.possible_solution && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              {idea.status === 'launched' ? t('ideas.launchedSolution') : t('ideas.solution')}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">{idea.possible_solution}</p>
          </section>
        )}

        {idea.slug === 'umonnun' && (
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

        {idea.slug === 'sagan-okkar' && (
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
          <VoteButton ideaId={idea.id} initialCount={idea.votes_count} />
        </div>

        <OtherIdeasSection ideas={allIdeas ?? []} currentSlug={slug} />
      </article>

      <Footer tagline={t('footer.tagline')} copyright={t('footer.copyright')} />
    </main>
  )
}
