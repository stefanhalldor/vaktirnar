'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidStepNav, type TeskeidStepNavItem } from '@/components/teskeid/TeskeidStepNav'
import {
  EXPENSE_FLOW_STEPS,
  expenseEditStepHref,
  type ExpenseFlowStep,
} from '@/lib/expenses/flow'
import { useExpenseTranslations } from './i18n.client'

type ExpenseFlowNavProps =
  | { context: 'entry' }
  | { context: 'saved'; expenseId: string; canEdit: boolean }

export function ExpenseFlowNav(props: ExpenseFlowNavProps) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [pendingStep, setPendingStep] = useState<ExpenseFlowStep | null>(null)
  const [isPending, startTransition] = useTransition()
  const savedContext = props.context === 'saved'

  const items: TeskeidStepNavItem<ExpenseFlowStep>[] = EXPENSE_FLOW_STEPS.map((step) => {
    if (!savedContext) {
      return {
        id: step,
        label: t(`expenseForm.steps.${step}`),
        status: step === 'details' ? 'current' : 'disabled',
        statusLabel: step === 'details' ? undefined : t('expenseForm.stepUnavailable'),
      }
    }

    if (step === 'review') {
      return {
        id: step,
        label: t(`expenseForm.steps.${step}`),
        status: 'current',
      }
    }

    return {
      id: step,
      label: t(`expenseForm.steps.${step}`),
      status: props.canEdit && !isPending ? 'complete' : 'disabled',
      statusLabel: props.canEdit
        ? t('expenseForm.stepCompleted')
        : t('expenseForm.stepEditUnavailable'),
    }
  })

  function openStep(step: ExpenseFlowStep) {
    if (!savedContext || step === 'review' || !props.canEdit || isPending) return
    setPendingStep(step)
    startTransition(() => {
      router.push(expenseEditStepHref(props.expenseId, step))
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
          {t('expenseForm.openingStep', { step: t(`expenseForm.steps.${pendingStep}`) })}
        </p>
      ) : null}
    </div>
  )
}
