import 'server-only'
import { guardTeskeidSession } from '@/lib/auth/guard'

export default async function MinnProfilLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await guardTeskeidSession()
  return <>{children}</>
}
