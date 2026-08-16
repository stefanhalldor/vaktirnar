import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { guardEventSession } from '@/lib/events/guard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teskeid.events')
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function EventLayout({ children }: { children: React.ReactNode }) {
  noStore()
  await guardEventSession()
  return children
}
