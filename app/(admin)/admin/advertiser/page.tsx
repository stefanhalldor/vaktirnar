import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdvertiserReviewClient } from '@/components/advertiser/AdvertiserReviewClient'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/teskeid/admin-auth'

export default async function AdvertiserReviewPage() {
  if (process.env.ADVERTISER_ENABLED !== 'true') redirect('/')
  const auth = await requireAdmin(await createClient())
  if (auth.error) redirect('/admin/login')
  const t = await getTranslations('advertiser')
  return <main className="min-h-screen bg-background px-4 py-6"><div className="mx-auto flex w-full max-w-lg flex-col gap-6"><header><h1 className="text-2xl font-semibold text-primary">{t('reviewTitle')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('reviewIntro')}</p></header><AdvertiserReviewClient /></div></main>
}
