import { redirect } from 'next/navigation'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'

export default async function NewRelationshipCirclePage() {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')
  redirect('/stillingar/tengsl/hringir')
}
