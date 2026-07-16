import { notFound, redirect } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { checkChatAccess } from '@/lib/chat/access.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { VedurstofanPulsClient } from './VedurstofanPulsClient'

export default async function VedurstofanPulsPage({
  params,
  searchParams,
}: {
  params: Promise<{ stationId: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { stationId } = await params
  const { returnTo } = await searchParams
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'vedrid')
  await guardFeatureAccess(user.email!, 'elta-vedrid')

  const access = await checkChatAccess(user)
  if (access !== 'allowed') redirect('/auth-mvp/vedrid/elta-vedrid')

  const entry = VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === stationId)
  if (!entry) notFound()

  return <VedurstofanPulsClient stationId={stationId} stationName={entry.name} returnTo={returnTo ?? null} />
}
