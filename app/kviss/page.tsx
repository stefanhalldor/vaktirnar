import { getTranslations } from 'next-intl/server'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { KvissCodeEntry } from '@/components/kviss/KvissCodeEntry'

export default async function PublicKvissPage() {
  const t = await getTranslations('kviss')
  return <main className="min-h-screen bg-background px-4 py-6"><div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"><header className="flex items-center justify-between gap-3"><TeskeidLogo size={110} decorative /><TeskeidMenu variant="public" /></header><section><h1 className="text-2xl font-semibold text-primary">{t('joinTitle')}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('joinLandingDescription')}</p></section><KvissCodeEntry /></div></main>
}

