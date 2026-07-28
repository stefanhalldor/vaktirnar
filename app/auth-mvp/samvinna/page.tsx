import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { hasAgentCollaborationBetaAccess } from '@/lib/agent-collaboration/access.server'
import { AgentCollaborationClient } from './AgentCollaborationClient'

export default async function SamvinnaPage() {
  if (
    process.env.AUTH_MVP_ENABLED !== 'true'
    || process.env.AGENT_COLLABORATION_ENABLED !== 'true'
  ) notFound()
  const { user } = await guardTeskeidSession()
  if (!await hasAgentCollaborationBetaAccess(user.email!)) notFound()
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('teskeid.agentCollaboration'),
  ])

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-5">
        <header>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Link
              href="/auth-mvp/heim"
              className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft size={17} aria-hidden />
              {t('back')}
            </Link>
            <TeskeidMenu variant="authenticated" />
          </div>
          <h1 className="mt-3 text-xl font-semibold text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('description')}</p>
        </header>

        <AgentCollaborationClient locale={locale} />
      </main>
    </div>
  )
}
