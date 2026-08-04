import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { formatDateOnly } from '@/lib/date-format'
import type { ExpenseGroupView, ExpenseRepaymentView } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseRepaymentActions } from './ExpenseRepaymentActions'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'

export async function ExpenseRepaymentDetail({
  group,
  repayment,
}: {
  group: ExpenseGroupView
  repayment: ExpenseRepaymentView
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const statusKey = `repayment.status${repayment.status[0]!.toUpperCase()}${repayment.status.slice(1)}`

  return (
    <div className="space-y-8">
      <section className="space-y-3 border-y border-border py-5">
        <p className="text-sm text-muted-foreground">{t('repayment.outsidePayment')}</p>
        <p className="text-lg font-semibold">
          {t('repayment.fromTo', { from: repayment.fromDisplayName, to: repayment.toDisplayName })}
        </p>
        <strong className="block text-xl">{formatExpenseMinor(repayment.amountMinor, repayment.currency)}</strong>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('common.date')}</dt>
          <dd>{formatDateOnly(repayment.occurredOn, locale)}</dd>
          <dt className="text-muted-foreground">{t('common.status')}</dt>
          <dd>{t(statusKey)}</dd>
        </dl>
        {repayment.note ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{repayment.note}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('repayment.paymentDetails')}</h2>
        <ExpensePaymentDetails snapshot={repayment.paymentSnapshot} mode="snapshot" />
      </section>

      <Link
        href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t('repayment.openGroup')}
      </Link>

      <ExpenseRepaymentActions repayment={repayment} />
    </div>
  )
}
