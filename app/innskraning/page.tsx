import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TeskeidLoginForm } from '@/components/teskeid/TeskeidLoginForm'
import { PublicTopNav } from '@/components/teskeid/PublicTopNav'
import { createClient } from '@/lib/supabase/server'
import { resolveSafeLoginNext } from '@/lib/auth/loginNext'

export const metadata: Metadata = {
  title: 'Innskráning | Teskeið',
}

export default async function InnskraningPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const safeNext = resolveSafeLoginNext(next)

  if (process.env.AUTH_MVP_ENABLED === 'true') {
    let hasSession = false
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      hasSession = !!user?.email
    } catch {
      // Supabase unavailable — show form
    }
    if (hasSession) redirect(safeNext ?? '/auth-mvp/heim')
  }
  return (
    <div className="min-h-screen flex flex-col">
      <PublicTopNav />
      <TeskeidLoginForm logoHref="/" nextHref={safeNext ?? undefined} />
    </div>
  )
}
