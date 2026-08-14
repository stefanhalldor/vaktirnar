import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import { KvissCreatorClient } from '@/components/kviss/KvissCreatorClient'
import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'
import { resolveTeskeidFeatureRollout } from '@/lib/teskeid/featureRollout.server'

export default async function KvissCreatorPage() {
  const t = await getTranslations('kviss')
  const showClosedTestingBanner = resolveTeskeidFeatureRollout('kviss') === 'closed-testing'
  return <main className="min-h-screen bg-background px-4 py-6"><div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"><header><Link href="/auth-mvp/heim" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={18} aria-hidden />{t('back')}</Link><h1 className="mt-3 text-2xl font-semibold text-primary">{t('creatorTitle')}</h1><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('creatorDescription')}</p></header>{showClosedTestingBanner ? <ClosedTestingBanner /> : null}<KvissCreatorClient /></div></main>
}
