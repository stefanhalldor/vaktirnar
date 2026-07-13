import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { VedurstofanStationExplorerClient } from './VedurstofanStationExplorerClient'

export default async function EltaVedridPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'vedrid')
  await guardFeatureAccess(user.email!, 'elta-vedrid')
  return <VedurstofanStationExplorerClient />
}
