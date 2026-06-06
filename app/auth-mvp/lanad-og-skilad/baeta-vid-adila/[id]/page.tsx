import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { getLoanCardControls } from '@/lib/loans/types'
import { AddPartyForm } from '@/components/loans/AddPartyForm'
import type { LoanItem } from '@/lib/loans/types'

export default async function AddPartyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')

  const admin = getAdmin()
  const { data, error } = await admin.rpc('get_my_loans', { p_actor_id: user.id })

  if (error) {
    console.error('[loans/baeta-vid-adila] get_my_loans error:', error.code)
    return (
      <div className="min-h-screen bg-[#fbf9f4] flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{t('errors.loadFailed')}</p>
      </div>
    )
  }

  const item = (data as LoanItem[]).find((i) => i.id === id)

  if (!item || !item.is_creator) notFound()

  const controls = getLoanCardControls(item)
  if (!controls.showAddParty) redirect('/auth-mvp/lanad-og-skilad')

  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      <header className="flex items-center px-5 h-14 border-b border-black/5 bg-[#fbf9f4]">
        <Link
          href="/auth-mvp/lanad-og-skilad"
          className="text-sm text-[#72796e] hover:text-[#154212] transition-colors"
        >
          {t('backToList')}
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <h2 className="text-xl font-semibold text-[#154212] mb-2">{t('addPartyTitle')}</h2>
        <p className="text-sm text-[#72796e] mb-6">{item.item_name}</p>
        <AddPartyForm loanId={id} />
      </main>
    </div>
  )
}
