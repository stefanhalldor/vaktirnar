import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { LoanCard } from '@/components/loans/LoanCard'
import { LoanShell } from '@/components/loans/LoanShell'
import { LoanHistory } from '@/components/loans/LoanHistory'
import { getLoanHistory } from '@/lib/loans/history.server'
import { getDisplayLocale } from '@/lib/recent-events/display'
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

  const [t, tHome, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.loans'),
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])

  const displayLocale = getDisplayLocale(locale)

  const nav = (
    <Link
      href={backHref}
      className="inline-flex items-center min-h-[44px] text-sm text-[#72796e] hover:text-[#154212] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded self-start"
    >
      {t('backToList')}
    </Link>
  )

  const admin = getAdmin()
  const { data, error } = await admin.rpc('get_my_loans', { p_actor_id: user.id })

  if (error) {
    console.error('[loans/detail] get_my_loans failed')
    return (
      <LoanShell nav={nav} homeLabel={t('homeLink')}>
        <p className="text-sm text-red-600 py-8 text-center">{t('errors.loadFailed')}</p>
      </LoanShell>
    )
  }

  const item = (data as LoanItem[]).find((i) => i.id === id)

  let activeItem: LoanItem
  if (item) {
    activeItem = item
  } else {
    // Pending recipient fallback: actor is not yet an actual party but has a
    // pending invitation for this loan (canonical email match).
    const { data: pendingData, error: pendingError } = await admin.rpc(
      'get_loan_for_pending_recipient',
      { p_actor_id: user.id, p_loan_id: id },
    )
    if (pendingError) {
      console.error('[loans/detail] get_loan_for_pending_recipient failed')
      notFound()
    }
    const pendingItem = (pendingData as LoanItem[] | null)?.[0] ?? null
    if (!pendingItem) notFound()
    activeItem = pendingItem
  }

  const tHomeFn = (key: string, params?: Record<string, string>) =>
    tHome(key as Parameters<typeof tHome>[0], params as Parameters<typeof tHome>[1])
  const tLoansFn = (key: string, params?: Record<string, string>) =>
    tLoans(key as Parameters<typeof tLoans>[0], params as Parameters<typeof tLoans>[1])

  const historyRows = await getLoanHistory(admin, id, user.id, tHomeFn, tLoansFn, displayLocale)

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <div className="flex flex-col gap-6">
        <LoanCard
          item={activeItem}
          afterDeleteHref="/auth-mvp/lanad-og-skilad"
          recipientDisplay={activeItem.recipient_email ?? undefined}
        />
        <LoanHistory
          rows={historyRows}
          labels={{
            title: t('history.title'),
            empty: t('history.empty'),
          }}
          loanId={id}
          chatLabels={{
            fieldLabel: t('history.chatFieldLabel'),
            placeholder: t('history.chatPlaceholder'),
            send: t('history.chatSend'),
            error: t('history.chatError'),
          }}
        />
      </div>
    </LoanShell>
  )
}
