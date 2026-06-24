import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { LoanCard } from '@/components/loans/LoanCard'
import { LoanShell } from '@/components/loans/LoanShell'
import type { LoanItem } from '@/lib/loans/types'

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, spRaw] = await Promise.all([params, searchParams ?? Promise.resolve({})])
  const sp = spRaw as Record<string, string | string[] | undefined>
  const from = typeof sp['from'] === 'string' ? sp['from'] : undefined
  const backHref = from === 'heim' ? '/auth-mvp/heim' : '/auth-mvp/lanad-og-skilad'
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')

  const nav = (
    <Link
      href={backHref}
      className="inline-flex items-center min-h-[44px] text-sm text-[#72796e] hover:text-[#154212] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded self-start"
    >
      {t('backToList')}
    </Link>
  )

  const { data, error } = await getAdmin().rpc('get_my_loans', { p_actor_id: user.id })

  if (error) {
    console.error('[loans/detail] get_my_loans failed')
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <p className="text-sm text-red-600 py-8 text-center">{t('errors.loadFailed')}</p>
      </LoanShell>
    )
  }

  const item = (data as LoanItem[]).find((i) => i.id === id)
  if (!item) notFound()

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <LoanCard
        item={item}
        afterDeleteHref="/auth-mvp/lanad-og-skilad"
        recipientDisplay={item.recipient_email ?? undefined}
      />
    </LoanShell>
  )
}
