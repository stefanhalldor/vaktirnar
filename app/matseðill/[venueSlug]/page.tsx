import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PublicMenuClient } from '@/components/restaurants/PublicMenuClient'
import { readPublicMenu } from '@/lib/restaurants/server'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }
export default async function MenuPage({ params, searchParams }: { params: Promise<{ venueSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { venueSlug } = await params
  const query = await searchParams
  const menu = await readPublicMenu(venueSlug)
  if (!menu) notFound()
  const t = await getTranslations('restaurants')
  const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined
  const version = Number(one(query.version))
  return <PublicMenuClient menu={menu} tableSessionId={one(query.tableSession)} splitId={one(query.split)} splitVersion={Number.isInteger(version) && version > 0 ? version : undefined} copy={{
    draft: t('draft'), add: t('add'), remove: t('remove'), quantity: t('quantity'), empty: t('empty'), submit: t('submit'), sending: t('sending'), login: t('login'), conflict: t('conflict'), failed: t('failed'),
  }}/>
}
