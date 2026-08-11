'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import type { ExpenseSettlementTransferView } from '@/lib/expenses/contracts'
import { formatExpenseMinor, formatExpenseMinorForCopy } from '@/lib/expenses/input-money'
import { expensePayAllSafeFirstName } from '@/lib/expenses/pay-all'
import { ExpensePaymentDetails } from './ExpensePaymentDetails'
import {
  ExpenseRepaymentReportForm,
  type ExpenseRepaymentMutationMode,
} from './ExpenseRepaymentReportForm'
import { useExpenseTranslations } from './i18n.client'
import { expenseSecondaryButtonClass } from './ui'

export function ExpenseRepaymentDialog({
  groupId,
  transfer,
  initialDate,
  actionSheetTrigger = false,
  triggerLabel,
}: {
  groupId: string
  transfer: ExpenseSettlementTransferView
  initialDate: string
  actionSheetTrigger?: boolean
  triggerLabel?: string
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const mode: ExpenseRepaymentMutationMode = transfer.canRecordReceived
    ? 'recordReceived'
    : 'report'

  function saved() {
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {actionSheetTrigger ? (
          <TeskeidActionButton type="button" variant="primary" className="w-full">
            {triggerLabel ?? t(mode === 'recordReceived' ? 'repayment.recordReceived' : 'repayment.report')}
          </TeskeidActionButton>
        ) : (
          <button type="button" className={`${expenseSecondaryButtonClass} mt-2 w-full justify-start border-0 px-0 text-primary shadow-none`}>
            {triggerLabel ?? t(mode === 'recordReceived' ? 'repayment.recordReceived' : 'repayment.report')}
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="break-words text-lg font-semibold">
                {t(mode === 'recordReceived'
                  ? 'repayment.recordReceivedDialogTitle'
                  : 'repayment.reportDialogTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {t(mode === 'recordReceived'
                  ? 'repayment.recordReceivedDialogDescription'
                  : 'repayment.reportDialogDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t('repayment.close')} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-4">
            {mode === 'report' ? (
              <>
                <p className="text-xs leading-5 text-muted-foreground">{t('repayment.payBeforeReport')}</p>
                {transfer.currentPaymentDetails?.paymentDetailsState === 'unavailable' ? (
                  <p className="border-y border-border py-4 text-sm text-muted-foreground">
                    {t('payAll.paymentUnavailable')}
                  </p>
                ) : (
                  <ExpensePaymentDetails
                    snapshot={transfer.paymentInstruction}
                    mode="current"
                    ownerFirstName={expensePayAllSafeFirstName(transfer.toDisplayName)}
                    amount={{
                      display: formatExpenseMinor(transfer.amountMinor, transfer.currency),
                      copy: formatExpenseMinorForCopy(transfer.amountMinor, transfer.currency),
                    }}
                  />
                )}
              </>
            ) : null}
            <ExpenseRepaymentReportForm
              groupId={groupId}
              transfer={transfer}
              initialDate={initialDate}
              mode={mode}
              onSaved={saved}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
