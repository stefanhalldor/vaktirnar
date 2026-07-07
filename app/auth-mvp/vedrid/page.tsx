import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { FerdalagidClient } from './FerdalagidClient'

export default async function VedridPage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'vedrid')
  return <FerdalagidClient />
}
