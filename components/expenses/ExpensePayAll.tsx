'use client'

import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  ExpensePayAllContextView,
  ExpensePayAllPaymentView,
  ExpensePayAllView,
} from '@/lib/expenses/contracts'
import { formatDateOnly } from '@/lib/date-format'
import { formatExpenseMinor, formatExpenseMinorForCopy } from '@/lib/expenses/input-money'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'
import { ExpenseRepaymentDialog } from './ExpenseRepaymentDialog'
import { useExpenseTranslations } from './i18n.client'
import { expenseSecondaryButtonClass, expenseSectionClass } from './ui'

function ContextRows({ contexts, locale, initialDate }: {
  contexts: ExpensePayAllContextView[]
  locale: string
  initialDate: string
}) {
  const t = useExpenseTranslations()

  return (
    <div className="divide-y divide-border border-y border-border">
      {contexts.map((context) => (
        <section key={`${context.groupId}:${context.currency}`} className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold">
                {context.emoji ? `${context.emoji} ` : ''}{context.groupName}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(context.groupKind === 'one_off' ? 'payAll.oneOffContext' : 'payAll.groupContext')}
              </p>
            </div>
            <strong className="shrink-0 text-sm">
              {formatExpenseMinor(context.amountMinor, context.currency, locale)}
            </strong>
          </div>

          <Link
            href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${context.groupId}`}
            className={`${expenseSecondaryButtonClass} w-full`}
          >
            {t('payAll.openSettlement')}
          </Link>

          <ExpenseRepaymentDialog
            groupId={context.groupId}
            transfer={context.transfer}
            initialDate={initialDate}
            actionSheetTrigger
            triggerLabel={t('payAll.markPaid')}
          />

          {context.expenses.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('payAll.relatedEntries')}</p>
              <div className="divide-y divide-border">
                {context.expenses.map((expense) => (
                  <Link
                    key={expense.id}
                    href={`/auth-mvp/utlagt-og-endurgreitt/utgjold/${expense.id}`}
                    className="flex min-h-12 items-center gap-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{expense.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatDateOnly(expense.incurredOn, locale)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden size={17} className="shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}

function PaymentContextDrawer({ payment, locale, initialDate }: {
  payment: ExpensePayAllPaymentView
  locale: string
  initialDate: string
}) {
  const t = useExpenseTranslations()

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className={`${expenseSecondaryButtonClass} w-full`}>
          {t('payAll.details')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {t('payAll.detailsTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('payAll.detailsDescription', { name: payment.recipientDisplayName })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('payAll.closeDetails')}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-5">
            <ContextRows contexts={payment.contexts} locale={locale} initialDate={initialDate} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ExpensePayAll({ view, locale, initialDate }: { view: ExpensePayAllView; locale: string; initialDate: string }) {
  const t = useExpenseTranslations()

  if (view.payments.length === 0 && view.blockedContexts.length === 0) {
    return (
      <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
        {t('payAll.empty')}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm leading-6 text-muted-foreground">{t('payAll.intro')}</p>
        <p className="text-xs leading-5 text-muted-foreground">{t('payAll.outsidePayment')}</p>
      </div>

      {view.payments.map((payment) => (
        <section key={payment.id} className={`${expenseSectionClass} min-w-0 space-y-4`}>
          <h2 className="break-words text-base font-semibold">
            {t('payAll.payRecipient', { name: payment.recipientDisplayName })}
          </h2>
          <ExpensePaymentDetails
            snapshot={payment.paymentInstruction}
            mode="current"
            amount={{
              display: formatExpenseMinor(payment.amountMinor, payment.currency, locale),
              copy: formatExpenseMinorForCopy(payment.amountMinor, payment.currency),
            }}
          />
          {payment.contexts.length === 1 ? (
            <ExpenseRepaymentDialog
              groupId={payment.contexts[0].groupId}
              transfer={payment.contexts[0].transfer}
              initialDate={initialDate}
              actionSheetTrigger
              triggerLabel={t('payAll.markPaid')}
            />
          ) : null}
          <PaymentContextDrawer payment={payment} locale={locale} initialDate={initialDate} />
        </section>
      ))}

      {view.payments.length > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">{t('payAll.reportHint')}</p>
      ) : null}

      {view.blockedContexts.length > 0 ? (
        <section aria-labelledby="expense-pay-all-review-title" className="space-y-3 border-y border-amber-300 bg-amber-50 px-3 py-4 text-amber-950">
          <div>
            <h2 id="expense-pay-all-review-title" className="text-sm font-semibold">{t('payAll.reviewTitle')}</h2>
            <p className="mt-1 text-sm leading-6">{t('payAll.reviewBody')}</p>
          </div>
          <div className="divide-y divide-amber-200">
            {view.blockedContexts.map((context) => (
              <Link
                key={`${context.groupId}:${context.currency}:${context.recipientDisplayName}`}
                href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${context.groupId}`}
                className="flex min-h-12 items-center gap-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="min-w-0 flex-1 break-words">
                  {t('payAll.reviewContext', { group: context.groupName, name: context.recipientDisplayName })}
                </span>
                <strong className="shrink-0">{formatExpenseMinor(context.amountMinor, context.currency, locale)}</strong>
                <ChevronRight aria-hidden size={17} className="shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
