'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidStepNav, type TeskeidStepNavItem } from '@/components/teskeid/TeskeidStepNav'
import {
  EXPENSE_FLOW_STEPS,
  EXPENSE_SAVED_VIEWS,
  expenseSavedViewHref,
  type ExpenseSavedView,
  type ExpenseFlowStep,
} from '@/lib/expenses/flow'
import { useExpenseTranslations } from './i18n.client'

type ExpenseFlowNavProps =
  | { context: 'entry' }
  | { context: 'saved'; expenseId: string; currentView?: ExpenseSavedView; canEdit?: boolean }

export function ExpenseFlowNav(props: ExpenseFlowNavProps) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [pendingStep, setPendingStep] = useState<ExpenseFlowStep | ExpenseSavedView | null>(null)
  const [isPending, startTransition] = useTransition()
  if (props.context === 'entry') {
    const items: TeskeidStepNavItem<ExpenseFlowStep>[] = EXPENSE_FLOW_STEPS.map((step) => ({
      id: step,
      label: t(`expenseForm.steps.${step}`),
      status: step === 'details' ? 'current' : 'disabled',
      statusLabel: step === 'details' ? undefined : t('expenseForm.stepUnavailable'),
    }))
    return <TeskeidStepNav ariaLabel={t('expenseForm.stepNavAriaLabel')} items={items} onStepChange={() => undefined} />
  }

  const expenseId = props.expenseId
  const currentView = props.currentView ?? 'review'
  const items: TeskeidStepNavItem<ExpenseSavedView>[] = EXPENSE_SAVED_VIEWS.map((view) => ({
    id: view,
    label: t(`expense.savedViews.${view}`),
    status: view === currentView ? 'current' : isPending ? 'disabled' : 'available',
  }))

  function openStep(view: ExpenseSavedView) {
    if (view === currentView || isPending) return
    setPendingStep(view)
    startTransition(() => {
      router.push(expenseSavedViewHref(expenseId, view))
    })
  }

  return (
    <div className="space-y-2" aria-busy={isPending}>
      <TeskeidStepNav
        ariaLabel={t('expenseForm.stepNavAriaLabel')}
        items={items}
        onStepChange={openStep}
      />
      {isPending && pendingStep ? (
        <p role="status" className="text-center text-xs text-muted-foreground">
          {t('expenseForm.openingStep', { step: t(`expense.savedViews.${pendingStep}`) })}
        </p>
      ) : null}
    </div>
  )
}
