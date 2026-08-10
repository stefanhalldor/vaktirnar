import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { AdvertiserWorkspaceClient } from '@/components/advertiser/AdvertiserWorkspaceClient'

export default async function AdvertiserPage() {
  const t = await getTranslations('advertiser')
  return <main className="min-h-screen bg-background px-4 py-6"><div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"><header><Link href="/auth-mvp/heim" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={18} aria-hidden />{t('back')}</Link><h1 className="mt-3 text-2xl font-semibold text-primary">{t('title')}</h1><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('intro')}</p></header><AdvertiserWorkspaceClient /></div></main>
}
