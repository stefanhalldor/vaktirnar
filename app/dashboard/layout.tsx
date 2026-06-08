import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { guardLegacyAccess } from '@/lib/legacy/access'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (process.env.LEGACY_ENABLED !== 'true') {
    redirect('/')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const ag = await guardLegacyAccess(user.id)
  if (ag) redirect('/')

  return <>{children}</>
}
