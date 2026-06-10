import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Home, Plus } from 'lucide-react'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { LoanList } from '@/components/loans/LoanList'
import { LoanShell } from '@/components/loans/LoanShell'
import type { LoanItem } from '@/lib/loans/types'

export default async function LoanPage() {
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')
  const admin = getAdmin()

  const loansResult = await admin.rpc('get_my_loans', { p_actor_id: user.id })

  if (loansResult.error) {
    console.error('[loans/page] get_my_loans failed')
  }

  const items = (loansResult.data ?? []) as LoanItem[]

  const nav = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-base font-semibold text-[#154212]">{t('title')}</h1>
      <Link
        href="/auth-mvp/heim"
        className="flex items-center justify-center w-11 h-11 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label={t('homeLink')}
      >
        <Home size={20} aria-hidden />
      </Link>
    </div>
  )

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      {loansResult.error ? (
        <p className="text-sm text-red-600 py-8 text-center">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <Link
            href="/auth-mvp/lanad-og-skilad/ny"
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#154212] text-white text-sm font-semibold shadow-sm hover:bg-[#2d5a27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <Plus size={18} aria-hidden />
            <span>{t('newItem')}</span>
          </Link>
          <LoanList items={items} />
        </>
      )}
    </LoanShell>
  )
}
