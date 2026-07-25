import { redirect } from 'next/navigation'
import { buildPrototypeLegacyRedirectUrl } from '@/lib/weather/prototypeRedirect'

export default async function RoadMapPrototypeLegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(buildPrototypeLegacyRedirectUrl(await searchParams))
}
